import React, { useMemo, useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { Transaction, Category } from "../types";
import { Trash2, Send, Pencil, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { motion, AnimatePresence, useMotionValue, animate } from "motion/react";
import { EmptyState } from "./EmptyState";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { springPresets } from "../hooks/useSpringAnimation";

interface HistoryGroupedListProps {
  paginatedTransactions: Transaction[];
  formatDateLabel: (dateStr: string) => string;
  formatIDR: (num: number) => string;
  getSourceIconLabel: (source: "manual" | "ai_web" | "telegram") => string;
  onDeleteItem: (id: string) => void;
  onEditItem: (tx: Transaction) => void;
  categories: Category[];
}

// Lebar total panel aksi (Edit + Hapus) yang terungkap saat item digeser
// ke kiri -- dipakai sebagai batas drag & threshold snap-open.
const SWIPE_ACTIONS_WIDTH = 136;
const SWIPE_ACTION_BTN_WIDTH = SWIPE_ACTIONS_WIDTH / 2;

interface HistoryTransactionRowProps {
  tx: Transaction;
  categoryLabel: string;
  formatIDR: (num: number) => string;
  getSourceIconLabel: (source: "manual" | "ai_web" | "telegram") => string;
  onEditItem: (tx: Transaction) => void;
  onDeleteItem: (id: string) => void;
  openSwipeId: string | null;
  setOpenSwipeId: (id: string | null) => void;
}

// ── Item transaksi dengan swipe-to-delete/edit (P3 3.1) ──
// Pola native list iOS/Android: geser item ke kiri untuk memunculkan aksi
// Edit/Hapus di belakangnya. Tombol Edit/Hapus yang sudah ada sebelumnya
// TETAP dipertahankan apa adanya di baris konten (bukan cuma dipindah ke
// panel swipe) supaya pengguna keyboard/screen reader tetap punya cara
// mengakses aksi ini tanpa perlu melakukan gesture drag.
const HistoryTransactionRow: React.FC<HistoryTransactionRowProps> = ({
  tx,
  categoryLabel,
  formatIDR,
  getSourceIconLabel,
  onEditItem,
  onDeleteItem,
  openSwipeId,
  setOpenSwipeId,
}) => {
  const { tokens, cx } = useThemeTokens();
  const { t } = useLanguage();
  const isExpense = tx.type === "expense";
  const x = useMotionValue(0);
  const isOpen = openSwipeId === tx.id;

  // Tutup panel swipe kalau item lain baru saja dibuka (hanya 1 item boleh
  // terbuka dalam satu waktu -- pola standar list native).
  React.useEffect(() => {
    if (!isOpen && x.get() !== 0) {
      animate(x, 0, springPresets.fluid);
    }
  }, [isOpen, x]);

  const closeSwipe = () => {
    animate(x, 0, springPresets.fluid);
    if (isOpen) setOpenSwipeId(null);
  };

  const handleDragEnd = (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    const shouldOpen = info.offset.x < -SWIPE_ACTIONS_WIDTH / 2 || info.velocity.x < -500;
    if (shouldOpen) {
      animate(x, -SWIPE_ACTIONS_WIDTH, springPresets.fluid);
      setOpenSwipeId(tx.id);
    } else {
      closeSwipe();
    }
  };

  return (
    <motion.div
      key={tx.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="relative overflow-hidden"
    >
      {/* Panel aksi swipe -- di belakang, terungkap saat konten digeser kiri */}
      <div
        className="absolute inset-y-0 right-0 flex"
        style={{ width: SWIPE_ACTIONS_WIDTH }}
        aria-hidden={!isOpen}
      >
        <button
          type="button"
          tabIndex={isOpen ? 0 : -1}
          onClick={() => {
            onEditItem(tx);
            closeSwipe();
          }}
          aria-label={t("common.edit")}
          style={{ width: SWIPE_ACTION_BTN_WIDTH }}
          className={cx(
            "h-full flex flex-col items-center justify-center gap-1 select-none cursor-pointer transition-[filter] active:brightness-90",
            tokens.historyGroupedList.swipeEditBtn
          )}
        >
          <Pencil size={16} />
          <span className="text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold">{t("common.edit")}</span>
        </button>
        <button
          type="button"
          tabIndex={isOpen ? 0 : -1}
          onClick={() => {
            onDeleteItem(tx.id);
            closeSwipe();
          }}
          aria-label={t("common.delete")}
          style={{ width: SWIPE_ACTION_BTN_WIDTH }}
          className={cx(
            "h-full flex flex-col items-center justify-center gap-1 select-none cursor-pointer transition-[filter] active:brightness-90",
            tokens.historyGroupedList.swipeDeleteBtn
          )}
        >
          <Trash2 size={16} />
          <span className="text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold">{t("common.delete")}</span>
        </button>
      </div>

      {/* Konten baris -- digeser lewat drag, tombol Edit/Hapus tap tetap ada */}
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -SWIPE_ACTIONS_WIDTH, right: 0 }}
        dragElastic={0.02}
        dragMomentum={false}
        onDragStart={() => setOpenSwipeId(tx.id)}
        onDragEnd={handleDragEnd}
        onClick={() => {
          if (isOpen) closeSwipe();
        }}
        style={{ x }}
        // P4 4.7: long-press "lift" -- item terangkat (scale-up ringan +
        // shadow naik) selama ditekan-tahan, tanpa context menu native
        // sungguhan, secara visual mengesankan gestur "peek" ala native.
        whileTap={{ scale: 1.015, boxShadow: "0 12px 28px -8px rgba(0,0,0,0.45)" }}
        transition={{ duration: 0.15 }}
        className={cx("relative flex items-center gap-3 p-3.5 transition-colors touch-pan-y", tokens.surface.card, tokens.hover.sunken)}
      >
        {/* Icon lingkaran */}
        <div className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${
          isExpense ? tokens.historyGroupedList.expenseChip
                    : tokens.historyGroupedList.incomeChip
        }`}>
          {isExpense ? <ArrowUpRight size={15} /> : <ArrowDownLeft size={15} />}
        </div>

        {/* Detail */}
        <div className="min-w-0 flex-1">
          <p className={cx("font-sans font-bold text-sm truncate", tokens.text.heading)}>
            {categoryLabel}
          </p>
          <p className={cx("text-[clamp(0.5906rem,2.73vw,0.6562rem)] mt-0.5 truncate flex items-center gap-1", tokens.text.muted)}>
            {tx.source === "telegram" && (
              <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm bg-[#0088cc]/20 text-[#0088cc] shrink-0">
                <Send size={8} className="-translate-x-0.5 translate-y-0.5 rotate-45" />
              </span>
            )}
            {tx.note ? tx.note : getSourceIconLabel(tx.source)}
          </p>
        </div>

        {/* Nominal + actions */}
        <div className="flex items-center gap-1 shrink-0">
          <span className={`font-mono tabular-nums font-bold text-sm ${isExpense ? tokens.text.danger : tokens.text.success}`}>
            {isExpense ? "-" : "+"}{formatIDR(tx.amount)}
          </span>
          <button
            onClick={() => onEditItem(tx)}
            aria-label={t("common.edit")}
            className="btn-mobile-target p-2 rounded-lg text-slate-500 select-none hover:text-indigo-400 hover:bg-indigo-500/10 transition-[transform,background-color,color] cursor-pointer active:scale-90"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => onDeleteItem(tx.id)}
            aria-label={t("common.delete")}
            className="btn-mobile-target p-2 rounded-lg text-slate-500 select-none hover:text-red-400 hover:bg-red-500/10 transition-[transform,background-color,color] cursor-pointer active:scale-90"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Formasi: dikelompokkan per tanggal, ala mutasi rekening m-banking ──
// Menggantikan tabel horizontal-scroll dengan list vertikal yang lebih
// nyaman dibaca di layar HP.
export const HistoryGroupedList: React.FC<HistoryGroupedListProps> = ({
  paginatedTransactions,
  formatDateLabel,
  formatIDR,
  getSourceIconLabel,
  onDeleteItem,
  onEditItem,
  categories,
}) => {
  const { tokens, cx } = useThemeTokens();
  const { t, locale } = useLanguage();
  // Hanya 1 item boleh dalam kondisi "terbuka" (panel swipe terungkap)
  // dalam satu waktu, dikelola di level list supaya menggeser item lain
  // otomatis menutup item yang sebelumnya terbuka.
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const tx of paginatedTransactions) {
      const key = tx.transaction_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(tx);
    }
    return Array.from(map.entries());
  }, [paginatedTransactions]);

  const getCategoryLabel = (key: string) => {
    const cat = categories.find(c => c.key === key);
    if (!cat) return key;
    return locale === "id" ? (cat.label_id || cat.key) : (cat.label_en || cat.key);
  };

  if (paginatedTransactions.length === 0) {
    return (
      <div className={cx("border rounded-2xl", tokens.border.accent, tokens.surface.sunken)}>
        <EmptyState message={t("history.no_transactions")} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map(([date, txs]) => (
        <div key={date}>
          <div className={cx("text-[clamp(0.5906rem,2.73vw,0.6562rem)] font-bold uppercase tracking-widest mb-2 px-1", tokens.text.muted)}>
            {formatDateLabel(date)}
          </div>
          <div className={cx("rounded-2xl border overflow-hidden divide-y", tokens.border.accent, tokens.surface.sunken, tokens.historyGroupedList.divideSubtle)}>
            <AnimatePresence mode="popLayout">
              {txs.map(tx => (
                <HistoryTransactionRow
                  key={tx.id}
                  tx={tx}
                  categoryLabel={getCategoryLabel(tx.category)}
                  formatIDR={formatIDR}
                  getSourceIconLabel={getSourceIconLabel}
                  onEditItem={onEditItem}
                  onDeleteItem={onDeleteItem}
                  openSwipeId={openSwipeId}
                  setOpenSwipeId={setOpenSwipeId}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      ))}
    </div>
  );
};
