/**
 * scripts/setup-support-telegram-webhook.ts
 *
 * One-time setup script untuk mendaftarkan webhook bot SUPPORT (bot khusus
 * live chat admin, terpisah dari bot asisten AI pribadi) ke Telegram API.
 * Ini kenapa `/register` di supergroup support tidak pernah dijawab
 * sama sekali sebelumnya -- webhook-nya memang belum pernah didaftarkan,
 * jadi Telegram tidak tahu ke mana harus mengirim update dari bot ini.
 *
 * Bot ini SENGAJA dipisah dari bot utama (TELEGRAM_BOT_TOKEN /
 * scripts/setup-telegram-webhook.ts) supaya keduanya independen -- setup
 * ulang webhook bot support tidak akan pernah mengganggu asisten AI
 * pribadi di private chat, dan sebaliknya.
 *
 * Cara pakai:
 *   npx tsx scripts/setup-support-telegram-webhook.ts
 *
 * Environment variables yang dibutuhkan (bisa dari .env lokal):
 *   TELEGRAM_SETUP_TOKEN        — wajib, token pengaman yang sama dengan
 *                                  setup script bot utama
 *   SUPPORT_TELEGRAM_BOT_TOKEN  — wajib, token bot support dari @BotFather
 *   SUPABASE_URL                — wajib, dipakai untuk menyusun URL Edge
 *                                  Function `support-bridge`
 *   SUPPORT_TELEGRAM_WEBHOOK_SECRET — opsional tapi sangat direkomendasikan;
 *                                  dipakai sebagai secret_token di Telegram
 *                                  setWebhook agar support-bridge bisa
 *                                  memvalidasi request benar-benar dari
 *                                  Telegram (bukan dipalsukan pihak lain)
 */

import 'dotenv/config';

async function main() {
  const validToken = process.env.TELEGRAM_SETUP_TOKEN;
  if (!validToken) {
    console.error('TELEGRAM_SETUP_TOKEN not configured in environment variables');
    process.exit(1);
  }

  const token = process.env.SUPPORT_TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('Missing SUPPORT_TELEGRAM_BOT_TOKEN in environment variables');
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    console.error('Missing SUPABASE_URL in environment variables');
    process.exit(1);
  }

  const secretToken = process.env.SUPPORT_TELEGRAM_WEBHOOK_SECRET;

  const webhookUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/support-bridge`;

  console.log('Setting up SUPPORT Telegram webhook...');
  console.log(`  Bot Token   : ${token.substring(0, 10)}...`);
  console.log(`  Webhook URL : ${webhookUrl}`);
  console.log(`  Secret Token: ${secretToken ? 'SET' : 'NOT SET'}`);

  if (!secretToken) {
    console.warn(' SUPPORT_TELEGRAM_WEBHOOK_SECRET tidak di-set -- support-bridge akan');
    console.warn('   MENOLAK semua update Telegram sampai variabel ini di-set (lihat validasi');
    console.warn('   di supabase/functions/support-bridge/index.ts). Set dulu env-nya, lalu');
    console.warn('   jalankan ulang script ini.');
    process.exit(1);
  }

  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secretToken,
        allowed_updates: ['message', 'callback_query'],
      }),
    });
  } catch (err: any) {
    console.error('Setup Support Telegram Webhook error:', err);
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
    console.log('Support bot webhook registered successfully to Telegram API');
    console.log('');
    console.log('   webhook_url      :', webhookUrl);
    console.log('   telegram_response:', JSON.stringify(result, null, 2));
    console.log('');
    console.log('   Next steps:');
    console.log('   - Pastikan bot support ini sudah jadi admin di supergroup dengan izin "Manage Topics"');
    console.log('   - Di grup, ketik: /register@<username_bot_support> (sebut nama botnya secara');
    console.log('     eksplisit kalau ada bot lain juga di grup yang sama)');
    console.log('   - Kalau masih tidak ada respons, cek:');
    console.log(`     https://api.telegram.org/bot${token.substring(0, 10)}.../getWebhookInfo`);
    console.log('     lihat field "last_error_message" untuk detail kegagalan pengiriman terakhir');
  } else {
    console.warn(' Telegram API returned an unexpected response:');
    console.warn('   webhook_url      :', webhookUrl);
    console.warn('   telegram_response:', JSON.stringify(result, null, 2));
  }
}

main().catch((err: any) => {
  console.error('Setup Support Telegram Webhook error:', err);
  console.error('   message:', err.message);
  process.exit(1);
});
