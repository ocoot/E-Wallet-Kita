import { supabase } from "./supabase";

export interface PremiumTransaction {
  order_id: string;
  amount: number;
  total_amount: number;
  qris_url: string;
  expired_at: string; // ISO
  status: "PENDING" | "SUCCESS" | "EXPIRED" | "FAILED";
}

const PREMIUM_AMOUNT = 501;
const QRIS_EXPIRY_SECONDS = 90; // 01:30

export function isSandboxMode(): boolean {
  try {
    const host = window.location.hostname;
    return (
      host.includes("aistudio") ||
      host.includes("usercontent.goog") ||
      host === "localhost" ||
      host === "127.0.0.1"
    );
  } catch {
    return true;
  }
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
export async function createPremiumTransaction(userId: string): Promise<PremiumTransaction> {
  if (isSandboxMode()) {
    const orderId = `SANDBOX-PREMIUM-${userId.slice(0, 8)}-${Date.now()}`;
    const totalAmount = PREMIUM_AMOUNT + randomUniqueCode();
    const expiredAt = new Date(Date.now() + QRIS_EXPIRY_SECONDS * 1000).toISOString();
    const qrisUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(
      `SANDBOX-QRIS|${orderId}|${totalAmount}`
    )}`;

    await supabase.from("premium_transactions").insert({
      user_id: userId,
      order_id: orderId,
      amount: PREMIUM_AMOUNT,
      total_amount: totalAmount,
      status: "PENDING",
      qris_url: qrisUrl,
      is_sandbox: true,
      expired_at: expiredAt,
    });

    return { order_id: orderId, amount: PREMIUM_AMOUNT, total_amount: totalAmount, qris_url: qrisUrl, expired_at: expiredAt, status: "PENDING" };
  }

  const token = await getAuthToken();
  const res = await fetch("/api/premium/create-transaction", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
