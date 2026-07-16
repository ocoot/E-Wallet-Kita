import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Camera, Loader2, Sparkles } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTheme } from "../../contexts/ThemeContext";
import { useToast } from "../../contexts/ToastContext";
import { useThemeTokens } from "../../hooks/useThemeTokens";
import { usePremium } from "../../hooks/usePremium";
import { supabase } from "../../lib/supabase";
import { audioFeedback } from "../../lib/audio";
import { uploadAvatar, AvatarValidationError } from "../../lib/avatar";
import { Modal } from "../../components/Modal";
import { PremiumModal } from "../../components/PremiumModal";
import { MobileSettingsDetailPage } from "../../components/settings/MobileSettingsDetailPage";
import { UserSession } from "../../types";

interface ProfileSettingsProps {
  onUserPrefUpdated: (user: UserSession) => void;
}

/** Halaman detail "Kelola Profil" (mobile) -- avatar & nama tampilan. */
export const ProfileSettings: React.FC<ProfileSettingsProps> = ({ onUserPrefUpdated }) => {
  const { user } = useAuth();
  const { locale, t } = useLanguage();
  const { theme } = useTheme();
  const { showToast } = useToast();
  const { tokens, cx } = useThemeTokens();
  const { isPremium, refresh: refreshPremium } = usePremium();
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);

  const isGuest = user?.is_anonymous ?? false;

  const [displayName, setDisplayName] = useState(user?.user_metadata?.full_name || user?.email?.split("@")[0] || "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from("users")
        .select("display_name, avatar_url")
        .eq("id", user.id)
        .single();
      if (!error && data) {
        if (data.display_name) setDisplayName(data.display_name);
        if (data.avatar_url) setAvatarUrl(data.avatar_url);
      }
    };
    fetchProfile();
  }, [user]);

  const handleAvatarClick = () => {
    audioFeedback.playClick();
    if (isUploadingAvatar) return;
    avatarInputRef.current?.click();
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;

    setIsUploadingAvatar(true);
    try {
      const newAvatarUrl = await uploadAvatar(user.id, file);
      setAvatarUrl(newAvatarUrl);
      audioFeedback.playChime();
      showToast(t("settings.toast_avatar_success"), "success");
      onUserPrefUpdated({
        id: user.id,
        display_name: displayName,
        is_guest: user.is_anonymous || false,
        preferred_language: locale,
        preferred_theme: theme,
        avatar_url: newAvatarUrl,
      });
    } catch (err: any) {
      audioFeedback.playDullPluck();
      if (err instanceof AvatarValidationError) {
        showToast(
          err.code === "INVALID_TYPE" ? t("settings.toast_avatar_invalid_type") : t("settings.toast_avatar_too_large"),
          "error"
        );
      } else {
        showToast(err.message || t("settings.toast_avatar_error"), "error");
      }
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleUpdateProfileName = () => {
    audioFeedback.playClick();
    if (!displayName.trim()) {
      audioFeedback.playDullPluck();
      showToast(t("settings.toast_blank_profile_name"), "error");
      return;
    }
    setIsProfileModalOpen(true);
  };

  const executeUpdateProfileName = async () => {
    audioFeedback.playChime();
    try {
      const { error } = await supabase.from("users").update({ display_name: displayName }).eq("id", user?.id);
      if (error) throw error;
      await supabase.auth.updateUser({ data: { full_name: displayName } });
      onUserPrefUpdated({
        id: user?.id || "",
        display_name: displayName,
        is_guest: user?.is_anonymous || false,
        preferred_language: locale,
        preferred_theme: theme,
      });
      setIsProfileModalOpen(false);
      showToast(t("toast.success_profile"), "success");
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  return (
    <MobileSettingsDetailPage title={t("settings.menu_manage_profile")} description={t("settings.menu_manage_profile_desc")}>
      <div className="flex flex-col items-center gap-3 py-2">
        <button
          type="button"
          onClick={handleAvatarClick}
          disabled={isGuest || isUploadingAvatar}
          aria-label={t("settings.avatar_change_label")}
          className={`relative group w-20 h-20 shrink-0 rounded-full overflow-hidden bg-indigo-600 light_sakura:bg-rose-500 text-white flex items-center justify-center font-sans font-bold text-3xl ${!isGuest ? "cursor-pointer" : "cursor-default"}`}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt={displayName || "avatar"} className="w-full h-full object-cover" />
          ) : (
            <span>{(displayName || "?").charAt(0).toUpperCase()}</span>
          )}
          {!isGuest && (
            <span className={`absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity ${isUploadingAvatar ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
              {isUploadingAvatar ? <Loader2 size={20} className="animate-spin text-white" /> : <Camera size={20} className="text-white" />}
            </span>
          )}
        </button>
        {!isGuest && (
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleAvatarFileChange}
            className="hidden"
          />
        )}
        <p className="font-sans text-xs text-slate-500 text-center">
          {isGuest ? t("admin.guest_user") : isUploadingAvatar ? t("settings.avatar_uploading") : t("settings.avatar_change_hint")}
        </p>

        {!isGuest && (
          isPremium ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold bg-amber-500/15 text-amber-400 light_sakura:bg-rose-100 light_sakura:text-rose-600">
              <Sparkles size={11} /> {t("premium.badge_active")}
            </span>
          ) : (
            <button
              onClick={() => { audioFeedback.playClick(); setIsPremiumOpen(true); }}
              className="cursor-pointer px-2.5 py-1 rounded-lg text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors light_sakura:bg-slate-100 light_sakura:text-slate-500"
            >
              {t("premium.menu_label")}
            </button>
          )
        )}
      </div>

      <div className="p-5 rounded-2xl border bg-slate-950/40 border-slate-800/60 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/50 shadow-sm space-y-4">
        <h3 className="font-sans font-bold text-sm text-slate-200 border-b border-slate-800/10 pb-2.5 light_sakura:text-slate-800 light_sakura:border-rose-100">
          {t("settings.profile_section")}
        </h3>
        <div className="space-y-1.5">
          <label className={cx("font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider block", tokens.text.muted)}>
            {t("settings.display_name")}
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={cx("w-full bg-slate-950 border rounded-xl px-4 py-2 text-xs text-white outline-none focus:border-indigo-500 light_sakura:bg-slate-50 light_sakura:text-slate-800", tokens.border.accent)}
          />
        </div>
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          type="button"
          onClick={handleUpdateProfileName}
          className="w-full cursor-pointer border border-transparent bg-indigo-600 hover:bg-indigo-500 py-2.5 rounded-xl font-sans text-xs font-semibold text-white tracking-tight transition-all"
        >
          {t("settings.btn_update_profile")}
        </motion.button>
      </div>

      <Modal
        isOpen={isProfileModalOpen}
        title={t("confirm.profile_update_title")}
        description={t("confirm.profile_update_desc", { name: displayName })}
        type="info"
        confirmLabel={t("confirm.profile_update_confirm")}
        cancelLabel={t("common.cancel")}
        onConfirm={executeUpdateProfileName}
        onCancel={() => { audioFeedback.playClick(); setIsProfileModalOpen(false); }}
      />

      <PremiumModal
        isOpen={isPremiumOpen}
        onClose={() => setIsPremiumOpen(false)}
        onPremiumActivated={() => { refreshPremium(); }}
      />
    </MobileSettingsDetailPage>
  );
};
