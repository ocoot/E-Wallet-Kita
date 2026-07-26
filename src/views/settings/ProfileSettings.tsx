import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Camera, Loader2, Sparkles, Cake, Link2 } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTheme } from "../../contexts/ThemeContext";
import { useToast } from "../../contexts/ToastContext";
import { useThemeTokens } from "../../hooks/useThemeTokens";
import { usePremium } from "../../hooks/usePremium";
import { useWallets } from "../../hooks/useWallets";
import { supabase } from "../../lib/supabase";
import { audioFeedback } from "../../lib/audio";
import { uploadAvatar, AvatarValidationError } from "../../lib/avatar";
import { walletDisplayLabel } from "../../lib/walletLabel";
import { Modal } from "../../components/Modal";
import { PremiumModal } from "../../components/PremiumModal";
import { MobileSettingsDetailPage } from "../../components/settings/MobileSettingsDetailPage";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { WalletPickerField } from "../../components/WalletPickerField";
import { UserSession } from "../../types";
import { reportFrontendError } from "../../lib/errorReporter";

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
  const { activeWallets } = useWallets();
  const ewalletOptions = activeWallets.filter((w) => w.type === "ewallet");
  const bankOptions = activeWallets.filter((w) => w.type === "bank");

  const [displayName, setDisplayName] = useState(user?.user_metadata?.full_name || user?.email?.split("@")[0] || "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  // Tanggal lahir (opsional) -- disinkronkan ke penanda "Ulang Tahun Anda"
  // di halaman Kalender (lihat CalendarPage.tsx).
  const [birthDate, setBirthDate] = useState<string>("");
  const [isSavingBirthDate, setIsSavingBirthDate] = useState(false);

  // Nomor HP & rekening TIDAK diketik manual -- keduanya ditaut (live sync,
  // read-only) ke pos dompet bertipe ewallet/bank yang sudah ada di fitur
  // Pos Dompet, supaya kalau nomornya diubah di sana, profil ikut berubah
  // otomatis tanpa perlu disalin ulang. Lihat migration
  // 20260829000000_profile_birthdate_and_wallet_contact_sync.sql.
  const [phoneWalletId, setPhoneWalletId] = useState<string>("");
  const [bankWalletId, setBankWalletId] = useState<string>("");
  const [isSavingContacts, setIsSavingContacts] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from("users")
        .select("display_name, avatar_url, birth_date, phone_wallet_id, bank_wallet_id")
        .eq("id", user.id)
        .single();
      if (!error && data) {
        if (data.display_name) setDisplayName(data.display_name);
        if (data.avatar_url) setAvatarUrl(data.avatar_url);
        setBirthDate(data.birth_date || "");
        setPhoneWalletId(data.phone_wallet_id || "");
        setBankWalletId(data.bank_wallet_id || "");
      }
    };
    fetchProfile();
  }, [user]);

  const linkedPhoneWallet = ewalletOptions.find((w) => w.id === phoneWalletId) || null;
  const linkedBankWallet = bankOptions.find((w) => w.id === bankWalletId) || null;

  const handleSaveBirthDate = async () => {
    if (!user?.id) return;
    audioFeedback.playClick();
    setIsSavingBirthDate(true);
    try {
      const { error } = await supabase.rpc("update_profile_contact_details", {
        p_user_id: user.id,
        p_birth_date: birthDate || null,
        p_clear_birth_date: !birthDate,
      });
      if (error) throw error;
      audioFeedback.playChime();
      showToast(birthDate ? t("settings.toast_birthdate_success") : t("settings.toast_birthdate_cleared"), "success");
    } catch (err: any) {
      audioFeedback.playDullPluck();
      showToast(err.message || t("settings.toast_birthdate_error"), "error");
      void reportFrontendError({
        source: "frontend:settings-profile",
        message: err?.message || String(err),
        context: { action: "update-birth-date" },
      });
    } finally {
      setIsSavingBirthDate(false);
    }
  };

  const handleSaveContacts = async () => {
    if (!user?.id) return;
    audioFeedback.playClick();
    setIsSavingContacts(true);
    try {
      const { error } = await supabase.rpc("update_profile_contact_details", {
        p_user_id: user.id,
        p_birth_date: null,
        p_phone_wallet_id: phoneWalletId || null,
        p_clear_phone_wallet_id: !phoneWalletId,
        p_bank_wallet_id: bankWalletId || null,
        p_clear_bank_wallet_id: !bankWalletId,
      });
      if (error) throw error;
      audioFeedback.playChime();
      showToast(t("settings.toast_contact_success"), "success");
    } catch (err: any) {
      audioFeedback.playDullPluck();
      showToast(err.message || t("settings.toast_contact_error"), "error");
      void reportFrontendError({
        source: "frontend:settings-profile",
        message: err?.message || String(err),
        context: { action: "update-contact-wallet-links" },
      });
    } finally {
      setIsSavingContacts(false);
    }
  };

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
        void reportFrontendError({
          source: "frontend:settings-profile",
          message: err?.message || String(err),
          context: { action: "upload-avatar" },
        });
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
      void reportFrontendError({
        source: "frontend:settings-profile",
        message: err?.message || String(err),
        context: { action: "update-profile-name" },
      });
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
          className={cx(`relative group w-20 h-20 shrink-0 rounded-full overflow-hidden text-white flex items-center justify-center font-sans font-bold text-3xl ${!isGuest ? "cursor-pointer" : "cursor-default"}`, tokens.settings.avatarBg)}
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
            <span className={cx("inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold", tokens.settings.premiumBadge)}>
              <Sparkles size={11} /> {t("premium.badge_active")}
            </span>
          ) : (
            <button
              onClick={() => { audioFeedback.playClick(); setIsPremiumOpen(true); }}
              className={cx("cursor-pointer px-2.5 py-1 rounded-lg text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold", tokens.settings.premiumDismissBtn)}
            >
              {t("premium.menu_label")}
            </button>
          )
        )}
      </div>

      <div className={cx("p-5 rounded-2xl shadow-sm space-y-4", tokens.settings.profileCardBgBorder)}>
        <h3 className={cx("font-sans font-bold text-sm", tokens.settings.sectionHeadingBorder)}>
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
            className={cx("w-full border rounded-xl px-4 py-2 text-xs outline-none focus:border-indigo-500", tokens.settings.otpInputBg, tokens.text.onSurface, tokens.border.accent)}
          />
        </div>
        <Button
          type="button"
          variant="primary"
          onClick={handleUpdateProfileName}
          fullWidth
          className="py-2.5 rounded-xl text-xs"
        >
          {t("settings.btn_update_profile")}
        </Button>
      </div>

      {!isGuest && (
        <div className={cx("p-5 rounded-2xl shadow-sm space-y-4", tokens.settings.profileCardBgBorder)}>
          <h3 className={cx("font-sans font-bold text-sm flex items-center gap-1.5", tokens.settings.sectionHeadingBorder)}>
            <Cake size={14} /> {t("settings.birth_date_section")}
          </h3>
          <div className="space-y-1.5">
            <Input
              type="date"
              label={t("settings.birth_date_label")}
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
            />
            <p className={cx("text-[11px] leading-relaxed", tokens.text.muted)}>
              {t("settings.birth_date_hint")}
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            onClick={handleSaveBirthDate}
            isLoading={isSavingBirthDate}
            fullWidth
            className="py-2.5 rounded-xl text-xs"
          >
            {t("settings.btn_save_birthdate")}
          </Button>
        </div>
      )}

      {!isGuest && (
        <div className={cx("p-5 rounded-2xl shadow-sm space-y-4", tokens.settings.profileCardBgBorder)}>
          <div>
            <h3 className={cx("font-sans font-bold text-sm flex items-center gap-1.5", tokens.settings.sectionHeadingBorder)}>
              <Link2 size={14} /> {t("settings.contact_section")}
            </h3>
            <p className={cx("text-[11px] leading-relaxed mt-1", tokens.text.muted)}>
              {t("settings.contact_desc")}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className={cx("font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider block", tokens.text.muted)}>
              {t("settings.contact_phone_label")}
            </label>
            <WalletPickerField
              value={phoneWalletId}
              onChange={setPhoneWalletId}
              placeholder={t("settings.contact_none_option")}
              options={[
                { value: "", label: t("settings.contact_none_option") },
                ...ewalletOptions.map((w) => ({ value: w.id, label: walletDisplayLabel(w) })),
              ]}
            />
            {ewalletOptions.length === 0 ? (
              <p className={cx("text-[11px]", tokens.text.faint)}>{t("settings.contact_no_ewallet")}</p>
            ) : linkedPhoneWallet ? (
              <p className={cx("text-[11px] font-mono", tokens.text.muted)}>
                {linkedPhoneWallet.phone_number
                  ? t("settings.contact_synced_number", { number: linkedPhoneWallet.phone_number })
                  : t("settings.contact_no_number_on_wallet")}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label className={cx("font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider block", tokens.text.muted)}>
              {t("settings.contact_bank_label")}
            </label>
            <WalletPickerField
              value={bankWalletId}
              onChange={setBankWalletId}
              placeholder={t("settings.contact_none_option")}
              options={[
                { value: "", label: t("settings.contact_none_option") },
                ...bankOptions.map((w) => ({ value: w.id, label: walletDisplayLabel(w) })),
              ]}
            />
            {bankOptions.length === 0 ? (
              <p className={cx("text-[11px]", tokens.text.faint)}>{t("settings.contact_no_bank")}</p>
            ) : linkedBankWallet ? (
              <p className={cx("text-[11px] font-mono", tokens.text.muted)}>
                {linkedBankWallet.account_number
                  ? t("settings.contact_synced_number", { number: linkedBankWallet.account_number })
                  : t("settings.contact_no_number_on_wallet")}
              </p>
            ) : null}
          </div>

          <Button
            type="button"
            variant="primary"
            onClick={handleSaveContacts}
            isLoading={isSavingContacts}
            fullWidth
            className="py-2.5 rounded-xl text-xs"
          >
            {t("settings.btn_save_contacts")}
          </Button>
        </div>
      )}

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
