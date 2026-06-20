import React, { useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { authService, UserSession } from "../lib/auth";
import { useToast } from "../contexts/ToastContext";
import { Wallet, Mail, Lock, User, LogIn, Sparkles, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Modal } from "../components/Modal";

interface LoginProps {
  onLoginSuccess: (user: UserSession) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const { t } = useLanguage();
  const { showToast } = useToast();

  const [isSignUp, setIsSignUp] = useState(false);
  
  // Form inputs
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  // UI States
  const [isLoading, setIsLoading] = useState(false);

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    type: "info" | "warning";
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    description: "",
    type: "info",
    onConfirm: () => {},
  });

  const handleEmailAuth = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validations
    if (!email || !email.includes("@")) {
      showToast(t("auth.validation_email"), "error");
      return;
    }
    if (!password || password.length < 6) {
      showToast(t("auth.validation_pass"), "error");
      return;
    }
    if (isSignUp && !displayName.trim()) {
      showToast("Name is required for registration", "error");
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: isSignUp ? "Konfirmasi Daftar Akun" : "Konfirmasi Masuk Sesi",
      description: isSignUp 
        ? `Apakah Anda yakin ingin mendaftarkan akun baru dengan email ${email}?`
        : `Apakah Anda yakin ingin masuk sesi menggunakan email ${email}?`,
      type: "info",
      onConfirm: () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        setIsLoading(true);
        
        // Simulate brief network lag for production feel
        setTimeout(() => {
          if (isSignUp) {
            const res = authService.signUpWithEmail(email, displayName, password);
            if ("error" in res) {
              showToast(res.error, "error");
            } else {
              showToast(t("toast.welcome_signup"), "success");
              onLoginSuccess(res);
            }
          } else {
            const res = authService.signInWithEmail(email, password);
            if ("error" in res) {
              showToast(res.error, "error");
            } else {
              showToast(t("toast.welcome_auth"), "success");
              onLoginSuccess(res);
            }
          }
          setIsLoading(false);
        }, 1000);
      }
    });
  };

  const handleGuestLogin = () => {
    setConfirmModal({
      isOpen: true,
      title: "Masuk Mode Tamu (Guest)?",
      description: "Data transaksi disimpan sementara di browser Anda dan bisa hilang jika cache dibersihkan. Lanjutkan masuk?",
      type: "warning",
      onConfirm: () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        setIsLoading(true);
        setTimeout(() => {
          const user = authService.signInAsGuest();
          showToast(t("toast.welcome_auth"), "success");
          onLoginSuccess(user);
          setIsLoading(false);
        }, 1000);
      }
    });
  };

  const handleGoogleLogin = () => {
    setConfirmModal({
      isOpen: true,
      title: "Masuk via Google?",
      description: "Gunakan Akun Google terintegrasi untuk masuk secara instan dan mengamankan progres dompet Anda.",
      type: "info",
      onConfirm: () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        setIsLoading(true);
        setTimeout(() => {
          // Using pre-authorized test user email as per platform metadata
          const testEmail = "financehubmanager@gmail.com";
          const user = authService.signInWithGoogleMock(testEmail);
          showToast(t("toast.welcome_auth"), "success");
          onLoginSuccess(user);
          setIsLoading(false);
        }, 1000);
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden transition-colors duration-300 light_sakura:bg-rose-50/50">
      
      {/* Decorative colored glow orbs */}
      <div className="absolute -left-16 -top-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl" />
      <div className="absolute -right-16 -bottom-16 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl light_sakura:bg-pink-300/20" />

      {/* Main card box container */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md bg-slate-900 border border-slate-900 rounded-3xl p-8 shadow-2xl flex flex-col relative z-10 light_sakura:bg-white light_sakura:border-rose-100/10 light_sakura:shadow-rose-150/10"
      >
        {/* Brand visual header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="p-3 w-14 h-14 bg-indigo-600/10 text-teal-400 rounded-2xl flex items-center justify-center mb-4 shadow-inner light_sakura:bg-rose-500/10 light_sakura:text-rose-500">
            <Wallet size={32} />
          </div>
          <h2 className="font-sans font-bold text-2xl tracking-tight text-white light_sakura:text-slate-900">
            {t("app.title")}
          </h2>
          <p className="font-sans text-xs mt-1.5 opacity-80 text-gray-400 light_sakura:text-slate-600">
            {t("auth.login_subtitle")}
          </p>
        </div>

        {/* Form Inputs block */}
        <form onSubmit={handleEmailAuth} className="space-y-4">
          
          {isSignUp && (
            <div className="space-y-1.5">
              <label className="font-sans text-xs font-semibold tracking-wider text-gray-400 light_sakura:text-slate-600 uppercase">
                Nama Lengkap / Tampilan
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                  <User size={16} />
                </span>
                <input
                  type="text"
                  required
                  placeholder="Ketik nama Anda..."
                  disabled={isLoading}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 text-white rounded-xl font-sans text-sm outline-none focus:border-indigo-500 transition-colors light_sakura:bg-slate-50 light_sakura:border-rose-100 light_sakura:text-slate-800"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="font-sans text-xs font-semibold tracking-wider text-gray-400 light_sakura:text-slate-600 uppercase">
              {t("auth.label_email")}
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                <Mail size={16} />
              </span>
              <input
                type="email"
                required
                placeholder="email@domain.com"
                disabled={isLoading}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 text-white rounded-xl font-sans text-sm outline-none focus:border-indigo-500 transition-colors light_sakura:bg-slate-50 light_sakura:border-rose-100 light_sakura:text-slate-800"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="font-sans text-xs font-semibold tracking-wider text-gray-400 light_sakura:text-slate-600 uppercase">
              {t("auth.label_password")}
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                <Lock size={16} />
              </span>
              <input
                type="password"
                required
                minLength={6}
                placeholder="••••••••"
                disabled={isLoading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 text-white rounded-xl font-sans text-sm outline-none focus:border-indigo-500 transition-colors light_sakura:bg-slate-50 light_sakura:border-rose-100 light_sakura:text-slate-800"
              />
            </div>
          </div>

          {/* Email authenticate button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full cursor-pointer py-3.5 px-4 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white rounded-xl font-sans text-sm font-semibold shadow-lg shadow-indigo-600/10 flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:pointer-events-none mt-2 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400"
          >
            {isLoading ? (
              <span className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin" />
            ) : (
              <>
                <LogIn size={16} />
                <span>{isSignUp ? t("auth.btn_signup") : t("auth.btn_signin")}</span>
              </>
            )}
          </button>
        </form>

        {/* Toggle sign in vs sign up */}
        <div className="text-center mt-4">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            disabled={isLoading}
            className="font-sans text-xs text-indigo-400 hover:underline cursor-pointer disabled:opacity-50 light_sakura:text-rose-500"
          >
            {isSignUp ? t("auth.to_signin") : t("auth.to_signup")}
          </button>
        </div>

        {/* Or partition delimiter */}
        <div className="relative my-6 flex items-center justify-center">
          <div className="absolute inset-x-0 h-px bg-slate-800 light_sakura:bg-rose-100" />
          <span className="relative z-10 px-4 font-sans text-[10px] uppercase font-semibold text-gray-500 bg-slate-900 light_sakura:bg-white">
            Atau Sesi Instan
          </span>
        </div>

        {/* Secondary Instant Social & Guest authentication triggers */}
        <div className="space-y-3">
          
          {/* Google log mock */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full cursor-pointer py-3 rounded-xl border border-slate-800 hover:bg-slate-800 font-sans text-xs font-semibold text-slate-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-40 light_sakura:border-rose-100 light_sakura:text-slate-800 light_sakura:hover:bg-rose-50/50"
          >
            {/* Minimal flat Google vector G icon */}
            <svg viewBox="0 0 24 24" width="16" height="16" className="shrink-0">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.08H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.92l2.85-2.22.81-.6z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.08l3.66 2.84c.87-2.6 3.3-4.54 6.16-4.54z" />
            </svg>
            <span>{t("auth.login_google")}</span>
          </button>

          {/* Guest Mode log */}
          <button
            type="button"
            onClick={handleGuestLogin}
            disabled={isLoading}
            className="w-full cursor-pointer py-3 rounded-xl border border-dashed border-teal-500/30 bg-teal-500/5 hover:bg-teal-500/10 text-teal-400 font-sans text-xs font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-40 light_sakura:border-rose-300 light_sakura:bg-rose-50/30 light_sakura:text-rose-600 light_sakura:hover:bg-rose-100/50"
          >
            <Sparkles size={14} />
            <span>{t("auth.login_guest")}</span>
          </button>
        </div>

        {/* Cache disclaimer warning notice for guest credentials */}
        <div className="mt-6 flex gap-2.5 p-3.5 rounded-xl border bg-slate-950/40 border-slate-900/20 text-[10px] text-gray-400 leading-relaxed light_sakura:bg-rose-50/40 light_sakura:border-rose-100 light_sakura:text-slate-500">
          <AlertCircle size={15} className="text-amber-500 shrink-0 mt-0.5" />
          <p>{t("auth.guest_disclaimer")}</p>
        </div>

      </motion.div>

      {/* Confirmation Modal */}
      <Modal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        description={confirmModal.description}
        type={confirmModal.type}
        confirmLabel="Ya, Lanjutkan"
        cancelLabel={t("common.cancel")}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Premium Full-Screen Loading Overlay */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/85 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="flex flex-col items-center text-center p-8 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-xs w-full light_sakura:bg-white light_sakura:border-rose-100"
            >
              <div className="relative flex items-center justify-center w-16 h-16 mb-4">
                <div className="absolute inset-0 border-4 border-indigo-600/20 rounded-full light_sakura:border-rose-500/20" />
                <div className="absolute inset-0 border-4 border-t-indigo-500 rounded-full animate-spin light_sakura:border-t-rose-500" />
                <Wallet className="text-teal-400 animate-pulse light_sakura:text-rose-500" size={24} />
              </div>
              <h3 className="font-sans font-bold text-lg text-white mb-1.5 light_sakura:text-slate-900">
                {t("common.loading")}
              </h3>
              <p className="font-sans text-xs text-slate-400 light_sakura:text-slate-600 leading-relaxed">
                {isSignUp 
                  ? "Mendaftarkan dan mengonfigurasi dompet baru Anda..." 
                  : "Menghubungkan akun dan memuat lembar transaksi..."}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
