import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { useAdmin } from "../hooks/useAdmin";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { Send, Users, MessageSquare, AlertTriangle } from "lucide-react";

export const AdminBroadcast: React.FC = () => {
  const { showToast } = useToast();
  const { t } = useLanguage();
  const { isAdmin } = useAdmin();
  const [message, setMessage] = useState("");
  const [linkedCount, setLinkedCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{ successCount: number; failCount: number } | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    // Count active bot-linked users via the rpc query
    const load = async () => {
      try {
        const { data } = await supabase.rpc("admin_get_telegram_chat_ids");
        setLinkedCount(data?.length ?? 0);
      } catch (err) {
        console.error("Error loaded chat IDs:", err);
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

      const res = await fetch("/api/admin/broadcast-telegram", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwtToken}`
        },
        body: JSON.stringify({ message })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Broadcast gagal");

      setLastResult({ successCount: json.successCount, failCount: json.failCount });
      showToast(
        t("admin.broadcast_success_report", { success: json.successCount, failed: json.failCount }),
        json.failCount === 0 ? "success" : "error"
      );
      setMessage("");
    } catch (err: any) {
      showToast(err.message || "Broadcast gagal", "error");
    } finally {
      setSending(false);
    }
  };

  const charCount = message.length;
  const maxChar = 1000;

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 light_sakura:bg-white p-8 rounded-3xl border border-slate-800 light_sakura:border-slate-100 shadow-sm space-y-6">
        {/* Header inside Card Container */}
        <div className="border-b border-slate-800 light_sakura:border-slate-100 pb-5">
          <h2 className="font-bold text-xl text-white light_sakura:text-slate-800 flex items-center gap-2">
            <Send className="text-indigo-500" size={24} />
            {t("admin.broadcast_title")}
          </h2>
          <p className="text-sm text-slate-400 light_sakura:text-slate-500 mt-1">
            {t("admin.broadcast_desc")}
          </p>
        </div>

        {/* Linked count indicator */}
        <div className="flex items-center gap-4 px-6 py-4 rounded-2xl bg-slate-800 light_sakura:bg-slate-50 border border-slate-700 light_sakura:border-slate-100">
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

        {/* Warnings */}
        <div className="flex items-start gap-3 px-6 py-4 rounded-2xl bg-amber-900/20 light_sakura:bg-amber-50 border border-amber-800/50 light_sakura:border-amber-100">
          <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
          <p className="text-xs text-amber-200 light_sakura:text-amber-700">
            {t("admin.broadcast_warning")}
          </p>
        </div>

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
          disabled={sending || message.trim().length < 5 || linkedCount === 0}
          onClick={handleSend}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-semibold text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          <Send size={18} />
          {sending
            ? t("admin.sending_broadcast")
            : t("admin.send_broadcast_btn", { count: linkedCount ?? 0 })}
        </button>

        {/* Results banner */}
        {lastResult && (
          <div className={`rounded-2xl border px-6 py-4 text-sm font-semibold
            ${lastResult.failCount === 0
              ? "bg-emerald-900/20 light_sakura:bg-emerald-50 border-emerald-800/50 light_sakura:border-emerald-100 text-emerald-300 light_sakura:text-emerald-700"
              : "bg-amber-900/20 light_sakura:bg-amber-50 border-amber-800/50 light_sakura:border-amber-100 text-amber-300 light_sakura:text-amber-700"}`}>
            ✅ {t("admin.broadcast_success")}: {lastResult.successCount} &nbsp;|&nbsp;
            ❌ {t("admin.broadcast_failed")}: {lastResult.failCount}
          </div>
        )}
      </div>

      {/* Loading overlay for mass notifications */}
      <LoadingOverlay isOpen={sending} message={t("admin.sending_broadcast")} />
    </div>
  );
};
