import { supabase } from "./supabase";
import { generatePremiumReceiptBase64 } from "./receipt";

interface SendPremiumReceiptParams {
  email: string;
  customerName: string;
  orderId: string;
  amount: number;
  totalAmount: number;
  paidAt: string;
  buyerName: string;
  sandbox: boolean;
  t: any;
}

export async function sendPremiumReceiptEmail(
  params: SendPremiumReceiptParams
) {
  const pdfBase64 = await generatePremiumReceiptBase64({
    orderId: params.orderId,
    amount: params.amount,
    totalAmount: params.totalAmount,
    paidAt: params.paidAt,
    buyerName: params.buyerName,
    sandbox: params.sandbox,
    t: params.t,
  });

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const response = await fetch("/api/receipt?action=send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      email: params.email,
      customerName: params.customerName,
      orderId: params.orderId,
      amount: `Rp ${params.totalAmount.toLocaleString("id-ID")}`,
      paymentMethod: params.sandbox ? "QRIS Sandbox" : "QRIS",
      purchaseDate: new Date(params.paidAt).toLocaleString("id-ID"),
      pdfBase64,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    console.error("Email API Error:", result);
    throw new Error(result.error || "Gagal mengirim struk ke email");
  }

  return result;
}
