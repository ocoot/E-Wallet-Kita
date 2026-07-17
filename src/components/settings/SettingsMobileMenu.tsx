import React from "react";
import { Link } from "react-router-dom";
import {
  User as UserIcon,
  Lock,
  Bell,
  Globe,
  SunMoon,
  Smartphone,
  Send,
  ShieldQuestion,
  Sparkles,
  ChevronRight,
  CheckCircle,
} from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useThemeTokens } from "../../hooks/useThemeTokens";
import { audioFeedback } from "../../lib/audio";

interface SettingsMobileMenuProps {
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  isGuest: boolean;
  isPremium: boolean;
  onOpenPremium: () => void;
  canChangePassword: boolean;
  isTelegramLinked: boolean;
  isTelegramLocked: boolean;
  isStandalone: boolean;
  locale: "id" | "en";
  theme: "dark_obsidian" | "light_sakura";
}

interface MenuRowDef {
  to: string;
  icon: React.ReactNode;
  label: string;
  desc?: string;
  rightText?: string;
  rightBadge?: React.ReactNode;
}

const MenuRow: React.FC<MenuRowDef> = ({ to, icon, label, desc, rightText, rightBadge }) => {
  const { tokens, cx } = useThemeTokens();
  return (
    <Link
      to={to}
      onClick={() => audioFeedback.playClick()}
      className={cx(
        "flex items-center gap-3 px-4 py-3.5 first:rounded-t-2xl last:rounded-b-2xl transition-colors cursor-pointer",
        tokens.hover.sunken
      )}
    >
      <span className={cx("shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-slate-950/60 light_sakura:bg-rose-50", tokens.icon.accent)}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx("block font-sans text-sm font-semibold truncate", tokens.text.label)}>{label}</span>
        {desc && (
          <span className="block font-sans text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-500 truncate mt-0.5">
            {desc}
          </span>
        )}
      </span>
      <span className="shrink-0 flex items-center gap-1.5">
        {rightBadge}
        {rightText && (
          <span className="font-sans text-xs text-slate-500 light_sakura:text-slate-400">{rightText}</span>
        )}
        <ChevronRight size={16} className="text-slate-600 light_sakura:text-slate-300" />
      </span>
    </Link>
  );
};

/**
 * Menu list "Profile/Akun" untuk tampilan mobile (md:hidden). Meniru pola
 * referensi desain: kartu profil ringkas di atas, lalu daftar menu
 * dikelompokkan (Akun / Preferensi / Privasi & Dukungan), setiap baris
 * membuka halaman detailnya sendiri (lihat `MobileSettingsDetailPage` &
 * route-route baru `/settings/*` di App.tsx).
 */
export const SettingsMobileMenu: React.FC<SettingsMobileMenuProps> = ({
  displayName,
  email,
  avatarUrl,
  isGuest,
  isPremium,
  onOpenPremium,
  canChangePassword,
  isTelegramLinked,
  isTelegramLocked,
  isStandalone,
  locale,
  theme,
}) => {
  const { t } = useLanguage();
  const { tokens, cx } = useThemeTokens();

  return (
    <div className="md:hidden space-y-5">
      {/* Page title */}
      <div className="px-1">
        <h1 className={cx("font-sans font-bold text-2xl tracking-tight", tokens.text.primary)}>
          {t("nav.settings")}
        </h1>
        <p className="font-sans text-sm text-slate-400 mt-1 light_sakura:text-slate-500 font-medium">
          {t("settings.desc")}
        </p>
      </div>

      {/* Profile summary card */}
      <div className={cx("flex items-center gap-3.5 p-4 rounded-2xl border border-slate-800/60 light_sakura:border-rose-100/50 shadow-sm", tokens.surface.card)}>
        <div className="relative w-12 h-12 shrink-0 rounded-full overflow-hidden bg-indigo-600 light_sakura:bg-rose-500 text-white flex items-center justify-center font-sans font-bold text-lg">
          {avatarUrl ? (
            <img src={avatarUrl} alt={displayName || "avatar"} className="w-full h-full object-cover" />
          ) : (
            <span>{(displayName || "?").charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className={cx("font-sans font-bold text-sm truncate", tokens.text.onSurface)}>
            {displayName || t("admin.guest_user")}
          </p>
          <p className="text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-500 mt-0.5 truncate">
            {isGuest ? t("admin.guest_user") : (email || t("premium.menu_label"))}
          </p>
        </div>
        {!isGuest && (
          isPremium ? (
            <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold bg-amber-500/15 text-amber-400 light_sakura:bg-rose-100 light_sakura:text-rose-600">
              <Sparkles size={11} /> {t("premium.badge_active")}
            </span>
          ) : (
            <button
              onClick={onOpenPremium}
              className="shrink-0 cursor-pointer px-2.5 py-1 rounded-lg text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors light_sakura:bg-slate-100 light_sakura:text-slate-500"
            >
              {t("premium.menu_label")}
            </button>
          )
        )}
      </div>

      {/* Group: Akun */}
      <div className="space-y-2">
        <span className="px-1 font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-widest text-slate-500">
          {t("settings.menu_group_account")}
        </span>
        <div className={cx("rounded-2xl border border-slate-800/60 light_sakura:border-rose-100/50 divide-y divide-slate-800/60 light_sakura:divide-rose-100/60 shadow-sm overflow-hidden", tokens.surface.card)}>
          <MenuRow
            to="/settings/profile"
            icon={<UserIcon size={16} />}
            label={t("settings.menu_manage_profile")}
            desc={t("settings.menu_manage_profile_desc")}
          />
          {canChangePassword && (
            <MenuRow
              to="/settings/security"
              icon={<Lock size={16} />}
              label={t("settings.menu_security")}
              desc={t("settings.menu_security_desc")}
            />
          )}
          <MenuRow
            to="/settings/notifications"
            icon={<Bell size={16} />}
            label={t("settings.menu_notifications")}
            desc={t("settings.menu_notifications_desc")}
          />
          <MenuRow
            to="/settings/language"
            icon={<Globe size={16} />}
            label={t("settings.menu_language")}
            rightText={locale.toUpperCase()}
          />
        </div>
      </div>

      {/* Group: Preferensi */}
      <div className="space-y-2">
        <span className="px-1 font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-widest text-slate-500">
          {t("settings.menu_group_preferences")}
        </span>
        <div className={cx("rounded-2xl border border-slate-800/60 light_sakura:border-rose-100/50 divide-y divide-slate-800/60 light_sakura:divide-rose-100/60 shadow-sm overflow-hidden", tokens.surface.card)}>
          <MenuRow
            to="/settings/theme"
            icon={<SunMoon size={16} />}
            label={t("settings.menu_theme")}
            rightText={theme === "dark_obsidian" ? t("settings.theme_short_dark") : t("settings.theme_short_light")}
          />
          <MenuRow
            to="/settings/pwa"
            icon={<Smartphone size={16} />}
            label={t("settings.menu_pwa")}
            desc={isStandalone ? undefined : t("settings.menu_pwa_desc")}
            rightBadge={isStandalone ? <CheckCircle size={14} className={tokens.text.success} /> : undefined}
          />
          <MenuRow
            to="/settings/telegram"
            icon={<Send size={16} />}
            label={t("settings.menu_telegram")}
            desc={isTelegramLocked ? undefined : t("settings.menu_telegram_desc_short")}
            rightText={
              isTelegramLocked
                ? undefined
                : (isTelegramLinked ? t("settings.status_connected") : t("settings.status_not_connected"))
            }
          />
        </div>
      </div>

      {/* Group: Privasi & Dukungan */}
      <div className="space-y-2">
        <span className="px-1 font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-widest text-slate-500">
          {t("settings.menu_group_other")}
        </span>
        <div className={cx("rounded-2xl border border-slate-800/60 light_sakura:border-rose-100/50 divide-y divide-slate-800/60 light_sakura:divide-rose-100/60 shadow-sm overflow-hidden", tokens.surface.card)}>
          <MenuRow
            to="/settings/privacy"
            icon={<ShieldQuestion size={16} />}
            label={t("settings.menu_privacy")}
            desc={t("settings.privacy_section_desc")}
          />
        </div>
      </div>
    </div>
  );
};
