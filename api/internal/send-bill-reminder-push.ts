import { VercelRequest, VercelResponse } from '@vercel/node';
import { sendPushNotificationToUser } from '../_lib/fcm.js';
import { createClient } from '@supabase/supabase-js';
import { logError } from '../_lib/errorLogger.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/**
 * Internal endpoint: send an FCM push to one user's registered devices.
 * Generic by design (user_id/title/body/data) — NOT specific to bill
 * reminders despite the filename; see callers below.
 *
 * WHY THIS EXISTS: Postgres/Deno don't have firebase-admin's HTTP v1
 * OAuth2 JWT signing set up (error-prone to hand-roll, and the old
 * fcm.googleapis.com/fcm/send legacy endpoint that didn't need it was
 * shut down by Google in June 2024). That signing is already wired up
 * in api/_lib/fcm.ts for this Node/Vercel runtime, so callers delegate
 * to this endpoint instead of reimplementing it themselves.
 *
 * CURRENT CALLERS (both reuse this same endpoint on purpose — see
 * migration 20260819010000_support_reply_webpush.sql for why a second
 * dedicated route wasn't added: this Vercel project is already at the
 * 12 Serverless Function limit on the Hobby plan, so any new file
 * directly under `api/` breaks deployment unless upgraded to Pro):
 *   1. bill-reminder-notifier (Supabase Edge Function, Deno) — bill due
 *      reminders, secondary channel on top of Telegram.
 *   2. notify_support_reply_push() (Postgres trigger on
 *      support_messages, AFTER INSERT WHEN sender='admin') — notifies
 *      the user when an admin replies to their Support Chat session,
 *      unless the session is closed or the user is actively viewing
 *      the chat widget (support_sessions.user_viewing).
 *
 * Auth: shared-secret header (INTERNAL_API_SECRET), not a user JWT —
 * this is a service-to-service call from another Supabase-controlled
 * environment, not something an end user's browser should ever call
 * directly.
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
    console.error('[send-bill-reminder-push] Failed:', err);
    await logError(supabaseBackend, {
      source: "internal/send-bill-reminder-push",
      level: "error",
      message: err?.message ? String(err.message) : "Gagal mengirim push reminder tagihan",
      userId: user_id,
    });
    res.status(500).json({ error: err.message || 'Failed to send push' });
  }
}
