import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { parseAmountFromString } from "./src/lib/parserUtils";
import broadcastTelegramHandler from "./api/admin/broadcast-telegram";
import telegramWebhookHandler from "./api/telegram-webhook";

// Load environment variables
dotenv.config();

console.log("=== Available Env Variable Keys ===");
console.log(Object.keys(process.env).filter(k => k.includes("SUPABASE") || k.includes("TELEGRAM") || k.includes("PORT") || k.includes("APP")));
console.log("====================================");

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

import { createClient } from "@supabase/supabase-js";

// Initialize Supabase Backend Client safely
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("⚠️ Supabase Credentials are missing. Database integrations won't work in backend.");
}

const supabaseBackend = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Shared Core Utility to Parse Transactions using Gemini API or Regex Fallback
 */
async function parseFinancialQuery(query: string): Promise<{
  source: string;
  type: "income" | "expense";
  category_key: string;
  amount: number;
  original_text: string;
}> {
  if (!ai) {
    // Fail-safe regex parser when Gemini is unavailable
    const inferredAmount = parseAmountFromString(query);
    const inferredCategory = inferCategoryKey(query);
    const inferredType = ["gaji", "bonus", "salary", "upah"].some(k => query.toLowerCase().includes(k)) ? "income" : "expense";
    return {
      source: "fallback_server_regex",
      type: inferredType,
      category_key: inferredCategory,
      amount: inferredAmount,
      original_text: query
    };
  }

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

  try {
    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("Gemini AI request timed out")), 6000);
    });

    const responsePromise = ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Parse this input text: "${query}"`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING, description: "Type of transaction (income or expense)" },
            category_key: { type: Type.STRING, description: "Category string key" },
            amount: { type: Type.NUMBER, description: "Numeric Indonesian Rupiah conversion" },
            original_text: { type: Type.STRING, description: "The raw input string parsed" }
          },
          required: ["type", "category_key", "amount", "original_text"]
        }
      }
    });

    const response = await Promise.race([responsePromise, timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);

    const responseText = response.text;
    if (!responseText) {
      throw new Error("Empty response from Gemini API");
    }

    const parsedJSON = JSON.parse(responseText.trim());
    const codeParsedAmount = parseAmountFromString(query);
    
    // High fidelity override check
    if (codeParsedAmount > 0 && (!parsedJSON.amount || parsedJSON.amount <= 10)) {
      parsedJSON.amount = codeParsedAmount;
    }

    return {
      source: "gemini-3.5-flash",
      type: parsedJSON.type || "expense",
      category_key: parsedJSON.category_key || inferCategoryKey(query),
      amount: parsedJSON.amount || codeParsedAmount || 0,
      original_text: query
    };
  } catch (err: any) {
    console.error("❌ Gemini parseFinancialQuery error in server:", err?.message ?? err);
    // Graceful fallback to local inference on Gemini failure
    const codeParsedAmount = parseAmountFromString(query);
    const inferredCategory = inferCategoryKey(query);
    const inferredType = ["gaji", "bonus", "salary", "upah"].some(k => query.toLowerCase().includes(k)) ? "income" : "expense";
    return {
      source: "fallback_gemini_error",
      type: inferredType,
      category_key: inferredCategory,
      amount: codeParsedAmount,
      original_text: query
    };
  }
}

// In-Memory map to cache pending Telegram transaction confirmations
// Map categories to localization labels for bot replies
const botCategoryLabels: Record<string, { id: string; en: string }> = {
  salary: { id: "Gaji", en: "Salary" },
  bonus: { id: "Bonus", en: "Bonus" },
  food_drink: { id: "Makanan & Minuman", en: "Food & Drink" },
  monthly_groceries: { id: "Belanja Bulanan", en: "Monthly Groceries" },
  vegetables: { id: "Belanja Sayur", en: "Vegetables" },
  bills: { id: "Tagihan", en: "Bills" },
  other: { id: "Lain-lain", en: "Other" }
};

async function sendTelegramMessage(chatId: number, text: string, replyMarkup?: any) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        reply_markup: replyMarkup
      })
    });
  } catch (err) {
    console.error(`❌ sendTelegramMessage to ${chatId} failed:`, err);
  }
}

async function editTelegramMessage(chatId: number, messageId: number, text: string, replyMarkup?: any) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "Markdown",
        reply_markup: replyMarkup
      })
    });
  } catch (err) {
    console.error(`❌ editTelegramMessage for ${chatId}/${messageId} failed:`, err);
  }
}

async function answerTelegramCallback(callbackQueryId: string, text?: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text
      })
    });
  } catch (err) {
    console.error(`❌ answerTelegramCallback ${callbackQueryId} failed:`, err);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Health Indicator
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      mode: process.env.NODE_ENV || "development"
    });
  });

  // API Safe AI transaction parser
  app.post("/api/parse-transaction", async (req, res) => {
    try {
      const { query } = req.body;
      if (!query || typeof query !== "string" || query.trim() === "") {
        res.status(400).json({ error: "Missing string query to parse" });
        return;
      }
      const parsed = await parseFinancialQuery(query);
      res.json(parsed);
    } catch (err: any) {
      console.error("Gemini Parse API Error:", err);
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

  // Telegram Broadcast for Admin (Delegated to serverless module)
  app.post("/api/admin/broadcast-telegram", broadcastTelegramHandler as any);

  // Telegram Bot Webhook (Delegated to serverless module — single source of
  // truth in api/telegram-webhook.ts, no duplicated logic here)
  app.post("/api/telegram-webhook", telegramWebhookHandler as any);
  app.post("/api/telegram/webhook", telegramWebhookHandler as any);


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
