import React, { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { useToast } from "../../contexts/ToastContext";
import { useThemeTokens } from "../../hooks/useThemeTokens";
import { usePremium } from "../../hooks/usePremium";
import { useNotificationPreferences, NotificationPreferenceKey } from "../../hooks/useNotificationPreferences";
import { supabase } from "../../lib/supabase";
import { requestFcmToken, saveFcmToken } from "../../lib/firebase";
import { ToggleSwitch } from "../../components/ui/ToggleSwitch";
import { Button } from "../../components/ui/Button";
import { MobileSettingsDetailPage } from "../../components/settings/MobileSettingsDetailPage";

type BrowserPermState = "granted" | "denied" | "default" | "unsupported";

/** Halaman detail "Notifikasi" (mobile) -- push & Telegram, per kategori. */
export const NotificationSettings: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const { tokens, cx } = useThemeTokens();
  const { isPremium } = usePremium();
  const isGuest = user?.is_anonymous ?? false;
  const isTelegramLocked = isGuest || !isPremium;

  const [isTelegramLinked, setIsTelegramLinked] = useState(false);

  // Item 6 (permission handling audit): status izin notifikasi browser
  // ditampilkan apa adanya di sini, dan permintaan izin HANYA dipicu saat
  // user menekan tombol "Aktifkan Notifikasi" di bawah -- bukan otomatis
  // saat login (lihat App.tsx untuk perubahan terkait).
  const [permStatus, setPermStatus] = useState<BrowserPermState>(
    typeof Notification === "undefined" ? "unsupported" : (Notification.permission as BrowserPermState)
  );
  const [isRequestingPerm, setIsRequestingPerm] = useState(false);

  const handleEnablePushNotifications = async () => {
    if (!user || isRequestingPerm) return;
    setIsRequestingPerm(true);
    try {
      const token = await requestFcmToken();
      const nextStatus: BrowserPermState = typeof Notification === "undefined" ? "unsupported" : (Notification.permission as BrowserPermState);
      setPermStatus(nextStatus);
      if (token) {
        await saveFcmToken(supabase, user.id, token);
        showToast(t("settings.notif_permission_granted_toast"), "success");
      } else if (nextStatus === "denied") {
        showToast(t("settings.notif_permission_denied_toast"), "error");
      }
    } finally {
      setIsRequestingPerm(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    const fetchTelegramStatus = async () => {
      const { data, error } = await supabase
        .from("users")
        .select("telegram_chat_id")
        .eq("id", user.id)
        .single();
      if (!error && data?.telegram_chat_id) setIsTelegramLinked(true);
    };
    fetchTelegramStatus();
  }, [user]);

  const {
    preferences: notifPrefs,
    loading: notifPrefsLoading,
    savingKey: notifPrefsSavingKey,
    setPreference: setNotifPreference,
  } = useNotificationPreferences(user?.id);

  const handleToggleNotifPref = async (key: NotificationPreferenceKey, next: boolean) => {
    const ok = await setNotifPreference(key, next);
    if (!ok) showToast(t("settings.notif_save_error"), "error");
  };

  return (
    <MobileSettingsDetailPage title={t("settings.menu_notifications")} description={t("settings.notif_section_desc")}>
      <div className="space-y-4">
        {notifPrefsLoading ? (
          <div className="flex items-center justify-center py-10 text-slate-500">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : (
          <>
            {/* Item 6: status & kontrol izin notifikasi browser -- ditaruh
                paling atas supaya user paham kenapa toggle di bawah
                mungkin belum efektif kalau izin belum diberikan. */}
            {permStatus === "unsupported" ? null : permStatus === "granted" ? (
              <div className={cx("flex items-center gap-2.5 p-3.5 rounded-xl text-[clamp(0.6188rem,2.86vw,0.6875rem)]", "bg-emerald-500/10 text-emerald-400")}>
                <BellRing size={15} className="shrink-0" />
                <span>{t("settings.notif_permission_granted_desc")}</span>
              </div>
            ) : permStatus === "denied" ? (
              <div className={cx("flex items-start gap-2.5 p-3.5 rounded-xl text-[clamp(0.6188rem,2.86vw,0.6875rem)] leading-relaxed", "bg-red-500/10 text-red-400")}>
                <ShieldAlert size={15} className="shrink-0 mt-0.5" />
                <span>{t("settings.notif_permission_denied_desc")}</span>
              </div>
            ) : (
              <div className={cx("flex flex-col gap-2.5 p-3.5 rounded-xl", tokens.settings.innerCardBgBorder)}>
                <div className="flex items-start gap-2.5">
                  <Bell size={15} className={cx("shrink-0 mt-0.5", tokens.text.muted)} />
                  <span className={cx("text-[clamp(0.6188rem,2.86vw,0.6875rem)] leading-relaxed", tokens.text.muted)}>
                    {t("settings.notif_permission_prompt_desc")}
                  </span>
                </div>
                <Button
                  variant="primary"
                  onClick={handleEnablePushNotifications}
                  disabled={isRequestingPerm}
                  isLoading={isRequestingPerm}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold"
                >
                  {t("settings.notif_permission_enable_btn")}
                </Button>
              </div>
            )}

            <div className="space-y-1.5">
              <span className="font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-slate-500 uppercase tracking-wider">
                {t("settings.notif_group_push")}
              </span>
              <div className={cx("rounded-xl px-3.5 divide-y", tokens.settings.innerCardBgBorder, tokens.settings.divideSubtle)}>
                <ToggleSwitch
                  label={t("settings.notif_push_transaction")}
                  description={t("settings.notif_push_transaction_desc")}
                  checked={notifPrefs.push_transaction}
                  loading={notifPrefsSavingKey === "push_transaction"}
                  onChange={(next) => handleToggleNotifPref("push_transaction", next)}
                />
                <ToggleSwitch
                  label={t("settings.notif_push_bill_reminder")}
                  description={t("settings.notif_push_bill_reminder_desc")}
                  checked={notifPrefs.push_bill_reminder}
                  loading={notifPrefsSavingKey === "push_bill_reminder"}
                  onChange={(next) => handleToggleNotifPref("push_bill_reminder", next)}
                />
                <ToggleSwitch
                  label={t("settings.notif_push_broadcast")}
                  description={t("settings.notif_push_broadcast_desc")}
                  checked={notifPrefs.push_broadcast}
                  loading={notifPrefsSavingKey === "push_broadcast"}
                  onChange={(next) => handleToggleNotifPref("push_broadcast", next)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-slate-500 uppercase tracking-wider">
                {t("settings.notif_group_telegram")}
              </span>
              {isTelegramLocked || !isTelegramLinked ? (
                <div className={cx("p-3 rounded-xl text-slate-500 text-[clamp(0.6188rem,2.86vw,0.6875rem)] leading-relaxed flex items-center gap-2", tokens.settings.innerCardBgBorder)}>
                  <BellOff size={13} className="shrink-0" />
                  <span>{t("settings.notif_telegram_locked")}</span>
                </div>
              ) : (
                <div className={cx("rounded-xl px-3.5 divide-y", tokens.settings.innerCardBgBorder, tokens.settings.divideSubtle)}>
                  <ToggleSwitch
                    label={t("settings.notif_telegram_budget_alert")}
                    description={t("settings.notif_telegram_budget_alert_desc")}
                    checked={notifPrefs.telegram_budget_alert}
                    loading={notifPrefsSavingKey === "telegram_budget_alert"}
                    onChange={(next) => handleToggleNotifPref("telegram_budget_alert", next)}
                  />
                  <ToggleSwitch
                    label={t("settings.notif_telegram_bill_reminder")}
                    description={t("settings.notif_telegram_bill_reminder_desc")}
                    checked={notifPrefs.telegram_bill_reminder}
                    loading={notifPrefsSavingKey === "telegram_bill_reminder"}
                    onChange={(next) => handleToggleNotifPref("telegram_bill_reminder", next)}
                  />
                  <ToggleSwitch
                    label={t("settings.notif_telegram_broadcast")}
                    description={t("settings.notif_telegram_broadcast_desc")}
                    checked={notifPrefs.telegram_broadcast}
                    loading={notifPrefsSavingKey === "telegram_broadcast"}
                    onChange={(next) => handleToggleNotifPref("telegram_broadcast", next)}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </MobileSettingsDetailPage>
  );
};
