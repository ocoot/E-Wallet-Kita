import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sendPushNotificationBatch } from '../_lib/fcm.js';
import { sendTelegramMessageOrThrow } from '../_lib/telegram.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// FCM allows up to 500 tokens per multicast call.
const PUSH_BATCH_SIZE = 500;

// Telegram limit for messages to *different* chats is ~30/sec;
// a batch of 20 fired together stays comfortably under that.
const TELEGRAM_BATCH_SIZE = 20;
const TELEGRAM_BATCH_DELAY_MS = 1000;

/**
 * Unified admin broadcast endpoint.
 *
 * Replaces two separate functions (broadcast-push.ts & broadcast-telegram.ts)
 * to stay within Vercel's 12-function limit on Hobby plan.
 *
 * POST /api/admin/broadcast
 * Body:
 *   channel  : "push" | "telegram"   — which delivery channel to use
 *   title    : string                 — required for "push"; ignored for "telegram"
 *   message  : string                 — the message body (required for both)
 *
 * Auth: Bearer JWT (user must have role "admin" or "owner" in the users table).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // ── Auth check ─────────────────────────────────────────────────────────────
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  if (!supabaseAnonKey) {
    res.status(500).json({ error: 'SUPABASE_ANON_KEY tidak dikonfigurasi' });
    return;
  }

  // Use client with user's JWT so RLS checks apply on the role lookup.
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

  // ── Route to the correct channel ───────────────────────────────────────────
  if (channel === 'push') {
    return handlePushBroadcast(req, res, title, message);
  } else {
    return handleTelegramBroadcast(res, userSupabase, message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FCM Push broadcast
// (previously: api/admin/broadcast-push.ts)
// ─────────────────────────────────────────────────────────────────────────────
async function handlePushBroadcast(
  req: VercelRequest,
  res: VercelResponse,
  title: string,
  message: string
) {
  if (!title || typeof title !== 'string' || title.trim().length < 3) {
    res.status(400).json({ error: 'Judul broadcast minimal 3 karakter' });
    return;
  }

  if (!supabaseServiceKey) {
    res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY tidak dikonfigurasi' });
    return;
  }

  const supabaseBackend = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    supabaseServiceKey
  );

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

  const body = message.trim();

  for (let i = 0; i < total; i += PUSH_BATCH_SIZE) {
    const batch = allTokens.slice(i, i + PUSH_BATCH_SIZE);
    try {
      const result = await sendPushNotificationBatch(batch, title.trim(), body);
      successCount += result.successCount;
      failCount += result.failCount;
    } catch (err) {
      failCount += batch.length;
      console.error('[Push Broadcast] Batch failed:', err);
    }
  }

  res.status(200).json({ success: true, total, successCount, failCount });
}

// ─────────────────────────────────────────────────────────────────────────────
// Telegram broadcast
// (previously: api/admin/broadcast-telegram.ts)
// ─────────────────────────────────────────────────────────────────────────────
async function handleTelegramBroadcast(
  res: VercelResponse,
  userSupabase: ReturnType<typeof createClient>,
  message: string
) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN tidak dikonfigurasi' });
    return;
  }

  const { data: targets, error: rpcError } = await userSupabase.rpc('admin_get_telegram_chat_ids');
  if (rpcError) {
    res.status(500).json({ error: rpcError.message });
    return;
  }

  const broadcastText = `📢 *Pesan dari Admin E-Wallet Kita*\n\n${message.trim()}\n\n_— Tim E-Wallet Kita_`;

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
}
