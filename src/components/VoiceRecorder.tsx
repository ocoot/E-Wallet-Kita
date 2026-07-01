import React, { useRef, useState, useEffect } from "react";
import { Mic, Square, Loader2, ShieldAlert, Lock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { useMaintenance } from "../contexts/MaintenanceContext";
import { audioFeedback } from "../lib/audio";
import { usePremium } from "../hooks/usePremium";
import { PremiumModal } from "./PremiumModal";

export interface VoiceParsedResult {
  type: "income" | "expense";
  category_key: string;
  amount: number;
  original_text: string;
}

interface VoiceRecorderProps {
  onParsed: (result: VoiceParsedResult) => void;
}

const MAX_DURATION_SECONDS = 60;

// Voice note masuk kategori "catat transaksi cepat" — pakai gate yang SAMA
// dengan pencatatan teks biasa & voice note Telegram ('new_transaction'),
// bukan gate terpisah, supaya perilakunya konsisten di semua channel saat
// admin mengunci fitur ini lewat tab Maintenance.
const FEATURE_KEY = "new_transaction";

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onParsed }) => {
  const { session, user } = useAuth();
  const { t, locale } = useLanguage();
  const { showToast } = useToast();
  const { isFeatureLocked } = useMaintenance();
  const isLocked = isFeatureLocked(FEATURE_KEY);

  const { isPremium, refresh: refreshPremium } = usePremium();
  const isGuest = user?.is_anonymous ?? false;
  const isVoiceLocked = isGuest || !isPremium;
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup on unmount: stop any live mic stream / timer so the
      // browser mic indicator doesn't stay on after leaving the page.
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const startRecording = async () => {
    if (isVoiceLocked) {
      audioFeedback.playDullPluck();
      if (isGuest) {
        showToast(
          locale === "id"
            ? "Fitur Catat via Suara adalah fitur premium. Silakan masuk atau daftar akun terlebih dahulu untuk menggunakannya."
            : "Voice Note Logging is a premium feature. Please sign in or register an account to use it.",
          "error"
        );
      } else {
        setIsPremiumOpen(true);
      }
      return;
    }
    if (isLocked) {
      audioFeedback.playDullPluck();
      showToast(t("maintenance.feature_locked_title"), "error");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast(
        locale === "id"
          ? "Perangkat/browser Anda tidak mendukung perekaman suara."
          : "Your browser/device does not support voice recording.",
        "error"
      );
      return;
    }

    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        streamRef.current?.getTracks().forEach((tr) => tr.stop());
        streamRef.current = null;
      };

      recorder.start();
      setIsRecording(true);
      setSeconds(0);
      audioFeedback.playClick();

      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          const next = s + 1;
          if (next >= MAX_DURATION_SECONDS) {
            stopRecording();
          }
          return next;
        });
      }, 1000);
    } catch (err: any) {
      console.error("getUserMedia error:", err);
      showToast(
        locale === "id"
          ? "Tidak bisa mengakses mikrofon. Pastikan izin mikrofon sudah diberikan."
          : "Could not access microphone. Please check microphone permission.",
        "error"
      );
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    audioFeedback.playClick();
    setIsRecording(false);

    recorder.addEventListener(
      "stop",
      async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        await processRecording(blob);
      },
      { once: true }
    );
    recorder.stop();
  };

  const processRecording = async (blob: Blob) => {
    if (blob.size === 0) {
      showToast(
        locale === "id" ? "Rekaman kosong, coba lagi." : "Empty recording, please try again.",
        "error"
      );
      return;
    }

    setIsProcessing(true);
    setError(null);
    try {
      if (!session?.access_token) {
        throw new Error(locale === "id" ? "Sesi login berakhir. Silakan login kembali." : "Session expired. Please log in again.");
      }

      const base64Audio = await blobToBase64(blob);

      // Step 1: transcribe audio → text
      const transcribeResp = await fetch("/api/parse-voice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          audioBase64: base64Audio,
          mimeType: blob.type || "audio/webm",
          durationSeconds: seconds,
        }),
      });

      if (!transcribeResp.ok) {
        const errData = await transcribeResp.json().catch(() => ({}));
        if (errData.code === "PREMIUM_REQUIRED") {
          setIsPremiumOpen(true);
          throw new Error(locale === "id" ? "Fitur ini khusus Pengguna Premium." : "This feature is Premium-only.");
        }
        if (errData.code === "GUEST_NOT_ALLOWED") {
          throw new Error(
            locale === "id"
              ? "Silakan masuk atau daftar akun terlebih dahulu untuk menggunakan fitur ini."
              : "Please sign in or register an account to use this feature."
          );
        }
        throw new Error(errData.error || (locale === "id" ? "Gagal mentranskrip suara." : "Failed to transcribe voice note."));
      }

      const { transcript } = await transcribeResp.json();
      if (!transcript || typeof transcript !== "string") {
        throw new Error(locale === "id" ? "Tidak ada suara yang terdengar." : "No speech detected.");
      }

      // Step 2: parse the transcript with the SAME pipeline typed text
      // uses (/api/parse-transaction) — no separate amount/category logic
      // for voice.
      const parseResp = await fetch("/api/parse-transaction", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ query: transcript }),
      });

      if (!parseResp.ok) {
        const errData = await parseResp.json().catch(() => ({}));
        throw new Error(errData.error || (locale === "id" ? "Gagal menganalisis transkrip." : "Failed to analyze transcript."));
      }

      const parsed = await parseResp.json();
      if (!parsed.amount || parsed.amount <= 0) {
        throw new Error(
          locale === "id"
            ? `Nominal tidak terdeteksi dari: "${transcript}"`
            : `Could not detect an amount from: "${transcript}"`
        );
      }

      audioFeedback.playChime();
      showToast(
        locale === "id" ? `🎙️ Terdengar: "${transcript}"` : `🎙️ Heard: "${transcript}"`,
        "success"
      );

      onParsed({
        type: parsed.type === "income" ? "income" : "expense",
        category_key: parsed.category_key || "other",
        amount: parsed.amount,
        original_text: transcript,
      });
    } catch (err: any) {
      console.error("Voice note parse error:", err);
      audioFeedback.playDullPluck();
      setError(err.message || (locale === "id" ? "Gagal memproses pesan suara." : "Failed to process voice note."));
      showToast(err.message || (locale === "id" ? "Gagal memproses pesan suara." : "Failed to process voice note."), "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const formatTimer = (s: number) => `0:${s.toString().padStart(2, "0")}`;

  return (
    <div className="w-full space-y-3">
      <label className="font-sans text-xs font-bold text-slate-400 light_sakura:text-slate-600 uppercase tracking-wider block">
        {t("dashboard.voice_title")}
      </label>

      {isLocked ? (
        <div className="relative overflow-hidden p-6 rounded-2xl border-2 border-dashed border-amber-500/30 bg-amber-500/5 flex flex-col items-center justify-center min-h-[140px] text-center">
          <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/30 text-amber-400 mb-2">
            <Lock size={24} />
          </div>
          <p className="font-sans text-xs font-bold text-amber-300">
            {t("maintenance.feature_locked_title")}
          </p>
          <p className="font-sans text-[11px] text-amber-300/70 max-w-sm px-4 leading-relaxed mt-1">
            {t("maintenance.feature_locked_desc")}
          </p>
        </div>
      ) : (
        <div
          className={`relative overflow-hidden p-6 rounded-2xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center min-h-[140px] text-center
            ${isRecording
              ? "border-red-500 bg-red-500/5"
              : "border-slate-800 bg-slate-900/60 light_sakura:border-rose-200 light_sakura:bg-rose-50/10"
            }`}
        >
          <AnimatePresence mode="wait">
            {isProcessing ? (
              <motion.div
                key="processing"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center space-y-3"
              >
                <Loader2 className="animate-spin text-indigo-400" size={28} />
                <div className="space-y-1">
                  <p className="font-sans text-xs font-bold text-white light_sakura:text-slate-800">
                    {t("dashboard.voice_processing")}
                  </p>
                  <p className="font-sans text-[11px] text-slate-400 max-w-sm px-4 leading-relaxed">
                    {t("dashboard.voice_processing_desc")}
                  </p>
                </div>
              </motion.div>
            ) : isRecording ? (
              <motion.div
                key="recording"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center space-y-3"
              >
                <button
                  type="button"
                  onClick={stopRecording}
                  className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-900/30 active:scale-95 transition-all cursor-pointer"
                >
                  <span className="absolute inline-flex h-14 w-14 rounded-full bg-red-500 opacity-40 animate-ping" />
                  <Square size={18} fill="currentColor" className="relative z-10" />
                </button>
                <div className="space-y-0.5">
                  <p className="font-sans text-xs font-bold text-red-400 tabular-nums">
                    {formatTimer(seconds)} / {formatTimer(MAX_DURATION_SECONDS)}
                  </p>
                  <p className="font-sans text-[11px] text-slate-400">
                    {t("dashboard.voice_recording")}
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center space-y-2"
              >
                <button
                  type="button"
                  onClick={startRecording}
                  className={`p-3 rounded-xl border transition-colors cursor-pointer ${
                    isVoiceLocked
                      ? "bg-amber-500/10 border-amber-500/20 text-amber-500 light_sakura:bg-rose-500/10 light_sakura:border-rose-500/20 light_sakura:text-rose-500"
                      : "bg-indigo-500/10 border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 light_sakura:bg-rose-100/30 light_sakura:border-rose-100/50 light_sakura:text-rose-500"
                  }`}
                >
                  {isVoiceLocked ? <Lock size={24} className="animate-pulse" /> : <Mic size={24} />}
                </button>
                <div className="space-y-1">
                  <p className="font-sans text-xs font-bold text-slate-200 light_sakura:text-slate-700 flex items-center justify-center gap-1.5">
                    {isVoiceLocked && <Lock size={12} className="text-amber-400 light_sakura:text-rose-500" />}
                    <span>{t("dashboard.voice_tap_to_record")}</span>
                  </p>
                  <p className="font-sans text-[11px] text-slate-500 light_sakura:text-slate-400">
                    {isVoiceLocked
                      ? (locale === "id" ? "Fitur khusus Pengguna Premium" : "Exclusive Premium Feature")
                      : t("dashboard.voice_supported")
                    }
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 rounded-xl border border-red-500/20 bg-red-500/5 flex items-start gap-2.5 text-red-400"
        >
          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          <div className="space-y-0.5">
            <p className="font-sans text-xs font-bold">
              {locale === "id" ? "Gagal Memproses Suara" : "Voice Processing Failed"}
            </p>
            <p className="font-sans text-[11px] leading-relaxed text-red-300/85">{error}</p>
          </div>
        </motion.div>
      )}

      {/* Premium upsell modal */}
      <PremiumModal
        isOpen={isPremiumOpen}
        onClose={() => setIsPremiumOpen(false)}
        onPremiumActivated={() => {
          refreshPremium();
        }}
      />
    </div>
  );
};
