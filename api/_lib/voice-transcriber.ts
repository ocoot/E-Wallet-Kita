import { GoogleGenAI } from "@google/genai";

// ─────────────────────────────────────────────────────────────
// Voice note transcription (audio → plain text)
//
// Shared between the Telegram bot (api/telegram-webhook.ts) and the web
// app (api/parse-voice.ts). Both hand the raw transcript to the SAME
// parseFinancialQuery / /api/parse-transaction pipeline used for typed
// text, so no new amount/category parsing logic exists for voice — only
// "turn audio into text" is voice-specific.
//
// NOTE: api/telegram-webhook.ts currently has its own inline copy of this
// same logic (transcribeVoiceNote + GEMINI_MODEL_CHAIN). It was left
// untouched here to avoid any risk of changing the already-shipped bot
// behaviour; this module is a verbatim extraction of that logic for the
// new web endpoint. If desired later, telegram-webhook.ts can be
// refactored to import from here instead of keeping its own copy.
// ─────────────────────────────────────────────────────────────

interface GeminiModelConfig {
  model: string;
  timeoutMs: number;
  thinkingConfig: Record<string, unknown>;
}

// IMPORTANT: Gemini 3.x uses `thinkingLevel`; Gemini 2.5 uses `thinkingBudget`.
// Sending thinkingLevel to a 2.5-series model causes a 400 error, not a
// graceful ignore — each entry must carry the shape its own model accepts.
const GEMINI_MODEL_CHAIN: GeminiModelConfig[] = [
  { model: "gemini-3.5-flash",        timeoutMs: 7000, thinkingConfig: { thinkingLevel: "low" } },
  { model: "gemini-3.1-pro-preview",  timeoutMs: 7000, thinkingConfig: { thinkingLevel: "low" } },
  { model: "gemini-3-flash-preview",  timeoutMs: 5000, thinkingConfig: { thinkingLevel: "low" } },
  { model: "gemini-3.1-flash-lite",   timeoutMs: 4000, thinkingConfig: { thinkingLevel: "minimal" } },
  { model: "gemini-2.5-pro",          timeoutMs: 6000, thinkingConfig: { thinkingBudget: 128 } },
  { model: "gemini-2.5-flash",        timeoutMs: 5000, thinkingConfig: { thinkingBudget: 0 } },
  { model: "gemini-2.5-flash-lite",   timeoutMs: 4000, thinkingConfig: { thinkingBudget: 0 } },
];

// FIX (2026-07-04): GEMINI_API_KEY (tanpa suffix) TIDAK di-set di Vercel —
// dikonfirmasi lewat log "GEMINI_API_KEY is not set (ai client is null)".
// Sementara itu api/_lib/receipt-parser.ts sudah punya pool key yang aktif
// (GEMINI_API_KEY_1..4) untuk fitur OCR struk. Voice transcription tidak
// punya fallback non-AI (beda dengan parse-transaction.ts yang diam-diam
// jatuh ke regex), jadi tanpa key yang valid fitur ini 100% mati. Fallback
// ke key pertama dari pool yang sama supaya fitur langsung berfungsi
// menggunakan credential yang sudah terbukti aktif, tanpa menunggu env var
// baru ditambahkan di Vercel. GEMINI_API_KEY (kalau di-set nanti) tetap
// diprioritaskan lebih dulu.
const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_1;
const apiKeySource = process.env.GEMINI_API_KEY
  ? "GEMINI_API_KEY"
  : process.env.GEMINI_API_KEY_1
  ? "GEMINI_API_KEY_1 (fallback dari pool receipt-parser)"
  : "none";
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: { "User-Agent": "aistudio-build" }
    }
  });
}
console.log(`🔑 [voice-transcriber] Gemini API key source: ${apiKeySource}`);

// ─────────────────────────────────────────────────────────────
// DEBUG LOGGING (added 2026-07-04)
//
// Same root-cause investigation as the Telegram bot's inline copy of
// this function (see api/telegram-webhook.ts): every model in the
// chain failing at once, on every voice note, points at a codec/format
// mismatch rather than a per-model capability gap — but this only
// logged `err?.message` before, and the caller's HTTP status doesn't
// reveal WHY transcription failed. These logs make each attempt's
// outcome (thrown error with status/code, or a silent empty transcript
// with its finishReason) visible in Vercel's Runtime Logs.
// ─────────────────────────────────────────────────────────────
function describeAudioForLog(base64Audio: string, mimeType: string): string {
  const approxBytes = Math.floor((base64Audio.length * 3) / 4);
  return `mimeType="${mimeType}" base64Len=${base64Audio.length} approxAudioBytes=${approxBytes} (~${(approxBytes / 1024).toFixed(1)}KB)`;
}

function describeGeminiError(err: any): string {
  const parts: string[] = [];
  if (err?.status !== undefined) parts.push(`status=${err.status}`);
  if (err?.code !== undefined) parts.push(`code=${err.code}`);
  if (err?.error?.code !== undefined) parts.push(`error.code=${err.error.code}`);
  if (err?.error?.status !== undefined) parts.push(`error.status=${err.error.status}`);
  if (err?.error?.message) parts.push(`error.message=${err.error.message}`);
  if (err?.name) parts.push(`name=${err.name}`);
  if (err?.message) parts.push(`message=${err.message}`);
  return parts.length ? parts.join(" | ") : String(err);
}

export async function transcribeVoiceNote(
  base64Audio: string,
  mimeType: string,
  traceId: string = `vt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
): Promise<string | null> {
  console.log(`🎙️ [${traceId}] transcribeVoiceNote start — ${describeAudioForLog(base64Audio, mimeType)}`);

  if (!ai) {
    console.error(`❌ [${traceId}] transcribeVoiceNote aborted — tidak ada Gemini API key yang tersedia (GEMINI_API_KEY maupun GEMINI_API_KEY_1 sama-sama kosong). No model was attempted.`);
    return null;
  }

  const systemInstruction =
    `You transcribe short voice notes (Indonesian or English) into plain text ONLY. ` +
    `The voice note is a person quickly logging a financial transaction (e.g. "beli bensin 50 ribu", ` +
    `"gaji bulan ini masuk 5 juta"). Output ONLY the raw transcript, verbatim, no translation, ` +
    `no commentary, no quotes, no markdown.`;

  const attempts: { model: string; outcome: string }[] = [];
  let lastError: any = null;

  for (const { model, timeoutMs, thinkingConfig } of GEMINI_MODEL_CHAIN) {
    const attemptStart = Date.now();
    try {
      let timeoutId: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`Gemini transcription timed out (${model}, ${timeoutMs}ms)`)), timeoutMs);
      });

      const responsePromise = ai.models.generateContent({
        model,
        contents: {
          parts: [
            { inlineData: { mimeType, data: base64Audio } },
            { text: "Transcribe this voice note verbatim." }
          ]
        },
        config: {
          systemInstruction,
          thinkingConfig
        }
      });

      const response = await Promise.race([responsePromise, timeoutPromise]);
      if (timeoutId) clearTimeout(timeoutId);
      const elapsedMs = Date.now() - attemptStart;

      const transcript = response.text?.trim();
      if (transcript) {
        console.log(`✅ [${traceId}] transcribeVoiceNote succeeded on "${model}" in ${elapsedMs}ms — transcriptLen=${transcript.length}`);
        return transcript;
      }

      // No exception, but also no text — the silent-failure case that
      // was previously invisible. finishReason / promptFeedback usually
      // explains why (e.g. a safety block vs. a genuine decode failure).
      const candidate = (response as any)?.candidates?.[0];
      const finishReason = candidate?.finishReason ?? "unknown";
      const safetyRatings = candidate?.safetyRatings ? JSON.stringify(candidate.safetyRatings) : "none";
      const promptFeedback = (response as any)?.promptFeedback ? JSON.stringify((response as any).promptFeedback) : "none";
      console.warn(
        `⚠️ [${traceId}] transcribeVoiceNote got EMPTY transcript from "${model}" in ${elapsedMs}ms — ` +
        `finishReason=${finishReason} safetyRatings=${safetyRatings} promptFeedback=${promptFeedback}`
      );
      attempts.push({ model, outcome: `empty (finishReason=${finishReason})` });
      // Empty transcript from this model — try the next one rather than
      // treating a blank response as final.
    } catch (err: any) {
      const elapsedMs = Date.now() - attemptStart;
      lastError = err;
      attempts.push({ model, outcome: `error (${describeGeminiError(err)})` });
      console.error(`❌ [${traceId}] transcribeVoiceNote failed on "${model}" after ${elapsedMs}ms — ${describeGeminiError(err)}`);
      continue;
    }
  }

  console.error(
    `❌ [${traceId}] All ${GEMINI_MODEL_CHAIN.length} Gemini models failed to transcribe voice note. ` +
    `Attempt summary: ${attempts.map(a => `${a.model}=${a.outcome}`).join(" | ")}. ` +
    `Input: ${describeAudioForLog(base64Audio, mimeType)}. ` +
    `Last thrown error: ${lastError ? describeGeminiError(lastError) : "none (all attempts returned empty, no exceptions)"}`
  );
  return null;
}
