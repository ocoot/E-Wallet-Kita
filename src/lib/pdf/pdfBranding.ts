import { jsPDF } from "jspdf";
import { LOGO_BASE64 } from "./logoBase64.js";

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

  // Draw Logo (width 32, height 32)
  try {
    doc.addImage(LOGO_BASE64, "PNG", margin, y - 10, 32, 32);
  } catch (e) {
    console.error("Error drawing logo in PDF:", e);
  }

  // Draw App Name beside Logo
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(PDF_BRAND.primaryColor[0], PDF_BRAND.primaryColor[1], PDF_BRAND.primaryColor[2]);
  
  const translatedTitle = opts.t("title");
  const appName = translatedTitle && translatedTitle !== "title" ? translatedTitle : PDF_BRAND.appName;
  doc.text(appName, margin + 42, y + 10);

  // Tagline
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  const tagline = opts.t("export.pdf_tagline");
  doc.text(
    tagline && tagline !== "pdf_tagline" ? tagline : "Atur Keuangan Semudah Kirim Pesan",
    margin + 42,
    y + 18
  );
  doc.setTextColor(0, 0, 0); // Reset color

  // Document info, top-right
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139); // Slate-500
  doc.text(`${opts.t("export.doc_number").toUpperCase()}: ${opts.docNumber}`, pageWidth - margin, y + 4, {
    align: "right",
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184); // Slate-400
  doc.text(opts.generatedAtLabel, pageWidth - margin, y + 16, {
    align: "right",
  });

  y += 45; // y = 85

  // Report title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(30, 41, 59); // Slate-800
  doc.text(opts.title, margin, y);
  y += 18; // y = 103

  // Draw Cover Ribbon (Visual banner with rounded corners)
  doc.setFillColor(241, 245, 249); // Slate-100 (light premium gray)
  doc.roundedRect(margin, y, pageWidth - 2 * margin, 24, 4, 4, "F");

  // Inside Ribbon text
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105); // Slate-600
  doc.text(`${opts.t("export.user").toUpperCase()}: ${opts.userName.toUpperCase()}`, margin + 10, y + 15);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105); // Slate-600
  doc.text(`${opts.t("export.period").toUpperCase()}: ${opts.periodLabel}`, pageWidth - margin - 10, y + 15, { align: "right" });

  y += 36; // y = 139

  // Divider line
  doc.setDrawColor(226, 232, 240); // Slate-200
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 16; // y = 155

  return y;
}
