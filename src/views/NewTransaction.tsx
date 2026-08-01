import { CollapsingPageHeader } from "../components/CollapsingPageHeader";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { dbService } from "../lib/db";
import { supabase } from "../lib/supabase";
import { UserSession } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { motion, useAnimation, AnimatePresence } from "motion/react";
import { audioFeedback } from "../lib/audio";
import { withMinDuration } from "../lib/withMinDuration";

import { DropdownField } from "../components/DropdownField";
import { useNavigate, useLocation } from "react-router-dom";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { ReceiptUploader } from "../components/ReceiptUploader";
import { getPendingSharedFile, clearPendingSharedFile } from "../lib/shareTarget";
import { ReceiptPreview } from "../components/ReceiptPreview";
import { VoiceRecorder } from "../components/VoiceRecorder";
import { useCategories } from "../hooks/useCategories";
import { useWallets } from "../hooks/useWallets";
import { checkSingleCategoryBudget } from "../hooks/useBudgets";
import { withErrorReporting } from "../lib/errorReporter";
import { Button } from "../components/ui/Button";
import { ConfirmTransactionModal, ConfirmTransactionDraft } from "../components/ConfirmTransactionModal";

// Emoji map for category keys — fallback to if key not found
const CATEGORY_EMOJI: Record<string, string> = {
  food_drink: "",
  transport: "",
  shopping: "",
  health: "",
  entertainment: "",
  education: "",
  bills: "",
  household: "",
  beauty: "",
  electronics: "",
  travel: "",
  sport: "",
  charity: "",
  other_expense: "",
  salary: "",
  freelance: "",
  investment: "",
  bonus: "",
  other_income: "",
};

function getCategoryEmoji(key: string): string {
  return CATEGORY_EMOJI[key] ?? "";
}

interface NewTransactionProps {
  onTransactionAdded: () => void;
  userDisplayName?: string;
}

export const NewTransaction: React.FC<NewTransactionProps> = ({
  onTransactionAdded,
  userDisplayName,
}) => {
  const navigate = useNavigate();
  const { tokens, cx } = useThemeTokens();
  const location = useLocation();
  const prefill = (location.state as {
    prefillCategoryKey?: string;
    prefillNote?: string;
    prefillType?: "income" | "expense";
  } | null) || null;

  const { t, locale } = useLanguage();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { categories } = useCategories();
  const { activeWallets, generalWallet, refresh: refreshWallets } = useWallets();
  const shakeControls = useAnimation();

  const [displayName, setDisplayName] = useState<string>(userDisplayName || "");

  useEffect(() => {
    if (userDisplayName) setDisplayName(userDisplayName);
  }, [userDisplayName]);

  // Ambil-alih foto struk yang datang dari alur "Share ke app" (OS share
  // sheet -> service worker -> IndexedDB, lihat src/lib/shareTarget.ts).
  // Ditandai lewat query `?shared=1` yang di-redirect oleh
  // public/share-target-sw.js setelah file berhasil disimpan.
  const [sharedReceiptFile, setSharedReceiptFile] = useState<File | null>(null);
  useEffect(() => {
    if (new URLSearchParams(location.search).get("shared") !== "1") return;
    let cancelled = false;
    (async () => {
      const file = await getPendingSharedFile();
      if (cancelled) return;
      if (file) {
        setSharedReceiptFile(file);
        // Pastikan tab yang tampil adalah "Struk", bukan default "Manual",
        // supaya ReceiptUploader (yang menerima sharedFile) benar-benar
        // ter-render. Sebelumnya activeInputTab tidak pernah diubah di sini,
        // jadi file numpang di state tapi user tetap lihat panel Manual.
        setActiveInputTab("receipt");
      }
      // Bersihkan query string supaya refresh/back tidak memicu ulang.
      navigate(location.pathname, { replace: true });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  useEffect(() => {
    if (userDisplayName || !user) return;
    supabase
      .from("users")
      .select("display_name")
      .eq("id", user.id)
      .single()
      .then(({ data, error }) => {
        if (!error && data?.display_name) setDisplayName(data.display_name);
      });
  }, [user, userDisplayName]);

  const currentUser: UserSession = {
    id: user?.id || "",
    display_name: displayName || user?.user_metadata?.full_name || t("admin.guest_user"),
    is_guest: user?.is_anonymous || false,
    preferred_language: "id",
    preferred_theme: "dark_obsidian",
  };

  // ── Form state ──────────────────────────────────────────────────────
  const [type, setType] = useState<"income" | "expense">(prefill?.prefillType || "expense");
  const [category, setCategory] = useState(prefill?.prefillCategoryKey || "food_drink");
  const [amount, setAmount] = useState<number | "">("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState(prefill?.prefillNote || "");
  const [walletId, setWalletId] = useState<string | null>(null);
  const [receiptDraft, setReceiptDraft] = useState<any>(null);
  const [confirmDraft, setConfirmDraft] = useState<ConfirmTransactionDraft | null>(null);
  const [confirmSource, setConfirmSource] = useState<"manual" | "receipt" | "voice">("manual");
  // Idempotency key untuk 1 percobaan "konfirmasi & simpan" -- dibuat SEKALI
  // saat draft konfirmasi pertama kali dibuka (bukan di dalam
  // handleExecuteSave), supaya kalau handleExecuteSave sempat terpanggil
  // 2x untuk draft yang sama (double-tap tombol Simpan sebelum re-render,
  // atau retry level jaringan pada request yang sama), keduanya mengirim
  // key yang identik dan hanya salah satu yang berhasil insert -- lihat
  // saveTransaction() di src/lib/db.ts. Disimpan di ref (bukan state)
  // karena tidak perlu memicu render dan harus terbaca sinkron oleh
  // kedua pemanggilan yang berpotensi race.
  const pendingIdempotencyKeyRef = useRef<string | null>(null);
  const newIdempotencyKey = () =>
    (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  // Insiden 15/7/2026: state untuk peringatan transaksi duplikat -- lihat
  // dbService.findPossibleDuplicateTransaction untuk detail kasusnya.
  const [duplicateChecking, setDuplicateChecking] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<{ createdAt: string } | null>(null);
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Begitu wallet sudah termuat, defaultkan pilihan ke "Saldo Total" (general)
  // supaya form tidak pernah dikirim tanpa pos -- user tetap bebas menggantinya.
  useEffect(() => {
    if (!walletId && generalWallet) setWalletId(generalWallet.id);
  }, [generalWallet, walletId]);
  // ── Formasi tab: Struk / Suara / Manual (hanya satu panel tampil) ────
  const [activeInputTab, setActiveInputTab] = useState<"receipt" | "voice" | "manual">("manual");

  // ── Today summary ────────────────────────────────────────────────────
  const [todaySummary, setTodaySummary] = useState<{ income: number; expense: number } | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const today = new Date().toISOString().split("T")[0];
    const monthPrefix = today.slice(0, 7);
    dbService.getTransactions(user.id, monthPrefix).then((txs) => {
      const todayTxs = txs.filter((tx) => tx.transaction_date === today);
      const income = todayTxs.filter((tx) => tx.type === "income").reduce((s, tx) => s + tx.amount, 0);
      const expense = todayTxs.filter((tx) => tx.type === "expense").reduce((s, tx) => s + tx.amount, 0);
      setTodaySummary({ income, expense });
    }).catch(() => {});
  }, [user?.id]);

  // ── Category list filtered by type ──────────────────────────────────
  const activeCategories = useMemo(
    () => categories.filter((c) => c.type === type || c.type === "both"),
    [categories, type]
  );

  // Reset category when type changes if current key no longer valid
  useEffect(() => {
    if (activeCategories.length > 0 && !activeCategories.some((c) => c.key === category)) {
      setCategory(activeCategories[0].key);
    }
  }, [type, activeCategories]);

  const getCategoryLabel = (key: string) => {
    const cat = categories.find((c) => c.key === key);
    if (!cat) return key;
    return locale === "id" ? cat.label_id || cat.key : cat.label_en || cat.key;
  };

  // ── Helpers ──────────────────────────────────────────────────────────
  const formatIDR = (num: number) => "Rp\u00A0" + Math.round(num).toLocaleString("id-ID");

  const triggerShake = async () => {
    await shakeControls.start({ x: [-5, 5, -5, 5, 0], transition: { duration: 0.4 } });
  };

  const maybeWarnBudget = async (categoryKey: string, txType: "income" | "expense") => {
    if (txType !== "expense" || !user?.id) return;
    try {
      const result = await checkSingleCategoryBudget(user.id, categoryKey);
      if (!result || result.status === "safe") return;
      const categoryLabel = getCategoryLabel(categoryKey);
      const pct = Math.round(result.percent);
      if (result.status === "danger") {
        showToast(t("budget.toast_warning_over", { category: categoryLabel, percent: pct }), "warning");
      } else {
        showToast(t("budget.toast_warning_threshold", { category: categoryLabel, percent: pct }), "warning");
      }
    } catch {}
  };

  // ── Handlers ─────────────────────────────────────────────────────────
  // Dipanggil setelah pengguna menyetujui hasil parsing struk/suara. Alih-alih
  // langsung menyimpan, sekarang kita tampilkan dialog konfirmasi yang sama
  // dengan input manual (nominal, kategori, pos dompet, tanggal, dan bisa
  // diedit) sebelum benar-benar tersimpan ke database.
  const handleReceiptApprove = (finalData: {
    amount: number; merchant_name: string; category: string; date: string; note: string;
  }) => {
    pendingIdempotencyKeyRef.current = newIdempotencyKey();
    setConfirmSource("receipt");
    setConfirmDraft({
      type: "expense",
      category: finalData.category,
      amount: finalData.amount,
      date: finalData.date,
      note: finalData.note,
      walletId: walletId || generalWallet?.id || null,
    });
  };

  const handleVoiceApprove = (finalData: {
    type: "income" | "expense"; category_key: string; amount: number; note: string;
  }) => {
    pendingIdempotencyKeyRef.current = newIdempotencyKey();
    setConfirmSource("voice");
    setConfirmDraft({
      type: finalData.type,
      category: finalData.category_key,
      amount: finalData.amount,
      date: new Date().toISOString().split("T")[0],
      note: finalData.note || "",
      walletId: walletId || generalWallet?.id || null,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || amount <= 0 || isNaN(amount)) {
      audioFeedback.playDullPluck();
      triggerShake();
      showToast(t("toast.invalid_amount"), "error");
      return;
    }
    const enteredDate = new Date(date);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (enteredDate > today) {
      audioFeedback.playDullPluck();
      triggerShake();
      showToast(t("toast.invalid_date"), "error");
      return;
    }
    pendingIdempotencyKeyRef.current = newIdempotencyKey();
    setConfirmSource("manual");
    setConfirmDraft({
      type,
      category,
      amount: Number(amount),
      date,
      note,
      walletId: walletId || generalWallet?.id || null,
    });
  };

  // Insiden 15/7/2026: cek transaksi duplikat setiap kali draft konfirmasi
  // dibuka atau field kuncinya (nominal/tanggal/catatan) diubah pengguna.
  // Soft-fail lewat dbService (lihat komentar di sana) -- kalau query cek
  // gagal, dianggap "tidak ada duplikat" supaya tidak menghalangi simpan.
  useEffect(() => {
    let cancelled = false;
    if (!confirmDraft || !currentUser?.id) {
      setDuplicateWarning(null);
      setDuplicateChecking(false);
      return;
    }
    setDuplicateAcknowledged(false);
    setDuplicateChecking(true);
    (async () => {
      const existing = await dbService.findPossibleDuplicateTransaction(
        currentUser.id,
        Number(confirmDraft.amount),
        confirmDraft.date,
        confirmDraft.note
      );
      if (cancelled) return;
      setDuplicateWarning(existing ? { createdAt: (existing as any).created_at } : null);
      setDuplicateChecking(false);
    })();
    return () => { cancelled = true; };
  }, [confirmDraft?.amount, confirmDraft?.date, confirmDraft?.note, currentUser?.id]);

  const handleExecuteSave = async () => {
    if (!confirmDraft) return;
    const draft = confirmDraft;
    // Baca sekali di sini: kalau handleExecuteSave ini adalah panggilan
    // kedua yang race (mis. double-tap) untuk draft yang sama, ref masih
    // menunjuk ke key yang sama persis -- itulah yang membuat keduanya
    // dianggap 1 percobaan yang sama oleh saveTransaction/DB, bukan 2
    // transaksi terpisah.
    const idempotencyKey = pendingIdempotencyKeyRef.current;
    setConfirmDraft(null);
    setIsLoading(true);
    try {
      await withErrorReporting(
        "frontend:transaction",
        async () => {
          const source = confirmSource === "manual" ? "manual" : "ai_web";
          const savedTx = await withMinDuration(dbService.saveTransaction(
            currentUser.id, draft.type, draft.category,
            Number(draft.amount), draft.note.trim() || null, source, draft.date, draft.walletId,
            idempotencyKey
          ));
          if (savedTx?.id) (window as any).lastSavedTransactionId = savedTx.id;
          if (confirmSource === "receipt" && receiptDraft?.id) {
            await dbService.approveReceiptDraft(receiptDraft.id);
          }
          showToast(t("toast.success_save"), "success");
          setAmount("");
          setNote("");
          setDate(new Date().toISOString().split("T")[0]);
          setReceiptDraft(null);
          refreshWallets();
          onTransactionAdded();
          await maybeWarnBudget(draft.category, draft.type);
          navigate("/dashboard");
        },
        { type: draft.type, category: draft.category, source: confirmSource }
      );
    } catch {
      showToast(t("toast.error_general"), "error");
    } finally {
      // Hanya bersihkan kalau masih key milik percobaan ini -- kalau sudah
      // beda (draft baru sempat dibuka di antaranya), jangan timpa key
      // punya draft yang lebih baru itu.
      if (pendingIdempotencyKeyRef.current === idempotencyKey) {
        pendingIdempotencyKeyRef.current = null;
      }
      setIsLoading(false);
      setDuplicateWarning(null);
      setDuplicateAcknowledged(false);
    }
  };

  // ── Amount display formatting ─────────────────────────────────────────
  const amountDisplay = amount !== "" && amount > 0
    ? "Rp\u00A0" + Number(amount).toLocaleString("id-ID")
    : null;

  // Ukuran font nominal besar disusutkan bertahap sesuai panjang teks
  // (termasuk tanda +/- di depan) supaya angka besar (miliaran+) tidak
  // meluber keluar kotak "Jumlah Nominal" -- sebelumnya font-size fixed
  // (text-5xl) tidak peduli berapa digit yang diketik pengguna.
  const amountCharCount = (amountDisplay?.length ?? 4) + 1; // +1 untuk simbol +/-
  const amountFontSizeClass =
    amountCharCount > 16 ? "text-2xl" :
    amountCharCount > 13 ? "text-3xl" :
    amountCharCount > 10 ? "text-4xl" :
    "text-5xl";

  const isExpense = type === "expense";

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {receiptDraft ? (
        <ReceiptPreview
          draft={receiptDraft}
          onApprove={handleReceiptApprove}
          onCancel={() => { audioFeedback.playDullPluck(); setReceiptDraft(null); }}
        />
      ) : (
        <div className="space-y-7">
          {/* ── Page header ──────────────────────────────────────────── */}
          <div className={cx("overflow-hidden rounded-2xl border shadow-sm", tokens.surface.card, tokens.border.accent)}>
            <div className="h-1 w-full bg-gradient-to-r from-emerald-600/80 via-indigo-500/60 to-emerald-400/80" />
            <div className="px-5 py-4">
            <h1 className={cx("font-sans font-bold text-2xl tracking-[-0.025em]", tokens.text.heading)}>
              {t("transaction.add_title")}
            </h1>
            <p className={cx("text-sm mt-1 leading-relaxed", tokens.text.muted)}>
              {t("transaction.add_subtitle")}
            </p>

            {/* Today mini summary — shows daily running total */}
            {todaySummary && (todaySummary.income > 0 || todaySummary.expense > 0) && (
              <div className={cx("flex items-center gap-3 mt-3 text-xs font-mono tabular-nums", tokens.text.muted)}>
                {todaySummary.expense > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    <span className="text-red-400 font-semibold">−{formatIDR(todaySummary.expense)}</span>
                    <span className="opacity-60">{t("transaction.today_label") || "hari ini"}</span>
                  </span>
                )}
                {todaySummary.income > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-emerald-400 font-semibold">+{formatIDR(todaySummary.income)}</span>
                  </span>
                )}
              </div>
            )}
            </div>
          </div>

            {/* ── Formasi tab: pilih satu metode input ──────────────────── */}
            <div className={cx("relative grid grid-cols-3 gap-1 p-1 rounded-2xl border", tokens.surface.card, tokens.border.accent)}>
              {/* Sliding active indicator */}
              <motion.div
                layoutId="input-tab-indicator"
                className={cx("absolute inset-y-1 rounded-xl", tokens.newTransaction.walletSelectedActive)}
                style={{
                  width: "calc(33.333% - 2.67px)",
                  left: activeInputTab === "receipt" ? "4px" : activeInputTab === "voice" ? "calc(33.333% + 0px)" : "calc(66.666% - 2px)",
                }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
              {([
                { key: "receipt", label: "Struk" },
                { key: "voice", label: "Suara" },
                { key: "manual", label: "Manual" },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => { audioFeedback.playClick(); setActiveInputTab(tab.key); }}
                  className={`relative z-10 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-sans text-xs font-bold transition-colors cursor-pointer ${
                    activeInputTab === tab.key
                      ? "text-white"
                      : cx(tokens.newTransaction.inactiveHoverText, tokens.text.faint)
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── AI Receipt uploader (panel) ───────────────────────────── */}
            {activeInputTab === "receipt" && (
              <ReceiptUploader
                onParsed={(draft) => setReceiptDraft(draft)}
                sharedFile={sharedReceiptFile}
                onSharedFileConsumed={() => {
                  setSharedReceiptFile(null);
                  void clearPendingSharedFile();
                }}
              />
            )}

            {/* ── AI Voice note recorder (panel) ────────────────────────── */}
            {activeInputTab === "voice" && (
              <VoiceRecorder onApprove={handleVoiceApprove} />
            )}

            {/* ── Form manual (panel) ───────────────────────────────────── */}
            {activeInputTab === "manual" && (
            <motion.div animate={shakeControls}>
              <form onSubmit={handleSubmit} className="space-y-6">

                {/* 1 ── Type toggle ─────────────────────────────────────── */}
                <div className="space-y-2">
                  <label className={cx("font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-widest", tokens.text.muted)}>
                    {t("transaction.label_type")}
                  </label>
                  <div className={cx("relative grid grid-cols-2 gap-1 p-1 rounded-2xl", tokens.newTransaction.segmentedControlBg)}>
                    <motion.div
                      layoutId="type-toggle-indicator"
                      className={cx("absolute inset-y-1 rounded-xl", isExpense ? tokens.newTransaction.typeToggleActiveExpense : tokens.newTransaction.typeToggleActiveIncome)}
                      style={{
                        width: "calc(50% - 4px)",
                        left: isExpense ? "4px" : "calc(50% + 0px)",
                      }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                    <button
                      type="button"
                      onClick={() => { audioFeedback.playClick(); setType("expense"); }}
                      className={`relative z-10 py-3 rounded-xl font-sans text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 ${
                        isExpense ? "text-white" : cx(tokens.newTransaction.inactiveHoverText, tokens.text.faint)
                      }`}
                    >
                      <span className="text-base leading-none"> </span>
                      {t("transaction.expense")}
                    </button>
                    <button
                      type="button"
                      onClick={() => { audioFeedback.playClick(); setType("income"); }}
                      className={`relative z-10 py-3 rounded-xl font-sans text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 ${
                        !isExpense ? "text-white" : cx(tokens.newTransaction.inactiveHoverText, tokens.text.faint)
                      }`}
                    >
                      <span className="text-base leading-none"> </span>
                      {t("transaction.income")}
                    </button>
                  </div>
                </div>

                {/* 2 ── Nominal big display ─────────────────────────────── */}
                <div className="space-y-2">
                  <label className={cx("font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-widest", tokens.text.muted)}>
                    {t("transaction.label_amount")}
                  </label>
                  <div className={cx("rounded-2xl border transition-colors duration-200 px-5 pt-4 pb-3 space-y-3", isExpense ? tokens.newTransaction.amountInputExpense : tokens.newTransaction.amountInputIncome)}>
                    <AnimatePresence mode="wait">
                      {amountDisplay ? (
                        <motion.div
                          key="amount-val"
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 8 }}
                          className={cx("font-mono font-black tracking-[-0.03em] tabular-nums leading-none w-full max-w-full overflow-hidden text-ellipsis whitespace-nowrap transition-[font-size] duration-150", amountFontSizeClass, isExpense ? tokens.newTransaction.amountDisplayExpense : tokens.newTransaction.amountDisplayIncome)}
                        >
                          {isExpense ? "−" : "+"}{amountDisplay}
                        </motion.div>
                      ) : (
                        <motion.div
                          key="amount-placeholder"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className={cx("font-mono font-black text-5xl tracking-[-0.03em] leading-none w-full max-w-full overflow-hidden text-ellipsis whitespace-nowrap", tokens.newTransaction.amountDisplayPlaceholder)}
                        >
                          Rp 0
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <input
                      type="number"
                      required
                      min={1}
                      placeholder="Ketik nominal..."
                      disabled={isLoading}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value !== "" ? parseInt(e.target.value) || 0 : "")}
                      className={cx("w-full bg-transparent outline-none font-sans text-xs border-t pt-2.5", tokens.newTransaction.amountInputPlaceholder, tokens.text.faint, tokens.border.accent)}
                    />
                  </div>
                </div>

                {/* 3 ── Category pills ──────────────────────────────────── */}
                <div className="space-y-2">
                  <label className={cx("font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-widest", tokens.text.muted)}>
                    {t("transaction.label_category")}
                  </label>
                  <div className="flex flex-nowrap md:flex-wrap gap-2 overflow-x-auto md:overflow-visible scrollbar-hide -mx-1 px-1 pb-1 md:pb-0 md:mx-0 md:px-0">
                    {activeCategories.map((cat) => {
                      const isSelected = category === cat.key;
                      return (
                        <motion.button
                          key={cat.key}
                          type="button"
                          whileTap={{ scale: 0.95 }}
                          onClick={() => {
                            audioFeedback.playClick();
                            setCategory(cat.key);
                          }}
                          className={cx("shrink-0", tokens.newTransaction.categoryPillBase, isSelected ? (isExpense ? tokens.newTransaction.categoryPillSelectedExpense : tokens.newTransaction.categoryPillSelectedIncome) : cx(tokens.newTransaction.categoryPillInactive, tokens.text.muted))}
                        >
                          <span className="text-sm leading-none">{getCategoryEmoji(cat.key)}</span>
                          <span>{locale === "id" ? cat.label_id || cat.key : cat.label_en || cat.key}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* 3b ── Pos Dompet ──────────────────────────────────────── */}
                <div className="space-y-2">
                  <label className={cx("font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-widest", tokens.text.muted)}>
                    {t("wallet.label_pos")}
                  </label>
                  <DropdownField
                    value={walletId ?? ""}
                    onChange={(v) => setWalletId(v || null)}
                    disabled={isLoading}
                    placeholder={t("wallet.label_pos")}
                    className="[&>button]:rounded-xl [&>button]:bg-slate-900 [&>button]:border [&>button]:border-slate-800 light_sakura:[&>button]:bg-white light_sakura:[&>button]:border-rose-100"
                    options={activeWallets.map((w) => {
                      const icon = w.type === "general" ? "" : w.type === "ewallet" ? "" : w.type === "bank" ? "" : "";
                      return { value: w.id, label: `${icon} ${w.name}${(w.provider && w.provider !== w.name) ? ` · ${w.provider}` : ""} (${formatIDR(w.balance)})` };
                    })}
                  />
                </div>


                {/* 4 ── Date + Note ─────────────────────────────────────── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className={cx("font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-widest", tokens.text.muted)}>
                      {t("transaction.label_date")}
                    </label>
                    <input
                      type="date"
                      required
                      disabled={isLoading}
                      value={date}
                      max={new Date().toISOString().split("T")[0]}
                      onChange={(e) => setDate(e.target.value)}
                      className={cx("w-full px-4 py-3 border rounded-xl font-sans text-xs outline-none transition-colors focus:ring-2 focus:ring-offset-0 focus:ring-indigo-500/30 focus:border-indigo-500", tokens.surface.card, tokens.text.onSurface, tokens.border.accent)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className={cx("font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-widest", tokens.text.muted)}>
                      {t("transaction.label_note")}
                    </label>
                    <input
                      type="text"
                      placeholder={t("transaction.placeholder_note")}
                      disabled={isLoading}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className={cx("w-full px-4 py-3 border rounded-xl font-sans text-xs outline-none transition-colors focus:ring-2 focus:ring-offset-0 focus:ring-indigo-500/30 focus:border-indigo-500", tokens.surface.card, tokens.text.onSurface, tokens.border.accent, "placeholder:opacity-40")}
                    />
                  </div>
                </div>

                {/* 5 ── Submit preview + button ─────────────────────────── */}
                <div className="flex items-center justify-between gap-4 pt-2">
                  {amountDisplay && (
                    <motion.div
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={cx("flex items-center gap-2 text-xs font-medium min-w-0 px-3 py-1.5 rounded-lg", tokens.surface.card, tokens.border.accent, "border")}
                    >
                      <span className="text-base leading-none">{getCategoryEmoji(category)}</span>
                      <span className={cx("truncate", tokens.text.muted)}>
                        {getCategoryLabel(category)} · {date}
                      </span>
                    </motion.div>
                  )}
                  <Button
                    type="submit"
                    variant={isExpense ? "danger" : "success"}
                    disabled={isLoading || amount === "" || amount === 0}
                    isLoading={isLoading}
                    className="ml-auto rounded-full py-3 px-6 text-xs font-bold"
                  >
                    {t("transaction.btn_submit")}
                  </Button>
                </div>

              </form>
            </motion.div>
            )}
          </div>
      )}

      {/* Confirmation Modal — nominal, kategori, pos dompet, tanggal, semua bisa diedit */}
      <ConfirmTransactionModal
        isOpen={!!confirmDraft}
        draft={confirmDraft}
        categories={categories}
        wallets={activeWallets}
        isSaving={isLoading}
        onChange={setConfirmDraft}
        onConfirm={handleExecuteSave}
        onCancel={() => {
          audioFeedback.playClick();
          setConfirmDraft(null);
          setDuplicateWarning(null);
          setDuplicateAcknowledged(false);
        }}
        duplicateChecking={duplicateChecking}
        duplicateWarning={duplicateWarning}
        duplicateAcknowledged={duplicateAcknowledged}
        onDuplicateAcknowledgedChange={setDuplicateAcknowledged}
      />

      <LoadingOverlay isOpen={isLoading} message={t("common.loading")} />
    </div>
  );
};
