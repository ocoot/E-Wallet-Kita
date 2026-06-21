import React, { useState, useEffect } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { dbService } from "../lib/db";
import { UserSession, Transaction } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { Modal } from "../components/Modal";
import { EmptyState } from "../components/EmptyState";
import { 
  Calendar, 
  Trash2, 
  AlertTriangle, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  Sparkles,
  ArrowUpRight,
  ArrowDownLeft,
  XCircle,
  FileSpreadsheet
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { audioFeedback } from "../lib/audio";

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

  // Available Month-Year options (generate for current year & previous year for dynamic dropdown)
  const monthOptions = (() => {
    const list = [];
    const d = new Date();
    const currentYear = d.getFullYear(); // 2026 as per local time
    
    // Generate previous 12 months select options
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

  return (
    <div className="space-y-6">
      
      {/* 1. Header Banner & purge entire log option */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-sans font-bold text-2xl tracking-tight text-white light_sakura:text-slate-900">
            {t("history.title")}
          </h2>
          <p className="font-sans text-sm text-gray-400 mt-1 light_sakura:text-slate-500">
            Mencakup daftar pemasukan dan pengeluaran Anda tiap bulan secara urut.
          </p>
        </div>
        
        {transactions.length > 0 && (
          <button
            onClick={() => setIsDeleteAllOpen(true)}
            className="cursor-pointer px-4.5 py-3 border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors self-start md:self-center"
          >
            <Trash2 size={15} />
            <span>{t("history.btn_delete_all")}</span>
          </button>
        )}
      </div>

      {/* 2. Controls Row: Month filters & Page Sizes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 rounded-3xl border bg-slate-900 border-slate-900 transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 shadow-xs">
        
        {/* Month Selector dropdown */}
        <div className="space-y-1.5">
          <label className="font-sans text-[10px] font-bold text-gray-400 uppercase tracking-wider block light_sakura:text-slate-500">
            {t("history.filter_month")}
          </label>
          <div className="relative">
            <select
              value={filterMonth}
              onChange={(e) => {
                audioFeedback.playClick();
                setFilterMonth(e.target.value);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 font-sans text-xs text-white outline-none focus:border-indigo-500 light_sakura:bg-slate-50 light_sakura:border-rose-100 light_sakura:text-slate-800 cursor-pointer"
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Text Filter search bar */}
        <div className="space-y-1.5">
          <label className="font-sans text-[10px] font-bold text-gray-400 uppercase tracking-wider block light_sakura:text-slate-500">
            Cari Deskripsi
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
              <Search size={14} />
            </span>
            <input
              type="text"
              placeholder={t("history.search_placeholder")}
              value={search}
              onChange={(e) => {
                // Play tiny tick only when starting or clearing filter for lightweight sound feel
                if (!search || !e.target.value) {
                  audioFeedback.playClick();
                }
                setSearch(e.target.value);
              }}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl font-sans text-xs text-white outline-none focus:border-indigo-500 light_sakura:bg-slate-50 light_sakura:border-rose-100 light_sakura:text-slate-800"
            />
          </div>
        </div>

        {/* Dynamic page sizing selector key */}
        <div className="space-y-1.5">
          <label className="font-sans text-[10px] font-bold text-gray-400 uppercase tracking-wider block light_sakura:text-slate-500">
            {t("history.page_size")}
          </label>
          <select
            value={pageSize}
            onChange={(e) => {
              audioFeedback.playClick();
              const val = e.target.value;
              setPageSize(val === "all" ? "all" : parseInt(val));
              setCurrentPage(1); // Reset
            }}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 font-sans text-xs text-white outline-none focus:border-indigo-500 light_sakura:bg-slate-50 light_sakura:border-rose-100 light_sakura:text-slate-800 cursor-pointer"
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={15}>15</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value="all">Tampilkan Semua (All)</option>
          </select>
        </div>

      </div>

      {/* 3. Transaction Data Table/Cards */}
      <div className="bg-slate-900 border border-slate-900 rounded-3xl transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 shadow-sm overflow-hidden">
        
        {paginatedTransactions.length === 0 ? (
          <EmptyState message={t("history.no_transactions")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-sans text-left text-xs">
              
              {/* Header row desktop labels */}
              <thead>
                <tr className="border-b border-slate-800/60 bg-slate-950/20 text-gray-400 uppercase tracking-wider select-none font-bold light_sakura:border-rose-100/60 light_sakura:bg-rose-50/20 light_sakura:text-slate-600">
                  <th className="p-4 pl-6 w-36">{t("history.col_date")}</th>
                  <th className="p-4 w-24">{t("history.col_type")}</th>
                  <th className="p-4 w-36">{t("history.col_category")}</th>
                  <th className="p-4">{t("transaction.label_note")}</th>
                  <th className="p-4 w-32">{t("history.col_amount")}</th>
                  <th className="p-4 w-28 hidden md:table-cell">{t("history.col_source")}</th>
                  <th className="p-4 pr-6 w-20 text-right">{t("history.col_actions")}</th>
                </tr>
              </thead>

              {/* Data Rows */}
              <tbody className="divide-y divide-slate-800/40 light_sakura:divide-rose-100/30">
                <AnimatePresence mode="popLayout">
                  {paginatedTransactions.map((tx, index) => {
                    const isExpense = tx.type === "expense";
                    return (
                      <motion.tr 
                        key={tx.id} 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ 
                          type: "spring",
                          stiffness: 400,
                          damping: 25,
                          delay: Math.min(index * 0.025, 0.2) 
                        }}
                        className="hover:bg-slate-950/15 text-slate-300 transition-all duration-200 light_sakura:text-slate-700 light_sakura:hover:bg-rose-50/20"
                      >
                        {/* Date */}
                        <td className="p-4 pl-6 font-mono font-medium text-slate-400 light_sakura:text-slate-500 shrink-0">
                          {formatDateLabel(tx.transaction_date)}
                        </td>

                        {/* Cashflow Type badge */}
                        <td className="p-4">
                          <span className={`inline-flex px-2 py-1 rounded-md font-bold text-[9px] uppercase tracking-wider
                            ${isExpense 
                              ? "bg-red-500/10 text-red-400 light_sakura:bg-red-50 light_sakura:text-red-500" 
                              : "bg-emerald-500/10 text-emerald-400 light_sakura:bg-emerald-50 light_sakura:text-emerald-500"
                            }`}
                          >
                            {isExpense ? t("transaction.expense") : t("transaction.income")}
                          </span>
                        </td>

                        {/* Category lookup key */}
                        <td className="p-4 font-semibold text-slate-200 light_sakura:text-slate-900">
                          {t(`categories.${tx.category}`)}
                        </td>

                        {/* Description / source details */}
                        <td className="p-4 max-w-sm truncate text-gray-400 light_sakura:text-slate-600 font-medium">
                          {tx.note || <span className="opacity-40 italic">-</span>}
                        </td>

                        {/* Rupiah amounts */}
                        <td className={`p-4 font-mono font-semibold text-sm
                          ${isExpense ? "text-red-400 light_sakura:text-red-600" : "text-emerald-400 light_sakura:text-emerald-600"}`}
                        >
                          {isExpense ? "-" : "+"}
                          {formatIDR(tx.amount)}
                        </td>

                        {/* Source indicator */}
                        <td className="p-4 text-xs font-medium text-slate-500 hidden md:table-cell">
                          <span className="flex items-center gap-1">
                            {tx.source === "telegram" && <Sparkles size={12} className="text-teal-400" />}
                            <span>{getSourceIconLabel(tx.source)}</span>
                          </span>
                        </td>

                        {/* Row Delete option */}
                        <td className="p-4 pr-6 text-right">
                          <button
                            onClick={() => handleDeleteItem(tx.id)}
                            title="Hapus row log ini"
                            className="p-1.5 rounded-lg border border-transparent hover:border-red-500/20 text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer hover:scale-115 active:scale-90"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>

            </table>
          </div>
        )}

        {/* 4. Footer Pagination bars */}
        {totalPages > 1 && (
          <div className="p-4 bg-slate-950/20 border-t border-slate-800/50 flex items-center justify-between font-sans text-xs text-gray-400 light_sakura:bg-rose-50/20 light_sakura:border-rose-100">
            <span>
              Tampil {paginatedTransactions.length} dari {totalItems} baris logs
            </span>

            {/* Pagination Controls */}
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => {
                  audioFeedback.playClick();
                  setCurrentPage(curr => Math.max(1, curr - 1));
                }}
                className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:text-white disabled:opacity-30 disabled:pointer-events-none cursor-pointer light_sakura:bg-white light_sakura:border-rose-100 light_sakura:text-slate-800"
              >
                <ChevronLeft size={14} />
              </button>
              
              <span className="font-mono font-semibold text-slate-300 light_sakura:text-slate-800">
                {currentPage} / {totalPages}
              </span>

              <button
                disabled={currentPage === totalPages}
                onClick={() => {
                  audioFeedback.playClick();
                  setCurrentPage(curr => Math.min(totalPages, curr + 1));
                }}
                className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:text-white disabled:opacity-30 disabled:pointer-events-none cursor-pointer light_sakura:bg-white light_sakura:border-rose-100 light_sakura:text-slate-800"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Confirmation Modal - Single Item */}
      <Modal
        isOpen={deleteTargetId !== null}
        title={t("confirm.delete_item_title")}
        description={t("confirm.delete_item_desc", {
          amount: deleteTargetId ? formatIDR(transactions.find(t => t.id === deleteTargetId)?.amount || 0) : "",
          note: deleteTargetId ? (transactions.find(t => t.id === deleteTargetId)?.note || t(`categories.${transactions.find(t => t.id === deleteTargetId)?.category}`)) : ""
        })}
        type="danger"
        confirmLabel="Hapus Log"
        cancelLabel={t("common.cancel")}
        onConfirm={executeDeleteItem}
        onCancel={() => {
          audioFeedback.playClick();
          setDeleteTargetId(null);
        }}
      />

      {/* Confirmation Modal - Destruction Safety "HAPUS" verification */}
      <AnimatePresence>
        {isDeleteAllOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                audioFeedback.playClick();
                setIsDeleteAllOpen(false);
              }}
              className="fixed inset-0 bg-black/70 backdrop-blur-xs"
            />
            
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative z-10 w-full max-w-md p-6 rounded-2xl bg-slate-900 text-white border border-red-500/30 overflow-hidden light_sakura:bg-white light_sakura:text-slate-800 light_sakura:border-red-200"
            >
              <div className="flex items-center gap-2.5 text-red-100 mb-3 light_sakura:text-red-600">
                <AlertTriangle size={24} />
                <h3 className="font-sans font-bold text-lg">{t("confirm.delete_all_title")}</h3>
              </div>
              
              <p className="font-sans text-xs text-gray-300 leading-relaxed mb-4 block light_sakura:text-slate-600">
                {t("confirm.delete_all_desc")}
              </p>

              {/* Strict Keyword input verify */}
              <input
                type="text"
                placeholder={t("confirm.delete_all_placeholder")}
                value={deleteAllConfirmText}
                onChange={(e) => setDeleteAllConfirmText(e.target.value)}
                className="w-full px-4 py-2 bg-slate-950 border border-slate-800 text-white rounded-xl font-sans text-xs outline-none focus:border-red-500 uppercase font-mono tracking-wider mb-6 light_sakura:bg-slate-100 light_sakura:border-rose-100 light_sakura:text-slate-800"
              />

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    audioFeedback.playClick();
                    setIsDeleteAllOpen(false);
                  }}
                  className="cursor-pointer text-xs font-semibold hover:bg-slate-850 px-4 py-2 rounded-xl text-gray-400 light_sakura:hover:bg-slate-100"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={executeDeleteAll}
                  disabled={deleteAllConfirmText.toUpperCase() !== "HAPUS"}
                  className="cursor-pointer bg-red-600 hover:bg-red-500 disabled:opacity-30 disabled:pointer-events-none px-4.5 py-2.5 text-xs font-bold text-white shadow-lg shadow-red-600/10 rounded-xl"
                >
                  {t("history.btn_delete_all")}
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Premium Full-Screen Loading Screen with multi-layered rotating custom spiral */}
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
              {/* Double nested spiral spirals rotating in opposite directions */}
              <div className="relative w-20 h-20 mb-6 flex items-center justify-center">
                {/* Outermost cyan/indigo spiral */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 border-4 border-t-indigo-500 border-r-teal-400 border-b-transparent border-l-transparent rounded-full"
                />
                
                {/* Innermost warm magenta/rose spiral rotating backwards */}
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                  className="absolute w-12 h-12 border-4 border-t-rose-500 border-r-transparent border-b-amber-400 border-l-transparent rounded-full"
                />

                {/* Sparkling center target */}
                <div className="flex items-center justify-center">
                  <Trash2 className="text-red-400 light_sakura:text-rose-500" size={20} />
                </div>
              </div>

              <h3 className="font-sans font-bold text-base text-white mb-2 light_sakura:text-slate-900">
                Menyelaraskan Ledger
              </h3>
              <p className="font-sans text-xs text-slate-400 leading-relaxed light_sakura:text-slate-600">
                Menghapus entri riwayat dan memperbarui saldo utama dompet Anda...
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
