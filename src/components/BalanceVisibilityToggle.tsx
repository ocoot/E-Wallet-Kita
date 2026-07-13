import React from "react";
import { Eye, EyeOff } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useBalanceVisibility } from "../contexts/BalanceVisibilityContext";
import { audioFeedback } from "../lib/audio";

/**
 * Toggle mata TUNGGAL untuk seluruh nominal di Dashboard (Pos Dompet, Total
 * Kekayaan, Bulan Ini, rincian aset, jatah anggaran harian, progres budget
 * per kategori, chart, dan riwayat transaksi terbaru).
 *
 * REVISI: sebelumnya tombol ini "menumpang" di dalam kartu sapaan/cuaca
 * (DashboardHeader) -- posisinya jauh dari kartu Pos Dompet & saldo lain
 * yang justru ia kontrol, jadi user harus scroll balik ke atas tiap kali
 * mau toggle. Sekarang jadi bar tersendiri yang sticky di puncak halaman
 * (lihat pemakaiannya di Dashboard.tsx), supaya tetap terjangkau dari
 * mana pun user sedang scroll, tanpa perlu duplikat kontrol di tiap kartu
 * (baca juga catatan lama soal itu di BalanceVisibilityContext.tsx).
 */
export const BalanceVisibilityToggle: React.FC = () => {
  const { t } = useLanguage();
  const { visible: balanceVisible, toggle: toggleBalanceVisible } = useBalanceVisibility();

  return (
    <div className="sticky top-2 z-30 flex justify-end pointer-events-none">
      <button
        type="button"
        onClick={() => { audioFeedback.playClick(); toggleBalanceVisible(); }}
        aria-pressed={!balanceVisible}
        aria-label={balanceVisible ? t("common.hide_balance") : t("common.show_balance")}
        className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-900/90 backdrop-blur-md border border-white/10 text-slate-300 shadow-lg shadow-black/20 hover:bg-slate-800 hover:text-white transition-colors duration-200 light_sakura:bg-white/95 light_sakura:border-rose-100/60 light_sakura:text-rose-600 light_sakura:hover:bg-rose-50"
      >
        {balanceVisible ? <Eye size={14} className="shrink-0" /> : <EyeOff size={14} className="shrink-0" />}
        <span className="whitespace-nowrap">
          {balanceVisible ? t("common.hide_balance") : t("common.show_balance")}
        </span>
      </button>
    </div>
  );
};
