import React, { useState, useEffect } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { useTheme } from "../contexts/ThemeContext";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { Modal } from "../components/Modal";
import { parseAmountFromString } from "../lib/parserUtils";
import { audioFeedback } from "../lib/audio";
import { 
  User as UserIcon, 
  Globe, 
  SunMoon, 
  Send, 
  Key, 
  Trash2, 
  HelpCircle,
  CheckCircle,
  Info,
  Copy,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Lock,
  Smartphone
} from "lucide-react";
import { motion } from "motion/react";
import { UserSession } from "../types";
import { usePremium } from "../hooks/usePremium";
import { PremiumModal } from "../components/PremiumModal";

interface SettingsProps {
  onUserPrefUpdated: (user: UserSession) => void;
}

export const Settings: React.FC<SettingsProps> = ({
  onUserPrefUpdated
}) => {
  const { user } = useAuth();
  const { locale, setLocale, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { showToast } = useToast();

  const { isPremium, refresh: refreshPremium } = usePremium();
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const isGuest = user?.is_anonymous ?? false;
  const isTelegramLocked = isGuest || !isPremium;

  // PWA Custom Installation States
  const [canInstall, setCanInstall] = useState(!!window.deferredPrompt);
  const [isStandalone, setIsStandalone] = useState(
    window.matchMedia("(display-mode: standalone)").matches || 
    (navigator as any).standalone === true
  );

  useEffect(() => {
    const handleInstallable = () => setCanInstall(true);
    const handleInstalled = () => {
      setCanInstall(false);
      setIsStandalone(true);
    };

    window.addEventListener("pwa-installable", handleInstallable);
    window.addEventListener("pwa-installed", handleInstalled);

    // Monitor display-mode matches directly
    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const handleMediaChange = (e: MediaQueryListEvent) => {
      setIsStandalone(e.matches);
    };
    
    // Add support for older browsers
    try {
      mediaQuery.addEventListener("change", handleMediaChange);
    } catch (e) {
      try {
        mediaQuery.addListener(handleMediaChange);
      } catch (err) {}
    }

    return () => {
      window.removeEventListener("pwa-installable", handleInstallable);
      window.removeEventListener("pwa-installed", handleInstalled);
      try {
        mediaQuery.removeEventListener("change", handleMediaChange);
      } catch (e) {
        try {
          mediaQuery.removeListener(handleMediaChange);
        } catch (err) {}
      }
    };
  }, []);

  const handleInstallClick = async () => {
    audioFeedback.playClick();
    const promptEvent = window.deferredPrompt;
    if (!promptEvent) {
      showToast(t("settings.pwa_not_supported"), "info");
      return;
    }
    // Show prompt banner
    promptEvent.prompt();
    // Wait for resolution
    const { outcome } = await promptEvent.userChoice;
    console.log(`[PWA] Install choice outcome: ${outcome}`);
    if (outcome === "accepted") {
      window.deferredPrompt = null;
      setCanInstall(false);
      showToast(t("toast.success_pwa"), "success");
    }
  };

  // Profile Edit States
  const [displayName, setDisplayName] = useState(user?.user_metadata?.full_name || user?.email?.split('@')[0] || "");
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('display_name')
        .eq('id', user.id)
        .single();
      if (!error && data?.display_name) {
        setDisplayName(data.display_name);
      }
    };
    fetchProfile();
  }, [user]);

  // Telegram Connection States
  const [linkingCode, setLinkingCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(600); // 10 minutes
  const [isTelegramLinked, setIsTelegramLinked] = useState(false);
  const [telegramChatId, setTelegramChatId] = useState("");
  const [isUnlinkModalOpen, setIsUnlinkModalOpen] = useState(false);

  // 10-minutes active timer tracking for linking codes
  useEffect(() => {
    if (!linkingCode) return;
    
    const interval = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          setLinkingCode(null);
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [linkingCode]);

  // Real-time polling for Telegram activation status.
  // Guard now also checks `linkingCode` — previously this polled Supabase
  // every 3s for as long as the Settings page stayed open and Telegram
  // wasn't linked yet, even if the user never clicked "Generate Linking
  // Code" at all. It should only run while a linking code is actually
  // active, same as the 10-minute countdown effect above it.
  useEffect(() => {
    if (!user || isTelegramLinked || !linkingCode) return;

    const interval = setInterval(async () => {
      const { data, error } = await supabase
        .from('users')
        .select('telegram_chat_id')
        .eq('id', user.id)
        .single();
        
      if (!error && data && data.telegram_chat_id) {
        setTelegramChatId(data.telegram_chat_id);
        setIsTelegramLinked(true);
        setLinkingCode(null); // Clear linking code on success
        audioFeedback.playChime();
        showToast(t("toast.success_link"), "success");
        clearInterval(interval);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [user, isTelegramLinked, linkingCode]);

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
      const { error } = await supabase
        .from('users')
        .update({ display_name: displayName })
        .eq('id', user?.id);
      
      if (error) throw error;
      
      // Sync with auth metadata
      await supabase.auth.updateUser({
        data: {
          full_name: displayName
        }
      });

      // Trigger refresh UI
      const updatedUser: UserSession = {
        id: user?.id || "",
        display_name: displayName,
        is_guest: user?.is_anonymous || false,
        preferred_language: locale,
        preferred_theme: theme
      };
      onUserPrefUpdated(updatedUser);
      
      setIsProfileModalOpen(false);
      showToast(t("toast.success_profile"), "success");
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  // Telegram Generator code
  const handleGenerateLinkingCode = async () => {
    audioFeedback.playClick();
    if (!user) return;

    if (!isPremium) {
      showToast(t("premium.locked_telegram"), "error");
      setIsPremiumOpen(true);
      return;
    }

    // Math random 5 digit sequence
    const code = Math.floor(10000 + Math.random() * 90000).toString();
    
    try {
      // Save to Supabase telegram_link_codes
      const { error } = await supabase
        .from('telegram_link_codes')
        .insert({
          code,
          user_id: user.id,
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
        });
      
      if (error) throw error;

      setLinkingCode(code);
      setTimerSeconds(600); // 10 minutes reset
    } catch (err: any) {
      showToast(t("settings.toast_generate_code_error", { message: err.message }), "error");
    }
  };

  const handleCopyLinkCommand = () => {
    audioFeedback.playClick();
    if (!linkingCode) return;
    const commandText = `/link ${linkingCode}`;
    navigator.clipboard.writeText(commandText).then(() => {
      setCopied(true);
      showToast(t("settings.toast_copied_link", { code: linkingCode }), "success");
      setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
      console.error("Failed to copy link command:", err);
      showToast(t("toast.error_general"), "error");
    });
  };

  const handleUnlinkTelegramClick = () => {
    audioFeedback.playClick();
    setIsUnlinkModalOpen(true);
  };

  const executeUnlinkTelegram = async () => {
    setIsUnlinkModalOpen(false);
    showToast(t("settings.toast_unlinking_telegram"), "info");

    try {
      const { error } = await supabase
        .from('users')
        .update({ telegram_chat_id: null })
        .eq('id', user?.id);
      
      if (error) throw error;

      setTelegramChatId("");
      setIsTelegramLinked(false);

      audioFeedback.playChime();
      showToast(t("toast.success_unlink"), "success");
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  // Formatter for timer YYYY-MM
  const formatTimerStr = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  const formatIDR = (num: number) => {
    return "Rp" + Math.round(num).toLocaleString("id-ID");
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      
      {/* Massive Cohesive Card Container */}
      <div className="p-6 md:p-8 rounded-3xl border bg-slate-900 border-slate-900 transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 shadow-lg space-y-6">
        
        {/* View Header inside massive card */}
        <div className="flex flex-col border-b border-slate-800/50 pb-6 light_sakura:border-rose-100/30">
          <h2 className="font-sans font-bold text-2xl tracking-tight text-white light_sakura:text-slate-900">
            {t("settings.title")}
          </h2>
          <p className="font-sans text-sm text-gray-400 mt-1 light_sakura:text-slate-500 font-medium">
            {t("settings.desc")}
          </p>
        </div>

        {/* Grid panels */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Panel Left: Preferences & Profiles */}
          <div className="space-y-6">
            
            {/* Section 1: Profiles Name edit */}
            <div className="p-5 rounded-2xl border bg-slate-950/40 border-slate-850/60 transition-colors duration-300 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/50 shadow-sm space-y-4">
            <h3 className="font-sans font-bold text-sm text-slate-200 border-b border-slate-800/10 pb-2.5 light_sakura:text-slate-800 light_sakura:border-rose-100">
              {t("settings.profile_section")}
            </h3>

            <div className="space-y-1.5">
              <label className="font-sans text-[10px] font-bold text-gray-400 light_sakura:text-slate-500 uppercase tracking-wider block">
                {t("settings.display_name")}
              </label>
              
              <div className="flex gap-2">
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white outline-none focus:border-indigo-500 light_sakura:bg-slate-50 light_sakura:border-rose-100 light_sakura:text-slate-800"
                />
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={handleUpdateProfileName}
                  className="cursor-pointer border border-transparent bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 rounded-xl font-sans text-xs font-semibold text-white tracking-tight transition-all"
                >
                  {t("settings.btn_update_profile")}
                </motion.button>
              </div>
            </div>
          </div>

          {/* Section 2: Quick instant Switcher controls */}
          <div className="p-5 rounded-2xl border bg-slate-950/40 border-slate-850/60 transition-colors duration-300 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/50 shadow-sm space-y-5">
            <h3 className="font-sans font-bold text-sm text-slate-200 border-b border-slate-800/10 pb-2.5 light_sakura:text-slate-800 light_sakura:border-rose-100">
              {t("settings.preferences")}
            </h3>

            {/* Language selector row */}
            <div className="space-y-1.5">
              <label className="font-sans text-[10px] font-bold text-gray-400 light_sakura:text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Globe size={12} className="text-teal-400 light_sakura:text-rose-500" />
                <span>{t("settings.language")}</span>
              </label>
              
              <div className="grid grid-cols-2 gap-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    audioFeedback.playClick();
                    setLocale("id");
                  }}
                  className={`py-3 rounded-xl font-sans text-xs font-bold border transition-all cursor-pointer
                    ${locale === "id" 
                      ? "bg-indigo-600/10 border-indigo-500 text-indigo-400 light_sakura:bg-rose-500/10 light_sakura:border-rose-550 light_sakura:text-rose-600" 
                      : "bg-slate-950 border-slate-800 text-gray-400 hover:bg-slate-900 light_sakura:bg-rose-50/20 light_sakura:border-rose-100 light_sakura:text-slate-500"
                    }`}
                >
                  Bahasa Indonesia (ID)
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    audioFeedback.playClick();
                    setLocale("en");
                  }}
                  className={`py-3 rounded-xl font-sans text-xs font-bold border transition-all cursor-pointer
                    ${locale === "en" 
                      ? "bg-indigo-600/10 border-indigo-500 text-indigo-400 light_sakura:bg-rose-500/10 light_sakura:border-rose-550 light_sakura:text-rose-600" 
                      : "bg-slate-950 border-slate-800 text-gray-400 hover:bg-slate-900 light_sakura:bg-rose-50/20 light_sakura:border-rose-100 light_sakura:text-slate-500"
                    }`}
                >
                  English (EN)
                </motion.button>
              </div>
            </div>

            {/* Theme selector row */}
            <div className="space-y-1.5">
              <label className="font-sans text-[10px] font-bold text-gray-400 light_sakura:text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <SunMoon size={12} className="text-teal-400 light_sakura:text-rose-500" />
                <span>{t("settings.theme")}</span>
              </label>
              
              <div className="grid grid-cols-2 gap-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    audioFeedback.playChime();
                    setTheme("dark_obsidian");
                  }}
                  className={`py-3 rounded-xl font-sans text-[10px] sm:text-xs font-bold border transition-all cursor-pointer
                    ${theme === "dark_obsidian" 
                      ? "bg-indigo-600/10 border-indigo-500 text-indigo-400" 
                      : "bg-slate-950 border-slate-800 text-gray-400 hover:bg-slate-900 light_sakura:bg-rose-50/20 light_sakura:border-rose-100 light_sakura:text-slate-500"
                    }`}
                >
                  {t("settings.theme_dark_obsidian")}
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    audioFeedback.playChime();
                    setTheme("light_sakura");
                  }}
                  className={`py-3 rounded-xl font-sans text-[10px] sm:text-xs font-bold border transition-all cursor-pointer
                    ${theme === "light_sakura" 
                      ? "bg-rose-500/10 border-rose-500 text-rose-600" 
                      : "bg-slate-950 border-slate-800 text-gray-400 hover:bg-slate-900 light_sakura:bg-rose-50/20 light_sakura:border-rose-100 light_sakura:text-slate-500"
                    }`}
                >
                  {t("settings.theme_light_sakura")}
                </motion.button>
              </div>
            </div>

          </div>

          {/* Section 3: PWA Installation Block */}
          <div className="p-5 rounded-2xl border bg-slate-950/40 border-slate-850/60 transition-colors duration-300 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/50 shadow-sm space-y-4">
            <h3 className="font-sans font-bold text-sm text-slate-200 border-b border-slate-800/10 pb-2.5 light_sakura:text-slate-800 light_sakura:border-rose-100 flex items-center gap-2">
              <Smartphone size={14} className="text-teal-400 light_sakura:text-rose-500" />
              <span>{t("settings.pwa_section")}</span>
            </h3>

            <p className="font-sans text-xs text-slate-400 leading-relaxed light_sakura:text-slate-500">
              {t("settings.pwa_desc")}
            </p>

            {isStandalone ? (
              <div className="flex items-center gap-2 text-emerald-400 light_sakura:text-emerald-600 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                <CheckCircle size={16} />
                <span className="font-sans text-xs font-semibold">{t("settings.pwa_installed")}</span>
              </div>
            ) : canInstall ? (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={handleInstallClick}
                className="w-full cursor-pointer py-3 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-xl font-sans text-xs font-bold shadow-lg shadow-teal-500/10 flex items-center justify-center gap-2 transition-all"
              >
                <Smartphone size={14} />
                <span>{t("settings.pwa_btn_install")}</span>
              </motion.button>
            ) : (
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-850 text-slate-400 text-xs leading-relaxed light_sakura:bg-rose-100/35 light_sakura:border-rose-200/50 light_sakura:text-slate-650">
                <p className="font-sans text-[11px]">
                  {t("settings.pwa_not_supported")}
                </p>
              </div>
            )}
          </div>

            {/* Section 5: Unit Test scenarios validator diagnostics - REMOVED */}
          </div>

        {/* Panel Right: Telegram linking & Account promotion */}
        <div className="space-y-6">
          
          {/* Premium Gating Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 font-sans light_sakura:bg-rose-50/20 light_sakura:border-rose-100/50 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isPremium ? (
                  <ShieldCheck className="text-emerald-400" size={20} />
                ) : isGuest ? (
                  <Lock className="text-gray-500" size={20} />
                ) : (
                  <ShieldCheck className="text-gray-500" size={20} />
                )}
                <span className="font-bold text-white text-sm light_sakura:text-slate-800">
                  {isPremium ? t("premium.badge_active") : t("premium.menu_label")}
                </span>
              </div>
              {!isPremium && (
                <button
                  onClick={() => setIsPremiumOpen(true)}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer transition-colors shadow-md shadow-indigo-600/10"
                >
                  {t("premium.unlock_now")}
                </button>
              )}
            </div>
          </div>
          
          {/* Section 3: Telegram Bot Integration block */}
          <div className="p-5 rounded-2xl border bg-slate-950/40 border-slate-850/60 transition-colors duration-300 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/50 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800/10 pb-2.5 light_sakura:border-rose-100">
              <h3 className="font-sans font-bold text-sm text-slate-200 light_sakura:text-slate-800 flex items-center gap-2">
                <Send size={14} className="text-sky-400" />
                <span>{t("settings.telegram_sec")}</span>
                {isTelegramLocked && <Lock size={12} className="text-amber-500 light_sakura:text-rose-500" />}
              </h3>
              {isTelegramLinked && !isTelegramLocked && (
                <span className="px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase bg-emerald-500/20 text-emerald-400 rounded-md border border-emerald-500/30">
                  {t("common.active")}
                </span>
              )}
            </div>

            <p className="font-sans text-xs text-slate-400 leading-relaxed light_sakura:text-slate-500">
              {t("settings.telegram_desc")}
            </p>

            {/* Connection Status indicator info */}
            {isTelegramLocked ? (
              <div className="flex flex-col items-center justify-center py-6 px-4 text-center space-y-4 border border-dashed border-amber-500/25 bg-amber-500/5 rounded-2xl light_sakura:border-rose-300/30 light_sakura:bg-rose-50/50">
                <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500 light_sakura:bg-rose-500/10 light_sakura:text-rose-500">
                  <Lock size={24} className="animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-sans font-bold text-xs text-white light_sakura:text-slate-850">
                    {t("settings.premium_locked_title")}
                  </h4>
                  <p className="font-sans text-[11px] text-slate-400 light_sakura:text-slate-600 max-w-sm leading-relaxed">
                    {isGuest 
                      ? t("settings.premium_locked_guest_desc")
                      : t("settings.premium_locked_user_desc")
                    }
                  </p>
                </div>
                {!isGuest && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      audioFeedback.playClick();
                      setIsPremiumOpen(true);
                    }}
                    className="cursor-pointer px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl shadow-lg shadow-amber-500/10 flex items-center gap-1.5 transition-colors light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400 light_sakura:text-white"
                  >
                    <Sparkles size={13} />
                    <span>{t("premium.menu_label")}</span>
                  </motion.button>
                )}
              </div>
            ) : isTelegramLinked ? (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/5 light_sakura:border-emerald-250 light_sakura:bg-emerald-50/20 shadow-xs">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-full bg-[#0088cc] text-white flex items-center justify-center shadow-md relative shrink-0">
                      <Send size={18} className="-translate-x-0.5 translate-y-0.5 rotate-45" />
                      <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-slate-900 light_sakura:border-white rounded-full flex items-center justify-center">
                        <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                      </span>
                    </div>
                    
                    <div>
                      <h4 className="font-sans font-bold text-xs text-white light_sakura:text-slate-800">
                        {t("settings.telegram_sync_status")}
                      </h4>
                      <div className="font-sans text-[11px] text-gray-400 mt-0.5 light_sakura:text-slate-500">
                        {t("settings.telegram_linked", { id: telegramChatId })}
                      </div>
                    </div>
                  </div>
                  

                </div>

                {/* Features Highlight */}
                <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-800/50 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/50 space-y-3">
                  <h4 className="font-sans font-bold text-[10px] text-gray-400 light_sakura:text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Sparkles size={12} className="text-amber-400" />
                    <span>{t("settings.telegram_features_title")}</span>
                  </h4>
                  <ul className="space-y-2">
                    {[1, 2, 3, 4].map(i => (
                      <li key={i} className="flex items-start gap-2 text-[11px] text-gray-400 light_sakura:text-slate-600">
                        <CheckCircle size={12} className="text-emerald-500 shrink-0 mt-0.5" />
                        <span>{t(`settings.telegram_feature_${i}`)}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Bill Reminder Time Preference dipindahkan ke halaman Tagihan */}

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  type="button"
                  onClick={handleUnlinkTelegramClick}
                  className="w-full cursor-pointer py-3 border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl font-sans text-xs font-semibold transition-colors"
                >
                  {t("settings.btn_unlink")}
                </motion.button>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Step-by-Step Connection Guide */}
                <div className="relative space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Info size={14} className="text-indigo-400" />
                    <h4 className="font-sans font-bold text-xs text-slate-200 light_sakura:text-slate-700">
                      {t("settings.telegram_steps_title")}
                    </h4>
                  </div>
                  
                  <div className="space-y-3.5">
                    {[1, 2, 3].map((step) => (
                      <div key={step} className="flex gap-3 items-start group">
                        <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-indigo-400 shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
                          {step}
                        </div>
                        <p className="font-sans text-[11px] text-gray-400 light_sakura:text-slate-600 leading-normal pt-0.5">
                          {t(`settings.telegram_step_${step}`)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {!linkingCode ? (
                  <motion.button
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={handleGenerateLinkingCode}
                    className="w-full cursor-pointer py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-sans text-xs font-bold shadow-lg shadow-indigo-600/20 transition-all light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400"
                  >
                    {t("settings.btn_generate_code")}
                  </motion.button>
                ) : (
                  <div className="p-5 rounded-2xl border-2 border-dashed border-indigo-500/30 bg-indigo-500/5 light_sakura:border-rose-200 light_sakura:bg-rose-50/40 space-y-4 flex flex-col items-center w-full">
                    <div className="text-center space-y-1">
                      <span className="font-sans text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                        {t("settings.btn_copy_link")}
                      </span>
                      <div className="px-8 py-4 rounded-2xl bg-slate-950 shadow-xl font-mono font-bold text-3xl tracking-[0.2em] text-teal-400 light_sakura:bg-white light_sakura:text-rose-500 border border-slate-800 light_sakura:border-rose-150 flex items-center justify-center gap-4">
                        <span>{linkingCode}</span>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={handleCopyLinkCommand}
                          aria-label={copied ? t("common.copied") : t("common.copy")}
                          className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
                        >
                          {copied ? <CheckCircle size={18} className="text-emerald-500" /> : <Copy size={18} />}
                        </motion.button>
                      </div>
                    </div>

                    <div className="w-full h-px bg-slate-800/50 light_sakura:bg-rose-100" />

                    <div className="flex flex-col items-center gap-2">
                       <div className="flex items-center gap-2 font-sans text-[11px] text-gray-400 light_sakura:text-slate-500 font-semibold uppercase tracking-wider">
                        <RefreshCw size={13} className="animate-spin text-indigo-400" />
                        <span>{t("settings.code_expires")}: {formatTimerStr(timerSeconds)}</span>
                      </div>
                      <p className="font-sans text-[10px] text-gray-500 text-center italic">
                        {t("settings.waiting_for_connection", "Menunggu koneksi dari bot...")}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

      {/* Confirmation - Modify Profiles Name */}
      <Modal
        isOpen={isProfileModalOpen}
        title={t("confirm.profile_update_title")}
        description={t("confirm.profile_update_desc", { name: displayName })}
        type="info"
        confirmLabel={t("confirm.profile_update_confirm")}
        cancelLabel={t("common.cancel")}
        onConfirm={executeUpdateProfileName}
        onCancel={() => {
          audioFeedback.playClick();
          setIsProfileModalOpen(false);
        }}
      />

      {/* Confirmation - Unlink Bot */}
      <Modal
        isOpen={isUnlinkModalOpen}
        title={t("confirm.unlink_telegram_title")}
        description={t("confirm.unlink_telegram_desc")}
        type="danger"
        confirmLabel={t("settings.btn_unlink")}
        cancelLabel={t("common.cancel")}
        onConfirm={executeUnlinkTelegram}
        onCancel={() => {
          audioFeedback.playClick();
          setIsUnlinkModalOpen(false);
        }}
      />

      <PremiumModal 
        isOpen={isPremiumOpen}
        onClose={() => setIsPremiumOpen(false)}
        onPremiumActivated={() => {
          refreshPremium();
        }}
      />
      </div>
      </div>
      </div>
    </div>
  );
};
