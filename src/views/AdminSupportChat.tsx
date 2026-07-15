import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { useAdmin } from "../hooks/useAdmin";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { Modal } from "../components/Modal";
import { audioFeedback } from "../lib/audio";
import { useThemeTokens } from "../hooks/useThemeTokens";
import {
  MessagesSquare,
  Send,
  Loader2,
  XCircle,
  RefreshCw,
  UserRound,
} from "lucide-react";

/**
 * Dashboard live chat admin di dalam Admin Panel.
 *
 * Kenapa ini ada: sebelumnya SATU-SATUNYA cara admin membalas sesi chat
 * adalah lewat Telegram (reply ke pesan yang di-forward), yang berarti:
 *   - Admin tidak punya cara melihat "ada berapa sesi aktif sekarang"
 *     selain scroll histori Telegram.
 *   - Kalau ada 2+ sesi aktif bersamaan, salah reply ke pesan yang salah
 *     di Telegram akan mengirim balasan ke sesi/user yang KELIRU tanpa
 *     peringatan apapun.
 *
 * Panel ini menampilkan semua sesi open/claimed dalam satu layar (via RPC
 * `admin_list_support_sessions`) dan admin bisa balas langsung dari sini
 * (via RPC `admin_reply_support_session`) -- jalur balas dari Telegram
 * TETAP berfungsi seperti biasa (dua jalur ini saling melengkapi, bukan
 * saling menggantikan).
 */

interface SessionListRow {
  id: string;
  short_code: string;
  status: "open" | "claimed";
  user_id: string;
  user_display_name: string | null;
  user_email: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender: "user" | "admin" | null;
  message_count: number;
}

interface MessageRow {
  id: string;
  sender: "user" | "admin";
  content: string;
  created_at: string;
}

function formatRelativeTime(iso: string | null, t: (k: string) => string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("error_monitor.just_now");
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function formatMsgTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(locale === "id" ? "id-ID" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const AdminSupportChat: React.FC = () => {
  const { t, locale } = useLanguage();
  const { showToast } = useToast();
  const { isAdmin } = useAdmin();
  const { tokens, cx } = useThemeTokens();

  const [sessions, setSessions] = useState<SessionListRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replyInput, setReplyInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedSession = sessions.find((s) => s.id === selectedId) || null;

  const loadSessions = useCallback(async () => {
    setListError(false);
    try {
      const { data, error } = await supabase.rpc("admin_list_support_sessions");
      if (error) throw error;
      setSessions((data as SessionListRow[]) || []);
    } catch (err: any) {
      console.error("[AdminSupportChat] loadSessions error:", err);
      setListError(true);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    loadSessions();
  }, [isAdmin, loadSessions]);

  // Realtime: sesi baru / pesan baru dari MANAPUN akan me-refresh daftar
  // sesi (biar "sesi mana yang paling baru dibalas" & badge status selalu
  // ter-update tanpa admin harus manual refresh).
  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel("admin-support-sessions-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_sessions" }, () => {
        loadSessions();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, () => {
        loadSessions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, loadSessions]);

  // Load histori pesan + subscribe realtime KHUSUS sesi yang sedang dibuka
  // -- filter ketat by session_id supaya pesan sesi lain tidak ikut nyasar
  // ke jendela chat yang sedang dibuka admin.
  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }

    let isMounted = true;
    setMessagesLoading(true);

    const loadMessages = async () => {
      const { data, error } = await supabase
        .from("support_messages")
        .select("id, sender, content, created_at")
        .eq("session_id", selectedId)
        .order("created_at", { ascending: true });
      if (!error && data && isMounted) {
        setMessages(data as MessageRow[]);
      }
      if (isMounted) setMessagesLoading(false);
    };
    loadMessages();

    const channel = supabase
      .channel(`admin-support-session-${selectedId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages", filter: `session_id=eq.${selectedId}` },
        (payload: any) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new as MessageRow];
          });
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendReply = async () => {
    const content = replyInput.trim();
    if (!content || !selectedId) return;
    setIsSending(true);
    setReplyInput("");
    try {
      const { data, error } = await supabase.rpc("admin_reply_support_session", {
        p_session_id: selectedId,
        p_content: content,
      });
      if (error) throw error;
      if (data) {
        setMessages((prev) => (prev.some((m) => m.id === (data as MessageRow).id) ? prev : [...prev, data as MessageRow]));
      }
      audioFeedback.playChime();
      loadSessions();

      // Mirror balasan ini ke topic Telegram sesi yang bersangkutan, supaya
      // riwayat di web & Telegram tetap sinkron kalau admin pakai keduanya
      // bergantian. Best-effort: kalau ini gagal, pesan TETAP tersimpan
      // (sudah masuk lewat RPC di atas) -- cuma tidak muncul di Telegram,
      // jadi tidak perlu memblokir UI atau menampilkan error yang sama
      // besarnya dengan kegagalan kirim pesan itu sendiri.
      try {
        await supabase.functions.invoke("support-bridge", {
          body: { mode: "admin_web_reply", session_id: selectedId, content },
        });
      } catch (mirrorErr) {
        console.error("[AdminSupportChat] Gagal mirror balasan ke Telegram:", mirrorErr);
      }
    } catch (err: any) {
      audioFeedback.playDullPluck();
      showToast(err.message || t("admin_support_chat.toast_error"), "error");
    } finally {
      setIsSending(false);
    }
  };

  const handleCloseSession = async () => {
    if (!selectedId) return;
    setIsConfirmCloseOpen(false);
    try {
      await supabase.rpc("close_support_session", { p_session_id: selectedId });
      await supabase.rpc("cleanup_closed_support_sessions");
      showToast(t("admin_support_chat.toast_session_closed"), "success");
      setSelectedId(null);
      loadSessions();
    } catch (err: any) {
      showToast(err.message || t("admin_support_chat.toast_error"), "error");
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={cx("p-6 md:p-8 rounded-3xl border shadow-sm", tokens.surface.card, tokens.border.default)}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className={cx("font-sans font-bold text-2xl tracking-tight flex items-center gap-2", tokens.text.primary)}>
              <MessagesSquare size={22} className={cx(tokens.icon.accent)} />
              {t("admin_support_chat.title")}
            </h1>
            <p className={cx("text-sm mt-1 max-w-xl", tokens.text.muted)}>
              {t("admin_support_chat.desc")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              audioFeedback.playClick();
              loadSessions();
            }}
            className={cx("shrink-0 flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl border border-slate-800 hover:bg-slate-800 transition-colors cursor-pointer light_sakura:border-rose-200 light_sakura:hover:bg-rose-100", tokens.text.secondary)}
          >
            <RefreshCw size={13} />
            {t("admin_support_chat.refresh")}
          </button>
        </div>
      </div>

      {/* List + Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 min-h-[520px]">
        {/* Session list */}
        <div className={cx("rounded-3xl border shadow-sm overflow-hidden flex flex-col", tokens.surface.card, tokens.border.default)}>
          {listLoading ? (
            <div className="py-16 flex items-center justify-center">
              <Loader2 className="animate-spin text-indigo-400 light_sakura:text-rose-400" size={26} />
            </div>
          ) : listError ? (
            <ErrorState onRetry={loadSessions} />
          ) : sessions.length === 0 ? (
            <EmptyState
              icon={<MessagesSquare size={40} className="text-slate-700 light_sakura:text-rose-200" />}
              title={t("admin_support_chat.list_empty_title")}
              description={t("admin_support_chat.list_empty_desc")}
            />
          ) : (
            <div className="divide-y divide-slate-800 light_sakura:divide-slate-100 overflow-y-auto max-h-[600px]">
              {sessions.map((s) => {
                const isSelected = s.id === selectedId;
                const label = s.user_display_name || t("admin_support_chat.unknown_user");
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      audioFeedback.playClick();
                      setSelectedId(s.id);
                    }}
                    className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-indigo-500/10 light_sakura:bg-rose-100/60"
                        : "hover:bg-slate-800/50 light_sakura:hover:bg-slate-50"
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-600 to-indigo-400 light_sakura:from-rose-500 light_sakura:to-rose-300 flex items-center justify-center shrink-0">
                      <UserRound size={16} className="text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={cx("text-xs font-bold truncate", tokens.text.heading)}>{label}</p>
                        <span className="text-[10px] text-slate-500 shrink-0">
                          {formatRelativeTime(s.last_message_at || s.created_at, t)}
                        </span>
                      </div>
                      <p className={cx("text-[11px] truncate mt-0.5", tokens.text.faint)}>
                        {s.last_message_preview
                          ? `${s.last_message_sender === "admin" ? "↩ " : ""}${s.last_message_preview}`
                          : `#${s.short_code}`}
                      </p>
                      <span
                        className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          s.status === "open"
                            ? "bg-amber-500/15 text-amber-400"
                            : "bg-emerald-500/15 text-emerald-400"
                        }`}
                      >
                        {s.status === "open" ? t("admin_support_chat.status_open") : t("admin_support_chat.status_claimed")}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail / thread */}
        <div className={cx("rounded-3xl border shadow-sm overflow-hidden flex flex-col", tokens.surface.card, tokens.border.default)}>
          {!selectedSession ? (
            <div className="flex-1 flex items-center justify-center p-10">
              <p className={cx("text-xs text-center max-w-[220px]", tokens.text.faint)}>
                {t("admin_support_chat.select_prompt")}
              </p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className={cx("px-5 py-4 border-b flex items-center justify-between gap-3", tokens.border.default)}>
                <div className="min-w-0">
                  <p className={cx("text-sm font-bold truncate", tokens.text.heading)}>
                    {selectedSession.user_display_name || t("admin_support_chat.unknown_user")}
                  </p>
                  <p className={cx("text-[11px]", tokens.text.faint)}>
                    #{selectedSession.short_code}
                    {selectedSession.user_email ? ` · ${selectedSession.user_email}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsConfirmCloseOpen(true)}
                  className="shrink-0 flex items-center gap-1 text-xs font-semibold text-red-400 hover:text-red-300 transition-colors duration-200"
                >
                  <XCircle size={14} />
                  {t("support.admin_chat.close_session")}
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-1.5 max-h-[460px]">
                {messagesLoading ? (
                  <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="animate-spin text-indigo-400 light_sakura:text-rose-400" size={22} />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-xs text-slate-500">{t("admin_support_chat.no_messages_yet")}</p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col max-w-[75%] ${msg.sender === "admin" ? "self-end items-end" : "self-start items-start"}`}
                    >
                      <div
                        className={`px-3.5 py-2 rounded-2xl text-xs leading-relaxed ${
                          msg.sender === "admin"
                            ? "rounded-br-md bg-indigo-600 text-white light_sakura:bg-rose-500"
                            : "rounded-tl-md bg-slate-800 text-slate-100 light_sakura:bg-slate-100 light_sakura:text-slate-700"
                        }`}
                      >
                        {msg.content}
                      </div>
                      <span className="text-[10px] text-slate-600 light_sakura:text-slate-400 mt-0.5 px-1">
                        {formatMsgTime(msg.created_at, locale)}
                      </span>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply input */}
              <div className={cx("p-3 border-t flex gap-2", tokens.border.default)}>
                <input
                  value={replyInput}
                  onChange={(e) => setReplyInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendReply()}
                  placeholder={t("admin_support_chat.reply_placeholder")}
                  disabled={isSending}
                  className={cx("flex-1 px-3.5 py-2.5 rounded-full text-xs text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 light_sakura:text-slate-800 light_sakura:focus:ring-rose-400", tokens.surface.subtle)}
                />
                <button
                  type="button"
                  onClick={handleSendReply}
                  disabled={isSending || !replyInput.trim()}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-500 transition-colors duration-200 disabled:opacity-50 shrink-0 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400"
                >
                  {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <Modal
        isOpen={isConfirmCloseOpen}
        title={t("support.admin_chat.confirm_close_title")}
        description={t("support.admin_chat.confirm_close_desc")}
        type="warning"
        confirmLabel={t("support.admin_chat.close_session")}
        cancelLabel={t("common.cancel")}
        onConfirm={handleCloseSession}
        onCancel={() => setIsConfirmCloseOpen(false)}
      />
    </div>
  );
};
