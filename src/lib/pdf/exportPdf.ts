import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Transaction, Category } from "../../types.js";
import { drawPdfBrandHeader } from "./pdfBranding.js";

export type TFunc = (key: string, replacements?: Record<string, string | number>) => string;

const MARGIN = 40;

export const drawHeader = (
  doc: jsPDF,
  opts: {
    t: TFunc;
    reportTitle: string;
    userName: string;
    periodLabel: string;
    generatedAtLabel: string;
    docNumber: string;
  }
): number => {
  return drawPdfBrandHeader(doc, {
    t: opts.t,
    title: opts.reportTitle,
    userName: opts.userName,
    periodLabel: opts.periodLabel,
    generatedAtLabel: opts.generatedAtLabel,
    docNumber: opts.docNumber
  }, MARGIN);
};

export const drawFooter = (
  doc: jsPDF,
  opts: { t: TFunc; pageLabelPrefix: string }
): void => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const y = pageHeight - 24;

  doc.setDrawColor(226, 232, 240); // Slate-200
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y - 10, pageWidth - MARGIN, y - 10);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184); // Slate-400
  doc.text(`${opts.t("export.footer_generated_by")} Premium`, MARGIN, y - 2);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(opts.t("export.footer_confidential").toUpperCase(), pageWidth / 2, y, { align: "center" });

  // Page number is filled in later via finalizePageNumbers(), once total is known.
  doc.text(opts.pageLabelPrefix, pageWidth - MARGIN, y, { align: "right" });
};

export const finalizePageNumbers = (doc: jsPDF, t: TFunc): void => {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const y = pageHeight - 24;

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    // Cover the placeholder text with a white rectangle before redrawing.
    doc.setFillColor(255, 255, 255);
    doc.rect(pageWidth - MARGIN - 160, y - 10, 160, 20, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139); // Slate-500
    const label = t("export.page_x_of_y", { current: i, total: pageCount });
    doc.text(label.toUpperCase(), pageWidth - MARGIN, y, { align: "right" });
  }
};
import {
  getCurrentMonthToDateRange,
  getMonthRange,
  toISODate,
  generateDocNumber,
} from "./dateRange.js";

const HEADER_HEIGHT = 155; // px reserved at top of every page for the header block
const SUMMARY_BLOCK_HEIGHT = 100; // extra space reserved on page 1 only, for the summary card

/** Info pos dompet minimal yang dibutuhkan untuk label di PDF (icon + nama). */
export interface PdfWalletInfo {
  id: string;
  name: string;
  type: "ewallet" | "bank" | "cash" | "general";
  provider: string | null;
}

interface ExportContext {
  t: TFunc;
  userName: string;
  transactions: Transaction[];
  categories: Category[];
  periodLabel: string;
  reportTitle: string;
  summaryOnly?: boolean;
  /** Semua pos dompet user -- dipakai untuk badge di tabel & breakdown ringkasan. */
  wallets?: PdfWalletInfo[];
  /** Kalau laporan difilter ke 1 pos spesifik, breakdown per-pos disembunyikan
   *  (percuma cuma 1 baris) dan label ini ditambahkan ke subtitle periode. */
  walletFilterLabel?: string | null;
}

/** Resolve category label from DB categories, fallback to key if not found. */
function resolveCategoryLabel(key: string, categories: Category[], locale: "id" | "en"): string {
  const cat = categories.find(c => c.key === key);
  if (!cat) return key;
  return locale === "id" ? (cat.label_id || key) : (cat.label_en || key);
}

const WALLET_TYPE_ICON: Record<string, string> = { ewallet: "", bank: "", cash: "", general: "" };

/** Resolve wallet label (ikon + nama) dari wallet_id, fallback ke "Saldo Total" kalau tidak ketemu. */
function resolveWalletLabel(walletId: string | null, wallets: PdfWalletInfo[] | undefined, t: TFunc): string {
  const w = wallets?.find(w => w.id === walletId);
  if (!w) return `${WALLET_TYPE_ICON.general} ${t("wallet.group_general")}`;
  return `${WALLET_TYPE_ICON[w.type] || ""} ${w.name}${w.provider ? ` · ${w.provider}` : ""}`;
}

const formatIDR = (num: number) => "Rp" + Math.round(num).toLocaleString("id-ID");

const monthName = (t: TFunc, monthIndex1to12: number) => t(`months.m${monthIndex1to12}`);

const sanitizeFilename = (name: string) => name.replace(/[\\/:*?"<>|]/g, "");

const computeTotals = (transactions: Transaction[]) => {
  let income = 0;
  let expense = 0;
  for (const tx of transactions) {
    if (tx.type === "income") income += tx.amount;
    else expense += tx.amount;
  }
  return { income, expense, net: income - expense, count: transactions.length };
};

/** Renders the full PDF document (header/footer/watermark on every page + summary + table). */
const renderDocument = (ctx: ExportContext, docNumber: string): jsPDF => {
  const { t, userName, transactions, categories, periodLabel, reportTitle, summaryOnly, wallets, walletFilterLabel } = ctx;
  // Determine locale from i18n: if t("transaction.income") returns "Pemasukan" → "id", else "en"
  const locale: "id" | "en" = t("transaction.income") === "Pemasukan" ? "id" : "en";
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const totals = computeTotals(transactions);
  const watermarkText = t("export.watermark");
  const generatedAtLabel = `${t("export.generated_at")}: ${new Date().toLocaleString()}`;

  const headerOpts = {
    t,
    reportTitle,
    userName,
    periodLabel,
    generatedAtLabel,
    docNumber,
  };

  const pageWidth = doc.internal.pageSize.getWidth();

  if (summaryOnly) {
    drawHeader(doc, headerOpts);
    
    let sy = HEADER_HEIGHT;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59); // Slate-800
    doc.text(t("export.summary_title"), 40, sy);
    sy += 16;

    const cardData = [
      {
        label: t("export.total_income"),
        value: formatIDR(totals.income),
        fillColor: [236, 253, 245], // Emerald-50
        borderColor: [34, 197, 94], // Emerald-500
        labelColor: [6, 95, 70], // Emerald-800
        valueColor: [4, 120, 87] // Emerald-700
      },
      {
        label: t("export.total_expense"),
        value: formatIDR(totals.expense),
        fillColor: [254, 242, 242], // Red-50
        borderColor: [239, 68, 68], // Red-500
        labelColor: [153, 27, 27], // Red-800
        valueColor: [185, 28, 28] // Red-700
      },
      {
        label: t("export.net_balance"),
        value: formatIDR(totals.net),
        fillColor: totals.net >= 0 ? [239, 246, 255] : [254, 242, 242], // Blue-50 or Red-50
        borderColor: totals.net >= 0 ? [59, 130, 246] : [239, 68, 68], // Blue-500 or Red-500
        labelColor: totals.net >= 0 ? [30, 64, 175] : [153, 27, 27], // Blue-800 or Red-800
        valueColor: totals.net >= 0 ? [29, 78, 216] : [185, 28, 28] // Blue-700 or Red-700
      },
      {
        label: t("export.transaction_count"),
        value: String(totals.count),
        fillColor: [250, 245, 255], // Purple-50
        borderColor: [168, 85, 247], // Purple-500
        labelColor: [107, 33, 168], // Purple-800
        valueColor: [126, 34, 206] // Purple-700
      }
    ];

    const colGap = 8;
    const cardW = (pageWidth - 80 - 3 * colGap) / 4;
    const cardH = 54;

    cardData.forEach((card, idx) => {
      const x = 40 + idx * (cardW + colGap);
      
      // Draw Rounded Card Container
      doc.setFillColor(card.fillColor[0], card.fillColor[1], card.fillColor[2]);
      doc.setDrawColor(card.borderColor[0], card.borderColor[1], card.borderColor[2]);
      doc.setLineWidth(1);
      doc.roundedRect(x, sy, cardW, cardH, 6, 6, "FD");

      // Draw Card Label
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(card.labelColor[0], card.labelColor[1], card.labelColor[2]);
      doc.text(card.label, x + 10, sy + 18);

      // Draw Card Value
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(card.valueColor[0], card.valueColor[1], card.valueColor[2]);
      doc.text(card.value, x + 10, sy + 38);
    });

    sy += cardH + 20;

    // Rincian per Pos Dompet -- hanya ditampilkan kalau laporan TIDAK
    // sedang difilter ke 1 pos tertentu (percuma cuma 1 baris), dan hanya
    // untuk pos yang punya aktivitas di periode ini.
    if (!walletFilterLabel && wallets && wallets.length > 0) {
      const perWallet = new Map<string, { income: number; expense: number }>();
      for (const tx of transactions) {
        const key = tx.wallet_id || "__none__";
        const entry = perWallet.get(key) || { income: 0, expense: 0 };
        if (tx.type === "income") entry.income += tx.amount; else entry.expense += tx.amount;
        perWallet.set(key, entry);
      }

      if (perWallet.size > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(30, 41, 59);
        doc.text(t("export.wallet_breakdown_title"), 40, sy);
        sy += 16;

        // Urutan konsisten dengan Dashboard: Saldo Total dulu, lalu sisanya.
        const orderedIds = Array.from(perWallet.keys()).sort((a, b) => {
          const wa = wallets.find(w => w.id === a);
          const wb = wallets.find(w => w.id === b);
          const ga = wa?.type === "general" ? 0 : 1;
          const gb = wb?.type === "general" ? 0 : 1;
          return ga - gb;
        });

        for (const walletId of orderedIds) {
          const entry = perWallet.get(walletId)!;
          const label = resolveWalletLabel(walletId === "__none__" ? null : walletId, wallets, t);
          const net = entry.income - entry.expense;

          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(51, 65, 85); // Slate-700
          doc.text(label, 44, sy);

          doc.setFont("helvetica", "bold");
          doc.setTextColor(net >= 0 ? 4 : 185, net >= 0 ? 120 : 28, net >= 0 ? 87 : 28);
          doc.text(formatIDR(net), pageWidth - 40, sy, { align: "right" });

          sy += 15;
        }
        sy += 5;
      }
    }

    drawFooter(doc, { t, pageLabelPrefix: "" });
    finalizePageNumbers(doc, t);
    return doc;
  }

  // Page 1 starts further down to make room for the manually-drawn summary card.
  const firstPageStartY = HEADER_HEIGHT + SUMMARY_BLOCK_HEIGHT;

  const noDataMessage = transactions.length === 0 ? t("export.no_transactions") : undefined;

  const body = transactions.map((tx) => {
    const sign = tx.type === "income" ? "+" : "-";
    const catLabel = resolveCategoryLabel(tx.category, categories, locale);
    const walletBadge = (!walletFilterLabel && wallets && wallets.length > 0) ? resolveWalletLabel(tx.wallet_id, wallets, t) : null;
    return [
      tx.transaction_date,
      tx.note ? tx.note : "-",
      walletBadge ? `${catLabel}\n${walletBadge}` : catLabel,
      tx.type === "income" ? t("transaction.income") : t("transaction.expense"),
      `${sign}${formatIDR(tx.amount)}`,
    ];
  });

  autoTable(doc, {
    head: [[
      t("export.col_date"),
      t("export.col_description"),
      t("export.col_category"),
      t("export.col_type"),
      t("export.col_amount"),
    ]],
    body: noDataMessage ? [] : body,
    startY: firstPageStartY,
    margin: { top: HEADER_HEIGHT, left: 40, right: 40, bottom: 50 },
    styles: { fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 249, 251] }, // Ultra light clean slate grey-blue
    columnStyles: {
      0: { cellWidth: 65, halign: "center" },
      1: { cellWidth: 185, halign: "left" },
      2: { cellWidth: 95, halign: "left" },
      3: { cellWidth: 80, halign: "center" },
      4: { cellWidth: 90, halign: "right" },
    },
    didParseCell: (data) => {
      // Color and bold nominals with premium dark palette
      if (data.section === "body" && data.column.index === 4) {
        const val = String(data.cell.raw || "");
        if (val.startsWith("+")) {
          data.cell.styles.textColor = [4, 120, 87]; // Emerald-700 (premium dark emerald)
          data.cell.styles.fontStyle = "bold";
        } else if (val.startsWith("-")) {
          data.cell.styles.textColor = [185, 28, 28]; // Red-700 (premium dark crimson)
          data.cell.styles.fontStyle = "bold";
        }
      }
      // Color and bullet style the type column
      if (data.section === "body" && data.column.index === 3) {
        const val = String(data.cell.raw || "");
        if (val.includes(t("transaction.income"))) {
          data.cell.styles.textColor = [4, 120, 87]; // Emerald-700
          data.cell.styles.fontStyle = "bold";
        } else {
          data.cell.styles.textColor = [185, 28, 28]; // Red-700
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
    willDrawPage: () => {
    },
    didDrawPage: () => {
      drawHeader(doc, headerOpts);
      drawFooter(doc, { t, pageLabelPrefix: "" });
    },
  });

  // Summary cards with semantical visual grouping and premium styling, drawn on page 1
  doc.setPage(1);
  let sy = HEADER_HEIGHT;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59); // Slate-800
  doc.text(t("export.summary_title"), 40, sy);
  sy += 16;

  const cardData = [
    {
      label: t("export.total_income"),
      value: formatIDR(totals.income),
      fillColor: [236, 253, 245], // Emerald-50
      borderColor: [34, 197, 94], // Emerald-500
      labelColor: [6, 95, 70], // Emerald-800
      valueColor: [4, 120, 87] // Emerald-700
    },
    {
      label: t("export.total_expense"),
      value: formatIDR(totals.expense),
      fillColor: [254, 242, 242], // Red-50
      borderColor: [239, 68, 68], // Red-500
      labelColor: [153, 27, 27], // Red-800
      valueColor: [185, 28, 28] // Red-700
    },
    {
      label: t("export.net_balance"),
      value: formatIDR(totals.net),
      fillColor: totals.net >= 0 ? [239, 246, 255] : [254, 242, 242], // Blue-50 or Red-50
      borderColor: totals.net >= 0 ? [59, 130, 246] : [239, 68, 68], // Blue-500 or Red-500
      labelColor: totals.net >= 0 ? [30, 64, 175] : [153, 27, 27], // Blue-800 or Red-800
      valueColor: totals.net >= 0 ? [29, 78, 216] : [185, 28, 28] // Blue-700 or Red-700
    },
    {
      label: t("export.transaction_count"),
      value: String(totals.count),
      fillColor: [250, 245, 255], // Purple-50
      borderColor: [168, 85, 247], // Purple-500
      labelColor: [107, 33, 168], // Purple-800
      valueColor: [126, 34, 206] // Purple-700
    }
  ];

  const colGap = 8;
  const cardW = (pageWidth - 80 - 3 * colGap) / 4;
  const cardH = 54;

  cardData.forEach((card, idx) => {
    const x = 40 + idx * (cardW + colGap);
    
    // Draw Rounded Card Container
    doc.setFillColor(card.fillColor[0], card.fillColor[1], card.fillColor[2]);
    doc.setDrawColor(card.borderColor[0], card.borderColor[1], card.borderColor[2]);
    doc.setLineWidth(1);
    doc.roundedRect(x, sy, cardW, cardH, 6, 6, "FD");

    // Draw Card Label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(card.labelColor[0], card.labelColor[1], card.labelColor[2]);
    doc.text(card.label, x + 10, sy + 18);

    // Draw Card Value
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(card.valueColor[0], card.valueColor[1], card.valueColor[2]);
    doc.text(card.value, x + 10, sy + 38);
  });

  if (noDataMessage) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(130, 130, 130);
    doc.text(noDataMessage, 40, firstPageStartY + 20);
  }

  finalizePageNumbers(doc, t);
  return doc;
};

/**
 * PDF Ringkasan: period is always day-1-of-current-month through today.
 * No page is left blank: if there are zero transactions, a localized
 * "no transactions" message is shown instead of an empty table.
 */
export const exportSummaryPdf = (params: {
  t: TFunc;
  userName: string;
  transactions: Transaction[];
  categories: Category[];
  wallets?: PdfWalletInfo[];
  /** ID pos dompet buat filter opsional -- null/undefined berarti "Semua Pos". */
  walletId?: string | null;
}) => {
  const { t, userName, transactions, categories, wallets, walletId } = params;
  const { start, end } = getCurrentMonthToDateRange();
  const walletFilterLabel = walletId ? resolveWalletLabel(walletId, wallets, t) : null;
  const scopedTransactions = walletId ? transactions.filter(tx => tx.wallet_id === walletId) : transactions;
  const periodLabel = walletFilterLabel
    ? `${toISODate(start)} - ${toISODate(end)} · ${walletFilterLabel}`
    : `${toISODate(start)} - ${toISODate(end)}`;
  const docNumber = generateDocNumber();

  const doc = renderDocument(
    {
      t,
      userName,
      transactions: scopedTransactions,
      categories,
      periodLabel,
      reportTitle: t("export.summary_report_title"),
      wallets,
      walletFilterLabel,
    },
    docNumber
  );

  const filePrefix = t("export.file_prefix_summary");
  const monthLabel = monthName(t, start.getMonth() + 1);
  const filename = sanitizeFilename(
    `${filePrefix}_${monthLabel}-${start.getFullYear()}_${docNumber}.pdf`
  );
  doc.save(filename);
  return filename;
};

/**
 * PDF Penuh: user-selected "YYYY-MM" range (max 3 months inclusive, validated
 * by the caller before invoking this function). Always queries the full
 * range from the database (no row-count cap), letting autoTable paginate.
 */
export const exportFullPdf = (params: {
  t: TFunc;
  userName: string;
  transactions: Transaction[];
  categories: Category[];
  fromMonth: string;
  toMonth: string;
  wallets?: PdfWalletInfo[];
  walletId?: string | null;
}) => {
  const { t, userName, transactions, categories, fromMonth, toMonth, wallets, walletId } = params;
  const { start, end } = getMonthRange(fromMonth, toMonth);
  const walletFilterLabel = walletId ? resolveWalletLabel(walletId, wallets, t) : null;
  const scopedTransactions = walletId ? transactions.filter(tx => tx.wallet_id === walletId) : transactions;
  const periodLabel = walletFilterLabel
    ? `${toISODate(start)} - ${toISODate(end)} · ${walletFilterLabel}`
    : `${toISODate(start)} - ${toISODate(end)}`;
  const docNumber = generateDocNumber();

  const doc = renderDocument(
    {
      t,
      userName,
      transactions: scopedTransactions,
      categories,
      periodLabel,
      reportTitle: t("export.full_report_title"),
      wallets,
      walletFilterLabel,
    },
    docNumber
  );

  const filePrefix = t("export.file_prefix_full");
  const [fy, fm] = fromMonth.split("-").map(Number);
  const [ty, tm] = toMonth.split("-").map(Number);
  const fromLabel = `${monthName(t, fm)} ${fy}`;
  const toLabel = `${monthName(t, tm)} ${ty}`;
  const filename = sanitizeFilename(
    `${filePrefix}_${fromLabel}-${toLabel}_${docNumber}.pdf`
  );
  doc.save(filename);
  return filename;
};

/**
 * High-performance backend PDF generator returning a Uint8Array representation.
 * Dipakai oleh bot Telegram (command /pdf) -- filter pos dompet (kalau ada)
 * sudah harus dilakukan oleh caller sebelum transactions dilempar ke sini,
 * sama seperti caller juga yang menyusun periodLabel/reportTitle.
 */
export function generatePdf(params: {
  t: TFunc;
  userName: string;
  transactions: Transaction[];
  categories: Category[];
  periodLabel: string;
  reportTitle: string;
  summaryOnly?: boolean;
  wallets?: PdfWalletInfo[];
  walletFilterLabel?: string | null;
}): Uint8Array {
  const docNumber = generateDocNumber();
  const doc = renderDocument(
    {
      t: params.t,
      userName: params.userName,
      transactions: params.transactions,
      categories: params.categories,
      periodLabel: params.periodLabel,
      reportTitle: params.reportTitle,
      summaryOnly: params.summaryOnly,
      wallets: params.wallets,
      walletFilterLabel: params.walletFilterLabel,
    },
    docNumber
  );
  const arrayBuffer = doc.output("arraybuffer");
  return new Uint8Array(arrayBuffer);
}

