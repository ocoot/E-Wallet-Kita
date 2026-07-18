import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageCircle, X, Send, Loader2, XCircle, Bot, UserRound, LayoutDashboard, PlusCircle, History, Tags, Link2, Crown } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { matchSupportFaqTopic, SUPPORT_FAQ_TOPICS } from "../lib/supportFaq";
import { Modal } from "./Modal";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { audioFeedback } from "../lib/audio";
import { useThemeTokens } from "../hooks/useThemeTokens";

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

function formatMsgTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(locale === "id" ? "id-ID" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Ikon per topik FAQ -- murni kosmetik (scanability), tidak mengubah data/keyword matching di supportFaq.ts.
const FAQ_TOPIC_ICONS: Record<string, React.ElementType> = {
  dashboard: LayoutDashboard,
  new_transaction: PlusCircle,
  history: History,
  categories: Tags,
  telegram: Link2,
  premium: Crown,
};

/**
 * Floating Action Button + panel bantuan di dashboard.
 * Tab 1 (FAQ): rule-based, jawaban dari locale lewat t(), keyword matching
 *   dari src/lib/supportFaq.ts (single source untuk daftar topik & keyword).
 * Tab 2 (Admin): live chat ke admin lewat Telegram, dijembatani Edge Function
 *   `support-bridge`. Auto-clear sesi closed dipanggil on-demand (RPC
 *   cleanup_closed_support_sessions) setiap kali tab admin dibuka.
 */
export const SupportChatWidget: React.FC = () => {
  const { t, locale } = useLanguage();
  const { showToast } = useToast();
  const { user } = useAuth();
  const { tokens, cx } = useThemeTokens();

  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<WidgetTab>("faq");
  useLockBodyScroll(isOpen);

  // --- FAQ state ---
  const [faqBubbles, setFaqBubbles] = useState<FaqBubble[]>([]);
  const [faqInput, setFaqInput] = useState("");
  const faqEndRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const [chipScrollProgress, setChipScrollProgress] = useState(0);
  const [chipCanScroll, setChipCanScroll] = useState(false);

  const handleChipsScroll = useCallback(() => {
    const el = chipsRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setChipScrollProgress(max > 0 ? el.scrollLeft / max : 0);
  }, []);

  useEffect(() => {
    const el = chipsRef.current;
    if (!el) return;
    setChipCanScroll(el.scrollWidth - el.clientWidth > 4);
  }, [isOpen, tab]);

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

    // Dedupe id pesan admin yang sudah dibunyikan -- realtime kadang
    // mengirim ulang event yang sama (reconnect dsb), jangan sampai
    // suara notifikasi ikut bunyi dobel untuk pesan yang sama.
    const chimedMessageIds = new Set<string>();

    // Filter ketat by session_id supaya 3 sesi paralel tidak saling bocor di client manapun.
    const channel = supabase
      .channel(`support-session-${session.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages", filter: `session_id=eq.${session.id}` },
        (payload: any) => {
          const incoming = payload.new as SupportMessageRow;
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev;
            return [...prev, incoming];
          });
          // Suara notifikasi hanya untuk balasan admin (bukan echo pesan
          // sendiri) -- webpush untuk kasus ini sudah di-skip lewat flag
          // user_viewing (lihat efek di bawah), jadi suara ini yang jadi
          // sinyal utama selagi widget sedang dibuka.
          if (incoming.sender === "admin" && !chimedMessageIds.has(incoming.id)) {
            chimedMessageIds.add(incoming.id);
            audioFeedback.playChime();
          }
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

  // Laporkan ke backend apakah user SEDANG membuka widget chat untuk
  // sesi ini (tab "admin" terbuka + halaman visible) lewat kolom
  // support_sessions.user_viewing. Trigger DB notify_support_reply_push()
  // (lihat migration 20260819010000_support_reply_webpush.sql) memakai
  // flag ini untuk skip pengiriman webpush kalau user sudah pasti lihat
  // balasan admin lewat Realtime + suara chime di atas -- menghindari
  // notifikasi dobel (in-app dan push muncul bersamaan).
  useEffect(() => {
    if (!session) return;

    const setViewing = (viewing: boolean) => {
      supabase
        .rpc("set_support_session_viewing", { p_session_id: session.id, p_viewing: viewing })
        .then(({ error }: { error: any }) => {
          if (error) console.error("set_support_session_viewing error:", error);
        });
    };

    const isCurrentlyViewing = () =>
      isOpen && tab === "admin" && document.visibilityState === "visible";

    setViewing(isCurrentlyViewing());

    // Tab di-minimize/di-switch tanpa widget ditutup (isOpen tetap true)
    // tetap harus dihitung "tidak sedang dilihat", makanya visibilitychange
    // dipantau terpisah dari isOpen/tab.
    const handleVisibilityChange = () => setViewing(isCurrentlyViewing());
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Best-effort: tangkap kasus tab/app benar-benar ditutup (bukan cuma
    // di-switch) supaya flag tidak "nyangkut" true selamanya kalau cleanup
    // effect normal di bawah tidak sempat jalan.
    const handlePageHide = () => setViewing(false);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      setViewing(false);
    };
  }, [session?.id, isOpen, tab]);

  const handleStartSession = async () => {
    setIsStarting(true);
    try {
      const { data, error } = await supabase.rpc("create_support_session");
      if (error) throw error;
      // RPC dideklarasikan `RETURNS SETOF public.support_sessions`, jadi
      // supabase-js SELALU mengembalikan array (walau isinya 1 baris) --
      // bukan object tunggal. Tanpa unwrap ini, session.id/short_code jadi
      // undefined dan pesan pertama gagal terkirim (session_id null).
      const newSession = Array.isArray(data) ? data[0] : data;
      if (!newSession) throw new Error("Sesi tidak ditemukan setelah dibuat.");
      setSession(newSession as SupportSessionRow);
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
        className={cx(
          "fixed bottom-24 sm:bottom-32 right-6 z-30 flex items-center justify-center w-14 h-14 rounded-full text-white shadow-2xl transition-colors duration-200",
          tokens.supportWidget.fabButton
        )}
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

      {/* Backdrop -- blur & redupkan konten di belakang panel supaya panel tidak terasa "menimpa" begitu saja */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-[35] bg-slate-950/70 backdrop-blur-sm"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            className={cx("fixed z-40 top-20 bottom-24 left-4 right-4 sm:top-auto sm:bottom-52 sm:left-auto sm:right-6 sm:w-96 sm:max-h-[70vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden", tokens.surface.card, tokens.border.accent)}
          >
            {/* Header */}
            <div className={cx("px-4 py-3.5 border-b flex items-center gap-3", tokens.border.accent)}>
              <div className={cx(
                "relative w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-lg",
                "bg-gradient-to-br from-indigo-600 to-indigo-400 shadow-indigo-600/20 light_sakura:from-rose-500 light_sakura:to-rose-300 light_sakura:shadow-rose-500/20"
              )}>
                <Bot size={18} className="text-white" />
                <span className={cx("absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2", tokens.surface.card === "bg-slate-900 light_sakura:bg-white" ? "border-slate-900 light_sakura:border-white" : "border-slate-900")} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className={cx("font-sans font-bold text-sm truncate", tokens.text.heading)}>
                  {t("support.title")}
                </h3>
                <p className={cx("flex items-center gap-1.5 text-[11px] font-medium", tokens.text.success)}>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]" />
                  {t("support.widget_status")}
                </p>
              </div>
              {/* Tombol tutup panel -- DIBUTUHKAN karena FAB toggle di pojok
                  kanan-bawah layar (yang biasanya jadi tombol X saat panel
                  terbuka) posisinya bertumpuk PERSIS dengan sudut kanan-bawah
                  panel ini sendiri (z-index FAB lebih rendah dari panel &
                  backdrop), jadi FAB itu jadi tertutup/tidak bisa dipencet
                  selama panel terbuka. Tombol X di header ini jadi satu-nya
                  cara yang selalu terlihat & terjangkau untuk menutup panel. */}
              <button
                type="button"
                onClick={() => { audioFeedback.playClick(); setIsOpen(false); }}
                aria-label={t("common.close")}
                className={cx(
                  "shrink-0 p-1.5 -m-1.5 rounded-lg cursor-pointer transition-colors",
                  tokens.text.muted,
                  tokens.hover.surface,
                  "hover:text-white light_sakura:hover:text-slate-900"
                )}
              >
                <X size={18} />
              </button>
            </div>

            <div className={cx("flex gap-1.5 px-4 pt-3 pb-3 border-b", tokens.border.accent)}>
              <button
                type="button"
                onClick={() => setTab("faq")}
                className="relative px-3.5 py-2 rounded-lg text-xs font-bold transition-colors duration-200"
              >
                {tab === "faq" && (
                  <motion.span
                    layoutId="supportTabPill"
                    className={cx("absolute inset-0 rounded-lg ring-1 ring-inset ring-indigo-500/40 light_sakura:ring-rose-300/60", tokens.surface.subtle)}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <span className={`relative z-10 ${tab === "faq" ? tokens.text.heading : tokens.text.muted}`}>
                  {t("support.tabs.faq")}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setTab("admin")}
                className="relative px-3.5 py-2 rounded-lg text-xs font-bold transition-colors duration-200"
              >
                {tab === "admin" && (
                  <motion.span
                    layoutId="supportTabPill"
                    className={cx("absolute inset-0 rounded-lg ring-1 ring-inset ring-indigo-500/40 light_sakura:ring-rose-300/60", tokens.surface.subtle)}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <span className={`relative z-10 ${tab === "admin" ? tokens.text.heading : tokens.text.muted}`}>
                  {t("support.tabs.admin")}
                </span>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {tab === "faq" && (
                <>
                  {/* Bot greeting bubble */}
                  <div className="flex items-start gap-2">
                    <div className={cx(
                      "w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                      "bg-gradient-to-br from-indigo-600 to-indigo-400 light_sakura:from-rose-500 light_sakura:to-rose-300"
                    )}>
                      <Bot size={12} className="text-white" />
                    </div>
                    <div className={cx("max-w-[85%] px-3 py-2 rounded-2xl rounded-tl-md text-xs leading-relaxed", tokens.surface.subtle, tokens.text.secondary)}>
                      {t("support.faq.bot_greeting")}
                    </div>
                  </div>

                  {/* Topik -- digeser horizontal supaya tidak makan tinggi panel & terasa seperti quick-reply chat */}
                  <div className="relative -mx-4">
                    <div
                      ref={chipsRef}
                      onScroll={handleChipsScroll}
                      className="flex gap-2 overflow-x-auto pb-1 px-4"
                      style={{ scrollbarWidth: "none" }}
                    >
                      {SUPPORT_FAQ_TOPICS.map((topic) => {
                        const Icon = FAQ_TOPIC_ICONS[topic.key] ?? MessageCircle;
                        return (
                          <button
                            key={topic.key}
                            type="button"
                            onClick={() => handleFaqTopicClick(topic.key)}
                            className={cx(
                              "shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold border transition-colors duration-200",
                              tokens.surface.subtle,
                              tokens.border.strong,
                              tokens.text.secondary,
                              tokens.hover.surface,
                              "hover:border-indigo-500/40 light_sakura:border-rose-200"
                            )}
                          >
                            <Icon size={13} className={cx("shrink-0", tokens.icon.accent)} />
                            {t(`support.faq.topics.${topic.key}.label`)}
                          </button>
                        );
                      })}
                    </div>
                    {/* Fade di tepi kanan -- sinyal visual bahwa masih ada chip lain untuk di-scroll */}
                    {chipCanScroll && (
                    <div className="pointer-events-none absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-slate-900 light_sakura:from-white to-transparent" />
                    )}
                  </div>

                  {chipCanScroll && (
                    <div className="flex gap-1 justify-center -mt-0.5">
                      {[0, 1, 2].map((i) => {
                        const active = Math.round(chipScrollProgress * 2) === i;
                        return (
                          <span
                            key={i}
                            className={cx(
                              "h-1 rounded-full transition-all duration-200",
                              active ? "w-3.5 bg-emerald-500" : "w-1 bg-slate-700 light_sakura:bg-rose-200"
                            )}
                          />
                        );
                      })}
                    </div>
                  )}

                  <div className="flex flex-col gap-2 mt-1">
                    {faqBubbles.map((bubble) =>
                      bubble.role === "user" ? (
                        <div
                          className={cx(
                            "self-end max-w-[85%] px-3 py-2 rounded-2xl rounded-br-md text-xs leading-relaxed text-white",
                            tokens.supportWidget.chatBubbleUser
                          )}
                        >
                          {bubble.text}
                        </div>
                      ) : (
                        <div key={bubble.id} className="flex items-start gap-2 self-start max-w-[85%]">
                          <div className={cx(
                            "w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                            "bg-gradient-to-br from-indigo-600 to-indigo-400 light_sakura:from-rose-500 light_sakura:to-rose-300"
                          )}>
                            <Bot size={12} className="text-white" />
                          </div>
                          <div className={cx("px-3 py-2 rounded-2xl rounded-tl-md text-xs leading-relaxed", tokens.surface.subtle, tokens.text.secondary)}>
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
                    <div className="flex flex-col gap-2 py-1">
                      <div className="flex items-start gap-2">
                        <div className={cx(
                          "w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                          "bg-gradient-to-br from-indigo-600 to-indigo-400 light_sakura:from-rose-500 light_sakura:to-rose-300"
                        )}>
                          <Bot size={12} className="text-white" />
                        </div>
                        <div className={cx("max-w-[85%] px-3 py-2 rounded-2xl rounded-tl-md text-xs leading-relaxed", tokens.surface.subtle, tokens.text.secondary)}>
                          {t("support.admin_chat.handoff_message")}
                        </div>
                      </div>

                      {/* Kartu handoff -- pesan, identitas admin, dan CTA digabung jadi satu unit visual
                          (bukan 3 blok terpisah) supaya jelas ini satu alur yang sama. */}
                      <div className={cx("ml-8 rounded-2xl border overflow-hidden", tokens.surface.subtle, tokens.border.accent)}>
                        <div className="flex items-center gap-3 px-3.5 py-3">
                          <div className={cx(
                            "relative w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                            "bg-gradient-to-br from-indigo-600 to-indigo-400 light_sakura:from-rose-500 light_sakura:to-rose-300"
                          )}>
                            <UserRound size={18} className="text-white" />
                            <span className={cx("absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2", tokens.border.accent)} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={cx("text-xs font-bold truncate", tokens.text.heading)}>
                              {t("support.admin_chat.identity_name")}
                            </p>
                            <p className={cx("text-[11px] font-medium", tokens.text.success)}>
                              {t("support.admin_chat.identity_status")}
                            </p>
                          </div>
                        </div>

                        <div className={cx("h-px", tokens.border.accent)} />

                        <button
                          type="button"
                          onClick={handleStartSession}
                          disabled={isStarting}
                          className={cx(
                            "w-full py-3 text-white text-xs font-bold transition-colors duration-200 disabled:opacity-60 flex items-center justify-center gap-2",
                            "bg-indigo-600 hover:bg-indigo-500 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400"
                          )}
                        >
                          {isStarting ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <>
                              <MessageCircle size={14} />
                              {t("support.admin_chat.start_button")}
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {session && (
                    <>
                      <div className={cx("flex items-center justify-between text-xs", tokens.text.muted)}>
                        <span>
                          {session.status === "claimed"
                            ? t("support.admin_chat.claimed_by_admin")
                            : session.status === "closed"
                            ? t("support.admin_chat.session_closed")
                            : t("support.admin_chat.waiting_admin")}
                          <span className={cx(tokens.text.faint)}> · #{session.short_code}</span>
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

                      {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                          <p className={cx("text-xs max-w-[220px]", tokens.text.faint)}>
                            {t("support.admin_chat.prompt_first_message")}
                          </p>
                        </div>
                      ) : !messages.some((m) => m.sender === "admin") ? (
                        <div className="flex flex-col gap-1 mt-1">
                          {messages.map((msg) => (
                            <div
                              key={msg.id}
                              className={`flex flex-col max-w-[85%] ${msg.sender === "user" ? "self-end items-end" : "self-start items-start"}`}
                            >
                              <div
                                className={`px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                                  msg.sender === "user"
                                    ? "rounded-br-md bg-indigo-600 text-white light_sakura:bg-rose-500"
                                    : cx("rounded-tl-md", tokens.surface.subtle, tokens.text.secondary)
                                }`}
                              >
                                {msg.content}
                              </div>
                              <span className={cx("text-[10px] mt-0.5 px-1", tokens.text.faint)}>
                                {formatMsgTime(msg.created_at, locale)}
                              </span>
                            </div>
                          ))}
                          <div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
                            <Loader2 size={20} className={cx("animate-spin", tokens.text.accent)} />
                            <p className={cx("text-xs max-w-[220px]", tokens.text.faint)}>
                              {t("support.admin_chat.waiting_first_reply")}
                            </p>
                          </div>
                          <div ref={messagesEndRef} />
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1 mt-1">
                          {messages.map((msg) => (
                            <div
                              key={msg.id}
                              className={`flex flex-col max-w-[85%] ${msg.sender === "user" ? "self-end items-end" : "self-start items-start"}`}
                            >
                              <div
                                className={`px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                                  msg.sender === "user"
                                    ? "rounded-br-md bg-indigo-600 text-white light_sakura:bg-rose-500"
                                    : cx("rounded-tl-md", tokens.surface.subtle, tokens.text.secondary)
                                }`}
                              >
                                {msg.content}
                              </div>
                              <span className={cx("text-[10px] mt-0.5 px-1", tokens.text.faint)}>
                                {formatMsgTime(msg.created_at, locale)}
                              </span>
                            </div>
                          ))}
                          <div ref={messagesEndRef} />
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>

            {/* Footer input */}
            {tab === "faq" && (
              <div className={cx("p-3 border-t flex gap-2", tokens.border.accent)}>
                <input
                  value={faqInput}
                  onChange={(e) => setFaqInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleFaqAsk()}
                  placeholder={t("support.faq.ask_placeholder")}
                  className={cx(
                    "flex-1 px-3 py-2 rounded-full text-xs outline-none focus:ring-2 focus:ring-indigo-500 light_sakura:focus:ring-rose-400",
                    tokens.surface.subtle,
                    tokens.text.primary
                  )}
                />
                <button
                  type="button"
                  onClick={handleFaqAsk}
                  className={cx(
                    "w-9 h-9 flex items-center justify-center rounded-full text-white transition-colors duration-200",
                    "bg-indigo-600 hover:bg-indigo-500 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400"
                  )}
                >
                  <Send size={16} />
                </button>
              </div>
            )}

            {tab === "admin" && session && session.status !== "closed" && (
              <div className={cx("p-3 border-t flex gap-2", tokens.border.accent)}>
                <input
                  value={adminInput}
                  onChange={(e) => setAdminInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendAdminMessage()}
                  placeholder={t("support.admin_chat.placeholder")}
                  disabled={isSending}
                  className={cx(
                    "flex-1 px-3 py-2 rounded-full text-xs outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 light_sakura:focus:ring-rose-400",
                    tokens.surface.subtle,
                    tokens.text.primary
                  )}
                />
                <button
                  type="button"
                  onClick={handleSendAdminMessage}
                  disabled={isSending}
                  className={cx(
                    "w-9 h-9 flex items-center justify-center rounded-full text-white transition-colors duration-200 disabled:opacity-60",
                    "bg-indigo-600 hover:bg-indigo-500 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400"
                  )}
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
