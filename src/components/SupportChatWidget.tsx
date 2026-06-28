import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageCircle, X, Send, ShieldCheck, Loader2, XCircle } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { matchSupportFaqTopic, SUPPORT_FAQ_TOPICS } from "../lib/supportFaq";
import { Modal } from "./Modal";

type WidgetTab = "faq" | "admin";

interface FaqBubble {
  id: string;
  role: "user" | "bot";
  text: string;
}

interface SupportSessionRow {
  id: string;
  short_code: string;
  status: "open" | "claimed" | "closed";
}

interface SupportMessageRow {
  id: string;
  sender: "user" | "admin";
  content: string;
  created_at: string;
}

/**
 * Floating Action Button + panel bantuan di dashboard.
 * Tab 1 (FAQ): rule-based, jawaban dari locale lewat t(), keyword matching
 *   dari src/lib/supportFaq.ts (single source untuk daftar topik & keyword).
 * Tab 2 (Admin): live chat ke admin lewat Telegram, dijembatani Edge Function
 *   `support-bridge`. Auto-clear sesi closed dipanggil on-demand (RPC
 *   cleanup_closed_support_sessions) setiap kali tab admin dibuka.
 */
export const SupportChatWidget: React.FC = () => {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const { user } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<WidgetTab>("faq");

  // --- FAQ state ---
  const [faqBubbles, setFaqBubbles] = useState<FaqBubble[]>([]);
  const [faqInput, setFaqInput] = useState("");

  const handleFaqTopicClick = (topicKey: string) => {
    const label = t(`support.faq.topics.${topicKey}.label`);
    const answer = t(`support.faq.topics.${topicKey}.answer`);
    setFaqBubbles((prev) => [
      ...prev,
      { id: `${Date.now()}-u`, role: "user", text: label },
      { id: `${Date.now()}-b`, role: "bot", text: answer },
    ]);
  };

  const handleFaqAsk = () => {
    const text = faqInput.trim();
    if (!text) return;
    const matched = matchSupportFaqTopic(text);
    const answer = matched ? t(`support.faq.topics.${matched.key}.answer`) : t("support.faq.out_of_context");
    setFaqBubbles((prev) => [
      ...prev,
      { id: `${Date.now()}-u`, role: "user", text },
      { id: `${Date.now()}-b`, role: "bot", text: answer },
    ]);
    setFaqInput("");
  };

  // --- Admin chat state ---
  const [session, setSession] = useState<SupportSessionRow | null>(null);
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [adminInput, setAdminInput] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadExistingSession = useCallback(async () => {
    if (!user) return;
    // Auto-clear sesi closed milik user ini (on-demand, tanpa cron -- sesuai keputusan).
    await supabase.rpc("cleanup_closed_support_sessions");

    const { data, error } = await supabase
      .from("support_sessions")
      .select("id, short_code, status")
      .in("status", ["open", "claimed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      setSession(data as SupportSessionRow);
    } else {
      setSession(null);
      setMessages([]);
    }
  }, [user]);

  useEffect(() => {
    if (isOpen && tab === "admin") {
      loadExistingSession();
    }
  }, [isOpen, tab, loadExistingSession]);

  // Load histori pesan saat session tersedia, lalu subscribe realtime khusus session itu.
  useEffect(() => {
    if (!session) return;

    let isMounted = true;

    const loadMessages = async () => {
      const { data, error } = await supabase
        .from("support_messages")
        .select("id, sender, content, created_at")
        .eq("session_id", session.id)
        .order("created_at", { ascending: true });
      if (!error && data && isMounted) {
        setMessages(data as SupportMessageRow[]);
      }
    };
    loadMessages();

    // Filter ketat by session_id supaya 3 sesi paralel tidak saling bocor di client manapun.
    const channel = supabase
      .channel(`support-session-${session.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages", filter: `session_id=eq.${session.id}` },
        (payload: any) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new as SupportMessageRow];
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "support_sessions", filter: `id=eq.${session.id}` },
        (payload: any) => {
          setSession(payload.new as SupportSessionRow);
          if (payload.new.status === "closed") {
            showToast(t("support.admin_chat.session_closed_toast"), "info");
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [session?.id, showToast, t]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleStartSession = async () => {
    setIsStarting(true);
    try {
      const { data, error } = await supabase.rpc("create_support_session");
      if (error) throw error;
      setSession(data as SupportSessionRow);
    } catch (err: any) {
      showToast(err.message || t("support.admin_chat.error_send_failed"), "error");
    } finally {
      setIsStarting(false);
    }
  };

  const handleSendAdminMessage = async () => {
    const content = adminInput.trim();
    if (!content || !session) return;
    if (session.status === "closed") {
      showToast(t("support.admin_chat.error_session_closed"), "error");
      return;
    }
    setIsSending(true);
    setAdminInput("");
    try {
      const { data: invokeData, error } = await supabase.functions.invoke("support-bridge", {
        body: { mode: "user_message", session_id: session.id, content },
      });
      if (error) throw error;
      if (invokeData?.data) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === invokeData.data.id)) return prev;
          return [...prev, invokeData.data as SupportMessageRow];
        });
      }
    } catch (err: any) {
      showToast(err.message || t("support.admin_chat.error_send_failed"), "error");
    } finally {
      setIsSending(false);
    }
  };

  const handleCloseSession = async () => {
    if (!session) return;
    setIsConfirmCloseOpen(false);
    try {
      await supabase.rpc("close_support_session", { p_session_id: session.id });
      await supabase.rpc("cleanup_closed_support_sessions");
      setSession(null);
      setMessages([]);
      showToast(t("support.admin_chat.session_closed_toast"), "info");
    } catch (err: any) {
      showToast(err.message || t("support.admin_chat.error_send_failed"), "error");
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <motion.button
        type="button"
        aria-label={t("support.fab_label")}
        onClick={() => setIsOpen((prev) => !prev)}
        whileTap={{ scale: 0.92 }}
        className="fixed bottom-24 sm:bottom-32 right-6 z-40 flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500 text-white shadow-2xl shadow-emerald-900/40 hover:bg-emerald-400 transition-colors duration-200 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400 light_sakura:shadow-rose-900/20"
      >
        <AnimatePresence mode="wait" initial={false}>
          {isOpen ? (
            <motion.span key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
              <X size={24} />
            </motion.span>
          ) : (
            <motion.span key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}>
              <MessageCircle size={24} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            className="fixed z-40 bottom-44 right-4 left-4 sm:left-auto sm:bottom-52 sm:right-6 sm:w-96 max-h-[70vh] flex flex-col rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden light_sakura:bg-white light_sakura:border-rose-100"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-800 light_sakura:border-rose-100">
              <h3 className="font-sans font-bold text-sm text-slate-100 light_sakura:text-slate-900">
                {t("support.title")}
              </h3>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setTab("faq")}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-200 ${
                    tab === "faq"
                      ? "bg-emerald-500 text-white light_sakura:bg-rose-500"
                      : "bg-slate-800 text-slate-300 light_sakura:bg-rose-50 light_sakura:text-slate-600"
                  }`}
                >
                  {t("support.tabs.faq")}
                </button>
                <button
                  type="button"
                  onClick={() => setTab("admin")}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-200 ${
                    tab === "admin"
                      ? "bg-emerald-500 text-white light_sakura:bg-rose-500"
                      : "bg-slate-800 text-slate-300 light_sakura:bg-rose-50 light_sakura:text-slate-600"
                  }`}
                >
                  {t("support.tabs.admin")}
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {tab === "faq" && (
                <>
                  <p className="text-xs text-slate-400 light_sakura:text-slate-500">{t("support.faq.intro")}</p>

                  <div className="flex flex-wrap gap-2">
                    {SUPPORT_FAQ_TOPICS.map((topic) => (
                      <button
                        key={topic.key}
                        type="button"
                        onClick={() => handleFaqTopicClick(topic.key)}
                        className="px-3 py-1.5 rounded-full text-xs bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors duration-200 light_sakura:bg-rose-50 light_sakura:text-slate-700 light_sakura:hover:bg-rose-100"
                      >
                        {t(`support.faq.topics.${topic.key}.label`)}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-col gap-2 mt-1">
                    {faqBubbles.map((bubble) => (
                      <div
                        key={bubble.id}
                        className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                          bubble.role === "user"
                            ? "self-end bg-emerald-500 text-white light_sakura:bg-rose-500"
                            : "self-start bg-slate-800 text-slate-100 light_sakura:bg-rose-50 light_sakura:text-slate-700"
                        }`}
                      >
                        {bubble.text}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {tab === "admin" && (
                <>
                  {!session && (
                    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
                      <ShieldCheck size={32} className="text-emerald-400 light_sakura:text-rose-400" />
                      <p className="text-xs text-slate-400 light_sakura:text-slate-500">{t("support.admin_chat.intro")}</p>
                      <button
                        type="button"
                        onClick={handleStartSession}
                        disabled={isStarting}
                        className="px-4 py-2 rounded-full bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-400 transition-colors duration-200 disabled:opacity-60 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400"
                      >
                        {isStarting ? <Loader2 size={14} className="animate-spin" /> : t("support.admin_chat.start_button")}
                      </button>
                    </div>
                  )}

                  {session && (
                    <>
                      <div className="flex items-center justify-between text-xs text-slate-400 light_sakura:text-slate-500">
                        <span>
                          {session.status === "claimed"
                            ? t("support.admin_chat.claimed_by_admin")
                            : session.status === "closed"
                            ? t("support.admin_chat.session_closed")
                            : t("support.admin_chat.waiting_admin")}
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsConfirmCloseOpen(true)}
                          className="flex items-center gap-1 text-red-400 hover:text-red-300 transition-colors duration-200"
                        >
                          <XCircle size={14} />
                          {t("support.admin_chat.close_session")}
                        </button>
                      </div>

                      <div className="flex flex-col gap-2 mt-1">
                        {messages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                              msg.sender === "user"
                                ? "self-end bg-emerald-500 text-white light_sakura:bg-rose-500"
                                : "self-start bg-slate-800 text-slate-100 light_sakura:bg-rose-50 light_sakura:text-slate-700"
                            }`}
                          >
                            {msg.content}
                          </div>
                        ))}
                        <div ref={messagesEndRef} />
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Footer input */}
            {tab === "faq" && (
              <div className="p-3 border-t border-slate-800 flex gap-2 light_sakura:border-rose-100">
                <input
                  value={faqInput}
                  onChange={(e) => setFaqInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleFaqAsk()}
                  placeholder={t("support.faq.ask_placeholder")}
                  className="flex-1 px-3 py-2 rounded-full bg-slate-800 text-xs text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500 light_sakura:bg-rose-50 light_sakura:text-slate-800 light_sakura:focus:ring-rose-400"
                />
                <button
                  type="button"
                  onClick={handleFaqAsk}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-emerald-500 text-white hover:bg-emerald-400 transition-colors duration-200 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400"
                >
                  <Send size={16} />
                </button>
              </div>
            )}

            {tab === "admin" && session && session.status !== "closed" && (
              <div className="p-3 border-t border-slate-800 flex gap-2 light_sakura:border-rose-100">
                <input
                  value={adminInput}
                  onChange={(e) => setAdminInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendAdminMessage()}
                  placeholder={t("support.admin_chat.placeholder")}
                  disabled={isSending}
                  className="flex-1 px-3 py-2 rounded-full bg-slate-800 text-xs text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 light_sakura:bg-rose-50 light_sakura:text-slate-800 light_sakura:focus:ring-rose-400"
                />
                <button
                  type="button"
                  onClick={handleSendAdminMessage}
                  disabled={isSending}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-emerald-500 text-white hover:bg-emerald-400 transition-colors duration-200 disabled:opacity-60 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400"
                >
                  {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal konfirmasi tutup sesi -- WAJIB sesuai aturan UX §8.1 untuk aksi yang mengubah data */}
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
    </>
  );
};
