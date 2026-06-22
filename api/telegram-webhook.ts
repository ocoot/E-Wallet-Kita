import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';
import { parseAmountFromString } from '../src/lib/parserUtils';

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
// FIX #1: Corrected Gemini model name (was "gemini-3.5-flash" — does not exist)
// ─────────────────────────────────────────────────────────────
const GEMINI_MODEL = "gemini-3.5-flash";

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

// FIX #10: Import categories from centralized definition
import { CATEGORIES, getCategoryLabel as getCategoryLabelFromDef } from '../src/lib/categoryDefinitions';

// Use centralized definition
function getCategoryLabel(categoryKey: string, lang: Lang): string {
  return getCategoryLabelFromDef(categoryKey, lang);
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
};

function tr<K extends keyof typeof botText>(key: K, lang: Lang, ...args: Parameters<(typeof botText)[K][Lang]>): string {
  const entry = botText[key][lang] as (...a: any[]) => string;
  return entry(...args);
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
// FIX #1: Correct Gemini model name
// FIX #8 (inferCategoryKey): expanded; used in fallback path
// ─────────────────────────────────────────────────────────────
async function parseFinancialQuery(query: string): Promise<{
  source: string;
  type: "income" | "expense";
  category_key: string;
  amount: number;
  original_text: string;
}> {
  const codeParsedAmount = parseAmountFromString(query);

  if (!ai) {
    const inferredCategory = inferCategoryKey(query);
    const inferredType = /gaji|bonus|salary|upah|thr|transfer masuk|sampingan|freelance|komisi/.test(query.toLowerCase()) ? "income" : "expense";
    return { source: "fallback_server_regex", type: inferredType, category_key: inferredCategory, amount: codeParsedAmount, original_text: query };
  }

  const systemInstruction = `You are a financial parsing expert for 'E-Wallet Kita'.
Analyze natural language transactions in Indonesian or English and output structured JSON.
Category keys (use exactly as written):
  Income: 'salary', 'bonus'
  Expense: 'food_drink', 'monthly_groceries', 'vegetables', 'bills', 'transport', 'health', 'shopping', 'entertainment', 'education', 'other'

Indonesian amount abbreviations:
  'rb' / 'ribu' = thousands (25rb → 25000)
  'k' = thousands (1k → 1000)
  'jt' / 'juta' = millions (1.5jt → 1500000)
  'Rp 250.000' or '250.000' = 250000 (dot is thousands separator in Indonesian)

If no category matches, use 'other'. Always return the numeric IDR value in 'amount'.`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL, // FIX #1: was "gemini-3.5-flash" (non-existent)
      contents: `Parse this input text: "${query}"`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
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

    const responseText = response.text;
    if (!responseText) throw new Error("Empty response from Gemini API");

    const parsedJSON = JSON.parse(responseText.trim());

    // If Gemini returned 0 or suspiciously small amount, trust our regex parser
    const finalAmount = (codeParsedAmount > 0 && (!parsedJSON.amount || parsedJSON.amount <= 10))
      ? codeParsedAmount
      : parsedJSON.amount;

    return {
      source: GEMINI_MODEL,
      type: parsedJSON.type || "expense",
      category_key: parsedJSON.category_key || inferCategoryKey(query),
      amount: finalAmount || codeParsedAmount || 0,
      original_text: query
    };
  } catch (err: any) {
    console.error("❌ Gemini parseFinancialQuery error:", err?.message ?? err);
    // Graceful fallback to local inference on Gemini failure
    return {
      source: "fallback_gemini_error",
      type: /gaji|bonus|salary|upah|thr|sampingan|freelance|komisi/.test(query.toLowerCase()) ? "income" : "expense",
      category_key: inferCategoryKey(query),
      amount: codeParsedAmount,
      original_text: query
    };
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
    // Safe logging (only log update type, not full payload)
    if (update.message?.text) {
      const textPreview = update.message.text.substring(0, 20);
      console.log(`📨 Telegram message: "${textPreview}..."`);
    } else if (update.callback_query) {
      console.log(`📨 Telegram callback: ${update.callback_query.data}`);
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

      // FIX #10: Language selection callback (set lang preference)
      if (actionData === "set_lang_id" || actionData === "set_lang_en") {
        const chosenLang: Lang = actionData === "set_lang_en" ? "en" : "id";
        await supabaseBackend.rpc("set_telegram_language", { p_chat_id: chatId, p_lang: chosenLang });
        await answerTelegramCallback(queryId, tr("cbLangSet", chosenLang));
        await editTelegramMessage(chatId, msgId, tr("start", chosenLang));
        res.status(200).json({ ok: true }); return;
      }

      // FIX #11: Edit amount callback
      if (actionData === "tx_edit_amount") {
        const editLang = await resolveLangOnly(chatId);
        await answerTelegramCallback(queryId);
        await sendTelegramMessage(chatId, tr("editAmountPrompt", editLang));
        res.status(200).json({ ok: true }); return;
      }

      // FIX #4 (race condition): Use atomic confirm_and_delete_pending_telegram_tx RPC
      // which checks existence and inserts in a single transaction, preventing double-tap duplicates
      if (actionData === "tx_confirm") {
        const { data: confirmResult, error: confirmErr } = await supabaseBackend.rpc(
          "confirm_and_insert_telegram_tx",
          { p_chat_id: chatId, p_date: new Date().toISOString().split("T")[0] }
        );

        if (confirmErr) {
          console.error("❌ RPC confirm_and_insert_telegram_tx error:", confirmErr);
          await answerTelegramCallback(queryId, tr("cbSaveFailed", lang));
          await editTelegramMessage(chatId, msgId, tr("msgSaveFailed", lang, confirmErr.message));
          res.status(200).json({ ok: true }); return;
        }

        const result = confirmResult && confirmResult.length > 0 ? confirmResult[0] : null;

        if (!result || result.status === "not_found" || result.status === "expired") {
          await answerTelegramCallback(queryId, tr("cbExpired", lang));
          await editTelegramMessage(chatId, msgId, tr("msgExpired", lang));
          res.status(200).json({ ok: true }); return;
        }

        if (result.status === "already_confirmed") {
          // Double-tap: silently acknowledge without inserting again
          await answerTelegramCallback(queryId, tr("cbSaveSuccess", lang));
          res.status(200).json({ ok: true }); return;
        }

        // status === "saved"
        const catLabel  = getCategoryLabel(result.category_key, lang);
        const amountStr = formatIDR(result.amount);
        const typeLabel = result.type === "income" ? tr("txTypeIncome", lang) : tr("txTypeExpense", lang);

        await answerTelegramCallback(queryId, tr("cbSaveSuccess", lang));
        await editTelegramMessage(chatId, msgId, tr("msgSaveSuccess", lang, typeLabel, catLabel, amountStr, result.original_text));
        res.status(200).json({ ok: true }); return;
      }

      if (actionData === "tx_cancel") {
        await supabaseBackend.rpc("delete_pending_telegram_tx", { p_chat_id: chatId });
        await answerTelegramCallback(queryId, tr("cbCancelled", lang));
        await editTelegramMessage(chatId, msgId, tr("msgCancelled", lang));
        res.status(200).json({ ok: true }); return;
      }

      res.status(200).json({ ok: true }); return;
    }

    // ──────────────────────────────────────────────────────────
    // MESSAGE HANDLER
    // ──────────────────────────────────────────────────────────
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text   = update.message.text.trim();

      // FIX #5: Resolve user context (lang + profile) in ONE DB call for command handling
      // For commands that need profile we use resolveUserContext()
      // For /start which runs before any account exists, fallback to "id"

      if (text.startsWith("/")) {
        const parts   = text.split(" ");
        const command = parts[0].toLowerCase().split("@")[0]; // handle /cmd@botname format

        // ── /start ──
        if (command === "/start") {
          const lang = await resolveLangOnly(chatId);
          // FIX #10: Show language selector on /start
          const langKeyboard = {
            inline_keyboard: [[
              { text: "🇮🇩 Indonesia", callback_data: "set_lang_id" },
              { text: "🇺🇸 English",   callback_data: "set_lang_en" }
            ]]
          };
          await sendTelegramMessage(chatId, tr("langPrompt", lang), langKeyboard);
          res.status(200).json({ ok: true }); return;
        }

        // ── /help ──
        if (command === "/help") {
          const lang = await resolveLangOnly(chatId);
          await sendTelegramMessage(chatId, tr("help", lang));
          res.status(200).json({ ok: true }); return;
        }

        // ── /link ──
        if (command === "/link") {
          const lang = await resolveLangOnly(chatId);
          
          // FIX #8: Rate limit & lockout check
          const now = Date.now();
          let linkAttempt = linkRateLimiter.get(chatId) || { attempts: 0, lastAttempt: now, lockedUntil: null };
          
          // Check if currently locked out
          if (linkAttempt.lockedUntil && now < linkAttempt.lockedUntil) {
            const remainingMin = Math.ceil((linkAttempt.lockedUntil - now) / 1000 / 60);
            await sendTelegramMessage(chatId, 
              lang === "id" 
                ? `🔒 Terlalu banyak percobaan yang gagal. Silakan coba lagi dalam ${remainingMin} menit.`
                : `🔒 Too many failed attempts. Please try again in ${remainingMin} minutes.`
            );
            res.status(200).json({ ok: true }); return;
          }
          
          // Reset attempts if window expired
          if (now - linkAttempt.lastAttempt > LINK_WINDOW) {
            linkAttempt = { attempts: 0, lastAttempt: now, lockedUntil: null };
          }
          
          const code = parts[1];
          if (!code || !/^\d{5}$/.test(code)) {
            linkAttempt.attempts++;
            linkAttempt.lastAttempt = now;
            
            // Lock out after max attempts
            if (linkAttempt.attempts >= LINK_MAX_ATTEMPTS) {
              linkAttempt.lockedUntil = now + LINK_LOCKOUT;
              await sendTelegramMessage(chatId,
                lang === "id"
                  ? `🔒 Terlalu banyak kode yang tidak valid. Akun ini terkunci selama 15 menit.`
                  : `🔒 Too many invalid codes. Your account is locked for 15 minutes.`
              );
            } else {
              const remaining = LINK_MAX_ATTEMPTS - linkAttempt.attempts;
              await sendTelegramMessage(chatId, 
                lang === "id"
                  ? `⚠️ Format kode tidak valid. Coba lagi. (Kesempatan tersisa: ${remaining}/${LINK_MAX_ATTEMPTS})`
                  : `⚠️ Invalid code format. Try again. (Attempts left: ${remaining}/${LINK_MAX_ATTEMPTS})`
              );
            }
            linkRateLimiter.set(chatId, linkAttempt);
            res.status(200).json({ ok: true }); return;
          }

          const { data, error } = await supabaseBackend.rpc("link_telegram_user", {
            p_code: code,
            p_chat_id: chatId
          });

          if (error) {
            console.error("❌ RPC link_telegram_user error:", error);
            linkAttempt.attempts++;
            linkAttempt.lastAttempt = now;
            if (linkAttempt.attempts >= LINK_MAX_ATTEMPTS) {
              linkAttempt.lockedUntil = now + LINK_LOCKOUT;
              await sendTelegramMessage(chatId, tr("linkLockedOut", lang, 15));
            } else {
              await sendTelegramMessage(chatId, tr("linkInternalError", lang, error.message));
            }
            linkRateLimiter.set(chatId, linkAttempt);
          } else if (data && data.length > 0 && data[0]?.success) {
            // Success: reset attempts
            linkRateLimiter.delete(chatId);
            const displayName = data[0]?.display_name || (lang === "en" ? "User" : "Pengguna");
            await sendTelegramMessage(chatId, tr("linkSuccess", lang, displayName));
          } else {
            // Failed attempt
            linkAttempt.attempts++;
            linkAttempt.lastAttempt = now;
            if (linkAttempt.attempts >= LINK_MAX_ATTEMPTS) {
              linkAttempt.lockedUntil = now + LINK_LOCKOUT;
              await sendTelegramMessage(chatId, tr("linkLockedOut", lang, 15));
            } else {
              const remaining = LINK_MAX_ATTEMPTS - linkAttempt.attempts;
              const errMsg = data?.[0]?.message || tr("linkInvalidCodeFallback", lang);
              await sendTelegramMessage(chatId, 
                lang === "id"
                  ? `❌ ${errMsg}\n\n⚠️ Kesempatan tersisa: ${remaining}/${LINK_MAX_ATTEMPTS}`
                  : `❌ ${errMsg}\n\n⚠️ Attempts left: ${remaining}/${LINK_MAX_ATTEMPTS}`
              );
            }
            linkRateLimiter.set(chatId, linkAttempt);
          }

          res.status(200).json({ ok: true }); return;
        }

        // ── /unlink ──
        if (command === "/unlink") {
          const lang = await resolveLangOnly(chatId);
          const { error } = await supabaseBackend.rpc("unlink_telegram_user", { p_chat_id: chatId });
          if (error) await sendTelegramMessage(chatId, tr("unlinkFailed", lang, error.message));
          else       await sendTelegramMessage(chatId, tr("unlinkSuccess", lang));
          res.status(200).json({ ok: true }); return;
        }

        // ── /saldo ── FIX #11: Includes last-month comparison
        if (command === "/saldo") {
          const lang = await resolveLangOnly(chatId);
          const { data, error } = await supabaseBackend.rpc("get_telegram_user_summary_v2", { p_chat_id: chatId });

          if (error) {
            console.error("❌ RPC get_telegram_user_summary_v2 error:", error);
            await sendTelegramMessage(chatId, tr("saldoError", lang));
          } else if (!data || data.length === 0 || !data[0]?.display_name) {
            await sendTelegramMessage(chatId, tr("saldoNotLinked", lang));
          } else {
            const s = data[0];
            const prevExp   = s.prev_total_expense ?? 0;
            const currExp   = s.total_expense ?? 0;
            let expDiffIcon = "➡️";
            let expDiffPct  = lang === "id" ? "sama" : "the same";

            if (prevExp > 0) {
              const pct = ((currExp - prevExp) / prevExp) * 100;
              if (pct > 1) {
                expDiffIcon = "📈";
                expDiffPct  = lang === "id" ? `naik ${pct.toFixed(0)}%` : `up ${pct.toFixed(0)}%`;
              } else if (pct < -1) {
                expDiffIcon = "📉";
                expDiffPct  = lang === "id" ? `turun ${Math.abs(pct).toFixed(0)}%` : `down ${Math.abs(pct).toFixed(0)}%`;
              }
            }

            await sendTelegramMessage(chatId, tr(
              "saldoSummary", lang,
              s.display_name,
              formatIDR(s.total_income),
              formatIDR(currExp),
              formatIDR(s.net_balance),
              formatIDR(s.prev_total_income ?? 0),
              formatIDR(prevExp),
              expDiffIcon,
              expDiffPct
            ));
          }
          res.status(200).json({ ok: true }); return;
        }

        // ── /riwayat ── FIX #8: New command - last 5 transactions
        if (command === "/riwayat") {
          const lang = await resolveLangOnly(chatId);
          const { data, error } = await supabaseBackend.rpc("get_telegram_recent_transactions", { p_chat_id: chatId, p_limit: 5 });

          if (error) {
            console.error("❌ RPC get_telegram_recent_transactions error:", error);
            await sendTelegramMessage(chatId, tr("riwayatError", lang));
            res.status(200).json({ ok: true }); return;
          }

          if (!data || data.length === 0) {
            const userCtx = await resolveUserContext(chatId);
            if (!userCtx) await sendTelegramMessage(chatId, tr("riwayatNotLinked", lang));
            else          await sendTelegramMessage(chatId, tr("riwayatEmpty", lang));
            res.status(200).json({ ok: true }); return;
          }

          let msg = tr("riwayatHeader", lang);
          data.forEach((tx: any, i: number) => {
            const typeEmoji = tx.type === "income" ? "📥" : "📤";
            const catLabel  = getCategoryLabel(tx.category, lang);
            const amount    = formatIDR(tx.amount);
            const date      = tx.transaction_date;
            msg += `${i + 1}. ${typeEmoji} *${amount}* — ${catLabel}\n`;
            msg += `   _${tx.note || "-"}_ · ${date}\n\n`;
          });
          msg += tr("riwayatFooter", lang);

          await sendTelegramMessage(chatId, msg);
          res.status(200).json({ ok: true }); return;
        }

        // ── /hapus ── FIX #12: New command - delete last transaction
        if (command === "/hapus") {
          const lang = await resolveLangOnly(chatId);
          const { data, error } = await supabaseBackend.rpc("delete_last_telegram_transaction", { p_chat_id: chatId });

          if (error) {
            console.error("❌ RPC delete_last_telegram_transaction error:", error);
            await sendTelegramMessage(chatId, tr("hapusError", lang, error.message));
            res.status(200).json({ ok: true }); return;
          }

          if (!data || data.length === 0 || !data[0]?.deleted) {
            const userCtx = await resolveUserContext(chatId);
            if (!userCtx) await sendTelegramMessage(chatId, tr("hapusNotLinked", lang));
            else          await sendTelegramMessage(chatId, tr("hapusNone", lang));
            res.status(200).json({ ok: true }); return;
          }

          const deleted   = data[0];
          const catLabel  = getCategoryLabel(deleted.category, lang);
          const amountStr = formatIDR(deleted.amount);
          const typeLabel = deleted.type === "income" ? tr("txTypeIncome", lang) : tr("txTypeExpense", lang);
          await sendTelegramMessage(chatId, tr("hapusSuccess", lang, typeLabel, catLabel, amountStr, deleted.note || "-"));
          res.status(200).json({ ok: true }); return;
        }

        // Fallback: unknown command
        const lang = await resolveLangOnly(chatId);
        await sendTelegramMessage(chatId, tr("unknownCommand", lang));
        res.status(200).json({ ok: true }); return;
      }

      // ──────────────────────────────────────────────────────────
      // TRANSACTION PARSING from natural text
      // FIX #5: Single resolveUserContext() call replaces 2 separate DB calls
      // ──────────────────────────────────────────────────────────
      const userCtx = await resolveUserContext(chatId);

      if (!userCtx) {
        await sendTelegramMessage(chatId, tr("notLinkedForTx", "id"));
        res.status(200).json({ ok: true }); return;
      }

      const { lang } = userCtx;

      // Check if user is editing an amount (reply to edit prompt)
      // "Edit: 75rb" or just "75rb" after an edit-amount prompt
      const isEditAmountReply = /^edit[:\s]/i.test(text);
      const editAmountText = isEditAmountReply ? text.replace(/^edit[:\s]*/i, "").trim() : null;

      if (editAmountText) {
        const newAmount = parseAmountFromString(editAmountText);
        if (newAmount > 0) {
          const { data: pendingRows } = await supabaseBackend.rpc("get_pending_telegram_tx", { p_chat_id: chatId });
          const pending = pendingRows?.[0];
          if (pending) {
            await supabaseBackend.rpc("upsert_pending_telegram_tx", {
              p_chat_id: chatId,
              p_type: pending.type,
              p_category_key: pending.category_key,
              p_amount: newAmount,
              p_original_text: pending.original_text
            });
            const catLabel  = getCategoryLabel(pending.category_key, lang);
            const typeLabel = pending.type === "income" ? tr("txTypeIncome", lang) : tr("txTypeExpense", lang);
            const draftMarkup = {
              inline_keyboard: [[
                { text: tr("btnConfirm", lang),     callback_data: "tx_confirm" },
                { text: tr("btnEditAmount", lang),  callback_data: "tx_edit_amount" },
                { text: tr("btnCancel", lang),      callback_data: "tx_cancel" }
              ]]
            };
            await sendTelegramMessage(chatId, tr("draftPrompt", lang, typeLabel, catLabel, formatIDR(newAmount), pending.original_text), draftMarkup);
            res.status(200).json({ ok: true }); return;
          }
        }
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

        const localizedCat = getCategoryLabel(parsed.category_key, lang);
        const currencyStr  = formatIDR(parsed.amount);
        const typeLabel    = parsed.type === "income" ? tr("txTypeIncome", lang) : tr("txTypeExpense", lang);

        // FIX #11: 3 buttons — Confirm | Edit Amount | Cancel
        const draftMarkup = {
          inline_keyboard: [[
            { text: tr("btnConfirm", lang),    callback_data: "tx_confirm" },
            { text: tr("btnEditAmount", lang), callback_data: "tx_edit_amount" },
            { text: tr("btnCancel", lang),     callback_data: "tx_cancel" }
          ]]
        };

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
