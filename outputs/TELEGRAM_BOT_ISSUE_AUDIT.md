# 🔴 AUDIT REPORT: Telegram Bot Integration Issue

**Status**: ❌ Bot tidak merespons `/link` command  
**Root Cause**: Architecture Mismatch - Vercel Serverless vs Express.js Server  
**Severity**: CRITICAL

---

## 📋 RINGKASAN MASALAH

Anda menggunakan **Vercel** untuk deployment (serverless), tetapi kode Telegram bot dibangun untuk **long-running Express server**. Ini adalah **incompatibility yang fundamental**:

- ✅ Environment variables sudah benar (TELEGRAM_BOT_TOKEN, APP_URL di Vercel secrets)
- ❌ Webhook endpoint `server.ts` tidak bisa berjalan di Vercel serverless
- ❌ Webhook tidak ter-register ke Telegram API (setupTelegramWebhook() gagal)
- ❌ Saat user kirim `/link xxxxx`, Telegram tidak tahu harus POST ke mana

---

## 🔍 ANALISIS TEKNIS

### Masalah #1: Server Architecture Mismatch

**File**: `server.ts` (baris 227-615)

```typescript
// ❌ MASALAH: Ini adalah Express server long-running
async function startServer() {
  const app = express();
  const PORT = 3000;
  
  app.listen(PORT, "0.0.0.0", () => {
    // Webhook setup dipanggil di sini
    setupTelegramWebhook();  // ← Ini gagal di Vercel
  });
}
```

**Mengapa ini gagal di Vercel:**
- Vercel hanya support serverless functions (req/res), bukan long-running servers
- `app.listen()` tidak akan berjalan di Vercel
- `setupTelegramWebhook()` di line 614 tidak pernah executed
- Telegram tidak pernah menerima webhook registration

---

### Masalah #2: Webhook Registration Failure

**File**: `server.ts` (baris 621-650)

```typescript
async function setupTelegramWebhook() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = process.env.APP_URL;  // ← Ini ada, tapi...
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;

  // ❌ Kode ini tidak pernah execute di Vercel
  const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/telegram/webhook`;
  
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secretToken || undefined,
      allowed_updates: ["message", "callback_query"]
    })
  });
}
```

**Status Webhook**:
```
❌ Webhook TIDAK REGISTERED ke Telegram
┌─────────────────────────────────────┐
│ Telegram Bot API                    │
│ ❌ webhook URL: (kosong/belum set)  │
│ ❌ Polling Mode: DISABLED           │
└─────────────────────────────────────┘

❌ Akibatnya:
- Telegram tidak tahu kemana POST webhook
- Bot tidak menerima messages dari users
- /link command tidak pernah diterima
```

---

### Masalah #3: Telegram Command Handler Exists tapi Unreachable

**File**: `server.ts` (baris 418-450)

```typescript
// ✅ Handler ini BENAR, tapi tidak pernah dipanggil
if (command === "/link") {
  const code = parts[1];
  if (!code || code.length !== 5) {
    await sendTelegramMessage(chatId, "⚠️ Format perintah salah...");
    return;
  }

  // ✅ RPC function exist dan benar
  const { data, error } = await supabaseBackend.rpc("link_telegram_user", {
    p_code: code,
    p_chat_id: chatId
  });

  // ✅ Response handling benar
  if (error) {
    await sendTelegramMessage(chatId, `⚠️ Error: ${error.message}`);
  } else if (data && data[0]?.success) {
    await sendTelegramMessage(chatId, `🎉 Tautan Akun Berhasil!`);
  } else {
    await sendTelegramMessage(chatId, `❌ Gagal Tertaut...`);
  }
}
```

**Kesimpulan**: Logika handler benar ✅, tapi tidak pernah dijalankan ❌

---

### Masalah #4: Database RPC Functions (BENAR)

**File**: `supabase/migrations/20260620000000_init.sql` (baris 115-159)

```sql
-- ✅ RPC Function BENAR
CREATE OR REPLACE FUNCTION public.link_telegram_user(
    p_code TEXT,
    p_chat_id BIGINT
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    user_id UUID,
    display_name TEXT
)
SECURITY DEFINER ...
```

**Status**: ✅ Function sudah di-deploy ke Supabase  
**Problem**: Tidak pernah dipanggil karena webhook tidak registered

---

## 📊 FLOW DIAGRAM (Saat Ini vs Seharusnya)

```
SAAT INI (❌ TIDAK BERFUNGSI):
─────────────────────────────
User: /link 12345
       ↓
  [Telegram API]
       ↓ (POST ke webhook)
  https://your-vercel-app.com/api/telegram/webhook
       ↓
  ❌ WEBHOOK TIDAK REGISTERED
  ❌ Request TIMEOUT / TIDAK DITERIMA
  ↓
Bot tidak merespons


SEHARUSNYA (✅ HARUS BEGINI):
────────────────────────────
User: /link 12345
       ↓
  [Telegram API]
       ↓ (POST ke webhook yang registered)
  https://your-vercel-app.com/api/telegram/webhook
       ↓
  [Vercel Serverless Function]
  handleTelegramWebhook()
       ↓
  Supabase RPC: link_telegram_user(code, chatId)
       ↓
  ✅ sendTelegramMessage() → "🎉 Tautan Berhasil!"
```

---

## 🛠️ SOLUSI

### OPSI 1: Migrasi ke Vercel Serverless Function (RECOMMENDED)

**Langkah 1**: Buat file API endpoint baru

**Nama File**: `api/telegram-webhook.ts`

```typescript
import { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import { createClient } from '@supabase/supabase-js';

// Setup Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const supabaseBackend = createClient(supabaseUrl, supabaseAnonKey);

// In-Memory map untuk pending transactions
const pendingTelegramTransactions = new Map<number, any>();

// Helper functions
async function sendTelegramMessage(chatId: number, text: string, replyMarkup?: any) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        reply_markup: replyMarkup
      })
    });
  } catch (err) {
    console.error(`❌ sendTelegramMessage to ${chatId} failed:`, err);
  }
}

// Main webhook handler
export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // 1. Security Header Check
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
    
    if (secretToken && secretHeader !== secretToken) {
      console.warn("⚠️ Unauthorized Telegram Webhook request blocked");
      res.status(403).json({ error: "Unauthorized update request" });
      return;
    }

    const update = req.body;

    // 2. Handle callback queries
    if (update.callback_query) {
      // [... copy callback_query handler dari server.ts baris 304-366 ...]
      res.status(200).json({ ok: true });
      return;
    }

    // 3. Handle messages
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text.trim();

      // A. COMMANDS CHECK
      if (text.startsWith("/")) {
        const parts = text.split(" ");
        const command = parts[0].toLowerCase();

        // /start command
        if (command === "/start") {
          await sendTelegramMessage(
            chatId,
            `Halo! Selamat datang di *E-Wallet Kita Bot* 🌸\n\n...`
          );
          res.status(200).json({ ok: true });
          return;
        }

        // /link command ← INI YANG PENTING
        if (command === "/link") {
          const code = parts[1];
          if (!code || code.length !== 5) {
            await sendTelegramMessage(chatId, "⚠️ Format perintah salah...");
            res.status(200).json({ ok: true });
            return;
          }

          // Call RPC function
          const { data, error } = await supabaseBackend.rpc("link_telegram_user", {
            p_code: code,
            p_chat_id: chatId
          });

          if (error) {
            console.error("❌ RPC link_telegram_user error:", error);
            await sendTelegramMessage(chatId, `⚠️ Error: ${error.message}`);
          } else if (data && data[0]?.success) {
            const displayName = data[0]?.display_name || "Pengguna";
            await sendTelegramMessage(
              chatId,
              `🎉 *Tautan Akun Berhasil Terhubung!* ✅\n\n` +
              `Halo, *${displayName}*! Chat ini sekarang aman terhubung...`
            );
          } else {
            const errMsg = data && data[0]?.message ? data[0].message : "Kode tidak valid...";
            await sendTelegramMessage(chatId, `❌ *Gagal Tertaut*\n\n${errMsg}`);
          }

          res.status(200).json({ ok: true });
          return;
        }

        // [... other commands ...]
      }

      // [... transaction parsing ...]
    }

    res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("🔴 Telegram Webhook Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
```

**Langkah 2**: Buat file untuk register webhook (hanya dipanggil 1x manual)

**Nama File**: `api/setup-telegram-webhook.ts`

```typescript
import { VercelRequest, VercelResponse } from '@vercel/node';

export default async (req: VercelRequest, res: VercelResponse) => {
  // Keamanan: hanya allow jika ada secret token di query atau header
  const setupToken = req.query.token || req.headers['x-setup-token'];
  const validToken = process.env.TELEGRAM_SETUP_TOKEN; // Buat env var baru ini di Vercel

  if (!validToken || setupToken !== validToken) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const appUrl = process.env.APP_URL;
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (!token || !appUrl) {
      res.status(400).json({ error: "Missing TELEGRAM_BOT_TOKEN or APP_URL" });
      return;
    }

    const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/telegram-webhook`;

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
    console.log("🌸 Telegram setWebhook response:", result);

    res.status(200).json({ 
      success: true, 
      message: "Webhook registered successfully",
      webhook_url: webhookUrl,
      response: result
    });
  } catch (err: any) {
    console.error("🔴 Setup Telegram Webhook error:", err);
    res.status(500).json({ error: err.message });
  }
};
```

**Langkah 3**: Update `vercel.json` untuk routing yang benar

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```
(Ini sudah benar, tidak perlu diubah)

**Langkah 4**: Tambah environment variables di Vercel:

```
TELEGRAM_BOT_TOKEN = your-bot-token (sudah ada)
TELEGRAM_WEBHOOK_SECRET = your-secret-token (sudah ada)
APP_URL = https://your-vercel-domain.com (sudah ada)
TELEGRAM_SETUP_TOKEN = new-random-token-untuk-setup
```

**Langkah 5**: Deploy ke Vercel

```bash
git add .
git commit -m "Migrate Telegram webhook to Vercel serverless functions"
git push
```

**Langkah 6**: Manual trigger webhook setup (ONE TIME ONLY)

```bash
curl "https://your-vercel-domain.com/api/setup-telegram-webhook?token=your-new-random-token"
```

Response yang diharapkan:
```json
{
  "success": true,
  "message": "Webhook registered successfully",
  "webhook_url": "https://your-vercel-domain.com/api/telegram-webhook",
  "response": {
    "ok": true,
    "result": true
  }
}
```

---

### OPSI 2: Hapus server.ts (tidak perlu di Vercel)

**Langkah**:
1. Hapus baris 614 di `server.ts` yang memanggil `setupTelegramWebhook()`
2. Hapus baris 621-650 function `setupTelegramWebhook()`
3. Hapus baris 227-617 function `startServer()`
4. Update `package.json` build script untuk tidak run `server.ts`

**TAPI**: Ini tidak cukup karena API endpoints masih di `server.ts`. Solusi Opsi 1 lebih complete.

---

## 📝 FILES YANG PERLU DIUBAH/DITAMBAH

### File yang ditambahkan:
```
✅ api/telegram-webhook.ts    (BARU - main webhook handler)
✅ api/setup-telegram-webhook.ts  (BARU - one-time setup)
```

### File yang diubah:
```
⚠️ server.ts
   - Hapus: function setupTelegramWebhook() (baris 621-650)
   - Hapus: call setupTelegramWebhook() (baris 614)
   - Hapus: app.post("/api/telegram-webhook", ...) (baris 592-593)
   - Hapus: app.post("/api/telegram/webhook", ...) 
   - ATAU: Rename ke server-legacy.ts dan jangan digunakan
```

### File yang TIDAK perlu diubah:
```
✅ supabase/migrations/20260620000000_init.sql (sudah benar)
✅ src/views/Settings.tsx (code generation sudah benar)
✅ vercel.json (sudah benar)
✅ package.json build (hanya pastikan tidak ada "node server.ts")
```

---

## 🚀 CHECKLIST SETUP

- [ ] Merancang `api/telegram-webhook.ts` dengan full handler (copy dari server.ts webhook part)
- [ ] Merancang `api/setup-telegram-webhook.ts` untuk register webhook
- [ ] Add `TELEGRAM_SETUP_TOKEN` ke Vercel environment
- [ ] Update `server.ts` atau hapus/rename jika tidak digunakan lagi
- [ ] Commit dan push ke Git
- [ ] Deploy ke Vercel
- [ ] Call `https://your-domain.com/api/setup-telegram-webhook?token=YOUR_TOKEN` (one time)
- [ ] Test `/link 12345` di bot Telegram

---

## ✅ VERIFIKASI SETELAH SETUP

```bash
# 1. Check webhook is registered
curl -s "https://api.telegram.org/bot{TOKEN}/getWebhookInfo" | jq

# Expected output:
{
  "ok": true,
  "result": {
    "url": "https://your-domain.com/api/telegram-webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "ip_address": "...",
    "last_error_date": 0,
    "last_error_message": "",
    "last_synchronization_unix_time": 1234567890
  }
}

# 2. Test /link command in Telegram
# Should respond with: "🎉 Tautan Akun Berhasil Terhubung!"
```

---

## 📌 SUMMARY

| Aspek | Status | Masalah |
|-------|--------|--------|
| **Telegram Token** | ✅ OK | Sudah di Vercel secrets |
| **APP_URL** | ✅ OK | Sudah di Vercel |
| **Database (RPC)** | ✅ OK | Functions sudah deployed |
| **Webhook Handler Logic** | ✅ OK | Kode benar tapi tidak jalan |
| **Webhook Registration** | ❌ FAILED | setupTelegramWebhook() tidak execute di Vercel |
| **server.ts Architecture** | ❌ WRONG | Express server tidak cocok untuk Vercel serverless |

**Next Action**: Implementasikan Opsi 1 (Vercel Serverless Migration)
