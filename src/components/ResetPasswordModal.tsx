import React, { useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { supabase } from "../lib/supabase";
import { useToast } from "../contexts/ToastContext";
import { audioFeedback } from "../lib/audio";
import { Lock, Eye, EyeOff, Save, CheckCircle2, ShieldCheck, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({ isOpen, onClose }) => {
  const { t } = useLanguage();
  const { showToast } = useToast();
  useLockBodyScroll(isOpen);
  const panelRef = React.useRef<HTMLDivElement>(null);
  useDialogA11y(isOpen, panelRef, onClose);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
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
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />

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
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="w-full max-w-md my-auto max-h-[85vh] overflow-y-auto overflow-x-hidden bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl outline-none flex flex-col relative z-20 light_sakura:bg-white light_sakura:border-rose-100 light_sakura:shadow-rose-150/10"
      >
        {/* Close Button */}
        <button
          onClick={() => {
            audioFeedback.playClick();
            onClose();
          }}
          aria-label="Tutup"
          className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-white rounded-full bg-slate-950/20 hover:bg-slate-800 transition-colors cursor-pointer light_sakura:text-slate-500 light_sakura:hover:text-slate-800 light_sakura:hover:bg-rose-50"
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
          <p className="font-sans text-xs mt-2 px-2 text-slate-400 leading-relaxed light_sakura:text-slate-600">
            {t("auth.reset_password_desc")}
          </p>
        </div>

        {/* Form Inputs block */}
        <form onSubmit={handleUpdatePassword} className="space-y-4">
          {/* New Password input */}
          <div className="space-y-1.5">
            <label className="font-sans text-xs font-semibold tracking-wider text-slate-400 light_sakura:text-slate-600 uppercase">
              {t("auth.new_password_label")}
            </label>
            <Input
              type={showPassword ? "text" : "password"}
              required
              minLength={6}
              placeholder="••••••••"
              disabled={isLoading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              leftIcon={<Lock size={16} />}
              className="bg-slate-950 border-slate-800 py-3 light_sakura:bg-slate-50 light_sakura:border-rose-100"
              rightElement={
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => {
                    audioFeedback.playClick();
                    setShowPassword(!showPassword);
                  }}
                  aria-label={showPassword ? t("auth.hide_password") : t("auth.show_password")}
                  className="text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />
          </div>

          {/* Confirm Password input */}
          <div className="space-y-1.5">
            <label className="font-sans text-xs font-semibold tracking-wider text-slate-400 light_sakura:text-slate-600 uppercase">
              {t("auth.confirm_password_label")}
            </label>
            <Input
              type={showConfirmPassword ? "text" : "password"}
              required
              minLength={6}
              placeholder="••••••••"
              disabled={isLoading}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              leftIcon={<Lock size={16} />}
              className="bg-slate-950 border-slate-800 py-3 light_sakura:bg-slate-50 light_sakura:border-rose-100"
              rightElement={
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => {
                    audioFeedback.playClick();
                    setShowConfirmPassword(!showConfirmPassword);
                  }}
                  aria-label={showConfirmPassword ? t("auth.hide_password") : t("auth.show_password")}
                  className="text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />
          </div>

          {/* Action button */}
          <Button
            type="submit"
            variant="primary"
            fullWidth
            disabled={isLoading}
            isLoading={isLoading}
            icon={<Save size={16} />}
            className="rounded-xl py-3.5 mt-4"
          >
            {t("auth.reset_submit_btn")}
          </Button>
        </form>
      </motion.div>
    </div>
  );
};
