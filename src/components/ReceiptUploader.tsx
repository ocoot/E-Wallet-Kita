import React, { useState, useRef } from "react";
import { UploadCloud, FileImage, ShieldAlert, CheckCircle, Lock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { useMaintenance } from "../contexts/MaintenanceContext";
import { audioFeedback } from "../lib/audio";
import { usePremium } from "../hooks/usePremium";
import { PremiumModal } from "./PremiumModal";

interface ReceiptUploaderProps {
  onParsed: (draft: any) => void;
}

export const ReceiptUploader: React.FC<ReceiptUploaderProps> = ({ onParsed }) => {
  const { session, user } = useAuth();
  const { t, locale } = useLanguage();
  const { showToast } = useToast();
  const { isFeatureLocked } = useMaintenance();
  const isLocked = isFeatureLocked("receipt_scan");
  
  const { isPremium, refresh: refreshPremium } = usePremium();
  const isGuest = user?.is_anonymous ?? false;
  const isOcrLocked = isGuest || !isPremium;
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);

  const [isDragActive, setIsDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (isOcrLocked) {
      audioFeedback.playDullPluck();
      if (isGuest) {
        showToast(
          locale === "id"
            ? "Fitur Unggah Struk adalah fitur premium. Silakan masuk atau daftar akun terlebih dahulu untuk menggunakannya."
            : "Receipt Upload is a premium feature. Please sign in or register an account to use it.",
          "error"
        );
      } else {
        setIsPremiumOpen(true);
      }
      return;
    }

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      await processFile(file);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isOcrLocked) {
      audioFeedback.playDullPluck();
      if (isGuest) {
        showToast(
          locale === "id"
            ? "Fitur Unggah Struk adalah fitur premium. Silakan masuk atau daftar akun terlebih dahulu untuk menggunakannya."
            : "Receipt Upload is a premium feature. Please sign in or register an account to use it.",
          "error"
        );
      } else {
        setIsPremiumOpen(true);
      }
      return;
    }

    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      await processFile(file);
    }
  };

  const handleClickZone = () => {
    audioFeedback.playClick();
    if (isOcrLocked) {
      if (isGuest) {
        audioFeedback.playDullPluck();
        showToast(
          locale === "id"
            ? "Fitur Unggah Struk adalah fitur premium. Silakan masuk atau daftar akun terlebih dahulu untuk menggunakannya."
            : "Receipt Upload is a premium feature. Please sign in or register an account to use it.",
          "error"
        );
      } else {
        setIsPremiumOpen(true);
      }
      return;
    }
    fileInputRef.current?.click();
  };

  const processFile = async (file: File) => {
    if (isLocked) {
      audioFeedback.playDullPluck();
      showToast(t("maintenance.feature_locked_title"), "error");
      return;
    }

    // Basic file validation
    if (!file.type.startsWith("image/")) {
      audioFeedback.playDullPluck();
      showToast(t("id" === "id" ? "File harus berupa gambar!" : "File must be an image!"), "error");
      return;
    }

    // Fix 1: Limit to 2MB for safer payload handling
    const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_IMAGE_SIZE) {
      audioFeedback.playDullPluck();
      showToast(t("id" === "id" ? "Ukuran gambar maksimal 2MB!" : "Max image size is 2MB!"), "error");
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    audioFeedback.playClick();

    // Fix 2: Compress image before upload using Canvas
    const compressImage = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
          const img = new Image();
          img.src = event.target?.result as string;
          img.onload = () => {
            const canvas = document.createElement("canvas");
            const MAX_WIDTH = 1200;
            const MAX_HEIGHT = 1200;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
              }
            } else {
              if (height > MAX_HEIGHT) {
                width *= MAX_HEIGHT / height;
                height = MAX_HEIGHT;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx?.drawImage(img, 0, 0, width, height);
            // Compress as JPEG 50% quality
            resolve(canvas.toDataURL("image/jpeg", 0.5));
          };
          img.onerror = reject;
        };
        reader.onerror = reject;
      });
    };

    try {
      if (!session?.access_token) {
        throw new Error("Sesi login berakhir. Silakan login kembali.");
      }

      console.log("Session debug:", session);
      console.log("Access Token debug:", session?.access_token);

      const base64String = await compressImage(file);
      
      const payload = JSON.stringify({
        imageBase64: base64String,
      });

      const payloadSize = new Blob([payload]).size;
      
      console.log("Original file:", file.size, "bytes");
      console.log("Base64 length:", base64String.length);
      console.log("Payload size:", payloadSize, "bytes");

      if (payloadSize > 1.5 * 1024 * 1024) { // 1.5MB limit to be safe for 413
        throw new Error("Ukuran data gambar setelah diproses masih terlalu besar. Silakan coba gambar dengan resolusi lebih rendah atau crop gambar.");
      }
        
      const response = await fetch("/api/parse-receipt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: payload,
      });

      // Fix 4: Improve error handling
      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        let errorMessage = "Gagal memproses gambar.";
        
        if (contentType && contentType.includes("application/json")) {
          const errData = await response.json();
          errorMessage = errData.error || errorMessage;
        } else {
          errorMessage = `Server Error (${response.status})`;
        }
        throw new Error(errorMessage);
      }

      const draft = await response.json();
      
      audioFeedback.playChime();
      showToast(
        "id" === "id" 
          ? "Struk berhasil diekstrak oleh Gemini!" 
          : "Receipt successfully extracted by Gemini!", 
        "success"
      );
      onParsed(draft);
    } catch (err: any) {
      console.error("OCR parse error:", err);
      audioFeedback.playDullPluck();
      setUploadError(err.message || "Gagal membaca struk belanja.");
      showToast(err.message || "Gagal memproses struk belanja.", "error");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="w-full space-y-3">
      <label className="font-sans text-xs font-bold text-gray-400 light_sakura:text-slate-600 uppercase tracking-wider block">
        {t("dashboard.ocr_title")}
      </label>

      {isLocked ? (
        // Fitur sedang dikunci admin lewat tab Maintenance — tampilkan
        // status terkunci, jangan render zone upload sama sekali supaya
        // tidak bisa diklik/drop file.
        <div className="relative overflow-hidden p-6 rounded-2xl border-2 border-dashed border-amber-500/30 bg-amber-500/5 flex flex-col items-center justify-center min-h-[160px] text-center">
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
      <>
      {/* Drag & Drop Area */}
      <div
        onClick={isUploading ? undefined : handleClickZone}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`relative overflow-hidden cursor-pointer p-6 rounded-2xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center min-h-[160px] text-center
          ${isDragActive 
            ? "border-indigo-500 bg-indigo-500/5" 
            : "border-slate-800 bg-slate-900/60 hover:border-slate-700 light_sakura:border-rose-200 light_sakura:bg-rose-50/10 light_sakura:hover:border-rose-400"
          }
          ${isUploading ? "pointer-events-none opacity-80" : ""}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        <AnimatePresence mode="wait">
          {isUploading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center space-y-3"
            >
              <div className="relative flex items-center justify-center">
                <span className="w-12 h-12 border-3 border-indigo-500/10 border-t-indigo-500 rounded-full animate-spin" />
                <FileImage className="absolute text-indigo-400" size={18} />
              </div>
              <div className="space-y-1">
                <p className="font-sans text-xs font-bold text-white light_sakura:text-slate-800">
                  {t("dashboard.ocr_loading")}
                </p>
                <p className="font-sans text-[11px] text-gray-400 max-w-sm px-4 leading-relaxed">
                  {t("dashboard.ocr_processing")}
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
              {isOcrLocked ? (
                <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-500 light_sakura:bg-rose-500/10 light_sakura:border-rose-500/20 light_sakura:text-rose-500">
                  <Lock size={24} className="animate-pulse" />
                </div>
              ) : (
                <div className="p-3 bg-indigo-500/5 rounded-xl border border-indigo-500/10 text-indigo-400 light_sakura:bg-rose-100/30 light_sakura:border-rose-100/50 light_sakura:text-rose-500">
                  <UploadCloud size={24} />
                </div>
              )}
              <div className="space-y-1">
                <p className="font-sans text-xs font-bold text-gray-200 light_sakura:text-slate-700 flex items-center justify-center gap-1.5">
                  {isOcrLocked && <Lock size={12} className="text-amber-400 light_sakura:text-rose-500" />}
                  <span>{t("dashboard.ocr_drag_drop")}</span>
                </p>
                <p className="font-sans text-[11px] text-gray-500 light_sakura:text-slate-400">
                  {isOcrLocked
                    ? (locale === "id" ? "Fitur khusus Pengguna Premium" : "Exclusive Premium Feature")
                    : t("dashboard.ocr_supported")
                  }
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error state */}
      {uploadError && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 rounded-xl border border-red-500/20 bg-red-500/5 flex items-start gap-2.5 text-red-400"
        >
          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          <div className="space-y-0.5">
            <p className="font-sans text-xs font-bold">
              {"id" === "id" ? "Gagal Membaca Struk" : "Receipt Parsing Failed"}
            </p>
            <p className="font-sans text-[11px] leading-relaxed text-red-300/85">
              {uploadError}
            </p>
          </div>
        </motion.div>
      )}

      {/* Premium modal popup helper */}
      <PremiumModal
        isOpen={isPremiumOpen}
        onClose={() => setIsPremiumOpen(false)}
        onPremiumActivated={() => {
          refreshPremium();
          setIsPremiumOpen(false);
        }}
      />
      </>
      )}
    </div>
  );
};
