import React, { useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { useTheme } from "../contexts/ThemeContext";
import { 
  Wallet, 
  LayoutDashboard, 
  PlusCircle, 
  History, 
  Settings, 
  LogOut, 
  ChevronLeft, 
  ChevronRight, 
  Menu, 
  X,
  Globe,
  SunMoon,
  ShieldCheck,
  ShieldAlert
} from "lucide-react";
import { UserSession } from "../lib/auth";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: UserSession;
  onLogoutClick: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  onLogoutClick
}) => {
  const { locale, setLocale, t } = useLanguage();
  const { theme, setTheme } = useTheme();

  // Desktop sidebar expand / collapse state
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  // Mobile drawer overlay state
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const menuItems = [
    { id: "dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
    { id: "new_transaction", label: t("nav.new_transaction"), icon: PlusCircle },
    { id: "history", label: t("nav.history"), icon: History },
    { id: "settings", label: t("nav.settings"), icon: Settings },
  ];

  const toggleLanguage = () => {
    setLocale(locale === "id" ? "en" : "id");
  };

  const toggleTheme = () => {
    setTheme(theme === "dark_obsidian" ? "light_sakura" : "dark_obsidian");
  };

  const handleNavClick = (tabId: string) => {
    setActiveTab(tabId);
    setIsMobileOpen(false); // Close mobile panel
  };

  return (
    <>
      {/* 1. Mobile top bar Header (visible only on mobile) */}
      <header className="lg:hidden flex items-center justify-between p-4 border-b bg-slate-950/90 border-slate-800 text-white dark_obsidian:bg-slate-950 dark_obsidian:border-slate-800 light_sakura:bg-rose-500 light_sakura:border-rose-400 light_sakura:text-white sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <Wallet size={24} className="text-teal-400 light_sakura:text-rose-100" />
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
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          {/* Overlay mask backing */}
          <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-xs"
            onClick={() => setIsMobileOpen(false)}
          />

          {/* Drawer content */}
          <div className="relative flex flex-col w-72 max-w-[80vw] h-full p-6 bg-slate-900 border-r border-slate-800 text-white dark_obsidian:bg-slate-900 dark_obsidian:border-slate-800 light_sakura:bg-rose-50 light_sakura:text-slate-800 light_sakura:border-rose-100">
            {/* Header Close triggers */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2">
                <Wallet size={24} className="text-teal-400 light_sakura:text-rose-500" />
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

            {/* Profile widget summary */}
            <div className="p-4 mb-6 rounded-xl border bg-slate-950/40 border-slate-800 light_sakura:bg-rose-100/50 light_sakura:border-rose-200">
              <p className="font-mono text-[10px] text-gray-400 light_sakura:text-rose-600 uppercase tracking-widest">
                {currentUser.is_guest ? "GUEST ACCOUNT" : "AUTHENTICATED"}
              </p>
              <div className="flex items-center gap-2.5 mt-1">
                {currentUser.is_guest ? (
                  <ShieldAlert size={16} className="text-amber-400" />
                ) : (
                  <ShieldCheck size={16} className="text-emerald-400 light_sakura:text-emerald-600" />
                )}
                <span className="font-sans font-semibold text-sm truncate max-w-[180px] dark_obsidian:text-slate-200 light_sakura:text-slate-900">
                  {currentUser.display_name}
                </span>
              </div>
            </div>

            {/* Menu Items */}
            <nav className="flex-1 space-y-1.5">
              {menuItems.map((item) => {
                const IconComp = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-sans text-sm font-medium transition-all duration-150 cursor-pointer
                      ${isActive 
                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/10 light_sakura:bg-rose-500 light_sakura:text-white" 
                        : "text-gray-300 hover:bg-slate-800 light_sakura:text-slate-600 light_sakura:hover:bg-rose-100"
                      }`}
                  >
                    <IconComp size={18} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Bottom Controls / Language / Theme switchers */}
            <div className="space-y-4 pt-4 border-t border-slate-800 light_sakura:border-rose-100">
              {/* Theme & Language inline controller */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={toggleLanguage}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-800 hover:bg-slate-800 font-sans text-xs font-semibold cursor-pointer text-slate-300 light_sakura:border-rose-200 light_sakura:text-slate-700 light_sakura:hover:bg-rose-100"
                >
                  <Globe size={14} />
                  <span>{locale.toUpperCase()}</span>
                </button>
                <button
                  onClick={toggleTheme}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-800 hover:bg-slate-800 font-sans text-xs font-semibold cursor-pointer text-slate-300 light_sakura:border-rose-200 light_sakura:text-slate-700 light_sakura:hover:bg-rose-100"
                >
                  <SunMoon size={14} />
                  <span>{theme === "dark_obsidian" ? "DARK" : "LIGHT"}</span>
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
          </div>
        </div>
      )}

      {/* 3. Desktop Persistent and Collapsible Sidebar */}
      <aside 
        className={`hidden lg:flex flex-col h-screen fixed top-0 left-0 border-r transition-all duration-300 z-30
          bg-slate-950 border-slate-900 text-white dark_obsidian:bg-slate-950 dark_obsidian:border-slate-900
          light_sakura:bg-rose-50 light_sakura:text-slate-800 light_sakura:border-rose-100/80
          ${isCollapsed ? "w-20" : "w-64"}`}
      >
        {/* Sidebar Brand header */}
        <div className="flex items-center justify-between p-6">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="p-2 rounded-xl bg-indigo-600/10 text-teal-400 light_sakura:bg-rose-500/10 light_sakura:text-rose-500 shrink-0">
              <Wallet size={24} />
            </div>
            {!isCollapsed && (
              <span className="font-sans font-bold text-lg tracking-tight select-none truncate text-white dark_obsidian:text-white light_sakura:text-slate-900">
                {t("app.title")}
              </span>
            )}
          </div>
          
          {/* Collapse/Expand action trigger button */}
          {!isCollapsed && (
            <button
              onClick={() => setIsCollapsed(true)}
              className="p-1 rounded-lg hover:bg-white/5 light_sakura:hover:bg-slate-200 cursor-pointer hidden md:block text-slate-400 hover:text-white light_sakura:text-slate-600 light_sakura:hover:text-slate-800"
            >
              <ChevronLeft size={16} />
            </button>
          )}
          {isCollapsed && (
            <button
              onClick={() => setIsCollapsed(false)}
              className="absolute -right-3 top-8 p-1.5 rounded-full border bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:scale-105 active:scale-95 transition-transform cursor-pointer light_sakura:bg-slate-100 light_sakura:border-slate-200 light_sakura:text-slate-800"
            >
              <ChevronRight size={14} />
            </button>
          )}
        </div>

        {/* Profile widget summary and state */}
        <div className="px-4 mb-6">
          {isCollapsed ? (
            <div className="flex justify-center">
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-900 text-teal-400 light_sakura:bg-rose-200 light_sakura:text-rose-600">
                {currentUser.display_name.charAt(0).toUpperCase()}
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl border bg-slate-900/40 border-slate-900 light_sakura:bg-rose-100/40 light_sakura:border-rose-100/70">
              <p className="font-mono text-[9px] text-gray-400 light_sakura:text-rose-500 uppercase tracking-widest">
                {currentUser.is_guest ? "GUEST MODE ACTIVED" : "VERIFIED MEMBER"}
              </p>
              <div className="flex items-center gap-2.5 mt-1">
                {currentUser.is_guest ? (
                  <ShieldAlert size={14} className="text-amber-400" />
                ) : (
                  <ShieldCheck size={14} className="text-emerald-400 light_sakura:text-emerald-600" />
                )}
                <span className="font-sans font-semibold text-xs truncate max-w-[150px] text-slate-200 light_sakura:text-slate-800">
                  {currentUser.display_name}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Menu Items listings */}
        <nav className="flex-1 px-3 space-y-1">
          {menuItems.map((item) => {
            const IconComp = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                title={isCollapsed ? item.label : undefined}
                className={`w-full flex items-center px-4 py-3 rounded-xl font-sans text-sm font-medium transition-all duration-150 cursor-pointer
                  ${isCollapsed ? "justify-center" : "gap-3"}
                  ${isActive 
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/10 light_sakura:bg-rose-500 light_sakura:text-white" 
                    : "text-slate-300 hover:bg-slate-900 light_sakura:text-slate-600 light_sakura:hover:bg-rose-100/70"
                  }`}
              >
                <IconComp size={18} className="shrink-0" />
                {!isCollapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Footer controls */}
        <div className="p-4 border-t border-slate-900 light_sakura:border-rose-100 space-y-3">
          {/* Theme & Language inline switcher controls */}
          {!isCollapsed ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={toggleLanguage}
                title={t("settings.language")}
                className="flex items-center justify-center gap-1.5 py-2 rounded-xl border border-slate-900 hover:bg-slate-900 font-sans text-xs font-semibold cursor-pointer text-slate-300 light_sakura:border-rose-200 light_sakura:text-slate-700 light_sakura:hover:bg-rose-100"
              >
                <Globe size={12} />
                <span>{locale.toUpperCase()}</span>
              </button>
              <button
                onClick={toggleTheme}
                title={t("settings.theme")}
                className="flex items-center justify-center gap-1.5 py-2 rounded-xl border border-slate-900 hover:bg-slate-900 font-sans text-xs font-semibold cursor-pointer text-slate-300 light_sakura:border-rose-200 light_sakura:text-slate-700 light_sakura:hover:bg-rose-100"
              >
                <SunMoon size={12} />
                <span>{theme === "dark_obsidian" ? "DARK" : "LIGHT"}</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
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
            </div>
          )}

          {/* Log out actions */}
          <button
            onClick={onLogoutClick}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border bg-slate-950/40 border-red-500/20 text-red-400 hover:bg-red-500/10 font-sans text-xs font-semibold transition-colors cursor-pointer light_sakura:bg-red-50 light_sakura:border-red-200 light_sakura:text-red-600 light_sakura:hover:bg-red-100/70
              ${isCollapsed ? "px-0" : "px-3"}`}
          >
            <LogOut size={14} className="shrink-0" />
            {!isCollapsed && <span>{t("nav.logout")}</span>}
          </button>
        </div>
      </aside>
    </>
  );
};
