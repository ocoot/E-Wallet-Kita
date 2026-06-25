import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { getActiveCategories, generateCategoryPrompt, validateCategoryKey, Category } from "./categories.js";

// ─── Supabase service-role client (server-side only) ───────────────────────
const supabaseLogger = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Kirim log ke tabel ai_usage_logs via RPC tanpa memblokir response utama. */
async function logAiUsage(
  provider: "gemini" | "openai" | "anthropic",
  keyAlias: string,
  model: string,
  source: string,
  success: boolean,
  errorCode?: string
): Promise<void> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !key) {
    console.warn("[ai-usage-log] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set, skipping log.");
    return;
  }

  try {
    const { error } = await supabaseLogger.rpc("log_ai_usage", {
      p_provider:   provider,
      p_key_alias:  keyAlias,
      p_model:      model,
      p_source:     source,
      p_success:    success,
      p_error_code: errorCode ?? null,
    });

    if (error) {
      console.error("[ai-usage-log] RPC error:", JSON.stringify(error));
    }
  } catch (err) {
    console.error("[ai-usage-log] Exception:", err);
  }
}

/** Cetak detail error asli dari provider (status, message, body) ke console. */
function logRawProviderError(keyAlias: string, err: any): void {
  const status = err?.status ?? err?.response?.status ?? err?.statusCode;
  const message = err?.message ?? err?.error?.message;
  let body = err?.error ?? err?.response?.data ?? err?.body;

  try {
    body = typeof body === "string" ? body : JSON.stringify(body);
  } catch {
    body = String(body);
  }

  console.error(
    `🔍 [raw-error] ${keyAlias} | status=${status ?? "?"} | message=${message ?? "?"} | body=${body ?? "?"}`
  );
}

/** Ekstrak HTTP status code dari pesan error jika tersedia. */
function extractErrorCode(err: any): string | undefined {
  const msg = JSON.stringify(err);
  const match = msg.match(/"status":(\d{3})|statusCode["\s:]+(\d{3})|Error\s(\d{3})/);
  if (match) return match[1] || match[2] || match[3];
  if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("RATE_LIMIT")) return "429";
  if (msg.includes("503") || msg.includes("UNAVAILABLE")) return "503";
  return undefined;
}

const GEMINI_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
].filter(Boolean) as string[];

const OPENAI_KEYS = [
  process.env.OPENAI_API_KEY_1,
  process.env.OPENAI_API_KEY_2,
  process.env.OPENAI_API_KEY_3,
  process.env.OPENAI_API_KEY_4,
].filter(Boolean) as string[];

const CLAUDE_KEYS = [
  process.env.ANTHROPIC_API_KEY_1,
  process.env.ANTHROPIC_API_KEY_2,
  process.env.ANTHROPIC_API_KEY_3,
  process.env.ANTHROPIC_API_KEY_4,
].filter(Boolean) as string[];

// ─── Model chain per provider ───────────────────────────────────────────────
// Setiap key akan mencoba SEMUA model di chain provider-nya secara berurutan
// sebelum pindah ke key selanjutnya. Ini mengurangi kegagalan akibat 1 model
// sedang overload (503/429), karena key yang sama masih punya kesempatan lain
// lewat model alternatif sebelum dianggap "key ini gagal".
//
// Catatan: claude-3-5-sonnet-20241022 sudah RETIRED oleh Anthropic per
// 28 Okt 2025 (selalu menghasilkan error 400, bukan soal kuota/key).
// Diganti ke claude-haiku-4-5 (cepat & murah) dengan fallback claude-sonnet-4-6.
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const OPENAI_MODELS = ["gpt-4o-mini", "gpt-4.1-mini"];
const CLAUDE_MODELS = ["claude-haiku-4-5", "claude-sonnet-4-6"];

export interface ParsedReceipt {
  merchant_name: string;
  receipt_date: string;
  total_amount: number;
  total_items: number;
  category: string;
  items: Array<{
    name: string;
    qty: number;
    unit_price: number;
    subtotal: number;
  }>;
}

function shouldFallback(err: any) {
  const text = JSON.stringify(err);

  return (
    text.includes("503") ||
    text.includes("429") ||
    text.includes("UNAVAILABLE") ||
    text.includes("RESOURCE_EXHAUSTED") ||
    text.includes("RATE_LIMIT")
  );
}

function generateSystemInstruction(categories: Category[]) {
  const categoryMapping = generateCategoryPrompt(categories, "expense");
  
  return `Anda adalah OCR parser struk belanja Indonesia tepercaya.
Analisis gambar struk belanja yang diberikan dan ekstrak detail berikut dalam bentuk JSON terstruktur:
1. 'merchant_name': Nama toko/merchant (misal: Indomaret, Alfamart, dll.).
2. 'receipt_date': Tanggal di struk belanja dalam format ISO (YYYY-MM-DD).
3. 'total_amount': Total nominal uang yang dibayarkan.
4. 'total_items': Jumlah total item barang.
5. 'category': Kategori transaksi yang paling relevan. Gunakan HANYA salah satu key dari daftar di bawah.
6. 'items': Daftar barang belanjaan, masing-masing berisi 'name', 'qty', 'unit_price', dan 'subtotal'.

Kategori pengeluaran yang valid:
${categoryMapping}

Kembalikan data kosong atau nilai default yang logis jika ada kolom informasi yang tidak terbaca sama sekali dari struk. JANGAN mengarang data fiktif.
PENTING: Nilai 'category' HARUS berupa key dari daftar di atas. Jika tidak yakin, gunakan 'other'.`;
}

async function parseWithGemini(
  imageBase64: string,
  mimeType: string,
  apiKey: string,
  keyAlias: string,
  source: string,
  model: string,
  categories: Category[]
): Promise<ParsedReceipt> {
  const ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: { 'User-Agent': 'aistudio-build' }
    }
  });

  const systemInstruction = generateSystemInstruction(categories);
  
  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          { inlineData: { mimeType, data: imageBase64 } },
          { text: "Ekstrak struk belanja ini ke format JSON sesuai skema yang diminta." }
        ]
      },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
      }
    });

    const parsedJSON = JSON.parse(response.text?.trim() || "{}");
    // Log sukses
    logAiUsage("gemini", keyAlias, model, source, true);

    return {
      merchant_name: parsedJSON.merchant_name || "Toko Tidak Dikenal",
      receipt_date: parsedJSON.receipt_date || new Date().toISOString().split("T")[0],
      total_amount: parsedJSON.total_amount || 0,
      total_items: parsedJSON.total_items || (parsedJSON.items ? parsedJSON.items.length : 0),
      category: validateCategoryKey(parsedJSON.category, categories),
      items: parsedJSON.items || []
    };
  } catch (err) {
    // Log gagal
    logRawProviderError(keyAlias, err);
    logAiUsage("gemini", keyAlias, model, source, false, extractErrorCode(err));
    throw err;
  }
}

async function parseWithOpenAI(
  imageBase64: string,
  apiKey: string,
  keyAlias: string,
  source: string,
  model: string,
  categories: Category[]
): Promise<ParsedReceipt> {
  const openai = new OpenAI({ apiKey });
  const systemInstruction = generateSystemInstruction(categories);

  try {
    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: "system",
          content: systemInstruction
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Ekstrak struk belanja ini ke format JSON sesuai skema yang diminta." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
          ]
        }
      ],
      response_format: { type: "json_object" }
    });

    const parsedJSON = JSON.parse(response.choices[0].message.content || "{}");
    logAiUsage("openai", keyAlias, model, source, true);

    return {
      merchant_name: parsedJSON.merchant_name || "Toko Tidak Dikenal",
      receipt_date: parsedJSON.receipt_date || new Date().toISOString().split("T")[0],
      total_amount: parsedJSON.total_amount || 0,
      total_items: parsedJSON.total_items || (parsedJSON.items ? parsedJSON.items.length : 0),
      category: validateCategoryKey(parsedJSON.category, categories),
      items: parsedJSON.items || []
    };
  } catch (err) {
    logRawProviderError(keyAlias, err);
    logAiUsage("openai", keyAlias, model, source, false, extractErrorCode(err));
    throw err;
  }
}

async function parseWithClaude(
  imageBase64: string,
  apiKey: string,
  keyAlias: string,
  source: string,
  model: string,
  categories: Category[]
): Promise<ParsedReceipt> {
  const claude = new Anthropic({ apiKey });
  const systemInstruction = generateSystemInstruction(categories);

  try {
    const response = await claude.messages.create({
      model: model,
      max_tokens: 1024,
      system: systemInstruction,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Ekstrak struk belanja ini ke format JSON sesuai skema yang diminta." },
          { 
            type: "image", 
            source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } 
          }
        ]
      }]
    });

    const content = (response.content[0] as any).text;
    const parsedJSON = JSON.parse(content || "{}");
    logAiUsage("anthropic", keyAlias, model, source, true);

    return {
      merchant_name: parsedJSON.merchant_name || "Toko Tidak Dikenal",
      receipt_date: parsedJSON.receipt_date || new Date().toISOString().split("T")[0],
      total_amount: parsedJSON.total_amount || 0,
      total_items: parsedJSON.total_items || (parsedJSON.items ? parsedJSON.items.length : 0),
      category: validateCategoryKey(parsedJSON.category, categories),
      items: parsedJSON.items || []
    };
  } catch (err) {
    logRawProviderError(keyAlias, err);
    logAiUsage("anthropic", keyAlias, model, source, false, extractErrorCode(err));
    throw err;
  }
}

export async function parseReceipt(imageBase64: string, source = "receipt_parser"): Promise<ParsedReceipt> {
  let cleanBase64 = imageBase64;
  let mimeType = "image/jpeg";
  if (imageBase64.includes(";base64,")) {
    const parts = imageBase64.split(";base64,");
    cleanBase64 = parts[1];
    mimeType = parts[0].replace("data:", "").split(";")[0];
  }

  // Fetch active categories once
  const categories = await getActiveCategories();

  // Gemini: untuk setiap key, coba semua model di GEMINI_MODELS sebelum pindah key.
  for (let i = 0; i < GEMINI_KEYS.length; i++) {
    const keyAlias = `gemini_key_${i + 1}`;
    for (const model of GEMINI_MODELS) {
      try {
        return await parseWithGemini(cleanBase64, mimeType, GEMINI_KEYS[i], keyAlias, source, model, categories);
      } catch (err: any) {
        if (!shouldFallback(err)) {
          console.log(`⚠️ ${keyAlias} (${model}) error non-fallback, lanjut ke model berikutnya...`);
          continue;
        }
        console.log(`⚠️ ${keyAlias} (${model}) unavailable, trying next model...`);
      }
    }
  }

  // OpenAI: sama, coba semua model di OPENAI_MODELS per key.
  for (let i = 0; i < OPENAI_KEYS.length; i++) {
    const keyAlias = `openai_key_${i + 1}`;
    for (const model of OPENAI_MODELS) {
      try {
        return await parseWithOpenAI(cleanBase64, OPENAI_KEYS[i], keyAlias, source, model, categories);
      } catch (err: any) {
        if (!shouldFallback(err)) {
          console.log(`⚠️ ${keyAlias} (${model}) error non-fallback, lanjut ke model berikutnya...`);
          continue;
        }
        console.log(`⚠️ ${keyAlias} (${model}) unavailable, trying next model...`);
      }
    }
  }

  // Claude: sama, coba semua model di CLAUDE_MODELS per key.
  for (let i = 0; i < CLAUDE_KEYS.length; i++) {
    const keyAlias = `anthropic_key_${i + 1}`;
    for (const model of CLAUDE_MODELS) {
      try {
        return await parseWithClaude(cleanBase64, CLAUDE_KEYS[i], keyAlias, source, model, categories);
      } catch (err: any) {
        if (!shouldFallback(err)) {
          console.log(`⚠️ ${keyAlias} (${model}) error non-fallback, lanjut ke model berikutnya...`);
          continue;
        }
        console.log(`⚠️ ${keyAlias} (${model}) unavailable, trying next model...`);
      }
    }
  }
  
  throw new Error("All receipt parsing services are currently unavailable or overloaded.");
}
