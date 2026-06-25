import React, { useState, useEffect } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { dbService } from "../lib/db";
import { supabase } from "../lib/supabase";
import { UserSession, Transaction } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { motion } from "motion/react";
import { audioFeedback } from "../lib/audio";

import { DashboardHeader } from "../components/DashboardHeader";
import { DashboardStats } from "../components/DashboardStats";
import { DashboardChart } from "../components/DashboardChart";
import { DashboardRecentTransactions } from "../components/DashboardRecentTransactions";
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
      if (!error && data?.display_name) {
        setDisplayName(data.display_name);
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
  const [summary, setSummary] = useState({ income: 0, expense: 0, balance: 0 });
  const [sparkPoints, setSparkPoints] = useState<number[]>([]);
  const [telegramStatus, setTelegramStatus] = useState<{ linked: boolean, lastSync: string | null }>({ linked: false, lastSync: null });

  // Interactive Recharts configuration states
  const [chartMode, setChartMode] = useState<"area" | "line">("area");
  const [chartType, setChartType] = useState<"daily" | "cumulative">("cumulative");

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
      }
    };

    if (currentUser.id) {
      loadData();
    }
  }, [currentUser.id, transactionsUpdatedTrigger]);

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
      {/* 1. Welcome Message Banner */}
      <DashboardHeader 
        currentUser={currentUser} 
        telegramStatus={telegramStatus} 
      />

      {/* 2. Scorecard Summaries (3 Column Bento format) */}
      <DashboardStats 
        summary={summary} 
        sparkPoints={sparkPoints} 
        formatIDR={formatIDR} 
      />

      {/* 3. Graphic Chart Trends */}
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

      {/* 4. Recent Transactions Section (Last 5 Entries) */}
      <DashboardRecentTransactions 
        transactions={transactions}
        formatIDR={formatIDR}
        formatDateLabel={formatDateLabel}
        onNavigateToHistory={() => navigate("/transactions")}
        categories={categories}
      />

      {/* 5. Modern quick add transaction floating action button */}
      <div className="fixed bottom-6 right-6 z-40 hidden sm:block">
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

      {/* Mobile-optimized smaller version of FAB */}
      <div className="fixed bottom-6 right-6 z-40 sm:hidden">
        <motion.button
          id="btn-quick-add-transaction-fab-mobile"
          onClick={() => {
            audioFeedback.playClick();
            navigate("/transactions/new");
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="cursor-pointer p-4 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-full shadow-2xl flex items-center justify-center border border-indigo-500/30 cursor-pointer light_sakura:from-rose-500 light_sakura:to-rose-600 light_sakura:border-rose-300"
        >
          <Plus size={24} />
        </motion.button>
      </div>
    </div>
  );
};
