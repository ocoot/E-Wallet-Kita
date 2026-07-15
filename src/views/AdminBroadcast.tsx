import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { useAdmin } from "../hooks/useAdmin";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { Send, Users, MessageSquare, AlertTriangle, Bell, RefreshCw } from "lucide-react";

type BroadcastChannel = "telegram" | "push" | "both";

interface ChannelResult {
  successCount: number;
  failCount: number;
}

export const AdminBroadcast: React.FC = () => {
  const { showToast } = useToast();
  const { t } = useLanguage();
  const { isAdmin } = useAdmin();
  const { tokens, cx } = useThemeTokens();
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [channel, setChannel] = useState<BroadcastChannel>("telegram");
  const [isUpdateNotif, setIsUpdateNotif] = useState(false);
  const [linkedCount, setLinkedCount] = useState<number | null>(null);
  const [pushTokenCount, setPushTokenCount] = useState<number | null>(null);
  const [targetsError, setTargetsError] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{
    telegram?: ChannelResult;
    push?: ChannelResult;
  } | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    loadTargetCounts();
  }, [isAdmin]);

  const loadTargetCounts = async () => {
    setTargetsError(false);
    try {
      const [chatResult, pushResult] = await Promise.all([
        supabase.rpc("admin_get_telegram_chat_ids"),
        supabase.rpc("admin_get_push_tokens"),
      ]);
      setLinkedCount(chatResult.data?.length ?? 0);
      setPushTokenCount(pushResult.data?.length ?? 0);
    } catch (err) {
      console.error("Error loading broadcast targets:", err);
      setTargetsError(true);
    }
  };

  const handleSend = async () => {
    if (message.trim().length < 5) {
      showToast(t("toast.error_general"), "error");
      return;
    }

    setSending(true);
    setLastResult(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const jwtToken = sessionData.session?.access_token;
      if (!jwtToken) throw new Error("Sesi tidak ditemukan");

      const results: { telegram?: ChannelResult; push?: ChannelResult } = {};

      if (channel === "telegram" || channel === "both") {
        try {
          const res = await fetch("/api/admin/broadcast", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${jwtToken}`,
            },
            body: JSON.stringify({ channel: "telegram", message: message.trim() }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Broadcast Telegram gagal");
          results.telegram = { successCount: json.successCount, failCount: json.failCount };
        } catch (err: any) {
          results.telegram = { successCount: 0, failCount: linkedCount ?? 0 };
          console.error("Telegram broadcast failed:", err);
        }
      }

      if (channel === "push" || channel === "both") {
        try {
          const res = await fetch("/api/admin/broadcast", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${jwtToken}`,
            },
            body: JSON.stringify({
              channel: "push",
              title: title.trim() || "E-Wallet Kita",
              message: message.trim(),
              ...(isUpdateNotif ? { data: { type: "app_update" } } : {}),
            }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Broadcast Push gagal");
          results.push = { successCount: json.successCount, failCount: json.failCount };
        } catch (err: any) {
          results.push = { successCount: 0, failCount: pushTokenCount ?? 0 };
          console.error("Push broadcast failed:", err);
        }
      }

      setLastResult(results);

      // Show a summary toast
      const parts: string[] = [];
      const allOk =
        (!results.telegram || results.telegram.failCount === 0) &&
        (!results.push || results.push.failCount === 0);

      if (results.telegram) {
        parts.push(
          `Telegram: ${results.telegram.successCount}/${results.telegram.successCount + results.telegram.failCount} ${t("admin.broadcast_success_report", { success: results.telegram.successCount, failed: results.telegram.failCount }).toLowerCase()}`
        );
      }
      if (results.push) {
        parts.push(
          `Push: ${results.push.successCount}/${results.push.successCount + results.push.failCount}`
        );
      }
      showToast(parts.join(" | "), allOk ? "success" : "error");

      if (channel !== "both") {
        setMessage("");
        setTitle("");
        setIsUpdateNotif(false);
      }
    } catch (err: any) {
      showToast(err.message || "Broadcast gagal", "error");
    } finally {
      setSending(false);
    }
  };

  const charCount = message.length;
  const maxChar = 1000;
  const showPushTitle = channel === "push" || channel === "both";

  const effectiveCount =
    channel === "telegram" ? linkedCount :
    channel === "push" ? pushTokenCount :
    (linkedCount ?? 0) + (pushTokenCount ?? 0);

  return (
    <div className="space-y-6">
      <div className={cx("p-8 rounded-3xl border shadow-sm space-y-6", tokens.surface.card, tokens.border.default)}>
        {/* Header inside Card Container */}
        <div className={cx("border-b pb-5", tokens.border.default)}>
          <h1 className={cx("font-sans font-bold text-2xl tracking-tight flex items-center gap-2", tokens.text.primary)}>
            <Send className="text-indigo-500" size={24} />
            {t("admin.broadcast_title")}
          </h1>
          <p className={cx("text-sm mt-1", tokens.text.muted)}>
            {t("admin.broadcast_desc")}
          </p>
        </div>

        {/* Channel selector */}
        <div>
          <label className={cx("block text-sm font-medium mb-3", tokens.text.secondary)}>
            {t("admin.broadcast_target_label")}
          </label>
          <div className="flex gap-2">
            {(["telegram", "push", "both"] as BroadcastChannel[]).map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => setChannel(ch)}
                className={`flex-1 flex flex-col items-center gap-1 px-4 py-3 rounded-2xl text-sm font-semibold transition-all cursor-pointer
                  ${channel === ch
                    ? "bg-indigo-600 text-white shadow-md"
                    : "bg-slate-800 light_sakura:bg-slate-100 text-slate-300 light_sakura:text-slate-600 border border-slate-700 light_sakura:border-slate-200 hover:bg-slate-700 light_sakura:hover:bg-slate-200"
                  }`}
              >
                <span>{t(`admin.${ch}_channel_label`)}</span>
                <span className={`text-xs ${channel === ch ? "text-indigo-200" : "text-slate-400"}`}>
                  {ch === "telegram"
                    ? (linkedCount === null ? "..." : `${linkedCount} chats`)
                    : ch === "push"
                    ? (pushTokenCount === null ? "..." : `${pushTokenCount} devices`)
                    : `${(linkedCount ?? 0)+(pushTokenCount ?? 0)} total`}
                </span>
              </button>
            ))}
          </div>
          <p className={cx("text-xs mt-2", tokens.text.muted)}>
            {t("admin.channel_help_text")}
          </p>
        </div>

        {/* Shortcut: prefill push broadcast untuk beritahu ada versi baru.
            Ini melengkapi dialog UpdatePrompt di web — kalau user sedang
            tidak membuka app, mereka tetap dapat notifikasi lewat push. */}
        <button
          type="button"
          onClick={() => {
            setChannel("push");
            setTitle(t("admin.update_notif_title_default"));
            setMessage(t("admin.update_notif_message_default"));
            setIsUpdateNotif(true);
          }}
          className="w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl border border-dashed border-indigo-500/40 bg-indigo-500/5 hover:bg-indigo-500/10 text-left transition-colors cursor-pointer"
        >
          <div className="p-2 rounded-xl bg-indigo-500/15 text-indigo-400 shrink-0">
            <RefreshCw size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-indigo-300">
              {t("admin.update_notif_btn")}
            </p>
            <p className={cx("text-xs truncate", tokens.text.muted)}>
              {t("admin.update_notif_hint")}
            </p>
          </div>
        </button>

        {/* Recipient count indicators */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className={cx("flex-1 flex items-center gap-3 px-6 py-4 rounded-2xl border border-slate-700 light_sakura:border-slate-100", tokens.surface.subtle)}>
            <Users className="text-indigo-500 shrink-0" size={24} />
            <div>
              <p className={cx("text-sm font-semibold", tokens.text.onSurface)}>
                {targetsError ? (
                  <button onClick={loadTargetCounts} className="text-red-400 hover:underline">{t("common.retry")}</button>
                ) : linkedCount === null ? t("admin.loading") : t("admin.connected_users", { count: linkedCount })}
              </p>
              <p className={cx("text-xs", tokens.text.muted)}>
                {t("admin.connected_users_desc")}
              </p>
            </div>
          </div>
          <div className={cx("flex-1 flex items-center gap-3 px-6 py-4 rounded-2xl border border-slate-700 light_sakura:border-slate-100", tokens.surface.subtle)}>
            <Bell className="text-indigo-500 shrink-0" size={24} />
            <div>
              <p className={cx("text-sm font-semibold", tokens.text.onSurface)}>
                {targetsError ? (
                  <button onClick={loadTargetCounts} className="text-red-400 hover:underline">{t("common.retry")}</button>
                ) : pushTokenCount === null ? t("admin.loading") : t("admin.push_users_count", { count: pushTokenCount })}
              </p>
              <p className={cx("text-xs", tokens.text.muted)}>
                {t("admin.connected_users_desc")}
              </p>
            </div>
          </div>
        </div>

        {/* Warnings */}
        <div className="flex items-start gap-3 px-6 py-4 rounded-2xl bg-amber-900/20 light_sakura:bg-amber-50 border border-amber-800/50 light_sakura:border-amber-100">
          <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
          <p className="text-xs text-amber-200 light_sakura:text-amber-700">
            {t("admin.broadcast_warning")}
          </p>
        </div>

        {/* Push title input (only for push/both channels) */}
        {showPushTitle && (
          <div>
            <label className={cx("block text-sm font-medium mb-2 flex items-center gap-2", tokens.text.secondary)}>
              <Bell size={16} /> Push Title
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="E-Wallet Kita"
              maxLength={100}
              className={cx("w-full px-4 py-3 rounded-2xl text-sm border placeholder-slate-500 focus:ring-2 focus:ring-indigo-500", tokens.text.primary, tokens.surface.subtle, tokens.border.strong)}
            />
          </div>
        )}

        {/* Body Input */}
        <div>
          <label className={cx("block text-sm font-medium mb-2 flex items-center gap-2", tokens.text.secondary)}>
            <MessageSquare size={16} /> {t("admin.message_body_label")}
          </label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value.slice(0, maxChar))}
            rows={6}
            placeholder={t("admin.message_placeholder")}
            className={cx("w-full px-4 py-3 rounded-2xl text-sm border placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 resize-none leading-relaxed", tokens.text.primary, tokens.surface.subtle, tokens.border.strong)}
          />
          <div className="flex items-center justify-between mt-2">
            <p className={cx("text-xs", tokens.text.muted)}>
              {t("admin.markdown_hint")}
            </p>
            <p className={`text-xs font-semibold ${charCount > maxChar * 0.9 ? "text-amber-500 light_sakura:text-amber-600" : "text-slate-400 light_sakura:text-slate-500"}`}>
              {charCount}/{maxChar}
            </p>
          </div>
        </div>

        {/* Live Preview */}
        {message.trim().length > 0 && (
          <div className={cx("rounded-2xl border border-slate-700 light_sakura:border-slate-100 p-6", tokens.surface.subtle)}>
            <p className={cx("text-xs font-semibold mb-3 uppercase tracking-wider", tokens.text.muted)}>{t("admin.preview_label")}</p>
            <div className="text-sm text-slate-200 light_sakura:text-slate-700 whitespace-pre-wrap leading-relaxed font-mono">
             <strong>Pesan dari Admin E-Wallet Kita</strong>{"\n\n"}
              {message.trim()}{"\n\n"}
              <em>— Tim E-Wallet Kita</em>
            </div>
          </div>
        )}

        {/* Trigger button */}
        <button
          disabled={sending || message.trim().length < 5 || (effectiveCount ?? 0) === 0}
          onClick={handleSend}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-semibold text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          <Send size={18} />
          {sending
            ? t("admin.sending_broadcast")
            : channel === "telegram"
            ? t("admin.send_broadcast_btn", { count: linkedCount ?? 0 })
            : channel === "push"
            ? t("admin.send_push_broadcast_btn", { count: pushTokenCount ?? 0 })
            : t("admin.send_both_broadcast_btn", { telegramCount: linkedCount ?? 0, pushCount: pushTokenCount ?? 0 })}
        </button>

        {/* Results banner */}
        {lastResult && (
          <div className="space-y-2">
            {lastResult.telegram && (
              <div className={`rounded-2xl border px-6 py-4 text-sm font-semibold
                ${lastResult.telegram.failCount === 0
                  ? "bg-emerald-900/20 light_sakura:bg-emerald-50 border-emerald-800/50 light_sakura:border-emerald-100 text-emerald-300 light_sakura:text-emerald-700"
                  : "bg-amber-900/20 light_sakura:bg-amber-50 border-amber-800/50 light_sakura:border-amber-100 text-amber-300 light_sakura:text-amber-700"}`}>
               Telegram → {t("admin.broadcast_success_report", { success: lastResult.telegram.successCount, failed: lastResult.telegram.failCount })}
              </div>
            )}
            {lastResult.push && (
              <div className={`rounded-2xl border px-6 py-4 text-sm font-semibold
                ${lastResult.push.failCount === 0
                  ? "bg-emerald-900/20 light_sakura:bg-emerald-50 border-emerald-800/50 light_sakura:border-emerald-100 text-emerald-300 light_sakura:text-emerald-700"
                  : "bg-amber-900/20 light_sakura:bg-amber-50 border-amber-800/50 light_sakura:border-amber-100 text-amber-300 light_sakura:text-amber-700"}`}>
               Push → {t("admin.push_broadcast_result", { success: lastResult.push.successCount, failed: lastResult.push.failCount })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Loading overlay for mass notifications */}
      <LoadingOverlay isOpen={sending} message={t("admin.sending_broadcast")} />
    </div>
  );
};
