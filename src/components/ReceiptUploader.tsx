import React, { useState, useRef } from "react";
import { UploadCloud, FileImage, ShieldAlert, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { audioFeedback } from "../lib/audio";

interface ReceiptUploaderProps {
  onParsed: (draft: any) => void;
}

export const ReceiptUploader: React.FC<ReceiptUploaderProps> = ({ onParsed }) => {
  const { session } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();
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

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      await processFile(file);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      await processFile(file);
    }
  };

  const handleClickZone = () => {
    audioFeedback.playClick();
    fileInputRef.current?.click();
  };

  const processFile = async (file: File) => {
    // Basic file validation
    if (!file.type.startsWith("image/")) {
      audioFeedback.playDullPluck();
      showToast(t("id" === "id" ? "File harus berupa gambar!" : "File must be an image!"), "error");
      return;
    }

    // Limit to 5MB for base64 payload safety
    if (file.size > 5 * 1024 * 1024) {
      audioFeedback.playDullPluck();
      showToast(t("id" === "id" ? "Ukuran gambar maksimal 5MB!" : "Max image size is 5MB!"), "error");
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    audioFeedback.playClick();

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64String = reader.result as string;
        
        const response = await fetch("/api/parse-receipt", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || ""}`,
          },
          body: JSON.stringify({
            imageBase64: base64String,
          }),
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || "Gagal memproses gambar struk.");
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

    reader.onerror = () => {
      audioFeedback.playDullPluck();
      setUploadError("Gagal membaca file gambar.");
      setIsUploading(false);
    };

    reader.readAsDataURL(file);
  };

  return (
    <div className="w-full space-y-3">
      <label className="font-sans text-xs font-bold text-gray-400 light_sakura:text-slate-600 uppercase tracking-wider block">
        {"id" === "id" ? "Catat Instan via Unggah Struk (OCR-AI)" : "Instant Log via Receipt Upload (OCR-AI)"}
      </label>

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
                  {"id" === "id" ? "Sedang Membaca Struk..." : "Reading receipt details..."}
                </p>
                <p className="font-sans text-[11px] text-gray-400 max-w-sm px-4 leading-relaxed">
                  {"id" === "id" 
                    ? "Kecerdasan Gemini AI sedang merinci nama toko, barang belanja, & total dana." 
                    : "Gemini AI is parsing merchant name, line items, and transaction grand total."}
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
              <div className="p-3 bg-indigo-500/5 rounded-xl border border-indigo-500/10 text-indigo-400 light_sakura:bg-rose-100/30 light_sakura:border-rose-100/50 light_sakura:text-rose-500">
                <UploadCloud size={24} />
              </div>
              <div className="space-y-1">
                <p className="font-sans text-xs font-bold text-gray-200 light_sakura:text-slate-700">
                  {"id" === "id" 
                    ? "Seret & letakkan struk atau Klik untuk memilih" 
                    : "Drag & drop receipt here or Click to select"}
                </p>
                <p className="font-sans text-[11px] text-gray-500 light_sakura:text-slate-400">
                  {"id" === "id" ? "Mendukung format PNG, JPG, JPEG (Maks. 5MB)" : "Supports PNG, JPG, JPEG (Max. 5MB)"}
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
    </div>
  );
};
