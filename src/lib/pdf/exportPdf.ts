import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Transaction } from "../../types";
import {
  drawHeader,
  drawWatermark,
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

const HEADER_HEIGHT = 130; // px reserved at top of every page for the header block
const SUMMARY_BLOCK_HEIGHT = 90; // extra space reserved on page 1 only, for the summary card

interface ExportContext {
  t: TFunc;
  userName: string;
  transactions: Transaction[];
  periodLabel: string;
  reportTitle: string;
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
  const { t, userName, transactions, periodLabel, reportTitle } = ctx;
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

  // Page 1 starts further down to make room for the manually-drawn summary card.
  const firstPageStartY = HEADER_HEIGHT + SUMMARY_BLOCK_HEIGHT;

  const noDataMessage = transactions.length === 0 ? t("export.no_transactions") : undefined;

  const body = transactions.map((tx) => {
    const sign = tx.type === "income" ? "+" : "-";
    return [
      tx.transaction_date,
      tx.note ? tx.note : "-",
      t(`categories.${tx.category}`),
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
    headStyles: { fillColor: [60, 60, 130], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 245, 250] },
    columnStyles: {
      4: { halign: "right" },
    },
    didDrawPage: () => {
      drawHeader(doc, headerOpts);
      const pageHeight = doc.internal.pageSize.getHeight();
      drawWatermark(doc, watermarkText, { top: HEADER_HEIGHT, bottom: pageHeight - 50 });
      drawFooter(doc, { t, pageLabelPrefix: "" });
    },
  });

  // Summary card, drawn once on page 1 only, in the reserved gap above the table.
  doc.setPage(1);
  const pageWidth = doc.internal.pageSize.getWidth();
  let sy = HEADER_HEIGHT;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text(t("export.summary_title"), 40, sy);
  sy += 18;

  const cardItems: [string, string][] = [
    [t("export.total_income"), formatIDR(totals.income)],
    [t("export.total_expense"), formatIDR(totals.expense)],
    [t("export.net_balance"), formatIDR(totals.net)],
    [t("export.transaction_count"), String(totals.count)],
  ];
  const colWidth = (pageWidth - 80) / cardItems.length;
  cardItems.forEach(([label, value], idx) => {
    const x = 40 + idx * colWidth;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(label, x, sy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30, 30, 30);
    doc.text(value, x, sy + 16);
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
}) => {
  const { t, userName, transactions } = params;
  const { start, end } = getCurrentMonthToDateRange();
  const periodLabel = `${toISODate(start)} - ${toISODate(end)}`;
  const docNumber = generateDocNumber();

  const doc = renderDocument(
    {
      t,
      userName,
      transactions,
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
  fromMonth: string;
  toMonth: string;
}) => {
  const { t, userName, transactions, fromMonth, toMonth } = params;
  const { start, end } = getMonthRange(fromMonth, toMonth);
  const periodLabel = `${toISODate(start)} - ${toISODate(end)}`;
  const docNumber = generateDocNumber();

  const doc = renderDocument(
    {
      t,
      userName,
      transactions,
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
