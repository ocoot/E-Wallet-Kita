import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  ArrowDownLeft,
  ArrowUpRight,
  Snowflake,
  Heart,
  Leaf,
  CloudRain,
  Flower2,
  Sun,
  Flag,
  Wind,
  CloudFog,
  Sparkles,
  PartyPopper,
  Cake,
} from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { useCategories } from "../hooks/useCategories";
import { dbService } from "../lib/db";
import { Transaction } from "../types";
import { fetchHolidays, NagerHoliday } from "../api/eventCalendar";
import { audioFeedback } from "../lib/audio";
import { ErrorState } from "../components/ErrorState";
import { supabase } from "../lib/supabase";
import { isBirthdayOnDate } from "../lib/birthday";

interface CalendarPageProps {
  transactionsUpdatedTrigger?: number;
}

/**
 * Tema visual per bulan -- gradient + ikon dekoratif untuk kartu "hero"
 * kalender, meniru referensi (Januari=musim dingin, Mei=musim semi,
 * September=golden hour). Karena app ini tidak punya aset ilustrasi asli
 * per bulan, tema dibuat dari gradient Tailwind + 1 ikon besar (lucide)
 * supaya tetap terasa "bermusim" tanpa bergantung gambar pihak ketiga.
 */
const MONTH_THEMES: { gradient: string; icon: any; iconClass: string; glow: string }[] = [
  { gradient: "from-slate-900 via-blue-950 to-indigo-950", icon: Snowflake, iconClass: "text-sky-300", glow: "bg-sky-500/20" }, // Jan
  { gradient: "from-rose-950 via-fuchsia-950 to-slate-900", icon: Heart, iconClass: "text-rose-300", glow: "bg-rose-500/20" }, // Feb
  { gradient: "from-emerald-950 via-teal-900 to-slate-900", icon: Leaf, iconClass: "text-emerald-300", glow: "bg-emerald-500/20" }, // Mar
  { gradient: "from-slate-900 via-cyan-950 to-slate-900", icon: CloudRain, iconClass: "text-cyan-300", glow: "bg-cyan-500/20" }, // Apr
  { gradient: "from-pink-950 via-rose-900 to-emerald-950", icon: Flower2, iconClass: "text-pink-300", glow: "bg-pink-500/20" }, // May
  { gradient: "from-amber-950 via-orange-900 to-slate-900", icon: Sun, iconClass: "text-amber-300", glow: "bg-amber-500/20" }, // Jun
  { gradient: "from-sky-950 via-cyan-900 to-blue-950", icon: Sun, iconClass: "text-yellow-300", glow: "bg-yellow-400/20" }, // Jul
  { gradient: "from-red-950 via-rose-950 to-slate-900", icon: Flag, iconClass: "text-red-300", glow: "bg-red-500/20" }, // Aug
  { gradient: "from-orange-950 via-amber-900 to-slate-900", icon: Leaf, iconClass: "text-orange-300", glow: "bg-orange-500/20" }, // Sep
  { gradient: "from-amber-950 via-orange-950 to-rose-950", icon: Wind, iconClass: "text-amber-300", glow: "bg-orange-500/20" }, // Oct
  { gradient: "from-slate-900 via-slate-800 to-zinc-900", icon: CloudFog, iconClass: "text-slate-300", glow: "bg-slate-400/10" }, // Nov
  { gradient: "from-indigo-950 via-slate-900 to-blue-950", icon: Sparkles, iconClass: "text-indigo-300", glow: "bg-indigo-500/20" }, // Dec
];

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const CalendarPage: React.FC<CalendarPageProps> = ({ transactionsUpdatedTrigger }) => {
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  const { tokens, cx } = useThemeTokens();
  const { categories } = useCategories();
  const navigate = useNavigate();

  const today = useMemo(() => new Date(), []);
  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string>(toISODate(today));
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [holidays, setHolidays] = useState<NagerHoliday[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [holidaysLoading, setHolidaysLoading] = useState(false);
  // Tanggal lahir (opsional, diisi di Kelola Profil) -- dipakai untuk
  // menandai "Ulang Tahun Anda" berulang tiap tahun di grid kalender ini.
  // Disimpan mentah (YYYY-MM-DD); logic pergeseran 29 Feb -> 1 Mar di
  // tahun non-kabisat ada di src/lib/birthday.ts (SATU sumber kebenaran,
  // dipakai juga oleh banner in-app di App.tsx).
  const [birthDateRaw, setBirthDateRaw] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    supabase
      .from("users")
      .select("birth_date")
      .eq("id", user.id)
      .single()
      .then(({ data, error }) => {
        if (cancelled || error) return;
        setBirthDateRaw(data?.birth_date || null);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  const isBirthday = useCallback(
    (dateStr: string) => isBirthdayOnDate(birthDateRaw, dateStr),
    [birthDateRaw]
  );

  const theme = MONTH_THEMES[viewDate.getMonth()];
  const ThemeIcon = theme.icon;

  // ── Fetch transaksi untuk bulan yang sedang dilihat ──────────────────
  const loadMonth = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await dbService.getTransactions(user.id, monthKey(viewDate));
      setTransactions(data);
    } catch (err) {
      setLoadError(err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, viewDate]);

  useEffect(() => { loadMonth(); }, [loadMonth, transactionsUpdatedTrigger]);

  // ── Fetch hari libur nasional (ID) untuk tahun yang sedang dilihat ───
  useEffect(() => {
    let cancelled = false;
    setHolidaysLoading(true);
    fetchHolidays("ID", viewDate.getFullYear())
      .then((data) => { if (!cancelled) setHolidays(data); })
      .catch(() => { if (!cancelled) setHolidays([]); })
      .finally(() => { if (!cancelled) setHolidaysLoading(false); });
    return () => { cancelled = true; };
  }, [viewDate.getFullYear()]);

  // Reset tanggal terpilih ke tanggal 1 (atau hari ini kalau bulan aktif)
  // setiap kali pindah bulan, supaya panel bawah tidak "nyangkut" di
  // tanggal bulan sebelumnya yang tidak ada di grid baru.
  useEffect(() => {
    const isCurrentMonth = viewDate.getFullYear() === today.getFullYear() && viewDate.getMonth() === today.getMonth();
    setSelectedDate(isCurrentMonth ? toISODate(today) : toISODate(new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate]);

  // ── Peta hari libur per tanggal (YYYY-MM-DD -> nama lokal) ───────────
  const holidayMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of holidays) {
      if (!map.has(h.date)) map.set(h.date, h.localName || h.name);
    }
    return map;
  }, [holidays]);

  // ── Peta transaksi per tanggal + heatmap intensity ────────────────────
  const dayStats = useMemo(() => {
    const map = new Map<string, { income: number; expense: number; count: number; txs: Transaction[] }>();
    for (const tx of transactions) {
      const key = tx.transaction_date;
      const entry = map.get(key) || { income: 0, expense: 0, count: 0, txs: [] };
      if (tx.type === "income") entry.income += tx.amount; else entry.expense += tx.amount;
      entry.count += 1;
      entry.txs.push(tx);
      map.set(key, entry);
    }
    let maxVolume = 0;
    map.forEach((v) => { maxVolume = Math.max(maxVolume, v.income + v.expense); });
    return { map, maxVolume: maxVolume || 1 };
  }, [transactions]);

  const monthSummary = useMemo(() => {
    return transactions.reduce(
      (acc, tx) => {
        if (tx.type === "income") acc.income += tx.amount; else acc.expense += tx.amount;
        return acc;
      },
      { income: 0, expense: 0 }
    );
  }, [transactions]);

  // ── Grid hari dalam bulan (termasuk padding minggu awal) ──────────────
  const gridDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDate = new Date(year, month + 1, 0).getDate();
    const leadingBlanks = firstDay.getDay(); // 0 = Minggu
    const cells: { dateStr: string | null; day: number | null }[] = [];
    for (let i = 0; i < leadingBlanks; i++) cells.push({ dateStr: null, day: null });
    for (let d = 1; d <= lastDate; d++) {
      const dt = new Date(year, month, d);
      cells.push({ dateStr: toISODate(dt), day: d });
    }
    // Genapkan ke kelipatan 7 supaya grid tidak "patah" di baris terakhir.
    while (cells.length % 7 !== 0) cells.push({ dateStr: null, day: null });
    return cells;
  }, [viewDate]);

  const formatIDR = (num: number) => "Rp\u00A0" + Math.round(num).toLocaleString("id-ID");

  const weekdayLabels = [
    t("calendar.weekday_sun"), t("calendar.weekday_mon"), t("calendar.weekday_tue"),
    t("calendar.weekday_wed"), t("calendar.weekday_thu"), t("calendar.weekday_fri"), t("calendar.weekday_sat"),
  ];

  const goMonth = (delta: number) => {
    audioFeedback.playClick();
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const monthLabel = `${t(`months.m${viewDate.getMonth() + 1}`)} ${viewDate.getFullYear()}`;
  const selectedStats = dayStats.map.get(selectedDate);
  const selectedTxs = (selectedStats?.txs || []).slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const visibleTxs = selectedTxs.slice(0, 3);
  const hasMore = selectedTxs.length > 3;
  const selectedHoliday = holidayMap.get(selectedDate);
  const isSelectedToday = selectedDate === toISODate(today);

  const formatSelectedDateLabel = () => {
    if (isSelectedToday) return t("calendar.today");
    const parts = selectedDate.split("-");
    return `${parseInt(parts[2])} ${t(`months.m${parseInt(parts[1])}`)} ${parts[0]}`;
  };

  const getCategoryLabel = (key: string) => {
    const cat = categories.find((c) => c.key === key);
    if (!cat) return key;
    return locale === "id" ? (cat.label_id || cat.key) : (cat.label_en || cat.key);
  };

  const handleSeeAll = () => {
    audioFeedback.playClick();
    navigate("/transactions", { state: { filterMonth: monthKey(viewDate), filterDate: selectedDate } });
  };

  if (loadError) {
    return <ErrorState onRetry={loadMonth} />;
  }

  return (
    <div className="space-y-5 pb-12">
      {/* ── Header halaman ── */}
      <div>
        <h1 className={cx("font-sans font-bold text-xl tracking-tight", tokens.text.primary)}>
          {t("calendar.page_title")}
        </h1>
        <p className={cx("text-xs mt-1 max-w-xl leading-relaxed", tokens.text.muted)}>
          {t("calendar.page_subtitle")}
        </p>
      </div>

      {/* ── Kartu hero bulan (background bertema musim) ── */}
      <motion.div
        key={monthKey(viewDate)}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.15}
        onDragEnd={(_, info) => {
          if (info.offset.x < -60) goMonth(1);
          else if (info.offset.x > 60) goMonth(-1);
        }}
        className={cx(
          "relative overflow-hidden rounded-3xl border shadow-lg",
          tokens.border.default,
          `bg-gradient-to-br ${theme.gradient}`
        )}
      >
        {/* Glow dekoratif */}
        <div className={cx("absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl", theme.glow)} />
        <div className={cx("absolute -bottom-14 -left-10 w-44 h-44 rounded-full blur-3xl", theme.glow)} />
        <ThemeIcon className={cx("absolute right-4 top-4 opacity-30", theme.iconClass)} size={72} strokeWidth={1.2} />

        <div className="relative px-5 pt-5 pb-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => goMonth(-1)}
              aria-label="previous month"
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer text-white active:scale-90"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="text-center">
              <p className="font-sans font-extrabold text-2xl text-white tracking-tight">
                {t(`months.m${viewDate.getMonth() + 1}`)}
              </p>
              <p className="font-mono text-xs text-white/70 tracking-widest">{viewDate.getFullYear()}</p>
            </div>
            <button
              onClick={() => goMonth(1)}
              aria-label="next month"
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer text-white active:scale-90"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Ringkasan bulan */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white/10 backdrop-blur-sm px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-white/60 font-sans font-semibold">
                {t("calendar.month_summary_income")}
              </p>
              <p className="font-mono font-bold text-sm text-emerald-300 tabular-nums">{formatIDR(monthSummary.income)}</p>
            </div>
            <div className="rounded-xl bg-white/10 backdrop-blur-sm px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-white/60 font-sans font-semibold">
                {t("calendar.month_summary_expense")}
              </p>
              <p className="font-mono font-bold text-sm text-red-300 tabular-nums">{formatIDR(monthSummary.expense)}</p>
            </div>
          </div>
        </div>

        {/* ── Grid kalender (menyatu dengan kartu hero, seperti referensi) ── */}
        <div className={cx("relative rounded-t-3xl px-3 pt-4 pb-3", tokens.surface.card)}>
          <div className="grid grid-cols-7 mb-1.5">
            {weekdayLabels.map((w, i) => (
              <div key={i} className={cx("text-center text-[10px] font-sans font-bold uppercase", tokens.text.faint)}>
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-1">
            {gridDays.map((cell, idx) => {
              if (!cell.dateStr) return <div key={idx} className="h-11" />;
              const stat = dayStats.map.get(cell.dateStr);
              const isHoliday = holidayMap.has(cell.dateStr);
              const isCellBirthday = isBirthday(cell.dateStr);
              const isToday = cell.dateStr === toISODate(today);
              const isSelected = cell.dateStr === selectedDate;
              const volume = stat ? stat.income + stat.expense : 0;
              const intensity = volume > 0 ? Math.min(1, 0.35 + 0.65 * (volume / dayStats.maxVolume)) : 0;
              const hasIncome = !!stat && stat.income > 0;
              const hasExpense = !!stat && stat.expense > 0;

              return (
                <button
                  key={cell.dateStr}
                  onClick={() => { audioFeedback.tapHaptic(); setSelectedDate(cell.dateStr as string); }}
                  className="relative h-11 flex flex-col items-center justify-center gap-0.5 cursor-pointer select-none"
                >
                  <span
                    className={cx(
                      "w-7 h-7 flex items-center justify-center rounded-full text-xs font-sans font-semibold transition-colors",
                      isSelected
                        ? "bg-indigo-500 text-white light_sakura:bg-rose-500"
                        : isToday
                        ? cx("ring-1", tokens.text.accent, "ring-current")
                        : cx(tokens.text.secondary)
                    )}
                  >
                    {cell.day}
                  </span>
                  {/* Heatmap dot: income (hijau) / expense (merah) / keduanya */}
                  <div className="flex items-center gap-0.5 h-1.5">
                    {hasIncome && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                        style={{ opacity: intensity }}
                      />
                    )}
                    {hasExpense && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-red-400"
                        style={{ opacity: intensity }}
                      />
                    )}
                    {isHoliday && !hasIncome && !hasExpense && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    )}
                    {isCellBirthday && !hasIncome && !hasExpense && !isHoliday && (
                      <span className="w-1.5 h-1.5 rounded-full bg-pink-400" />
                    )}
                  </div>
                  {isHoliday && (hasIncome || hasExpense) && (
                    <span className="absolute top-0 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                  )}
                  {isCellBirthday && (
                    <Cake size={10} className="absolute -top-0.5 left-1.5 text-pink-400" strokeWidth={2.5} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Legenda heatmap */}
          <div className={cx("flex items-center gap-4 mt-3 pt-3 border-t text-[10px] font-sans font-medium", tokens.border.default, tokens.text.muted)}>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{t("calendar.legend_income")}</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-400" />{t("calendar.legend_expense")}</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />{t("calendar.legend_holiday")}</span>
            {birthDateRaw && (
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-pink-400" />{t("calendar.legend_birthday")}</span>
            )}
            {holidaysLoading && <span className="ml-auto opacity-60">{t("calendar.loading_holidays")}</span>}
          </div>
        </div>
      </motion.div>

      {/* ── Panel hari terpilih ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={selectedDate}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
          className={cx("rounded-2xl border p-4", tokens.surface.card, tokens.border.default)}
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className={cx("font-sans font-bold text-sm", tokens.text.primary)}>{formatSelectedDateLabel()}</p>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                {selectedHoliday && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-sans font-bold">
                    <PartyPopper size={11} /> {selectedHoliday}
                  </span>
                )}
                {isBirthday(selectedDate) && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pink-500/10 text-pink-400 text-[10px] font-sans font-bold">
                    <Cake size={11} /> {t("calendar.birthday_badge")}
                  </span>
                )}
              </div>
            </div>
            {hasMore && (
              <button
                onClick={handleSeeAll}
                className={cx("text-xs font-sans font-bold underline underline-offset-2 cursor-pointer", tokens.text.accent)}
              >
                {t("calendar.see_all")}
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <div key={i} className={cx("h-12 rounded-xl animate-pulse", tokens.surface.sunken)} />
              ))}
            </div>
          ) : visibleTxs.length === 0 ? (
            <p className={cx("text-xs py-4 text-center font-sans", tokens.text.muted)}>
              {t("calendar.no_transactions")}
            </p>
          ) : (
            <div className="space-y-2">
              {visibleTxs.map((tx) => {
                const isExpense = tx.type === "expense";
                return (
                  <div
                    key={tx.id}
                    className={cx("flex items-center gap-3 p-2.5 rounded-xl", tokens.surface.sunken)}
                  >
                    <div className={cx("w-8 h-8 shrink-0 rounded-full flex items-center justify-center",
                      isExpense ? tokens.historyGroupedList.expenseChip : tokens.historyGroupedList.incomeChip
                    )}>
                      {isExpense ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cx("text-xs font-sans font-semibold truncate", tokens.text.label)}>
                        {getCategoryLabel(tx.category)}
                      </p>
                      {tx.note && (
                        <p className={cx("text-[11px] font-sans truncate", tokens.text.muted)}>{tx.note}</p>
                      )}
                    </div>
                    <span className={cx("font-mono tabular-nums font-bold text-xs shrink-0", isExpense ? tokens.text.danger : tokens.text.success)}>
                      {isExpense ? "-" : "+"}{formatIDR(tx.amount)}
                    </span>
                  </div>
                );
              })}
              {hasMore && (
                <button
                  onClick={handleSeeAll}
                  className={cx("w-full text-center text-xs font-sans font-bold py-2 rounded-xl cursor-pointer transition-colors", tokens.text.accent, tokens.hover.sunken)}
                >
                  {t("calendar.see_all")} ({selectedTxs.length})
                </button>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
