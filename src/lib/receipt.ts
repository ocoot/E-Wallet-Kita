import jsPDF from "jspdf";
import { ReceiptCardData } from "../components/ReceiptCard";
import { captureReceiptCardAsPng } from "./receiptRender";

interface ReceiptData extends ReceiptCardData {
  t: (key: string, replacements?: Record<string, string | number>) => string;
}

/**
 * Membuat PDF struk pembelian Premium dengan MEMOTRET komponen
 * `<ReceiptCard/>` (lihat `components/ReceiptCard.tsx`) lewat html2canvas —
 * bukan digambar ulang manual pakai koordinat X/Y jsPDF seperti sebelumnya.
 *
 * Karena PDF dan preview di layar (`PremiumModal.tsx` step "success")
 * sama-sama sumbernya dari `ReceiptCard`, keduanya dijamin selalu identik.
 * Kalau desain struk mau diubah, cukup edit `ReceiptCard.tsx` satu kali.
 */
export async function generatePremiumReceipt(data: ReceiptData): Promise<jsPDF> {
  const { t, ...cardData } = data;
  const { dataUrl, width, height } = await captureReceiptCardAsPng(cardData, t);

  // Konversi ukuran hasil capture (px) ke satuan pt jsPDF, sambil menjaga
  // rasio asli kartu supaya tidak gepeng/melar di PDF.
  const MARGIN = 14;
  const PAGE_W = 320;
  const imgW = PAGE_W - MARGIN * 2;
  const imgH = (height / width) * imgW;
  const PAGE_H = imgH + MARGIN * 2;

  const doc = new jsPDF({ unit: "pt", format: [PAGE_W, PAGE_H] });
  doc.addImage(dataUrl, "PNG", MARGIN, MARGIN, imgW, imgH);

  return doc;
}

export async function generatePremiumReceiptBase64(data: ReceiptData): Promise<string> {
  const pdf = await generatePremiumReceipt(data);
  const arrayBuffer = pdf.output("arraybuffer");
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}
