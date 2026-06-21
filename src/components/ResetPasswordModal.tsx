import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";
import { useToast } from "../contexts/ToastContext";
import { audioFeedback } from "../lib/audio";
import { Lock, Eye, EyeOff, Save, CheckCircle2, ShieldCheck, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [shakeTrigger, setShakeTrigger] = useState(false);

  const triggerShake = () => {
    setShakeTrigger(true);
    setTimeout(() => setShakeTrigger(false), 500);
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    audioFeedback.playClick();

    if (password.length < 6) {
      audioFeedback.playDullPluck();
      triggerShake();
      showToast(t("auth.validation_pass"), "error");
      return;
    }

    if (password !== confirmPassword) {
      audioFeedback.playDullPluck();
      triggerShake();
      showToast(t("auth.passwords_dont_match"), "error");
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      audioFeedback.playChime();
      showToast(t("auth.reset_success_toast"), "success");
      onClose();
    } catch (err: any) {
      audioFeedback.playDullPluck();
      triggerShake();
      showToast(err.message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      {/* Dark modern backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => {
          audioFeedback.playClick();
          onClose();
        }}
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
      />

      {/* Decorative colored glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-teal-500/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Main card viewport */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ 
          opacity: 1, 
          scale: 1, 
          y: 0,
          x: shakeTrigger ? [0, -6, 6, -6, 6, 0] : 0
        }}
        transition={{ 
          x: { duration: 0.4, ease: "easeInOut" },
          default: { duration: 0.3, ease: "easeOut" }
        }}
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl flex flex-col relative z-20 light_sakura:bg-white light_sakura:border-rose-100 light_sakura:shadow-rose-150/10"
      >
        {/* Close Button */}
        <button
          onClick={() => {
            audioFeedback.playClick();
            onClose();
          }}
          className="absolute top-5 right-5 p-1.5 text-gray-400 hover:text-white rounded-full bg-slate-950/20 hover:bg-slate-800 transition-colors cursor-pointer light_sakura:text-slate-500 light_sakura:hover:text-slate-800 light_sakura:hover:bg-rose-50"
        >
          <X size={16} />
        </button>

        {/* Brand visual header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="p-3 w-14 h-14 bg-indigo-600/10 text-indigo-400 rounded-2xl flex items-center justify-center mb-4 shadow-inner light_sakura:bg-rose-500/10 light_sakura:text-rose-500">
            <ShieldCheck size={32} />
          </div>
          <h2 className="font-sans font-bold text-2xl tracking-tight text-white light_sakura:text-slate-900">
            {t("auth.reset_password_title")}
          </h2>
          <p className="font-sans text-xs mt-2 px-2 text-gray-400 leading-relaxed light_sakura:text-slate-600">
            {t("auth.reset_password_desc")}
          </p>
        </div>

        {/* Form Inputs block */}
        <form onSubmit={handleUpdatePassword} className="space-y-4">
          {/* New Password input */}
          <div className="space-y-1.5">
            <label className="font-sans text-xs font-semibold tracking-wider text-gray-400 light_sakura:text-slate-600 uppercase">
              {t("auth.new_password_label")}
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                <Lock size={16} />
              </span>
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                placeholder="••••••••"
                disabled={isLoading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-11 pr-11 py-3 bg-slate-950 border border-slate-800 text-white rounded-xl font-sans text-sm outline-none focus:border-indigo-500 transition-colors light_sakura:bg-slate-50 light_sakura:border-rose-100 light_sakura:text-slate-800"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => {
                  audioFeedback.playClick();
                  setShowPassword(!showPassword);
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 cursor-pointer"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Confirm Password input */}
          <div className="space-y-1.5">
            <label className="font-sans text-xs font-semibold tracking-wider text-gray-400 light_sakura:text-slate-600 uppercase">
              {t("auth.confirm_password_label")}
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                <Lock size={16} />
              </span>
              <input
                type={showConfirmPassword ? "text" : "password"}
                required
                minLength={6}
                placeholder="••••••••"
                disabled={isLoading}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-11 pr-11 py-3 bg-slate-950 border border-slate-800 text-white rounded-xl font-sans text-sm outline-none focus:border-indigo-500 transition-colors light_sakura:bg-slate-50 light_sakura:border-rose-100 light_sakura:text-slate-800"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => {
                  audioFeedback.playClick();
                  setShowConfirmPassword(!showConfirmPassword);
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 cursor-pointer"
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Action button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={isLoading}
            className="w-full cursor-pointer py-3.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-sans text-sm font-semibold shadow-lg shadow-indigo-600/10 flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:pointer-events-none mt-4 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400"
          >
            {isLoading ? (
              <span className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin" />
            ) : (
              <>
                <Save size={16} />
                <span>{t("auth.reset_submit_btn")}</span>
              </>
            )}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
};
