import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { transcribeVoiceNote } from './_lib/voice-transcriber.js';
import { getMaintenanceStatus, isFeatureLocked } from './_lib/maintenance.js';
import { logError } from './_lib/errorLogger.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Same cap Telegram uses (api/telegram-webhook.ts handleVoiceNote) — keeps
// behaviour/UX consistent across both channels and bounds the audio
// payload size / Gemini cost per request.
const MAX_DURATION_SECONDS = 60;
// Rough OGG/Opus voice-note bitrate ceiling: ~60s of typical voice audio
// as base64 comfortably fits under 2MB. This is a payload sanity check,
// not a precise duration check (browsers don't always report duration).
const MAX_AUDIO_BASE64_BYTES = 3 * 1024 * 1024;

// ─────────────────────────────────────────────────────────────
// Reuse the same DB-backed AI rate limit RPC as /api/parse-transaction
// (see that file for why this moved from in-memory to Postgres). Voice
// transcription is at least as expensive as a text AI parse, so it's
// gated by the same AI-specific limit rather than a separate counter.
// ─────────────────────────────────────────────────────────────
const AI_RATE_LIMIT = 5;
const AI_RATE_LIMIT_WINDOW = 60000; // 1 minute

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // 1. Auth check
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const token = authHeader.split(' ')[1];
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // 1b. Premium check — Voice Note Logging is a premium feature (same
  // tier as Receipt OCR). Guests (anonymous auth users) and non-premium
  // accounts are rejected here too, not just hidden behind the button in
  // VoiceRecorder.tsx, so this endpoint can't be called directly to
  // bypass the paywall.
  if (user.is_anonymous) {
    res.status(403).json({ error: 'Fitur Catat via Suara memerlukan akun terdaftar (bukan tamu).', code: 'GUEST_NOT_ALLOWED' });
    return;
  }
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('is_premium')
    .eq('id', user.id)
    .single();
  if (profileError || !profile?.is_premium) {
    res.status(402).json({ error: 'Fitur Catat via Suara adalah fitur khusus Pengguna Premium.', code: 'PREMIUM_REQUIRED' });
    return;
  }

  // 2. Maintenance / feature-lock check — voice note is a "catat transaksi
  // cepat" entry point, same category as typed natural-language text, so
  // it's gated by the same 'new_transaction' feature key the bot uses.
  // Checked server-side (not just hidden in the UI) so this endpoint can't
  // be called directly to bypass an admin lock.
  const maintenanceStatus = await getMaintenanceStatus(supabase);
  if (isFeatureLocked(maintenanceStatus, 'new_transaction')) {
    res.status(423).json({ error: 'Fitur pencatatan transaksi sedang dikunci oleh admin untuk maintenance.' });
    return;
  }

  // 3. Rate limiting (per user, DB-backed, same RPC as parse-transaction)
  const { data: rateLimitRows, error: rateLimitError } = await supabase.rpc(
    'check_and_increment_parse_rate_limit',
    {
      p_user_id: user.id,
      p_will_use_ai: true,
      p_limit: AI_RATE_LIMIT,
      p_window_seconds: AI_RATE_LIMIT_WINDOW / 1000,
      p_ai_limit: AI_RATE_LIMIT,
      p_ai_window_seconds: AI_RATE_LIMIT_WINDOW / 1000,
    }
  );

  if (rateLimitError) {
    // Fail-open on a DB hiccup — same rationale as parse-transaction.
    console.error('[parse-voice] rate limit check failed, failing open:', rateLimitError);
  } else {
    const limitResult = rateLimitRows?.[0];
    if (limitResult && !limitResult.allowed) {
      res.status(429).json({
        error: 'Too many voice requests. Please try again in a moment.',
        retryAfter: limitResult.retry_after_seconds,
      });
      return;
    }
  }

  try {
    const { audioBase64, mimeType, durationSeconds } = req.body;

    if (!audioBase64 || typeof audioBase64 !== "string") {
      res.status(400).json({ error: "Missing audioBase64 string of the voice note" });
      return;
    }

    if (typeof durationSeconds === "number" && durationSeconds > MAX_DURATION_SECONDS) {
      res.status(400).json({ error: `Voice note too long (max ${MAX_DURATION_SECONDS}s)` });
      return;
    }

    let cleanBase64 = audioBase64;
    let resolvedMimeType = typeof mimeType === "string" && mimeType ? mimeType : "audio/webm";
    if (cleanBase64.includes(";base64,")) {
      const parts = cleanBase64.split(";base64,");
      cleanBase64 = parts[1];
      resolvedMimeType = parts[0].replace("data:", "").split(";")[0] || resolvedMimeType;
    }

    if (cleanBase64.length > MAX_AUDIO_BASE64_BYTES) {
      res.status(413).json({ error: "Voice note file is too large" });
      return;
    }

    // traceId dipakai untuk mengaitkan log request ini dengan log
    // per-attempt di dalam transcribeVoiceNote (lihat Runtime Logs Vercel).
    const traceId = `vt_web_${user.id}_${Date.now()}`;
    console.log(
      `[${traceId}] Voice note diterima dari web — userId=${user.id} ` +
      `clientMimeType=${typeof mimeType === "string" ? mimeType : "unknown"} ` +
      `resolvedMimeType="${resolvedMimeType}" durationSeconds=${durationSeconds ?? "unknown"} ` +
      `base64Len=${cleanBase64.length}`
    );

    const transcript = await transcribeVoiceNote(cleanBase64, resolvedMimeType, traceId);

    if (!transcript) {
      console.error(`[${traceId}] transcribeVoiceNote returned null — lihat log "${traceId}" di atas untuk detail kegagalan tiap model.`);
      await logError(supabase, {
        source: "parse-voice",
        level: "error",
        message: "transcribeVoiceNote returned null — semua model Gemini gagal atau tidak ada API key tersedia.",
        userId: user?.id ?? null,
        traceId,
      });
      res.status(422).json({ error: "Gagal mentranskrip pesan suara. Coba rekam ulang dengan lebih jelas." });
      return;
    }

    res.json({ transcript });
  } catch (err: any) {
    console.error("parse-voice endpoint error:", err);
    await logError(supabase, {
      source: "parse-voice",
      level: "error",
      message: err?.message ? String(err.message) : "Terjadi kesalahan internal ketika memproses pesan suara",
      userId: user?.id ?? null,
    });
    res.status(500).json({ error: err.message || "Terjadi kesalahan internal ketika memproses pesan suara" });
  }
}
