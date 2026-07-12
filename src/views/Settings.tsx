import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import { useTheme } from "../contexts/ThemeContext";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { Modal } from "../components/Modal";
import { DeleteAccountModal } from "../components/DeleteAccountModal";
import { parseAmountFromString } from "../lib/parserUtils";
import { audioFeedback } from "../lib/audio";
import { exportMyData, deleteMyAccount } from "../lib/privacy";
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
  Lock,
  Smartphone,
  Download,
  ShieldQuestion,
  Camera,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck
} from "lucide-react";
import { motion } from "motion/react";
import { UserSession } from "../types";
import { usePremium } from "../hooks/usePremium";
import { PremiumModal } from "../components/PremiumModal";
import { uploadAvatar, AvatarValidationError } from "../lib/avatar";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";

interface SettingsProps {
  onUserPrefUpdated: (user: UserSession) => void;
}

export const Settings: React.FC<SettingsProps> = ({
  onUserPrefUpdated
}) => {
  const { user, signOut } = useAuth();
  const { locale, setLocale, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
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

  // Profile Picture (Avatar) States
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('display_name, avatar_url')
        .eq('id', user.id)
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
    // Reset value supaya memilih file yang sama persis lagi tetap memicu onChange.
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
          err.code === "INVALID_TYPE"
            ? t("settings.toast_avatar_invalid_type")
            : t("settings.toast_avatar_too_large"),
          "error"
        );
      } else {
        showToast(err.message || t("settings.toast_avatar_error"), "error");
      }
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Change Password States
  const canChangePassword =
    !isGuest &&
    !!user?.email &&
    (user?.identities?.some((i: any) => i.provider === "email") ?? true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    audioFeedback.playClick();

    if (!currentPassword) {
      audioFeedback.playDullPluck();
      showToast(t("settings.toast_current_password_required"), "error");
      return;
    }
    if (newPassword.length < 6) {
      audioFeedback.playDullPluck();
      showToast(t("auth.validation_pass"), "error");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      audioFeedback.playDullPluck();
      showToast(t("auth.passwords_dont_match"), "error");
      return;
    }
    if (newPassword === currentPassword) {
      audioFeedback.playDullPluck();
      showToast(t("settings.toast_password_same_as_old"), "error");
      return;
    }

    setIsChangingPassword(true);
    try {
      // Re-verifikasi identitas lewat password lama sebelum mengganti --
      // supabase.auth.updateUser() sendiri tidak meminta password lama,
      // jadi verifikasi manual ini penting supaya sesi yang "nyasar"
      // (mis. device lain lupa logout) tidak bisa ganti password tanpa tahu yang lama.
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user!.email!,
        password: currentPassword,
      });
      if (verifyError) {
        showToast(t("settings.toast_current_password_wrong"), "error");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      audioFeedback.playChime();
      showToast(t("settings.toast_password_changed"), "success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err: any) {
      audioFeedback.playDullPluck();
      showToast(err.message || t("toast.error_general"), "error");
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Telegram Connection States
  const [linkingCode, setLinkingCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(600); // 10 minutes
  const [isTelegramLinked, setIsTelegramLinked] = useState(false);
  const [telegramChatId, setTelegramChatId] = useState("");
  const [isUnlinkModalOpen, setIsUnlinkModalOpen] = useState(false);

  // Privacy & Data controls
  const [isExportingData, setIsExportingData] = useState(false);
  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);

  // Baca status koneksi Telegram dari DB saat halaman pertama dibuka.
  // Tanpa ini, isTelegramLinked selalu mulai false dan hanya berubah lewat
  // polling — yang tidak jalan kecuali linkingCode sedang aktif.
  useEffect(() => {
    if (!user) return;
    const fetchTelegramStatus = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('telegram_chat_id')
        .eq('id', user.id)
        .single();
      if (!error && data?.telegram_chat_id) {
        setTelegramChatId(data.telegram_chat_id);
        setIsTelegramLinked(true);
      }
    };
    fetchTelegramStatus();
  }, [user]);

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
        .update({ 
          display_name: displayName
        })
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

  const handleExportMyData = async () => {
    audioFeedback.playClick();
    setIsExportingData(true);
    try {
      await exportMyData();
      showToast(t("settings.privacy_export_success"), "success");
    } catch (err: any) {
      console.error("Export data error:", err);
      showToast(t("settings.privacy_export_error"), "error");
    } finally {
      setIsExportingData(false);
    }
  };

  const handleDeleteAccountConfirmed = async () => {
    await deleteMyAccount();
    audioFeedback.playChime();
    showToast(t("settings.privacy_delete_success"), "success");
    setIsDeleteAccountModalOpen(false);
    // Sesi lokal masih menyimpan JWT lama (yang sekarang sudah tidak
    // valid karena akunnya sudah terhapus di server) -- signOut()
    // membersihkannya supaya user langsung diarahkan ke halaman login.
    await signOut();
    navigate("/login", { replace: true });
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
    <div className="max-w-3xl mx-auto space-y-5">
      
      {/* Main Card */}
      <div className="rounded-3xl border bg-slate-900 border-slate-800/60 light_sakura:bg-white light_sakura:border-rose-100/40 shadow-lg overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-400" />
        <div className="p-6 md:p-8 space-y-6">
        
        {/* View Header */}
        <div className="flex flex-col border-b border-slate-800/50 pb-6 light_sakura:border-rose-100/30">
          <h1 className="font-sans font-bold text-2xl tracking-tight text-white light_sakura:text-slate-900">
            {t("settings.title")}
          </h1>
          <p className="font-sans text-sm text-slate-400 mt-1 light_sakura:text-slate-500 font-medium">
            {t("settings.desc")}
          </p>
        </div>

        {/* ── Formasi: strip profil ringkas ala kartu identitas ─────────── */}
        <div className="flex items-center gap-3.5 p-4 rounded-2xl bg-slate-950/40 border border-slate-800/60 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/50">
          <button
            type="button"
            onClick={handleAvatarClick}
            disabled={isGuest || isUploadingAvatar}
            aria-label={t("settings.avatar_change_label")}
            className={`relative group w-11 h-11 shrink-0 rounded-full overflow-hidden bg-indigo-600 light_sakura:bg-rose-500 text-white flex items-center justify-center font-sans font-bold text-lg ${!isGuest ? "cursor-pointer" : "cursor-default"}`}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName || "avatar"} className="w-full h-full object-cover" />
            ) : (
              <span>{(displayName || "?").charAt(0).toUpperCase()}</span>
            )}
            {!isGuest && (
              <span className={`absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity ${isUploadingAvatar ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                {isUploadingAvatar ? (
                  <Loader2 size={16} className="animate-spin text-white" />
                ) : (
                  <Camera size={15} className="text-white" />
                )}
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
          <div className="min-w-0 flex-1">
            <p className="font-sans font-bold text-sm text-slate-100 light_sakura:text-slate-900 truncate">{displayName || t("admin.guest_user")}</p>
            <p className="text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-500 mt-0.5">
              {isGuest ? t("admin.guest_user") : isUploadingAvatar ? t("settings.avatar_uploading") : t("settings.avatar_change_hint")}
            </p>
          </div>
          {!isGuest && (
            isPremium ? (
              <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold bg-amber-500/15 text-amber-400 light_sakura:bg-rose-100 light_sakura:text-rose-600">
                <Sparkles size={11} /> {t("premium.badge_active")}
              </span>
            ) : (
              <button onClick={() => { audioFeedback.playClick(); setIsPremiumOpen(true); }}
                className="shrink-0 cursor-pointer px-2.5 py-1 rounded-lg text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors light_sakura:bg-slate-100 light_sakura:text-slate-500">
                {t("premium.menu_label")}
              </button>
            )
          )}
        </div>


        {/* Grid panels */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Panel Left: Preferences & Profiles */}
          <div className="space-y-6">
            
            {/* Section 1: Profiles Name edit */}
            <div className="p-5 rounded-2xl border bg-slate-950/40 border-slate-800/60 transition-colors duration-300 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/50 shadow-sm space-y-4">
            <h3 className="font-sans font-bold text-sm text-slate-200 border-b border-slate-800/10 pb-2.5 light_sakura:text-slate-800 light_sakura:border-rose-100">
              {t("settings.profile_section")}
            </h3>

            <div className="space-y-1.5">
              <label className="font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-slate-400 light_sakura:text-slate-500 uppercase tracking-wider block">
                {t("settings.display_name")}
              </label>
              
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white outline-none focus:border-indigo-500 light_sakura:bg-slate-50 light_sakura:border-rose-100 light_sakura:text-slate-800"
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

          {/* Section 1b: Change Password (only for accounts using email/password auth) */}
          {canChangePassword && (
            <form
              onSubmit={handleChangePassword}
              className="p-5 rounded-2xl border bg-slate-950/40 border-slate-800/60 transition-colors duration-300 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/50 shadow-sm space-y-4"
            >
              <h3 className="font-sans font-bold text-sm text-slate-200 border-b border-slate-800/10 pb-2.5 light_sakura:text-slate-800 light_sakura:border-rose-100 flex items-center gap-2">
                <ShieldCheck size={14} className="text-indigo-400 light_sakura:text-rose-500" />
                <span>{t("settings.security_section")}</span>
              </h3>

              <p className="font-sans text-xs text-slate-400 leading-relaxed light_sakura:text-slate-500">
                {t("settings.security_section_desc")}
              </p>

              <Input
                type={showCurrentPassword ? "text" : "password"}
                label={t("settings.current_password_label")}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={isChangingPassword}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                leftIcon={<Lock size={14} />}
                className="bg-slate-950 border-slate-800 text-xs light_sakura:bg-slate-50 light_sakura:border-rose-100"
                rightElement={
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => { audioFeedback.playClick(); setShowCurrentPassword(!showCurrentPassword); }}
                    aria-label={showCurrentPassword ? t("auth.hide_password") : t("auth.show_password")}
                    className="text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {showCurrentPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                }
              />

              <Input
                type={showNewPassword ? "text" : "password"}
                label={t("auth.new_password_label")}
                placeholder="••••••••"
                autoComplete="new-password"
                minLength={6}
                disabled={isChangingPassword}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                leftIcon={<Key size={14} />}
                className="bg-slate-950 border-slate-800 text-xs light_sakura:bg-slate-50 light_sakura:border-rose-100"
                rightElement={
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => { audioFeedback.playClick(); setShowNewPassword(!showNewPassword); }}
                    aria-label={showNewPassword ? t("auth.hide_password") : t("auth.show_password")}
                    className="text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                }
              />

              <Input
                type={showConfirmNewPassword ? "text" : "password"}
                label={t("auth.confirm_password_label")}
                placeholder="••••••••"
                autoComplete="new-password"
                minLength={6}
                disabled={isChangingPassword}
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                leftIcon={<Key size={14} />}
                className="bg-slate-950 border-slate-800 text-xs light_sakura:bg-slate-50 light_sakura:border-rose-100"
                rightElement={
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => { audioFeedback.playClick(); setShowConfirmNewPassword(!showConfirmNewPassword); }}
                    aria-label={showConfirmNewPassword ? t("auth.hide_password") : t("auth.show_password")}
                    className="text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {showConfirmNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                }
              />

              <Button
                type="submit"
                variant="primary"
                fullWidth
                size="sm"
                disabled={isChangingPassword}
                isLoading={isChangingPassword}
                icon={<ShieldCheck size={14} />}
                className="rounded-xl py-2.5"
              >
                {t("settings.btn_change_password")}
              </Button>
            </form>
          )}

          {/* Section 2: Quick instant Switcher controls */}
          <div className="p-5 rounded-2xl border bg-slate-950/40 border-slate-800/60 transition-colors duration-300 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/50 shadow-sm space-y-5">
            <h3 className="font-sans font-bold text-sm text-slate-200 border-b border-slate-800/10 pb-2.5 light_sakura:text-slate-800 light_sakura:border-rose-100">
              {t("settings.preferences")}
            </h3>

            {/* Language selector row */}
            <div className="space-y-1.5">
              <label className="font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-slate-400 light_sakura:text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Globe size={12} className="text-indigo-400 light_sakura:text-rose-500" />
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
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900 light_sakura:bg-rose-50/20 light_sakura:border-rose-100 light_sakura:text-slate-500"
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
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900 light_sakura:bg-rose-50/20 light_sakura:border-rose-100 light_sakura:text-slate-500"
                    }`}
                >
                  English (EN)
                </motion.button>
              </div>
            </div>

            {/* Theme selector row */}
            <div className="space-y-1.5">
              <label className="font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-slate-400 light_sakura:text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <SunMoon size={12} className="text-indigo-400 light_sakura:text-rose-500" />
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
                  className={`py-3 rounded-xl font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] sm:text-xs font-bold border transition-all cursor-pointer
                    ${theme === "dark_obsidian" 
                      ? "bg-indigo-600/10 border-indigo-500 text-indigo-400" 
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900 light_sakura:bg-rose-50/20 light_sakura:border-rose-100 light_sakura:text-slate-500"
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
                  className={`py-3 rounded-xl font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] sm:text-xs font-bold border transition-all cursor-pointer
                    ${theme === "light_sakura" 
                      ? "bg-rose-500/10 border-rose-500 text-rose-600" 
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900 light_sakura:bg-rose-50/20 light_sakura:border-rose-100 light_sakura:text-slate-500"
                    }`}
                >
                  {t("settings.theme_light_sakura")}
                </motion.button>
              </div>
            </div>

          </div>

          {/* Section 3: PWA Installation Block */}
          <div className="p-5 rounded-2xl border bg-slate-950/40 border-slate-800/60 transition-colors duration-300 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/50 shadow-sm space-y-4">
            <h3 className="font-sans font-bold text-sm text-slate-200 border-b border-slate-800/10 pb-2.5 light_sakura:text-slate-800 light_sakura:border-rose-100 flex items-center gap-2">
              <Smartphone size={14} className="text-indigo-400 light_sakura:text-rose-500" />
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
                className="w-full cursor-pointer py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-sans text-xs font-bold shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 transition-all"
              >
                <Smartphone size={14} />
                <span>{t("settings.pwa_btn_install")}</span>
              </motion.button>
            ) : (
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-slate-400 text-xs leading-relaxed light_sakura:bg-rose-100/35 light_sakura:border-rose-200/50 light_sakura:text-slate-600">
                <p className="font-sans text-[clamp(0.6188rem,2.86vw,0.6875rem)]">
                  {t("settings.pwa_not_supported")}
                </p>
              </div>
            )}
          </div>

            {/* Section 4: Privacy & Data controls (self-service export & account deletion) */}
            <div className="p-5 rounded-2xl border bg-slate-950/40 border-slate-800/60 transition-colors duration-300 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/50 shadow-sm space-y-4">
              <h3 className="font-sans font-bold text-sm text-slate-200 border-b border-slate-800/10 pb-2.5 light_sakura:text-slate-800 light_sakura:border-rose-100 flex items-center gap-2">
                <ShieldQuestion size={14} className="text-indigo-400 light_sakura:text-rose-500" />
                <span>{t("settings.privacy_section")}</span>
              </h3>

              <p className="font-sans text-xs text-slate-400 leading-relaxed light_sakura:text-slate-500">
                {t("settings.privacy_section_desc")}
              </p>

              {/* Export my data */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 light_sakura:bg-rose-100/35 light_sakura:border-rose-200/50 space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <Download size={14} className="text-indigo-400 light_sakura:text-rose-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-sans text-xs font-semibold text-slate-200 light_sakura:text-slate-800">
                      {t("settings.privacy_export_title")}
                    </p>
                    <p className="font-sans text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-500 leading-relaxed mt-0.5">
                      {t("settings.privacy_export_desc")}
                    </p>
                  </div>
                </div>
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  type="button"
                  onClick={handleExportMyData}
                  disabled={isExportingData}
                  className="w-full cursor-pointer border border-slate-700 bg-slate-900 hover:bg-slate-800 py-2.5 rounded-xl font-sans text-xs font-semibold text-slate-200 tracking-tight transition-all disabled:opacity-50 flex items-center justify-center gap-2 light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-700"
                >
                  <Download size={13} />
                  <span>{isExportingData ? t("common.loading") : t("settings.privacy_export_button")}</span>
                </motion.button>
              </div>

              {/* Delete account */}
              <div className="p-3.5 rounded-xl bg-red-500/5 border border-red-500/20 space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <Trash2 size={14} className="text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-sans text-xs font-semibold text-red-300 light_sakura:text-red-600">
                      {t("settings.privacy_delete_title")}
                    </p>
                    <p className="font-sans text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-500 leading-relaxed mt-0.5">
                      {t("settings.privacy_delete_section_desc")}
                    </p>
                  </div>
                </div>
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  type="button"
                  onClick={() => { audioFeedback.playClick(); setIsDeleteAccountModalOpen(true); }}
                  className="w-full cursor-pointer border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 py-2.5 rounded-xl font-sans text-xs font-semibold text-red-400 tracking-tight transition-all flex items-center justify-center gap-2"
                >
                  <Trash2 size={13} />
                  <span>{t("settings.privacy_delete_button")}</span>
                </motion.button>
              </div>
            </div>

            {/* Section 5: Unit Test scenarios validator diagnostics - REMOVED */}
          </div>

        {/* Panel Right: Telegram linking & Account promotion */}
        <div className="space-y-6">
          
          {/* Section 3: Telegram Bot Integration block */}
          <div className="p-5 rounded-2xl border bg-slate-950/40 border-slate-800/60 transition-colors duration-300 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/50 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800/10 pb-2.5 light_sakura:border-rose-100">
              <h3 className="font-sans font-bold text-sm text-slate-200 light_sakura:text-slate-800 flex items-center gap-2">
                <Send size={14} className="text-indigo-400" />
                <span>{t("settings.telegram_sec")}</span>
                {isTelegramLocked && <Lock size={12} className="text-amber-500 light_sakura:text-rose-500" />}
              </h3>
              {isTelegramLinked && !isTelegramLocked && (
                <span className="px-2 py-0.5 text-[clamp(0.5062rem,2.34vw,0.5625rem)] font-bold tracking-wider uppercase bg-emerald-500/20 text-emerald-400 rounded-md border border-emerald-500/30">
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
                  <h4 className="font-sans font-bold text-xs text-white light_sakura:text-slate-800">
                    {t("settings.premium_locked_title")}
                  </h4>
                  <p className="font-sans text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-400 light_sakura:text-slate-600 max-w-sm leading-relaxed">
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
                      <div className="font-sans text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-400 mt-0.5 light_sakura:text-slate-500">
                        {t("settings.telegram_linked", { id: telegramChatId })}
                      </div>
                    </div>
                  </div>
                  

                </div>

                {/* Features Highlight */}
                <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-800/50 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/50 space-y-3">
                  <h4 className="font-sans font-bold text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-400 light_sakura:text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Sparkles size={12} className="text-amber-400" />
                    <span>{t("settings.telegram_features_title")}</span>
                  </h4>
                  <ul className="space-y-2">
                    {[1, 2, 3, 4].map(i => (
                      <li key={i} className="flex items-start gap-2 text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-400 light_sakura:text-slate-600">
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
                        <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-indigo-400 shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
                          {step}
                        </div>
                        <p className="font-sans text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-400 light_sakura:text-slate-600 leading-normal pt-0.5">
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
                      <span className="font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-slate-500 uppercase tracking-widest">
                        {t("settings.btn_copy_link")}
                      </span>
                      <div className="px-8 py-4 rounded-2xl bg-slate-950 shadow-xl font-mono font-bold text-3xl tracking-[0.2em] text-indigo-400 light_sakura:bg-white light_sakura:text-rose-500 border border-slate-800 light_sakura:border-rose-150 flex items-center justify-center gap-4">
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
                       <div className="flex items-center gap-2 font-sans text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-400 light_sakura:text-slate-500 font-semibold uppercase tracking-wider">
                        <RefreshCw size={13} className="animate-spin text-indigo-400" />
                        <span>{t("settings.code_expires")}: {formatTimerStr(timerSeconds)}</span>
                      </div>
                      <p className="font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-500 text-center italic">
                        {t("settings.waiting_for_connection", "Menunggu koneksi dari bot...")}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

      {/* Confirmation - Modify Profiles Name */}
      </div>{/* panel-right */}

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

      <DeleteAccountModal
        isOpen={isDeleteAccountModalOpen}
        onCancel={() => setIsDeleteAccountModalOpen(false)}
        onConfirm={handleDeleteAccountConfirmed}
      />
      </div>{/* grid */}
        </div>{/* card-body */}
      </div>{/* card */}
    </div>
  );
};
