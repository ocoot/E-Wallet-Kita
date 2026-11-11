import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { getActiveCategories, generateCategoryPrompt, validateCategoryKey, Category } from "./categories.js";
import { logError } from "./errorLogger.js";

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
    `[raw-error] ${keyAlias} | status=${status ?? "?"} | message=${message ?? "?"} | body=${body ?? "?"}`
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
  // v0.77.0 (Item 8, R3): null bila tanggal tidak terbaca dari struk —
  // JANGAN lagi diam-diam diisi tanggal hari ini (data palsu yang lolos
  // semua banner karena tahunnya "benar").
  receipt_date: string | null;
  total_amount: number;
  total_items: number;
  category: string;
  items: Array<{
    name: string;
    qty: number;
    unit_price: number;
    subtotal: number;
  }>;
  // v0.77.0 (Item 8, R2): penanda hasil validasi server-side (diisi
  // validateParsedReceipt, ikut tersimpan di `raw_ai_response` karena
  // ParsedReceipt disimpan utuh oleh pemanggil).
  total_mismatch?: boolean;
  items_sum?: number;
  receipt_date_suspect?: boolean;
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

/**
 * v0.77.0 (Item 8, R2): validasi server-side sesudah parse — JANGAN tolak,
 * hanya beri penanda. Ini melindungi jalur TANPA layar review (Telegram):
 * draf Telegram bisa langsung jadi transaksi, jadi ketidakcocokan harus
 * tercatat di server, bukan hanya di banner aplikasi.
 *
 * - `total_mismatch` + `items_sum`: |Σ subtotal item − total_amount| > Rp1.
 *   Total TIDAK pernah dikoreksi menjadi Σ item (keputusan v0.76.0 tetap
 *   berlaku: total tercetak 37.400 ≠ Σ 39.700 pada kasus nyata — tidak
 *   diketahui mana yang benar, keduanya mungkin salah baca).
 * - `receipt_date_suspect`: tanggal tidak bisa diurai, ATAU tahunnya bukan
 *   tahun berjalan, ATAU tanggalnya di masa depan. Struk Desember tahun
 *   lalu yang dipindai Januari memang kena flag ini — flag ini peringatan,
 *   bukan penolakan.
 *
 * Penanda ikut tersimpan di `raw_ai_response` (ParsedReceipt disimpan utuh
 * oleh pemanggil: receipt.ts / receipt-service.ts) dan satu baris warning
 * ke `error_logs` (soft-fail, tidak pernah menggagalkan parse).
 */
function validateParsedReceipt(parsed: ParsedReceipt): ParsedReceipt {
  const items = parsed.items || [];
  const itemsSum = items.reduce((acc, it) => acc + (Number(it?.subtotal) || 0), 0);
  const total = Number(parsed.total_amount) || 0;
  const totalMismatch = Math.abs(itemsSum - total) > 1; // toleransi Rp1 (pembulatan)

  let dateSuspect = false;
  if (parsed.receipt_date) {
    const d = new Date(parsed.receipt_date);
    if (isNaN(d.getTime())) {
      dateSuspect = true; // tanggal tidak bisa diurai = patut dicurigai
    } else {
      const now = new Date();
      if (d.getUTCFullYear() !== now.getUTCFullYear() || d.getTime() > now.getTime()) {
        dateSuspect = true;
      }
    }
  }

  const flagged: ParsedReceipt = {
    ...parsed,
    items_sum: itemsSum,
    total_mismatch: totalMismatch,
    receipt_date_suspect: dateSuspect,
  };

  if (totalMismatch || dateSuspect) {
    void logError(supabaseLogger, {
      source: "receipt-parser",
      level: "warning",
      message: totalMismatch
        ? `Total struk tidak cocok dengan jumlah item (total Rp${total}, Σ item Rp${itemsSum}).`
        : `Tanggal struk patut dicurigai: ${parsed.receipt_date ?? "null"}.`,
      context: {
        merchant_name: parsed.merchant_name ?? null,
        total_amount: total,
        items_sum: itemsSum,
        total_mismatch: totalMismatch,
        receipt_date: parsed.receipt_date ?? null,
        receipt_date_suspect: dateSuspect,
      },
    });
  }

  return flagged;
}

function generateSystemInstruction(categories: Category[]) {
  const categoryMapping = generateCategoryPrompt(categories, "expense");
  
  return `Anda adalah OCR parser struk belanja Indonesia tepercaya.
Analisis gambar struk belanja yang diberikan dan ekstrak detail berikut dalam bentuk JSON terstruktur:
1. 'merchant_name': Nama toko/merchant (misal: Indomaret, Alfamart, dll.).
2. 'receipt_date': Tanggal yang TERCETAK di struk ini, dalam format ISO (YYYY-MM-DD).
   ATURAN WAJIB: tahun HARUS tahun yang tercetak di struk; jangan memakai tahun lain, jangan menebak.
   Bila tanggal tidak terbaca sama sekali dari struk, isi dengan null (bukan tanggal hari ini, bukan tahun lain).
3. 'total_amount': Total nominal uang yang dibayarkan — AMBIL dari baris TOTAL yang tercetak di struk
   (biasanya "TOTAL" / "Total Bayar" / "Jumlah"), BUKAN hasil hitung sendiri.
   ATURAN WAJIB: hitung Σ (qty × unit_price) semua item; total_amount HARUS sama dengan Σ tersebut.
   Bila angka TOTAL tercetak BERBEDA dengan Σ item, tetap pakai angka TOTAL tercetak, JANGAN ubah
   item, dan JANGAN paksa menyamakan — ketidakcocokan itu data, bukan kesalahanmu.
4. 'total_items': Jumlah total item barang.
5. 'category': Kategori transaksi yang paling relevan. Gunakan HANYA salah satu key dari daftar di bawah.
6. 'items': Daftar barang belanjaan, masing-masing berisi 'name', 'qty', 'unit_price', dan 'subtotal'.

Kategori pengeluaran yang valid:
${categoryMapping}

Bila ada kolom informasi yang tidak terbaca sama sekali dari struk, isi dengan null (untuk tanggal)
atau nilai kosong yang wajar (untuk teks/daftar). JANGAN mengarang data fiktif dan JANGAN mengisi
tanggal hari ini sebagai pengganti tanggal struk.
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
      receipt_date: parsedJSON.receipt_date || null,
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
      receipt_date: parsedJSON.receipt_date || null,
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
      receipt_date: parsedJSON.receipt_date || null,
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

/**
 * v0.77.0 (Item 8, R6): coba satu provider (semua key × semua model).
 * Error FALLBACK (429/503/overload) tetap mencoba kombinasi berikutnya —
 * key lain mungkin masih punya kuota. Error NON-fallback (400, JSON parse
 * error, gambar bermasalah, ...) BERHENTI setelah 1 percobaan per provider:
 * struk yang gagal total tidak lagi membakar 24 panggilan berbayar (maks
 * 3 percobaan non-fallback: 1 per provider), lalu parseReceipt gagal.
 * Mengembalikan null bila provider ini tidak menghasilkan apa-apa.
 */
async function tryProvider(
  keys: string[],
  models: string[],
  keyPrefix: string,
  parseFn: (key: string, keyAlias: string, model: string) => Promise<ParsedReceipt>
): Promise<ParsedReceipt | null> {
  for (let i = 0; i < keys.length; i++) {
    const keyAlias = `${keyPrefix}_key_${i + 1}`;
    for (const model of models) {
      try {
        return await parseFn(keys[i], keyAlias, model);
      } catch (err: any) {
        if (!shouldFallback(err)) {
          console.log(`${keyAlias} (${model}) error non-fallback, berhenti mencoba provider ini (maks 1 percobaan/provider untuk error non-fallback).`);
          return null;
        }
        console.log(`${keyAlias} (${model}) unavailable, trying next model...`);
      }
    }
  }
  return null;
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
  const geminiResult = await tryProvider(GEMINI_KEYS, GEMINI_MODELS, "gemini",
    (key, keyAlias, model) => parseWithGemini(cleanBase64, mimeType, key, keyAlias, source, model, categories));
  if (geminiResult) return validateParsedReceipt(geminiResult);

  // OpenAI: sama, coba semua model di OPENAI_MODELS per key.
  const openaiResult = await tryProvider(OPENAI_KEYS, OPENAI_MODELS, "openai",
    (key, keyAlias, model) => parseWithOpenAI(cleanBase64, key, keyAlias, source, model, categories));
  if (openaiResult) return validateParsedReceipt(openaiResult);

  // Claude: sama, coba semua model di CLAUDE_MODELS per key.
  const claudeResult = await tryProvider(CLAUDE_KEYS, CLAUDE_MODELS, "claude",
    (key, keyAlias, model) => parseWithClaude(cleanBase64, key, keyAlias, source, model, categories));
  if (claudeResult) return validateParsedReceipt(claudeResult);

  const attemptedProviders = {
    gemini: GEMINI_KEYS.length,
    openai: OPENAI_KEYS.length,
    anthropic: CLAUDE_KEYS.length,
  };
  void logError(supabaseLogger, {
    source: "receipt-parser",
    message: "All receipt parsing services are currently unavailable or overloaded.",
    context: { source, attemptedProviders },
  });
  throw new Error("All receipt parsing services are currently unavailable or overloaded.");
}
