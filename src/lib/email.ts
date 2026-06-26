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

  const { data, error } = await supabase.functions.invoke(
    "send-premium-receipt",
    {
      body: {
        email: params.email,
        customerName: params.customerName,
        orderId: params.orderId,
        amount: `Rp ${params.totalAmount.toLocaleString("id-ID")}`,
        paymentMethod: params.sandbox ? "QRIS Sandbox" : "QRIS",
        purchaseDate: new Date(params.paidAt).toLocaleString("id-ID"),
        pdfBase64,
      },
    }
  );

  if (error) {
    console.error("Functions Error:", error);
    if ("context" in error && (error as any).context) {
      try {
        const errorText = await (error as any).context.text();
        console.error("Function Error Details:", errorText);
      } catch (e) {
        console.error("Could not parse function error context text", e);
      }
    }
    throw error;
  }

  return data;
}
