import { jsPDF } from "jspdf";
import { drawPdfBrandHeader } from "./pdfBranding.js";

export type TFunc = (key: string, replacements?: Record<string, string | number>) => string;

const MARGIN = 40;

/**
 * Draws the page header (logo/app name, report title, user, period, generated-at,
 * document number). Returns the Y position where table content can start.
 */
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

/** Draws the footer (left: app credit/confidential note, right: page number placeholder). */
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

/**
 * After all pages are drawn, jsPDF knows the final page count. This walks
 * every page and overwrites the placeholder with "Page X of Y" (or the
 * localized equivalent), right-aligned in the footer.
 */
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
