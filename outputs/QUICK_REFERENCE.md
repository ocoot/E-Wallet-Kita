# 📋 QUICK REFERENCE: Telegram Bot Fix

## 🎯 MASALAH
Bot Telegram tidak merespons `/link` command → Webhook tidak ter-register di Vercel

## 📁 FILE YANG DITAMBAH (2 files)

### File #1: `api/telegram-webhook.ts` (NEW)
```
Location: your-project/api/telegram-webhook.ts
Size: ~700 lines
Source: api-telegram-webhook.ts (provided)
Purpose: Main webhook handler untuk Telegram updates
```

**Copy paste ke file baru**:
1. Create file: `api/telegram-webhook.ts`
2. Paste: Seluruh isi dari `api-telegram-webhook.ts`
3. No modifications needed ✅

### File #2: `api/setup-telegram-webhook.ts` (NEW)
```
Location: your-project/api/setup-telegram-webhook.ts
Size: ~80 lines
Source: api-setup-telegram-webhook.ts (provided)
Purpose: One-time setup endpoint untuk register webhook ke Telegram API
```

**Copy paste ke file baru**:
1. Create file: `api/setup-telegram-webhook.ts`
2. Paste: Seluruh isi dari `api-setup-telegram-webhook.ts`
3. No modifications needed ✅

---

## 🔧 FILE YANG DIUBAH (1 file)

### File: `server.ts`
```
Location: your-project/server.ts
Current size: ~650 lines
Action: DELETE 3 sections
```

#### Section 1: DELETE function setupTelegramWebhook()
**Lines**: ~621-650
**Find text**:
```typescript
/**
 * Automatically registers the webhook to Telegram Bot API on server boot
 */
async function setupTelegramWebhook() {
```
**Until**: Closing brace `}`

**Action**: 🗑️ DELETE SEMUA

---

#### Section 2: DELETE call to setupTelegramWebhook()
**Lines**: ~614
**Find text**:
```typescript
setupTelegramWebhook();
```

**Action**: 🗑️ DELETE

---

#### Section 3: DELETE webhook route handlers
**Lines**: ~592-593
**Find text**:
```typescript
app.post("/api/telegram-webhook", handleTelegramWebhook);
app.post("/api/telegram/webhook", handleTelegramWebhook);
```

**Action**: 🗑️ DELETE BOTH LINES

---

## 📊 SUMMARY OF CHANGES

| Item | Action | File | Lines |
|------|--------|------|-------|
| Telegram webhook handler | CREATE | `api/telegram-webhook.ts` | - |
| Webhook setup endpoint | CREATE | `api/setup-telegram-webhook.ts` | - |
| setupTelegramWebhook() | DELETE | `server.ts` | ~621-650 |
| setupTelegramWebhook() call | DELETE | `server.ts` | ~614 |
| Webhook POST routes | DELETE | `server.ts` | ~592-593 |

**Total Changes**: 2 files created, 1 file modified (3 deletions)

---

## 🚀 DEPLOYMENT STEPS

### 1️⃣ Create Files
```bash
# Copy api-telegram-webhook.ts ke api/telegram-webhook.ts
# Copy api-setup-telegram-webhook.ts ke api/setup-telegram-webhook.ts
```

### 2️⃣ Update server.ts
Delete 3 sections (lihat di atas)

### 3️⃣ Commit & Push
```bash
git add api/telegram-webhook.ts api/setup-telegram-webhook.ts server.ts
git commit -m "Migrate Telegram webhook to Vercel serverless"
git push
```

### 4️⃣ Wait for Vercel Deploy
Dashboard → Deployments → Status "Ready" ✅

### 5️⃣ Add Environment Variable (Vercel Dashboard)
```
Name: TELEGRAM_SETUP_TOKEN
Value: <random-token-dari-node-crypto>
```

### 6️⃣ Setup Webhook (One Time)
```bash
curl "https://your-domain.com/api/setup-telegram-webhook?token=TELEGRAM_SETUP_TOKEN"
```

### 7️⃣ Test Bot
```
/start  → Bot responds ✅
/help   → Bot responds ✅
/link XXXXX → Bot responds ✅
```

---

## 📝 EXACT CODE TO DELETE FROM server.ts

### Delete Block 1 (setupTelegramWebhook function):
```typescript
/**
 * Automatically registers the webhook to Telegram Bot API on server boot
 */
async function setupTelegramWebhook() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = process.env.APP_URL;
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!token || !appUrl) {
    console.warn("⚠️ Setup Telegram Webhook skipped: TELEGRAM_BOT_TOKEN or APP_URL is not configured.");
    return;
  }

  // Ensure trailing slash is normalized
  const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/telegram/webhook`;
  console.log(`⏳ Registering webhook with url: ${webhookUrl}`);

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secretToken || undefined,
        allowed_updates: ["message", "callback_query"]
      })
    });
    const result = await res.json();
    console.log("🌸 Telegram Bot setWebhook response:", result);
  } catch (err) {
    console.error("🔴 Setup Telegram Webhook failure:", err);
  }
}
```

### Delete Block 2 (setupTelegramWebhook call):
Find and delete line:
```typescript
setupTelegramWebhook();
```

### Delete Block 3 (webhook routes):
Find and delete lines:
```typescript
app.post("/api/telegram-webhook", handleTelegramWebhook);
app.post("/api/telegram/webhook", handleTelegramWebhook);
```

---

## ✅ VERIFICATION AFTER CHANGES

Check `server.ts` menggunakan grep:
```bash
# Semua ini harus output: (nothing)
grep "setupTelegramWebhook" server.ts
grep "telegram-webhook" server.ts
grep "telegram/webhook" server.ts
```

---

## 🔗 ENDPOINT ROUTES AFTER CHANGES

| Route | Handler | File |
|-------|---------|------|
| `POST /api/telegram-webhook` | handleTelegramWebhook | `api/telegram-webhook.ts` ✅ NEW |
| `GET /api/setup-telegram-webhook` | setupWebhook | `api/setup-telegram-webhook.ts` ✅ NEW |
| `GET /api/health` | (existing) | `api/health.ts` |
| `POST /api/parse-transaction` | (existing) | `api/parse-transaction.ts` |
| `GET /api/parser/test` | (existing) | `api/parser/test.ts` |

---

## 💡 KEY DIFFERENCES: Before vs After

### BEFORE (❌ NOT WORKING)
```
Express Server (server.ts)
  ├─ app.listen(3000)
  │  ├─ setupTelegramWebhook() ← Called at startup
  │  │  └─ Fails on Vercel! ❌
  │  ├─ POST /api/telegram-webhook
  │  ├─ POST /api/telegram/webhook
  │  └─ ... never reached on Vercel
  └─ Vercel serverless can't run long-running servers
```

### AFTER (✅ WORKING)
```
Vercel Serverless Functions
  ├─ api/telegram-webhook.ts
  │  └─ POST /api/telegram-webhook ← Called by Telegram directly
  ├─ api/setup-telegram-webhook.ts
  │  └─ GET /api/setup-telegram-webhook?token=XXX ← Manual one-time call
  ├─ api/health.ts
  ├─ api/parse-transaction.ts
  └─ ... all stateless, no server startup
```

---

## 🎯 EXPECTED BEHAVIOR AFTER FIX

```
User di Telegram: /link 12345
         ↓
[Telegram API]
         ↓ (POST to registered webhook)
https://your-domain.com/api/telegram-webhook
         ↓
[Vercel Serverless Function]
 api/telegram-webhook.ts → handleTelegramWebhook()
         ↓
Check code valid → RPC link_telegram_user()
         ↓
✅ Send bot response: "🎉 Tautan Akun Berhasil Terhubung!"
         ↓
User receives response in Telegram chat
```

---

## 📞 QUICK TROUBLESHOOTING

| Issue | Check | Fix |
|-------|-------|-----|
| `/link` no response | Webhook registered? | Call setup endpoint (step 6) |
| Setup returns 403 | Token correct? | Verify TELEGRAM_SETUP_TOKEN env var |
| Bot not responding | File created? | Verify api/telegram-webhook.ts exists |
| Deploy failed | Syntax error? | Check file copy-paste (no missing braces) |
| RPC error | Function exists? | Check Supabase migrations deployed |

---

## 🚢 DEPLOYMENT CHECKLIST

- [ ] `api/telegram-webhook.ts` created ✅
- [ ] `api/setup-telegram-webhook.ts` created ✅
- [ ] 3 sections deleted from `server.ts` ✅
- [ ] Git commit & push done ✅
- [ ] Vercel deployment ready ✅
- [ ] `TELEGRAM_SETUP_TOKEN` added to Vercel env ✅
- [ ] Setup endpoint called once ✅
- [ ] `/start` test passed ✅
- [ ] `/link` test passed ✅

---

**Status**: Ready to implement! 🚀
