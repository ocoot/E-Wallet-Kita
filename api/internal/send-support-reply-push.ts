import { VercelRequest, VercelResponse } from '@vercel/node';
import { sendPushNotificationToUser } from '../_lib/fcm.js';
import { createClient } from '@supabase/supabase-js';
import { logError } from '../_lib/errorLogger.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/**
 * Internal endpoint: kirim webpush FCM ke satu user saat admin membalas
 * sesi Support Chat-nya.
 *
 * KENAPA INI ADA: trigger Postgres `notify_support_reply_push()` (lihat
 * migration 20260819010000_support_reply_webpush.sql) berjalan tiap kali
 * ada INSERT ke support_messages dengan sender='admin', SUDAH mengecek di
 * SQL apakah sesi masih terbuka & apakah user sedang membuka widget chat
 * sesi itu (skip kalau iya, supaya tidak dobel dengan notifikasi Realtime
 * + suara di SupportChatWidget.tsx). Kalau lolos dua pengecekan itu,
 * trigger memanggil endpoint ini lewat net.http_post untuk benar-benar
 * mengirim push-nya -- pola & alasan yang sama dengan
 * send-bill-reminder-push.ts (Postgres/Deno tidak punya setup OAuth2 JWT
 * signing firebase-admin, jadi didelegasikan ke runtime Node/Vercel ini
 * yang sudah punya `sendPushNotificationToUser`).
 *
 * Auth: shared-secret header (INTERNAL_API_SECRET, HARUS sama dengan
 * vault secret 'internal_api_secret' yang dipakai trigger), bukan JWT
 * user -- ini panggilan service-to-service dari Supabase, bukan sesuatu
 * yang boleh dipanggil langsung oleh browser user.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const internalSecret = process.env.INTERNAL_API_SECRET || '';
  const providedSecret = req.headers['x-internal-secret'];
  if (!internalSecret || providedSecret !== internalSecret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { user_id, title, body, data } = req.body || {};
  if (!user_id || typeof user_id !== 'string') {
    res.status(400).json({ error: 'user_id is required' });
    return;
  }
  if (!title || !body || typeof title !== 'string' || typeof body !== 'string') {
    res.status(400).json({ error: 'title and body are required' });
    return;
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    res.status(500).json({ error: 'Supabase service role not configured' });
    return;
  }

  const supabaseBackend = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const result = await sendPushNotificationToUser(
      supabaseBackend,
      user_id,
      title,
      body,
      typeof data === 'object' && data !== null ? data : undefined
    );
    res.status(200).json({ success: true, ...result });
  } catch (err: any) {
    console.error('[send-support-reply-push] Failed:', err);
    await logError(supabaseBackend, {
      source: "internal/send-support-reply-push",
      level: "error",
      message: err?.message ? String(err.message) : "Gagal mengirim push balasan admin support",
      userId: user_id,
    });
    res.status(500).json({ error: err.message || 'Failed to send push' });
  }
}
