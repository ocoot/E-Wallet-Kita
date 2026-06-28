import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sendPushNotificationBatch } from '../_lib/fcm.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/**
 * Admin broadcast via FCM push notifications.
 *
 * This endpoint is the push counterpart to broadcast-telegram — same auth
 * flow (Bearer JWT → admin/owner check), same batching strategy, but
 * delivers to FCM device tokens via sendPushNotificationBatch instead of
 * Telegram chat messages. FCM allows up to 500 tokens per multicast call,
 * so batches are substantially larger than Telegram's per-second limit.
 */
const BROADCAST_BATCH_SIZE = 500;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // ── Auth check ─────────────────────────────────────────────────
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  if (!supabaseAnonKey) {
    res.status(500).json({ error: 'SUPABASE_ANON_KEY tidak dikonfigurasi' });
    return;
  }

  // Client with user's JWT so RLS checks apply
  // Authorization header di-set di createClient — getUser() tanpa arg
  // sudah cukup untuk validasi token (tidak perlu pass token sebagai arg,
  // yang sudah deprecated di Supabase JS v2+)
  const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
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

  // ── Validate request body ──────────────────────────────────────
  const { title, message } = req.body;
  if (!title || typeof title !== 'string' || title.trim().length < 3) {
    res.status(400).json({ error: 'Judul broadcast minimal 3 karakter' });
    return;
  }
  if (!message || typeof message !== 'string' || message.trim().length < 5) {
    res.status(400).json({ error: 'Isi broadcast minimal 5 karakter' });
    return;
  }

  // ── Fetch FCM tokens (via service-role client to bypass RLS) ───
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
    return;
  }

  if (!tokens || tokens.length === 0) {
    res.status(200).json({ success: true, total: 0, successCount: 0, failCount: 0 });
    return;
  }

  const allTokens = tokens.map(r => r.fcm_token).filter(Boolean) as string[];
  const total = allTokens.length;
  let successCount = 0;
  let failCount = 0;

  // ── Send in batches matching FCM multicast limit ──────────────
  const body = message.trim();

  for (let i = 0; i < total; i += BROADCAST_BATCH_SIZE) {
    const batch = allTokens.slice(i, i + BROADCAST_BATCH_SIZE);
    try {
      const result = await sendPushNotificationBatch(batch, title.trim(), body);
      successCount += result.successCount;
      failCount += result.failCount;
    } catch (err) {
      failCount += batch.length;
      console.error('[Push Broadcast] Batch failed:', err);
    }
  }

  res.status(200).json({
    success: true,
    total,
    successCount,
    failCount
  });
}