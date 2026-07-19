import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageCircle, X, Send, Loader2, XCircle, Bot, UserRound, Clock, LayoutDashboard, PlusCircle, History, Tags, Link2, Crown, Paperclip, Smile, Camera, Check, CheckCheck, ImageIcon } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { matchSupportFaqTopic, SUPPORT_FAQ_TOPICS } from "../lib/supportFaq";
import { Modal } from "./Modal";
import { EmojiPicker } from "./EmojiPicker";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { audioFeedback } from "../lib/audio";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { uploadChatAttachment, AttachmentValidationError } from "../lib/chatAttachment";

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
  image_url?: string;
}

function formatMsgTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(locale === "id" ? "id-ID" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDateSeparator(iso: string, t: (k: string) => string): string {
  const msgDate = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (msgDate.toDateString() === today.toDateString()) return t("support.admin_chat.today");
  if (msgDate.toDateString() === yesterday.toDateString()) return t("support.admin_chat.yesterday");

  return msgDate.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function shouldShowDateSeparator(current: string, previous: string | null): boolean {
  if (!previous) return true;
  const curr = new Date(current);
  const prev = new Date(previous);
  return curr.toDateString() !== prev.toDateString();
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
  const [isAdminTyping, setIsAdminTyping] = useState(false);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const loadExistingSession = useCallback(async () => {
    if (!user) return;
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

  // Simulate admin typing indicator when session is claimed but no reply yet
  useEffect(() => {
    if (!session || session.status !== "claimed") {
      setIsAdminTyping(false);
      return;
    }
    const hasAdminReply = messages.some((m) => m.sender === "admin");
    if (hasAdminReply) {
      setIsAdminTyping(false);
      return;
    }
    const timer = setTimeout(() => setIsAdminTyping(true), 3000);
    const hideTimer = setTimeout(() => setIsAdminTyping(false), 12000);
    return () => {
      clearTimeout(timer);
      clearTimeout(hideTimer);
    };
  }, [session?.status, session?.id, messages.length]);

  // Load histori pesan saat session tersedia, lalu subscribe realtime khusus session itu.
  useEffect(() => {
    if (!session) return;

    let isMounted = true;

    const loadMessages = async () => {
      const { data, error } = await supabase
        .from("support_messages")
        .select("id, sender, content, created_at, image_url")
        .eq("session_id", session.id)
        .order("created_at", { ascending: true });
      if (!error && data && isMounted) {
        setMessages(data as SupportMessageRow[]);
      }
    };
    loadMessages();

    const chimedMessageIds = new Set<string>();

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

    const handleVisibilityChange = () => setViewing(isCurrentlyViewing());
    document.addEventListener("visibilitychange", handleVisibilityChange);

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
      const newSession = Array.isArray(data) ? data[0] : data;
      if (!newSession) throw new Error("Sesi tidak ditemukan setelah dibuat.");
      setSession(newSession as SupportSessionRow);
    } catch (err: any) {
      showToast(err.message || t("support.admin_chat.error_send_failed"), "error");
    } finally {
      setIsStarting(false);
    }
  };

  const [sendBtnState, setSendBtnState] = useState<"idle" | "loading" | "success">("idle");

  const handleSendAdminMessage = async () => {
    const content = adminInput.trim();
    if (!content || !session) return;
    if (session.status === "closed") {
      showToast(t("support.admin_chat.error_session_closed"), "error");
      return;
    }
    setSendBtnState("loading");
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
      setSendBtnState("success");
      setTimeout(() => setSendBtnState("idle"), 1200);
    } catch (err: any) {
      showToast(err.message || t("support.admin_chat.error_send_failed"), "error");
      setSendBtnState("idle");
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

  const lastAdminMessageTime = useMemo(() => {
    const adminMsgs = messages.filter((m) => m.sender === "admin");
    if (adminMsgs.length === 0) return null;
    return adminMsgs[adminMsgs.length - 1].created_at;
  }, [messages]);

  const adminOnline = session?.status === "claimed" || !!lastAdminMessageTime;

  const handleFileSelect = async (file: File | null) => {
    if (!file || !session || !user) return;
    setIsUploading(true);
    try {
      const url = await uploadChatAttachment(user.id, session.id, file);
      const content = url;
      setSendBtnState("loading");
      const { data: invokeData, error } = await supabase.functions.invoke("support-bridge", {
        body: { mode: "user_message", session_id: session.id, content },
      });
      if (error) throw error;
      if (invokeData?.data) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === invokeData.data.id)) return prev;
          return [...prev, { ...invokeData.data, image_url: url } as SupportMessageRow];
        });
      }
      setSendBtnState("success");
      setTimeout(() => setSendBtnState("idle"), 1200);
    } catch (err: any) {
      if (err instanceof AttachmentValidationError) {
        showToast(err.code === "TOO_LARGE" ? "File terlalu besar (maks 5 MB)" : "Format file tidak didukung", "error");
      } else {
        showToast(err.message || t("support.admin_chat.error_send_failed"), "error");
      }
      setSendBtnState("idle");
    } finally {
      setIsUploading(false);
    }
  };

  const handleAttachmentClick = () => {
    fileInputRef.current?.click();
  };

  const handleCameraClick = () => {
    cameraInputRef.current?.click();
  };

  const handleEmojiSelect = (emoji: string) => {
    setAdminInput((prev) => prev + emoji);
  };

  const isImageUrl = (text: string): boolean => {
    return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|heic|heif)(\?.*)?$/i.test(text.trim());
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
          "fixed bottom-32 sm:bottom-32 right-6 z-30 flex items-center justify-center w-14 h-14 rounded-full text-white shadow-2xl transition-colors duration-200",
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

      {/* Backdrop */}
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
          <div className="fixed inset-0 z-40 pointer-events-none sm:flex sm:items-center sm:justify-center">
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={cx("pointer-events-auto fixed sm:static top-20 bottom-32 left-4 right-4 sm:w-96 sm:max-h-[80vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden", tokens.surface.card, tokens.border.accent)}
          >
            {/* Header */}
            <div className={cx("px-4 py-3.5 border-b flex items-center gap-3 shrink-0", tokens.border.accent)}>
              <div className={cx(
                "relative w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-lg",
                cx(tokens.savings.btnShadow, tokens.supportWidget.gradientAvatar)
              )}>
                <Bot size={18} className="text-white" />
                <span className={cx(
                  "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 chat-online-pulse",
                  tokens.telegramCard.linkedAvatarRing
                )} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className={cx("font-sans font-bold text-sm truncate", tokens.text.heading)}>
                  {t("support.title")}
                </h3>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 chat-online-pulse shrink-0" />
                  <span className={cx("text-[11px] font-medium", tokens.text.success)}>
                    {tab === "admin" && session
                      ? (adminOnline ? t("support.admin_chat.identity_status_online") : t("support.admin_chat.identity_status"))
                      : t("support.widget_status")}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { audioFeedback.playClick(); setIsOpen(false); }}
                aria-label={t("common.close")}
                className={cx(
                  "shrink-0 p-1.5 -m-1.5 rounded-lg cursor-pointer transition-colors",
                  tokens.text.muted,
                  tokens.hover.surface,
                  tokens.hover.textInverse
                )}
              >
                <X size={18} />
              </button>
            </div>

            {/* Tabs */}
            <div className={cx("flex gap-1.5 px-4 pt-3 pb-3 border-b shrink-0", tokens.border.accent)}>
              <button
                type="button"
                onClick={() => setTab("faq")}
                className="relative px-3.5 py-2 rounded-lg text-xs font-bold transition-colors duration-200"
              >
                {tab === "faq" && (
                  <motion.span
                    layoutId="supportTabPill"
                    className={cx("absolute inset-0 rounded-lg ring-1 ring-inset", tokens.supportWidget.ringHighlight, tokens.surface.subtle)}
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
                    className={cx("absolute inset-0 rounded-lg ring-1 ring-inset", tokens.supportWidget.ringHighlight, tokens.surface.subtle)}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <span className={`relative z-10 ${tab === "admin" ? tokens.text.heading : tokens.text.muted}`}>
                  {t("support.tabs.admin")}
                </span>
              </button>
            </div>

            {/* Operating hours & SLA info bar */}
            {tab === "admin" && (
              <div className={cx("px-4 py-2 border-b flex items-center gap-3 shrink-0", tokens.border.accent, tokens.surface.subtle)}>
                <div className="flex items-center gap-1.5 text-[10px] font-medium" style={{ color: "#6B8378" }}>
                  <Clock size={11} className="shrink-0" style={{ color: "#6B8378" }} />
                  <span>{t("support.admin_chat.operating_hours")}:</span>
                  <span className="font-semibold text-emerald-400">{t("support.admin_chat.operating_hours_value")}</span>
                </div>
                <span className="shrink-0" style={{ color: "#6B8378" }}>·</span>
                <div className="flex items-center gap-1 text-[10px] font-medium" style={{ color: "#6B8378" }}>
                  <span>{t("support.admin_chat.sla_response")}</span>
                  <span className="font-semibold text-emerald-400">{t("support.admin_chat.sla_response_value")}</span>
                </div>
              </div>
            )}

            {/* Body */}
            <div
              ref={chatBodyRef}
              className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 chat-scrollarea"
            >
              {tab === "faq" && (
                <>
                  {/* Bot greeting bubble */}
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-start gap-2"
                  >
                    <div className={cx(
                      "w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                      tokens.supportWidget.gradientAvatar
                    )}>
                      <Bot size={12} className="text-white" />
                    </div>
                    <div className={cx("max-w-[85%] px-3 py-2 rounded-[18px] rounded-tl-[4px] text-xs leading-relaxed", tokens.surface.subtle, tokens.text.secondary)}>
                      {t("support.faq.bot_greeting")}
                    </div>
                  </motion.div>

                  {/* Topik */}
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
                              tokens.supportWidget.categoryHoverBorder
                            )}
                          >
                            <Icon size={13} className={cx("shrink-0", tokens.icon.accent)} />
                            {t(`support.faq.topics.${topic.key}.label`)}
                          </button>
                        );
                      })}
                    </div>
                    {chipCanScroll && (
                      <div className={tokens.supportWidget.scrollFadeGradient} />
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
                              active ? "w-3.5 bg-emerald-500" : cx("w-1", tokens.mobileBottomNav.sheetGrip)
                            )}
                          />
                        );
                      })}
                    </div>
                  )}

                  <div className="flex flex-col gap-2 mt-1">
                    {faqBubbles.map((bubble) =>
                      bubble.role === "user" ? (
                        <motion.div
                          key={bubble.id}
                          initial={{ opacity: 0, y: 8, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ duration: 0.2 }}
                          className={cx(
                            "self-end max-w-[85%] px-3 py-2 rounded-[18px] rounded-br-[4px] text-xs leading-relaxed text-white",
                            tokens.supportWidget.chatBubbleUser
                          )}
                        >
                          {bubble.text}
                        </motion.div>
                      ) : (
                        <motion.div
                          key={bubble.id}
                          initial={{ opacity: 0, y: 8, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ duration: 0.2 }}
                          className="flex items-start gap-2 self-start max-w-[85%]"
                        >
                          <div className={cx(
                            "w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                            tokens.supportWidget.gradientAvatar
                          )}>
                            <Bot size={12} className="text-white" />
                          </div>
                          <div className={cx("px-3 py-2 rounded-[18px] rounded-tl-[4px] text-xs leading-relaxed", tokens.surface.subtle, tokens.text.secondary)}>
                            {bubble.text}
                          </div>
                        </motion.div>
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
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-start gap-2"
                      >
                        <div className={cx(
                          "w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                          tokens.supportWidget.gradientAvatar
                        )}>
                          <Bot size={12} className="text-white" />
                        </div>
                        <div className={cx("max-w-[85%] px-3 py-2 rounded-[18px] rounded-tl-[4px] text-xs leading-relaxed", tokens.surface.subtle, tokens.text.secondary)}>
                          {t("support.admin_chat.handoff_message")}
                        </div>
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.2, delay: 0.1 }}
                        className={cx("ml-8 rounded-2xl border overflow-hidden", tokens.surface.subtle, tokens.border.accent)}
                      >
                        <div className="flex items-center gap-3 px-3.5 py-3">
                          <div className={cx(
                            "relative w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                            tokens.supportWidget.gradientAvatar
                          )}>
                            <UserRound size={18} className="text-white" />
                            <span className={cx("absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2", tokens.border.accent)} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={cx("text-xs font-bold truncate", tokens.text.heading)}>
                              {t("support.admin_chat.identity_name")}
                            </p>
                            <p className={cx("text-[11px] font-medium", tokens.text.success)}>
                              {t("support.admin_chat.identity_status_online")}
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
                            tokens.budget.addBtn
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
                      </motion.div>
                    </div>
                  )}

                  {session && (
                    <>
                      {/* Session status bar */}
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

                      {/* Messages */}
                      {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                          <p className={cx("text-xs max-w-[220px]", tokens.text.faint)}>
                            {t("support.admin_chat.prompt_first_message")}
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1 mt-1">
                          {messages.map((msg, idx) => {
                            const prevMsg = idx > 0 ? messages[idx - 1] : null;
                            const showDateSep = shouldShowDateSeparator(msg.created_at, prevMsg?.created_at ?? null);
                            const isLastMsg = idx === messages.length - 1;
                            return (
                              <React.Fragment key={msg.id}>
                                {showDateSep && (
                                  <div className="flex items-center gap-3 py-2">
                                    <div className="flex-1 h-px bg-slate-700/50 light_sakura:bg-rose-200/50" />
                                    <span className="text-[11px] font-semibold shrink-0" style={{ color: "#6B8378" }}>
                                      {formatDateSeparator(msg.created_at, t)}
                                    </span>
                                    <div className="flex-1 h-px bg-slate-700/50 light_sakura:bg-rose-200/50" />
                                  </div>
                                )}
                                <motion.div
                                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  transition={{ duration: 0.2 }}
                                  className={`flex flex-col max-w-[85%] ${msg.sender === "user" ? "self-end items-end" : "self-start items-start"}`}
                                >
                                  <div
                                    className={`${
                                      (msg.image_url || isImageUrl(msg.content)) ? "p-1" : "px-3 py-2"
                                    } text-xs leading-relaxed ${
                                      msg.sender === "user"
                                        ? cx("rounded-[18px] rounded-br-[4px]", tokens.supportWidget.chatBubbleUser)
                                        : cx("rounded-[18px] rounded-tl-[4px]", tokens.supportWidget.chatBubbleAdmin)
                                    }`}
                                  >
                                    {(msg.image_url || isImageUrl(msg.content)) ? (
                                      <img
                                        src={(msg.image_url || msg.content).trim()}
                                        alt="Shared image"
                                        className="max-w-full rounded-xl object-cover cursor-pointer"
                                        style={{ maxHeight: 200 }}
                                        loading="lazy"
                                        onClick={() => window.open((msg.image_url || msg.content).trim(), "_blank")}
                                      />
                                    ) : (
                                      msg.content
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-0.5 px-1">
                                    <span className={cx("text-[11px]", tokens.supportWidget.timestamp)}>
                                      {formatMsgTime(msg.created_at, locale)}
                                    </span>
                                    {msg.sender === "user" && (
                                      <span className={cx("flex items-center", tokens.supportWidget.checkmarkRead)}>
                                        <CheckCheck size={11} strokeWidth={2.5} />
                                      </span>
                                    )}
                                  </div>
                                </motion.div>
                              </React.Fragment>
                            );
                          })}

                          {/* Admin typing indicator */}
                          {isAdminTyping && (
                            <motion.div
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.2 }}
                              className="flex items-start gap-2 self-start max-w-[85%] mt-1"
                            >
                              <div className={cx(
                                "w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                                tokens.supportWidget.gradientAvatar
                              )}>
                                <Bot size={12} className="text-white" />
                              </div>
                              <div className={cx("px-3 py-2.5 rounded-[18px] rounded-tl-[4px]", tokens.supportWidget.chatBubbleAdmin)}>
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-medium" style={{ color: "#6B8378" }}>
                                    {t("support.admin_chat.admin_typing")}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <span className="chat-typing-dot bg-indigo-400 light_sakura:bg-rose-400" />
                                    <span className="chat-typing-dot bg-indigo-400 light_sakura:bg-rose-400" />
                                    <span className="chat-typing-dot bg-indigo-400 light_sakura:bg-rose-400" />
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}

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
              <div className={cx("p-3 border-t flex gap-2 shrink-0", tokens.border.accent)}>
                <input
                  value={faqInput}
                  onChange={(e) => setFaqInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleFaqAsk()}
                  placeholder={t("support.faq.ask_placeholder")}
                  className={cx(
                    cx("flex-1 px-3 py-2 rounded-full text-xs outline-none focus:ring-2", tokens.supportWidget.inputFocusRing),
                    tokens.surface.subtle,
                    tokens.text.primary
                  )}
                />
                <button
                  type="button"
                  onClick={handleFaqAsk}
                  className={cx(
                    "w-9 h-9 flex items-center justify-center rounded-full text-white transition-colors duration-200",
                    tokens.budget.addBtn
                  )}
                >
                  <Send size={16} />
                </button>
              </div>
            )}

            {tab === "admin" && session && session.status !== "closed" && (
              <div className={cx("p-3 border-t flex flex-col gap-2 shrink-0", tokens.border.accent)}>
                {/* Attachment bar */}
                <div className="flex items-center gap-2 px-1 relative">
                  <button
                    type="button"
                    onClick={handleAttachmentClick}
                    disabled={isUploading}
                    className="p-1.5 rounded-lg transition-colors duration-200 hover:bg-slate-800/50 light_sakura:hover:bg-rose-100/50 cursor-pointer disabled:opacity-50"
                    aria-label="Attach file"
                    title="Upload image"
                  >
                    {isUploading ? (
                      <Loader2 size={16} className="animate-spin text-indigo-400" />
                    ) : (
                      <Paperclip size={16} className="text-slate-500" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEmojiOpen((prev) => !prev);
                      audioFeedback.playClick();
                    }}
                    disabled={isUploading}
                    className="p-1.5 rounded-lg transition-colors duration-200 hover:bg-slate-800/50 light_sakura:hover:bg-rose-100/50 cursor-pointer disabled:opacity-50"
                    aria-label="Add emoji"
                    title="Emoji"
                  >
                    <Smile size={16} className="text-slate-500" />
                  </button>
                  <button
                    type="button"
                    onClick={handleCameraClick}
                    disabled={isUploading}
                    className="p-1.5 rounded-lg transition-colors duration-200 hover:bg-slate-800/50 light_sakura:hover:bg-rose-100/50 cursor-pointer disabled:opacity-50"
                    aria-label="Open camera"
                    title="Take photo"
                  >
                    <Camera size={16} className="text-slate-500" />
                  </button>
                  <div className="flex-1" />

                  {/* Emoji picker */}
                  <EmojiPicker
                    isOpen={isEmojiOpen}
                    onClose={() => setIsEmojiOpen(false)}
                    onEmojiSelect={handleEmojiSelect}
                  />
                </div>

                {/* Hidden file inputs */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    handleFileSelect(file);
                    e.target.value = "";
                  }}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    handleFileSelect(file);
                    e.target.value = "";
                  }}
                />

                {/* Input row */}
                <div className="flex gap-2 items-end">
                  <input
                    value={adminInput}
                    onChange={(e) => setAdminInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendAdminMessage()}
                    placeholder={t("support.admin_chat.placeholder")}
                    disabled={sendBtnState !== "idle"}
                    className={cx(
                      cx("flex-1 px-3 py-2 rounded-full text-xs outline-none focus:ring-2 disabled:opacity-60", tokens.supportWidget.inputFocusRing),
                      tokens.surface.subtle,
                      tokens.text.primary
                    )}
                  />
                  <div className="relative">
                    <motion.button
                      type="button"
                      onClick={handleSendAdminMessage}
                      disabled={sendBtnState !== "idle" || !adminInput.trim()}
                      whileTap={sendBtnState === "idle" && adminInput.trim() ? { scale: 0.85 } : {}}
                      className={cx(
                        "relative w-10 h-10 flex items-center justify-center rounded-full text-white transition-colors duration-200 disabled:opacity-50 shrink-0 overflow-hidden",
                        tokens.budget.addBtn
                      )}
                    >
                      <AnimatePresence mode="wait">
                        {sendBtnState === "loading" ? (
                          <motion.span
                            key="loading"
                            initial={{ opacity: 0, rotate: -90 }}
                            animate={{ opacity: 1, rotate: 0 }}
                            exit={{ opacity: 0, rotate: 90 }}
                          >
                            <Loader2 size={16} className="animate-spin" />
                          </motion.span>
                        ) : sendBtnState === "success" ? (
                          <motion.span
                            key="success"
                            initial={{ opacity: 0, scale: 0.3 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.3 }}
                            transition={{ type: "spring", stiffness: 400, damping: 15 }}
                          >
                            <Check size={16} strokeWidth={3} />
                          </motion.span>
                        ) : (
                          <motion.span
                            key="send"
                            initial={{ opacity: 0, rotate: -90 }}
                            animate={{ opacity: 1, rotate: 0 }}
                            exit={{ opacity: 0, rotate: 90 }}
                          >
                            <Send size={16} />
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal konfirmasi tutup sesi */}
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
