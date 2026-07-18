import React, { useState, useEffect } from "react";
import logoUrl from "../assets/images/user_logo_transparent.png";
import { useLanguage } from "../contexts/LanguageContext";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { Link, useLocation } from "react-router-dom";
import { 
  LogOut, 
  ChevronLeft, 
  ChevronRight, 
  Globe,
  SunMoon,
  ShieldCheck,
  ShieldAlert,
  Volume2,
  VolumeX,
  Lock,
} from "lucide-react";
import { audioFeedback } from "../lib/audio";
import { useMaintenance } from "../contexts/MaintenanceContext";
import { useNavItems } from "../hooks/useNavItems";
import { useThemeTokens } from "../hooks/useThemeTokens";

interface SidebarProps {
  onLogoutClick: () => void;
  isCollapsed: boolean;
  onToggle: (collapsed: boolean) => void;
  userDisplayName?: string;
  userAvatarUrl?: string | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  onLogoutClick,
  isCollapsed,
  onToggle,
  userDisplayName,
  userAvatarUrl
}) => {
  const { user } = useAuth();
  const { locale, setLocale, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { isFeatureLocked } = useMaintenance();
  const { tokens, cx } = useThemeTokens();
  const location = useLocation();

  // In Supabase, is_guest can be inferred from is_anonymous
  const isGuest = user?.is_anonymous ?? false;
  
  const [displayName, setDisplayName] = useState<string>(userDisplayName || user?.user_metadata?.full_name || user?.email || t("admin.guest_user"));
  // `avatarUrl` mengikuti pola yang sama seperti `displayName` di atas --
  // sinkron langsung dari prop `userAvatarUrl` (dilempar App.tsx begitu
  // Settings/ProfileSettings memanggil onUserPrefUpdated setelah ganti
  // foto), supaya avatar bulat di sidebar ini ikut ter-update SEKETIKA
  // tanpa perlu reload halaman. Kalau prop belum ada (mis. saat baru buka
  // app di route lain yang belum pernah menyentuh halaman profil), fallback
  // fetch langsung dari Supabase di bawah.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(userAvatarUrl ?? null);

  useEffect(() => {
    if (userDisplayName) {
      setDisplayName(userDisplayName);
    }
  }, [userDisplayName]);

  useEffect(() => {
    if (userAvatarUrl !== undefined) {
      setAvatarUrl(userAvatarUrl);
    }
  }, [userAvatarUrl]);

  useEffect(() => {
    if (userDisplayName && userAvatarUrl !== undefined) return;
    if (!user) return;
    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from("users")
        .select("display_name, avatar_url")
        .eq("id", user.id)
        .single();
      if (!error && data) {
        if (!userDisplayName && data.display_name) setDisplayName(data.display_name);
        if (userAvatarUrl === undefined && data.avatar_url) setAvatarUrl(data.avatar_url);
      }
    };
    fetchProfile();
  }, [user, userDisplayName, userAvatarUrl]);

  const menuItems = useNavItems();

  const activeTab = menuItems.find(item => location.pathname === item.path)?.id || "dashboard";

  const [isMuted, setIsMuted] = useState(audioFeedback.getIsMuted());

  const toggleMute = () => {
    const nextMute = audioFeedback.toggleMute();
    setIsMuted(nextMute);
    if (!nextMute) {
      audioFeedback.playChime();
    } else {
      audioFeedback.playClick();
    }
  };

  const toggleLanguage = () => {
    audioFeedback.playClick();
    setLocale(locale === "id" ? "en" : "id");
  };

  const toggleTheme = () => {
    audioFeedback.playClick();
    setTheme(theme === "dark_obsidian" ? "light_sakura" : "dark_obsidian");
  };

  return (
    <>
      {/* Desktop Persistent and Collapsible Sidebar (tampilan handphone kini
          memakai navbar bawah -- lihat MobileBottomNav.tsx) */}
          <aside 
        className={cx(
          "hidden md:flex flex-col h-screen fixed top-0 left-0 border-r transition-all duration-300 z-30 shadow-[8px_0_32px_rgba(0,0,0,0.35)] light_sakura:shadow-[8px_0_32px_rgba(244,63,94,0.08)]",
          tokens.sidebar.brandBg,
          tokens.text.onSurface,
          isCollapsed ? "w-20" : "w-64"
        )}
      >
        {/* Sidebar Brand header */}
        <div className="flex items-center justify-between p-6">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="shrink-0">
              <img 
                src={logoUrl} 
                alt="EWK Icon" 
                className="w-9 h-9 object-contain"
              />
            </div>
            <div className={`transition-all duration-300 flex items-center overflow-hidden ${isCollapsed ? "w-0 opacity-0 -translate-x-4" : "w-auto opacity-100 translate-x-0"}`}>
              <span className={cx("font-sans font-bold text-lg tracking-tight select-none truncate dark_obsidian:text-white whitespace-nowrap", tokens.text.primary)}>
                {t("app.title")}
              </span>
            </div>
          </div>
          
          {/* Collapse/Expand action trigger button */}
          {!isCollapsed && (
            <button
              onClick={() => onToggle(true)}
              className={cx("p-1 rounded-lg hover:bg-white/5 light_sakura:hover:bg-slate-200 cursor-pointer hidden md:block hover:text-white light_sakura:hover:text-slate-800 transition-all duration-205", tokens.text.mutedAlt)}
            >
              <ChevronLeft size={16} />
            </button>
          )}
          {isCollapsed && (
            <button
              onClick={() => onToggle(false)}
              className={cx(
                "absolute -right-3 top-8 p-1.5 rounded-full border hover:scale-105 active:scale-95 transition-all duration-205 cursor-pointer",
                "bg-slate-950 border-slate-800 hover:text-white light_sakura:bg-slate-100 light_sakura:border-slate-200",
                tokens.text.mutedAlt
              )}
            >
              <ChevronRight size={14} />
            </button>
          )}
        </div>

        {/* Profile widget summary and state */}
        <div className="px-4 mb-6">
          <div className={cx(
            "transition-all duration-300 rounded-xl border flex items-center",
            isCollapsed 
              ? "bg-transparent border-transparent p-0 justify-center" 
              : cx("p-3 backdrop-blur-sm gap-2.5", tokens.sidebar.profileWidget)
          )}>
            <div className={cx(
              "w-8 h-8 shrink-0 rounded-full flex items-center justify-center overflow-hidden text-xs font-bold shadow-xs transition-all duration-300",
              tokens.mobileBottomNav.profileBg,
              tokens.text.accent
            )}>
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                displayName.charAt(0).toUpperCase()
              )}
            </div>
            
            <div className={`transition-all duration-300 flex flex-col min-w-0 overflow-hidden ${isCollapsed ? "w-0 opacity-0 -translate-x-4" : "w-full opacity-100 translate-x-0"}`}>
              <p className={cx("font-mono text-[clamp(0.5062rem,2.34vw,0.5625rem)] uppercase tracking-widest leading-none whitespace-nowrap", tokens.text.accent)}>
                {isGuest ? t("history.status_guest") : t("history.status_verified")}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                {isGuest ? (
                  <ShieldAlert size={12} className="text-amber-400 shrink-0" />
                ) : (
                  <ShieldCheck size={12} className={cx("shrink-0", tokens.text.success)} />
                )}
                <span className={cx("font-sans font-semibold text-xs truncate whitespace-nowrap", tokens.text.onSurface)}>
                  {displayName}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Menu Items listings */}
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto overscroll-contain">
          {menuItems.map((item) => {
            const IconComp = item.icon;
            const isActive = activeTab === item.id;
            const locked = !!item.featureKey && isFeatureLocked(item.featureKey);
            return (
              <Link
                key={item.id}
                to={item.path}
                title={isCollapsed ? item.label : undefined}
                className={cx("w-full flex items-center px-4 py-3 rounded-xl font-sans text-sm font-medium transition-all duration-300 cursor-pointer", isCollapsed ? "gap-0 justify-center" : "gap-3", isActive ? tokens.sidebar.menuItemActive : locked ? tokens.text.faint : cx(tokens.text.label, tokens.sidebar.menuItemInactive))}
              >
                <IconComp size={18} className="shrink-0 transition-transform duration-300 hover:scale-105" />
                <div className={`transition-all duration-300 flex items-center justify-between min-w-0 overflow-hidden flex-1 ${isCollapsed ? "w-0 opacity-0 -translate-x-4" : "w-auto opacity-100 translate-x-0"}`}>
                  <span className="truncate whitespace-nowrap">{item.label}</span>
                  {locked && <Lock size={14} className="text-amber-400 shrink-0 ml-2" />}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Footer controls */}
        <div className={cx("p-4 border-t space-y-3", tokens.border.accent)}>
          {/* Theme, Language, and Sound inline switcher controls */}
          <div className="relative min-h-[36px]">
            <div className={`transition-all duration-300 ${isCollapsed ? "opacity-0 scale-75 pointer-events-none absolute inset-x-0 top-0" : "opacity-100 scale-100 grid grid-cols-3 gap-1"}`}>
              <button
                onClick={toggleLanguage}
                title={t("settings.language")}
                className={cx("flex flex-col items-center justify-center py-1.5 rounded-xl border hover:bg-slate-900 font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-semibold cursor-pointer", tokens.sidebar.footerAction, tokens.text.secondary)}
              >
                <Globe size={11} className="mb-0.5" />
                <span>{locale.toUpperCase()}</span>
              </button>
              <button
                onClick={toggleTheme}
                title={t("settings.theme")}
                className={cx("flex flex-col items-center justify-center py-1.5 rounded-xl border hover:bg-slate-900 font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-semibold cursor-pointer", tokens.sidebar.footerAction, tokens.text.secondary)}
              >
                <SunMoon size={11} className="mb-0.5" />
                <span>{theme === "dark_obsidian" ? t("common.dark") : t("common.light")}</span>
              </button>
              <button
                onClick={toggleMute}
                title="Toggle Effects Sound"
                className={cx("flex flex-col items-center justify-center py-1.5 rounded-xl border hover:bg-slate-900 font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-semibold cursor-pointer", tokens.sidebar.footerAction, tokens.text.secondary)}
              >
                {isMuted ? (
                  <VolumeX size={11} className={cx("mb-0.5", tokens.text.danger)} />
                ) : (
                  <Volume2 size={11} className={cx("mb-0.5", tokens.icon.accent)} />
                )}
                <span>{isMuted ? t("common.muted") : t("common.sound")}</span>
              </button>
            </div>

            <div className={`transition-all duration-300 flex flex-col items-center gap-2 ${isCollapsed ? "opacity-100 scale-100" : "opacity-0 scale-75 pointer-events-none absolute inset-x-0 top-0"}`}>
              <button
                onClick={toggleLanguage}
                title={t("settings.language")}
                className={cx(tokens.sidebar.collapsedIconBtn, tokens.text.secondary)}
              >
                <Globe size={14} />
              </button>
              <button
                onClick={toggleTheme}
                title={t("settings.theme")}
                className={cx(tokens.sidebar.collapsedIconBtn, tokens.text.secondary)}
              >
                <SunMoon size={14} />
              </button>
              <button
                onClick={toggleMute}
                title="Mute / Unmute"
                className={cx(tokens.sidebar.collapsedIconBtn, tokens.text.secondary)}
              >
                {isMuted ? (
                  <VolumeX size={14} className={cx(tokens.text.danger)} />
                ) : (
                  <Volume2 size={14} className={cx(tokens.icon.accent)} />
                )}
              </button>
            </div>
          </div>

          {/* Log out actions */}
              <button
                onClick={onLogoutClick}
                className={cx("w-full flex items-center justify-center rounded-xl border font-sans text-xs font-semibold transition-all duration-300 cursor-pointer py-2.5", tokens.sidebar.logoutBtn, isCollapsed ? "px-0 gap-0 justify-center" : "px-3 gap-2")}
              >
            <LogOut size={14} className="shrink-0" />
            <div className={`transition-all duration-300 overflow-hidden flex items-center ${isCollapsed ? "w-0 opacity-0 -translate-x-4" : "w-auto opacity-100 translate-x-0"}`}>
              <span className="whitespace-nowrap">{t("nav.logout")}</span>
            </div>
          </button>
        </div>
      </aside>
    </>
  );
};
