import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';
import { parseAmountFromString } from '../src/lib/parserUtils.js';
import { parseReceipt } from './_lib/receipt-parser.js';
import { createReceiptDraft, approveReceiptDraft, cancelReceiptDraft, getReceiptDraft, updateReceiptCategory } from './_lib/receipt-service.js';
import { getMaintenanceStatus, isFeatureLocked, getMaintenanceMessage, MaintenanceStatus } from './_lib/maintenance.js';

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
// BOT TRANSLATIONS
// ─────────────────────────────────────────────────────────────
const botText = {
  start: {
    id: () =>
      `Halo! Selamat datang di *E-Wallet Kita Bot* 🌸\n\n` +
      `Saya adalah asisten pintar untuk mencatat keuangan Anda secepat mengirim chat!\n\n` +
      `Untuk mulai mencatat, silakan *tautkan akun* Anda terlebih dahulu:\n` +
      `1️⃣ Buka website *E-Wallet Kita*\n` +
      `2️⃣ Masuk ke halaman *Pengaturan (Settings)*\n` +
      `3️⃣ Cari bagian *Koneksi Bot Telegram* dan tekan *Buat Kode Tautan*\n` +
      `4️⃣ Kirim perintah tautan berikut di sini:\n` +
      `     \`/link <kode_5_digit>\` (Contoh: \`/link 12345\`)\n\n` +
      `💡 Ketik \`/help\` untuk informasi bantuan commands.`,
    en: () =>
      `Hello! Welcome to *E-Wallet Kita Bot* 🌸\n\n` +
      `I'm a smart assistant to track your finances as fast as sending a chat!\n\n` +
      `To get started, please *link your account* first:\n` +
      `1️⃣ Open the *E-Wallet Kita* website\n` +
      `2️⃣ Go to the *Settings* page\n` +
      `3️⃣ Find the *Telegram Bot Connection* section and tap *Generate Link Code*\n` +
      `4️⃣ Send the link command here:\n` +
      `     \`/link <5_digit_code>\` (Example: \`/link 12345\`)\n\n` +
      `💡 Type \`/help\` for command information.`,
  },
  help: {
    id: () =>
      `💡 *Panduan Asisten E-Wallet Kita Bot*:\n\n` +
      `1️⃣ *Koneksi Akun*:\n` +
      `     Ketik \`/link <kode_5_digit>\`\n` +
      `     Contoh: \`/link 58204\`\n\n` +
      `2️⃣ *Mencatat Keuangan* (Setelah Terhubung):\n` +
      `     Cukup tulis pesan chat apa saja tentang transaksi Anda!\n` +
      `     Contoh:\n` +
      `     • \`Makan siang bersama bu siska 45rb\`\n` +
      `     • \`Gaji sampingan jualan kue 1.2jt\`\n` +
      `     • \`Belanja sayur bayam 12k\`\n` +
      `     • \`Bayar tagihan listrik rumah 250rb\`\n\n` +
      `3️⃣ *Daftar Perintah (Commands)*:\n` +
      `     • \`/saldo\` - Ringkasan saldo & perbandingan bulan ini vs bulan lalu.\n` +
      `     • \`/riwayat\` - Tampilkan 5 transaksi terakhir.\n` +
      `     • \`/hapus\` - Batalkan & hapus transaksi terakhir.\n` +
      `     • \`/unlink\` - Memutuskan koneksi akun Telegram dari sistem.\n` +
      `     • \`/help\` - Membuka pesan bantuan ini.`,
    en: () =>
      `💡 *E-Wallet Kita Bot Guide*:\n\n` +
      `1️⃣ *Account Connection*:\n` +
      `     Type \`/link <5_digit_code>\`\n` +
      `     Example: \`/link 58204\`\n\n` +
      `2️⃣ *Recording Finances* (After Linking):\n` +
      `     Just write any chat message about your transaction!\n` +
      `     Examples:\n` +
      `     • \`Lunch with colleagues 45rb\`\n` +
      `     • \`Side income selling cakes 1.2jt\`\n` +
      `     • \`Bought vegetables 12k\`\n` +
      `     • \`Paid electricity bill 250rb\`\n\n` +
      `3️⃣ *Command List*:\n` +
      `     • \`/saldo\` - Balance summary & comparison vs last month.\n` +
      `     • \`/riwayat\` - Show last 5 transactions.\n` +
      `     • \`/hapus\` - Undo & delete the last transaction.\n` +
      `     • \`/unlink\` - Disconnect your Telegram account from the system.\n` +
      `     • \`/help\` - Show this help message.`,
  },
  // FIX #10: Language selection prompt on /start before /link
  langPrompt: {
    id: () => `🌐 Pilih bahasa / Choose language:`,
    en: () => `🌐 Pilih bahasa / Choose language:`,
  },
  linkBadFormat: {
    id: () => "⚠️ Format perintah salah. Silakan kirim dalam format: `/link <kode_5_digit>` - Contoh: `/link 12345`.",
    en: () => "⚠️ Invalid command format. Please send in the format: `/link <5_digit_code>` - Example: `/link 12345`.",
  },
  linkInternalError: {
    id: (msg: string) => `⚠️ Terjadi error internal saat menautkan akun: ${msg}`,
    en: (msg: string) => `⚠️ An internal error occurred while linking your account: ${msg}`,
  },
  linkSuccess: {
    id: (displayName: string) =>
      `🎉 *Tautan Akun Berhasil Terhubung!* ✅\n\n` +
      `Halo, *${displayName}*! Chat ini sekarang aman terhubung dengan aplikasi *E-Wallet Kita*.\n\n` +
      `Sekarang Anda sudah bisa langsung melakukan pencatatan keuangan otomatis. Silakan tulis transaksi pertama Anda!`,
    en: (displayName: string) =>
      `🎉 *Account Successfully Linked!* ✅\n\n` +
      `Hello, *${displayName}*! This chat is now securely linked to the *E-Wallet Kita* app.\n\n` +
      `You can now record your finances automatically. Go ahead and write your first transaction!`,
  },
  linkFailed: {
    id: (errMsg: string) => `❌ *Gagal Tertaut*\n\n${errMsg}`,
    en: (errMsg: string) => `❌ *Linking Failed*\n\n${errMsg}`,
  },
  linkInvalidCodeFallback: {
    id: () => "Kode tautan tidak valid atau telah kedaluwarsa.",
    en: () => "The link code is invalid or has expired.",
  },
  linkLockedOut: {
    id: (minutes: number) => `🔐 *Brute Force Terdeteksi*\n\nAnda telah melebihi batas percobaan penautan akun. Silakan coba lagi setelah ${minutes} menit.`,
    en: (minutes: number) => `🔐 *Brute Force Detected*\n\nYou have exceeded the maximum account linking attempts. Please try again in ${minutes} minutes.`,
  },
  unlinkFailed: {
    id: (msg: string) => `❌ Gagal memutuskan tautan: ${msg}`,
    en: (msg: string) => `❌ Failed to unlink account: ${msg}`,
  },
  unlinkSuccess: {
    id: () => "👋 *Koneksi bot Telegram dibatalkan.* Hubungan chat ini dengan E-Wallet Kita berhasil diputuskan.",
    en: () => "👋 *Telegram bot connection removed.* This chat has been successfully unlinked from E-Wallet Kita.",
  },
  saldoError: {
    id: () => "⚠️ Terjadi kesalahan internal saat memuat data saldo.",
    en: () => "⚠️ An internal error occurred while loading your balance data.",
  },
  saldoNotLinked: {
    id: () => "⚠️ *Akun belum terhubung.* Silakan hubungkan Telegram Anda terlebih dahulu menggunakan perintah `/link <kode>`.",
    en: () => "⚠️ *Account not linked.* Please link your Telegram first using the `/link <code>` command.",
  },
  // FIX #11 (saldo): Now includes last-month comparison
  saldoSummary: {
    id: (
      displayName: string,
      incStr: string, expStr: string, balStr: string,
      prevIncStr: string, prevExpStr: string,
      expDiffIcon: string, expDiffPct: string
    ) =>
      `📊 *Ringkasan Keuangan Bulan Ini* 🌸\n\n` +
      `Halo, *${displayName}*!\n\n` +
      `*— Bulan Ini —*\n` +
      `• *Total Pemasukan*: 📥 \`${incStr}\`\n` +
      `• *Total Pengeluaran*: 📤 \`${expStr}\`\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• *Saldo Tabungan*: 💰 *${balStr}*\n\n` +
      `*— Bulan Lalu —*\n` +
      `• Pemasukan: \`${prevIncStr}\`\n` +
      `• Pengeluaran: \`${prevExpStr}\`\n\n` +
      `${expDiffIcon} Pengeluaran bulan ini *${expDiffPct}* dibanding bulan lalu.\n\n` +
      `_Gunakan bot ini untuk terus merekam transaksi harian secara praktis!_`,
    en: (
      displayName: string,
      incStr: string, expStr: string, balStr: string,
      prevIncStr: string, prevExpStr: string,
      expDiffIcon: string, expDiffPct: string
    ) =>
      `📊 *This Month's Financial Summary* 🌸\n\n` +
      `Hello, *${displayName}*!\n\n` +
      `*— This Month —*\n` +
      `• *Total Income*: 📥 \`${incStr}\`\n` +
      `• *Total Expense*: 📤 \`${expStr}\`\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• *Net Balance*: 💰 *${balStr}*\n\n` +
      `*— Last Month —*\n` +
      `• Income: \`${prevIncStr}\`\n` +
      `• Expense: \`${prevExpStr}\`\n\n` +
      `${expDiffIcon} Spending this month is *${expDiffPct}* vs last month.\n\n` +
      `_Keep using this bot to conveniently track your daily transactions!_`,
  },
  unknownCommand: {
    id: () => "⚠️ Perintah tidak dikenali. Silakan ketik `/help` untuk bantuan.",
    en: () => "⚠️ Unrecognized command. Please type `/help` for assistance.",
  },
  profileLookupError: {
    id: () => "⚠️ Terjadi kegagalan pencarian profil akun.",
    en: () => "⚠️ Failed to look up your account profile.",
  },
  notLinkedForTx: {
    id: () =>
      `⚠️ *Akun Belum Terhubung*\n\n` +
      `Maaf, kami tidak bisa mencatat transaksi Anda karena chat ini belum terhubung ke akun mana pun.\n\n` +
      `Silakan ketik \`/link <kode_5_digit>\` untuk menautkan akun.`,
    en: () =>
      `⚠️ *Account Not Linked*\n\n` +
      `Sorry, we can't record your transaction because this chat isn't linked to any account yet.\n\n` +
      `Please type \`/link <5_digit_code>\` to link your account.`,
  },
  analyzing: {
    id: () => "🔄 _Sedang menganalisis catatan keuangan Anda..._",
    en: () => "🔄 _Analyzing your financial note..._",
  },
  amountNotDetected: {
    id: () =>
      `⚠️ *Gagal Membaca Nominal*\n\n` +
      `Nominal angka uang tidak berhasil terdeteksi.\n` +
      `Contoh input benar:\n` +
      `- "Makan nasi goreng *40rb*"\n` +
      `- "Beli galon aqua *Rp 20.000*"\n` +
      `- "Bayar listrik *Rp250.000*"\n\n` +
      `Silakan ulangi kembali!`,
    en: () =>
      `⚠️ *Couldn't Detect Amount*\n\n` +
      `We couldn't detect a numeric amount.\n` +
      `Example of valid input:\n` +
      `- "Fried rice for lunch *40rb*"\n` +
      `- "Bought water gallon *Rp 20.000*"\n` +
      `- "Paid electricity *Rp250.000*"\n\n` +
      `Please try again!`,
  },
  draftSaveError: {
    id: () => "⚠️ Terjadi kesalahan internal saat menyimpan draf transaksi. Silakan coba lagi.",
    en: () => "⚠️ An internal error occurred while saving the transaction draft. Please try again.",
  },
  draftPrompt: {
    id: (typeLabel: string, catLabel: string, currencyStr: string, originalText: string) =>
      `📝 *Draf Catatan Transaksi*\n` +
      `Apakah rincian keuangan berikut sudah sesuai?\n\n` +
      `• *Tipe*: ${typeLabel}\n` +
      `• *Kategori*: ${catLabel}\n` +
      `• *Nominal*: *${currencyStr}*\n` +
      `• *Catatan*: "${originalText}"\n\n` +
      `_Jika nominal salah, ketik ulang dengan nominal yang benar._`,
    en: (typeLabel: string, catLabel: string, currencyStr: string, originalText: string) =>
      `📝 *Transaction Draft*\n` +
      `Does the following financial detail look correct?\n\n` +
      `• *Type*: ${typeLabel}\n` +
      `• *Category*: ${catLabel}\n` +
      `• *Amount*: *${currencyStr}*\n` +
      `• *Note*: "${originalText}"\n\n` +
      `_If the amount is wrong, type a correction below._`,
  },
  // FIX #11 (draft): Added "Edit Amount" button hint in draft prompt (handled via cancel + retype)
  editAmountHint: {
    id: () => "✏️ *Edit Nominal?*\nKirim pesan baru dengan nominal yang benar, misalnya:\n`Edit: 75rb`",
    en: () => "✏️ *Edit Amount?*\nSend a new message with the correct amount, e.g.:\n`Edit: 75rb`",
  },
  parseError: {
    id: () => "⚠️ Maaf, asisten parsing kami mengalami kendala teknis sementara. Mohon coba ulangi beberapa saat lagi.",
    en: () => "⚠️ Sorry, our parsing assistant is experiencing temporary technical issues. Please try again shortly.",
  },
  txTypeIncome:  { id: () => "📥 Pemasukan",   en: () => "📥 Income" },
  txTypeExpense: { id: () => "📤 Pengeluaran", en: () => "📤 Expense" },
  btnConfirm:    { id: () => "✅ Benar, Simpan",  en: () => "✅ Correct, Save" },
  btnCancel:     { id: () => "❌ Batalkan",        en: () => "❌ Cancel" },
  // FIX #11: Edit amount inline button
  btnEditAmount: { id: () => "✏️ Edit Nominal",    en: () => "✏️ Edit Amount" },
  editAmountPrompt: {
    id: () => "✏️ *Edit Nominal*\n\nKirim nominal yang benar sekarang.\nContoh: `75rb` atau `Rp 75.000`",
    en: () => "✏️ *Edit Amount*\n\nSend the correct amount now.\nExample: `75rb` or `Rp 75.000`",
  },
  btnEditCategory: { id: () => "🏷️ Edit Kategori", en: () => "🏷️ Edit Category" },
  editCategoryPrompt: {
    id: () => "🏷️ *Edit Kategori*\n\nPilih kategori yang sesuai di bawah ini:",
    en: () => "🏷️ *Edit Category*\n\nPlease choose the correct category below:",
  },
  btnBackToDraft: { id: () => "↩️ Kembali", en: () => "↩️ Back" },
  cbCategoryUpdated: {
    id: () => "Kategori berhasil diperbarui.",
    en: () => "Category updated successfully.",
  },
  cbExpired: {
    id: () => "Transaksi tidak ditemukan atau sudah kadaluwarsa.",
    en: () => "Transaction not found or has expired.",
  },
  msgExpired: {
    id: () => "❌ *Sesi Konfirmasi Kedaluwarsa*\n_Silakan tulis ulang transaksi keuangan Anda di bawah ini._",
    en: () => "❌ *Confirmation Session Expired*\n_Please re-write your financial transaction below._",
  },
  cbSaveFailed: {
    id: () => "Gagal menyimpan transaksi.",
    en: () => "Failed to save transaction.",
  },
  msgSaveFailed: {
    id: (msg: string) => `❌ *Gagal Menyimpan Transaksi*\n_Koneksi database bermasalah: ${msg}_`,
    en: (msg: string) => `❌ *Failed to Save Transaction*\n_Database connection issue: ${msg}_`,
  },
  cbSaveSuccess: {
    id: () => "Transaksi berhasil dicatat!",
    en: () => "Transaction successfully recorded!",
  },
  msgSaveSuccess: {
    id: (typeLabel: string, catLabel: string, amountStr: string, originalText: string) =>
      `✅ *Transaksi Berhasil Disimpan!*\n\n` +
      `• *Tipe*: ${typeLabel}\n` +
      `• *Kategori*: ${catLabel}\n` +
      `• *Jumlah*: *${amountStr}*\n` +
      `• *Catatan*: "${originalText}"\n\n` +
      `_Catatan telah tersimpan secara aman ke E-Wallet Kita._ 🌸`,
    en: (typeLabel: string, catLabel: string, amountStr: string, originalText: string) =>
      `✅ *Transaction Saved Successfully!*\n\n` +
      `• *Type*: ${typeLabel}\n` +
      `• *Category*: ${catLabel}\n` +
      `• *Amount*: *${amountStr}*\n` +
      `• *Note*: "${originalText}"\n\n` +
      `_Your record has been safely saved to E-Wallet Kita._ 🌸`,
  },
  cbCancelled: {
    id: () => "Pencatatan dibatalkan.",
    en: () => "Recording cancelled.",
  },
  msgCancelled: {
    id: () => "❌ *Pencatatan transaksi telah dibatalkan.*",
    en: () => "❌ *Transaction recording has been cancelled.*",
  },
  // FIX #8: /riwayat command
  riwayatNotLinked: {
    id: () => "⚠️ *Akun belum terhubung.* Gunakan `/link <kode>` untuk menautkan akun.",
    en: () => "⚠️ *Account not linked.* Use `/link <code>` to link your account.",
  },
  riwayatEmpty: {
    id: () => "📭 *Belum ada transaksi yang tercatat* untuk akun Anda.",
    en: () => "📭 *No transactions recorded yet* for your account.",
  },
  riwayatHeader: {
    id: () => `📋 *5 Transaksi Terakhir* 🌸\n\n`,
    en: () => `📋 *Last 5 Transactions* 🌸\n\n`,
  },
  riwayatFooter: {
    id: () => `\n_Gunakan \`/hapus\` untuk membatalkan transaksi terakhir._`,
    en: () => `\n_Use \`/hapus\` to undo the last transaction._`,
  },
  riwayatError: {
    id: () => "⚠️ Gagal memuat riwayat transaksi. Silakan coba lagi.",
    en: () => "⚠️ Failed to load transaction history. Please try again.",
  },
  // FIX #12 (hapus): /hapus command - delete last transaction
  hapusNotLinked: {
    id: () => "⚠️ *Akun belum terhubung.* Gunakan `/link <kode>` untuk menautkan akun.",
    en: () => "⚠️ *Account not linked.* Use `/link <code>` to link your account.",
  },
  hapusNone: {
    id: () => "📭 *Tidak ada transaksi* yang bisa dihapus.",
    en: () => "📭 *No transactions* to delete.",
  },
  hapusSuccess: {
    id: (typeLabel: string, catLabel: string, amountStr: string, note: string) =>
      `🗑️ *Transaksi Terakhir Berhasil Dihapus*\n\n` +
      `• *Tipe*: ${typeLabel}\n` +
      `• *Kategori*: ${catLabel}\n` +
      `• *Jumlah*: ${amountStr}\n` +
      `• *Catatan*: "${note}"\n\n` +
      `_Transaksi telah dihapus dari E-Wallet Kita._`,
    en: (typeLabel: string, catLabel: string, amountStr: string, note: string) =>
      `🗑️ *Last Transaction Successfully Deleted*\n\n` +
      `• *Type*: ${typeLabel}\n` +
      `• *Category*: ${catLabel}\n` +
      `• *Amount*: ${amountStr}\n` +
      `• *Note*: "${note}"\n\n` +
      `_Transaction has been removed from E-Wallet Kita._`,
  },
  hapusError: {
    id: (msg: string) => `❌ Gagal menghapus transaksi: ${msg}`,
    en: (msg: string) => `❌ Failed to delete transaction: ${msg}`,
  },
  cbLangSet: {
    id: () => "✅ Bahasa Indonesia dipilih!",
    en: () => "✅ English selected!",
  },
  // Fitur sedang dikunci oleh admin lewat tab Maintenance di Admin Panel.
  // `reason` adalah pesan running text yang diatur admin (boleh kosong),
  // sehingga teks aktual selalu berasal dari data, bukan dari hardcode.
  featureUnderMaintenance: {
    id: (reason: string) =>
      reason
        ? `🛠️ *Fitur ini sedang tidak dapat digunakan karena sedang dilakukan maintenance.*\n\n_${reason}_`
        : `🛠️ *Fitur ini sedang tidak dapat digunakan karena sedang dilakukan maintenance.*`,
    en: (reason: string) =>
      reason
        ? `🛠️ *This feature is temporarily unavailable due to ongoing maintenance.*\n\n_${reason}_`
        : `🛠️ *This feature is temporarily unavailable due to ongoing maintenance.*`,
  },
};

function tr<K extends keyof typeof botText>(key: K, lang: Lang, ...args: Parameters<(typeof botText)[K][Lang]>): string {
  const entry = botText[key][lang] as (...a: any[]) => string;
  return entry(...args);
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
// FIX #8 (inferCategoryKey): Greatly expanded keyword coverage
// Covers transport (grab, gojek, bensin), health (dokter, obat, apotik),
// shopping (tokopedia, shopee, lazada), entertainment, education, and more
// ─────────────────────────────────────────────────────────────
function inferCategoryKey(text: string): string {
  const t = text.toLowerCase();

  // Income
  if (/gaji|gajian|salary|upah|transfer masuk|terima gaji/.test(t)) return "salary";
  if (/bonus|hadiah|thr|sampingan|freelance|komisi|cashback|refund|kembalian/.test(t)) return "bonus";

  // Food & Drink
  if (/makan|minum|beli bakso|kopi|warung|restoran|cafe|kantin|soto|nasi|bakmi|mie|pizza|burger|ayam|pecel|gado|es teh|jus|minuman|makanan|boba|martabak|dimsum|sushi|steak|bebek/.test(t)) return "food_drink";

  // Monthly Groceries
  if (/belanja bulanan|supermarket|alfamart|indomaret|hypermart|giant|transmart|lottemart|groceries|sembako|beras|gula|minyak|tepung/.test(t)) return "monthly_groceries";

  // Vegetables / wet market
  if (/sayur|pasar|bumbu|rempah|wortel|bayam|tomat|cabe|bawang|kentang|kubis|kangkung/.test(t)) return "vegetables";

  // Bills / Utilities
  if (/listrik|air|pdam|pulsa|tagihan|wifi|internet|token|pln|telkom|indihome|telkomsel|xl|im3|tri|byU|smartfren|axis|gas|isi daya/.test(t)) return "bills";

  // Transport
  if (/grab|gojek|gocar|grabbike|ojek|bensin|bbm|solar|pertamax|pertalite|parkir|tol|bus|busway|transjakarta|mrt|lrt|krl|kereta|tiket|beli tiket|pesawat|taxiu?|angkot/.test(t)) return "transport";

  // Health
  if (/dokter|obat|apotik|apotek|klinik|rumah sakit|rs |puskesmas|bidan|bpjs|kesehatan|vitamin|suplemen|masker|covid|periksa|rawat/.test(t)) return "health";

  // Shopping / Online
  if (/tokopedia|shopee|lazada|bukalapak|blibli|tiktok shop|amazon|beli online|order|belanja online|baju|sepatu|tas|celana|kaos|dress|jaket/.test(t)) return "shopping";

  // Entertainment
  if (/netflix|spotify|youtube|games|game|steam|playstation|bioskop|cinema|nonton|hiburan|konser|event|tiket masuk/.test(t)) return "entertainment";

  // Education
  if (/sekolah|kuliah|kursus|les|bimbel|buku|alat tulis|spp|uang gedung|pendidikan/.test(t)) return "education";

  return "other";
}

// ─────────────────────────────────────────────────────────────
// FIX #9: Retry wrapper for Telegram API calls (up to 2 retries)
// ─────────────────────────────────────────────────────────────
async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 500): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, delayMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
}

async function sendTelegramMessage(chatId: number, text: string, replyMarkup?: any) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await withRetry(async () => {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown", reply_markup: replyMarkup })
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Telegram API ${response.status}: ${body}`);
      }
    });
  } catch (err) {
    console.error(`❌ sendTelegramMessage to ${chatId} failed after retries:`, err);
  }
}

async function editTelegramMessage(chatId: number, messageId: number, text: string, replyMarkup?: any) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await withRetry(async () => {
      const response = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: "Markdown", reply_markup: replyMarkup })
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Telegram API ${response.status}: ${body}`);
      }
    });
  } catch (err) {
    console.error(`❌ editTelegramMessage for ${chatId}/${messageId} failed after retries:`, err);
  }
}

async function answerTelegramCallback(callbackQueryId: string, text?: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await withRetry(async () => {
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: callbackQueryId, text })
      });
    });
  } catch (err) {
    console.error(`❌ answerTelegramCallback ${callbackQueryId} failed after retries:`, err);
  }
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
    const draft = await createReceiptDraft(userCtx.id, receipt, "telegram", String(chatId));

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
        const categories = await getActiveCategories();
        const rows = [];
        const matching = categories.filter(c => c.type === "expense" || c.type === "both");
        for (let i = 0; i < matching.length; i += 2) {
          const pair = matching.slice(i, i + 2);
          rows.push(pair.map(c => ({
            text: lang === "id" ? (c.label_id || c.key) : (c.label_en || c.key),
            callback_data: `rcpt_setcat:${draftId}:${c.key}`
          })));
        }
        rows.push([{ text: tr("btnBackToDraft", lang), callback_data: `rcpt_back:${draftId}` }]);
        await editTelegramMessage(chatId, msgId, tr("editCategoryPrompt", lang), { inline_keyboard: rows });
        await answerTelegramCallback(queryId);
      }
      else if (actionData.startsWith("rcpt_setcat:")) {
        const [, draftId, catKey] = actionData.split(":");
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
        const receipt = draft.receipt_data;
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
        const receipt = draft.receipt_data;
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
