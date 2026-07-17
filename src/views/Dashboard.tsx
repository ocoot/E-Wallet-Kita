import React, { useState, useEffect } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { dbService } from "../lib/db";
import { supabase } from "../lib/supabase";
import { UserSession, Transaction } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Plus, BookOpen, X } from "lucide-react";
import { motion } from "motion/react";
import { audioFeedback } from "../lib/audio";
import { useThemeTokens } from "../hooks/useThemeTokens";

import { DashboardHeader } from "../components/DashboardHeader";
import { DashboardChart } from "../components/DashboardChart";
import { DashboardRecentTransactions } from "../components/DashboardRecentTransactions";
import { DashboardBudgetAlerts } from "../components/DashboardBudgetAlerts";
import { DashboardBudgetSummary } from "../components/DashboardBudgetSummary";
import { DashboardBillReminders } from "../components/DashboardBillReminders";
import { DashboardInstallments } from "../components/DashboardInstallments";
import { DashboardOverviewCard } from "../components/DashboardOverviewCard";
import { ErrorState } from "../components/ErrorState";
import { DashboardWalletCarousel } from "../components/DashboardWalletCarousel";
import { DashboardWalletSelectorCard } from "../components/DashboardWalletSelectorCard";
import { useCategories } from "../hooks/useCategories";

interface DashboardProps {
  transactionsUpdatedTrigger: number;
  onTransactionAdded: () => void;
  userDisplayName?: string;
}

export const Dashboard: React.FC<DashboardProps> = ({
  transactionsUpdatedTrigger,
  onTransactionAdded,
  userDisplayName
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { categories } = useCategories();
  const { tokens, cx } = useThemeTokens();

  const [displayName, setDisplayName] = useState<string>(userDisplayName || "");

  useEffect(() => {
    if (userDisplayName) {
      setDisplayName(userDisplayName);
    }
  }, [userDisplayName]);

  useEffect(() => {
    if (userDisplayName) return;
    if (!user) return;
    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from("users")
        .select("display_name")
        .eq("id", user.id)
        .single();
      if (!error && data) {
        if (data.display_name) setDisplayName(data.display_name);
      }
    };
    fetchProfile();
  }, [user, userDisplayName]);

  const currentUser: UserSession = {
    id: user?.id || "",
    display_name: displayName || user?.user_metadata?.full_name || t("admin.guest_user"),
    is_guest: user?.is_anonymous || false,
    preferred_language: "id",
    preferred_theme: "dark_obsidian"
  };

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dashboardError, setDashboardError] = useState<unknown>(null);
  const [reloadCounter, setReloadCounter] = useState(0);
  const [summary, setSummary] = useState({ income: 0, expense: 0, balance: 0 });
  const [sparkPoints, setSparkPoints] = useState<number[]>([]);
  const [telegramStatus, setTelegramStatus] = useState<{ linked: boolean, lastSync: string | null }>({ linked: false, lastSync: null });

  // Interactive Recharts configuration states
  const [chartMode, setChartMode] = useState<"area" | "line">("area");
  const [chartType, setChartType] = useState<"daily" | "cumulative">("cumulative");
  const [showOnboardingBanner, setShowOnboardingBanner] = useState<boolean>(() => {
    return localStorage.getItem("ewallet_onboarding_completed") !== "true";
  });

  // Locale labels for chart representation
  const labelIncome = t("dashboard.income");
  const labelExpense = t("dashboard.expense");
  const labelBalance = t("dashboard.balance");

  // Load current month metrics
  useEffect(() => {
    const loadData = async () => {
      const today = new Date();
      const currentMonthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`; // e.g., "2026-06"
      
      try {
        setDashboardError(null);
        const [data, userRes] = await Promise.all([
          dbService.getTransactions(currentUser.id, currentMonthPrefix),
          supabase.from("users").select("telegram_chat_id").eq("id", currentUser.id).single()
        ]);
        
        setTransactions(data);
        
        if (userRes.data?.telegram_chat_id) {
          const latestTelegramTx = data
            .filter(t => t.source === 'telegram')
            .sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
          
          setTelegramStatus({
            linked: true,
            lastSync: latestTelegramTx ? new Date(latestTelegramTx.created_at).toLocaleTimeString() : null
          });
        }

        // Compute sums
        let inc = 0;
        let exp = 0;

        data.forEach(t => {
          if (t.type === "income") {
            inc += t.amount;
          } else {
            exp += t.amount;
          }
        });

        setSummary({
          income: inc,
          expense: exp,
          balance: inc - exp
        });

        // Compute cumulative balance trend (sparkline)
        const sortedData = [...data].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
        let runBal = 0;
        const historyPoints = sortedData.map(t => {
          runBal += (t.type === "income" ? t.amount : -t.amount);
          return runBal;
        });
        setSparkPoints(historyPoints);
      } catch (err) {
        console.error('Dashboard load error:', err);
        setDashboardError(err);
      }
    };

    if (currentUser.id) {
      loadData();
    }
  }, [currentUser.id, transactionsUpdatedTrigger, reloadCounter]);

  // Helper currency formatter
  const formatIDR = (num: number) => {
    return "Rp" + Math.round(num).toLocaleString("id-ID");
  };

  // Helper date formatter compatible with custom component
  const formatDateLabel = (dateStr: string) => {
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

  // Build trend chart data sequentially over days of the month
  const getChartData = () => {
    const today = new Date();
    // Gather all days of the current month up to either today or the max transaction day
    const maxDay = transactions.length > 0
      ? Math.max(...transactions.map(t => new Date(t.transaction_date).getDate()), today.getDate())
      : today.getDate();

    // Map by day
    const dailyMap: { [key: number]: { income: number; expense: number } } = {};
    for (let d = 1; d <= maxDay; d++) {
      dailyMap[d] = { income: 0, expense: 0 };
    }

    transactions.forEach(t => {
      const dt = new Date(t.transaction_date);
      const day = dt.getDate();
      if (dailyMap[day]) {
        if (t.type === "income") {
          dailyMap[day].income += t.amount;
        } else {
          dailyMap[day].expense += t.amount;
        }
      }
    });

    const data = [];
    let cumIncome = 0;
    let cumExpense = 0;

    const currentMonthNum = today.getMonth() + 1;
    const monthLabel = t(`months.m${currentMonthNum}`);

    for (let d = 1; d <= maxDay; d++) {
      const { income, expense } = dailyMap[d];
      cumIncome += income;
      cumExpense += expense;

      const incVal = chartType === "cumulative" ? cumIncome : income;
      const expVal = chartType === "cumulative" ? cumExpense : expense;
      const balVal = incVal - expVal;

      data.push({
        day: `${d} ${monthLabel.substring(0, 3)}`,
        rawDay: d,
        [labelIncome]: incVal,
        [labelExpense]: expVal,
        [labelBalance]: balVal,
      });
    }
    return data;
  };

  const chartData = getChartData();

  return (
    <div className="space-y-6 pb-24 relative">
      {/* 1 + 1b. Welcome/weather card ("dashboard dinamis") DAN kartu Pos
          Dompet selector digabung jadi SATU strip yang bisa digeser (swipe)
          horizontal, snap satu kartu per satu -- sama seperti sebelumnya.
          Bedanya kartu Pos Dompet SEKARANG cuma SATU kartu (selector
          dropdown, lihat DashboardWalletSelectorCard.tsx) alih-alih satu
          kartu per pos yang digeser satu-satu -- untuk pindah pos, user
          pakai dropdown DI DALAM kartu itu, bukan swipe lagi. Swipe di
          strip ini sekarang cuma untuk berpindah antara kartu dashboard
          dinamis <-> kartu Pos Dompet. */}
      <DashboardWalletCarousel
        headerSlot={
          <DashboardHeader
            currentUser={currentUser}
            telegramStatus={telegramStatus}
          />
        }
        walletSlot={
          <DashboardWalletSelectorCard
            formatIDR={formatIDR}
            transactions={transactions}
            refreshTrigger={transactionsUpdatedTrigger}
            onTransactionAdded={onTransactionAdded}
          />
        }
      />

      {/* 1c. Ringkasan Keuangan -- Total Kekayaan, Bulan Ini, Rincian Aset
          (Tabungan/Emas) expandable. Angka "Saldo Tersedia" tunggal sudah
          dipindah jadi kartu-kartu Pos Dompet di atas. */}
      <DashboardOverviewCard
        refreshTrigger={transactionsUpdatedTrigger}
        formatIDR={formatIDR}
        monthlySummary={summary}
      />

      {/* Onboarding Interactive Banner for new users */}
      {showOnboardingBanner && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="p-5 bg-gradient-to-r from-emerald-500/10 to-indigo-500/10 border border-emerald-500/20 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl shadow-emerald-900/5 light_sakura:from-rose-500/10 light_sakura:to-indigo-500/10 light_sakura:border-rose-300/30"
        >
          <div className="flex items-start gap-3.5">
            <div className={cx("w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 mt-0.5", tokens.chip.accentEmerald)}>
              <BookOpen size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white light_sakura:text-slate-800">
                {t("onboarding.dashboard_banner_title")}
              </h4>
              <p className="text-xs text-slate-400 light_sakura:text-slate-600 mt-0.5 leading-relaxed max-w-2xl">
                {t("onboarding.dashboard_banner_desc")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 self-end sm:self-auto">
            <button
              onClick={() => {
                audioFeedback.playClick();
                setShowOnboardingBanner(false);
                localStorage.setItem("ewallet_onboarding_completed", "true");
              }}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-300 hover:bg-slate-800/50 rounded-xl transition-colors light_sakura:text-slate-500 light_sakura:hover:text-slate-700 light_sakura:hover:bg-rose-50"
            >
              {t("onboarding.dashboard_banner_btn_dismiss")}
            </button>
            <button
              onClick={() => {
                audioFeedback.playClick();
                navigate("/onboarding");
              }}
              className={cx("px-4 py-2 text-xs font-bold rounded-xl shadow-lg shadow-emerald-500/10 flex items-center gap-1.5 transition-colors", tokens.button.accentEmerald)}
            >
              <span>{t("onboarding.dashboard_banner_btn_start")}</span>
            </button>
          </div>
        </motion.div>
      )}

      {/* 2. Scorecard Summaries -- dipindahkan ke dalam DashboardOverviewCard
          (strip "Bulan Ini") supaya tidak ada 2 grup kartu saldo terpisah. */}

      {/* 2b. Budget Summary & Bill Reminders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DashboardBudgetSummary />
        <DashboardBillReminders />
        <DashboardInstallments />
      </div>

      {/* 2c. Alert card (hanya kalau urgent) */}
      <DashboardBudgetAlerts />

      {/* 3. Graphic Chart Trends & 4. Recent Transactions -- keduanya bergantung
          pada `transactions`/`summary` dari loadData() di atas, jadi kalau
          fetch itu gagal, tampilkan satu ErrorState untuk keduanya sekaligus
          alih-alih membiarkan chart/list kosong tanpa penjelasan. */}
      {dashboardError ? (
        <ErrorState onRetry={() => setReloadCounter((c) => c + 1)} />
      ) : (
        <>
          <DashboardChart 
            transactions={transactions}
            chartData={chartData}
            chartMode={chartMode}
            setChartMode={setChartMode}
            chartType={chartType}
            setChartType={setChartType}
            labelIncome={labelIncome}
            labelExpense={labelExpense}
            labelBalance={labelBalance}
            formatIDR={formatIDR}
          />

          <DashboardRecentTransactions 
            transactions={transactions}
            formatIDR={formatIDR}
            formatDateLabel={formatDateLabel}
            onNavigateToHistory={() => navigate("/transactions")}
            categories={categories}
          />
        </>
      )}

      {/* 5. Modern quick add transaction floating action button.
          Hanya tampil di tablet/desktop (>= md) -- di layar handphone (< md)
          FAB ini disembunyikan karena sudah terwakili oleh ikon "Catat
          Manual" di navbar bawah (MobileBottomNav.tsx), supaya tidak
          duplikat/menutupi konten. */}
      <div className="fixed bottom-6 right-6 z-40 hidden md:block">
        <motion.button
          id="btn-quick-add-transaction-fab"
          onClick={() => {
            audioFeedback.playClick();
            navigate("/transactions/new");
          }}
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.95 }}
          className="cursor-pointer bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-sans font-bold py-3.5 px-6 rounded-2xl shadow-xl flex items-center gap-2 border border-indigo-500/30 transition-all cursor-pointer light_sakura:from-rose-500 light_sakura:to-rose-600 light_sakura:hover:from-rose-600 light_sakura:hover:to-rose-700 light_sakura:border-rose-300"
        >
          <Plus size={18} />
          <span>{t("dashboard.quick_add_fab")}</span>
        </motion.button>
      </div>
    </div>
  );
};
