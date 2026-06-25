import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from "@google/genai";
import { getActiveCategories, generateCategoryPrompt, validateCategoryKey } from './_lib/categories.js';
import { parseAmountFromString } from '../src/lib/parserUtils.js';
import { inferCategoryKey } from './_utils.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const supabaseLogger = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function logAiUsage(
  model: string,
  success: boolean,
  errorCode?: string
): Promise<void> {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return;

  try {
    const { error } = await supabaseLogger.rpc('log_ai_usage', {
      p_provider:   'gemini',
      p_key_alias:  'gemini_main_key',
      p_model:      model,
      p_source:     'parse_transaction',
      p_success:    success,
      p_error_code: errorCode ?? null,
    });
    if (error) console.error('[ai-usage-log] parse-transaction RPC error:', JSON.stringify(error));
  } catch (err) {
    console.error('[ai-usage-log] parse-transaction Exception:', err);
  }
}

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

// ─────────────────────────────────────────────────────────────
// Multi-model fallback chain — same rationale as api/telegram-webhook.ts.
// A single model with no timeout could hang the request indefinitely on
// a slow Gemini response; this tries progressively faster/cheaper models
// before giving up to the local regex parser.
// ─────────────────────────────────────────────────────────────
interface GeminiModelConfig {
  model: string;
  timeoutMs: number;
  thinkingConfig: Record<string, unknown>;
}

// IMPORTANT: Gemini 3.x uses `thinkingLevel`; Gemini 2.5 uses `thinkingBudget`.
// Sending thinkingLevel to a 2.5-series model causes a 400 error, not a
// graceful ignore — each entry must carry the shape its own model accepts.
const GEMINI_MODEL_CHAIN: GeminiModelConfig[] = [
  { model: "gemini-3.5-flash",        timeoutMs: 7000, thinkingConfig: { thinkingLevel: "low" } },
  { model: "gemini-3.1-pro-preview",  timeoutMs: 7000, thinkingConfig: { thinkingLevel: "low" } },
  { model: "gemini-3-flash-preview",  timeoutMs: 5000, thinkingConfig: { thinkingLevel: "low" } },
  { model: "gemini-3.1-flash-lite",   timeoutMs: 4000, thinkingConfig: { thinkingLevel: "minimal" } },
  { model: "gemini-2.5-pro",          timeoutMs: 6000, thinkingConfig: { thinkingBudget: 128 } },
  { model: "gemini-2.5-flash",        timeoutMs: 5000, thinkingConfig: { thinkingBudget: 0 } },
  { model: "gemini-2.5-flash-lite",   timeoutMs: 4000, thinkingConfig: { thinkingBudget: 0 } },
];

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

    const categories = await getActiveCategories();
    const categoryMapping = generateCategoryPrompt(categories);

    const systemInstruction = `You are a financial parsing expert for 'E-Wallet Kita'. 
Analyze natural language transactions in Indonesian or English and output structured JSON.
Valid category keys are:
${categoryMapping}

If categories do not match any, default category_key to 'other'.
ALWAYS return the 'category_key' from the list above.`;

    const codeParsedAmount = parseAmountFromString(query);
    let parsedJSON: any = null;
    let usedModel: string | null = null;
    let lastError: any = null;

    for (const { model, timeoutMs, thinkingConfig } of GEMINI_MODEL_CHAIN) {
      try {
        let timeoutId: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`Gemini AI request timed out (${model}, ${timeoutMs}ms)`)), timeoutMs);
        });

        const responsePromise = ai.models.generateContent({
          model,
          contents: `Parse this input text: "${query}"`,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            thinkingConfig,
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

        const response = await Promise.race([responsePromise, timeoutPromise]);
        if (timeoutId) clearTimeout(timeoutId);

        const responseText = response.text;
        if (!responseText) throw new Error("Empty response from Gemini API");

        parsedJSON = JSON.parse(responseText.trim());
        usedModel = model;
        
        logAiUsage(model, true); // fire-and-forget
        break;
      } catch (err: any) {
        lastError = err;
        console.error(`❌ parse-transaction Gemini failed on model "${model}":`, err?.message ?? err);
        
        const errCode = JSON.stringify(err).includes('429') || JSON.stringify(err).includes('RESOURCE_EXHAUSTED') ? '429'
          : JSON.stringify(err).includes('503') ? '503' : undefined;
        logAiUsage(model, false, errCode); // fire-and-forget
        
        continue;
      }
    }

    if (!parsedJSON) {
      // Every model in the chain failed — fall back to local regex inference
      const inferredCategory = inferCategoryKey(query);
      const inferredType = ["gaji", "bonus", "salary", "upah"].some(k => query.toLowerCase().includes(k)) ? "income" : "expense";

      res.json({
        source: "fallback_gemini_error",
        type: inferredType,
        category_key: inferredCategory,
        amount: codeParsedAmount,
        original_text: query,
        error_context: lastError?.message ?? "All Gemini models in fallback chain failed"
      });
      return;
    }

    if (codeParsedAmount > 0 && (!parsedJSON.amount || parsedJSON.amount <= 10)) {
      parsedJSON.amount = codeParsedAmount;
    }

    res.json({
      source: usedModel,
      type: parsedJSON.type || "expense",
      category_key: validateCategoryKey(parsedJSON.category_key, categories),
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
