import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { useAdmin } from "../hooks/useAdmin";
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
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="font-sans font-black text-lg text-white flex items-center gap-2 light_sakura:text-slate-800">
          <Send className="text-blue-400 light_sakura:text-rose-500" size={20} />
          {t("admin.broadcast_title")}
        </h2>
        <p className="text-xs text-slate-400 mt-0.5 light_sakura:text-slate-500">
          {t("admin.broadcast_desc")}
        </p>
      </div>

      {/* Linked count indicator */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-blue-500/5 border border-blue-500/20 light_sakura:bg-rose-50 light_sakura:border-rose-100">
        <Users className="text-blue-400 light_sakura:text-rose-500 shrink-0" size={18} />
        <div>
          <p className="text-xs font-bold text-blue-300 light_sakura:text-rose-600">
            {linkedCount === null ? t("admin.loading") : t("admin.connected_users", { count: linkedCount })}
          </p>
          <p className="text-[10px] text-blue-400/60 light_sakura:text-rose-500/70 font-medium">
            {t("admin.connected_users_desc")}
          </p>
        </div>
      </div>

      {/* Warnings */}
      <div className="flex items-start gap-2 px-4 py-3 rounded-2xl bg-amber-500/5 border border-amber-500/20 light_sakura:bg-amber-50 light_sakura:border-amber-100">
        <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={14} />
        <p className="text-[10px] text-amber-300/80 light_sakura:text-amber-700">
          {t("admin.broadcast_warning")}
        </p>
      </div>

      {/* Body Input */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1 light_sakura:text-slate-500">
          <MessageSquare size={10} /> {t("admin.message_body_label")}
        </label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value.slice(0, maxChar))}
          rows={6}
          placeholder={t("admin.message_placeholder")}
          className="w-full px-4 py-3 rounded-2xl text-xs bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 resize-none leading-relaxed light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-800"
        />
        <div className="flex items-center justify-between mt-1.5">
          <p className="text-[10px] text-slate-500">
            {t("admin.markdown_hint")}
          </p>
          <p className={`text-[10px] font-bold ${charCount > maxChar * 0.9 ? "text-amber-400" : "text-slate-500"}`}>
            {charCount}/{maxChar}
          </p>
        </div>
      </div>

      {/* Live Preview */}
      {message.trim().length > 0 && (
        <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 light_sakura:border-rose-100 light_sakura:bg-rose-50/40">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2 light_sakura:text-slate-500">{t("admin.preview_label")}</p>
          <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed font-mono light_sakura:text-slate-700">
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
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-sm bg-blue-500/20 border border-blue-500/30 text-blue-400 hover:bg-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors light_sakura:bg-rose-100 light_sakura:border-rose-300 light_sakura:text-rose-600"
      >
        <Send size={14} />
        {sending
          ? t("admin.sending_broadcast")
          : t("admin.send_broadcast_btn", { count: linkedCount ?? 0 })}
      </button>

      {/* Results banner */}
      {lastResult && (
        <div className={`rounded-2xl border px-4 py-3 text-xs font-bold
          ${lastResult.failCount === 0
            ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
            : "bg-amber-500/5 border-amber-500/20 text-amber-400"}`}>
          ✅ Terkirim: {lastResult.successCount} &nbsp;|&nbsp;
          ❌ Gagal: {lastResult.failCount}
        </div>
      )}
    </div>
  );
};
