import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { useAdmin } from "../hooks/useAdmin";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { Send, Users, MessageSquare, AlertTriangle, Bell } from "lucide-react";

type BroadcastChannel = "telegram" | "push" | "both";

interface ChannelResult {
  successCount: number;
  failCount: number;
}

export const AdminBroadcast: React.FC = () => {
  const { showToast } = useToast();
  const { t } = useLanguage();
  const { isAdmin } = useAdmin();
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [channel, setChannel] = useState<BroadcastChannel>("telegram");
  const [linkedCount, setLinkedCount] = useState<number | null>(null);
  const [pushTokenCount, setPushTokenCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{
    telegram?: ChannelResult;
    push?: ChannelResult;
  } | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    const load = async () => {
      try {
        const [chatResult, pushResult] = await Promise.all([
          supabase.rpc("admin_get_telegram_chat_ids"),
          supabase.rpc("admin_get_push_tokens"),
        ]);
        setLinkedCount(chatResult.data?.length ?? 0);
        setPushTokenCount(pushResult.data?.length ?? 0);
      } catch (err) {
        console.error("Error loading broadcast targets:", err);
      }
    };
    load();
  }, [isAdmin]);

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
          const res = await fetch("/api/admin/broadcast-telegram", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${jwtToken}`,
            },
            body: JSON.stringify({ message: message.trim() }),
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
          const res = await fetch("/api/admin/broadcast-push", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${jwtToken}`,
            },
            body: JSON.stringify({
              title: title.trim() || "E-Wallet Kita",
              message: message.trim(),
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
      <div className="bg-slate-900 light_sakura:bg-white p-8 rounded-3xl border border-slate-800 light_sakura:border-slate-100 shadow-sm space-y-6">
        {/* Header inside Card Container */}
        <div className="border-b border-slate-800 light_sakura:border-slate-100 pb-5">
          <h1 className="font-sans font-bold text-2xl tracking-tight text-white light_sakura:text-slate-900 flex items-center gap-2">
            <Send className="text-indigo-500" size={24} />
            {t("admin.broadcast_title")}
          </h1>
          <p className="text-sm text-slate-400 light_sakura:text-slate-500 mt-1">
            {t("admin.broadcast_desc")}
          </p>
        </div>

        {/* Channel selector */}
        <div>
          <label className="block text-sm font-medium text-slate-300 light_sakura:text-slate-700 mb-3">
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
          <p className="text-xs text-slate-400 light_sakura:text-slate-500 mt-2">
            {t("admin.channel_help_text")}
          </p>
        </div>

        {/* Recipient count indicators */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 flex items-center gap-3 px-6 py-4 rounded-2xl bg-slate-800 light_sakura:bg-slate-50 border border-slate-700 light_sakura:border-slate-100">
            <Users className="text-indigo-500 shrink-0" size={24} />
            <div>
              <p className="text-sm font-semibold text-white light_sakura:text-slate-800">
                {linkedCount === null ? t("admin.loading") : t("admin.connected_users", { count: linkedCount })}
              </p>
              <p className="text-xs text-slate-400 light_sakura:text-slate-500">
                {t("admin.connected_users_desc")}
              </p>
            </div>
          </div>
          <div className="flex-1 flex items-center gap-3 px-6 py-4 rounded-2xl bg-slate-800 light_sakura:bg-slate-50 border border-slate-700 light_sakura:border-slate-100">
            <Bell className="text-indigo-500 shrink-0" size={24} />
            <div>
              <p className="text-sm font-semibold text-white light_sakura:text-slate-800">
                {pushTokenCount === null ? t("admin.loading") : t("admin.push_users_count", { count: pushTokenCount })}
              </p>
              <p className="text-xs text-slate-400 light_sakura:text-slate-500">
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
            <label className="block text-sm font-medium text-slate-300 light_sakura:text-slate-700 mb-2 flex items-center gap-2">
              <Bell size={16} /> Push Title
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="E-Wallet Kita"
              maxLength={100}
              className="w-full px-4 py-3 rounded-2xl text-sm bg-slate-800 light_sakura:bg-slate-50 border border-slate-700 light_sakura:border-slate-200 text-white light_sakura:text-slate-900 placeholder-slate-500 focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        )}

        {/* Body Input */}
        <div>
          <label className="block text-sm font-medium text-slate-300 light_sakura:text-slate-700 mb-2 flex items-center gap-2">
            <MessageSquare size={16} /> {t("admin.message_body_label")}
          </label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value.slice(0, maxChar))}
            rows={6}
            placeholder={t("admin.message_placeholder")}
            className="w-full px-4 py-3 rounded-2xl text-sm bg-slate-800 light_sakura:bg-slate-50 border border-slate-700 light_sakura:border-slate-200 text-white light_sakura:text-slate-900 placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 resize-none leading-relaxed"
          />
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-slate-400 light_sakura:text-slate-500">
              {t("admin.markdown_hint")}
            </p>
            <p className={`text-xs font-semibold ${charCount > maxChar * 0.9 ? "text-amber-500 light_sakura:text-amber-600" : "text-slate-400 light_sakura:text-slate-500"}`}>
              {charCount}/{maxChar}
            </p>
          </div>
        </div>

        {/* Live Preview */}
        {message.trim().length > 0 && (
          <div className="rounded-2xl border border-slate-700 light_sakura:border-slate-100 bg-slate-800 light_sakura:bg-slate-50 p-6">
            <p className="text-xs font-semibold text-slate-400 light_sakura:text-slate-500 mb-3 uppercase tracking-wider">{t("admin.preview_label")}</p>
            <div className="text-sm text-slate-200 light_sakura:text-slate-700 whitespace-pre-wrap leading-relaxed font-mono">
              📢 <strong>Pesan dari Admin E-Wallet Kita</strong>{"\n\n"}
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
                📨 Telegram → {t("admin.broadcast_success_report", { success: lastResult.telegram.successCount, failed: lastResult.telegram.failCount })}
              </div>
            )}
            {lastResult.push && (
              <div className={`rounded-2xl border px-6 py-4 text-sm font-semibold
                ${lastResult.push.failCount === 0
                  ? "bg-emerald-900/20 light_sakura:bg-emerald-50 border-emerald-800/50 light_sakura:border-emerald-100 text-emerald-300 light_sakura:text-emerald-700"
                  : "bg-amber-900/20 light_sakura:bg-amber-50 border-amber-800/50 light_sakura:border-amber-100 text-amber-300 light_sakura:text-amber-700"}`}>
                🔔 Push → {t("admin.push_broadcast_result", { success: lastResult.push.successCount, failed: lastResult.push.failCount })}
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
