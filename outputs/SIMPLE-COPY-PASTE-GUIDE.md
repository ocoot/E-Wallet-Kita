# 📋 COPY-PASTE GUIDE (Tanpa Upload)

Karena file .ts tidak bisa diupload ke AI Studio, gunakan method copy-paste langsung.

---

## 📝 STEP 1: Buat File `api/telegram-webhook.ts`

### 1.1 Di Project Lokal Anda
```bash
# Dari directory root project
# Create file baru
touch api/telegram-webhook.ts
```

### 1.2 Copy Kode
1. Buka file: `COPY-PASTE-telegram-webhook.txt`
2. Copy **SEMUA KODE** (mulai dari `import` sampai `};` paling akhir)
3. Paste ke file: `api/telegram-webhook.ts`
4. Save file

✅ Done! File pertama sudah jadi.

---

## 📝 STEP 2: Buat File `api/setup-telegram-webhook.ts`

### 2.1 Di Project Lokal Anda
```bash
# Create file baru
touch api/setup-telegram-webhook.ts
```

### 2.2 Copy Kode
1. Buka file: `COPY-PASTE-setup-telegram-webhook.txt`
2. Copy **SEMUA KODE** (mulai dari `import` sampai `};` paling akhir)
3. Paste ke file: `api/setup-telegram-webhook.ts`
4. Save file

✅ Done! File kedua sudah jadi.

---

## 🔧 STEP 3: Edit File `server.ts`

**File**: `server.ts` (di root project)

### 3.1 Hapus Function setupTelegramWebhook()

**Cari**: Bagian yang dimulai dengan
```typescript
/**
 * Automatically registers the webhook to Telegram Bot API on server boot
 */
async function setupTelegramWebhook() {
```

**Sampai**: Closing brace `}` (sebelum `startServer();`)

**Action**: 🗑️ **HAPUS SELURUH FUNCTION INI** (30 baris)

---

### 3.2 Hapus Call setupTelegramWebhook()

**Cari**: Baris yang isinya
```typescript
setupTelegramWebhook();
```

**Action**: 🗑️ **HAPUS SATU BARIS INI** (dalam `app.listen()`)

**Sebelum:**
```typescript
app.listen(PORT, "0.0.0.0", () => {
    console.log(`E-Wallet Kita backend server running on http://0.0.0.0:${PORT}`);
    
    // Automatically register webhook to Telegram on server boot
    setupTelegramWebhook();  ← HAPUS BARIS INI
  });
```

**Sesudah:**
```typescript
app.listen(PORT, "0.0.0.0", () => {
    console.log(`E-Wallet Kita backend server running on http://0.0.0.0:${PORT}`);
  });
```

---

### 3.3 Hapus Webhook Routes

**Cari**: 2 baris yang dimulai dengan
```typescript
app.post("/api/telegram-webhook", handleTelegramWebhook);
app.post("/api/telegram/webhook", handleTelegramWebhook);
```

**Action**: 🗑️ **HAPUS KEDUA BARIS INI**

**Sebelum:**
```typescript
  app.post("/api/telegram-webhook", handleTelegramWebhook);
  app.post("/api/telegram/webhook", handleTelegramWebhook);

  // Vite development vs production static handler integration
```

**Sesudah:**
```typescript
  // Vite development vs production static handler integration
```

---

## ✅ VERIFICATION

Setelah semua editing selesai, pastikan:

### Check 1: File Exist
```bash
ls -la api/telegram-webhook.ts
ls -la api/setup-telegram-webhook.ts
# Kedua file harus ada
```

### Check 2: server.ts Clean
```bash
# Harus output: (nothing - no results)
grep "setupTelegramWebhook" server.ts
grep "app.post.*telegram" server.ts
```

✅ Jika kedua check OK, lanjut ke deployment!

---

## 🚀 STEP 4: Deploy ke Vercel

### 4.1 Commit Changes
```bash
git add api/telegram-webhook.ts
git add api/setup-telegram-webhook.ts
git add server.ts

git commit -m "Migrate Telegram webhook to Vercel serverless"
```

### 4.2 Push ke Repository
```bash
git push
```

### 4.3 Wait Vercel Deploy
- Buka Vercel Dashboard
- Go to Deployments
- Tunggu status "Ready" ✅

---

## 🔐 STEP 5: Add Environment Variable

### Di Vercel Dashboard:
1. Go to Project Settings → Environment Variables
2. Add New Variable:
   ```
   Name: TELEGRAM_SETUP_TOKEN
   Value: <generate-random-token>
   ```
   
   Generate token (di terminal):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. Save & **Redeploy**

---

## 🔗 STEP 6: Setup Webhook (One Time Only)

### 6.1 Siapkan Info
- `YOUR_DOMAIN` = domain Vercel Anda (misal: your-app.vercel.app)
- `YOUR_TOKEN` = TELEGRAM_SETUP_TOKEN yang baru dibuat

### 6.2 Call Setup Endpoint
```bash
# Replace dengan nilai sebenarnya
curl "https://YOUR_DOMAIN/api/setup-telegram-webhook?token=YOUR_TOKEN"
```

### 6.3 Expected Response
```json
{
  "success": true,
  "message": "✅ Webhook registered successfully to Telegram API",
  "webhook_url": "https://your-domain.com/api/telegram-webhook",
  "telegram_response": {
    "ok": true,
    "result": true
  },
  "next_steps": [...]
}
```

Jika response `success: true` → ✅ Selesai!

---

## 🧪 STEP 7: Test di Telegram

### 7.1 Buka Bot Telegram
Cari bot Anda atau buka: `https://t.me/AppFinMgr_bot`

### 7.2 Test /start
```
User: /start
Bot: Halo! Selamat datang di *E-Wallet Kita Bot* 🌸
```

### 7.3 Test /help
```
User: /help
Bot: 💡 *Panduan Asisten E-Wallet Kita Bot*:
```

### 7.4 Test /link (THE CRITICAL ONE)
```
User: /link 12345  (ganti 12345 dengan kode dari Settings)
Bot: 🎉 *Tautan Akun Berhasil Terhubung!* ✅
```

Jika step 7.4 ✅ berhasil = **SEMUA SUDAH FIX!**

---

## ❌ Jika Ada Error

### Error: "Cannot find setupTelegramWebhook"
**Penyebab**: Masih ada referensi ke function yang sudah dihapus
**Solution**: Pastikan sudah delete semua 3 bagian (lihat step 3)

### Error: "POST /api/telegram-webhook 404"
**Penyebab**: File `api/telegram-webhook.ts` tidak ada atau nama salah
**Solution**: Pastikan file exist di: `your-project/api/telegram-webhook.ts`

### Error: "Unauthorized" saat call setup endpoint
**Penyebab**: TELEGRAM_SETUP_TOKEN tidak matching
**Solution**: 
1. Pastikan token di environment sama dengan token di URL
2. Check Vercel deployment sudah Ready
3. Copy-paste token tanpa space

### Error: "/link tidak merespons"
**Penyebab**: Webhook belum ter-register ke Telegram
**Solution**:
1. Pastikan step 6 (setup endpoint) sudah done
2. Verifikasi webhook dengan command:
   ```bash
   curl "https://api.telegram.org/bot{TOKEN}/getWebhookInfo"
   ```
   Harus show: `"url": "https://your-domain.com/api/telegram-webhook"`

---

## 📋 FINAL CHECKLIST

- [ ] File `api/telegram-webhook.ts` sudah create dan isi kode
- [ ] File `api/setup-telegram-webhook.ts` sudah create dan isi kode
- [ ] Function `setupTelegramWebhook()` sudah dihapus dari `server.ts`
- [ ] Call `setupTelegramWebhook()` sudah dihapus dari `server.ts`
- [ ] 2 baris `app.post()` webhook routes sudah dihapus dari `server.ts`
- [ ] Git commit & push done
- [ ] Vercel deployment status "Ready" ✅
- [ ] `TELEGRAM_SETUP_TOKEN` sudah added ke Vercel environment
- [ ] Setup endpoint (step 6) sudah di-call successfully
- [ ] `/start` test passed ✅
- [ ] `/link` test passed ✅

---

## 🎉 SELESAI!

Jika semua checklist ✅, bot Telegram Anda sudah **BERFUNGSI NORMAL**!

Bot sekarang bisa:
- ✅ Respond ke `/link` command
- ✅ Menyimpan linking code
- ✅ Mencatat transactions via chat
- ✅ Show saldo dengan `/saldo`

🚀 Happy tracking!
═══════════════════════════════════════════════════════════════════════════════
FILE NAME: api/telegram-webhook.ts
LOCATION: your-project/api/telegram-webhook.ts
═══════════════════════════════════════════════════════════════════════════════
INSTRUCTIONS:
1. Create new file: api/telegram-webhook.ts
2. Copy ALL code di bawah ini (dari "import" sampai penutup "}")
3. Paste ke file yang sudah dibuat
4. Save
═══════════════════════════════════════════════════════════════════════════════

import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';
import { parseAmountFromString } from '../src/lib/parserUtils';

// Initialize Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const supabaseBackend = createClient(supabaseUrl, supabaseAnonKey);

// Initialize Gemini
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
}

// In-Memory map untuk pending transactions
const pendingTelegramTransactions = new Map<number, {
  type: "income" | "expense";
  category_key: string;
  amount: number;
  original_text: string;
}>();

// Category labels
const botCategoryLabels: Record<string, { id: string; en: string }> = {
  salary: { id: "Gaji", en: "Salary" },
  bonus: { id: "Bonus", en: "Bonus" },
  food_drink: { id: "Makanan & Minuman", en: "Food & Drink" },
  monthly_groceries: { id: "Belanja Bulanan", en: "Monthly Groceries" },
  vegetables: { id: "Belanja Sayur", en: "Vegetables" },
  bills: { id: "Tagihan", en: "Bills" },
  other: { id: "Lain-lain", en: "Other" }
};

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

async function parseFinancialQuery(query: string): Promise<{
  source: string;
  type: "income" | "expense";
  category_key: string;
  amount: number;
  original_text: string;
}> {
  if (!ai) {
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
          category_key: { type: Type.STRING, description: "Category string key" },
          amount: { type: Type.NUMBER, description: "Numeric Indonesian Rupiah conversion" },
          original_text: { type: Type.STRING, description: "The raw input string parsed" }
        },
        required: ["type", "category_key", "amount", "original_text"]
      }
    }
  });

  const responseText = response.text;
  if (!responseText) {
    throw new Error("Empty response from Gemini API");
  }

  const parsedJSON = JSON.parse(responseText.trim());
  const codeParsedAmount = parseAmountFromString(query);
  
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
}

async function sendTelegramMessage(chatId: number, text: string, replyMarkup?: any) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        reply_markup: replyMarkup
      })
    });
    
    if (!response.ok) {
      console.error(`❌ sendTelegramMessage failed: ${response.status} ${response.statusText}`);
    }
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

export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
    
    if (secretToken && secretHeader !== secretToken) {
      console.warn("⚠️ Unauthorized Telegram Webhook request blocked (Secret Token mismatch)");
      res.status(403).json({ error: "Unauthorized update request" });
      return;
    }

    const update = req.body;
    console.log("📨 Telegram update received:", JSON.stringify(update, null, 2));

    // Handle Inline Button Callback Queries
    if (update.callback_query) {
      const queryId = update.callback_query.id;
      const chatId = update.callback_query.message?.chat?.id;
      const msgId = update.callback_query.message?.message_id;
      const actionData = update.callback_query.data;

      if (!chatId || !msgId) {
        res.status(200).json({ ok: true });
        return;
      }

      const pending = pendingTelegramTransactions.get(chatId);

      if (actionData === "tx_confirm") {
        if (!pending) {
          await answerTelegramCallback(queryId, "Transaksi tidak ditemukan atau sudah kadaluwarsa.");
          await editTelegramMessage(chatId, msgId, "❌ *Sesi Konfirmasi Kedaluwarsa*\n_Silakan tulis ulang transaksi keuangan Anda di bawah ini._");
          res.status(200).json({ ok: true });
          return;
        }

        const { error } = await supabaseBackend.rpc("insert_telegram_transaction", {
          p_chat_id: chatId,
          p_type: pending.type,
          p_category: pending.category_key,
          p_amount: pending.amount,
          p_note: pending.original_text,
          p_date: new Date().toISOString().split("T")[0]
        });

        if (error) {
          console.error("❌ RPC insert_telegram_transaction error:", error);
          await answerTelegramCallback(queryId, "Gagal menyimpan transaksi.");
          await editTelegramMessage(chatId, msgId, `❌ *Gagal Menyimpan Transaksi*\n_Koneksi database bermasalah: ${error.message}_`);
        } else {
          pendingTelegramTransactions.delete(chatId);
          await answerTelegramCallback(queryId, "Transaksi berhasil dicatat!");
          
          const catLabel = botCategoryLabels[pending.category_key]?.id || pending.category_key;
          const amountStr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(pending.amount);

          await editTelegramMessage(
            chatId,
            msgId,
            `✅ *Transaksi Berhasil Disimpan!*\n\n` +
            `• *Tipe*: ${pending.type === "income" ? "📥 Pemasukan" : "📤 Pengeluaran"}\n` +
            `• *Kategori*: ${catLabel}\n` +
            `• *Jumlah*: *${amountStr}*\n` +
            `• *Catatan*: "${pending.original_text}"\n\n` +
            `_Catatan telah tersimpan secara aman ke E-Wallet Kita._ 🌸`
          );
        }
      } 
      else if (actionData === "tx_cancel") {
        pendingTelegramTransactions.delete(chatId);
        await answerTelegramCallback(queryId, "Pencatatan dibatalkan.");
        await editTelegramMessage(chatId, msgId, "❌ *Pencatatan transaksi telah dibatalkan.*");
      }

      res.status(200).json({ ok: true });
      return;
    }

    // Handle Standard incoming messages
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text.trim();

      // COMMANDS CHECK
      if (text.startsWith("/")) {
        const parts = text.split(" ");
        const command = parts[0].toLowerCase();

        if (command === "/start") {
          await sendTelegramMessage(
            chatId,
            `Halo! Selamat datang di *E-Wallet Kita Bot* 🌸\n\n` +
            `Saya adalah asisten pintar untuk mencatat keuangan Anda secepat mengirim chat!\n\n` +
            `Untuk mulai mencatat, silakan *tautkan akun* Anda terlebih dahulu:\n` +
            `1️⃣ Buka website *E-Wallet Kita*\n` +
            `2️⃣ Masuk ke halaman *Pengaturan (Settings)*\n` +
            `3️⃣ Cari bagian *Koneksi Bot Telegram* dan tekan *Buat Kode Tautan*\n` +
            `4️⃣ Kirim perintah tautan berikut di sini:\n` +
            `     \`/link <kode_5_digit>\` (Contoh: \`/link 12345\`)\n\n` +
            `💡 Ketik \`/help\` untuk informasi bantuan commands.`
          );
          res.status(200).json({ ok: true });
          return;
        }

        if (command === "/help") {
          await sendTelegramMessage(
            chatId,
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
            `     • \`/saldo\` - Melihat status ringkasan saldo bulan ini.\n` +
            `     • \`/unlink\` - Memutuskan koneksi akun Telegram dari sistem.\n` +
            `     • \`/help\` - Membuka pesan bantuan petunjuk ini.`
          );
          res.status(200).json({ ok: true });
          return;
        }

        // ✅ /link COMMAND - THIS IS THE KEY COMMAND
        if (command === "/link") {
          const code = parts[1];
          if (!code || code.length !== 5) {
            await sendTelegramMessage(chatId, "⚠️ Format perintah salah. Silakan kirim dalam format: `/link <kode_5_digit>` - Contoh: `/link 12345`.");
            res.status(200).json({ ok: true });
            return;
          }

          console.log(`🔗 /link command received: code=${code}, chatId=${chatId}`);

          const { data, error } = await supabaseBackend.rpc("link_telegram_user", {
            p_code: code,
            p_chat_id: chatId
          });

          console.log("RPC response - data:", data, "error:", error);

          if (error) {
            console.error("❌ RPC link_telegram_user error:", error);
            await sendTelegramMessage(chatId, `⚠️ Terjadi error internal saat menautkan akun: ${error.message}`);
          } else if (data && data.length > 0 && data[0]?.success) {
            const displayName = data[0]?.display_name || "Pengguna";
            await sendTelegramMessage(
              chatId,
              `🎉 *Tautan Akun Berhasil Terhubung!* ✅\n\n` +
              `Halo, *${displayName}*! Chat ini sekarang aman terhubung dengan aplikasi *E-Wallet Kita*.\n\n` +
              `Sekarang Anda sudah bisa langsung melakukan pencatatan keuangan otomatis. Silakan tulis transaksi pertama Anda!`
            );
          } else {
            const errMsg = data && data.length > 0 && data[0]?.message ? data[0].message : "Kode tautan tidak valid atau telah kedaluwarsa.";
            await sendTelegramMessage(chatId, `❌ *Gagal Tertaut*\n\n${errMsg}`);
          }

          res.status(200).json({ ok: true });
          return;
        }

        if (command === "/unlink") {
          const { error } = await supabaseBackend.rpc("unlink_telegram_user", {
            p_chat_id: chatId
          });

          if (error) {
            await sendTelegramMessage(chatId, `❌ Gagal memutuskan tautan: ${error.message}`);
          } else {
            await sendTelegramMessage(chatId, "👋 *Koneksi bot Telegram dibatalkan.* Hubungan chat ini dengan E-Wallet Kita berhasil diputuskan.");
          }
          res.status(200).json({ ok: true });
          return;
        }

        if (command === "/saldo") {
          const { data, error } = await supabaseBackend.rpc("get_telegram_user_summary", {
            p_chat_id: chatId
          });

          if (error) {
            console.error("❌ RPC get_telegram_user_summary error:", error);
            await sendTelegramMessage(chatId, "⚠️ Terjadi kesalahan internal saat memuat data saldo.");
          } else if (!data || data.length === 0 || !data[0]?.display_name) {
            await sendTelegramMessage(chatId, "⚠️ *Akun belum terhubung.* Silakan hubungkan Telegram Anda terlebih dahulu menggunakan perintah `/link <kode>`.");
          } else {
            const summary = data[0];
            const incStr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(summary.total_income);
            const expStr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(summary.total_expense);
            const balStr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(summary.net_balance);

            await sendTelegramMessage(
              chatId,
              `📊 *Ringkasan Keuangan Bulan Ini* 🌸\n\n` +
              `Halo, *${summary.display_name}*! Berikut adalah laporan keuangan Anda bulan ini:\n\n` +
              `• *Total Pemasukan*: 📥 \`${incStr}\`\n` +
              `• *Total Pengeluaran*: 📤 \`${expStr}\`\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `• *Saldo Tabungan*: 💰 *${balStr}*\n\n` +
              `_Gunakan bot ini untuk terus merekam transaksi harian secara praktis!_`
            );
          }
          res.status(200).json({ ok: true });
          return;
        }

        // Fallback for unhandled command
        await sendTelegramMessage(chatId, "⚠️ Perintah tidak dikenali. Silakan ketik `/help` untuk bantuan.");
        res.status(200).json({ ok: true });
        return;
      }

      // TRANSACTION PARSING FROM NATURAL CHAT TEXT
      const { data: userProfile, error: profileErr } = await supabaseBackend.rpc("get_user_by_telegram_chat_id", {
        p_chat_id: chatId
      });

      if (profileErr) {
        console.error("Profile lookup error:", profileErr);
        await sendTelegramMessage(chatId, "⚠️ Terjadi kegagalan pencarian profil akun.");
        res.status(200).json({ ok: true });
        return;
      }

      if (!userProfile || userProfile.length === 0) {
        await sendTelegramMessage(
          chatId,
          `⚠️ *Akun Belum Terhubung*\n\n` +
          `Maaf, kami tidak bisa mencatat transaksi Anda karena chat ini belum terhubung ke akun mana pun.\n\n` +
          `Silakan ketik \`/link <kode_5_digit>\` untuk menautkan akun.`
        );
        res.status(200).json({ ok: true });
        return;
      }

      await sendTelegramMessage(chatId, "🔄 _Sedang menganalisis catatan keuangan Anda..._");
      
      try {
        const parsed = await parseFinancialQuery(text);
        
        if (parsed.amount <= 0) {
          await sendTelegramMessage(
            chatId,
            `⚠️ *Gagal Membaca Nominal*\n\n` +
            `Kami memahami transaksi Anda bermaksud mencatat sesuatu, namun nominal angka uang tidak berhasil terdeteksi.\n` +
            `Contoh input benar:\n` +
            `- "Makan nasi goreng *40rb*"\n` +
            `- "Beli galon aqua *Rp 20.000*"\n\n` +
            `Silakan ulangi kembali!`
          );
          res.status(200).json({ ok: true });
          return;
        }

        pendingTelegramTransactions.set(chatId, {
          type: parsed.type,
          category_key: parsed.category_key,
          amount: parsed.amount,
          original_text: parsed.original_text
        });

        const localizedCat = botCategoryLabels[parsed.category_key]?.id || parsed.category_key;
        const currencyStr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(parsed.amount);

        const promptReplyMarkup = {
          inline_keyboard: [
            [
              { text: "✅ Benar, Simpan", callback_data: "tx_confirm" },
              { text: "❌ Batalkan", callback_data: "tx_cancel" }
            ]
          ]
        };

        await sendTelegramMessage(
          chatId,
          `📝 *Draf Catatan Transaksi*\n` +
          `Apakah rincian keuangan berikut sudah sesuai?\n\n` +
          `• *Tipe*: ${parsed.type === "income" ? "📥 Pemasukan" : "📤 Pengeluaran"}\n` +
          `• *Kategori*: ${localizedCat}\n` +
          `• *Nominal*: *${currencyStr}*\n` +
          `• *Catatan*: "${parsed.original_text}"`,
          promptReplyMarkup
        );

      } catch (parseError: any) {
        console.error("Parse Error:", parseError);
        await sendTelegramMessage(chatId, "⚠️ Maaf, asisten parsing kami mengalami kendala teknis sementara. Mohon coba ulangi beberapa saat lagi.");
      }

      res.status(200).json({ ok: true });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("🔴 Telegram Webhook Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
═══════════════════════════════════════════════════════════════════════════════
FILE NAME: api/setup-telegram-webhook.ts
LOCATION: your-project/api/setup-telegram-webhook.ts
═══════════════════════════════════════════════════════════════════════════════
INSTRUCTIONS:
1. Create new file: api/setup-telegram-webhook.ts
2. Copy ALL code di bawah ini (dari "import" sampai penutup "}")
3. Paste ke file yang sudah dibuat
4. Save
═══════════════════════════════════════════════════════════════════════════════

import { VercelRequest, VercelResponse } from '@vercel/node';

export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
    return;
  }

  try {
    const setupTokenFromQuery = req.query.token as string;
    const setupTokenFromHeader = req.headers['x-setup-token'] as string;
    const setupToken = setupTokenFromQuery || setupTokenFromHeader;
    
    const validToken = process.env.TELEGRAM_SETUP_TOKEN;

    if (!validToken) {
      res.status(500).json({ 
        error: "TELEGRAM_SETUP_TOKEN not configured in environment variables" 
      });
      return;
    }

    if (!setupToken || setupToken !== validToken) {
      res.status(403).json({ 
        error: "Unauthorized. Invalid or missing setup token." 
      });
      return;
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const appUrl = process.env.APP_URL;
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (!token) {
      res.status(400).json({ 
        error: "Missing TELEGRAM_BOT_TOKEN in environment variables" 
      });
      return;
    }

    if (!appUrl) {
      res.status(400).json({ 
        error: "Missing APP_URL in environment variables" 
      });
      return;
    }

    const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/telegram-webhook`;

    console.log("🔄 Setting up Telegram webhook...");
    console.log(`  Bot Token: ${token.substring(0, 10)}...`);
    console.log(`  Webhook URL: ${webhookUrl}`);
    console.log(`  Secret Token: ${secretToken ? 'SET' : 'NOT SET'}`);

    const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secretToken || undefined,
        allowed_updates: ["message", "callback_query"]
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("❌ Telegram API error:", result);
      res.status(400).json({ 
        success: false, 
        error: "Telegram API returned an error",
        details: result
      });
      return;
    }

    console.log("✅ Telegram webhook registered successfully!");
    console.log("🌸 Response:", result);

    if (result.ok && result.result === true) {
      res.status(200).json({ 
        success: true, 
        message: "✅ Webhook registered successfully to Telegram API",
        webhook_url: webhookUrl,
        telegram_response: result,
        next_steps: [
          "Test the bot by sending /start to your bot in Telegram",
          "Try the /link command with a valid code",
          "Check server logs for webhook updates"
        ]
      });
    } else {
      res.status(200).json({ 
        success: false, 
        message: "Telegram API returned an unexpected response",
        webhook_url: webhookUrl,
        telegram_response: result
      });
    }

  } catch (err: any) {
    console.error("🔴 Setup Telegram Webhook error:", err);
    res.status(500).json({ 
      error: "Internal server error",
      message: err.message 
    });
  }
};
