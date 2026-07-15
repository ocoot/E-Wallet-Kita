import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { sendPushNotificationBatch } from '../_lib/fcm.js';
import { sendTelegramMessageOrThrow } from '../_lib/telegram.js';
import { logError } from '../_lib/errorLogger.js';
import { getUsersWithDisabledPreference } from '../_lib/notificationPreferences.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const updateNotifySecret = process.env.UPDATE_NOTIFY_SECRET || '';

const PUSH_BATCH_SIZE = 500;
const TELEGRAM_BATCH_SIZE = 20;
const TELEGRAM_BATCH_DELAY_MS = 1000;

/**
 * Bandingkan dua string secara constant-time supaya waktu eksekusi tidak
 * bocor informasi soal seberapa banyak karakter awal yang cocok (mencegah
 * timing attack terhadap UPDATE_NOTIFY_SECRET). Panjang berbeda dianggap
 * langsung tidak cocok tanpa membandingkan isi.
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Unified admin broadcast endpoint.
 *
 * Replaces two separate functions (broadcast-push.ts & broadcast-telegram.ts)
 * to stay within Vercel's 12-function limit on Hobby plan.
 *
 * POST /api/admin/broadcast
 * Body:
 *   channel  : "push" | "telegram"
 *   title    : string  — required for "push"; ignored for "telegram"
 *   message  : string  — required for both
 *   data     : object  — opsional, hanya dipakai untuk channel "push"
 *                        (mis. { type: "app_update" } agar frontend/SW bisa
 *                        membedakan notifikasi update versi dari broadcast biasa)
 *
 * Auth: salah satu dari —
 *   1. Bearer JWT (user harus role "admin" atau "owner") — dipakai Admin Panel.
 *   2. Header "x-update-secret" (harus cocok dengan env UPDATE_NOTIFY_SECRET)
 *      — dipakai otomatis oleh CI/CD (lihat .github/workflows/notify-update.yml)
 *      setelah deploy sukses. Jalur ini dikunci hanya untuk channel push
 *      bertanda data.type="app_update".
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // ── Jalur khusus: system-to-system call dari CI/CD (GitHub Actions) ──
  //
  // Dipakai HANYA untuk notifikasi otomatis "versi baru tersedia" setelah
  // deploy sukses (lihat .github/workflows/notify-update.yml). Sengaja
  // TIDAK memakai JWT user karena tidak ada user yang login di pipeline
  // CI — sebagai gantinya memakai secret tetap yang hanya diketahui oleh
  // Vercel (env var) dan GitHub Actions (repo secret).
  //
  // Untuk membatasi blast radius kalau secret ini bocor, jalur ini SENGAJA
  // dikunci: hanya boleh channel push, judul/isi boleh dioverride lewat
  // body tapi selalu ditandai data.type="app_update" (tidak bisa dipakai
  // mengirim pesan bebas ke Telegram atau push dengan tag lain).
  const updateSecretHeader = req.headers['x-update-secret'];
  const providedSecret = Array.isArray(updateSecretHeader) ? updateSecretHeader[0] : updateSecretHeader;

  if (typeof providedSecret === 'string' && providedSecret.length > 0) {
    if (!updateNotifySecret) {
      res.status(500).json({ error: 'UPDATE_NOTIFY_SECRET tidak dikonfigurasi di server' });
      return;
    }
    if (!timingSafeEqualStr(providedSecret, updateNotifySecret)) {
      // Catat percobaan gagal (tanpa mencatat nilai secret itu sendiri)
      // sebagai sinyal keamanan kalau ada yang mencoba menebak secret.
      if (supabaseServiceKey) {
        await logError(createClient(supabaseUrl, supabaseServiceKey), {
          source: 'admin/broadcast:system-auth',
          level: 'warning',
          message: 'Percobaan x-update-secret tidak valid pada /api/admin/broadcast',
        });
      }
      res.status(401).json({ error: 'Invalid update secret' });
      return;
    }

    if (!supabaseServiceKey) {
      res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY tidak dikonfigurasi' });
      return;
    }

    const bodyTitle = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const bodyMessage = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const finalTitle = bodyTitle || 'Pembaruan Tersedia';
    const finalMessage = bodyMessage || 'Versi terbaru E-Wallet Kita sudah siap. Ketuk untuk memperbarui.';

    return handlePushBroadcast(res, finalTitle, finalMessage, { type: 'app_update' });
  }

  // ── Auth check (jalur normal: admin/owner login lewat Admin Panel) ──────────
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  if (!supabaseAnonKey) {
    res.status(500).json({ error: 'SUPABASE_ANON_KEY tidak dikonfigurasi' });
    return;
  }

  const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await userSupabase.auth.getUser();
  if (authError || !user) {
    res.status(401).json({ error: 'Invalid token or unauthorized session' });
    return;
  }

  const { data: profile, error: profileError } = await userSupabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || !['admin', 'owner'].includes(profile.role)) {
    res.status(403).json({ error: 'Forbidden: Only admins or owners can broadcast' });
    return;
  }

  // ── Validate body ──────────────────────────────────────────────────────────
  const { channel, title, message } = req.body;

  if (!channel || !['push', 'telegram'].includes(channel)) {
    res.status(400).json({ error: 'channel harus "push" atau "telegram"' });
    return;
  }

  if (!message || typeof message !== 'string' || message.trim().length < 5) {
    res.status(400).json({ error: 'Isi broadcast minimal 5 karakter' });
    return;
  }

  // Data tambahan opsional untuk push (mis. { type: "app_update" }) yang
  // dipakai firebase-messaging-sw.js untuk membedakan notifikasi update
  // versi dari broadcast biasa (lihat scripts/inject-push-handler.mjs).
  const pushData = (req.body?.data && typeof req.body.data === 'object')
    ? req.body.data as Record<string, string>
    : undefined;

  // ── Route to correct channel ───────────────────────────────────────────────
  if (channel === 'push') {
    return handlePushBroadcast(res, title, message, pushData);
  } else {
    return handleTelegramBroadcast(req, res, authHeader, message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FCM Push broadcast
// (previously: api/admin/broadcast-push.ts)
// ─────────────────────────────────────────────────────────────────────────────
async function handlePushBroadcast(
  res: VercelResponse,
  title: string,
  message: string,
  data?: Record<string, string>,
) {
  if (!title || typeof title !== 'string' || title.trim().length < 3) {
    res.status(400).json({ error: 'Judul broadcast minimal 3 karakter' });
    return;
  }

  if (!supabaseServiceKey) {
    res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY tidak dikonfigurasi' });
    return;
  }

  const supabaseBackend = createClient(supabaseUrl, supabaseServiceKey);

  const { data: tokens, error: dbError } = await supabaseBackend
    .from('user_push_tokens')
    .select('fcm_token, user_id')
    .not('fcm_token', 'is', null);

  if (dbError) {
    res.status(500).json({ error: dbError.message });
    await logError(supabaseBackend, {
      source: "admin/broadcast:push",
      level: "error",
      message: `Gagal mengambil daftar fcm_token: ${dbError.message}`,
    });
    return;
  }

  if (!tokens || tokens.length === 0) {
    res.status(200).json({ success: true, total: 0, successCount: 0, failCount: 0 });
    return;
  }

  // Skip token milik user yang mematikan toggle "push_broadcast" di
  // Settings (ini juga mencakup notifikasi "app_update" dari CI/CD, karena
  // keduanya lewat handlePushBroadcast() yang sama). Fail-open: user yang
  // belum punya baris preferensi tetap dianggap menerima broadcast.
  const disabledUserIds = await getUsersWithDisabledPreference(supabaseBackend, 'push_broadcast');
  const allTokens = tokens
    .filter((r: { fcm_token: string; user_id: string }) => !disabledUserIds.has(r.user_id))
    .map((r: { fcm_token: string }) => r.fcm_token)
    .filter(Boolean) as string[];

  if (allTokens.length === 0) {
    res.status(200).json({ success: true, total: 0, successCount: 0, failCount: 0 });
    return;
  }
  const total = allTokens.length;
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < total; i += PUSH_BATCH_SIZE) {
    const batch = allTokens.slice(i, i + PUSH_BATCH_SIZE);
    try {
      const result = await sendPushNotificationBatch(batch, title.trim(), message.trim(), data);
      successCount += result.successCount;
      failCount += result.failCount;
    } catch (err) {
      failCount += batch.length;
      console.error('[Push Broadcast] Batch failed:', err);
    }
  }

  if (failCount > 0) {
    await logError(supabaseBackend, {
      source: "admin/broadcast:push",
      level: failCount === total ? "error" : "warning",
      message: `Push broadcast: ${failCount}/${total} pengiriman gagal.`,
      context: { total, successCount, failCount },
    });
  }

  res.status(200).json({ success: true, total, successCount, failCount });
}

// ─────────────────────────────────────────────────────────────────────────────
// Telegram broadcast
// (previously: api/admin/broadcast-telegram.ts)
// Client dibuat ulang di sini (tidak di-pass dari handler) untuk menghindari
// TypeScript generic mismatch pada SupabaseClient parameter type.
// ─────────────────────────────────────────────────────────────────────────────
async function handleTelegramBroadcast(
  req: VercelRequest,
  res: VercelResponse,
  authHeader: string,
  message: string,
) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN tidak dikonfigurasi' });
    return;
  }

  // Buat client baru dengan authHeader — tidak di-pass dari handler
  // supaya tidak ada TypeScript generic mismatch pada parameter type.
  const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: targets, error: rpcError } = await userSupabase.rpc('admin_get_telegram_chat_ids');
  if (rpcError) {
    res.status(500).json({ error: rpcError.message });
    if (supabaseServiceKey) {
      await logError(createClient(supabaseUrl, supabaseServiceKey), {
        source: "admin/broadcast:telegram",
        level: "error",
        message: `admin_get_telegram_chat_ids gagal: ${rpcError.message}`,
      });
    }
    return;
  }

  const broadcastText = `*Pesan dari Admin E-Wallet Kita*\n\n${message.trim()}\n\n_— Tim E-Wallet Kita_`;

  let successCount = 0;
  let failCount = 0;
  const allTargets = targets || [];

  for (let i = 0; i < allTargets.length; i += TELEGRAM_BATCH_SIZE) {
    const batch = allTargets.slice(i, i + TELEGRAM_BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map((target: { chat_id: number | string }) =>
        sendTelegramMessageOrThrow(Number(target.chat_id), broadcastText)
      )
    );

    for (let j = 0; j < results.length; j++) {
      if (results[j].status === 'fulfilled') {
        successCount++;
      } else {
        failCount++;
        console.error(
          `Telegram sendMessage failed for chat ${batch[j].chat_id}:`,
          (results[j] as PromiseRejectedResult).reason
        );
      }
    }

    const isLastBatch = i + TELEGRAM_BATCH_SIZE >= allTargets.length;
    if (!isLastBatch) {
      await new Promise(r => setTimeout(r, TELEGRAM_BATCH_DELAY_MS));
    }
  }

  res.status(200).json({
    success: true,
    total: allTargets.length,
    successCount,
    failCount,
  });

  if (failCount > 0 && supabaseServiceKey) {
    await logError(createClient(supabaseUrl, supabaseServiceKey), {
      source: "admin/broadcast:telegram",
      level: failCount === allTargets.length ? "error" : "warning",
      message: `Telegram broadcast: ${failCount}/${allTargets.length} pengiriman gagal.`,
      context: { total: allTargets.length, successCount, failCount },
    });
  }
}
