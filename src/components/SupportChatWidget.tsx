import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageCircle, X, Send, Loader2, XCircle, Bot, UserRound } from "lucide-react";
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
  const faqEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    faqEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [faqBubbles]);

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
        className="fixed bottom-24 sm:bottom-32 right-6 z-30 flex items-center justify-center w-14 h-14 rounded-full bg-indigo-600 text-white shadow-2xl shadow-indigo-900/40 hover:bg-indigo-500 transition-colors duration-200 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400 light_sakura:shadow-rose-900/20"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
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
            <div className="px-4 py-3.5 border-b border-slate-800 light_sakura:border-rose-100 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-400 light_sakura:from-rose-500 light_sakura:to-rose-300 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-600/20 light_sakura:shadow-rose-500/20">
                <Bot size={18} className="text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-sans font-bold text-sm text-slate-100 light_sakura:text-slate-900 truncate">
                  {t("support.title")}
                </h3>
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400 light_sakura:text-emerald-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]" />
                  {t("support.widget_status")}
                </p>
              </div>
            </div>

            <div className="flex gap-5 px-4 border-b border-slate-800 light_sakura:border-rose-100">
              <button
                type="button"
                onClick={() => setTab("faq")}
                className={`relative pb-2.5 pt-3 text-xs font-bold transition-colors duration-200 ${
                  tab === "faq" ? "text-white light_sakura:text-slate-900" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {t("support.tabs.faq")}
                {tab === "faq" && (
                  <motion.span
                    layoutId="supportTabIndicator"
                    className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-indigo-500 light_sakura:bg-rose-500"
                  />
                )}
              </button>
              <button
                type="button"
                onClick={() => setTab("admin")}
                className={`relative pb-2.5 pt-3 text-xs font-bold transition-colors duration-200 ${
                  tab === "admin" ? "text-white light_sakura:text-slate-900" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {t("support.tabs.admin")}
                {tab === "admin" && (
                  <motion.span
                    layoutId="supportTabIndicator"
                    className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-indigo-500 light_sakura:bg-rose-500"
                  />
                )}
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {tab === "faq" && (
                <>
                  {/* Bot greeting bubble */}
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-600 to-indigo-400 light_sakura:from-rose-500 light_sakura:to-rose-300 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot size={12} className="text-white" />
                    </div>
                    <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-tl-md text-xs leading-relaxed bg-slate-800 text-slate-100 light_sakura:bg-rose-50 light_sakura:text-slate-700">
                      {t("support.faq.bot_greeting")}
                    </div>
                  </div>

                  {/* Topik -- digeser horizontal supaya tidak makan tinggi panel & terasa seperti quick-reply chat */}
                  <div
                    className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4"
                    style={{ scrollbarWidth: "none" }}
                  >
                    {SUPPORT_FAQ_TOPICS.map((topic) => (
                      <button
                        key={topic.key}
                        type="button"
                        onClick={() => handleFaqTopicClick(topic.key)}
                        className="shrink-0 whitespace-nowrap px-3.5 py-2 rounded-full text-xs font-semibold bg-slate-800 border border-slate-700/60 text-slate-200 hover:bg-slate-700 hover:border-indigo-500/40 transition-colors duration-200 light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-700 light_sakura:hover:bg-rose-50"
                      >
                        {t(`support.faq.topics.${topic.key}.label`)}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-col gap-2 mt-1">
                    {faqBubbles.map((bubble) =>
                      bubble.role === "user" ? (
                        <div
                          key={bubble.id}
                          className="self-end max-w-[85%] px-3 py-2 rounded-2xl rounded-br-md text-xs leading-relaxed bg-indigo-600 text-white light_sakura:bg-rose-500"
                        >
                          {bubble.text}
                        </div>
                      ) : (
                        <div key={bubble.id} className="flex items-start gap-2 self-start max-w-[85%]">
                          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-600 to-indigo-400 light_sakura:from-rose-500 light_sakura:to-rose-300 flex items-center justify-center shrink-0 mt-0.5">
                            <Bot size={12} className="text-white" />
                          </div>
                          <div className="px-3 py-2 rounded-2xl rounded-tl-md text-xs leading-relaxed bg-slate-800 text-slate-100 light_sakura:bg-rose-50 light_sakura:text-slate-700">
                            {bubble.text}
                          </div>
                        </div>
                      )
                    )}
                    <div ref={faqEndRef} />
                  </div>
                </>
              )}

              {tab === "admin" && (
                <>
                  {!session && (
                    <div className="flex flex-col gap-3 py-1">
                      <div className="flex items-start gap-2">
                        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-600 to-indigo-400 light_sakura:from-rose-500 light_sakura:to-rose-300 flex items-center justify-center shrink-0 mt-0.5">
                          <Bot size={12} className="text-white" />
                        </div>
                        <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-tl-md text-xs leading-relaxed bg-slate-800 text-slate-100 light_sakura:bg-rose-50 light_sakura:text-slate-700">
                          {t("support.admin_chat.handoff_message")}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 light_sakura:bg-rose-50/60 light_sakura:border-rose-100">
                        <div className="relative w-11 h-11 rounded-full bg-gradient-to-br from-indigo-600 to-indigo-400 light_sakura:from-rose-500 light_sakura:to-rose-300 flex items-center justify-center shrink-0">
                          <UserRound size={20} className="text-white" />
                          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-slate-900 light_sakura:border-white" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-100 light_sakura:text-slate-900 truncate">
                            {t("support.admin_chat.identity_name")}
                          </p>
                          <p className="text-[11px] font-medium text-emerald-400 light_sakura:text-emerald-600">
                            {t("support.admin_chat.identity_status")}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleStartSession}
                        disabled={isStarting}
                        className="w-full py-2.5 rounded-full bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 transition-colors duration-200 disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400 light_sakura:shadow-rose-500/20"
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
                                ? "self-end rounded-br-md bg-indigo-600 text-white light_sakura:bg-rose-500"
                                : "self-start rounded-tl-md bg-slate-800 text-slate-100 light_sakura:bg-rose-50 light_sakura:text-slate-700"
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
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-500 transition-colors duration-200 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400"
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
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-500 transition-colors duration-200 disabled:opacity-60 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400"
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
