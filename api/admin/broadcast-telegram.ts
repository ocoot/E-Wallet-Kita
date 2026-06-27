import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sendTelegramMessageOrThrow } from '../_lib/telegram.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

// Sending was previously one message at a time with a flat 50ms gap, all
// inside a single request — for a few hundred recipients that's tens of
// seconds of wall-clock time, easily exceeding this function's default
// 10s duration on Vercel's Hobby plan (no partial-progress is saved if it
// gets cut off mid-broadcast). Two changes address this together:
//   1. Send in small concurrent batches instead of strictly one-by-one —
//      Telegram's own limit for messages to *different* chats is ~30/sec,
//      so a batch of 20 fired together stays comfortably under that.
//   2. Raise this function's own duration ceiling (see vercel.json) so
//      there's still headroom even for larger recipient lists.
// This is still a single-request, in-memory broadcast — fine at current
// scale, but if the Telegram user base grows into the thousands this
// should move to a background job (e.g. processed in chunks via cron)
// instead of one request handling the whole list.
const BROADCAST_BATCH_SIZE = 20;
const BROADCAST_BATCH_DELAY_MS = 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // 1. Auth check
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  const token = authHeader.split(' ')[1];
  
  // Use client with user's token
  const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader
      }
    }
  });

  const { data: { user }, error: authError } = await userSupabase.auth.getUser();
  if (authError || !user) {
    res.status(401).json({ error: 'Invalid token or unauthorized session' });
    return;
  }

  // Check role of user
  const { data: profile, error: profileError } = await userSupabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || !["admin", "owner"].includes(profile.role)) {
    res.status(403).json({ error: 'Forbidden: Only admins or owners can broadcast' });
    return;
  }

  // Parse message
  const { message } = req.body;
  if (!message || typeof message !== 'string' || message.trim().length < 5) {
    res.status(400).json({ error: 'Pesan broadcast minimal 5 karakter' });
    return;
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN tidak dikonfigurasi' });
    return;
  }

  // Fetch target list through rpc
  const { data: targets, error: rpcError } = await userSupabase.rpc("admin_get_telegram_chat_ids");
  if (rpcError) {
    res.status(500).json({ error: rpcError.message });
    return;
  }

  const broadcastText = `📢 *Pesan dari Admin E-Wallet Kita*\n\n${message.trim()}\n\n_— Tim E-Wallet Kita_`;

  let successCount = 0;
  let failCount = 0;
  const allTargets = targets || [];

  for (let i = 0; i < allTargets.length; i += BROADCAST_BATCH_SIZE) {
    const batch = allTargets.slice(i, i + BROADCAST_BATCH_SIZE);

    // Centralized helper: same retry/backoff behavior as the webhook,
    // instead of a bare fetch() with no resilience to transient Telegram
    // API hiccups. Promise.allSettled so one chat failing (e.g. user
    // blocked the bot) doesn't affect the rest of the batch.
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

    const isLastBatch = i + BROADCAST_BATCH_SIZE >= allTargets.length;
    if (!isLastBatch) {
      await new Promise(r => setTimeout(r, BROADCAST_BATCH_DELAY_MS));
    }
  }

  res.status(200).json({
    success: true,
    total: allTargets.length,
    successCount,
    failCount
  });
}