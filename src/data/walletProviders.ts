import { WalletType } from "../types";
import gopayLogo from "../assets/images/providers/gopay.png";
import ovoLogo from "../assets/images/providers/ovo.jpg";
import shopeepayLogo from "../assets/images/providers/shopeepay.jpg";
import danaLogo from "../assets/images/providers/dana.webp";
import bniLogo from "../assets/images/providers/bni.png";
import mandiriLogo from "../assets/images/providers/mandiri.png";
import mandiriLogoWhite from "../assets/images/providers/mandiri-white.png";
import bcaLogo from "../assets/images/providers/bca.png";
import briLogo from "../assets/images/providers/bri.png";

/**
 * Katalog provider E-Wallet & Bank untuk dropdown "Tambah Dompet" (Wallets.tsx)
 * dan untuk styling kartu bermerek di DashboardWalletCarousel. `id` disimpan
 * ke kolom `provider` (TEXT bebas, lihat migrations/20260803040000) supaya
 * tetap kompatibel dengan wallet lama yang provider-nya freeform/kosong --
 * pencocokan di `matchProvider()` di bawah dilakukan case-insensitive by name,
 * bukan foreign key, jadi tidak perlu migrasi DB apa pun untuk fitur ini.
 *
 * `color` = warna brand utama (dipakai untuk tint kartu transparan/glass di
 * dashboard, dan sebagai fallback `logoBgColor` kalau tidak diset manual).
 * `logo` = aset PNG transparan (bank & e-wallet sama-sama punya).
 *
 * `logoBgColor` = warna solid latar kartu di belakang logo (dipakai
 * DashboardWalletCarousel sebagai warna dasar kartu supaya saat logo
 * ditampilkan penuh lewat object-contain (tidak pernah di-crop, selalu
 * center), area letterbox kosong di kartu (kalau rasio logo tidak persis
 * sama dengan rasio kartu) terisi warna solid ini -- kesannya logo benar-
 * benar "mengambang" di atas warna brand card, bukan mengambang dengan
 * garis pinggir yang kentara. Untuk e-wallet, ini dicocokkan manual per-
 * piksel dengan warna latar yang sudah baked-in di file logo itu sendiri
 * (mis. Gopay: latar asetnya putih, walau warna brand resminya hijau).
 * Untuk bank, logo asetnya transparan penuh, jadi `logoBgColor` di sini
 * murni pilihan warna kartu (brief desain), bukan hasil cocokkan piksel.
 *
 * `cardLogo` (opsional) = varian logo KHUSUS untuk kartu dashboard yang
 * latarnya gelap/solid (lihat DashboardWalletCarousel). Beberapa logo bank
 * punya wordmark berwarna gelap yang menyatu/tenggelam kalau latar
 * kartunya juga gelap (mis. Mandiri: teks "mandiri" navy di atas kartu
 * hitam) -- `cardLogo` dipakai untuk kasus itu (mis. wordmark direcolor
 * putih, pita tetap warna asli). Kalau tidak diset, fallback ke `logo`
 * biasa. `ProviderBadge` (badge kecil di /wallets, latarnya SELALU putih)
 * sengaja tetap pakai `logo` asli, bukan `cardLogo` -- supaya tidak
 * kebalik jadi tak terbaca di latar putih.
 */
export interface WalletProviderOption {
  id: string;
  name: string;
  color: string;
  logo?: string;
  logoBgColor?: string;
  cardLogo?: string;
}

export const OTHER_PROVIDER_ID = "lainnya";

export const EWALLET_PROVIDERS: WalletProviderOption[] = [
  { id: "gopay", name: "Gopay", color: "#00AA5B", logo: gopayLogo, logoBgColor: "#FFFFFF" },
  { id: "ovo", name: "OVO", color: "#4C3494", logo: ovoLogo, logoBgColor: "#4E3394" },
  { id: "shopeepay", name: "ShopeePay", color: "#EE4D2D", logo: shopeepayLogo, logoBgColor: "#ED4C2F" },
  { id: "dana", name: "Dana", color: "#118EEA", logo: danaLogo, logoBgColor: "#2395F3" },
];

export const BANK_PROVIDERS: WalletProviderOption[] = [
  // logoBgColor sesuai brief desain (bukan hasil cocokkan piksel, karena
  // logo bank asetnya transparan penuh -- lihat catatan di atas):
  //   Mandiri: hitam (sengaja BUKAN #000000 solid -- pakai charcoal gelap
  //            #141414 supaya tetap ada kedalaman, tidak flat mati)
  //   BNI:     oranye (samakan dengan warna brand resminya)
  //   BCA:     biru muda
  //   BRI:     biru tua
  { id: "mandiri", name: "Bank Mandiri", color: "#003D79", logo: mandiriLogo, cardLogo: mandiriLogoWhite, logoBgColor: "#141414" },
  { id: "bca", name: "BCA", color: "#0058A3", logo: bcaLogo, logoBgColor: "#4FA8E8" },
  { id: "bri", name: "BRI", color: "#00529C", logo: briLogo, logoBgColor: "#00437A" },
  { id: "bni", name: "BNI", color: "#F37021", logo: bniLogo, logoBgColor: "#F37021" },
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
