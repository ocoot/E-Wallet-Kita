import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  Send, Lock, Sparkles, Info, RefreshCw, Copy, CheckCircle,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { useToast } from "../../contexts/ToastContext";
import { useThemeTokens } from "../../hooks/useThemeTokens";
import { usePremium } from "../../hooks/usePremium";
import { supabase } from "../../lib/supabase";
import { audioFeedback } from "../../lib/audio";
import { Modal } from "../../components/Modal";
import { PremiumModal } from "../../components/PremiumModal";
import { MobileSettingsDetailPage } from "../../components/settings/MobileSettingsDetailPage";

/** Halaman detail "Bot Telegram" (mobile). */
export const TelegramSettings: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const { tokens, cx } = useThemeTokens();
  const { isPremium, refresh: refreshPremium } = usePremium();
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);

  const isGuest = user?.is_anonymous ?? false;
  const isTelegramLocked = isGuest || !isPremium;

  const [linkingCode, setLinkingCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(600);
  const [isTelegramLinked, setIsTelegramLinked] = useState(false);
  const [telegramChatId, setTelegramChatId] = useState("");
  const [isUnlinkModalOpen, setIsUnlinkModalOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchTelegramStatus = async () => {
      const { data, error } = await supabase
        .from("users")
        .select("telegram_chat_id")
        .eq("id", user.id)
        .single();
      if (!error && data?.telegram_chat_id) {
        setTelegramChatId(data.telegram_chat_id);
        setIsTelegramLinked(true);
      }
    };
    fetchTelegramStatus();
  }, [user]);

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

  useEffect(() => {
    if (!user || isTelegramLinked || !linkingCode) return;
    const interval = setInterval(async () => {
      const { data, error } = await supabase
        .from("users")
        .select("telegram_chat_id")
        .eq("id", user.id)
        .single();
      if (!error && data && data.telegram_chat_id) {
        setTelegramChatId(data.telegram_chat_id);
        setIsTelegramLinked(true);
        setLinkingCode(null);
        audioFeedback.playChime();
        showToast(t("toast.success_link"), "success");
        clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [user, isTelegramLinked, linkingCode]);

  const handleGenerateLinkingCode = async () => {
    audioFeedback.playClick();
    if (!user) return;

    if (!isPremium) {
      showToast(t("premium.locked_telegram"), "error");
      setIsPremiumOpen(true);
      return;
    }

    const code = Math.floor(10000 + Math.random() * 90000).toString();
    try {
      const { error } = await supabase.from("telegram_link_codes").insert({
        code,
        user_id: user.id,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      if (error) throw error;
      setLinkingCode(code);
      setTimerSeconds(600);
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
    }).catch(() => {
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
      const { error } = await supabase.from("users").update({ telegram_chat_id: null }).eq("id", user?.id);
      if (error) throw error;
      setTelegramChatId("");
      setIsTelegramLinked(false);
      audioFeedback.playChime();
      showToast(t("toast.success_unlink"), "success");
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  const formatTimerStr = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  return (
    <MobileSettingsDetailPage title={t("settings.menu_telegram")} description={t("settings.telegram_desc")}>
      <div className="p-5 rounded-2xl border bg-slate-950/40 border-slate-800/60 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/50 shadow-sm space-y-5">
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

        {isTelegramLocked ? (
          <div className="flex flex-col items-center justify-center py-6 px-4 text-center space-y-4 border border-dashed border-amber-500/25 bg-amber-500/5 rounded-2xl light_sakura:border-rose-300/30 light_sakura:bg-rose-50/50">
            <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500 light_sakura:bg-rose-500/10 light_sakura:text-rose-500">
              <Lock size={24} className="animate-pulse" />
            </div>
            <div className="space-y-1">
              <h4 className={cx("font-sans font-bold text-xs", tokens.text.onSurface)}>
                {t("settings.premium_locked_title")}
              </h4>
              <p className={cx("font-sans text-[clamp(0.6188rem,2.86vw,0.6875rem)] max-w-sm leading-relaxed", tokens.text.mutedAlt)}>
                {isGuest ? t("settings.premium_locked_guest_desc") : t("settings.premium_locked_user_desc")}
              </p>
            </div>
            {!isGuest && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => { audioFeedback.playClick(); setIsPremiumOpen(true); }}
                className="cursor-pointer px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl shadow-lg shadow-amber-500/10 flex items-center gap-1.5 transition-colors light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400 light_sakura:text-white"
              >
                <Sparkles size={13} />
                <span>{t("premium.menu_label")}</span>
              </motion.button>
            )}
          </div>
        ) : isTelegramLinked ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 p-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 light_sakura:border-emerald-250 light_sakura:bg-emerald-50/20 shadow-xs">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-full bg-[#0088cc] text-white flex items-center justify-center shadow-md relative shrink-0">
                  <Send size={18} className="-translate-x-0.5 translate-y-0.5 rotate-45" />
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-slate-900 light_sakura:border-white rounded-full flex items-center justify-center">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  </span>
                </div>
                <div>
                  <h4 className={cx("font-sans font-bold text-xs", tokens.text.onSurface)}>
                    {t("settings.telegram_sync_status")}
                  </h4>
                  <div className="font-sans text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-400 mt-0.5 light_sakura:text-slate-500">
                    {t("settings.telegram_linked", { id: telegramChatId })}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-800/50 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/50 space-y-3">
              <h4 className={cx("font-sans font-bold text-[clamp(0.5625rem,2.6vw,0.625rem)] uppercase tracking-widest flex items-center gap-1.5", tokens.text.muted)}>
                <Sparkles size={12} className="text-amber-400" />
                <span>{t("settings.telegram_features_title")}</span>
              </h4>
              <ul className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <li key={i} className={cx("flex items-start gap-2 text-[clamp(0.6188rem,2.86vw,0.6875rem)]", tokens.text.mutedAlt)}>
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
                    <p className={cx("font-sans text-[clamp(0.6188rem,2.86vw,0.6875rem)] leading-normal pt-0.5", tokens.text.mutedAlt)}>
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
                  <div className="px-6 py-4 rounded-2xl bg-slate-950 shadow-xl font-mono font-bold text-2xl tracking-[0.2em] text-indigo-400 light_sakura:bg-white light_sakura:text-rose-500 border border-slate-800 light_sakura:border-rose-150 flex items-center justify-center gap-3">
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
                  <div className={cx("flex items-center gap-2 font-sans text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-semibold uppercase tracking-wider", tokens.text.muted)}>
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

      <Modal
        isOpen={isUnlinkModalOpen}
        title={t("confirm.unlink_telegram_title")}
        description={t("confirm.unlink_telegram_desc")}
        type="danger"
        confirmLabel={t("settings.btn_unlink")}
        cancelLabel={t("common.cancel")}
        onConfirm={executeUnlinkTelegram}
        onCancel={() => { audioFeedback.playClick(); setIsUnlinkModalOpen(false); }}
      />

      <PremiumModal
        isOpen={isPremiumOpen}
        onClose={() => setIsPremiumOpen(false)}
        onPremiumActivated={() => { refreshPremium(); }}
      />
    </MobileSettingsDetailPage>
  );
};
