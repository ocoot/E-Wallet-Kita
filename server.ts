import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { parseAmountFromString } from "./src/lib/parserUtils";

// Load environment variables
dotenv.config();

// Initialize Gemini Client safely
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
} else {
  console.warn("⚠️ GEMINI_API_KEY is not defined in environment variables. AI parsing features will fail gracefully.");
}

/**
 * Safe fallback category mapping helper
 */
function inferCategoryKey(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("makan") || t.includes("minum") || t.includes("beli bakso") || t.includes("kopi") || t.includes("warung") || t.includes("restoran")) {
    return "food_drink";
  }
  if (t.includes("gaji") || t.includes("gajian") || t.includes("salary") || t.includes("upah") || t.includes("transfer masuk")) {
    return "salary";
  }
  if (t.includes("bonus") || t.includes("hadiah") || t.includes("thr") || t.includes("sampingan")) {
    return "bonus";
  }
  if (t.includes("belanja bulanan") || t.includes("supermarket") || t.includes("alfamart") || t.includes("indomaret") || t.includes("groceries")) {
    return "monthly_groceries";
  }
  if (t.includes("sayur") || t.includes("pasar") || t.includes("bumbu") || t.includes("belanja sayur")) {
    return "vegetables";
  }
  if (t.includes("listrik") || t.includes("air") || t.includes("pdam") || t.includes("pulsa") || t.includes("tagihan") || t.includes("wifi") || t.includes("internet") || t.includes("token")) {
    return "bills";
  }
  return "other";
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Health Indicator
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", mode: process.env.NODE_ENV || "development" });
  });

  // Action: Diagnostic / Unit-Test Endpoint to verify parser logic directly in backend
  app.get("/api/parser/test", (req, res) => {
    const scenarios = [
      "Makan siang 25000",
      "Gaji 1.5jt",
      "Belanja sayur 25rb",
      "Bonus 1k",
      "Tagihan listrik 350rb"
    ];
    const results = scenarios.map(txt => ({
      input: txt,
      parsedAmount: parseAmountFromString(txt)
    }));
    res.json({ info: "Unit test for parsing Indonesian suffixes", results });
  });

  // API Safe AI transaction parser
  app.post("/api/parse-transaction", async (req, res) => {
    try {
      const { query } = req.body;
      if (!query || typeof query !== "string" || query.trim() === "") {
        res.status(400).json({ error: "Missing string query to parse" });
        return;
      }

      // Check if SDK is available
      if (!ai) {
        // Safe backend fallback parser without AI (prevents app from crashing if API key is not yet set)
        const inferredAmount = parseAmountFromString(query);
        const inferredCategory = inferCategoryKey(query);
        const inferredType = ["gaji", "bonus", "salary", "upah"].some(k => query.toLowerCase().includes(k)) ? "income" : "expense";
        
        res.json({
          source: "fallback_server_regex",
          type: inferredType,
          category_key: inferredCategory,
          amount: inferredAmount,
          original_text: query,
          warning: "GEMINI_API_KEY is not defined, utilizing safe native regex fallback"
        });
        return;
      }

      // System instructions ensuring schema mapping
      const systemInstruction = `You are a financial parsing expert for 'E-Wallet Kita'. 
Analyze natural language transactions in Indonesian or English and output structured JSON.
Mapping keys for categories are exactly:
- 'salary' (income)
- 'bonus' (income)
- 'food_drink' (expense)
- 'monthly_groceries' (expense)
- 'vegetables' (expense)
- 'bills' (expense)
- 'other' (expense or fallback if unsure)

Translate Indonesian abbreviations for quantities:
- 'rb' or 'ribu' means thousands (e.g. '25rb' -> amount should be 25000)
- 'k' means thousands (e.g. '1k' -> amount should be 1000)
- 'jt' or 'juta' means millions (e.g. '1.5jt' -> amount should be 1500000)
Return the numerical value in 'amount' property.
If categories do not match any, default category_key to 'other'.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Parse this input text: "${query}"`,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING, enum: ["income", "expense"], description: "Type of transaction" },
              category_key: { type: Type.STRING, description: "Category string key, must map to salary, bonus, food_drink, monthly_groceries, vegetables, bills, other" },
              amount: { type: Type.NUMBER, description: "Numeric Indonesian Rupiah conversion" },
              original_text: { type: Type.STRING, description: "The raw input string parsed" }
            },
            required: ["type", "category_key", "amount", "original_text"]
          }
        }
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error("Empty response from Gemini API");
      }

      const parsedJSON = JSON.parse(responseText.trim());

      // Back-up regex verification loop (to ensure amounts are computed perfectly)
      const codeParsedAmount = parseAmountFromString(query);
      
      // If code parsing returned a non-zero valid conversion and Gemini returned 0 or miscalculated, 
      // override with high-fidelity local code parse calculation just in case
      if (codeParsedAmount > 0 && (!parsedJSON.amount || parsedJSON.amount <= 10)) {
        parsedJSON.amount = codeParsedAmount;
      }

      res.json({
        source: "gemini-3.5-flash",
        type: parsedJSON.type || "expense",
        category_key: parsedJSON.category_key || inferCategoryKey(query),
        amount: parsedJSON.amount || codeParsedAmount || 0,
        original_text: query
      });

    } catch (err: any) {
      console.error("Gemini Parse API Error:", err);
      // Failsafe gracefully to regex-based analyzer directly so user experience never breaks
      const query = req.body?.query || "";
      const inferredAmount = parseAmountFromString(query);
      const inferredCategory = inferCategoryKey(query);
      const inferredType = ["gaji", "bonus", "salary", "upah"].some(k => query.toLowerCase().includes(k)) ? "income" : "expense";
      
      res.json({
        source: "fallback_server_error_regex",
        type: inferredType,
        category_key: inferredCategory,
        amount: inferredAmount,
        original_text: query,
        error_context: err.message
      });
    }
  });

  // Vite development vs production static handler integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`E-Wallet Kita backend server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
