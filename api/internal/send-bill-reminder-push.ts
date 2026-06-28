import { VercelRequest, VercelResponse } from '@vercel/node';
import { sendPushNotificationToUser } from '../_lib/fcm.js';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/**
 * Internal endpoint: send an FCM push to one user's registered devices.
 *
 * WHY THIS EXISTS: the bill-reminder-notifier Supabase Edge Function runs
 * on Deno and only sends Telegram messages today. To also notify via FCM
 * push (secondary channel, on top of Telegram — see #7 in the FCM audit),
 * it needs firebase-admin's HTTP v1 signing, which is already wired up in
 * api/_lib/fcm.ts for this Node/Vercel runtime. Rather than reimplementing
 * FCM HTTP v1's OAuth2 JWT signing in Deno (error-prone to hand-roll,
 * and the old fcm.googleapis.com/fcm/send legacy endpoint that doesn't
 * need that signing was shut down by Google in June 2024), the edge
 * function calls this endpoint, which reuses the existing, tested
 * firebase-admin setup.
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
    res.status(500).json({ error: err.message || 'Failed to send push' });
  }
}
