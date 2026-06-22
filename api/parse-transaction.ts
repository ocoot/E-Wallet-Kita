import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from "@google/genai";
import { getCategoryLabel, getAllCategoryKeys } from '../src/lib/categoryDefinitions.js';
import { inferCategoryKey } from './utils.js';
import { parseAmountFromString } from '../src/lib/parserUtils.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─────────────────────────────────────────────────────────────
// FIX #9: Separate rate limiting for regular vs AI parsing
// ─────────────────────────────────────────────────────────────
interface RateLimitEntry {
  count: number;
  aiCount: number;
  lastReset: number;
  lastAiReset: number;
}

const rateLimiter = new Map<string, RateLimitEntry>();
const RATE_LIMIT = 10;              // Regular requests per minute
const RATE_LIMIT_WINDOW = 60000;    // 1 minute
const AI_RATE_LIMIT = 5;            // AI requests per minute (stricter)
const AI_RATE_LIMIT_WINDOW = 60000; // 1 minute

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

  // 1. Auth check
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const token = authHeader.split(' ')[1];
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // 2. Rate limiting (per user) - FIX #9: Separate AI rate limit
  const now = Date.now();
  const userRateLimit = rateLimiter.get(user.id) || { 
    count: 0, 
    aiCount: 0, 
    lastReset: now,
    lastAiReset: now
  };

  // Check regular rate limit
  if (now - userRateLimit.lastReset > RATE_LIMIT_WINDOW) {
    userRateLimit.count = 0;
    userRateLimit.lastReset = now;
  }
  if (userRateLimit.count >= RATE_LIMIT) {
    res.status(429).json({ error: 'Too many requests' });
    return;
  }

  // Check if will use AI (fallback check)
  const willUseAI = !!ai; // AI will be used if apiKey is set
  if (willUseAI) {
    if (now - userRateLimit.lastAiReset > AI_RATE_LIMIT_WINDOW) {
      userRateLimit.aiCount = 0;
      userRateLimit.lastAiReset = now;
    }
    if (userRateLimit.aiCount >= AI_RATE_LIMIT) {
      res.status(429).json({ 
        error: 'Too many AI requests. Please try again in a moment.',
        retryAfter: Math.ceil((userRateLimit.lastAiReset + AI_RATE_LIMIT_WINDOW - now) / 1000)
      });
      return;
    }
  }

  userRateLimit.count++;
  if (willUseAI) {
    userRateLimit.aiCount++;
  }
  rateLimiter.set(user.id, userRateLimit);

  try {
    const { query } = req.body;
    if (!query || typeof query !== "string" || query.trim() === "") {
      res.status(400).json({ error: "Missing string query to parse" });
      return;
    }
    
    // 3. Size limit (500 chars)
    if (query.length > 500) {
      res.status(400).json({ error: "Query too long" });
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

    const allKeys = getAllCategoryKeys();
    const categoryMapping = allKeys
      .map(key => `- '${key}' (${getCategoryLabel(key, 'en')})`)
      .join('\n');

    const systemInstruction = `You are a financial parsing expert for 'E-Wallet Kita'. 
Analyze natural language transactions in Indonesian or English and output structured JSON.
Valid category keys are:
${categoryMapping}

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

