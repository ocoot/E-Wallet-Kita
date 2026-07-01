import { supabase } from "./supabase";

async function getAuthToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("NO_SESSION");
  return token;
}

/**
 * Kontrol privasi & data milik user sendiri (self-service).
 * Lihat api/account/privacy.ts untuk detail server-side.
 */

/** Ekspor seluruh data pribadi user sebagai file JSON, lalu trigger download di browser. */
export async function exportMyData(): Promise<void> {
  const token = await getAuthToken();
  const res = await fetch("/api/account/privacy", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(json?.error || "EXPORT_FAILED");
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ewallet-kita-data-${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Hapus akun & seluruh data pribadi user secara permanen. Tidak bisa dibatalkan. */
export async function deleteMyAccount(): Promise<void> {
  const token = await getAuthToken();
  const res = await fetch("/api/account/privacy", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ confirmation: "DELETE" }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.error || "DELETE_ACCOUNT_FAILED");
  }
}
