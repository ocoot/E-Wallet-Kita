import React, { useState, useRef } from "react";
import { UploadCloud, FileImage, ShieldAlert, CheckCircle, Lock, Camera, Images } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { useMaintenance } from "../contexts/MaintenanceContext";
import { audioFeedback } from "../lib/audio";
import { reportFrontendError } from "../lib/errorReporter";
import { usePremium } from "../hooks/usePremium";
import { PremiumModal } from "./PremiumModal";
import { useThemeTokens } from "../hooks/useThemeTokens";

interface ReceiptUploaderProps {
  onParsed: (draft: any) => void;
  /**
   * File yang datang dari alur "Share ke app" (lihat src/lib/shareTarget.ts)
   * -- begitu ter-set, langsung diproses seolah-olah user memilihnya
   * lewat dropzone/kamera manual. Parent bertanggung jawab membersihkan
   * prop ini lagi (mis. jadi `null`) lewat `onSharedFileConsumed`, supaya
   * tidak terproses ulang tiap re-render.
   */
  sharedFile?: File | null;
  onSharedFileConsumed?: () => void;
}

export const ReceiptUploader: React.FC<ReceiptUploaderProps> = ({ onParsed, sharedFile, onSharedFileConsumed }) => {
  const { tokens, cx } = useThemeTokens();
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
  // Input terpisah dengan atribut `capture="environment"` supaya di HP
  // langsung membuka aplikasi kamera (bukan cuma file picker seperti
  // `fileInputRef` di atas) -- meniru tombol "scan struk" khas app native.
  const cameraInputRef = useRef<HTMLInputElement>(null);

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

  // Dipakai bareng oleh tombol "Buka Kamera" & "Pilih dari Galeri" (juga
  // klik di area dropzone) -- cuma beda input ref mana yang dibuka.
  const requestPick = (ref: React.RefObject<HTMLInputElement | null>) => {
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
    ref.current?.click();
  };

  const handleClickZone = () => requestPick(fileInputRef);
  const handleOpenCamera = (e: React.MouseEvent) => {
    e.stopPropagation();
    requestPick(cameraInputRef);
  };
  const handleOpenGallery = (e: React.MouseEvent) => {
    e.stopPropagation();
    requestPick(fileInputRef);
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
        
      const response = await fetch("/api/receipt?action=parse", {
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
      const message = err.message || "Gagal membaca struk belanja.";
      setUploadError(message);
      showToast(message, "error");

      // Premium/guest-belum-login/gambar-terlalu-besar adalah penolakan
      // wajar, bukan bug -- sengaja tidak dilaporkan.
      const EXPECTED_MESSAGE_PATTERNS = [
        /premium/i, /guest/i, /sign in or register/i, /masuk atau daftar/i,
        /terlalu besar/i,
      ];
      if (!EXPECTED_MESSAGE_PATTERNS.some((re) => re.test(message))) {
        void reportFrontendError({
          source: "frontend:transaction",
          message,
          context: { action: "receipt-ocr", stack: err?.stack?.slice(0, 1500) ?? null },
        });
      }
    } finally {
      setIsUploading(false);
    }
  };

  // Konsumsi file yang datang dari Web Share Target. Hanya jalan sekali per
  // file (guard lewat ref) supaya tidak terproses berulang tiap re-render,
  // dan tetap lewat validasi premium/lock yang sama seperti upload manual.
  const consumedSharedFileRef = useRef<File | null>(null);
  React.useEffect(() => {
    if (!sharedFile || consumedSharedFileRef.current === sharedFile) return;
    consumedSharedFileRef.current = sharedFile;

    if (isOcrLocked) {
      audioFeedback.playDullPluck();
      // BUG FIX: sebelumnya cabang ini SELALU menampilkan toast "silakan
      // masuk/daftar akun" (pesan khusus guest) berapa pun status login
      // user -- termasuk untuk user yang SUDAH login tapi belum premium,
      // yang jelas membingungkan ("suruh login" padahal sudah login).
      // Disamakan dengan handleDrop/handleFileChange/requestPick di atas:
      // guest -> toast ajakan masuk/daftar, sudah login tapi non-premium
      // -> buka PremiumModal (upsell), bukan toast generik.
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
      onSharedFileConsumed?.();
      return;
    }

    void processFile(sharedFile).finally(() => onSharedFileConsumed?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedFile]);

  return (
    <div className="w-full space-y-3">
      <label className={cx("font-sans text-xs font-bold uppercase tracking-wider block", tokens.text.mutedAlt)}>
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
          <p className="font-sans text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-amber-300/70 max-w-sm px-4 leading-relaxed mt-1">
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
            : tokens.receiptUploader.dropzoneBorder
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
        {/* Input kedua khusus kamera: `capture="environment"` memberi tahu
            browser mobile untuk langsung membuka kamera belakang, alih-alih
            file picker biasa seperti input di atas. */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
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
                <p className={cx("font-sans text-xs font-bold", tokens.text.onSurface)}>
                  {t("dashboard.ocr_loading")}
                </p>
                <p className="font-sans text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-400 max-w-sm px-4 leading-relaxed">
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
                <div className={cx("p-3 rounded-xl", tokens.chip.accentAmberRose)}>
                  <Lock size={24} className="animate-pulse" />
                </div>
              ) : (
                <div className={cx("p-3 rounded-xl", tokens.receiptUploader.iconBoxBorder, tokens.icon.accent)}>
                  <UploadCloud size={24} />
                </div>
              )}
              <div className="space-y-1">
                <p className={cx("font-sans text-xs font-bold flex items-center justify-center gap-1.5", tokens.receiptUploader.captionText)}>
                  {isOcrLocked && <Lock size={12} className={tokens.receiptUploader.lockIcon} />}
                  <span>{t("dashboard.ocr_drag_drop")}</span>
                </p>
                <p className={cx("font-sans text-[clamp(0.6188rem,2.86vw,0.6875rem)]", tokens.text.faint)}>
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

      {/* Tombol aksi cepat -- pisah jelas antara "buka kamera langsung"
          vs "pilih dari galeri", supaya di HP user tidak perlu melewati
          dialog pilihan sumber file browser yang terasa generic/web. */}
      {!isUploading && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleOpenCamera}
            className={cx(
              "flex items-center justify-center gap-2 py-2.5 rounded-xl border font-sans text-xs font-semibold cursor-pointer transition-all active:scale-95",
              tokens.receiptUploader.dropzoneBorder,
              tokens.text.label
            )}
          >
            <Camera size={15} />
            <span>{locale === "id" ? "Buka Kamera" : "Open Camera"}</span>
          </button>
          <button
            type="button"
            onClick={handleOpenGallery}
            className={cx(
              "flex items-center justify-center gap-2 py-2.5 rounded-xl border font-sans text-xs font-semibold cursor-pointer transition-all active:scale-95",
              tokens.receiptUploader.dropzoneBorder,
              tokens.text.label
            )}
          >
            <Images size={15} />
            <span>{locale === "id" ? "Pilih dari Galeri" : "Choose from Gallery"}</span>
          </button>
        </div>
      )}

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
            <p className="font-sans text-[clamp(0.6188rem,2.86vw,0.6875rem)] leading-relaxed text-red-300/85">
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
        }}
      />
      </>
      )}
    </div>
  );
};
