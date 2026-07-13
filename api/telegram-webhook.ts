import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { logError } from './_lib/errorLogger.js';
import { GoogleGenAI, Type } from '@google/genai';
import { parseAmountFromString } from '../src/lib/parserUtils.js';
import { generatePdf } from '../src/lib/pdf/exportPdf.js';
import { createPdfTranslator } from './_lib/pdf-translator.js';
import { parseReceipt } from './_lib/receipt-parser.js';
import { createReceiptDraft, approveReceiptDraft, cancelReceiptDraft, getReceiptDraft, updateReceiptCategory, updateReceiptWallet } from './_lib/receipt-service.js';
import { getMaintenanceStatus, isFeatureLocked, getMaintenanceMessage, MaintenanceStatus } from './_lib/maintenance.js';
import { tr } from './_lib/botText.js';
import { inferCategoryKey } from './_lib/categoryInference.js';
import { sendTelegramMessage, editTelegramMessage, answerTelegramCallback, sendTelegramDocument } from './_lib/telegram.js';
import { sendPushNotificationToUser } from './_lib/fcm.js';
import { Transaction } from '../src/types.js';

type Lang = "id" | "en";

// ─────────────────────────────────────────────────────────────
// FIX #5: Unified user context — resolves lang + profile in one DB call
// ─────────────────────────────────────────────────────────────
interface UserContext {
  id: string;
  display_name: string;
  lang: Lang;
}

// ─────────────────────────────────────────────────────────────
// FIX #1 (revised): Multi-model fallback chain.
//
// Root cause of "gagal membaca nominal": the old single hardcoded
// timeout (6s) was too short for gemini-3.5-flash's default thinking
// latency, so most calls timed out and fell through to a broken
// regex parser. We now (a) try several models in order so a slow or
// failing model doesn't kill the whole request, (b) disable/limit
// thinking for speed since this is a simple extraction task, and
// (c) give each attempt a more realistic per-model timeout budget.
//
// IMPORTANT: Gemini 3.x models use `thinkingLevel` (string enum) while
// Gemini 2.5 models use `thinkingBudget` (token count) — sending
// `thinkingLevel` to a 2.5-series model returns a 400 INVALID_ARGUMENT
// error, not a graceful ignore. Each chain entry carries its own
// thinkingConfig so we never send the wrong shape to the wrong model.
//
// Ordered from smartest/primary to fastest/cheapest fallback.
// ─────────────────────────────────────────────────────────────
interface GeminiModelConfig {
  model: string;
  timeoutMs: number;
  thinkingConfig: Record<string, unknown>;
}

const GEMINI_MODEL_CHAIN: GeminiModelConfig[] = [
  // Gemini 3.x series — use thinkingLevel
  { model: "gemini-3.5-flash",        timeoutMs: 7000, thinkingConfig: { thinkingLevel: "low" } },  // primary — most capable
  { model: "gemini-3.1-pro-preview",  timeoutMs: 7000, thinkingConfig: { thinkingLevel: "low" } },   // strong reasoning fallback
  { model: "gemini-3-flash-preview",  timeoutMs: 5000, thinkingConfig: { thinkingLevel: "low" } },
  { model: "gemini-3.1-flash-lite",   timeoutMs: 4000, thinkingConfig: { thinkingLevel: "minimal" } }, // stable, very fast
  // Gemini 2.5 series — use thinkingBudget (token count), NOT thinkingLevel
  { model: "gemini-2.5-pro",          timeoutMs: 6000, thinkingConfig: { thinkingBudget: 128 } },    // 2.5 Pro can't fully disable thinking
  { model: "gemini-2.5-flash",        timeoutMs: 5000, thinkingConfig: { thinkingBudget: 0 } },      // stable, battle-tested
  { model: "gemini-2.5-flash-lite",   timeoutMs: 4000, thinkingConfig: { thinkingBudget: 0 } },      // cheapest/fastest, last resort
];
// Worst case (every model times out): ~38s total — still well inside Vercel's
// function limit and the regex fallback (now fixed) catches anything left over.

// Initialize Supabase — use service role key for server-side webhook
// (Anon key is for client-side use only; service role bypasses RLS safely)
// ─────────────────────────────────────────────────────────────
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}
const supabaseBackend = createClient(supabaseUrl, supabaseServiceKey);

// Initialize Gemini
// FIX (2026-07-04): GEMINI_API_KEY tidak di-set di Vercel — dikonfirmasi
// lewat log "GEMINI_API_KEY is not set (ai client is null)" saat voice note
// gagal total. api/_lib/receipt-parser.ts sudah punya pool key aktif
// (GEMINI_API_KEY_1..4). Fallback ke key pertama dari pool tsb supaya bot
// langsung berfungsi dengan credential yang sudah terbukti valid, tanpa
// menunggu env var baru ditambahkan. GEMINI_API_KEY tetap diprioritaskan
// kalau di-set nanti.
const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_1;
const apiKeySource = process.env.GEMINI_API_KEY
  ? "GEMINI_API_KEY"
  : process.env.GEMINI_API_KEY_1
  ? "GEMINI_API_KEY_1 (fallback dari pool receipt-parser)"
  : "none";
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
  });
}
console.log(`[telegram-webhook] Gemini API key source: ${apiKeySource}`);


// ─────────────────────────────────────────────────────────────
// /link brute-force lockout & Telegram update dedup
//
// Both used to be plain in-memory `Map`s here. On Vercel, each serverless
// invocation can land on a different (or freshly cold-started) container
// with empty memory, so neither was reliable: a duplicate Telegram retry
// could slip through and get processed twice, and the /link lockout could
// be bypassed just by the next request landing on a different instance.
// Both now live in Postgres (see migration
// 20260712000000_db_backed_rate_limiting_and_dedup.sql) via
// get_telegram_link_lockout / record_telegram_link_attempt and
// check_and_mark_telegram_update, which use row-level locking / unique
// constraints so the check-and-update is atomic no matter which instance
// handles the request.
// ─────────────────────────────────────────────────────────────
const LINK_MAX_ATTEMPTS = 5;        // 5 attempts
const LINK_LOCKOUT_SECONDS = 15 * 60; // 15-minute lockout after 5 failed attempts

import { getActiveCategories, generateCategoryPrompt, validateCategoryKey, Category } from './_lib/categories.js';
import { checkCategoryBudgetStatus } from './_lib/budget.js';

// Resolve category label strictly from DB (categories table as master source).
// Falls back to the raw key so the message is still readable if the category
// was deleted or deactivated after the transaction was saved.
async function getCategoryLabel(categoryKey: string, lang: Lang): Promise<string> {
  const categories = await getActiveCategories();
  const cat = categories.find(c => c.key === categoryKey);
  if (!cat) return categoryKey;
  return lang === "id" ? (cat.label_id || categoryKey) : (cat.label_en || categoryKey);
}

function formatIDR(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0
  }).format(amount);
}

// ─────────────────────────────────────────────────────────────
// /hargaemas: brand aktif + label tampilan.
// HARUS persis sama dengan ACTIVE_GOLD_BRANDS di src/types.ts dan
// TARGET_BRANDS di supabase/functions/gold-price-sync/index.ts --
// ini brand yang benar-benar disinkron gold-price-sync, jadi satu-
// satunya yang selalu punya data terbaru di tabel gold_prices.
// ─────────────────────────────────────────────────────────────
const GOLD_PRICE_ACTIVE_BRANDS = ["antam", "pegadaian", "ubs", "galeri24"] as const;
const GOLD_BRAND_LABELS: Record<string, string> = {
  antam: "Antam",
  pegadaian: "Pegadaian",
  ubs: "UBS",
  galeri24: "Galeri 24",
};

// Setelah transaksi expense berhasil disimpan via bot (chat text maupun
// receipt OCR), cek apakah kategori tersebut sudah mendekati/melewati
// alert_threshold_percent budget bulan ini, lalu kirim pesan terpisah kalau
// perlu. Tidak melempar error -- kegagalan cek budget tidak boleh membuat
// alur simpan transaksi utama gagal.
async function sendBudgetWarningIfNeeded(
  chatId: number,
  userId: string,
  categoryKey: string,
  txType: "income" | "expense",
  lang: Lang
): Promise<void> {
  if (txType !== "expense") return;
  try {
    const result = await checkCategoryBudgetStatus(userId, categoryKey);
    if (!result || result.status === "safe") return;

    const catLabel = await getCategoryLabel(categoryKey, lang);
    const percentStr = String(Math.round(result.percent));

    const message =
      result.status === "danger"
        ? tr("budgetWarningOver", lang, catLabel, percentStr)
        : tr("budgetWarningThreshold", lang, catLabel, percentStr);

    await sendTelegramMessage(chatId, message);
  } catch (err) {
    console.error("Error sending budget warning via Telegram:", err);
  }
}

/**
 * Kirim pesan maintenance ke user dan hentikan pemrosesan lebih lanjut.
 * `reason` (running text yang diatur admin) disisipkan apa adanya, tanpa
 * teks tambahan yang di-hardcode, supaya konsisten dengan apa yang
 * ditampilkan ke pengguna web.
 */
async function respondFeatureUnderMaintenance(
  chatId: number,
  lang: Lang,
  reason: string
) {
  await sendTelegramMessage(chatId, tr("featureUnderMaintenance", lang, reason));
}

function buildDraftKeyboard(lang: Lang) {
  return {
    inline_keyboard: [
      [
        { text: tr("btnConfirm", lang), callback_data: "tx_confirm" },
        { text: tr("btnCancel", lang), callback_data: "tx_cancel" }
      ],
      [
        { text: tr("btnEditAmount", lang), callback_data: "tx_edit_amount" },
        { text: tr("btnEditCategory", lang), callback_data: "tx_edit_category" }
      ],
      [
        { text: tr("btnEditWallet", lang), callback_data: "tx_edit_wallet" }
      ]
    ]
  };
}

// Ikon per tipe pos dompet -- dipakai konsisten dengan web (Wallets.tsx /
// ConfirmTransactionModal.tsx) supaya terasa satu produk yang sama.
function walletTypeIcon(type: string): string {
  if (type === "ewallet") return "";
  if (type === "bank") return "";
  if (type === "cash") return "";
  return ""; // general / Saldo Total
}

function walletDisplayLabel(w: { name: string; type: string; provider?: string | null }): string {
  return `${walletTypeIcon(w.type)} ${w.name}${w.provider ? ` · ${w.provider}` : ""}`;
}

/**
 * Ambil daftar pos dompet aktif milik user yang terhubung ke chat_id ini.
 * Dipakai untuk render inline keyboard pemilih pos DAN untuk resolve index
 * -> wallet id lagi saat callback tx_set_wallet/rcpt_setwallet diproses
 * (index dipakai, bukan UUID langsung, supaya callback_data tetap di bawah
 * limit 64 byte Telegram -- sama seperti pola tx_set_cat/rcpt_setcat).
 */
async function getTelegramWalletList(chatId: number): Promise<{ id: string; name: string; type: string; provider: string | null }[]> {
  const { data, error } = await supabaseBackend.rpc("get_telegram_wallets", { p_chat_id: chatId });
  if (error || !data) {
    console.error("RPC get_telegram_wallets error:", error);
    return [];
  }
  return data;
}

function buildWalletKeyboard(
  wallets: { id: string; name: string; type: string; provider: string | null }[],
  lang: Lang,
  setCallbackPrefix: string,
  backCallback: string
) {
  const rows = [];
  for (let i = 0; i < wallets.length; i += 2) {
    const pair = wallets.slice(i, i + 2);
    rows.push(pair.map((w, j) => ({
      text: walletDisplayLabel(w),
      callback_data: `${setCallbackPrefix}${i + j}`
    })));
  }
  rows.push([{ text: tr("btnBackToDraft", lang), callback_data: backCallback }]);
  return { inline_keyboard: rows };
}

/** Label pos dompet untuk 1 wallet_id spesifik (dipakai di pesan draf/sukses). */
async function getWalletLabelById(walletId: string | null): Promise<string> {
  if (!walletId) return walletTypeIcon("general") + " -";
  const { data, error } = await supabaseBackend
    .from("wallets")
    .select("name, type, provider")
    .eq("id", walletId)
    .single();
  if (error || !data) return walletTypeIcon("general") + " -";
  return walletDisplayLabel(data);
}

/**
 * Render ulang teks preview + keyboard draf struk. Dipakai di 4 titik
 * (kirim awal, setelah ganti kategori, setelah ganti pos dompet, tombol
 * kembali) supaya keempatnya konsisten -- termasuk baris "Pos Dompet" yang
 * baru, tanpa harus menyalin blok teks yang sama berkali-kali lagi.
 */
async function renderReceiptPreview(
  draftId: string,
  receipt: any,
  catLabel: string,
  walletLabel: string,
  lang: Lang
): Promise<{ text: string; keyboard: any }> {
  let itemLines = "";
  if (receipt.items && receipt.items.length > 0) {
    receipt.items.forEach((it: any) => {
      itemLines += `• *${it.name}*\n  Qty ${it.qty} · ${formatIDR(it.unit_price)} (${formatIDR(it.subtotal)})\n`;
    });
  } else {
    itemLines += lang === "id" ? "_(Tidak ada rincian item)_\n" : "_(No itemized detail)_\n";
  }
  const receiptDateFormatted = receipt.receipt_date
    ? new Date(receipt.receipt_date).toLocaleDateString(lang === "id" ? "id-ID" : "en-US", { day: "numeric", month: "long", year: "numeric" })
    : "-";

  const text = lang === "id"
    ? `*Hasil Pembacaan Struk (OCR-Gemini)* \n\n` +
      `*Toko*: ${receipt.merchant_name}\n` +
      `*Tanggal*: ${receiptDateFormatted}\n` +
      `*Kategori*: ${catLabel}\n` +
      `*Pos Dompet*: ${walletLabel}\n\n` +
      `*Rincian Barang*:\n${itemLines}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `*Total Belanja*: *${formatIDR(receipt.total_amount)}*\n\n` +
      `_Konfirmasi pencatatan pengeluaran di bawah ini:_`
    : `*Receipt Reading Result (OCR-Gemini)* \n\n` +
      `*Store*: ${receipt.merchant_name}\n` +
      `*Date*: ${receiptDateFormatted}\n` +
      `*Category*: ${catLabel}\n` +
      `*Wallet*: ${walletLabel}\n\n` +
      `*Itemized Detail*:\n${itemLines}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `*Total Cost*: *${formatIDR(receipt.total_amount)}*\n\n` +
      `_Confirm saving this expense below:_`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: lang === "id" ? "Edit Kategori" : "Edit Category", callback_data: `rcpt_editcat:${draftId}` },
        { text: tr("btnEditWallet", lang), callback_data: `rcpt_editwallet:${draftId}` }
      ],
      [
        { text: lang === "id" ? "Simpan Transaksi" : "Save Transaction", callback_data: `rcpt_approve:${draftId}` },
        { text: lang === "id" ? "Batal" : "Cancel", callback_data: `rcpt_cancel:${draftId}` }
      ]
    ]
  };

  return { text, keyboard };
}

// ─────────────────────────────────────────────────────────────
// PDF EXPORT -- pemilih pos dompet opsional (command /pdf)
// ─────────────────────────────────────────────────────────────

/** "2026-07-09" -> "20260709" (dipakai supaya callback_data tetap pendek). */
function toCompactDate(d: Date): string {
  const iso = d.toISOString().split("T")[0]; // YYYY-MM-DD
  return iso.replace(/-/g, "");
}

/** "20260709" -> Date (UTC midnight). */
function fromCompactDate(compact: string): Date {
  const y = parseInt(compact.substring(0, 4), 10);
  const m = parseInt(compact.substring(4, 6), 10);
  const d = parseInt(compact.substring(6, 8), 10);
  return new Date(Date.UTC(y, m - 1, d));
}

const MONTH_NAMES_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const MONTH_NAMES_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];

/**
 * Bangun label periode yang enak dibaca. Kalau rentangnya persis 1 bulan
 * penuh (tanggal 1 s/d akhir bulan), pakai nama bulan ("Juli 2026").
 * Selain itu, pakai rentang ISO. Dipakai baik saat command /pdf pertama
 * kali diketik maupun saat direkonstruksi ulang dari callback_data
 * (setelah user pilih "Semua Pos" / pos tertentu).
 */
function buildPdfPeriodLabel(startDate: Date, endDate: Date, lang: Lang): string {
  const lastDayOfStartMonth = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).getDate();
  const isFullMonth =
    startDate.getDate() === 1 &&
    endDate.getFullYear() === startDate.getFullYear() &&
    endDate.getMonth() === startDate.getMonth() &&
    endDate.getDate() === lastDayOfStartMonth;

  if (isFullMonth) {
    const monthLabel = lang === "en" ? MONTH_NAMES_EN[startDate.getMonth()] : MONTH_NAMES_ID[startDate.getMonth()];
    return `${monthLabel} ${startDate.getFullYear()}`;
  }
  const toISO = (d: Date) => d.toISOString().split("T")[0];
  return `${toISO(startDate)} - ${toISO(endDate)}`;
}

/**
 * Ambil transaksi + kategori + (semua) wallet, generate PDF, kirim ke chat.
 * walletId null/undefined = "Semua Pos" (tanpa filter). Dipakai baik dari
 * tombol "Semua Pos" maupun setelah user memilih 1 pos di keyboard.
 */
async function generateAndSendPdf(
  chatId: number,
  userId: string,
  displayName: string,
  lang: Lang,
  startDate: Date,
  endDate: Date,
  summaryOnly: boolean,
  walletId: string | null,
  walletFilterLabel: string | null
): Promise<void> {
  const toISODateStr = (d: Date) => d.toISOString().split("T")[0];

  let query = supabaseBackend
    .from("transactions")
    .select("id, type, amount, category, note, source, transaction_date, created_at, wallet_id")
    .eq("user_id", userId)
    .gte("transaction_date", toISODateStr(startDate))
    .lte("transaction_date", toISODateStr(endDate))
    .order("transaction_date", { ascending: true });

  if (walletId) query = query.eq("wallet_id", walletId);

  const { data: txs, error: txsErr } = await query;
  if (txsErr) throw txsErr;

  if (!txs || txs.length === 0) {
    await sendTelegramMessage(chatId, tr("pdfNoTransactions", lang));
    return;
  }

  const categories = await getActiveCategories();
  const { data: walletsData } = await supabaseBackend
    .from("wallets")
    .select("id, name, type, provider")
    .eq("user_id", userId);

  const pdfT = createPdfTranslator(lang);

  const mappedTxs: Transaction[] = txs.map((tx: any) => ({
    id: tx.id,
    user_id: userId,
    type: tx.type as "income" | "expense",
    amount: tx.amount,
    category: tx.category,
    note: tx.note,
    source: (tx.source || "manual") as "manual" | "ai_web" | "telegram",
    transaction_date: tx.transaction_date,
    created_at: tx.created_at,
    wallet_id: tx.wallet_id ?? null
  }));

  const periodLabel = buildPdfPeriodLabel(startDate, endDate, lang);
  const fullPeriodLabel = walletFilterLabel ? `${periodLabel} · ${walletFilterLabel}` : periodLabel;
  const reportTitle = summaryOnly ? pdfT("export.summary_report_title") : pdfT("export.full_report_title");

  const pdfBytes = generatePdf({
    t: pdfT,
    userName: displayName,
    transactions: mappedTxs,
    categories,
    periodLabel: fullPeriodLabel,
    reportTitle,
    summaryOnly,
    wallets: (walletsData || []) as any,
    walletFilterLabel
  });

  const filePrefix = summaryOnly ? "Laporan_Ringkasan" : "Laporan";
  const formattedPeriod = periodLabel.replace(/\s+/g, "_").replace(/-/g, "_");
  const filename = `${filePrefix}_${formattedPeriod}.pdf`;
  const caption = tr("pdfCaption", lang, fullPeriodLabel);

  await sendTelegramDocument(chatId, pdfBytes, filename, caption);
}



function buildCategoryKeyboard(type: "income" | "expense", lang: Lang, categories: Category[]) {
  const matching = categories.filter(c => c.type === type || c.type === "both");
  const rows = [];
  for (let i = 0; i < matching.length; i += 2) {
    const pair = matching.slice(i, i + 2);
    const row = pair.map(c => ({
      text: lang === "id" ? (c.label_id || c.key) : (c.label_en || c.key),
      callback_data: `tx_set_cat:${c.key}`
    }));
    rows.push(row);
  }
  rows.push([{ text: tr("btnBackToDraft", lang), callback_data: "tx_edit_category_cancel" }]);
  return { inline_keyboard: rows };
}

// ─────────────────────────────────────────────────────────────
// FIX #5: Single DB call returns both lang + profile
// Replaces the old resolveLang() + separate get_user_by_telegram_chat_id pattern
// ─────────────────────────────────────────────────────────────
async function resolveUserContext(chatId: number): Promise<UserContext | null> {
  try {
    const { data } = await supabaseBackend.rpc("get_user_by_telegram_chat_id", {
      p_chat_id: chatId
    });
    if (!data || data.length === 0) return null;
    const row = data[0];
    return {
      id: row.id,
      display_name: row.display_name,
      lang: row.preferred_language === "en" ? "en" : "id",
    };
  } catch {
    return null;
  }
}

// Resolve lang only (for commands before profile is needed, e.g. /start, /link pre-success)
async function resolveLangOnly(chatId: number): Promise<Lang> {
  const ctx = await resolveUserContext(chatId);
  return ctx?.lang ?? "id";
}


// ─────────────────────────────────────────────────────────────
// FIX #1 (revised): Try each model in GEMINI_MODEL_CHAIN in order.
// FIX #8 (inferCategoryKey): expanded; used in fallback path
//
// Why this matters: a single model + a 6s timeout meant any slow
// response (common with thinking-enabled models) fell straight
// through to the regex fallback, which itself had a bug (fixed in
// parserUtils.ts) that made it return 0 for natural-language text.
// Now we race each model against its own timeout and only fall back
// to local regex parsing if every model in the chain fails.
// ─────────────────────────────────────────────────────────────
async function parseFinancialQuery(query: string): Promise<{
  source: string;
  type: "income" | "expense";
  category_key: string;
  amount: number;
  original_text: string;
}> {
  const codeParsedAmount = parseAmountFromString(query);
  const categories = await getActiveCategories();

  if (!ai) {
    const inferredCategory = validateCategoryKey(inferCategoryKey(query), categories);
    const inferredType = /gaji|bonus|salary|upah|thr|transfer masuk|sampingan|freelance|komisi/.test(query.toLowerCase()) ? "income" : "expense";
    return { source: "fallback_server_regex", type: inferredType, category_key: inferredCategory, amount: codeParsedAmount, original_text: query };
  }

  const categoryMapping = generateCategoryPrompt(categories);

  const systemInstruction = `You are a financial parsing expert for 'E-Wallet Kita'.
Analyze natural language transactions in Indonesian or English and output structured JSON.
Valid category keys are:
${categoryMapping}

Indonesian amount abbreviations:
  'rb' / 'ribu' = thousands (25rb → 25000)
  'k' = thousands (1k → 1000)
  'jt' / 'juta' = millions (1.5jt → 1500000)
  'Rp 250.000' or '250.000' = 250000 (dot is thousands separator in Indonesian)

If no category matches, use 'other'. Always return the numeric IDR value in 'amount'.
PENTING: Nilai 'category_key' HARUS berupa key dari daftar di atas.`;

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
          // Low/no thinking: this is a simple extraction task, not something
          // that benefits from deep reasoning, and keeping it low avoids the
          // higher latency that pushed past our old timeout. Each model gets
          // its own compatible shape (thinkingLevel for 3.x, thinkingBudget for 2.5).
          thinkingConfig,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING, enum: ["income", "expense"] },
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

      const parsedJSON = JSON.parse(responseText.trim());

      // If Gemini returned 0 or suspiciously small amount, trust our regex parser
      const finalAmount = (codeParsedAmount > 0 && (!parsedJSON.amount || parsedJSON.amount <= 10))
        ? codeParsedAmount
        : parsedJSON.amount;

      return {
        source: model,
        type: parsedJSON.type || "expense",
        category_key: validateCategoryKey(parsedJSON.category_key, categories),
        amount: finalAmount || codeParsedAmount || 0,
        original_text: query
      };
    } catch (err: any) {
      lastError = err;
      console.error(`Gemini parseFinancialQuery failed on model "${model}":`, err?.message ?? err);
      // try the next model in the chain
      continue;
    }
  }

  // Every model in the chain failed — graceful fallback to local inference
  console.error("All Gemini models in fallback chain failed. Last error:", lastError?.message ?? lastError);
  return {
    source: "fallback_gemini_error",
    type: /gaji|bonus|salary|upah|thr|sampingan|freelance|komisi/.test(query.toLowerCase()) ? "income" : "expense",
    category_key: inferCategoryKey(query),
    amount: codeParsedAmount,
    original_text: query
  };
}

// ─────────────────────────────────────────────────────────────
// Voice note transcription (Telegram voice message → text)
//
// Why: Bot sudah bisa terima foto struk (OCR) tapi user harus mengetik
// manual untuk transaksi cepat ("beli bensin 50 ribu"). Voice note lebih
// cepat diucapkan daripada diketik saat buru-buru. Infrastruktur AI
// parsing (parseFinancialQuery) sudah ada -- voice note cukup ditranskrip
// jadi teks dulu, lalu masuk ke pipeline yang SAMA PERSIS dengan pesan
// teks biasa (lihat handleVoiceNote di bawah), jadi tidak ada logic
// parsing baru yang perlu ditulis/diuji ulang.
//
// Reuse GEMINI_MODEL_CHAIN yang sama dengan parseFinancialQuery supaya
// urutan fallback model & timeout budget konsisten di seluruh bot.
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// DEBUG LOGGING (added 2026-07-04)
//
// Root-cause investigation so far: Telegram voice notes are an OGG
// container with the Opus codec, but Gemini's documented "audio/ogg"
// support is specifically OGG *Vorbis*. All 7 models in the chain
// failing at once on every voice note is consistent with a codec/format
// mismatch rather than a per-model capability gap — but the previous
// version of this function only logged `err?.message`, and Vercel's
// invocation overview always shows 200 here because a full fallback
// exhaustion is a handled `return null`, not a thrown error. That made
// the real cause invisible without digging into Runtime Logs.
//
// These logs are written so each Runtime Log entry answers, per model
// attempt: did Gemini throw (and with what status/code), or did it
// return an empty transcript silently (and what finishReason explains
// that)? The final summary line lists the outcome of all 7 attempts in
// one place so a single log line is enough to diagnose a failed voice
// note, without needing to piece together 7 separate log lines.
// ─────────────────────────────────────────────────────────────
function describeAudioForLog(base64Audio: string, mimeType: string): string {
  const approxBytes = Math.floor((base64Audio.length * 3) / 4);
  return `mimeType="${mimeType}" base64Len=${base64Audio.length} approxAudioBytes=${approxBytes} (~${(approxBytes / 1024).toFixed(1)}KB)`;
}

function describeGeminiError(err: any): string {
  // Gemini SDK errors surface the real reason in different shapes
  // depending on whether the failure came from the HTTP layer or the
  // SDK's own validation, so every field that has historically carried
  // useful info is pulled out rather than guessing which one applies.
  const parts: string[] = [];
  if (err?.status !== undefined) parts.push(`status=${err.status}`);
  if (err?.code !== undefined) parts.push(`code=${err.code}`);
  if (err?.error?.code !== undefined) parts.push(`error.code=${err.error.code}`);
  if (err?.error?.status !== undefined) parts.push(`error.status=${err.error.status}`);
  if (err?.error?.message) parts.push(`error.message=${err.error.message}`);
  if (err?.name) parts.push(`name=${err.name}`);
  if (err?.message) parts.push(`message=${err.message}`);
  return parts.length ? parts.join(" | ") : String(err);
}

async function transcribeVoiceNote(
  base64Audio: string,
  mimeType: string,
  traceId: string = `vt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
): Promise<string | null> {
  console.log(`[${traceId}] transcribeVoiceNote start — ${describeAudioForLog(base64Audio, mimeType)}`);

  if (!ai) {
    console.error(`[${traceId}] transcribeVoiceNote aborted — tidak ada Gemini API key yang tersedia (GEMINI_API_KEY maupun GEMINI_API_KEY_1 sama-sama kosong). No model was attempted.`);
    return null;
  }

  const systemInstruction =
    `You transcribe short voice notes (Indonesian or English) into plain text ONLY. ` +
    `The voice note is a person quickly logging a financial transaction (e.g. "beli bensin 50 ribu", ` +
    `"gaji bulan ini masuk 5 juta"). Output ONLY the raw transcript, verbatim, no translation, ` +
    `no commentary, no quotes, no markdown.`;

  const attempts: { model: string; outcome: string }[] = [];
  let lastError: any = null;

  for (const { model, timeoutMs, thinkingConfig } of GEMINI_MODEL_CHAIN) {
    const attemptStart = Date.now();
    try {
      let timeoutId: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`Gemini transcription timed out (${model}, ${timeoutMs}ms)`)), timeoutMs);
      });

      const responsePromise = ai.models.generateContent({
        model,
        contents: {
          parts: [
            { inlineData: { mimeType, data: base64Audio } },
            { text: "Transcribe this voice note verbatim." }
          ]
        },
        config: {
          systemInstruction,
          // Transcription is not a reasoning task; disable/limit thinking
          // for speed, using the same per-model thinkingConfig shape as
          // parseFinancialQuery (thinkingLevel for 3.x, thinkingBudget for 2.5).
          thinkingConfig
        }
      });

      const response = await Promise.race([responsePromise, timeoutPromise]);
      if (timeoutId) clearTimeout(timeoutId);
      const elapsedMs = Date.now() - attemptStart;

      const transcript = response.text?.trim();
      if (transcript) {
        console.log(`[${traceId}] transcribeVoiceNote succeeded on "${model}" in ${elapsedMs}ms — transcriptLen=${transcript.length}`);
        return transcript;
      }

      // No exception was thrown, but there's also no text — this is the
      // SILENT failure case the old code never logged at all. finishReason
      // / promptFeedback usually explains why Gemini returned nothing
      // (e.g. a safety block, vs. genuinely failing to decode the audio).
      const candidate = (response as any)?.candidates?.[0];
      const finishReason = candidate?.finishReason ?? "unknown";
      const safetyRatings = candidate?.safetyRatings ? JSON.stringify(candidate.safetyRatings) : "none";
      const promptFeedback = (response as any)?.promptFeedback ? JSON.stringify((response as any).promptFeedback) : "none";
      console.warn(
        `[${traceId}] transcribeVoiceNote got EMPTY transcript from "${model}" in ${elapsedMs}ms — ` +
        `finishReason=${finishReason} safetyRatings=${safetyRatings} promptFeedback=${promptFeedback}`
      );
      attempts.push({ model, outcome: `empty (finishReason=${finishReason})` });
      // Empty transcript from this model — try the next one rather than
      // treating a blank response as final.
    } catch (err: any) {
      const elapsedMs = Date.now() - attemptStart;
      lastError = err;
      attempts.push({ model, outcome: `error (${describeGeminiError(err)})` });
      console.error(`[${traceId}] transcribeVoiceNote failed on "${model}" after ${elapsedMs}ms — ${describeGeminiError(err)}`);
      continue;
    }
  }

  console.error(
    `[${traceId}] All ${GEMINI_MODEL_CHAIN.length} Gemini models failed to transcribe voice note. ` +
    `Attempt summary: ${attempts.map(a => `${a.model}=${a.outcome}`).join(" | ")}. ` +
    `Input: ${describeAudioForLog(base64Audio, mimeType)}. ` +
    `Last thrown error: ${lastError ? describeGeminiError(lastError) : "none (all attempts returned empty, no exceptions)"}`
  );
  return null;
}

async function handleReceiptPhoto(message: any, maintenanceStatus: MaintenanceStatus) {
  const chatId = message.chat.id;
  
  // Resolve user first
  const userCtx = await resolveUserContext(chatId);
  if (!userCtx) {
    await sendTelegramMessage(chatId, tr("notLinkedForTx", "id"));
    return;
  }

  const lang = userCtx.lang;

  // Maintenance gate: pemindaian struk (OCR) termasuk fitur "receipt_scan".
  if (isFeatureLocked(maintenanceStatus, "receipt_scan")) {
    await respondFeatureUnderMaintenance(chatId, lang, getMaintenanceMessage(maintenanceStatus, lang));
    return;
  }
  
  // Send initial informational status message
  const statusMsg = lang === "id" 
    ? "_Sedang mengunduh foto struk belanja Anda..._" 
    : "_Downloading receipt photo..._";
  await sendTelegramMessage(chatId, statusMsg);

  try {
    const photo = message.photo[message.photo.length - 1];
    const token = process.env.TELEGRAM_BOT_TOKEN;
    
    // Step 1: getFile
    const getFileResp = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${photo.file_id}`);
    if (!getFileResp.ok) {
      throw new Error(`getFile API failed: ${getFileResp.statusText}`);
    }
    const getFileData = await getFileResp.json();
    const filePath = getFileData.result?.file_path;
    if (!filePath) {
      throw new Error("Could not retrieve file path from Telegram.");
    }

    // Step 2: Download image
    const imageUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    
    // Step 3: Convert to base64
    const imageResp = await fetch(imageUrl);
    if (!imageResp.ok) {
      throw new Error(`Failed to download image from Telegram: ${imageResp.statusText}`);
    }
    const arrayBuffer = await imageResp.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    // Send updated processing text
    await sendTelegramMessage(chatId, lang === "id" 
      ? "_Gemini sedang mengekstrak detail struk Anda..._" 
      : "_Gemini is extracting receipt details..._");

    // Step 4: Parse with receipt parser
    const receipt = await parseReceipt(base64);

    // Step 5: Save draft
    // Snapshot the currently active expense/both categories so that later
    // "Edit Category" button presses always resolve to the same set,
    // even if categories are added/removed/reordered afterwards.
    const categoriesForSnapshot = await getActiveCategories();
    const categorySnapshot = categoriesForSnapshot
      .filter(c => c.type === "expense" || c.type === "both")
      .map(c => ({ key: c.key, label_id: c.label_id, label_en: c.label_en }));
    const draft = await createReceiptDraft(userCtx.id, receipt, "telegram", String(chatId), categorySnapshot);

    // Step 6: Render and send preview
    const catLabel = await getCategoryLabel(draft.category || 'other', lang);
    const walletLabel = await getWalletLabelById(draft.wallet_id);
    const { text: textPreview, keyboard: inlineKeyboard } = await renderReceiptPreview(draft.id, receipt, catLabel, walletLabel, lang);

    await sendTelegramMessage(chatId, textPreview, inlineKeyboard);

  } catch (err: any) {
    console.error("handleReceiptPhoto error:", err);
    await sendTelegramMessage(chatId, lang === "id" 
      ? `*Gagal Membaca Foto Struk*\n_Penyebab: ${err.message || 'Error internal parser struk'}_`
      : `*Failed to Process Receipt Photo*\n_Reason: ${err.message || 'Internal parser error'}_`);
  }
}

// ─────────────────────────────────────────────────────────────
// Voice note → transaction draft
//
// Same gating & pipeline as text natural-language transactions
// (resolveUserContext, "new_transaction" maintenance gate,
// parseFinancialQuery, upsert_pending_telegram_tx RPC, draft keyboard) --
// the only new step is downloading + transcribing the Telegram voice
// file first. This keeps the actual transaction-parsing logic in ONE
// place instead of duplicating it for voice.
// ─────────────────────────────────────────────────────────────
async function handleVoiceNote(message: any, maintenanceStatus: MaintenanceStatus) {
  const chatId = message.chat.id;

  const userCtx = await resolveUserContext(chatId);
  if (!userCtx) {
    await sendTelegramMessage(chatId, tr("notLinkedForTx", "id"));
    return;
  }
  const lang = userCtx.lang;

  // Voice note masuk kategori "catat transaksi cepat" — pakai gate yang
  // sama dengan pencatatan teks biasa (new_transaction), bukan gate
  // terpisah, supaya kalau admin mengunci pencatatan transaksi, voice
  // note ikut terkunci juga secara konsisten.
  if (isFeatureLocked(maintenanceStatus, "new_transaction")) {
    await respondFeatureUnderMaintenance(chatId, lang, getMaintenanceMessage(maintenanceStatus, lang));
    return;
  }

  const voice = message.voice;
  const MAX_DURATION_SECONDS = 60;
  if (voice.duration && voice.duration > MAX_DURATION_SECONDS) {
    await sendTelegramMessage(chatId, tr("voiceTooLong", lang));
    return;
  }

  await sendTelegramMessage(chatId, tr("voiceTranscribing", lang));

  // traceId dipakai untuk mengaitkan semua log satu voice note ini —
  // mulai dari getFile Telegram sampai hasil akhir tiap model Gemini —
  // supaya di Vercel Runtime Logs tinggal filter satu string ini.
  const traceId = `vt_${chatId}_${Date.now()}`;
  console.log(
    `[${traceId}] Voice note diterima dari chatId=${chatId} — ` +
    `file_id=${voice.file_id} duration=${voice.duration ?? "unknown"}s ` +
    `telegram_mime_type=${voice.mime_type ?? "unknown"} file_size=${voice.file_size ?? "unknown"}`
  );

  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    // Step 1: getFile
    const getFileResp = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${voice.file_id}`);
    if (!getFileResp.ok) {
      console.error(`[${traceId}] getFile API failed: status=${getFileResp.status} statusText=${getFileResp.statusText}`);
      throw new Error(`getFile API failed: ${getFileResp.statusText}`);
    }
    const getFileData = await getFileResp.json();
    const filePath = getFileData.result?.file_path;
    if (!filePath) {
      console.error(`[${traceId}] getFile response missing file_path. Raw response:`, JSON.stringify(getFileData));
      throw new Error("Could not retrieve file path from Telegram.");
    }
    console.log(`[${traceId}] getFile OK — file_path=${filePath} reported_file_size=${getFileData.result?.file_size ?? "unknown"}`);

    // Step 2: Download & base64-encode the audio (ogg/opus)
    const audioUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const audioResp = await fetch(audioUrl);
    if (!audioResp.ok) {
      console.error(`[${traceId}] Download voice note failed: status=${audioResp.status} statusText=${audioResp.statusText} url=${audioUrl}`);
      throw new Error(`Failed to download voice note from Telegram: ${audioResp.statusText}`);
    }
    const arrayBuffer = await audioResp.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = voice.mime_type || "audio/ogg";
    console.log(
      `[${traceId}] Audio downloaded — bytesDownloaded=${arrayBuffer.byteLength} ` +
      `resolvedMimeType="${mimeType}" filePath="${filePath}" (extension menunjukkan container asli dari Telegram)`
    );

    // Step 3: Transcribe with Gemini
    const transcript = await transcribeVoiceNote(base64Audio, mimeType, traceId);
    if (!transcript) {
      console.error(`[${traceId}] transcribeVoiceNote returned null — mengirim pesan error ke user. Lihat log "${traceId}" di atas untuk detail kegagalan tiap model.`);
      await logError(supabaseBackend, {
        source: "telegram-webhook:voice-transcribe",
        level: "error",
        message: "transcribeVoiceNote returned null — semua model Gemini gagal atau tidak ada API key tersedia.",
        context: { chatId, mimeType, filePath },
        traceId,
      });
      await sendTelegramMessage(chatId, tr("voiceTranscribeError", lang));
      return;
    }
    console.log(`[${traceId}] Transcript diterima, lanjut ke parseFinancialQuery — transcriptLen=${transcript.length}`);

    // Show the user what we heard, so they can immediately tell if the
    // transcription is wrong before we even try to parse an amount.
    await sendTelegramMessage(chatId, tr("voiceHeard", lang, transcript));
    await sendTelegramMessage(chatId, tr("analyzing", lang));

    // Step 4: Reuse the exact same natural-language parsing pipeline as
    // text messages.
    const parsed = await parseFinancialQuery(transcript);

    if (parsed.amount <= 0) {
      await sendTelegramMessage(chatId, tr("amountNotDetected", lang));
      return;
    }

    const { error: upsertErr } = await supabaseBackend.rpc("upsert_pending_telegram_tx", {
      p_chat_id: chatId,
      p_type: parsed.type,
      p_category_key: parsed.category_key,
      p_amount: parsed.amount,
      p_original_text: parsed.original_text
    });

    if (upsertErr) {
      console.error("RPC upsert_pending_telegram_tx error (voice):", upsertErr);
      await sendTelegramMessage(chatId, tr("draftSaveError", lang));
      return;
    }

    const localizedCat = await getCategoryLabel(parsed.category_key, lang);
    const currencyStr = formatIDR(parsed.amount);
    const typeLabel = parsed.type === "income" ? tr("txTypeIncome", lang) : tr("txTypeExpense", lang);
    const draftMarkup = buildDraftKeyboard(lang);

    // Ambil balik draft yang baru diupsert supaya tahu wallet_id yang
    // di-resolve otomatis oleh RPC (default: Saldo Total).
    const { data: freshDraft } = await supabaseBackend.rpc("get_pending_telegram_tx", { p_chat_id: chatId });
    const walletLabel = await getWalletLabelById(freshDraft?.[0]?.wallet_id ?? null);

    await sendTelegramMessage(
      chatId,
      tr("draftPrompt", lang, typeLabel, localizedCat, currencyStr, parsed.original_text, walletLabel),
      draftMarkup
    );
  } catch (err: any) {
    console.error(`[${traceId}] handleVoiceNote error (di luar transcribeVoiceNote — kemungkinan getFile/download Telegram gagal, lihat log di atas):`, err?.message ?? err);
    await sendTelegramMessage(chatId, tr("voiceTranscribeError", lang));
  }
}

// ─────────────────────────────────────────────────────────────
// MAIN WEBHOOK HANDLER
// ─────────────────────────────────────────────────────────────
export default async (req: VercelRequest, res: VercelResponse) => {
  // Method + auth MUST be validated before any DB call. Previously the
  // cleanup RPC below fired unconditionally here — before the method check
  // and before the secret-token check — so any unauthenticated request
  // (wrong method, missing/invalid secret) still triggered a DB write.
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (!secretToken) {
      console.error("TELEGRAM_WEBHOOK_SECRET is not configured — rejecting all webhook requests.");
      res.status(500).json({ error: "Webhook is not configured correctly" });
      return;
    }

    if (secretHeader !== secretToken) {
      console.warn("Unauthorized Telegram Webhook request blocked");
      res.status(403).json({ error: "Unauthorized update request" });
      return;
    }

    // Auto-cleanup expired pending transactions — only once, only after the
    // request is confirmed to be a real, authenticated Telegram update
    // (this used to also run a second time before the checks above, which
    // was both wasteful and an unauthenticated DB-write surface).
    await supabaseBackend.rpc("cleanup_expired_pending_transactions");

    const update = req.body;

    // ──────────────────────────────────────────────────────────
    // MAINTENANCE MODE: load current status once per request.
    // Sumber data sama dengan yang dikelola admin di tab Maintenance pada
    // Admin Panel (tabel maintenance_settings & maintenance_feature_locks),
    // jadi tidak ada endpoint baru maupun teks hardcode — semua dari DB.
    // ──────────────────────────────────────────────────────────
    const maintenanceStatus = await getMaintenanceStatus(supabaseBackend);

    // Check for duplicate updates to prevent processing retries sent by Telegram
    if (update && update.update_id) {
      const { data: isNewUpdate, error: dedupError } = await supabaseBackend.rpc(
        "check_and_mark_telegram_update",
        { p_update_id: update.update_id }
      );
      if (dedupError) {
        // Fail-open: a dedup-table hiccup shouldn't take the whole bot down.
        // Worst case on failure is an occasional double-processed retry,
        // which is far better than the bot going silent.
        console.error("Telegram dedup check failed, proceeding anyway:", dedupError);
      } else if (isNewUpdate === false) {
        console.warn(`Ignored duplicate Telegram retry update_id: ${update.update_id}`);
        res.status(200).json({ ok: true });
        return;
      }
    }

    // Safe logging (only log update type, not full payload)
    if (update.message?.text) {
      const textPreview = update.message.text.substring(0, 20);
      console.log(`Telegram message: "${textPreview}..."`);
    } else if (update.callback_query) {
      console.log(`Telegram callback: ${update.callback_query.data}`);
    }

    // ──────────────────────────────────────────────────────────
    // GLOBAL MAINTENANCE KILL-SWITCH ("telegram_bot" feature)
    // Jika admin mengunci fitur "telegram_bot" secara spesifik, seluruh
    // bot tidak dapat digunakan. /start, /help, dan pemilihan bahasa tetap
    // dibiarkan berjalan supaya pengguna tidak kebingungan total.
    // ──────────────────────────────────────────────────────────
    if (isFeatureLocked(maintenanceStatus, "telegram_bot")) {
      const incomingText = (update.message?.text || "").trim().toLowerCase();
      const incomingCallback = update.callback_query?.data as string | undefined;
      const isAllowedDuringLockdown =
        incomingText.startsWith("/start") ||
        incomingText.startsWith("/help") ||
        incomingCallback === "set_lang_id" ||
        incomingCallback === "set_lang_en";

      if (!isAllowedDuringLockdown) {
        const targetChatId = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;
        if (targetChatId) {
          const lockdownLang = await resolveLangOnly(targetChatId);
          if (update.callback_query?.id) {
            await answerTelegramCallback(update.callback_query.id);
          }
          await respondFeatureUnderMaintenance(targetChatId, lockdownLang, getMaintenanceMessage(maintenanceStatus, lockdownLang));
        }
        res.status(200).json({ ok: true }); return;
      }
    }

    // ──────────────────────────────────────────────────────────
    // CALLBACK QUERY HANDLER
    // ──────────────────────────────────────────────────────────
    if (update.callback_query) {
      const queryId    = update.callback_query.id;
      const chatId     = update.callback_query.message?.chat?.id;
      const msgId      = update.callback_query.message?.message_id;
      const actionData = update.callback_query.data as string;

      if (!chatId || !msgId) { res.status(200).json({ ok: true }); return; }

      const lang = await resolveLangOnly(chatId);

      // Maintenance gate: aksi terkait pencatatan transaksi (tx_*) dipetakan
      // ke fitur "new_transaction", aksi terkait struk (rcpt_*) ke fitur
      // "receipt_scan". Aksi pemilihan bahasa tidak digate agar user tetap
      // bisa mengganti bahasa meski sedang maintenance.
      const isTxAction = actionData.startsWith("tx_");
      const isReceiptAction = actionData.startsWith("rcpt_");
      const isBillAction = actionData.startsWith("bill_");

      if (isTxAction && isFeatureLocked(maintenanceStatus, "new_transaction")) {
        await answerTelegramCallback(queryId);
        await respondFeatureUnderMaintenance(chatId, lang, getMaintenanceMessage(maintenanceStatus, lang));
        res.status(200).json({ ok: true }); return;
      }

      if (isReceiptAction && isFeatureLocked(maintenanceStatus, "receipt_scan")) {
        await answerTelegramCallback(queryId);
        await respondFeatureUnderMaintenance(chatId, lang, getMaintenanceMessage(maintenanceStatus, lang));
        res.status(200).json({ ok: true }); return;
      }

      // Tombol "Tandai Lunas" dari pesan reminder tagihan (dikirim oleh
      // Edge Function bill-reminder-notifier) memetakan ke feature lock
      // yang sama dengan halaman web-nya (<FeatureLockGate featureKey="bill_reminders">
      // di App.tsx), supaya admin kunci satu tempat berlaku di web & bot.
      if (isBillAction && isFeatureLocked(maintenanceStatus, "bill_reminders")) {
        await answerTelegramCallback(queryId);
        await respondFeatureUnderMaintenance(chatId, lang, getMaintenanceMessage(maintenanceStatus, lang));
        res.status(200).json({ ok: true }); return;
      }

      // Handle Category Selection for Draft
      if (actionData.startsWith("tx_set_cat:")) {
        const newCatKey = actionData.split(":")[1];
        const { error: updateErr } = await supabaseBackend.rpc("update_pending_telegram_tx_category", {
          p_chat_id: chatId,
          p_category_key: newCatKey
        });

        if (updateErr) {
          await answerTelegramCallback(queryId, tr("cbSaveFailed", lang));
          res.status(200).json({ ok: true }); return;
        }

        // Reload draft to show updated label
        const { data: draft } = await supabaseBackend.rpc("get_pending_telegram_tx", { p_chat_id: chatId });
        if (!draft || draft.length === 0) {
          await answerTelegramCallback(queryId, tr("cbExpired", lang));
          res.status(200).json({ ok: true }); return;
        }

        const row = draft[0];
        const typeLabel = row.type === "income" ? tr("txTypeIncome", lang) : tr("txTypeExpense", lang);
        const catLabel  = await getCategoryLabel(row.category_key, lang);
        const amountStr = formatIDR(row.amount);
        const walletLabel = await getWalletLabelById(row.wallet_id);

        await editTelegramMessage(
          chatId, msgId,
          tr("draftPrompt", lang, typeLabel, catLabel, amountStr, row.original_text, walletLabel),
          buildDraftKeyboard(lang)
        );

        await answerTelegramCallback(queryId, tr("cbCategoryUpdated", lang));
        res.status(200).json({ ok: true }); return;
      }

      if (actionData === "tx_confirm") {
        const { data: draft, error: fetchErr } = await supabaseBackend.rpc("get_pending_telegram_tx", { p_chat_id: chatId });
        
        if (fetchErr || !draft || draft.length === 0) {
          await answerTelegramCallback(queryId, tr("cbExpired", lang));
          await editTelegramMessage(chatId, msgId, tr("msgExpired", lang));
          res.status(200).json({ ok: true }); return;
        }

        const row = draft[0];

        // Final Save to Transactions table
        const { error: saveErr } = await supabaseBackend.rpc("confirm_pending_telegram_tx", {
          p_chat_id: chatId
        });

        if (saveErr) {
          console.error("confirm_pending_telegram_tx error:", saveErr);
          await answerTelegramCallback(queryId, tr("cbSaveFailed", lang));
          await editTelegramMessage(chatId, msgId, tr("msgSaveFailed", lang, saveErr.message));
        } else {
          const typeLabel = row.type === "income" ? tr("txTypeIncome", lang) : tr("txTypeExpense", lang);
          const catLabel  = await getCategoryLabel(row.category_key, lang);
          const amountStr = formatIDR(row.amount);
          const walletLabel = await getWalletLabelById(row.wallet_id);

          await answerTelegramCallback(queryId, tr("cbSaveSuccess", lang));
          await editTelegramMessage(chatId, msgId, tr("msgSaveSuccess", lang, typeLabel, catLabel, amountStr, row.original_text, walletLabel));

          const userCtx = await resolveUserContext(chatId);
          if (userCtx) {
            await sendBudgetWarningIfNeeded(chatId, userCtx.id, row.category_key, row.type, lang);
          }

          // Also send FCM push notification to all of the user's registered
          // devices. Non-blocking — a push failure must never prevent the
          // transaction from saving.
          // NOTE: telegram_pending_transactions / get_pending_telegram_tx has
          // NO user_id column (it's keyed only by chat_id), so `row.user_id`
          // is always undefined here. Use the already-resolved userCtx
          // (from resolveUserContext(chatId) above) instead, same as
          // sendBudgetWarningIfNeeded does.
          if (userCtx) {
            try {
              const typeLabelPush = row.type === 'income' ? 'Pemasukan' : 'Pengeluaran';
              await sendPushNotificationToUser(
                supabaseBackend,
                userCtx.id,
                `Transaksi ${typeLabelPush}`,
                `${amountStr} - ${row.original_text || row.category_key}`
              );
            } catch (err) {
              console.error('[FCM] Failed to send transaction push:', err);
            }
          }
        }
      } 
      else if (actionData === "tx_cancel") {
        await supabaseBackend.rpc("cancel_pending_telegram_tx", { p_chat_id: chatId });
        await answerTelegramCallback(queryId, tr("cbCancelled", lang));
        await editTelegramMessage(chatId, msgId, tr("msgCancelled", lang));
      }
      else if (actionData === "tx_edit_amount") {
        // We don't have a sophisticated "edit state" so we just tell them to re-type
        await answerTelegramCallback(queryId);
        await sendTelegramMessage(chatId, tr("editAmountPrompt", lang));
      }
      else if (actionData === "tx_edit_category") {
        const { data: draft } = await supabaseBackend.rpc("get_pending_telegram_tx", { p_chat_id: chatId });
        if (!draft || draft.length === 0) {
          await answerTelegramCallback(queryId, tr("cbExpired", lang));
          res.status(200).json({ ok: true }); return;
        }
        const categories = await getActiveCategories();
        await editTelegramMessage(chatId, msgId, tr("editCategoryPrompt", lang), buildCategoryKeyboard(draft[0].type, lang, categories));
        await answerTelegramCallback(queryId);
      }
      else if (actionData === "tx_edit_category_cancel") {
        const { data: draft } = await supabaseBackend.rpc("get_pending_telegram_tx", { p_chat_id: chatId });
        if (!draft || draft.length === 0) {
          await answerTelegramCallback(queryId, tr("cbExpired", lang));
          res.status(200).json({ ok: true }); return;
        }
        const row = draft[0];
        const typeLabel = row.type === "income" ? tr("txTypeIncome", lang) : tr("txTypeExpense", lang);
        const catLabel  = await getCategoryLabel(row.category_key, lang);
        const walletLabel = await getWalletLabelById(row.wallet_id);
        await editTelegramMessage(chatId, msgId, tr("draftPrompt", lang, typeLabel, catLabel, formatIDR(row.amount), row.original_text, walletLabel), buildDraftKeyboard(lang));
        await answerTelegramCallback(queryId);
      }
      // Pilih pos dompet untuk draft teks/voice (mirror alur edit kategori
      // di atas: tampilkan keyboard -> user tap -> kembali ke draf).
      else if (actionData === "tx_edit_wallet") {
        const { data: draft } = await supabaseBackend.rpc("get_pending_telegram_tx", { p_chat_id: chatId });
        if (!draft || draft.length === 0) {
          await answerTelegramCallback(queryId, tr("cbExpired", lang));
          res.status(200).json({ ok: true }); return;
        }
        const wallets = await getTelegramWalletList(chatId);
        await editTelegramMessage(chatId, msgId, tr("editWalletPrompt", lang), buildWalletKeyboard(wallets, lang, "tx_set_wallet:", "tx_edit_wallet_cancel"));
        await answerTelegramCallback(queryId);
      }
      else if (actionData.startsWith("tx_set_wallet:")) {
        const walletIndex = parseInt(actionData.split(":")[1], 10);
        const wallets = await getTelegramWalletList(chatId);
        const selectedWallet = wallets[walletIndex];
        if (!selectedWallet) {
          await answerTelegramCallback(queryId, tr("cbExpired", lang));
          res.status(200).json({ ok: true }); return;
        }
        const { error: updateWalletErr } = await supabaseBackend.rpc("update_pending_telegram_tx_wallet", {
          p_chat_id: chatId,
          p_wallet_id: selectedWallet.id
        });
        if (updateWalletErr) {
          await answerTelegramCallback(queryId, tr("cbSaveFailed", lang));
          res.status(200).json({ ok: true }); return;
        }

        const { data: draft } = await supabaseBackend.rpc("get_pending_telegram_tx", { p_chat_id: chatId });
        if (!draft || draft.length === 0) {
          await answerTelegramCallback(queryId, tr("cbExpired", lang));
          res.status(200).json({ ok: true }); return;
        }
        const row = draft[0];
        const typeLabel = row.type === "income" ? tr("txTypeIncome", lang) : tr("txTypeExpense", lang);
        const catLabel  = await getCategoryLabel(row.category_key, lang);
        const walletLabel = walletDisplayLabel(selectedWallet);
        await editTelegramMessage(chatId, msgId, tr("draftPrompt", lang, typeLabel, catLabel, formatIDR(row.amount), row.original_text, walletLabel), buildDraftKeyboard(lang));
        await answerTelegramCallback(queryId, tr("cbWalletUpdated", lang));
      }
      else if (actionData === "tx_edit_wallet_cancel") {
        const { data: draft } = await supabaseBackend.rpc("get_pending_telegram_tx", { p_chat_id: chatId });
        if (!draft || draft.length === 0) {
          await answerTelegramCallback(queryId, tr("cbExpired", lang));
          res.status(200).json({ ok: true }); return;
        }
        const row = draft[0];
        const typeLabel = row.type === "income" ? tr("txTypeIncome", lang) : tr("txTypeExpense", lang);
        const catLabel  = await getCategoryLabel(row.category_key, lang);
        const walletLabel = await getWalletLabelById(row.wallet_id);
        await editTelegramMessage(chatId, msgId, tr("draftPrompt", lang, typeLabel, catLabel, formatIDR(row.amount), row.original_text, walletLabel), buildDraftKeyboard(lang));
        await answerTelegramCallback(queryId);
      }
      // OCR Callbacks
      else if (actionData.startsWith("rcpt_approve:")) {
        const draftId = actionData.split(":")[1];
        try {
          const resApprove = await approveReceiptDraft(draftId);
          await answerTelegramCallback(queryId, tr("cbSaveSuccess", lang));
          const catLabel = await getCategoryLabel(resApprove.draft.category || 'other', lang);
          const typeLabel = tr("txTypeExpense", lang);
          const walletLabel = await getWalletLabelById(resApprove.draft.wallet_id ?? null);
          await editTelegramMessage(chatId, msgId, tr("msgSaveSuccess", lang, typeLabel, catLabel, formatIDR(resApprove.draft.total_amount), resApprove.draft.merchant_name || 'Receipt Scan', walletLabel));

          if (resApprove.transaction?.user_id) {
            await sendBudgetWarningIfNeeded(chatId, resApprove.transaction.user_id, resApprove.draft.category || 'other', 'expense', lang);

            // Send FCM push notification to all registered devices after
            // receipt-based transaction saves. Non-blocking — push failure
            // never blocks the transaction.
            try {
              await sendPushNotificationToUser(
                supabaseBackend,
                resApprove.transaction.user_id,
                'Struk Tercatat',
                `${formatIDR(resApprove.draft.total_amount)} - ${resApprove.draft.merchant_name || 'Receipt Scan'}`
              );
            } catch (fcmErr) {
              console.error('[FCM] Failed to send receipt push:', fcmErr);
            }
          }
        } catch (err: any) {
          await answerTelegramCallback(queryId, tr("cbSaveFailed", lang));
          await editTelegramMessage(chatId, msgId, tr("msgSaveFailed", lang, err.message));
        }
      }
      else if (actionData.startsWith("rcpt_cancel:")) {
        const draftId = actionData.split(":")[1];
        await cancelReceiptDraft(draftId);
        await answerTelegramCallback(queryId, tr("cbCancelled", lang));
        await editTelegramMessage(chatId, msgId, tr("msgCancelled", lang));
      }
      else if (actionData.startsWith("rcpt_editcat:")) {
        const draftId = actionData.split(":")[1];
        const draftForEdit = await getReceiptDraft(draftId);
        if (!draftForEdit) {
          await answerTelegramCallback(queryId, tr("cbExpired", lang));
          res.status(200).json({ ok: true }); return;
        }
        // Prefer the snapshot captured when the draft was created, so button
        // indexes stay valid even if categories changed since then. Fall back
        // to a live fetch for old drafts created before this snapshot existed.
        const matching: { key: string; label_id: string | null; label_en: string | null }[] =
          draftForEdit.category_options && draftForEdit.category_options.length > 0
            ? draftForEdit.category_options
            : (await getActiveCategories()).filter(c => c.type === "expense" || c.type === "both");
        const rows = [];
        for (let i = 0; i < matching.length; i += 2) {
          const pair = matching.slice(i, i + 2);
          rows.push(pair.map((c, j) => ({
            text: lang === "id" ? (c.label_id || c.key) : (c.label_en || c.key),
            // Use index instead of c.key to keep callback_data well under Telegram's 64-byte limit,
            // since category keys can be arbitrarily long (custom categories from the DB).
            callback_data: `rcpt_setcat:${draftId}:${i + j}`
          })));
        }
        rows.push([{ text: tr("btnBackToDraft", lang), callback_data: `rcpt_back:${draftId}` }]);
        await editTelegramMessage(chatId, msgId, tr("editCategoryPrompt", lang), { inline_keyboard: rows });
        await answerTelegramCallback(queryId);
      }
      else if (actionData.startsWith("rcpt_setcat:")) {
        const [, draftId, catIndexStr] = actionData.split(":");
        const draftForSetcat = await getReceiptDraft(draftId);
        if (!draftForSetcat) {
          await answerTelegramCallback(queryId, tr("cbExpired", lang));
          res.status(200).json({ ok: true }); return;
        }
        const matchingCats: { key: string }[] =
          draftForSetcat.category_options && draftForSetcat.category_options.length > 0
            ? draftForSetcat.category_options
            : (await getActiveCategories()).filter(c => c.type === "expense" || c.type === "both");
        const catIndex = parseInt(catIndexStr, 10);
        const selectedCat = matchingCats[catIndex];
        if (!selectedCat) {
          await answerTelegramCallback(queryId, tr("cbExpired", lang));
          res.status(200).json({ ok: true }); return;
        }
        const catKey = selectedCat.key;
        await updateReceiptCategory(draftId, catKey);
        // Go back to preview
        const draft = await getReceiptDraft(draftId);
        if (!draft) {
          await answerTelegramCallback(queryId, tr("cbExpired", lang));
          res.status(200).json({ ok: true }); return;
        }
        const catLabel = await getCategoryLabel(catKey, lang);
        await answerTelegramCallback(queryId, tr("cbCategoryUpdated", lang));
        const walletLabel = await getWalletLabelById(draft.wallet_id ?? null);
        const { text: textPreview, keyboard: inlineKeyboard } = await renderReceiptPreview(draftId, draft.raw_ai_response, catLabel, walletLabel, lang);
        await editTelegramMessage(chatId, msgId, textPreview, inlineKeyboard);
      }
      else if (actionData.startsWith("rcpt_back:")) {
        const draftId = actionData.split(":")[1];
        const draft = await getReceiptDraft(draftId);
        if (!draft) {
          await answerTelegramCallback(queryId, tr("cbExpired", lang));
          res.status(200).json({ ok: true }); return;
        }
        const catLabel = await getCategoryLabel(draft.category || 'other', lang);
        const walletLabel = await getWalletLabelById(draft.wallet_id ?? null);
        const { text: textPreview, keyboard: inlineKeyboard } = await renderReceiptPreview(draftId, draft.raw_ai_response, catLabel, walletLabel, lang);
        await editTelegramMessage(chatId, msgId, textPreview, inlineKeyboard);
        await answerTelegramCallback(queryId);
      }
      // Pilih pos dompet untuk draf struk (mirror alur edit kategori di atas).
      else if (actionData.startsWith("rcpt_editwallet:")) {
        const draftId = actionData.split(":")[1];
        const draftForEdit = await getReceiptDraft(draftId);
        if (!draftForEdit) {
          await answerTelegramCallback(queryId, tr("cbExpired", lang));
          res.status(200).json({ ok: true }); return;
        }
        const wallets = await getTelegramWalletList(chatId);
        await editTelegramMessage(chatId, msgId, tr("editWalletPrompt", lang), buildWalletKeyboard(wallets, lang, `rcpt_setwallet:${draftId}:`, `rcpt_back:${draftId}`));
        await answerTelegramCallback(queryId);
      }
      else if (actionData.startsWith("rcpt_setwallet:")) {
        const [, draftId, walletIndexStr] = actionData.split(":");
        const draftForSetwallet = await getReceiptDraft(draftId);
        if (!draftForSetwallet) {
          await answerTelegramCallback(queryId, tr("cbExpired", lang));
          res.status(200).json({ ok: true }); return;
        }
        const wallets = await getTelegramWalletList(chatId);
        const selectedWallet = wallets[parseInt(walletIndexStr, 10)];
        if (!selectedWallet) {
          await answerTelegramCallback(queryId, tr("cbExpired", lang));
          res.status(200).json({ ok: true }); return;
        }
        await updateReceiptWallet(draftId, selectedWallet.id);
        const draft = await getReceiptDraft(draftId);
        if (!draft) {
          await answerTelegramCallback(queryId, tr("cbExpired", lang));
          res.status(200).json({ ok: true }); return;
        }
        const catLabel = await getCategoryLabel(draft.category || 'other', lang);
        await answerTelegramCallback(queryId, tr("cbWalletUpdated", lang));
        const { text: textPreview, keyboard: inlineKeyboard } = await renderReceiptPreview(draftId, draft.raw_ai_response, catLabel, walletDisplayLabel(selectedWallet), lang);
        await editTelegramMessage(chatId, msgId, textPreview, inlineKeyboard);
      }
      // ── /pdf: pilihan "Semua Pos" vs "Pilih Pos Dompet" ──────────────
      // callback_data formatnya "pdf_all:<startYYYYMMDD>:<endYYYYMMDD>:<summaryFlag>"
      // Tanggal dikompres (lihat toCompactDate/fromCompactDate) supaya muat
      // jauh di bawah limit 64-byte Telegram tanpa perlu tabel pending baru.
      else if (actionData.startsWith("pdf_all:")) {
        const [, startCompact, endCompact, summaryFlag] = actionData.split(":");
        const userCtx = await resolveUserContext(chatId);
        if (!userCtx) {
          await answerTelegramCallback(queryId, tr("cbExpired", lang));
          res.status(200).json({ ok: true }); return;
        }
        await answerTelegramCallback(queryId);
        await editTelegramMessage(chatId, msgId, tr("pdfGenerating", lang));
        try {
          await generateAndSendPdf(
            chatId, userCtx.id, userCtx.display_name, lang,
            fromCompactDate(startCompact), fromCompactDate(endCompact),
            summaryFlag === "1", null, null
          );
        } catch (err: any) {
          console.error("pdf_all error:", err);
          await sendTelegramMessage(chatId, tr("riwayatError", lang));
        }
      }
      else if (actionData.startsWith("pdf_wallet:")) {
        const [, startCompact, endCompact, summaryFlag] = actionData.split(":");
        const wallets = await getTelegramWalletList(chatId);
        if (wallets.length === 0) {
          await answerTelegramCallback(queryId, tr("cbExpired", lang));
          res.status(200).json({ ok: true }); return;
        }
        await editTelegramMessage(
          chatId, msgId, tr("editWalletPrompt", lang),
          buildWalletKeyboard(wallets, lang, `pdf_setwallet:${startCompact}:${endCompact}:${summaryFlag}:`, `pdf_wallet_cancel:${startCompact}:${endCompact}:${summaryFlag}`)
        );
        await answerTelegramCallback(queryId);
      }
      else if (actionData.startsWith("pdf_setwallet:")) {
        const [, startCompact, endCompact, summaryFlag, walletIndexStr] = actionData.split(":");
        const wallets = await getTelegramWalletList(chatId);
        const selectedWallet = wallets[parseInt(walletIndexStr, 10)];
        const userCtx = await resolveUserContext(chatId);
        if (!selectedWallet || !userCtx) {
          await answerTelegramCallback(queryId, tr("cbExpired", lang));
          res.status(200).json({ ok: true }); return;
        }
        await answerTelegramCallback(queryId);
        await editTelegramMessage(chatId, msgId, tr("pdfGenerating", lang));
        try {
          await generateAndSendPdf(
            chatId, userCtx.id, userCtx.display_name, lang,
            fromCompactDate(startCompact), fromCompactDate(endCompact),
            summaryFlag === "1", selectedWallet.id, walletDisplayLabel(selectedWallet)
          );
        } catch (err: any) {
          console.error("pdf_setwallet error:", err);
          await sendTelegramMessage(chatId, tr("riwayatError", lang));
        }
      }
      else if (actionData.startsWith("pdf_wallet_cancel:")) {
        const [, startCompact, endCompact, summaryFlag] = actionData.split(":");
        await editTelegramMessage(chatId, msgId, tr("pdfChooseWalletPrompt", lang), {
          inline_keyboard: [
            [{ text: tr("btnPdfAllWallets", lang), callback_data: `pdf_all:${startCompact}:${endCompact}:${summaryFlag}` }],
            [{ text: tr("btnPdfPickWallet", lang), callback_data: `pdf_wallet:${startCompact}:${endCompact}:${summaryFlag}` }]
          ]
        });
        await answerTelegramCallback(queryId);
      }
      // Language selection
      else if (actionData === "set_lang_id" || actionData === "set_lang_en") {
        const newLang = actionData === "set_lang_id" ? "id" : "en";
        await supabaseBackend.from("telegram_users").upsert({
          chat_id: chatId,
          preferred_language: newLang,
          updated_at: new Date().toISOString()
        }, { onConflict: "chat_id" });

        await answerTelegramCallback(queryId, tr("cbLangSet", newLang));
        // Update the original message to show next steps in the chosen language
        await editTelegramMessage(chatId, msgId, tr("start", newLang));
      }
      // Tombol "Tandai Lunas" pada pesan reminder tagihan (lihat
      // supabase/functions/bill-reminder-notifier). Dipisah dari alur
      // tx_/rcpt_ karena sumbernya bukan draft AI tapi baris bill_reminders
      // yang sudah ada. Sejak fitur auto-insert transaksi ditambahkan
      // (lihat migration 20260710000000), tombol ini sekarang menampilkan
      // konfirmasi dulu (karena akan mengubah saldo & riwayat transaksi),
      // bukan langsung eksekusi seperti sebelumnya.
      else if (actionData.startsWith("bill_paid:")) {
        const billId = actionData.split(":")[1];
        const { data: bill, error: fetchErr } = await supabaseBackend
          .from("bill_reminders")
          .select("id, name, amount, is_paid")
          .eq("id", billId)
          .maybeSingle();

        if (fetchErr || !bill) {
          await answerTelegramCallback(queryId, tr("billAlreadyPaidOrNotFound", lang));
          res.status(200).json({ ok: true }); return;
        }
        if (bill.is_paid) {
          await answerTelegramCallback(queryId, tr("billAlreadyPaidOrNotFound", lang));
          res.status(200).json({ ok: true }); return;
        }

        const confirmKeyboard = {
          inline_keyboard: [[
            { text: tr("billBtnConfirmPaid", lang), callback_data: `bill_confirm_paid:${billId}` },
            { text: tr("billBtnCancelPaid", lang), callback_data: `bill_cancel_paid:${billId}` }
          ]]
        };

        const confirmText = bill.amount != null
          ? tr("billMarkPaidConfirmPrompt", lang, bill.name, formatIDR(bill.amount))
          : tr("billMarkPaidConfirmPromptNoAmount", lang, bill.name);

        await answerTelegramCallback(queryId);
        await editTelegramMessage(chatId, msgId, confirmText, confirmKeyboard);
      }
      else if (actionData.startsWith("bill_confirm_paid:")) {
        const billId = actionData.split(":")[1];
        const { data: updated, error: markErr } = await supabaseBackend.rpc("mark_bill_paid_via_bot", {
          p_chat_id: chatId,
          p_bill_id: billId
        });

        if (markErr || !updated || updated.length === 0) {
          // Bill sudah lunas lebih dulu (mis. ditandai dari web) atau tidak
          // ditemukan -- bukan error fatal, cukup beri tahu lewat callback toast.
          await answerTelegramCallback(queryId, tr("billAlreadyPaidOrNotFound", lang));
          await editTelegramMessage(chatId, msgId, tr("billAlreadyPaidOrNotFound", lang));
          res.status(200).json({ ok: true }); return;
        }

        const row = updated[0];
        await answerTelegramCallback(queryId, tr("billMarkPaidSuccess", lang));
        if (row.needs_manual_amount) {
          // Amount NULL -> tidak ada transaksi otomatis. Arahkan user untuk
          // mencatat transaksinya sendiri lewat chat (pola input transaksi
          // teks bebas yang sudah ada), bukan lewat draft khusus baru.
          await editTelegramMessage(chatId, msgId, tr("billMarkPaidConfirmedNoAmount", lang, row.name));
        } else {
          await editTelegramMessage(chatId, msgId, tr("billMarkPaidConfirmed", lang, row.name));
        }
      }
      else if (actionData.startsWith("bill_cancel_paid:")) {
        await answerTelegramCallback(queryId, tr("cbCancelled", lang));
        await editTelegramMessage(chatId, msgId, tr("msgCancelled", lang));
      }

      res.status(200).json({ ok: true }); return;
    }

    // ──────────────────────────────────────────────────────────
    // MESSAGE HANDLER
    // ──────────────────────────────────────────────────────────
    if (update.message) {
      const chatId = update.message.chat.id;
      const text   = (update.message.text || "").trim();

      // Handle photos (Receipt Scan)
      if (update.message.photo && update.message.photo.length > 0) {
        await handleReceiptPhoto(update.message, maintenanceStatus);
        res.status(200).json({ ok: true });
        return;
      }

      // Handle voice notes (quick transaction logging via speech)
      if (update.message.voice) {
        await handleVoiceNote(update.message, maintenanceStatus);
        res.status(200).json({ ok: true });
        return;
      }

      if (!text) { res.status(200).json({ ok: true }); return; }

      const lang = await resolveLangOnly(chatId);

      // 1. COMMAND: /start
      if (text.startsWith("/start")) {
        const langKeyboard = {
          inline_keyboard: [
            [
              { text: "Bahasa Indonesia", callback_data: "set_lang_id" },
              { text: "English", callback_data: "set_lang_en" }
            ]
          ]
        };
        await sendTelegramMessage(chatId, tr("langPrompt", lang), langKeyboard);
        res.status(200).json({ ok: true }); return;
      }

      // 2. COMMAND: /help
      if (text.startsWith("/help")) {
        await sendTelegramMessage(chatId, tr("help", lang));
        res.status(200).json({ ok: true }); return;
      }

      // 3. COMMAND: /link <code>
      if (text.startsWith("/link")) {
        // Maintenance gate: /link maps to "new_transaction" as it is a write operation
        // that enables the core bot logic.
        if (isFeatureLocked(maintenanceStatus, "new_transaction")) {
          await respondFeatureUnderMaintenance(chatId, lang, getMaintenanceMessage(maintenanceStatus, lang));
          res.status(200).json({ ok: true }); return;
        }

        const parts = text.split(" ");
        if (parts.length < 2) {
          await sendTelegramMessage(chatId, tr("linkBadFormat", lang));
          res.status(200).json({ ok: true }); return;
        }

        const code = parts[1];

        // Brute force protection — lockout state now lives in Postgres
        // (telegram_link_attempts), not in this process's memory, so it
        // survives across serverless instances/cold starts.
        const { data: lockedUntil, error: lockoutCheckError } = await supabaseBackend.rpc(
          "get_telegram_link_lockout",
          { p_chat_id: chatId }
        );

        if (!lockoutCheckError && lockedUntil) {
          const remaining = Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 60000);
          await sendTelegramMessage(chatId, tr("linkLockedOut", lang, remaining));
          res.status(200).json({ ok: true }); return;
        }

        try {
          const { data, error } = await supabaseBackend.rpc("link_telegram_account", {
            p_chat_id: chatId,
            p_link_code: code
          });

          // Record the outcome atomically: increments + (re-)applies the
          // lockout on failure, clears all state on success.
          const { error: recordError } = await supabaseBackend.rpc("record_telegram_link_attempt", {
            p_chat_id: chatId,
            p_success: !error,
            p_max_attempts: LINK_MAX_ATTEMPTS,
            p_lockout_seconds: LINK_LOCKOUT_SECONDS
          });
          if (recordError) {
            console.error("Failed to record /link attempt outcome:", recordError);
          }

          if (error) {
            await sendTelegramMessage(chatId, tr("linkFailed", lang, error.message || tr("linkInvalidCodeFallback", lang)));
          } else {
            const userDisplay = data?.[0]?.display_name || "User";
            await sendTelegramMessage(chatId, tr("linkSuccess", lang, userDisplay));
          }
        } catch (err: any) {
          await sendTelegramMessage(chatId, tr("linkInternalError", lang, err.message));
        }

        res.status(200).json({ ok: true }); return;
      }

      // 4. COMMAND: /unlink
      if (text.startsWith("/unlink")) {
        try {
          const { error } = await supabaseBackend.from("telegram_users").delete().eq("chat_id", chatId);
          if (error) {
            await sendTelegramMessage(chatId, tr("unlinkFailed", lang, error.message));
          } else {
            await sendTelegramMessage(chatId, tr("unlinkSuccess", lang));
          }
        } catch (err: any) {
          await sendTelegramMessage(chatId, tr("unlinkFailed", lang, err.message));
        }
        res.status(200).json({ ok: true }); return;
      }

      // 5. COMMAND: /saldo
      if (text.startsWith("/saldo")) {
        try {
          const userCtx = await resolveUserContext(chatId);
          if (!userCtx) {
            await sendTelegramMessage(chatId, tr("saldoNotLinked", lang));
            res.status(200).json({ ok: true }); return;
          }

          // Fetch dashboard summary via existing RPC
          const { data, error } = await supabaseBackend.rpc("get_dashboard_summary", { p_user_id: userCtx.id });
          if (error) throw error;

          const stats = data[0];
          const incStr = formatIDR(stats.income_total);
          const expStr = formatIDR(stats.expense_total);
          const balStr = formatIDR(stats.balance);

          // Comparative data
          const prevIncStr = formatIDR(stats.prev_income_total || 0);
          const prevExpStr = formatIDR(stats.prev_expense_total || 0);

          let diffIcon = "";
          let diffPct = "0%";

          if (stats.prev_expense_total > 0) {
            const ratio = stats.expense_total / stats.prev_expense_total;
            const pct = Math.abs(Math.round((ratio - 1) * 100));
            diffPct = `${pct}%`;
            if (ratio > 1.1) {
              diffIcon = ""; // Spending significantly more (>10% increase)
            } else if (ratio < 0.9) {
              diffIcon = ""; // Spending significantly less (>10% decrease)
            }
          }

          await sendTelegramMessage(
            chatId,
            tr("saldoSummary", lang, userCtx.display_name, incStr, expStr, balStr, prevIncStr, prevExpStr, diffIcon, diffPct)
          );

        } catch (err: any) {
          console.error("/saldo error:", err);
          await sendTelegramMessage(chatId, tr("saldoError", lang));
        }
        res.status(200).json({ ok: true }); return;
      }

      // 6. COMMAND: /riwayat
      if (text.startsWith("/riwayat")) {
        try {
          const userCtx = await resolveUserContext(chatId);
          if (!userCtx) {
            await sendTelegramMessage(chatId, tr("riwayatNotLinked", lang));
            res.status(200).json({ ok: true }); return;
          }

          // Fetch last 5 transactions (wallets(...) = embedded join lewat FK
          // transactions.wallet_id -> wallets.id, biar sekalian dapat nama posnya)
          const { data, error } = await supabaseBackend
            .from("transactions")
            .select("type, amount, category, note, transaction_date, wallets(name, type, provider)")
            .eq("user_id", userCtx.id)
            .order("created_at", { ascending: false })
            .limit(5);

          if (error) throw error;

          if (!data || data.length === 0) {
            await sendTelegramMessage(chatId, tr("riwayatEmpty", lang));
          } else {
            let msg = tr("riwayatHeader", lang);
            for (const tx of data as any[]) {
              const icon = tx.type === "income" ? "" : "";
              const catLabel = await getCategoryLabel(tx.category, lang);
              const walletTag = tx.wallets ? ` (${walletDisplayLabel(tx.wallets)})` : "";
              msg += `${icon} *${formatIDR(tx.amount)}*\n` +
                     `└ _${catLabel}_${walletTag} · ${tx.note || '-'}\n\n`;
            }
            msg += tr("riwayatFooter", lang);
            await sendTelegramMessage(chatId, msg);
          }
        } catch (err: any) {
          console.error("/riwayat error:", err);
          await sendTelegramMessage(chatId, tr("riwayatError", lang));
        }
        res.status(200).json({ ok: true }); return;
      }

      // 6.5 COMMAND: /hargaemas — cek harga emas terkini (read-only, tidak
      //     perlu akun ditautkan, sama seperti /help & /start).
      if (text.startsWith("/hargaemas")) {
        try {
          const { data: rows, error } = await supabaseBackend
            .from("gold_prices")
            .select("brand, sell_price_per_gram, buyback_price_per_gram, price_date, fetched_at")
            .in("brand", GOLD_PRICE_ACTIVE_BRANDS)
            .order("price_date", { ascending: false })
            .order("fetched_at", { ascending: false });

          if (error) throw error;

          if (!rows || rows.length === 0) {
            await sendTelegramMessage(chatId, tr("hargaEmasEmpty", lang));
            res.status(200).json({ ok: true }); return;
          }

          // Ambil baris terbaru per brand (rows sudah terurut DESC, jadi
          // kemunculan pertama per brand = yang paling baru).
          const latestByBrand = new Map<string, typeof rows[number]>();
          for (const row of rows as any[]) {
            if (!latestByBrand.has(row.brand)) latestByBrand.set(row.brand, row);
          }

          // "Harga terbaru per: ..." pakai price_date paling baru di antara
          // semua brand yang berhasil diambil (sama seperti headline di web).
          const newestDate = [...latestByBrand.values()]
            .map(r => r.price_date)
            .sort()
            .at(-1)!;

          // Staleness guard: sama seperti _get_fresh_gold_price di DB, kalau
          // sinkronisasi terakhir sudah lebih lama dari ambang batas, kasih
          // peringatan supaya user tidak salah kira harga ini masih akurat.
          const { data: staleSetting } = await supabaseBackend
            .from("app_settings")
            .select("value")
            .eq("key", "gold_price_staleness_hours")
            .maybeSingle();
          const stalenessHours = Number(staleSetting?.value ?? 60);
          const newestFetchedAt = [...latestByBrand.values()]
            .map(r => new Date(r.fetched_at).getTime())
            .sort((a, b) => b - a)[0];
          const isStale = Date.now() - newestFetchedAt > stalenessHours * 60 * 60 * 1000;

          let msg = tr("hargaEmasHeader", lang, newestDate);
          for (const brand of GOLD_PRICE_ACTIVE_BRANDS) {
            const row = latestByBrand.get(brand);
            if (!row) continue;
            const label = GOLD_BRAND_LABELS[brand] || brand;
            const buybackStr = row.buyback_price_per_gram != null
              ? formatIDR(row.buyback_price_per_gram)
              : "-";
            msg += `• *${label}*\n` +
                   `  Jual: *${formatIDR(row.sell_price_per_gram)}*/gr · Buyback: ${buybackStr}/gr\n\n`;
          }
          if (isStale) msg += tr("hargaEmasStaleWarning", lang);
          msg += tr("hargaEmasFooter", lang);

          await sendTelegramMessage(chatId, msg);
        } catch (err: any) {
          console.error("/hargaemas error:", err);
          await sendTelegramMessage(chatId, tr("hargaEmasError", lang));
        }
        res.status(200).json({ ok: true }); return;
      }

      // COMMAND: /pdf
      if (text.startsWith("/pdf")) {
        try {
          const userCtx = await resolveUserContext(chatId);
          if (!userCtx) {
            await sendTelegramMessage(chatId, tr("riwayatNotLinked", lang));
            res.status(200).json({ ok: true }); return;
          }

          // Extract arguments after /pdf
          const argsText = text.substring(4).trim();
          
          let summaryOnly = false;
          let remainingArgs = argsText;

          // Check if "ringkasan" is in the arguments (case-insensitive)
          if (/\bringkasan\b/i.test(argsText)) {
            summaryOnly = true;
            // Remove "ringkasan" from remaining arguments
            remainingArgs = argsText.replace(/\bringkasan\b/i, "").trim();
          }

          // Now determine date range
          let startDate: Date;
          let endDate: Date;
          // periodLabel yang enak dibaca (nama bulan / rentang ISO) dibangun
          // ulang dari startDate/endDate lewat buildPdfPeriodLabel() -- baik
          // di sini (dipakai untuk tombol) maupun saat callback pdf_all /
          // pdf_setwallet diproses nanti, jadi tidak perlu disimpan di sini.

          if (remainingArgs === "") {
            // Default to current month: from 1st of current month to today
            const now = new Date();
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = now;
          } else if (/^\d{4}$/.test(remainingArgs)) {
            // Specific month MMYY (e.g. 0126)
            const month = parseInt(remainingArgs.substring(0, 2), 10);
            const yearShort = parseInt(remainingArgs.substring(2, 4), 10);
            
            if (month < 1 || month > 12) {
              await sendTelegramMessage(chatId, tr("pdfInvalidMonth", lang));
              res.status(200).json({ ok: true }); return;
            }
            
            const year = 2000 + yearShort;
            startDate = new Date(year, month - 1, 1);
            endDate = new Date(year, month, 0, 23, 59, 59, 999);
          } else if (/^\d{8}\s*-\s*\d{8}$/.test(remainingArgs)) {
            // Specific range DDMMYYYY - DDMMYYYY
            const parts = remainingArgs.split("-").map(p => p.trim());
            const startStr = parts[0];
            const endStr = parts[1];
            
            // Validate and parse start date
            const startDay = parseInt(startStr.substring(0, 2), 10);
            const startMonth = parseInt(startStr.substring(2, 4), 10);
            const startYear = parseInt(startStr.substring(4, 8), 10);
            
            if (startMonth < 1 || startMonth > 12 || startDay < 1 || startDay > 31) {
              await sendTelegramMessage(chatId, tr("pdfInvalidDate", lang, startStr));
              res.status(200).json({ ok: true }); return;
            }
            
            startDate = new Date(startYear, startMonth - 1, startDay);
            if (startDate.getFullYear() !== startYear || startDate.getMonth() !== startMonth - 1 || startDate.getDate() !== startDay) {
              await sendTelegramMessage(chatId, tr("pdfInvalidDate", lang, startStr));
              res.status(200).json({ ok: true }); return;
            }
            
            // Validate and parse end date
            const endDay = parseInt(endStr.substring(0, 2), 10);
            const endMonth = parseInt(endStr.substring(2, 4), 10);
            const endYear = parseInt(endStr.substring(4, 8), 10);
            
            if (endMonth < 1 || endMonth > 12 || endDay < 1 || endDay > 31) {
              await sendTelegramMessage(chatId, tr("pdfInvalidDate", lang, endStr));
              res.status(200).json({ ok: true }); return;
            }
            
            endDate = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);
            if (endDate.getFullYear() !== endYear || endDate.getMonth() !== endMonth - 1 || endDate.getDate() !== endDay) {
              await sendTelegramMessage(chatId, tr("pdfInvalidDate", lang, endStr));
              res.status(200).json({ ok: true }); return;
            }
            
            if (startDate > endDate) {
              await sendTelegramMessage(chatId, tr("pdfRangeInvalid", lang));
              res.status(200).json({ ok: true }); return;
            }

            // maksimal 3 bulan
            const maxEnd = new Date(startDate);
            maxEnd.setMonth(maxEnd.getMonth() + 3);

            if (endDate > maxEnd) {
              await sendTelegramMessage(chatId, tr("pdfRangeTooLong", lang));
              res.status(200).json({ ok: true }); return;
            }
          } else {
            // Unrecognized argument format (e.g. /pdf abc or /pdf 99999999)
            await sendTelegramMessage(chatId, tr("pdfInvalidFormat", lang));
            res.status(200).json({ ok: true }); return;
          }

          // Tampilkan pilihan pos dompet dulu sebelum generate -- tanggal
          // dikompresi ke YYYYMMDD supaya callback_data tetap pendek, dan
          // periodLabel dibangun ulang dari tanggal itu (lihat buildPdfPeriodLabel)
          // baik di sini maupun saat callback pdf_all/pdf_setwallet diproses,
          // jadi tidak perlu tabel "pending" tambahan di DB.
          const startCompact = toCompactDate(startDate);
          const endCompact = toCompactDate(endDate);
          const summaryFlag = summaryOnly ? "1" : "0";

          await sendTelegramMessage(chatId, tr("pdfChooseWalletPrompt", lang), {
            inline_keyboard: [
              [{ text: tr("btnPdfAllWallets", lang), callback_data: `pdf_all:${startCompact}:${endCompact}:${summaryFlag}` }],
              [{ text: tr("btnPdfPickWallet", lang), callback_data: `pdf_wallet:${startCompact}:${endCompact}:${summaryFlag}` }]
            ]
          });

        } catch (err: any) {
          console.error("/pdf error:", err);
          await sendTelegramMessage(chatId, tr("riwayatError", lang));
        }
        res.status(200).json({ ok: true }); return;
      }

      // 7. COMMAND: /hapus
      if (text.startsWith("/hapus")) {
        try {
          const userCtx = await resolveUserContext(chatId);
          if (!userCtx) {
            await sendTelegramMessage(chatId, tr("hapusNotLinked", lang));
            res.status(200).json({ ok: true }); return;
          }

          // Get last transaction first for the confirmation message
          const { data: lastTx } = await supabaseBackend
            .from("transactions")
            .select("*")
            .eq("user_id", userCtx.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          if (!lastTx) {
            await sendTelegramMessage(chatId, tr("hapusNone", lang));
            res.status(200).json({ ok: true }); return;
          }

          // Delete it
          const { error: delErr } = await supabaseBackend
            .from("transactions")
            .delete()
            .eq("id", lastTx.id);

          if (delErr) throw delErr;

          const typeLabel = lastTx.type === "income" ? tr("txTypeIncome", lang) : tr("txTypeExpense", lang);
          const catLabel  = await getCategoryLabel(lastTx.category, lang);

          await sendTelegramMessage(chatId, tr("hapusSuccess", lang, typeLabel, catLabel, formatIDR(lastTx.amount), lastTx.note || "-"));

        } catch (err: any) {
          console.error("/hapus error:", err);
          await sendTelegramMessage(chatId, tr("hapusError", lang, err.message));
        }
        res.status(200).json({ ok: true }); return;
      }

      // DEFAULT: Handle as financial natural language query
      const userCtx = await resolveUserContext(chatId);
      if (!userCtx) {
        await sendTelegramMessage(chatId, tr("notLinkedForTx", lang));
        res.status(200).json({ ok: true }); return;
      }

      // Maintenance gate: pencatatan transaksi natural language masuk ke fitur "new_transaction".
      if (isFeatureLocked(maintenanceStatus, "new_transaction")) {
        await respondFeatureUnderMaintenance(chatId, lang, getMaintenanceMessage(maintenanceStatus, lang));
        res.status(200).json({ ok: true }); return;
      }

      await sendTelegramMessage(chatId, tr("analyzing", lang));

      try {
        const parsed = await parseFinancialQuery(text);

        if (parsed.amount <= 0) {
          await sendTelegramMessage(chatId, tr("amountNotDetected", lang));
          res.status(200).json({ ok: true }); return;
        }

        const { error: upsertErr } = await supabaseBackend.rpc("upsert_pending_telegram_tx", {
          p_chat_id: chatId,
          p_type: parsed.type,
          p_category_key: parsed.category_key,
          p_amount: parsed.amount,
          p_original_text: parsed.original_text
        });

        if (upsertErr) {
          console.error("RPC upsert_pending_telegram_tx error:", upsertErr);
          await sendTelegramMessage(chatId, tr("draftSaveError", lang));
          res.status(200).json({ ok: true }); return;
        }

        const localizedCat = await getCategoryLabel(parsed.category_key, lang);
        const currencyStr  = formatIDR(parsed.amount);
        const typeLabel    = parsed.type === "income" ? tr("txTypeIncome", lang) : tr("txTypeExpense", lang);

        const draftMarkup = buildDraftKeyboard(lang);

        const { data: freshDraft } = await supabaseBackend.rpc("get_pending_telegram_tx", { p_chat_id: chatId });
        const walletLabel = await getWalletLabelById(freshDraft?.[0]?.wallet_id ?? null);

        await sendTelegramMessage(
          chatId,
          tr("draftPrompt", lang, typeLabel, localizedCat, currencyStr, parsed.original_text, walletLabel),
          draftMarkup
        );

      } catch (parseError: any) {
        const errType = parseError?.name ?? "UnknownError";
        console.error(`parseFinancialQuery failed [${errType}]:`, parseError?.message ?? parseError);
        await sendTelegramMessage(chatId, tr("parseError", lang));
      }

      res.status(200).json({ ok: true }); return;
    }

    res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("Telegram Webhook Error:", err);
    await logError(supabaseBackend, {
      source: "telegram-webhook",
      level: "error",
      message: err?.message ? String(err.message) : "Unhandled error di telegram-webhook",
      context: { name: err?.name ?? null, stack: err?.stack ? String(err.stack).slice(0, 1000) : null },
    });
    res.status(500).json({ error: "Internal server error" });
  }
};