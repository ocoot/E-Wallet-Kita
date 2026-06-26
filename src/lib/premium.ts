import { supabase } from "./supabase";
import { PremiumPricing } from "../types";

export interface PremiumTransaction {
  order_id: string;
  amount: number;
  total_amount: number;
  qris_url: string;
  expired_at: string; // ISO
  status: "PENDING" | "SUCCESS" | "EXPIRED" | "FAILED";
  voucher_id?: string;
  final_amount?: number;
  // true kalau transaksi ini dibuat sebagai dummy oleh backend karena toggle
  // "Dummy QRIS" di Admin Panel aktif (lihat api/premium/create-transaction.ts).
  // Beda dengan isSandboxMode() di bawah, yang murni client-side & DEV-only.
  is_sandbox?: boolean;
}

const PREMIUM_AMOUNT = 20000;
const QRIS_EXPIRY_SECONDS = 90; // 01:30

export function getPremiumPricing(basePrice: number, discountPercent: number = 0): PremiumPricing {
  const discountAmount = Math.floor((basePrice * discountPercent) / 100);
  const finalPrice = basePrice - discountAmount;
  return {
    basePrice,
    discountPercent,
    discountAmount,
    finalPrice,
  };
}

export function isSandboxMode(): boolean {
  return import.meta.env.DEV;
}

function randomUniqueCode(): number {
  return Math.floor(Math.random() * 99) + 1; // 1-99
}

async function getAuthToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("NO_SESSION");
  return token;
}

/**
 * Sandbox: simulasi penuh di client, tidak memanggil API KlikQRIS asli.
 * QR yang ditampilkan adalah QR dummy (encode string acak), karena di lingkungan
 * preview AI Studio tidak ada cara scan/transfer uang sungguhan.
 */
export async function createPremiumTransaction(userId: string, voucherId?: string, discountPercent: number = 0, basePrice: number = PREMIUM_AMOUNT): Promise<PremiumTransaction> {
  const pricing = getPremiumPricing(basePrice, discountPercent);
  
  if (isSandboxMode()) {
    const orderId = `SANDBOX-PREMIUM-${userId.slice(0, 8)}-${Date.now()}`;
    const totalAmount = pricing.finalPrice + randomUniqueCode();
    const expiredAt = new Date(Date.now() + QRIS_EXPIRY_SECONDS * 1000).toISOString();
    const qrisUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(
      `SANDBOX-QRIS|${orderId}|${totalAmount}`
    )}`;

    const { data, error } = await supabase.from("premium_transactions").insert({
      user_id: userId,
      order_id: orderId,
      amount: basePrice,
      total_amount: totalAmount,
      status: "PENDING",
      qris_url: qrisUrl,
      is_sandbox: true,
      expired_at: expiredAt,
      voucher_id: voucherId,
      discount_percent: discountPercent,
      discount_amount: pricing.discountAmount,
      final_amount: pricing.finalPrice,
    });

    return { order_id: orderId, amount: basePrice, total_amount: totalAmount, qris_url: qrisUrl, expired_at: expiredAt, status: "PENDING", voucher_id: voucherId, final_amount: pricing.finalPrice };
  }

  const token = await getAuthToken();
  const res = await fetch("/api/premium/create-transaction", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ voucherId }),
  });
  const json = await res.json();
  if (!res.ok || !json?.data) throw new Error(json?.error || "CREATE_TRANSACTION_FAILED");
  return json.data;
}

/**
 * Sandbox: setelah 8 detik dari created_at, transaksi otomatis dianggap SUCCESS
 * (mensimulasikan pembayaran berhasil) supaya alur bisa diuji di preview.
 * Real: tanya status sebenarnya ke server -> KlikQRIS.
 */
export async function checkPremiumStatus(orderId: string): Promise<"PENDING" | "SUCCESS" | "EXPIRED" | "FAILED"> {
  if (isSandboxMode()) {
    const { data } = await supabase
      .from("premium_transactions")
      .select("status, created_at, expired_at")
      .eq("order_id", orderId)
      .single();
    if (!data) return "FAILED";
    if (data.status === "SUCCESS" || data.status === "EXPIRED") return data.status as any;

    const ageMs = Date.now() - new Date(data.created_at).getTime();
    const expired = Date.now() > new Date(data.expired_at).getTime();

    if (ageMs > 8000 && !expired) {
      const { data: userRow } = await supabase.auth.getUser();
      await supabase.from("premium_transactions").update({ status: "SUCCESS", paid_at: new Date().toISOString() }).eq("order_id", orderId);
      if (userRow.user) {
        await supabase.from("users").update({ is_premium: true, premium_paid_at: new Date().toISOString() }).eq("id", userRow.user.id);
      }
      return "SUCCESS";
    }
    if (expired) {
      await supabase.from("premium_transactions").update({ status: "EXPIRED" }).eq("order_id", orderId);
      return "EXPIRED";
    }
    return "PENDING";
  }

  const token = await getAuthToken();
  const res = await fetch(`/api/premium/status?order_id=${encodeURIComponent(orderId)}&_t=${Date.now()}`, {
    headers: { 
      Authorization: `Bearer ${token}`,
      "Cache-Control": "no-cache"
    },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "STATUS_CHECK_FAILED");
  return json.status;
}

export { PREMIUM_AMOUNT, QRIS_EXPIRY_SECONDS };
