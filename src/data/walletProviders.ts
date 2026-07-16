import { WalletType } from "../types";
import gopayLogo from "../assets/images/providers/gopay.png";
import ovoLogo from "../assets/images/providers/ovo.jpg";
import shopeepayLogo from "../assets/images/providers/shopeepay.jpg";
import danaLogo from "../assets/images/providers/dana.webp";

/**
 * Katalog provider E-Wallet & Bank untuk dropdown "Tambah Dompet" (Wallets.tsx)
 * dan untuk styling kartu bermerek di DashboardWalletCarousel. `id` disimpan
 * ke kolom `provider` (TEXT bebas, lihat migrations/20260803040000) supaya
 * tetap kompatibel dengan wallet lama yang provider-nya freeform/kosong --
 * pencocokan di `matchProvider()` di bawah dilakukan case-insensitive by name,
 * bukan foreign key, jadi tidak perlu migrasi DB apa pun untuk fitur ini.
 *
 * `color` = warna brand utama (dipakai untuk tint kartu transparan/glass di
 * dashboard). `logo` hanya tersedia untuk e-wallet (asset diberikan user);
 * bank memakai inisial di badge berwarna karena belum ada logo resmi di aset.
 *
 * `logoBgColor` = warna solid PERSIS seperti warna latar yang sudah baked-in
 * di file logo itu sendiri (dicek manual per-piksel dari asetnya). Dipakai
 * DashboardWalletCarousel sebagai warna dasar kartu supaya saat logo
 * ditampilkan penuh lewat object-contain (tidak pernah di-crop), area
 * letterbox kosong di kartu (kalau rasio logo tidak persis sama dengan
 * rasio kartu) menyatu mulus dengan warna aset -- kesannya foto benar-benar
 * "membungkus" seluruh kartu, bukan mengambang dengan garis pinggir yang
 * kentara. Beda dari `color` (warna brand resmi) karena beberapa aset logo
 * ternyata punya latar sendiri yang tidak 100% sama (mis. Gopay: latar
 * asetnya putih, walau warna brand resminya hijau).
 */
export interface WalletProviderOption {
  id: string;
  name: string;
  color: string;
  logo?: string;
  logoBgColor?: string;
}

export const OTHER_PROVIDER_ID = "lainnya";

export const EWALLET_PROVIDERS: WalletProviderOption[] = [
  { id: "gopay", name: "Gopay", color: "#00AA5B", logo: gopayLogo, logoBgColor: "#FFFFFF" },
  { id: "ovo", name: "OVO", color: "#4C3494", logo: ovoLogo, logoBgColor: "#4E3394" },
  { id: "shopeepay", name: "ShopeePay", color: "#EE4D2D", logo: shopeepayLogo, logoBgColor: "#ED4C2F" },
  { id: "dana", name: "Dana", color: "#118EEA", logo: danaLogo, logoBgColor: "#2395F3" },
];

export const BANK_PROVIDERS: WalletProviderOption[] = [
  { id: "mandiri", name: "Bank Mandiri", color: "#003D79" },
  { id: "bca", name: "BCA", color: "#0058A3" },
  { id: "bri", name: "BRI", color: "#00529C" },
  { id: "bni", name: "BNI", color: "#F37021" },
];

export const PROVIDER_CATALOG: Record<"ewallet" | "bank", WalletProviderOption[]> = {
  ewallet: EWALLET_PROVIDERS,
  bank: BANK_PROVIDERS,
};

/** Warna netral dipakai untuk "Lainnya", Cash, dan Saldo Umum. */
export const NEUTRAL_PROVIDER_COLOR = "#6366F1";

/**
 * Cocokkan wallet.provider (string bebas, hasil pilihan dropdown ATAU input
 * lama sebelum fitur ini ada) ke entri katalog. Case-insensitive & partial
 * match supaya wallet lama seperti provider="gopay" (huruf kecil) atau
 * "Bank Mandiri Syariah" tetap kebagian logo/warna yang sesuai.
 */
export function matchProvider(type: WalletType, provider: string | null | undefined): WalletProviderOption | null {
  if (!provider || (type !== "ewallet" && type !== "bank")) return null;
  const list = PROVIDER_CATALOG[type];
  const needle = provider.trim().toLowerCase();
  if (!needle) return null;
  return (
    list.find((p) => p.name.toLowerCase() === needle) ||
    list.find((p) => needle.includes(p.id) || p.name.toLowerCase().includes(needle) || needle.includes(p.name.toLowerCase())) ||
    null
  );
}
