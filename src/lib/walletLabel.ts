import { Wallet } from "../types";

/**
 * Normalisasi longgar untuk bandingkan nama pos vs provider -- huruf kecil
 * semua, buang spasi/simbol, dan buang prefix "bank " supaya "BCA" vs
 * "BCA", atau "Bank Mandiri" (nama) vs "Mandiri" (provider), tetap
 * dianggap "sama" walau penulisannya sedikit beda.
 */
export const normalizeForCompare = (s: string) =>
  s.trim().toLowerCase().replace(/^bank\s+/, "").replace(/[^a-z0-9]/g, "");

/**
 * Label tampilan pos: provider CUMA ditambahkan kalau memang memberi info
 * baru dibanding nama pos -- kalau user menamai pos-nya persis sama dengan
 * provider (mis. nama "BCA" + provider "BCA"), tampilkan nama pos-nya saja
 * supaya tidak muncul duplikat seperti "BCA · BCA".
 *
 * DIEKSTRAK jadi helper bersama (awalnya cuma ada di
 * DashboardWalletSelectorCard.tsx) setelah WalletTransferModal.tsx sempat
 * punya salinan logika label yang lebih sederhana (tanpa dedup provider)
 * dan jadi tidak sinkron -- lihat riwayat perbaikan bug "BCA · BCA (Rp0)"
 * di dropdown "Ke Pos" pada dialog Transfer Saldo. Import helper ini di
 * mana pun butuh label pos supaya kedua tempat itu (dan tempat lain di
 * masa depan) selalu konsisten.
 */
export const walletDisplayLabel = (w: Pick<Wallet, "name" | "provider">) => {
  if (!w.provider) return w.name;
  const sameAsName = normalizeForCompare(w.provider) === normalizeForCompare(w.name);
  return sameAsName ? w.name : `${w.name} · ${w.provider}`;
};
