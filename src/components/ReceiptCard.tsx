import React from "react";

/**
 * ReceiptCard — satu-satunya sumber kebenaran visual untuk struk
 * pembelian Premium Lifetime ("Glass Wallet Card").
 *
 * Dipakai di 2 tempat:
 * 1. `PremiumModal.tsx`  — preview di layar saat step "success".
 * 2. `lib/receiptRender.ts` (dipanggil dari `lib/receipt.ts`) — di-render
 *    offscreen lalu "difoto" pakai html2canvas untuk ditempel ke PDF.
 *
 * Karena keduanya memakai komponen React yang SAMA PERSIS, desain struk
 * cukup diubah di file ini sekali — tampilan di layar & di PDF otomatis
 * ikut berubah bersamaan. Sebelumnya struk PDF digambar manual pakai
 * koordinat X/Y jsPDF terpisah dari tampilan layar, jadi keduanya gampang
 * "ngambang" beda desain.
 *
 * SENGAJA TIDAK memakai `useThemeTokens` / varian `light_sakura:`. Struk
 * adalah dokumen bukti bayar — harus terlihat identik untuk semua orang
 * apa pun tema app yang mereka pilih, persis seperti PDF lama yang juga
 * selalu pakai warna tetap (slate-900 + indigo-500), bukan warna yang ikut
 * berganti mengikuti tema.
 */

export interface ReceiptCardData {
  orderId: string;
  buyerName: string;
  /** Nominal dasar (setelah voucher, sebelum kode unik QRIS). */
  amount: number;
  /** Total yang benar-benar dibayar (termasuk kode unik QRIS). */
  totalAmount: number;
  /** ISO datetime string saat pembayaran dikonfirmasi. */
  paidAt: string;
  sandbox?: boolean;
}

export interface ReceiptCardProps {
  data: ReceiptCardData;
  t: (key: string, replacements?: Record<string, string | number>) => string;
  /**
   * true saat komponen ini dirender offscreen khusus untuk di-capture
   * html2canvas (lihat `lib/receiptRender.ts`). Mematikan `backdrop-blur`
   * karena dukungan `backdrop-filter` di html2canvas tidak konsisten —
   * hasil captured PNG jadi lebih dapat diprediksi.
   */
  forCapture?: boolean;
  className?: string;
}

function ReceiptRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between gap-3 py-2.5 text-[11.5px] ${
        last ? "" : "border-b border-white/10"
      }`}
    >
      <span className="text-white/55">{label}</span>
      <span className="font-semibold text-right">{value}</span>
    </div>
  );
}

export const ReceiptCard: React.FC<ReceiptCardProps> = ({ data, t, forCapture = false, className = "" }) => {
  const formattedDate = new Date(data.paidAt).toLocaleString("id-ID");
  const method = `QRIS${data.sandbox ? " (Sandbox)" : ""}`;

  return (
    <div
      data-receipt-card
      className={`w-full max-w-[340px] mx-auto rounded-[28px] p-5 ${className}`}
      style={{
        background:
          "radial-gradient(circle at 18% 12%, rgba(45,212,191,.45), transparent 45%)," +
          "radial-gradient(circle at 88% 82%, rgba(99,102,241,.55), transparent 50%)," +
          "#0d1024",
      }}
    >
      <div
        className={`rounded-[22px] border border-white/15 bg-white/[0.08] p-6 text-white ${
          forCapture ? "" : "backdrop-blur-xl"
        }`}
      >
        {/* Brand row */}
        <div className="flex items-center gap-2.5 mb-5">
          <div
            className="w-8 h-8 rounded-[10px] flex items-center justify-center font-bold text-[13px] text-white shrink-0"
            style={{ background: "linear-gradient(135deg,#2dd4bf,#6366f1)" }}
          >
            e
          </div>
          <div>
            <p className="text-[13px] font-bold leading-none">E-Wallet Kita</p>
            <p className="text-[10px] text-white/55 mt-1 leading-none">{t("premium.receipt_title")}</p>
          </div>
        </div>

        {/* Hero: checkmark + total dibayar */}
        <div className="text-center mb-5">
          <div
            className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center text-2xl"
            style={{
              background: "linear-gradient(135deg,#34d399,#10b981)",
              boxShadow: "0 0 0 8px rgba(16,185,129,.14)",
            }}
          >
            ✓
          </div>
          <p className="text-[26px] font-extrabold tracking-tight font-mono tabular-nums">
            Rp {data.totalAmount.toLocaleString("id-ID")}
          </p>
          <p className="text-[10.5px] text-white/55 mt-1">
            {t("premium.receipt_status_success")} · {method}
          </p>
        </div>

        {/* Detail panel */}
        <div className="rounded-2xl bg-white/[0.05] border border-white/10 px-4">
          <ReceiptRow label={t("premium.receipt_order_no")} value={data.orderId} />
          <ReceiptRow label={t("premium.receipt_buyer")} value={data.buyerName} />
          <ReceiptRow label={t("premium.receipt_product")} value={t("premium.receipt_product_val")} />
          <ReceiptRow label={t("premium.receipt_amount")} value={`Rp ${data.amount.toLocaleString("id-ID")}`} />
          <ReceiptRow label={t("premium.receipt_date")} value={formattedDate} last />
        </div>

        <p className="text-center text-[10px] text-white/45 mt-4 leading-relaxed">
          {t("premium.receipt_thanks")}
          <br />
          {t("premium.receipt_active_forever")}
        </p>
      </div>
    </div>
  );
};
