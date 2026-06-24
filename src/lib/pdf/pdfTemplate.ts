import { jsPDF, GState } from "jspdf";
import { drawPdfBrandHeader } from "./pdfBranding";

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

/**
 * Draws a low-opacity diagonal watermark centered within the *content area*
 * of the page (between the header and footer), not the raw page center.
 *
 * IMPORTANT: jsPDF's built-in `align`/`baseline` options compute their
 * offset in absolute page space BEFORE the rotation matrix is applied, not
 * in the text's own rotated frame. Combined with `angle`, this causes the
 * rendered text to land visibly off-center (the wider the text, the bigger
 * the drift). To avoid that bug entirely, we skip align/baseline and
 * manually compute the anchor point with basic trigonometry so the
 * rotated text's true geometric center lands exactly on (centerX, centerY).
 */
export const drawWatermark = (
  doc: jsPDF,
  text: string,
  contentBounds?: { top: number; bottom: number }
): void => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const top = contentBounds?.top ?? 0;
  const bottom = contentBounds?.bottom ?? pageHeight;
  const centerX = pageWidth / 2;
  const centerY = (top + bottom) / 2;

  const fontSize = 60;
  const angleDeg = 45;

  doc.saveGraphicsState();
  doc.setGState(new GState({ opacity: 0.02 }));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSize);
  doc.setTextColor(120, 120, 120);

  const textWidth = doc.getTextWidth(text);
  const capHeight = fontSize * 0.72; // approximation for bold all-caps text

  const rad = (angleDeg * Math.PI) / 180;
  const cosT = Math.cos(rad);
  const sinT = Math.sin(rad);

  // Local offset (in the text's own unrotated frame) from the default
  // baseline-left anchor to the text's true visual center.
  const dx = textWidth / 2;
  const dy = -capHeight / 2;

  // Rotate that local offset by angleDeg (counter-clockwise as viewed,
  // matching jsPDF's default rotation direction with a y-down page).
  const offsetX = dx * cosT + dy * sinT;
  const offsetY = -dx * sinT + dy * cosT;

  // Place the anchor so that, once rotated, the text's center lands
  // exactly on (centerX, centerY).
  const anchorX = centerX - offsetX;
  const anchorY = centerY - offsetY;

  doc.text(text, anchorX, anchorY, { angle: angleDeg });
  doc.restoreGraphicsState();
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

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(180, 180, 180);
  doc.text("www.ewalletkita.app", MARGIN, y + 6);

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
