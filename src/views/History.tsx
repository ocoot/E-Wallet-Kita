import React, { useState, useEffect } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { dbService } from "../lib/db";
import { UserSession, Transaction } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { Modal } from "../components/Modal";
import { ExportFullModal } from "../components/ExportFullModal";
import { Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { audioFeedback } from "../lib/audio";
import { exportSummaryPdf, exportFullPdf } from "../lib/pdf/exportPdf";
import { getCurrentMonthToDateRange, toISODate } from "../lib/pdf/dateRange";

import { HistoryFilter } from "../components/HistoryFilter";
import { HistoryTable } from "../components/HistoryTable";
import { HistoryPagination } from "../components/HistoryPagination";
import { HistoryExport } from "../components/HistoryExport";
import { HistoryDeleteModal } from "../components/HistoryDeleteModal";
import { usePremium } from "../hooks/usePremium";
import { PremiumModal } from "../components/PremiumModal";

interface HistoryProps {
  transactionsUpdatedTrigger: number;
  onTransactionUpdated: () => void;
}

export const History: React.FC<HistoryProps> = ({
  transactionsUpdatedTrigger,
  onTransactionUpdated
}) => {
  const { user } = useAuth();
  const currentUser: UserSession = {
    id: user?.id || "",
    display_name: user?.user_metadata?.full_name || "User",
    is_guest: user?.is_anonymous || false,
    preferred_language: "id",
    preferred_theme: "dark_obsidian"
  };
  const { t } = useLanguage();
  const { showToast } = useToast();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  
  // Search and Filter states
  const [search, setSearch] = useState("");
  const [filterMonth, setFilterMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; // current YearMonth YYYY-MM
  });

  // Pagination states
  const [pageSize, setPageSize] = useState<number | "all">(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Destruction state parameters
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState("");
  
  // Loading indicators
  const [isLoading, setIsLoading] = useState(false);

  // Premium status & modal state
  const { isPremium, refresh: refreshPremium } = usePremium();
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);

  // Export PDF states
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isSummaryConfirmOpen, setIsSummaryConfirmOpen] = useState(false);
  const [isFullExportOpen, setIsFullExportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Available Month-Year options (generate for current year & previous year for dynamic dropdown)
  const monthOptions = (() => {
    const list = [];
    const d = new Date();
    const currentYear = d.getFullYear(); // 2026 as per local time
    
    // Generate previous 18 months select options
    for (let i = 0; i < 18; i++) {
      const monthDate = new Date(currentYear, d.getMonth() - i, 1);
      const valStr = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
      
      // Localized name
      const locMonth = t(`months.m${monthDate.getMonth() + 1}`);
      const labelStr = `${locMonth} ${monthDate.getFullYear()}`;
      list.push({ value: valStr, label: labelStr });
    }
    return list;
  })();

  // Fetch transactions based on Month filter
  const loadTransactions = async () => {
    try {
      const data = await dbService.getTransactions(currentUser.id, filterMonth);
      setTransactions(data);
    } catch (err) {
      console.error('History load error:', err);
    }
  };

  useEffect(() => {
    if (currentUser.id) {
      loadTransactions();
    }
    setCurrentPage(1); // reset page on filter change
  }, [filterMonth, currentUser.id, transactionsUpdatedTrigger]);

  // Apply quick text search filter locally
  useEffect(() => {
    let result = transactions;
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(item => {
        const matchesNote = item.note && item.note.toLowerCase().includes(s);
        const matchesCategory = t(`categories.${item.category}`).toLowerCase().includes(s);
        return matchesNote || matchesCategory;
      });
    }
    setFilteredTransactions(result);
    setCurrentPage(1); // Reset page on query search
  }, [search, transactions]);

  // Page index math calculations
  const totalItems = filteredTransactions.length;
  const computedPageSize = pageSize === "all" ? totalItems || 1 : pageSize;
  const totalPages = Math.max(1, Math.ceil(totalItems / computedPageSize));
  
  const paginatedTransactions = (() => {
    if (pageSize === "all") return filteredTransactions;
    const offset = (currentPage - 1) * computedPageSize;
    return filteredTransactions.slice(offset, offset + computedPageSize);
  })();

  const handleDeleteItem = (id: string) => {
    audioFeedback.playDullPluck();
    setDeleteTargetId(id);
  };

  const executeDeleteItem = async () => {
    if (!deleteTargetId) return;
    setIsLoading(true);

    try {
      const res = await dbService.deleteTransaction(currentUser.id, deleteTargetId);
      if (res) {
        audioFeedback.playChime();
        showToast(t("toast.success_delete"), "success");
        onTransactionUpdated();
      } else {
        audioFeedback.playDullPluck();
        showToast(t("toast.error_general"), "error");
      }
      setDeleteTargetId(null);
    } catch (err) {
      console.error(err);
      showToast(t("toast.error_general"), "error");
    } finally {
      setIsLoading(false);
    }
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
    } catch (err) {
      console.error(err);
      showToast(t("toast.error_general"), "error");
    } finally {
      setIsLoading(false);
    }
  };

  const formatIDR = (num: number) => {
    return "Rp" + Math.round(num).toLocaleString("id-ID");
  };

  const formatDateLabel = (dateStr: string) => {
    // Convert YYYY-MM-DD cleanly
    try {
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        const mIdx = parseInt(parts[1]);
        return `${parts[2]} ${t(`months.m${mIdx}`)} ${parts[0]}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  const getSourceIconLabel = (source: "manual" | "ai_web" | "telegram") => {
    if (source === "manual") return t("transaction.source_manual");
    if (source === "ai_web") return t("transaction.source_ai_web");
    return t("transaction.source_telegram");
  };

  // ---- PDF Export handlers ----

  const handleExportSummary = async () => {
    setIsSummaryConfirmOpen(false);
    setIsExporting(true);
    audioFeedback.playClick();
    try {
      const { start, end } = getCurrentMonthToDateRange();
      const data = await dbService.getTransactionsBetween(
        currentUser.id,
        toISODate(start),
        toISODate(end)
      );
      const filename = exportSummaryPdf({ t, userName: currentUser.display_name, transactions: data });
      audioFeedback.playChime();
      showToast(t("export.success_export", { filename }), "success");
    } catch (err) {
      console.error("Export summary PDF error:", err);
      audioFeedback.playDullPluck();
      showToast(t("export.error_export"), "error");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportFull = async (fromMonth: string, toMonth: string) => {
    setIsExporting(true);
    audioFeedback.playClick();
    try {
      const [ty, tm] = toMonth.split("-").map(Number);
      const lastDay = new Date(ty, tm, 0).getDate();
      const startDate = `${fromMonth}-01`;
      const endDate = `${toMonth}-${String(lastDay).padStart(2, "0")}`;

      const data = await dbService.getTransactionsBetween(currentUser.id, startDate, endDate);
      const filename = exportFullPdf({
        t,
        userName: currentUser.display_name,
        transactions: data,
        fromMonth,
        toMonth,
      });
      audioFeedback.playChime();
      showToast(t("export.success_export", { filename }), "success");
      setIsFullExportOpen(false);
    } catch (err) {
      console.error("Export full PDF error:", err);
      audioFeedback.playDullPluck();
      showToast(t("export.error_export"), "error");
    } finally {
      setIsExporting(false);
    }
  };

  const currentMonthRangeLabel = (() => {
    const { start, end } = getCurrentMonthToDateRange();
    return { start: toISODate(start), end: toISODate(end) };
  })();

  return (
    <div className="space-y-6">
      
      {/* Massive Cohesive Card Container */}
      <div className="p-6 md:p-8 rounded-3xl border bg-slate-900 border-slate-900 transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 shadow-lg space-y-6">
        
        {/* 1. Header Banner & reports menu exports */}
        <HistoryExport 
          isExportMenuOpen={isExportMenuOpen}
          setIsExportMenuOpen={setIsExportMenuOpen}
          setIsSummaryConfirmOpen={setIsSummaryConfirmOpen}
          setIsFullExportOpen={setIsFullExportOpen}
          setIsDeleteAllOpen={setIsDeleteAllOpen}
          hasTransactions={transactions.length > 0}
          onRequirePremium={() => setIsPremiumOpen(true)}
        />

        {/* 2. Month selector search & filters controls */}
        <HistoryFilter 
          filterMonth={filterMonth}
          setFilterMonth={setFilterMonth}
          monthOptions={monthOptions}
          search={search}
          setSearch={setSearch}
          pageSize={pageSize}
          setPageSize={setPageSize}
        />

        {/* 3. Transaction Data Table/Cards */}
        <HistoryTable 
          paginatedTransactions={paginatedTransactions}
          formatDateLabel={formatDateLabel}
          formatIDR={formatIDR}
          getSourceIconLabel={getSourceIconLabel}
          onDeleteItem={handleDeleteItem}
        />

        {/* 4. Footer Pagination bars */}
        <HistoryPagination 
          totalPages={totalPages}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          paginatedCount={paginatedTransactions.length}
          totalItems={totalItems}
        />

      </div> {/* massive cohesive card container */}

      {/* 5. Modals and prompt verifications */}
      <HistoryDeleteModal 
        deleteTargetId={deleteTargetId}
        setDeleteTargetId={setDeleteTargetId}
        transactions={transactions}
        formatIDR={formatIDR}
        onConfirmSingleDelete={executeDeleteItem}
        isDeleteAllOpen={isDeleteAllOpen}
        setIsDeleteAllOpen={setIsDeleteAllOpen}
        deleteAllConfirmText={deleteAllConfirmText}
        setDeleteAllConfirmText={setDeleteAllConfirmText}
        onConfirmDeleteAll={executeDeleteAll}
      />

      {/* Confirmation Modal - Export Summary PDF */}
      <Modal
        isOpen={isSummaryConfirmOpen}
        title={t("export.summary_confirm_title")}
        description={t("export.summary_confirm_desc", {
          start: currentMonthRangeLabel.start,
          end: currentMonthRangeLabel.end,
        })}
        type="info"
        confirmLabel={t("export.confirm_export")}
        cancelLabel={t("common.cancel")}
        onConfirm={handleExportSummary}
        onCancel={() => {
          audioFeedback.playClick();
          setIsSummaryConfirmOpen(false);
        }}
        confirmDisabled={isExporting}
      />

      {/* Export Full PDF range-picker modal */}
      <ExportFullModal
        isOpen={isFullExportOpen}
        monthOptions={monthOptions}
        onCancel={() => setIsFullExportOpen(false)}
        onGenerate={handleExportFull}
        isGenerating={isExporting}
      />

      {/* Premium Full-Screen Loading Screen */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[60] flex flex-col items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 p-8 rounded-3xl flex flex-col items-center max-w-xs w-full text-center shadow-2xl relative overflow-hidden light_sakura:bg-white light_sakura:border-rose-100"
            >
              {/* Double nested spiral spirals */}
              <div className="relative w-20 h-20 mb-6 flex items-center justify-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 border-4 border-t-indigo-500 border-r-teal-400 border-b-transparent border-l-transparent rounded-full"
                />
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                  className="absolute w-12 h-12 border-4 border-t-rose-500 border-r-transparent border-b-amber-400 border-l-transparent rounded-full"
                />
                <div className="flex items-center justify-center">
                  <Trash2 className="text-red-400 light_sakura:text-rose-500" size={20} />
                </div>
              </div>

              <h3 className="font-sans font-bold text-base text-white mb-2 light_sakura:text-slate-900">
                {t("history.ledger_sync_title")}
              </h3>
              <p className="font-sans text-xs text-slate-400 leading-relaxed light_sakura:text-slate-600">
                {t("history.ledger_sync_desc")}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <PremiumModal 
        isOpen={isPremiumOpen}
        onClose={() => setIsPremiumOpen(false)}
        onPremiumActivated={() => {
          refreshPremium();
        }}
      />

    </div>
  );
};
