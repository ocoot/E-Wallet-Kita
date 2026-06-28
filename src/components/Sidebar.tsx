import React, { useState, useEffect } from "react";
import logoUrl from "../assets/images/user_logo_transparent.png";
import { useLanguage } from "../contexts/LanguageContext";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { 
  Wallet, 
  LayoutDashboard, 
  PlusCircle, 
  History as HistoryIcon, 
  Settings as SettingsIcon, 
  LogOut, 
  ChevronLeft, 
  ChevronRight, 
  Menu, 
  X,
  Globe,
  SunMoon,
  ShieldCheck,
  ShieldAlert,
  Volume2,
  VolumeX,
  Shield,
  Lock,
  PiggyBank,
  Bell
} from "lucide-react";
import { audioFeedback } from "../lib/audio";
import { useAdmin } from "../hooks/useAdmin";
import { useMaintenance } from "../contexts/MaintenanceContext";

interface SidebarProps {
  onLogoutClick: () => void;
  isCollapsed: boolean;
  onToggle: (collapsed: boolean) => void;
  userDisplayName?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  onLogoutClick,
  isCollapsed,
  onToggle,
  userDisplayName
}) => {
  const { user } = useAuth();
  const { locale, setLocale, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { isAdmin } = useAdmin();
  const { isFeatureLocked } = useMaintenance();
  const location = useLocation();
  
  // Mobile drawer overlay state
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // In Supabase, is_guest can be inferred from is_anonymous
  const isGuest = user?.is_anonymous ?? false;
  
  const [displayName, setDisplayName] = useState<string>(userDisplayName || user?.user_metadata?.full_name || user?.email || t("admin.guest_user"));

  useEffect(() => {
    if (userDisplayName) {
      setDisplayName(userDisplayName);
    }
  }, [userDisplayName]);

  useEffect(() => {
    if (userDisplayName) return;
    if (!user) return;
    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from("users")
        .select("display_name")
        .eq("id", user.id)
        .single();
      if (!error && data?.display_name) {
        setDisplayName(data.display_name);
      }
    };
    fetchProfile();
  }, [user, userDisplayName]);

  const menuItems: { id: string; label: string; icon: any; path: string; featureKey?: string }[] = [
    { id: "dashboard", label: t("nav.dashboard"), icon: LayoutDashboard, path: "/dashboard" },
    { id: "new_transaction", label: t("nav.new_transaction"), icon: PlusCircle, path: "/transactions/new", featureKey: "new_transaction" },
    { id: "budget", label: t("nav.budget"), icon: PiggyBank, path: "/budget", featureKey: "budget" },
    { id: "bill_reminders", label: t("nav.bill_reminders"), icon: Bell, path: "/bill-reminders", featureKey: "bill_reminders" },
    { id: "history", label: t("nav.history"), icon: HistoryIcon, path: "/transactions", featureKey: "history" },
    { id: "settings", label: t("nav.settings"), icon: SettingsIcon, path: "/settings", featureKey: "settings" },
  ];

  if (isAdmin) {
    menuItems.push({ id: "admin", label: t("nav.admin_panel"), icon: Shield, path: "/admin" });
  }

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
      {/* 1. Mobile top bar Header (visible only on mobile) */}
      <header className="md:hidden flex items-center justify-between p-4 border-b bg-slate-950/90 border-slate-800 text-white dark_obsidian:bg-slate-950 dark_obsidian:border-slate-800 light_sakura:bg-rose-500 light_sakura:border-rose-400 light_sakura:text-white sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="shrink-0">
            <img 
              src={logoUrl} 
              alt="EWK Icon" 
              className="w-8 h-8 object-contain"
            />
          </div>
          <h1 className="font-sans font-bold text-lg tracking-tight">
            {t("app.title")}
          </h1>
        </div>
        <button
          onClick={() => setIsMobileOpen(true)}
          className="p-1 rounded-lg text-current focus:outline-none hover:bg-white/10"
        >
          <Menu size={24} />
        </button>
      </header>

      {/* 2. Mobile Drawer Screen overlay (when open) */}
      <AnimatePresence>
        {isMobileOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            {/* Overlay mask backing */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-xs"
              onClick={() => setIsMobileOpen(false)}
            />

            {/* Drawer content */}
            <motion.div 
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="relative flex flex-col w-72 max-w-[80vw] h-full bg-slate-900 border-r border-slate-800 text-white dark_obsidian:bg-slate-900 dark_obsidian:border-slate-800 light_sakura:bg-rose-50 light_sakura:text-slate-800 light_sakura:border-rose-100"
            >
              {/* Header — sticky, tidak ikut scroll */}
              <div className="flex items-center justify-between px-6 py-5 shrink-0 border-b border-slate-800/60 light_sakura:border-rose-100">
                <div className="flex items-center gap-2">
                  <div className="shrink-0">
                    <img 
                      src={logoUrl} 
                      alt="EWK Icon" 
                      className="w-8 h-8 object-contain"
                    />
                  </div>
                  <span className="font-sans font-bold text-lg tracking-tight text-white dark_obsidian:text-white light_sakura:text-slate-900">
                    {t("app.title")}
                  </span>
                </div>
                <button 
                  onClick={() => setIsMobileOpen(false)}
                  className="p-1 rounded-lg hover:bg-white/10 light_sakura:hover:bg-slate-200 cursor-pointer text-white dark_obsidian:text-white light_sakura:text-slate-800"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Scrollable area — profile + nav */}
              <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5 space-y-5">

              {/* Profile widget summary */}
              <div className="p-4 rounded-xl border bg-slate-950/40 border-slate-800 light_sakura:bg-rose-100/50 light_sakura:border-rose-200">
                <p className="font-mono text-[10px] text-gray-400 light_sakura:text-rose-600 uppercase tracking-widest">
                  {isGuest ? t("history.status_guest") : t("history.status_verified")}
                </p>
                <div className="flex items-center gap-2.5 mt-1">
                  {isGuest ? (
                    <ShieldAlert size={16} className="text-amber-400" />
                  ) : (
                    <ShieldCheck size={16} className="text-emerald-400 light_sakura:text-emerald-600" />
                  )}
                  <span className="font-sans font-semibold text-sm truncate max-w-[180px] dark_obsidian:text-slate-200 light_sakura:text-slate-900">
                    {displayName}
                  </span>
                </div>
              </div>

              {/* Menu Items */}
              <nav className="space-y-1.5">
                {menuItems.map((item) => {
                  const IconComp = item.icon;
                  const isActive = activeTab === item.id;
                  const locked = !!item.featureKey && isFeatureLocked(item.featureKey);
                  return (
                    <Link
                      key={item.id}
                      to={item.path}
                      onClick={() => setIsMobileOpen(false)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-sans text-sm font-medium transition-all duration-150 cursor-pointer
                        ${isActive 
                          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/10 light_sakura:bg-rose-500 light_sakura:text-white" 
                          : locked
                            ? "text-slate-500 light_sakura:text-slate-400"
                            : "text-gray-300 hover:bg-slate-800 light_sakura:text-slate-600 light_sakura:hover:bg-rose-100"
                        }`}
                    >
                      <IconComp size={18} />
                      <span className="flex-1">{item.label}</span>
                      {locked && <Lock size={14} className="text-amber-400 shrink-0" />}
                    </Link>
                  );
                })}
              </nav>
              </div>{/* end scrollable area */}

              {/* Footer controls — sticky, tidak ikut scroll */}
              <div className="shrink-0 px-6 py-4 space-y-4 border-t border-slate-800 light_sakura:border-rose-100">
                {/* Theme, Language, and Audio inline controller */}
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={toggleLanguage}
                    className="flex flex-col items-center justify-center py-2 rounded-xl border border-slate-800 hover:bg-slate-800 font-sans text-[10px] sm:text-xs font-semibold cursor-pointer text-slate-300 light_sakura:border-rose-200 light_sakura:text-slate-700 light_sakura:hover:bg-rose-100"
                  >
                    <Globe size={13} className="mb-0.5" />
                    <span>{locale.toUpperCase()}</span>
                  </button>
                  <button
                    onClick={toggleTheme}
                    className="flex flex-col items-center justify-center py-2 rounded-xl border border-slate-800 hover:bg-slate-800 font-sans text-[10px] sm:text-xs font-semibold cursor-pointer text-slate-300 light_sakura:border-rose-200 light_sakura:text-slate-700 light_sakura:hover:bg-rose-100"
                  >
                    <SunMoon size={13} className="mb-0.5" />
                    <span>{theme === "dark_obsidian" ? t("common.dark") : t("common.light")}</span>
                  </button>
                  <button
                    onClick={toggleMute}
                    className="flex flex-col items-center justify-center py-2 rounded-xl border border-slate-800 hover:bg-slate-800 font-sans text-[10px] sm:text-xs font-semibold cursor-pointer text-slate-300 light_sakura:border-rose-200 light_sakura:text-slate-700 light_sakura:hover:bg-rose-100 animate-fade-in"
                    title="Mute / Unmute"
                  >
                    {isMuted ? (
                      <VolumeX size={13} className="text-red-400 light_sakura:text-red-500 mb-0.5 animate-pulse" />
                    ) : (
                      <Volume2 size={13} className="text-teal-400 light_sakura:text-rose-500 mb-0.5" />
                    )}
                    <span>{isMuted ? t("common.muted") : t("common.sound")}</span>
                  </button>
                </div>

                {/* Log out */}
                <button
                  onClick={() => {
                    setIsMobileOpen(false);
                    onLogoutClick();
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border bg-slate-950/40 border-red-500/20 text-red-400 hover:bg-red-500/10 font-sans text-sm font-semibold transition-colors cursor-pointer light_sakura:bg-red-50 light_sakura:border-red-200 light_sakura:text-red-600 light_sakura:hover:bg-red-100"
                >
                  <LogOut size={16} />
                  <span>{t("nav.logout")}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 3. Desktop Persistent and Collapsible Sidebar */}
      <aside 
        className={`hidden md:flex flex-col h-screen fixed top-0 left-0 border-r transition-all duration-300 z-30
          bg-slate-950 border-slate-900 text-white dark_obsidian:bg-slate-950 dark_obsidian:border-slate-900
          light_sakura:bg-rose-50 light_sakura:text-slate-800 light_sakura:border-rose-100/80
          ${isCollapsed ? "w-20" : "w-64"}`}
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
              <span className="font-sans font-bold text-lg tracking-tight select-none truncate text-white dark_obsidian:text-white light_sakura:text-slate-900 whitespace-nowrap">
                {t("app.title")}
              </span>
            </div>
          </div>
          
          {/* Collapse/Expand action trigger button */}
          {!isCollapsed && (
            <button
              onClick={() => onToggle(true)}
              className="p-1 rounded-lg hover:bg-white/5 light_sakura:hover:bg-slate-200 cursor-pointer hidden md:block text-slate-400 hover:text-white light_sakura:text-slate-600 light_sakura:hover:text-slate-800 transition-all duration-205"
            >
              <ChevronLeft size={16} />
            </button>
          )}
          {isCollapsed && (
            <button
              onClick={() => onToggle(false)}
              className="absolute -right-3 top-8 p-1.5 rounded-full border bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:scale-105 active:scale-95 transition-all duration-205 cursor-pointer light_sakura:bg-slate-100 light_sakura:border-slate-200 light_sakura:text-slate-800"
            >
              <ChevronRight size={14} />
            </button>
          )}
        </div>

        {/* Profile widget summary and state */}
        <div className="px-4 mb-6">
          <div className={`transition-all duration-300 rounded-xl border flex items-center ${isCollapsed ? "bg-transparent border-transparent p-0 justify-center" : "p-3 bg-slate-900/40 border-slate-900 light_sakura:bg-rose-100/40 light_sakura:border-rose-100/70 gap-2.5"}`}>
            <div className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center bg-slate-900 text-teal-400 light_sakura:bg-rose-200 light_sakura:text-rose-600 text-xs font-bold shadow-xs transition-all duration-300">
              {displayName.charAt(0).toUpperCase()}
            </div>
            
            <div className={`transition-all duration-300 flex flex-col min-w-0 overflow-hidden ${isCollapsed ? "w-0 opacity-0 -translate-x-4" : "w-full opacity-100 translate-x-0"}`}>
              <p className="font-mono text-[9px] text-gray-400 light_sakura:text-rose-500 uppercase tracking-widest leading-none whitespace-nowrap">
                {isGuest ? t("history.status_guest") : t("history.status_verified")}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                {isGuest ? (
                  <ShieldAlert size={12} className="text-amber-400 shrink-0" />
                ) : (
                  <ShieldCheck size={12} className="text-emerald-400 light_sakura:text-emerald-600 shrink-0" />
                )}
                <span className="font-sans font-semibold text-xs truncate text-slate-200 light_sakura:text-slate-800 whitespace-nowrap">
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
                className={`w-full flex items-center px-4 py-3 rounded-xl font-sans text-sm font-medium transition-all duration-300 cursor-pointer
                  ${isCollapsed ? "gap-0 justify-center" : "gap-3"}
                  ${isActive 
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/10 light_sakura:bg-rose-500 light_sakura:text-white" 
                    : locked
                      ? "text-slate-500 light_sakura:text-slate-400"
                      : "text-slate-300 hover:bg-slate-900 light_sakura:text-slate-600 light_sakura:hover:bg-rose-100/70"
                  }`}
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
        <div className="p-4 border-t border-slate-900 light_sakura:border-rose-100 space-y-3">
          {/* Theme, Language, and Sound inline switcher controls */}
          <div className="relative min-h-[36px]">
            <div className={`transition-all duration-300 ${isCollapsed ? "opacity-0 scale-75 pointer-events-none absolute inset-x-0 top-0" : "opacity-100 scale-100 grid grid-cols-3 gap-1"}`}>
              <button
                onClick={toggleLanguage}
                title={t("settings.language")}
                className="flex flex-col items-center justify-center py-1.5 rounded-xl border border-slate-900 hover:bg-slate-900 font-sans text-[10px] font-semibold cursor-pointer text-slate-300 light_sakura:border-rose-200 light_sakura:text-slate-700 light_sakura:hover:bg-rose-100"
              >
                <Globe size={11} className="mb-0.5" />
                <span>{locale.toUpperCase()}</span>
              </button>
              <button
                onClick={toggleTheme}
                title={t("settings.theme")}
                className="flex flex-col items-center justify-center py-1.5 rounded-xl border border-slate-900 hover:bg-slate-900 font-sans text-[10px] font-semibold cursor-pointer text-slate-300 light_sakura:border-rose-200 light_sakura:text-slate-700 light_sakura:hover:bg-rose-100"
              >
                <SunMoon size={11} className="mb-0.5" />
                <span>{theme === "dark_obsidian" ? t("common.dark") : t("common.light")}</span>
              </button>
              <button
                onClick={toggleMute}
                title="Toggle Effects Sound"
                className="flex flex-col items-center justify-center py-1.5 rounded-xl border border-slate-900 hover:bg-slate-900 font-sans text-[10px] font-semibold cursor-pointer text-slate-300 light_sakura:border-rose-200 light_sakura:text-slate-700 light_sakura:hover:bg-rose-100"
              >
                {isMuted ? (
                  <VolumeX size={11} className="text-red-400 light_sakura:text-red-500 mb-0.5" />
                ) : (
                  <Volume2 size={11} className="text-teal-400 light_sakura:text-rose-500 mb-0.5" />
                )}
                <span>{isMuted ? t("common.muted") : t("common.sound")}</span>
              </button>
            </div>

            <div className={`transition-all duration-300 flex flex-col items-center gap-2 ${isCollapsed ? "opacity-100 scale-100" : "opacity-0 scale-75 pointer-events-none absolute inset-x-0 top-0"}`}>
              <button
                onClick={toggleLanguage}
                title={t("settings.language")}
                className="p-2 rounded-xl border border-slate-900 hover:bg-slate-900 text-slate-300 cursor-pointer light_sakura:border-rose-200 light_sakura:text-slate-700 light_sakura:hover:bg-rose-100"
              >
                <Globe size={14} />
              </button>
              <button
                onClick={toggleTheme}
                title={t("settings.theme")}
                className="p-2 rounded-xl border border-slate-900 hover:bg-slate-900 text-slate-300 cursor-pointer light_sakura:border-rose-200 light_sakura:text-slate-700 light_sakura:hover:bg-rose-100"
              >
                <SunMoon size={14} />
              </button>
              <button
                onClick={toggleMute}
                title="Mute / Unmute"
                className="p-2 rounded-xl border border-slate-900 hover:bg-slate-900 text-slate-300 cursor-pointer light_sakura:border-rose-200 light_sakura:text-slate-700 light_sakura:hover:bg-rose-100"
              >
                {isMuted ? (
                  <VolumeX size={14} className="text-red-400 light_sakura:text-red-500" />
                ) : (
                  <Volume2 size={14} className="text-teal-400 light_sakura:text-rose-500" />
                )}
              </button>
            </div>
          </div>

          {/* Log out actions */}
          <button
            onClick={onLogoutClick}
            className={`w-full flex items-center justify-center rounded-xl border bg-slate-950/40 border-red-500/20 text-red-400 hover:bg-red-500/10 font-sans text-xs font-semibold transition-all duration-300 cursor-pointer light_sakura:bg-red-50 light_sakura:border-red-200 light_sakura:text-red-600 light_sakura:hover:bg-red-100/70 py-2.5
              ${isCollapsed ? "px-0 gap-0 justify-center" : "px-3 gap-2"}`}
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
