/**
 * scripts/setup-telegram-webhook.ts
 *
 * One-time setup script untuk mendaftarkan webhook Telegram ke Telegram API.
 * Dulunya adalah api/setup-telegram-webhook.ts (serverless function), tapi
 * karena hanya dijalankan sekali saat pertama deploy, memakan 1 slot dari
 * 12 function limit Vercel sia-sia. Dipindah ke sini sebagai script biasa.
 *
 * Cara pakai:
 *   npx tsx scripts/setup-telegram-webhook.ts
 *
 * Pastikan environment variables berikut tersedia (bisa lewat .env lokal):
 *   TELEGRAM_BOT_TOKEN
 *   APP_URL
 *   TELEGRAM_SETUP_TOKEN     (opsional — hanya untuk validasi manual)
 *   TELEGRAM_WEBHOOK_SECRET  (opsional tapi sangat direkomendasikan)
 */

import 'dotenv/config';

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = process.env.APP_URL;
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!token) {
    console.error('❌ Missing TELEGRAM_BOT_TOKEN in environment variables');
    process.exit(1);
  }

  if (!appUrl) {
    console.error('❌ Missing APP_URL in environment variables');
    process.exit(1);
  }

  const webhookUrl = `${appUrl.replace(/\/$/, '')}/api/telegram-webhook`;

  console.log('🔄 Setting up Telegram webhook...');
  console.log(`  Bot Token  : ${token.substring(0, 10)}...`);
  console.log(`  Webhook URL: ${webhookUrl}`);
  console.log(`  Secret     : ${secretToken ? 'SET' : 'NOT SET (webhook will accept all requests)'}`);

  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secretToken || undefined,
      allowed_updates: ['message', 'callback_query'],
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    console.error('❌ Telegram API error:', result);
    process.exit(1);
  }

  if (result.ok && result.result === true) {
    console.log('✅ Webhook registered successfully!');
    console.log('   Next steps:');
    console.log('   - Test with /start command to your bot in Telegram');
    console.log('   - Try /link command with a valid code');
    console.log('   - Check Vercel logs for incoming webhook updates');
  } else {
    console.warn('⚠️  Telegram API returned an unexpected response:', result);
  }
}

main().catch(err => {
  console.error('🔴 Unexpected error:', err);
  process.exit(1);
});
