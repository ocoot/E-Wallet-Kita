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

const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: { "User-Agent": "aistudio-build" }
    }
  });
}

export async function transcribeVoiceNote(base64Audio: string, mimeType: string): Promise<string | null> {
  if (!ai) return null;

  const systemInstruction =
    `You transcribe short voice notes (Indonesian or English) into plain text ONLY. ` +
    `The voice note is a person quickly logging a financial transaction (e.g. "beli bensin 50 ribu", ` +
    `"gaji bulan ini masuk 5 juta"). Output ONLY the raw transcript, verbatim, no translation, ` +
    `no commentary, no quotes, no markdown.`;

  let lastError: any = null;

  for (const { model, timeoutMs, thinkingConfig } of GEMINI_MODEL_CHAIN) {
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

      const transcript = response.text?.trim();
      if (transcript) return transcript;
      // Empty transcript from this model — try the next one rather than
      // treating a blank response as final.
    } catch (err: any) {
      lastError = err;
      console.error(`❌ Gemini transcribeVoiceNote failed on model "${model}":`, err?.message ?? err);
      continue;
    }
  }

  console.error("❌ All Gemini models failed to transcribe voice note. Last error:", lastError?.message ?? lastError);
  return null;
}
