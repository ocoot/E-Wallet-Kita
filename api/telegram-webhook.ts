import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';
import { parseAmountFromString } from '../src/lib/parserUtils.js';
import { parseReceipt } from './_lib/receipt-parser.js';
import { createReceiptDraft, approveReceiptDraft, cancelReceiptDraft, getReceiptDraft, updateReceiptCategory } from './_lib/receipt-service.js';
import { getMaintenanceStatus, isFeatureLocked, getMaintenanceMessage, MaintenanceStatus } from './_lib/maintenance.js';
import { tr } from './_lib/botText.js';
import { inferCategoryKey } from './_lib/categoryInference.js';
import { sendTelegramMessage, editTelegramMessage, answerTelegramCallback } from './_lib/telegram.js';

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
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
  });
}


// ─────────────────────────────────────────────────────────────
// FIX #8: Rate limiting & lockout for /link command (brute force protection)
// ─────────────────────────────────────────────────────────────
interface LinkAttempt {
  attempts: number;
  lastAttempt: number;
  lockedUntil: number | null;
}

const linkRateLimiter = new Map<number, LinkAttempt>();
const LINK_MAX_ATTEMPTS = 5;        // 5 attempts
const LINK_WINDOW = 60 * 1000;      // per 60 seconds
const LINK_LOCKOUT = 15 * 60 * 1000; // 15-minute lockout after 5 failed attempts

// ─────────────────────────────────────────────────────────────
// PROCESSED UPDATES DEDUPLICATION CACHE (Telegram retry mitigation)
// ─────────────────────────────────────────────────────────────
const processedTelegramUpdates = new Map<number, number>(); // update_id -> timestamp

function isDuplicateTelegramUpdate(updateId: number): boolean {
  const now = Date.now();
  // Clear old entries (> 20 minutes)
  for (const [id, ts] of processedTelegramUpdates.entries()) {
    if (now - ts > 20 * 60 * 1000) {
      processedTelegramUpdates.delete(id);
    }
  }
  if (processedTelegramUpdates.has(updateId)) {
    return true;
  }
  processedTelegramUpdates.set(updateId, now);
  return false;
}

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
      ]
    ]
  };
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
      console.error(`❌ Gemini parseFinancialQuery failed on model "${model}":`, err?.message ?? err);
      // try the next model in the chain
      continue;
    }
  }

  // Every model in the chain failed — graceful fallback to local inference
  console.error("❌ All Gemini models in fallback chain failed. Last error:", lastError?.message ?? lastError);
  return {
    source: "fallback_gemini_error",
    type: /gaji|bonus|salary|upah|thr|sampingan|freelance|komisi/.test(query.toLowerCase()) ? "income" : "expense",
    category_key: inferCategoryKey(query),
    amount: codeParsedAmount,
    original_text: query
  };
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
    ? "🔄 _Sedang mengunduh foto struk belanja Anda..._" 
    : "🔄 _Downloading receipt photo..._";
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
      ? "🤖 _Gemini sedang mengekstrak detail struk Anda..._" 
      : "🤖 _Gemini is extracting receipt details..._");

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
    let itemLines = "";
    if (receipt.items && receipt.items.length > 0) {
      receipt.items.forEach((it: any) => {
        itemLines += `• *${it.name}*\n  Qty ${it.qty} · ${formatIDR(it.unit_price)} (${formatIDR(it.subtotal)})\n`;
      });
    } else {
      itemLines += lang === "id" ? "_(Tidak ada rincian item)_\n" : "_(No itemized detail)_\n";
    }

    const receiptDateFormatted = receipt.receipt_date ? new Date(receipt.receipt_date).toLocaleDateString(lang === "id" ? "id-ID" : "en-US", {
      day: "numeric",
      month: "long",
      year: "numeric"
    }) : "-";

    const textPreview = lang === "id" 
      ? `🧾 *Hasil Pembacaan Struk (OCR-Gemini)* 🌸\n\n` +
        `*Toko*: ${receipt.merchant_name}\n` +
        `*Tanggal*: ${receiptDateFormatted}\n\n` +
        `*Rincian Barang*:\n${itemLines}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `*Total Belanja*: *${formatIDR(receipt.total_amount)}*\n\n` +
        `_Konfirmasi pencatatan pengeluaran di bawah ini:_`
      : `🧾 *Receipt Reading Result (OCR-Gemini)* 🌸\n\n` +
        `*Store*: ${receipt.merchant_name}\n` +
        `*Date*: ${receiptDateFormatted}\n` +
        `*Category*: ${await getCategoryLabel(draft.category || 'other', lang)}\n\n` +
        `*Itemized Detail*:\n${itemLines}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `*Total Cost*: *${formatIDR(receipt.total_amount)}*\n\n` +
        `_Confirm saving this expense below:_`;

    const inlineKeyboard = {
      inline_keyboard: [
        [
          { text: lang === "id" ? "✏️ Edit Kategori" : "✏️ Edit Category", callback_data: `rcpt_editcat:${draft.id}` }
        ],
        [
          { text: lang === "id" ? "✅ Simpan Transaksi" : "✅ Save Transaction", callback_data: `rcpt_approve:${draft.id}` },
          { text: lang === "id" ? "❌ Batal" : "❌ Cancel", callback_data: `rcpt_cancel:${draft.id}` }
        ]
      ]
    };

    await sendTelegramMessage(chatId, textPreview, inlineKeyboard);

  } catch (err: any) {
    console.error("❌ handleReceiptPhoto error:", err);
    await sendTelegramMessage(chatId, lang === "id" 
      ? `❌ *Gagal Membaca Foto Struk*\n_Penyebab: ${err.message || 'Error internal parser struk'}_`
      : `❌ *Failed to Process Receipt Photo*\n_Reason: ${err.message || 'Internal parser error'}_`);
  }
}

// ─────────────────────────────────────────────────────────────
// MAIN WEBHOOK HANDLER
// ─────────────────────────────────────────────────────────────
export default async (req: VercelRequest, res: VercelResponse) => {
  // Auto-cleanup expired pending transactions
  await supabaseBackend.rpc("cleanup_expired_pending_transactions");

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (!secretToken) {
      console.error("🔴 TELEGRAM_WEBHOOK_SECRET is not configured — rejecting all webhook requests.");
      res.status(500).json({ error: "Webhook is not configured correctly" });
      return;
    }

    if (secretHeader !== secretToken) {
      console.warn("⚠️ Unauthorized Telegram Webhook request blocked");
      res.status(403).json({ error: "Unauthorized update request" });
      return;
    }

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
      if (isDuplicateTelegramUpdate(update.update_id)) {
        console.warn(`⚠️ Ignored duplicate Telegram retry update_id: ${update.update_id}`);
        res.status(200).json({ ok: true });
        return;
      }
    }

    // Safe logging (only log update type, not full payload)
    if (update.message?.text) {
      const textPreview = update.message.text.substring(0, 20);
      console.log(`📨 Telegram message: "${textPreview}..."`);
    } else if (update.callback_query) {
      console.log(`📨 Telegram callback: ${update.callback_query.data}`);
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

        await editTelegramMessage(
          chatId, msgId,
          tr("draftPrompt", lang, typeLabel, catLabel, amountStr, row.original_text),
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
          console.error("❌ confirm_pending_telegram_tx error:", saveErr);
          await answerTelegramCallback(queryId, tr("cbSaveFailed", lang));
          await editTelegramMessage(chatId, msgId, tr("msgSaveFailed", lang, saveErr.message));
        } else {
          const typeLabel = row.type === "income" ? tr("txTypeIncome", lang) : tr("txTypeExpense", lang);
          const catLabel  = await getCategoryLabel(row.category_key, lang);
          const amountStr = formatIDR(row.amount);

          await answerTelegramCallback(queryId, tr("cbSaveSuccess", lang));
          await editTelegramMessage(chatId, msgId, tr("msgSaveSuccess", lang, typeLabel, catLabel, amountStr, row.original_text));

          const userCtx = await resolveUserContext(chatId);
          if (userCtx) {
            await sendBudgetWarningIfNeeded(chatId, userCtx.id, row.category_key, row.type, lang);
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
        await editTelegramMessage(chatId, msgId, tr("draftPrompt", lang, typeLabel, catLabel, formatIDR(row.amount), row.original_text), buildDraftKeyboard(lang));
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
          await editTelegramMessage(chatId, msgId, tr("msgSaveSuccess", lang, typeLabel, catLabel, formatIDR(resApprove.draft.total_amount), resApprove.draft.merchant_name || 'Receipt Scan'));

          if (resApprove.transaction?.user_id) {
            await sendBudgetWarningIfNeeded(chatId, resApprove.transaction.user_id, resApprove.draft.category || 'other', 'expense', lang);
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
        // Minimal refresh - technically should re-render the whole receipt preview but for simplicity just answer
        await answerTelegramCallback(queryId, tr("cbCategoryUpdated", lang));
        // Trigger back to preview
        const categories = await getActiveCategories();
        const receipt = draft.raw_ai_response;
        let itemLines = "";
        if (receipt.items && receipt.items.length > 0) {
          receipt.items.forEach((it: any) => {
            itemLines += `• *${it.name}*\n  Qty ${it.qty} · ${formatIDR(it.unit_price)} (${formatIDR(it.subtotal)})\n`;
          });
        }
        const receiptDateFormatted = receipt.receipt_date ? new Date(receipt.receipt_date).toLocaleDateString(lang === "id" ? "id-ID" : "en-US", {
          day: "numeric", month: "long", year: "numeric"
        }) : "-";
        
        const textPreview = lang === "id" 
          ? `🧾 *Hasil Pembacaan Struk (OCR-Gemini)* 🌸\n\n` +
            `*Toko*: ${receipt.merchant_name}\n` +
            `*Tanggal*: ${receiptDateFormatted}\n` +
            `*Kategori*: ${catLabel}\n\n` +
            `*Rincian Barang*:\n${itemLines}\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `*Total Belanja*: *${formatIDR(receipt.total_amount)}*\n\n` +
            `_Konfirmasi pencatatan pengeluaran di bawah ini:_`
          : `🧾 *Receipt Reading Result (OCR-Gemini)* 🌸\n\n` +
            `*Store*: ${receipt.merchant_name}\n` +
            `*Date*: ${receiptDateFormatted}\n` +
            `*Category*: ${catLabel}\n\n` +
            `*Itemized Detail*:\n${itemLines}\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `*Total Cost*: *${formatIDR(receipt.total_amount)}*\n\n` +
            `_Confirm saving this expense below:_`;

        const inlineKeyboard = {
          inline_keyboard: [
            [{ text: lang === "id" ? "✏️ Edit Kategori" : "✏️ Edit Category", callback_data: `rcpt_editcat:${draftId}` }],
            [{ text: lang === "id" ? "✅ Simpan Transaksi" : "✅ Save Transaction", callback_data: `rcpt_approve:${draftId}` },
             { text: lang === "id" ? "❌ Batal" : "❌ Cancel", callback_data: `rcpt_cancel:${draftId}` }]
          ]
        };
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
        const receipt = draft.raw_ai_response;
        let itemLines = "";
        if (receipt.items && receipt.items.length > 0) {
          receipt.items.forEach((it: any) => {
            itemLines += `• *${it.name}*\n  Qty ${it.qty} · ${formatIDR(it.unit_price)} (${formatIDR(it.subtotal)})\n`;
          });
        }
        const receiptDateFormatted = receipt.receipt_date ? new Date(receipt.receipt_date).toLocaleDateString(lang === "id" ? "id-ID" : "en-US", {
          day: "numeric", month: "long", year: "numeric"
        }) : "-";
        const textPreview = lang === "id" 
          ? `🧾 *Hasil Pembacaan Struk (OCR-Gemini)* 🌸\n\n` +
            `*Toko*: ${receipt.merchant_name}\n` +
            `*Tanggal*: ${receiptDateFormatted}\n` +
            `*Kategori*: ${catLabel}\n\n` +
            `*Rincian Barang*:\n${itemLines}\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `*Total Belanja*: *${formatIDR(receipt.total_amount)}*\n\n` +
            `_Konfirmasi pencatatan pengeluaran di bawah ini:_`
          : `🧾 *Receipt Reading Result (OCR-Gemini)* 🌸\n\n` +
            `*Store*: ${receipt.merchant_name}\n` +
            `*Date*: ${receiptDateFormatted}\n` +
            `*Category*: ${catLabel}\n\n` +
            `*Itemized Detail*:\n${itemLines}\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `*Total Cost*: *${formatIDR(receipt.total_amount)}*\n\n` +
            `_Confirm saving this expense below:_`;
        const inlineKeyboard = {
          inline_keyboard: [
            [{ text: lang === "id" ? "✏️ Edit Kategori" : "✏️ Edit Category", callback_data: `rcpt_editcat:${draftId}` }],
            [{ text: lang === "id" ? "✅ Simpan Transaksi" : "✅ Save Transaction", callback_data: `rcpt_approve:${draftId}` },
             { text: lang === "id" ? "❌ Batal" : "❌ Cancel", callback_data: `rcpt_cancel:${draftId}` }]
          ]
        };
        await editTelegramMessage(chatId, msgId, textPreview, inlineKeyboard);
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
      // yang sudah ada -- tidak butuh tahap konfirmasi tambahan di bot
      // karena tombolnya sendiri sudah berfungsi sebagai konfirmasi (sesuai
      // permintaan: tombol tandai lunas langsung di Telegram tanpa user
      // perlu buka app).
      else if (actionData.startsWith("bill_paid:")) {
        const billId = actionData.split(":")[1];
        const { data: updated, error: markErr } = await supabaseBackend.rpc("mark_bill_paid_via_bot", {
          p_chat_id: chatId,
          p_bill_id: billId
        });

        if (markErr || !updated || updated.length === 0) {
          // Bill sudah lunas lebih dulu (mis. ditandai dari web) atau tidak
          // ditemukan -- bukan error fatal, cukup beri tahu lewat callback toast.
          await answerTelegramCallback(queryId, tr("billAlreadyPaidOrNotFound", lang));
          res.status(200).json({ ok: true }); return;
        }

        const row = updated[0];
        await answerTelegramCallback(queryId, tr("billMarkPaidSuccess", lang));
        await editTelegramMessage(chatId, msgId, tr("billMarkPaidConfirmed", lang, row.name));
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

      if (!text) { res.status(200).json({ ok: true }); return; }

      const lang = await resolveLangOnly(chatId);

      // 1. COMMAND: /start
      if (text.startsWith("/start")) {
        const langKeyboard = {
          inline_keyboard: [
            [
              { text: "🇮🇩 Bahasa Indonesia", callback_data: "set_lang_id" },
              { text: "🇺🇸 English", callback_data: "set_lang_en" }
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

        // Brute force protection
        const now = Date.now();
        const state = linkRateLimiter.get(chatId) || { attempts: 0, lastAttempt: 0, lockedUntil: null };

        if (state.lockedUntil && now < state.lockedUntil) {
          const remaining = Math.ceil((state.lockedUntil - now) / 60000);
          await sendTelegramMessage(chatId, tr("linkLockedOut", lang, remaining));
          res.status(200).json({ ok: true }); return;
        }

        try {
          const { data, error } = await supabaseBackend.rpc("link_telegram_account", {
            p_chat_id: chatId,
            p_link_code: code
          });

          if (error) {
            // Update rate limit state
            state.attempts++;
            state.lastAttempt = now;
            if (state.attempts >= LINK_MAX_ATTEMPTS) {
              state.lockedUntil = now + LINK_LOCKOUT;
            }
            linkRateLimiter.set(chatId, state);

            await sendTelegramMessage(chatId, tr("linkFailed", lang, error.message || tr("linkInvalidCodeFallback", lang)));
          } else {
            // Success
            linkRateLimiter.delete(chatId);
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

          let diffIcon = "✅";
          let diffPct = "0%";

          if (stats.prev_expense_total > 0) {
            const ratio = stats.expense_total / stats.prev_expense_total;
            const pct = Math.abs(Math.round((ratio - 1) * 100));
            diffPct = `${pct}%`;
            if (ratio > 1.1) {
              diffIcon = "⚠️"; // Spending significantly more (>10% increase)
            } else if (ratio < 0.9) {
              diffIcon = "✨"; // Spending significantly less (>10% decrease)
            }
          }

          await sendTelegramMessage(
            chatId,
            tr("saldoSummary", lang, userCtx.display_name, incStr, expStr, balStr, prevIncStr, prevExpStr, diffIcon, diffPct)
          );

        } catch (err: any) {
          console.error("❌ /saldo error:", err);
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

          // Fetch last 5 transactions
          const { data, error } = await supabaseBackend
            .from("transactions")
            .select("type, amount, category, note, transaction_date")
            .eq("user_id", userCtx.id)
            .order("created_at", { ascending: false })
            .limit(5);

          if (error) throw error;

          if (!data || data.length === 0) {
            await sendTelegramMessage(chatId, tr("riwayatEmpty", lang));
          } else {
            let msg = tr("riwayatHeader", lang);
            for (const tx of data) {
              const icon = tx.type === "income" ? "📥" : "📤";
              const catLabel = await getCategoryLabel(tx.category, lang);
              msg += `${icon} *${formatIDR(tx.amount)}*\n` +
                     `└ _${catLabel}_ · ${tx.note || '-'}\n\n`;
            }
            msg += tr("riwayatFooter", lang);
            await sendTelegramMessage(chatId, msg);
          }
        } catch (err: any) {
          console.error("❌ /riwayat error:", err);
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
          console.error("❌ /hapus error:", err);
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
          console.error("❌ RPC upsert_pending_telegram_tx error:", upsertErr);
          await sendTelegramMessage(chatId, tr("draftSaveError", lang));
          res.status(200).json({ ok: true }); return;
        }

        const localizedCat = await getCategoryLabel(parsed.category_key, lang);
        const currencyStr  = formatIDR(parsed.amount);
        const typeLabel    = parsed.type === "income" ? tr("txTypeIncome", lang) : tr("txTypeExpense", lang);

        const draftMarkup = buildDraftKeyboard(lang);

        await sendTelegramMessage(
          chatId,
          tr("draftPrompt", lang, typeLabel, localizedCat, currencyStr, parsed.original_text),
          draftMarkup
        );

      } catch (parseError: any) {
        const errType = parseError?.name ?? "UnknownError";
        console.error(`❌ parseFinancialQuery failed [${errType}]:`, parseError?.message ?? parseError);
        await sendTelegramMessage(chatId, tr("parseError", lang));
      }

      res.status(200).json({ ok: true }); return;
    }

    res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("🔴 Telegram Webhook Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};