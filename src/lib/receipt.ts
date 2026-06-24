import jsPDF from "jspdf";
import { LOGO_BASE64 } from "./pdf/logoBase64";
import { PDF_BRAND } from "./pdf/pdfBranding";

interface ReceiptData {
  orderId: string;
  amount: number;
  totalAmount: number;
  paidAt: string;
  buyerName: string;
  sandbox: boolean;
  t: (key: string, replacements?: Record<string, string | number>) => string;
}

/**
 * Helper to draw the beautiful brand header with actual logo on dark banner
 */
export function drawReceiptBrand(doc: jsPDF, w: number, yStart: number, t?: (key: string) => string): number {
  let y = yStart;
  try {
    // Center logo horizontally (width 32, height 32)
    doc.addImage(LOGO_BASE64, "PNG", w / 2 - 16, y, 32, 32);
    y += 42;
  } catch (e) {
    console.error("Error drawing logo on receipt:", e);
    y += 20;
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(t ? (t("title") || PDF_BRAND.appName) : PDF_BRAND.appName, w / 2, y, { align: "center" });

  return y;
}

export function generatePremiumReceipt(data: ReceiptData): jsPDF {
  const { t } = data;
  // Adjusted height from 520 to 540 to comfortably accommodate the logo
  const doc = new jsPDF({ unit: "pt", format: [320, 540] });
  const W = 320;

  // Header background
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, 130, "F");

  // Draw brand header (Logo + App Name)
  const brandY = drawReceiptBrand(doc, W, 15, t);

  // Struk type title
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(t("premium.receipt_title"), W / 2, brandY + 18, { align: "center" });

  // Status checkmark circle
  doc.setFillColor(99, 102, 241);
  doc.circle(W / 2, 130, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text("✓", W / 2, 136, { align: "center" });

  let y = 175;
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(t("premium.receipt_status_success"), W / 2, y, { align: "center" });

  y += 30;
  doc.setDrawColor(226, 232, 240);
  doc.line(20, y, W - 20, y);

  const rows: [string, string][] = [
    [t("premium.receipt_order_no"), data.orderId],
    [t("premium.receipt_buyer"), data.buyerName],
    [t("premium.receipt_product"), t("premium.receipt_product_val")],
    [t("premium.receipt_amount"), `Rp ${data.amount.toLocaleString("id-ID")}`],
    [t("premium.receipt_total_paid"), `Rp ${data.totalAmount.toLocaleString("id-ID")}`],
    [t("premium.receipt_method"), "QRIS" + (data.sandbox ? " (Sandbox)" : "")],
    [t("premium.receipt_date"), new Date(data.paidAt).toLocaleString("id-ID")],
  ];

  y += 25;
  doc.setFontSize(10);
  rows.forEach(([label, value]) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(label, 25, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text(value, W - 25, y, { align: "right" });
    y += 22;
  });

  y += 10;
  doc.line(20, y, W - 20, y);
  y += 25;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(t("premium.receipt_thanks"), W / 2, y, { align: "center" });
  doc.text(t("premium.receipt_active_forever"), W / 2, y + 14, { align: "center" });

  return doc;
}
