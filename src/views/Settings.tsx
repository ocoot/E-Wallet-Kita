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
  Sparkles
} from "lucide-react";
import { motion } from "motion/react";
import { UserSession } from "../types";

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

  // Profile Edit States
  const [displayName, setDisplayName] = useState(user?.user_metadata?.full_name || user?.email?.split('@')[0] || "");
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

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

  // Real-time polling for Telegram activation status
  useEffect(() => {
    if (!user || isTelegramLinked) return;

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
  }, [user, isTelegramLinked]);

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
    <div className="max-w-3xl mx-auto space-y-8">
      
      {/* View Header */}
      <div>
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
          <div className="p-6 rounded-3xl border bg-slate-900 border-slate-900 transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 shadow-xs space-y-4">
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
          <div className="p-6 rounded-3xl border bg-slate-900 border-slate-900 transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 shadow-xs space-y-5">
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

            {/* Section 5: Unit Test scenarios validator diagnostics - REMOVED */}
          </div>

        </div>

        {/* Panel Right: Telegram linking & Account promotion */}
        <div className="space-y-6">
          
          {/* Section 3: Telegram Bot Integration block */}
          <div className="p-6 rounded-3xl border bg-slate-900 border-slate-900 transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800/10 pb-2.5 light_sakura:border-rose-100">
              <h3 className="font-sans font-bold text-sm text-slate-200 light_sakura:text-slate-800 flex items-center gap-2">
                <Send size={14} className="text-sky-400" />
                <span>{t("settings.telegram_sec")}</span>
              </h3>
              {isTelegramLinked && (
                <span className="px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase bg-emerald-500/20 text-emerald-400 rounded-md border border-emerald-500/30">
                  {t("common.active")}
                </span>
              )}
            </div>

            <p className="font-sans text-xs text-slate-400 leading-relaxed light_sakura:text-slate-500">
              {t("settings.telegram_desc")}
            </p>

            {/* Connection Status indicator info */}
            {isTelegramLinked ? (
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
                  
                  <div className="self-stretch sm:self-auto flex items-center justify-center sm:justify-start">
                    <span className="px-3 py-1 bg-slate-950 light_sakura:bg-rose-50/50 rounded-xl font-mono text-xs font-semibold text-teal-400 light_sakura:text-rose-500 border border-slate-800 light_sakura:border-rose-100">
                      ID: {telegramChatId}
                    </span>
                  </div>
                </div>

                {/* Features Highlight */}
                <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-800/50 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/50 space-y-3">
                  <h4 className="font-sans font-bold text-[10px] text-gray-400 light_sakura:text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Sparkles size={12} className="text-amber-400" />
                    <span>{t("settings.telegram_features_title")}</span>
                  </h4>
                  <ul className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <li key={i} className="flex items-start gap-2 text-[11px] text-gray-400 light_sakura:text-slate-600">
                        <CheckCircle size={12} className="text-emerald-500 shrink-0 mt-0.5" />
                        <span>{t(`settings.telegram_feature_${i}`)}</span>
                      </li>
                    ))}
                  </ul>
                </div>

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
    </div>
  </div>
  );
};
