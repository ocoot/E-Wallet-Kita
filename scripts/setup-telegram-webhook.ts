/**
 * scripts/setup-telegram-webhook.ts
 *
 * One-time setup script untuk mendaftarkan webhook Telegram ke Telegram API.
 * Dipindahkan dari api/setup-telegram-webhook.ts (serverless function) karena
 * hanya dijalankan sekali saat pertama deploy — memakan 1 slot dari 12 function
 * limit Vercel sia-sia.
 *
 * Cara pakai:
 *   npx tsx scripts/setup-telegram-webhook.ts
 *
 * Environment variables yang dibutuhkan (bisa dari .env lokal):
 *   TELEGRAM_SETUP_TOKEN    — wajib, token pengaman agar script tidak bisa
 *                             dijalankan sembarangan (sama dengan nilai yang
 *                             dulu dikirim lewat ?token= atau x-setup-token)
 *   TELEGRAM_BOT_TOKEN      — wajib, token bot dari @BotFather
 *   APP_URL                 — wajib, URL produksi, contoh: https://app.example.com
 *   TELEGRAM_WEBHOOK_SECRET — opsional tapi sangat direkomendasikan; dipakai
 *                             sebagai secret_token di Telegram setWebhook agar
 *                             api/telegram-webhook.ts bisa memvalidasi request
 */

import 'dotenv/config';

async function main() {
  // ── Validasi TELEGRAM_SETUP_TOKEN ─────────────────────────────────────────
  // Di versi serverless, token ini dikirim lewat query ?token= atau header
  // x-setup-token. Di sini kita baca langsung dari env — kalau env tidak
  // di-set, script berhenti supaya tidak bisa dijalankan tanpa otorisasi.
  const validToken = process.env.TELEGRAM_SETUP_TOKEN;
  if (!validToken) {
    console.error('TELEGRAM_SETUP_TOKEN not configured in environment variables');
    process.exit(1);
  }

  // ── Validasi env wajib lainnya ────────────────────────────────────────────
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('Missing TELEGRAM_BOT_TOKEN in environment variables');
    process.exit(1);
  }

  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    console.error('Missing APP_URL in environment variables');
    process.exit(1);
  }

  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;

  const webhookUrl = `${appUrl.replace(/\/$/, '')}/api/telegram-webhook`;

  console.log('Setting up Telegram webhook...');
  console.log(`  Bot Token   : ${token.substring(0, 10)}...`);
  console.log(`  Webhook URL : ${webhookUrl}`);
  console.log(`  Secret Token: ${secretToken ? 'SET' : 'NOT SET'}`);

  // ── Panggil Telegram setWebhook API ──────────────────────────────────────
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secretToken || undefined,
        allowed_updates: ['message', 'callback_query'],
      }),
    });
  } catch (err: any) {
    console.error('Setup Telegram Webhook error:', err);
    console.error('   message:', err.message);
    process.exit(1);
  }

  const result = await response.json();

  if (!response.ok) {
    console.error('Telegram API returned an error:');
    console.error('   details:', JSON.stringify(result, null, 2));
    process.exit(1);
  }

  if (result.ok && result.result === true) {
    console.log('Webhook registered successfully to Telegram API');
    console.log('');
    console.log('   webhook_url      :', webhookUrl);
    console.log('   telegram_response:', JSON.stringify(result, null, 2));
    console.log('');
    console.log('   Next steps:');
    console.log('   - Test the bot by sending /start to your bot in Telegram');
    console.log('   - Try the /link command with a valid code');
    console.log('   - Check Vercel logs for incoming webhook updates');
  } else {
    console.warn(' Telegram API returned an unexpected response:');
    console.warn('   webhook_url      :', webhookUrl);
    console.warn('   telegram_response:', JSON.stringify(result, null, 2));
  }
}

main().catch((err: any) => {
  console.error('Setup Telegram Webhook error:', err);
  console.error('   message:', err.message);
  process.exit(1);
});
