import React, { useState, useEffect, useMemo } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { dbService } from "../lib/db";
import { supabase } from "../lib/supabase";
import { UserSession } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { motion, useAnimation, AnimatePresence } from "motion/react";
import { audioFeedback } from "../lib/audio";

import { DropdownField } from "../components/DropdownField";
import { useNavigate, useLocation } from "react-router-dom";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { ReceiptUploader } from "../components/ReceiptUploader";
import { ReceiptPreview } from "../components/ReceiptPreview";
import { VoiceRecorder } from "../components/VoiceRecorder";
import { useCategories } from "../hooks/useCategories";
import { useWallets } from "../hooks/useWallets";
import { checkSingleCategoryBudget } from "../hooks/useBudgets";
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
    setConfirmDraft(null);
    setIsLoading(true);
    try {
      const source = confirmSource === "manual" ? "manual" : "ai_web";
      const savedTx = await dbService.saveTransaction(
        currentUser.id, draft.type, draft.category,
        Number(draft.amount), draft.note.trim() || null, source, draft.date, draft.walletId
      );
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
    } catch {
      showToast(t("toast.error_general"), "error");
    } finally {
      setIsLoading(false);
      setDuplicateWarning(null);
      setDuplicateAcknowledged(false);
    }
  };

  // ── Amount display formatting ─────────────────────────────────────────
  const amountDisplay = amount !== "" && amount > 0
    ? "Rp\u00A0" + Number(amount).toLocaleString("id-ID")
    : null;

  const isExpense = type === "expense";

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {receiptDraft ? (
        <ReceiptPreview
          draft={receiptDraft}
          onApprove={handleReceiptApprove}
          onCancel={() => { audioFeedback.playDullPluck(); setReceiptDraft(null); }}
        />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className={cx("rounded-3xl border shadow-lg overflow-hidden", tokens.settings.cardBorder, tokens.surface.card)}
        >
          {/* ── Colour stripe header ─────────────────────────────────── */}
          <div
            className={cx("h-1.5 w-full transition-colors duration-300", isExpense ? tokens.newTransaction.headerStripeExpense : tokens.newTransaction.headerStripeIncome)}
          />

          <div className="p-6 md:p-8 space-y-7">
            {/* ── Page header ──────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className={cx("font-sans font-bold text-2xl tracking-tight", tokens.text.primary)}>
                  {t("transaction.add_title")}
                </h1>
                <p className={cx("font-sans text-sm mt-1", tokens.text.muted)}>
                  {t("transaction.add_desc")}
                </p>
              </div>
              {/* Today mini-summary pill */}
              {todaySummary && (
                <div className={cx("shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl", tokens.newTransaction.quickAddChipBorder)}>
                  <span className="text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-slate-500 uppercase tracking-wider">Hari ini</span>
                  <span className="text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-bold font-mono tabular-nums text-red-400">−{formatIDR(todaySummary.expense)}</span>
                  {todaySummary.income > 0 && (
                    <span className="text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-bold font-mono tabular-nums text-emerald-400">+{formatIDR(todaySummary.income)}</span>
                  )}
                </div>
              )}
            </div>

            {/* ── Formasi tab: pilih satu metode input ──────────────────── */}
            <div className={cx("grid grid-cols-3 gap-1 p-1 rounded-2xl", tokens.newTransaction.segmentedControlBg)}>
              {([
                { key: "receipt", label: "Struk", icon: "" },
                { key: "voice", label: "Suara", icon: "" },
                { key: "manual", label: "Manual", icon: "" },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => { audioFeedback.playClick(); setActiveInputTab(tab.key); }}
                  className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-sans text-xs font-bold transition-colors cursor-pointer ${
                    activeInputTab === tab.key
                      ? tokens.newTransaction.walletSelectedActive
                      : cx(tokens.newTransaction.inactiveHoverText, tokens.text.faint)
                  }`}
                >
                  <span className="text-sm leading-none">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── AI Receipt uploader (panel) ───────────────────────────── */}
            {activeInputTab === "receipt" && (
              <ReceiptUploader onParsed={(draft) => setReceiptDraft(draft)} />
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
                  <div className={cx("grid grid-cols-2 gap-2 p-1 rounded-2xl", tokens.newTransaction.segmentedControlBg)}>
                    <button
                      type="button"
                      onClick={() => { audioFeedback.playClick(); setType("expense"); }}
                      className={cx("py-3 rounded-xl font-sans text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2", isExpense ? tokens.newTransaction.typeToggleActiveExpense : cx(tokens.newTransaction.inactiveHoverText, tokens.text.faint))}
                    >
                      <span className="text-base leading-none"> </span>
                      {t("transaction.expense")}
                    </button>
                    <button
                      type="button"
                      onClick={() => { audioFeedback.playClick(); setType("income"); }}
                      className={cx("py-3 rounded-xl font-sans text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2", !isExpense ? tokens.newTransaction.typeToggleActiveIncome : cx(tokens.newTransaction.inactiveHoverText, tokens.text.faint))}
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
                  <div className={cx("rounded-2xl border transition-colors duration-200 px-5 py-4 space-y-2", isExpense ? tokens.newTransaction.amountInputExpense : tokens.newTransaction.amountInputIncome)}>
                    {/* Live formatted preview */}
                    <AnimatePresence mode="wait">
                      {amountDisplay ? (
                        <motion.div
                          key="amount-val"
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 6 }}
                          className={cx("font-mono font-black text-3xl tracking-tight tabular-nums leading-none", isExpense ? tokens.newTransaction.amountDisplayExpense : tokens.newTransaction.amountDisplayIncome)}
                        >
                          {isExpense ? "−" : "+"}{amountDisplay}
                        </motion.div>
                      ) : (
                        <motion.div
                          key="amount-placeholder"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className={cx("font-sans font-black text-3xl tracking-tight leading-none", tokens.newTransaction.amountDisplayPlaceholder)}
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
                      className={cx("w-full bg-transparent border-none outline-none font-sans text-sm", tokens.newTransaction.amountInputPlaceholder, tokens.text.label)}
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
                          className={cx("shrink-0", isSelected ? (isExpense ? tokens.newTransaction.categoryPillSelectedExpense : tokens.newTransaction.categoryPillSelectedIncome) : cx(tokens.newTransaction.categoryPillInactive, tokens.text.muted))}
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
                      className={cx("w-full px-4 py-3 border rounded-xl font-sans text-xs outline-none focus:border-indigo-500 transition-colors", tokens.settings.otpInputBg, tokens.text.onSurface, tokens.border.accent)}
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
                      className={cx("w-full px-4 py-3 border rounded-xl font-sans text-xs outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-600", tokens.settings.otpInputBg, tokens.text.onSurface, tokens.border.accent)}
                    />
                  </div>
                </div>

                {/* 5 ── Submit preview + button ─────────────────────────── */}
                <div className="flex items-center justify-between gap-4 pt-1">
                  {/* Confirmation preview */}
                  {amountDisplay && (
                    <div className={cx("flex items-center gap-2 text-xs min-w-0", tokens.text.muted)}>
                      <span className="text-base leading-none">{getCategoryEmoji(category)}</span>
                      <span className="truncate">
                        {getCategoryLabel(category)} · {date}
                      </span>
                    </div>
                  )}
                  <Button
                    type="submit"
                    variant={isExpense ? "danger" : "success"}
                    disabled={isLoading || amount === "" || amount === 0}
                    isLoading={isLoading}
                    className="ml-auto rounded-xl py-3 px-6 text-xs"
                  >
                    {t("transaction.btn_submit")}
                  </Button>
                </div>

              </form>
            </motion.div>
            )}
          </div>
        </motion.div>
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
