import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Transaction, Category } from "../../types";
import idLocales from "../../locales/id.json" assert { type: "json" };
import enLocales from "../../locales/en.json" assert { type: "json" };
import {
  drawHeader,
  drawFooter,
  finalizePageNumbers,
  TFunc,
} from "./pdfTemplate";
import {
  getCurrentMonthToDateRange,
  getMonthRange,
  toISODate,
  generateDocNumber,
} from "./dateRange";

const HEADER_HEIGHT = 155; // px reserved at top of every page for the header block
const SUMMARY_BLOCK_HEIGHT = 100; // extra space reserved on page 1 only, for the summary card

interface ExportContext {
  t: TFunc;
  userName: string;
  transactions: Transaction[];
  categories: Category[];
  periodLabel: string;
  reportTitle: string;
  summaryOnly?: boolean;
}

/** Resolve category label from DB categories, fallback to key if not found. */
function resolveCategoryLabel(key: string, categories: Category[], locale: "id" | "en"): string {
  const cat = categories.find(c => c.key === key);
  if (!cat) return key;
  return locale === "id" ? (cat.label_id || key) : (cat.label_en || key);
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
  const { t, userName, transactions, categories, periodLabel, reportTitle, summaryOnly } = ctx;
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

    drawFooter(doc, { t, pageLabelPrefix: "" });
    finalizePageNumbers(doc, t);
    return doc;
  }

  // Page 1 starts further down to make room for the manually-drawn summary card.
  const firstPageStartY = HEADER_HEIGHT + SUMMARY_BLOCK_HEIGHT;

  const noDataMessage = transactions.length === 0 ? t("export.no_transactions") : undefined;

  const body = transactions.map((tx) => {
    const sign = tx.type === "income" ? "+" : "-";
    return [
      tx.transaction_date,
      tx.note ? tx.note : "-",
      resolveCategoryLabel(tx.category, categories, locale),
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
}) => {
  const { t, userName, transactions, categories } = params;
  const { start, end } = getCurrentMonthToDateRange();
  const periodLabel = `${toISODate(start)} - ${toISODate(end)}`;
  const docNumber = generateDocNumber();

  const doc = renderDocument(
    {
      t,
      userName,
      transactions,
      categories,
      periodLabel,
      reportTitle: t("export.summary_report_title"),
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
}) => {
  const { t, userName, transactions, categories, fromMonth, toMonth } = params;
  const { start, end } = getMonthRange(fromMonth, toMonth);
  const periodLabel = `${toISODate(start)} - ${toISODate(end)}`;
  const docNumber = generateDocNumber();

  const doc = renderDocument(
    {
      t,
      userName,
      transactions,
      categories,
      periodLabel,
      reportTitle: t("export.full_report_title"),
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
 * Creates a standard PDF translator function for backend use,
 * pulling translations from locales id/en JSON files.
 */
export function createPdfTranslator(lang: "id" | "en"): TFunc {
  const locales = lang === "en" ? enLocales : idLocales;
  return (key: string, replacements?: Record<string, string | number>) => {
    const parts = key.split(".");
    let current: any = locales;
    for (const part of parts) {
      if (current && typeof current === "object" && part in current) {
        current = current[part];
      } else {
        return key;
      }
    }
    if (typeof current !== "string") {
      return key;
    }
    let result = current;
    if (replacements) {
      for (const [k, v] of Object.entries(replacements)) {
        result = result.replace(`{${k}}`, String(v));
      }
    }
    return result;
  };
}

/**
 * High-performance backend PDF generator returning a Uint8Array representation.
 */
export function generatePdf(params: {
  t: TFunc;
  userName: string;
  transactions: Transaction[];
  categories: Category[];
  periodLabel: string;
  reportTitle: string;
  summaryOnly?: boolean;
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
    },
    docNumber
  );
  const arrayBuffer = doc.output("arraybuffer");
  return new Uint8Array(arrayBuffer);
}

