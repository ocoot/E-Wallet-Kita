import React, { useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import { dbService } from "../lib/db";
import { supabase } from "../lib/supabase";
import { UserSession, Transaction, Category } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { Modal } from "../components/Modal";
import { ExportFullModal } from "../components/ExportFullModal";
import { ExportSummaryModal } from "../components/ExportSummaryModal";
import { Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { audioFeedback } from "../lib/audio";
import { exportSummaryPdf, exportFullPdf } from "../lib/pdf/exportPdf";
import { getCurrentMonthToDateRange, toISODate } from "../lib/pdf/dateRange";

import { HistoryFilter } from "../components/HistoryFilter";
import { HistoryGroupedList } from "../components/HistoryGroupedList";
import { HistoryPagination } from "../components/HistoryPagination";
import { HistoryExport } from "../components/HistoryExport";
import { HistoryDeleteModal } from "../components/HistoryDeleteModal";
import { HistoryEditModal } from "../components/HistoryEditModal";
import { usePremium } from "../hooks/usePremium";
import { PremiumModal } from "../components/PremiumModal";
import { useCategories } from "../hooks/useCategories";
import { useWallets } from "../hooks/useWallets";

interface HistoryProps {
  transactionsUpdatedTrigger: number;
  onTransactionUpdated: () => void;
  userDisplayName?: string;
}

export const History: React.FC<HistoryProps> = ({
  transactionsUpdatedTrigger,
  onTransactionUpdated,
  userDisplayName
}) => {
  const { t, locale } = useLanguage();
  const { categories } = useCategories();
  const { activeWallets, wallets: allWallets } = useWallets();
  const locationState = useLocation().state as { filterWalletId?: string } | null;
  const { user } = useAuth();

  const [displayName, setDisplayName] = useState<string>(userDisplayName || "");

  useEffect(() => {
    if (userDisplayName) setDisplayName(userDisplayName);
  }, [userDisplayName]);

  useEffect(() => {
    if (userDisplayName || !user) return;
    supabase.from("users").select("display_name").eq("id", user.id).single()
      .then(({ data, error }) => {
        if (!error && data?.display_name) setDisplayName(data.display_name);
      });
  }, [user, userDisplayName]);

  const currentUser: UserSession = {
    id: user?.id || "",
    display_name: displayName || user?.user_metadata?.full_name || t("admin.guest_user"),
    is_guest: user?.is_anonymous || false,
    preferred_language: "id",
    preferred_theme: "dark_obsidian"
  };
  const { showToast } = useToast();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [search, setSearch] = useState("");
  const [filterMonth, setFilterMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterWalletId, setFilterWalletId] = useState<string | null>(
    (locationState as any)?.filterWalletId || null
  );
  const [pageSize, setPageSize] = useState<number | "all">(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState("");
  const [editTarget, setEditTarget] = useState<Transaction | null>(null);
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { isPremium, refresh: refreshPremium } = usePremium();
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isSummaryConfirmOpen, setIsSummaryConfirmOpen] = useState(false);
  const [isFullExportOpen, setIsFullExportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const monthOptions = (() => {
    const list = [];
    const d = new Date();
    for (let i = 0; i < 18; i++) {
      const monthDate = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const valStr = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
      const locMonth = t(`months.m${monthDate.getMonth() + 1}`);
      list.push({ value: valStr, label: `${locMonth} ${monthDate.getFullYear()}` });
    }
    return list;
  })();

  const loadTransactions = async () => {
    try {
      const data = await dbService.getTransactions(currentUser.id, filterMonth);
      setTransactions(data);
    } catch (err) {
      console.error("History load error:", err);
    }
  };

  useEffect(() => {
    if (currentUser.id) loadTransactions();
    setCurrentPage(1);
  }, [filterMonth, currentUser.id, transactionsUpdatedTrigger]);

  // ── Derived stats ────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const income = transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expense = transactions.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    return { income, expense, net: income - expense };
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    let result = transactions;
    if (filterType !== "all") result = result.filter(tx => tx.type === filterType);
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(tx => {
        const matchesNote = tx.note && tx.note.toLowerCase().includes(s);
        const cat = categories.find(c => c.key === tx.category);
        const catLabel = cat ? (locale === "id" ? (cat.label_id || cat.key) : (cat.label_en || cat.key)) : tx.category;
        return matchesNote || catLabel.toLowerCase().includes(s);
      });
    }
    if (filterCategory !== "all") result = result.filter(tx => tx.category === filterCategory);
    if (filterWalletId) result = result.filter(tx => tx.wallet_id === filterWalletId);
    return result;
  }, [search, filterCategory, filterType, filterWalletId, transactions, categories, locale]);

  useEffect(() => { setCurrentPage(1); }, [search, filterCategory, filterType, filterWalletId]);

  const filteredWalletName = filterWalletId
    ? allWallets.find(w => w.id === filterWalletId)?.name
    : null;

  const totalItems = filteredTransactions.length;
  const computedPageSize = pageSize === "all" ? totalItems || 1 : pageSize;
  const totalPages = Math.max(1, Math.ceil(totalItems / computedPageSize));
  const paginatedTransactions = pageSize === "all"
    ? filteredTransactions
    : filteredTransactions.slice((currentPage - 1) * computedPageSize, currentPage * computedPageSize);

  const handleDeleteItem = (id: string) => { audioFeedback.playDullPluck(); setDeleteTargetId(id); };
  const handleEditItem = (tx: Transaction) => { audioFeedback.playClick(); setEditTarget(tx); };

  const executeEditSave = async (id: string, category: string, amount: number, transactionDate: string, walletId: string | null) => {
    setIsEditSaving(true);
    try {
      await dbService.updateTransaction(currentUser.id, id, { category, amount, transaction_date: transactionDate, wallet_id: walletId });
      audioFeedback.playChime();
      showToast(t("toast.success_update"), "success");
      setEditTarget(null);
      onTransactionUpdated();
    } catch (err) {
      audioFeedback.playDullPluck();
      showToast(t("toast.error_general"), "error");
    } finally {
      setIsEditSaving(false);
    }
  };

  const executeDeleteItem = async () => {
    if (!deleteTargetId) return;
    setIsLoading(true);
    try {
      const res = await dbService.deleteTransaction(currentUser.id, deleteTargetId);
      if (res) { audioFeedback.playChime(); showToast(t("toast.success_delete"), "success"); onTransactionUpdated(); }
      else { audioFeedback.playDullPluck(); showToast(t("toast.error_general"), "error"); }
      setDeleteTargetId(null);
    } catch { showToast(t("toast.error_general"), "error"); }
    finally { setIsLoading(false); }
  };

  const executeDeleteAll = async () => {
    if (deleteAllConfirmText.toUpperCase() !== "HAPUS") {
      audioFeedback.playDullPluck();
      showToast(t("toast.invalid_delete_word"), "error");
      return;
    }
    setIsDeleteAllOpen(false);
    setIsLoading(true);
    try {
      await dbService.purgeAllTransactions(currentUser.id);
      audioFeedback.playChime();
      showToast(t("toast.success_delete_all"), "success");
      setDeleteAllConfirmText("");
      onTransactionUpdated();
    } catch { showToast(t("toast.error_general"), "error"); }
    finally { setIsLoading(false); }
  };

  const formatIDR = (num: number) => "Rp" + Math.round(num).toLocaleString("id-ID");
  const formatDateLabel = (dateStr: string) => {
    try {
      const parts = dateStr.split("-");
      if (parts.length === 3) return `${parts[2]} ${t(`months.m${parseInt(parts[1])}`)} ${parts[0]}`;
      return dateStr;
    } catch { return dateStr; }
  };
  const getSourceIconLabel = (source: "manual" | "ai_web" | "telegram") => {
    if (source === "manual") return t("transaction.source_manual");
    if (source === "ai_web") return t("transaction.source_ai_web");
    return t("transaction.source_telegram");
  };

  const handleExportSummary = async (walletId: string | null) => {
    setIsSummaryConfirmOpen(false);
    setIsExporting(true);
    audioFeedback.playClick();
    try {
      const { start, end } = getCurrentMonthToDateRange();
      const data = await dbService.getTransactionsBetween(currentUser.id, toISODate(start), toISODate(end));
      const filename = exportSummaryPdf({ t, userName: currentUser.display_name, transactions: data, categories, wallets: allWallets, walletId });
      audioFeedback.playChime();
      showToast(t("export.success_export", { filename }), "success");
    } catch { audioFeedback.playDullPluck(); showToast(t("export.error_export"), "error"); }
    finally { setIsExporting(false); }
  };

  const handleExportFull = async (fromMonth: string, toMonth: string, walletId: string | null) => {
    setIsExporting(true);
    audioFeedback.playClick();
    try {
      const [ty, tm] = toMonth.split("-").map(Number);
      const lastDay = new Date(ty, tm, 0).getDate();
      const data = await dbService.getTransactionsBetween(currentUser.id, `${fromMonth}-01`, `${toMonth}-${String(lastDay).padStart(2, "0")}`);
      const filename = exportFullPdf({ t, userName: currentUser.display_name, transactions: data, categories, fromMonth, toMonth, wallets: allWallets, walletId });
      audioFeedback.playChime();
      showToast(t("export.success_export", { filename }), "success");
      setIsFullExportOpen(false);
    } catch { audioFeedback.playDullPluck(); showToast(t("export.error_export"), "error"); }
    finally { setIsExporting(false); }
  };

  const currentMonthRangeLabel = (() => {
    const { start, end } = getCurrentMonthToDateRange();
    return { start: toISODate(start), end: toISODate(end) };
  })();

  return (
    <div className="space-y-5">

      {/* ── Header card ─────────────────────────────────────────────── */}
      <div className="rounded-3xl border bg-slate-900 border-slate-800/60 light_sakura:bg-white light_sakura:border-rose-100/40 shadow-lg overflow-hidden">
        {/* Accent stripe */}
        <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-600" />
        <div className="p-6 md:p-8 space-y-6">

          <HistoryExport
            isExportMenuOpen={isExportMenuOpen}
            setIsExportMenuOpen={setIsExportMenuOpen}
            setIsSummaryConfirmOpen={setIsSummaryConfirmOpen}
            setIsFullExportOpen={setIsFullExportOpen}
            setIsDeleteAllOpen={setIsDeleteAllOpen}
            hasTransactions={transactions.length > 0}
            onRequirePremium={() => setIsPremiumOpen(true)}
          />

          {/* ── Stat bar ────────────────────────────────────────────── */}
          {transactions.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-red-500/8 border border-red-500/15 px-3 py-3 light_sakura:bg-red-50/60 light_sakura:border-red-100">
                <div className="flex items-start gap-1.5 mb-1 min-h-[1.9rem]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 light_sakura:text-slate-400 leading-tight break-words">
                    {t("dashboard.expense")}
                  </span>
                </div>
                <p className="font-bold text-[11px] leading-tight whitespace-nowrap tabular-nums tracking-tight text-red-400 light_sakura:text-red-600">
                  −{formatIDR(stats.expense)}
                </p>
              </div>
              <div className="rounded-2xl bg-emerald-500/8 border border-emerald-500/15 px-3 py-3 light_sakura:bg-emerald-50/60 light_sakura:border-emerald-100">
                <div className="flex items-start gap-1.5 mb-1 min-h-[1.9rem]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 light_sakura:text-slate-400 leading-tight break-words">
                    {t("dashboard.income")}
                  </span>
                </div>
                <p className="font-bold text-[11px] leading-tight whitespace-nowrap tabular-nums tracking-tight text-emerald-400 light_sakura:text-emerald-600">
                  +{formatIDR(stats.income)}
                </p>
              </div>
              <div className={`rounded-2xl px-3 py-3 border ${
                stats.net >= 0
                  ? "bg-indigo-500/8 border-indigo-500/15 light_sakura:bg-indigo-50/60 light_sakura:border-indigo-100"
                  : "bg-orange-500/8 border-orange-500/15 light_sakura:bg-orange-50/60 light_sakura:border-orange-100"
              }`}>
                <div className="flex items-start gap-1.5 mb-1 min-h-[1.9rem]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 light_sakura:text-slate-400 leading-tight break-words">
                    {t("dashboard.balance")}
                  </span>
                </div>
                <p className={`font-bold text-[11px] leading-tight whitespace-nowrap tabular-nums tracking-tight ${
                  stats.net >= 0 ? "text-indigo-400 light_sakura:text-indigo-600" : "text-orange-400 light_sakura:text-orange-600"
                }`}>
                  {stats.net >= 0 ? "+" : ""}{formatIDR(stats.net)}
                </p>
              </div>
            </div>
          )}

          {/* ── Filters ─────────────────────────────────────────────── */}
          {/* Type quick-filter pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {(["all", "expense", "income"] as const).map((ft) => (
              <button
                key={ft}
                onClick={() => setFilterType(ft)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  filterType === ft
                    ? ft === "expense"
                      ? "bg-red-500/15 border-red-500/50 text-red-400 light_sakura:bg-red-50 light_sakura:border-red-300 light_sakura:text-red-600"
                      : ft === "income"
                      ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-400 light_sakura:bg-emerald-50 light_sakura:border-emerald-300 light_sakura:text-emerald-600"
                      : "bg-indigo-500/15 border-indigo-500/50 text-indigo-400 light_sakura:bg-indigo-50 light_sakura:border-indigo-300 light_sakura:text-indigo-600"
                    : "bg-slate-800/40 border-slate-700/40 text-slate-500 hover:text-slate-300 light_sakura:bg-slate-50 light_sakura:border-rose-100 light_sakura:text-slate-400 light_sakura:hover:text-slate-600"
                }`}
              >
                {ft === "all" ? t("history.filter_all") ?? "Semua" : ft === "expense" ? t("transaction.expense") : t("transaction.income")}
              </button>
            ))}
          </div>

          {filterWalletId && (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-sans font-semibold light_sakura:bg-rose-50 light_sakura:border-rose-200 light_sakura:text-rose-600">
              <span>{t("wallet.label_pos")}: {filteredWalletName || "-"}</span>
              <button
                onClick={() => setFilterWalletId(null)}
                className="ml-auto underline underline-offset-2 cursor-pointer"
              >
                {t("common.clear") ?? "Hapus filter"}
              </button>
            </div>
          )}

          <HistoryFilter
            filterMonth={filterMonth}
            setFilterMonth={setFilterMonth}
            monthOptions={monthOptions}
            search={search}
            setSearch={setSearch}
            pageSize={pageSize}
            setPageSize={setPageSize}
            filterCategory={filterCategory}
            setFilterCategory={setFilterCategory}
            categories={categories}
          />

          <HistoryGroupedList
            paginatedTransactions={paginatedTransactions}
            formatDateLabel={formatDateLabel}
            formatIDR={formatIDR}
            getSourceIconLabel={getSourceIconLabel}
            onDeleteItem={handleDeleteItem}
            onEditItem={handleEditItem}
            categories={categories}
          />

          <HistoryPagination
            totalPages={totalPages}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            paginatedCount={paginatedTransactions.length}
            totalItems={totalItems}
          />
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────── */}
      <HistoryDeleteModal
        deleteTargetId={deleteTargetId}
        setDeleteTargetId={setDeleteTargetId}
        transactions={transactions}
        categories={categories}
        formatIDR={formatIDR}
        onConfirmSingleDelete={executeDeleteItem}
        isDeleteAllOpen={isDeleteAllOpen}
        setIsDeleteAllOpen={setIsDeleteAllOpen}
        deleteAllConfirmText={deleteAllConfirmText}
        setDeleteAllConfirmText={setDeleteAllConfirmText}
        onConfirmDeleteAll={executeDeleteAll}
      />

      <HistoryEditModal
        transaction={editTarget}
        onClose={() => setEditTarget(null)}
        onSave={executeEditSave}
        isSaving={isEditSaving}
      />

      <ExportSummaryModal
        isOpen={isSummaryConfirmOpen}
        periodLabel={currentMonthRangeLabel}
        onGenerate={handleExportSummary}
        onCancel={() => { audioFeedback.playClick(); setIsSummaryConfirmOpen(false); }}
        isGenerating={isExporting}
      />

      <ExportFullModal
        isOpen={isFullExportOpen}
        monthOptions={monthOptions}
        onCancel={() => setIsFullExportOpen(false)}
        onGenerate={handleExportFull}
        isGenerating={isExporting}
      />

      <AnimatePresence>
        {isLoading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[60] flex flex-col items-center justify-center p-6"
          >
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 p-8 rounded-3xl flex flex-col items-center max-w-xs w-full text-center shadow-2xl light_sakura:bg-white light_sakura:border-rose-100"
            >
              <div className="relative w-20 h-20 mb-6 flex items-center justify-center">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 border-4 border-t-indigo-500 border-r-teal-400 border-b-transparent border-l-transparent rounded-full" />
                <motion.div animate={{ rotate: -360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                  className="absolute w-12 h-12 border-4 border-t-rose-500 border-r-transparent border-b-amber-400 border-l-transparent rounded-full" />
                <Trash2 className="text-red-400" size={20} />
              </div>
              <h3 className="font-sans font-bold text-base text-white mb-2 light_sakura:text-slate-900">{t("history.ledger_sync_title")}</h3>
              <p className="font-sans text-xs text-slate-400 leading-relaxed light_sakura:text-slate-600">{t("history.ledger_sync_desc")}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <PremiumModal isOpen={isPremiumOpen} onClose={() => setIsPremiumOpen(false)} onPremiumActivated={() => { refreshPremium(); }} />
    </div>
  );
};
