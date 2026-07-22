import React, { useState } from "react";
import { Key, Lock, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { useToast } from "../../contexts/ToastContext";
import { useThemeTokens } from "../../hooks/useThemeTokens";
import { supabase } from "../../lib/supabase";
import { audioFeedback } from "../../lib/audio";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { MobileSettingsDetailPage } from "../../components/settings/MobileSettingsDetailPage";

/** Halaman detail "Kata Sandi & Keamanan" (mobile). */
export const SecuritySettings: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const { tokens, cx } = useThemeTokens();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    audioFeedback.playClick();

    if (!currentPassword) {
      audioFeedback.playDullPluck();
      showToast(t("settings.toast_current_password_required"), "error");
      return;
    }
    if (newPassword.length < 6) {
      audioFeedback.playDullPluck();
      showToast(t("auth.validation_pass"), "error");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      audioFeedback.playDullPluck();
      showToast(t("auth.passwords_dont_match"), "error");
      return;
    }
    if (newPassword === currentPassword) {
      audioFeedback.playDullPluck();
      showToast(t("settings.toast_password_same_as_old"), "error");
      return;
    }

    setIsChangingPassword(true);
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user!.email!,
        password: currentPassword,
      });
      if (verifyError) {
        showToast(t("settings.toast_current_password_wrong"), "error");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      audioFeedback.playChime();
      showToast(t("settings.toast_password_changed"), "success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err: any) {
      audioFeedback.playDullPluck();
      showToast(err.message || t("toast.error_general"), "error");
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <MobileSettingsDetailPage title={t("settings.menu_security")} description={t("settings.security_section_desc")}>
      <form onSubmit={handleChangePassword} className={cx("p-5 rounded-2xl shadow-sm space-y-4", tokens.settings.profileCardBgBorder)}>
        <h3 className={cx("font-sans font-bold text-sm flex items-center gap-2", tokens.settings.sectionHeadingBorder)}>
          <ShieldCheck size={14} className={cx(tokens.icon.accent)} />
          <span>{t("settings.security_section")}</span>
        </h3>

        <Input
          type={showCurrentPassword ? "text" : "password"}
          label={t("settings.current_password_label")}
          placeholder="••••••••"
          autoComplete="current-password"
          disabled={isChangingPassword}
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          leftIcon={<Lock size={14} />}
          className={cx("text-xs", tokens.settings.otpInputBg, tokens.border.accent)}
          rightElement={
            <button
              type="button"
              tabIndex={-1}
              onClick={() => { audioFeedback.playClick(); setShowCurrentPassword(!showCurrentPassword); }}
              aria-label={showCurrentPassword ? t("auth.hide_password") : t("auth.show_password")}
              className="text-slate-400 hover:text-slate-200 light_sakura:hover:text-slate-700 cursor-pointer"
            >
              {showCurrentPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          }
        />

        <Input
          type={showNewPassword ? "text" : "password"}
          label={t("auth.new_password_label")}
          placeholder="••••••••"
          autoComplete="new-password"
          minLength={6}
          disabled={isChangingPassword}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          leftIcon={<Key size={14} />}
          className={cx("text-xs", tokens.settings.otpInputBg, tokens.border.accent)}
          rightElement={
            <button
              type="button"
              tabIndex={-1}
              onClick={() => { audioFeedback.playClick(); setShowNewPassword(!showNewPassword); }}
              aria-label={showNewPassword ? t("auth.hide_password") : t("auth.show_password")}
              className="text-slate-400 hover:text-slate-200 light_sakura:hover:text-slate-700 cursor-pointer"
            >
              {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          }
        />

        <Input
          type={showConfirmNewPassword ? "text" : "password"}
          label={t("auth.confirm_password_label")}
          placeholder="••••••••"
          autoComplete="new-password"
          minLength={6}
          disabled={isChangingPassword}
          value={confirmNewPassword}
          onChange={(e) => setConfirmNewPassword(e.target.value)}
          leftIcon={<Key size={14} />}
          className={cx("text-xs", tokens.settings.otpInputBg, tokens.border.accent)}
          rightElement={
            <button
              type="button"
              tabIndex={-1}
              onClick={() => { audioFeedback.playClick(); setShowConfirmNewPassword(!showConfirmNewPassword); }}
              aria-label={showConfirmNewPassword ? t("auth.hide_password") : t("auth.show_password")}
              className="text-slate-400 hover:text-slate-200 light_sakura:hover:text-slate-700 cursor-pointer"
            >
              {showConfirmNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          }
        />

        <Button
          type="submit"
          variant="primary"
          fullWidth
          size="sm"
          disabled={isChangingPassword}
          isLoading={isChangingPassword}
          icon={<ShieldCheck size={14} />}
          className="rounded-xl py-2.5"
        >
          {t("settings.btn_change_password")}
        </Button>
      </form>
    </MobileSettingsDetailPage>
  );
};
