import { jsPDF } from "jspdf";
import { LOGO_BASE64 } from "./logoBase64";

export const PDF_BRAND = {
  appName: "E-Wallet Kita",
  primaryColor: [15, 23, 42], // Slate-900
  secondaryColor: [99, 102, 241], // Indigo-500
};

export interface BrandHeaderOpts {
  t: (key: string, replacements?: Record<string, string | number>) => string;
  title: string;
  userName: string;
  periodLabel: string;
  generatedAtLabel: string;
  docNumber: string;
}

/**
 * Draws a standardized beautiful header with logo and app branding on PDF.
 */
export function drawPdfBrandHeader(doc: jsPDF, opts: BrandHeaderOpts, margin: number = 40): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = margin;

  // Draw Logo
  try {
    // Add image from Base64 (PNG format, width 32, height 32, aligned horizontally)
    doc.addImage(LOGO_BASE64, "PNG", margin, y - 10, 32, 32);
  } catch (e) {
    console.error("Error drawing logo in PDF:", e);
  }

  // Draw App Name beside Logo
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(PDF_BRAND.primaryColor[0], PDF_BRAND.primaryColor[1], PDF_BRAND.primaryColor[2]);
  doc.text(PDF_BRAND.appName, margin + 42, y + 10);

  // Document number, top-right
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(`${opts.t("export.doc_number")}: ${opts.docNumber}`, pageWidth - margin, y + 10, {
    align: "right",
  });

  y += 45;

  // Report title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(30, 41, 59); // Slate-800
  doc.text(opts.title, margin, y);
  y += 20;

  // Meta info block
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // Slate-500
  doc.text(`${opts.t("export.user")}: ${opts.userName}`, margin, y);
  doc.text(opts.generatedAtLabel, pageWidth - margin, y, { align: "right" });
  y += 14;
  doc.text(`${opts.t("export.period")}: ${opts.periodLabel}`, margin, y);
  y += 18;

  // Divider line
  doc.setDrawColor(226, 232, 240); // Slate-200
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 16;

  return y;
}
