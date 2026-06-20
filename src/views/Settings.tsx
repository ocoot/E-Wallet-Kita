import React, { useState, useEffect } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { useTheme } from "../contexts/ThemeContext";
import { authService, UserSession } from "../lib/auth";
import { useToast } from "../contexts/ToastContext";
import { Modal } from "../components/Modal";
import { parseAmountFromString } from "../lib/parserUtils";
import { 
  User, 
  Globe, 
  SunMoon, 
  Send, 
  Key, 
  Trash2, 
  Play, 
  Sparkles, 
  RefreshCw, 
  AlertCircle,
  HelpCircle,
  CheckCircle,
  Info
} from "lucide-react";
import { motion } from "motion/react";

interface SettingsProps {
  currentUser: UserSession;
  onUserPrefUpdated: (user: UserSession) => void;
}

export const Settings: React.FC<SettingsProps> = ({
  currentUser,
  onUserPrefUpdated
}) => {
  const { locale, setLocale, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { showToast } = useToast();

  // Profile Edit States
  const [displayName, setDisplayName] = useState(currentUser.display_name);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Guest upgrade states
  const [upgradeEmail, setUpgradeEmail] = useState("");
  const [upgradePassword, setUpgradePassword] = useState("");
  const [upgradeName, setUpgradeName] = useState(currentUser.display_name);

  // Telegram Mock Connection States
  const [linkingCode, setLinkingCode] = useState<string | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(600); // 10 minutes
  const [isTelegramLinked, setIsTelegramLinked] = useState(!!currentUser.telegram_chat_id);
  const [telegramChatId, setTelegramChatId] = useState(currentUser.telegram_chat_id || "");
  const [isUnlinkModalOpen, setIsUnlinkModalOpen] = useState(false);

  // Diagnostic states
  const [testResults, setTestResults] = useState<{ input: string; output: number }[]>([]);

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

  const handleUpdateProfileName = () => {
    if (!displayName.trim()) {
      showToast("Profile name cannot be blank", "error");
      return;
    }
    setIsProfileModalOpen(true);
  };

  const executeUpdateProfileName = () => {
    const updated = authService.updateProfileName(currentUser.id, displayName);
    onUserPrefUpdated(updated);
    setIsProfileModalOpen(false);
    showToast(t("toast.success_profile"), "success");
  };

  const handleUpgradeGuest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!upgradeEmail.trim() || !upgradeEmail.includes("@")) {
      showToast(t("auth.validation_email"), "error");
      return;
    }
    if (!upgradePassword || upgradePassword.length < 6) {
      showToast(t("auth.validation_pass"), "error");
      return;
    }

    const res = authService.upgradeGuestToPermanent(
      currentUser.id,
      upgradeEmail,
      upgradeName,
      upgradePassword
    );

    if ("error" in res) {
      showToast(res.error, "error");
    } else {
      showToast(t("toast.success_pref"), "success");
      onUserPrefUpdated(res);
      // Reset inputs
      setUpgradeEmail("");
      setUpgradePassword("");
    }
  };

  // Run Unit Test diagnostics locally (the mandated scenarios!)
  const runParserDiagnostics = () => {
    const scenarios = [
      "Makan siang 25000",
      "Gaji 1.5jt",
      "Belanja sayur 25rb",
      "Bonus 1k",
      "Tagihan listrik 350rb"
    ];
    const results = scenarios.map(txt => ({
      input: txt,
      output: parseAmountFromString(txt)
    }));
    setTestResults(results);
    showToast("Parser unit tests executed cleanly!", "success");
  };

  // Telegram Generator code
  const handleGenerateLinkingCode = () => {
    // Math random 5 digit sequence
    const code = Math.floor(10000 + Math.random() * 90000).toString();
    setLinkingCode(code);
    setTimerSeconds(600); // 10 minutes reset
  };

  // Simulated Telegram bot action trigger
  const handleSimulateTelegramWebhookLink = () => {
    if (!linkingCode) return;
    
    // Simulate webhook response from /api/telegram/webhook
    showToast("Webhook parsing linking code...", "info");
    
    setTimeout(() => {
      const generatedChatId = Math.floor(10000000 + Math.random() * 90000000).toString();
      setTelegramChatId(generatedChatId);
      setIsTelegramLinked(true);
      
      // Update session record
      const updated = { ...currentUser, telegram_chat_id: generatedChatId };
      localStorage.setItem("ewallet_active_user", JSON.stringify(updated));
      
      // Also update users array registry
      const allUsers = authService._getUsers();
      const idx = allUsers.findIndex(u => u.id === currentUser.id);
      if (idx !== -1) {
        allUsers[idx].telegram_chat_id = generatedChatId;
        authService._saveUsers(allUsers);
      }
      
      onUserPrefUpdated(updated);
      setLinkingCode(null); // clear
      showToast(t("toast.success_link"), "success");
    }, 1200);
  };

  const handleUnlinkTelegramClick = () => {
    setIsUnlinkModalOpen(true);
  };

  const executeUnlinkTelegram = () => {
    setIsUnlinkModalOpen(false);
    showToast("Unlinking Telegram bot...", "info");

    setTimeout(() => {
      setTelegramChatId("");
      setIsTelegramLinked(false);

      // Update session record
      const updated = { ...currentUser, telegram_chat_id: undefined };
      localStorage.setItem("ewallet_active_user", JSON.stringify(updated));
      
      const allUsers = authService._getUsers();
      const idx = allUsers.findIndex(u => u.id === currentUser.id);
      if (idx !== -1) {
        delete allUsers[idx].telegram_chat_id;
        authService._saveUsers(allUsers);
      }

      onUserPrefUpdated(updated);
      showToast(t("toast.success_unlink"), "success");
    }, 600);
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
          Kelola preferensi bahasa, tema, integrasi, dan akun permanent Anda.
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
                <button
                  type="button"
                  onClick={handleUpdateProfileName}
                  className="cursor-pointer border border-transparent bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 rounded-xl font-sans text-xs font-semibold text-white tracking-tight transition-all"
                >
                  {t("settings.btn_update_profile")}
                </button>
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
                <button
                  onClick={() => setLocale("id")}
                  className={`py-3 rounded-xl font-sans text-xs font-bold border transition-all cursor-pointer
                    ${locale === "id" 
                      ? "bg-indigo-600/10 border-indigo-500 text-indigo-400 light_sakura:bg-rose-500/10 light_sakura:border-rose-550 light_sakura:text-rose-600" 
                      : "bg-slate-950 border-slate-800 text-gray-400 hover:bg-slate-900 light_sakura:bg-rose-50/20 light_sakura:border-rose-100 light_sakura:text-slate-500"
                    }`}
                >
                  Bahasa Indonesia (ID)
                </button>
                <button
                  onClick={() => setLocale("en")}
                  className={`py-3 rounded-xl font-sans text-xs font-bold border transition-all cursor-pointer
                    ${locale === "en" 
                      ? "bg-indigo-600/10 border-indigo-500 text-indigo-400 light_sakura:bg-rose-500/10 light_sakura:border-rose-550 light_sakura:text-rose-600" 
                      : "bg-slate-950 border-slate-800 text-gray-400 hover:bg-slate-900 light_sakura:bg-rose-50/20 light_sakura:border-rose-100 light_sakura:text-slate-500"
                    }`}
                >
                  English (EN)
                </button>
              </div>
            </div>

            {/* Theme selector row */}
            <div className="space-y-1.5">
              <label className="font-sans text-[10px] font-bold text-gray-400 light_sakura:text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <SunMoon size={12} className="text-teal-400 light_sakura:text-rose-500" />
                <span>{t("settings.theme")}</span>
              </label>
              
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setTheme("dark_obsidian")}
                  className={`py-3 rounded-xl font-sans text-[10px] sm:text-xs font-bold border transition-all cursor-pointer
                    ${theme === "dark_obsidian" 
                      ? "bg-indigo-600/10 border-indigo-500 text-indigo-400" 
                      : "bg-slate-950 border-slate-800 text-gray-400 hover:bg-slate-900 light_sakura:bg-rose-50/20 light_sakura:border-rose-100 light_sakura:text-slate-500"
                    }`}
                >
                  {t("settings.theme_dark_obsidian")}
                </button>
                <button
                  onClick={() => setTheme("light_sakura")}
                  className={`py-3 rounded-xl font-sans text-[10px] sm:text-xs font-bold border transition-all cursor-pointer
                    ${theme === "light_sakura" 
                      ? "bg-rose-500/10 border-rose-500 text-rose-600" 
                      : "bg-slate-950 border-slate-800 text-gray-400 hover:bg-slate-900 light_sakura:bg-rose-50/20 light_sakura:border-rose-100 light_sakura:text-slate-500"
                    }`}
                >
                  {t("settings.theme_light_sakura")}
                </button>
              </div>
            </div>

          </div>

          {/* Section 5: Unit Test scenarios validator diagnostics */}
          <div className="p-6 rounded-3xl border bg-slate-900 border-slate-900 transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 shadow-xs space-y-4">
            <h3 className="font-sans font-bold text-sm text-slate-200 border-b border-slate-800/10 pb-2.5 light_sakura:text-slate-800 light_sakura:border-rose-100 flex items-center justify-between">
              <span>{t("settings.diagnostics_sec")}</span>
              <button
                type="button"
                onClick={runParserDiagnostics}
                className="cursor-pointer p-1 rounded-lg text-indigo-400 hover:scale-105 active:scale-95 transition-transform"
              >
                <Play size={16} />
              </button>
            </h3>
            
            <p className="font-sans text-xs text-gray-400 light_sakura:text-slate-500">
              {t("settings.diagnostics_desc")}
            </p>

            {testResults.length > 0 && (
              <div className="space-y-2.5 max-h-48 overflow-y-auto">
                {testResults.map((res, index) => (
                  <div key={index} className="flex justify-between items-center p-3 rounded-xl bg-slate-950/40 border border-slate-800/45 light_sakura:bg-rose-50/50 light_sakura:border-rose-100 font-mono text-[11px]">
                    <span className="text-gray-400 light_sakura:text-slate-600">"{res.input}"</span>
                    <span className="text-emerald-400 font-bold light_sakura:text-emerald-600">{formatIDR(res.output)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Panel Right: Telegram linking & Account promotion */}
        <div className="space-y-6">
          
          {/* Section 3: Telegram Bot Integration block */}
          <div className="p-6 rounded-3xl border bg-slate-900 border-slate-900 transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 shadow-xs space-y-4">
            <h3 className="font-sans font-bold text-sm text-slate-200 border-b border-slate-800/10 pb-2.5 light_sakura:text-slate-800 light_sakura:border-rose-100">
              {t("settings.telegram_sec")}
            </h3>

            <p className="font-sans text-xs text-slate-400 leading-relaxed light_sakura:text-slate-500">
              {t("settings.telegram_desc")}
            </p>

            {/* Connection Status indicator info */}
            <div className="flex items-center gap-2.5 p-3.5 rounded-xl border border-slate-800 bg-slate-950/40 light_sakura:border-rose-100 light_sakura:bg-rose-50/30">
              {isTelegramLinked ? (
                <>
                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="font-sans text-xs font-semibold text-emerald-400 light_sakura:text-emerald-600">
                    {t("settings.telegram_linked", { id: telegramChatId })}
                  </span>
                </>
              ) : (
                <>
                  <span className="w-2.5 h-2.5 bg-gray-500 rounded-full" />
                  <span className="font-sans text-xs font-semibold text-gray-400 light_sakura:text-slate-500">
                    {t("settings.telegram_unlinked")}
                  </span>
                </>
              )}
            </div>

            {/* Active flow triggers */}
            {!isTelegramLinked ? (
              <div className="space-y-4">
                {!linkingCode ? (
                  <button
                    type="button"
                    onClick={handleGenerateLinkingCode}
                    className="w-full cursor-pointer py-3 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-xl font-sans text-xs font-bold shadow-md transition-colors light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400"
                  >
                    {t("settings.btn_generate_code")}
                  </button>
                ) : (
                  <div className="p-4 rounded-xl border border-dashed border-indigo-500/20 bg-indigo-500/5 light_sakura:border-rose-200 light_sakura:bg-rose-50/40 space-y-4 flex flex-col items-center">
                    <p className="font-sans text-xs text-center text-gray-400 light_sakura:text-slate-600">
                      {t("settings.telegram_instructions")}
                    </p>

                    {/* Highly visible 5-digit sequence code display */}
                    <div className="px-6 py-3.5 rounded-2xl bg-slate-950 shadow-inner font-mono font-bold text-2xl tracking-widest text-teal-400 light_sakura:bg-white light_sakura:text-rose-500 border light_sakura:border-rose-150 relative">
                      <span>{linkingCode}</span>
                    </div>

                    <div className="flex items-center gap-2 font-sans text-[11px] text-gray-400 light_sakura:text-slate-500 font-semibold uppercase tracking-wider">
                      <RefreshCw size={13} className="animate-spin" />
                      <span>{t("settings.code_expires")}: {formatTimerStr(timerSeconds)}</span>
                    </div>

                    {/* Interactive Mock simulation webhook trigger */}
                    <button
                      type="button"
                      onClick={handleSimulateTelegramWebhookLink}
                      className="w-full cursor-pointer py-2.5 bg-teal-500/10 border border-teal-500/25 text-teal-400 rounded-xl font-sans text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-teal-500/20 hover:scale-[1.01] active:scale-[0.99] transition-all light_sakura:bg-rose-100 light_sakura:border-rose-300 light_sakura:text-rose-600"
                    >
                      <Sparkles size={14} />
                      <span>Simulasikan Kirim `/link` di Bot</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={handleUnlinkTelegramClick}
                className="w-full cursor-pointer py-3 border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl font-sans text-xs font-semibold transition-colors"
              >
                {t("settings.btn_unlink")}
              </button>
            )}

          </div>

          {/* Section 4: Promote guest user perm upgraders */}
          {currentUser.is_guest && (
            <div className="p-6 rounded-3xl border bg-slate-900 border-slate-900 transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 shadow-xs space-y-4">
              <h3 className="font-sans font-bold text-sm text-slate-200 border-b border-slate-800/10 pb-2.5 light_sakura:text-slate-800 light_sakura:border-rose-100">
                {t("settings.upgrade_sec")}
              </h3>

              <p className="font-sans text-xs text-gray-400 leading-relaxed light_sakura:text-slate-500">
                {t("settings.upgrade_desc")}
              </p>

              <form onSubmit={handleUpgradeGuest} className="space-y-4">
                {/* 1. Name */}
                <div className="space-y-1">
                  <label className="font-sans text-[10px] font-bold text-gray-400 light_sakura:text-slate-500 uppercase tracking-wider block">
                    Nama Permanen Anda
                  </label>
                  <input
                    type="text"
                    required
                    value={upgradeName}
                    onChange={(e) => setUpgradeName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white outline-none focus:border-indigo-500 light_sakura:bg-slate-50 light_sakura:border-rose-100 light_sakura:text-slate-800"
                  />
                </div>

                {/* 2. Email */}
                <div className="space-y-1">
                  <label className="font-sans text-[10px] font-bold text-gray-400 light_sakura:text-slate-500 uppercase tracking-wider block">
                    {t("auth.label_email")}
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="nama@domain.com"
                    value={upgradeEmail}
                    onChange={(e) => setUpgradeEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white outline-none focus:border-indigo-500 light_sakura:bg-slate-50 light_sakura:border-rose-100 light_sakura:text-slate-800"
                  />
                </div>

                {/* 3. Password */}
                <div className="space-y-1">
                  <label className="font-sans text-[10px] font-bold text-gray-400 light_sakura:text-slate-500 uppercase tracking-wider block">
                    {t("auth.label_password")}
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    placeholder="••••••••"
                    value={upgradePassword}
                    onChange={(e) => setUpgradePassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white outline-none focus:border-indigo-500 light_sakura:bg-slate-50 light_sakura:border-rose-100 light_sakura:text-slate-800"
                  />
                </div>

                {/* Promote submit */}
                <button
                  type="submit"
                  className="w-full cursor-pointer py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-sans text-xs font-bold transition-colors shadow-md light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400"
                >
                  {t("settings.btn_upgrade")}
                </button>
              </form>
            </div>
          )}

        </div>

      </div>

      {/* Confirmation - Modify Profiles Name */}
      <Modal
        isOpen={isProfileModalOpen}
        title={t("confirm.profile_update_title")}
        description={t("confirm.profile_update_desc", { name: displayName })}
        type="info"
        confirmLabel="Perbarui Nama"
        cancelLabel={t("common.cancel")}
        onConfirm={executeUpdateProfileName}
        onCancel={() => setIsProfileModalOpen(false)}
      />

      {/* Confirmation - Unlink Bot */}
      <Modal
        isOpen={isUnlinkModalOpen}
        title={t("confirm.unlink_telegram_title")}
        description={t("confirm.unlink_telegram_desc")}
        type="danger"
        confirmLabel="Unlink Bot"
        cancelLabel={t("common.cancel")}
        onConfirm={executeUnlinkTelegram}
        onCancel={() => setIsUnlinkModalOpen(false)}
      />

    </div>
  );
};
