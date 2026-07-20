import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useBudgets } from "../hooks/useBudgets";
import { audioFeedback } from "../lib/audio";
import { useThemeTokens } from "../hooks/useThemeTokens";

/**
 * Baris "Anggaran Bulanan" di dalam grouped list Pantauan Keuangan
 * (lihat Dashboard.tsx) -- versi RINGKAS satu baris ala iOS Settings/Wallet:
 * ikon bulat + judul + SATU baris subjudul ringkasan ("68% dari
 * Rp3.000.000", diagregasi dari SELURUH anggaran yang ada, bukan per
 * kategori) + chevron. Rincian per kategori (progress bar tiap kategori,
 * dsb.) sengaja TIDAK ditampilkan lagi di sini -- itu tugas halaman
 * /budget yang dituju kalau baris ini di-tap, supaya baris tetap ringkas
 * & konsisten tingginya dengan 2 baris lain di grouped list yang sama.
 */
export const DashboardBudgetSummary: React.FC = () => {
  const { tokens, cx } = useThemeTokens();
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { budgets, loading } = useBudgets(user?.id);

  if (loading || budgets.length === 0) return null;

  const formatIDR = (num: number) => "Rp\u00A0" + Math.round(num).toLocaleString("id-ID");

  // Agregat SELURUH anggaran (bukan cuma 3 teratas) -- satu angka persentase
  // yang mewakili "seberapa penuh" anggaran bulan ini secara keseluruhan,
  // dipakai sebagai subjudul satu baris ("68% dari Rp3.000.000").
  const totalLimit = budgets.reduce((sum, b) => sum + b.monthly_limit, 0);
  const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
  const overallPercent = totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <button
        type="button"
        onClick={() => { audioFeedback.playClick(); navigate("/budget"); }}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <h3 className={cx("font-sans font-bold text-sm truncate", tokens.text.heading)}>
              {t("budget.dashboard_row_title")}
            </h3>
            <p className={cx("text-xs truncate", tokens.text.muted)}>
              {t("budget.dashboard_row_subtitle", { percent: Math.round(overallPercent), total: formatIDR(totalLimit) })}
            </p>
          </div>
        </div>
        <ChevronRight size={18} className={cx("shrink-0", tokens.text.muted)} />
      </button>
    </motion.div>
  );
};
