import { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from "@google/genai";
import { parseAmountFromString } from '../src/lib/parserUtils.js';
import { inferCategoryKey } from './utils.js';

const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: { 'User-Agent': 'aistudio-build' }
    }
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { query } = req.body;
    if (!query || typeof query !== "string" || query.trim() === "") {
      res.status(400).json({ error: "Missing string query to parse" });
      return;
    }

    if (!ai) {
      const inferredAmount = parseAmountFromString(query);
      const inferredCategory = inferCategoryKey(query);
      const inferredType = ["gaji", "bonus", "salary", "upah"].some(k => query.toLowerCase().includes(k)) ? "income" : "expense";
      
      res.json({
        source: "fallback_server_regex",
        type: inferredType,
        category_key: inferredCategory,
        amount: inferredAmount,
        original_text: query,
        warning: "GEMINI_API_KEY is not defined"
      });
      return;
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
            category_key: { type: Type.STRING },
            amount: { type: Type.NUMBER },
            original_text: { type: Type.STRING }
          },
          required: ["type", "category_key", "amount", "original_text"]
        }
      }
    });

    const parsedJSON = JSON.parse(response.text!.trim());
    const codeParsedAmount = parseAmountFromString(query);
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
}
