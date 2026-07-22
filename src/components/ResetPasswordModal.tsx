import React, { useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { supabase } from "../lib/supabase";
import { useToast } from "../contexts/ToastContext";
import { audioFeedback } from "../lib/audio";
import { Lock, Eye, EyeOff, Save, CheckCircle2, ShieldCheck, X } from "lucide-react";
import { motion } from "motion/react";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { ModalShell } from "./ui/ModalShell";

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({ isOpen, onClose }) => {
  const { tokens, cx } = useThemeTokens();
  const { t } = useLanguage();
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
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-md"
      ariaLabel={t("auth.reset_password_title")}
      backdropLocked={isLoading}
      className="p-8 relative"
    >
      {/* Decorative colored glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Close Button */}
      <button
        onClick={() => {
          audioFeedback.playClick();
          onClose();
        }}
        aria-label="Tutup"
        className={cx("absolute top-5 right-5 p-1.5 z-10", tokens.text.muted, tokens.resetPasswordModal.closeBtnHover)}
      >
        <X size={16} />
      </button>

      {/* Content with shake animation */}
      <motion.div
        animate={{ x: shakeTrigger ? [0, -6, 6, -6, 6, 0] : 0 }}
        transition={{ x: { duration: 0.4, ease: "easeInOut" } }}
        className="relative z-10 flex flex-col"
      >
        {/* Brand visual header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className={cx(tokens.resetPasswordModal.iconChipBg, tokens.icon.accent)}>
            <ShieldCheck size={32} />
          </div>
          <h2 className={cx("font-sans font-bold text-2xl tracking-tight", tokens.text.primary)}>
            {t("auth.reset_password_title")}
          </h2>
          <p className={cx("font-sans text-xs mt-2 px-2 leading-relaxed", tokens.text.mutedAlt)}>
            {t("auth.reset_password_desc")}
          </p>
        </div>

        {/* Form Inputs block */}
        <form onSubmit={handleUpdatePassword} className="space-y-4">
          {/* New Password input */}
          <div className="space-y-1.5">
            <label className={cx("font-sans text-xs font-semibold tracking-wider uppercase", tokens.text.mutedAlt)}>
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
              className={cx(tokens.settings.otpInputBg, "py-3", tokens.border.accent)}
              rightElement={
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => {
                    audioFeedback.playClick();
                    setShowPassword(!showPassword);
                  }}
                  aria-label={showPassword ? t("auth.hide_password") : t("auth.show_password")}
                  className="text-slate-400 hover:text-slate-200 light_sakura:hover:text-slate-700 cursor-pointer"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />
          </div>

          {/* Confirm Password input */}
          <div className="space-y-1.5">
            <label className={cx("font-sans text-xs font-semibold tracking-wider uppercase", tokens.text.mutedAlt)}>
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
              className={cx(tokens.settings.otpInputBg, "py-3", tokens.border.accent)}
              rightElement={
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => {
                    audioFeedback.playClick();
                    setShowConfirmPassword(!showConfirmPassword);
                  }}
                  aria-label={showConfirmPassword ? t("auth.hide_password") : t("auth.show_password")}
                  className="text-slate-400 hover:text-slate-200 light_sakura:hover:text-slate-700 cursor-pointer"
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
    </ModalShell>
  );
};
