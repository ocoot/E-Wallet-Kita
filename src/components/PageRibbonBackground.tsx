import { useMemo } from "react";
import type React from "react";
import { useTheme } from "../contexts/ThemeContext";
import type { CSSProperties } from "react";

type RibbonTheme = "dark_obsidian" | "light_sakura";

/**
 * Ribbon gradient + lengkung (wave) dekoratif di belakang breadcrumb, untuk
 * SEMUA halaman TERMASUK Dashboard.
 *
 * REVISI (unifikasi Dashboard): sebelumnya Dashboard (lihat DashboardHeader.tsx)
 * punya implementasi gradient+wave TERPISAH & duplikat manual dari file ini
 * (2 sumber kebenaran untuk visual yang sama persis -- lihat riwayat komentar
 * `tokens.dashboardHeader.heroGradient`/`waveFill` di tokens.ts, sudah
 * dihapus). Sekarang Dashboard reuse langsung constants (`RIBBON_GRADIENT_CSS`,
 * `RIBBON_GRADIENT_CLASS`, `RIBBON_WAVE_PATH_D`) & komponen (`RibbonWaveEdge`)
 * yang diekspor dari file ini -- SATU sumber kebenaran, bukan lagi 2 file yang
 * harus disinkronkan manual tiap kali palet ribbon berubah.
 *
 * Dashboard TETAP tidak memakai hook `usePageRibbonBackground()` di bawah ini
 * apa adanya, karena model konten beda:
 *   - `usePageRibbonBackground()` : ribbon murni `background-image` (tanpa
 *     konten di dalamnya) yang ditempel App.tsx ke div pembungkus SEMUA
 *     halaman selain Dashboard, tinggi FIX (`heightPx`, default
 *     `RIBBON_HEIGHT`).
 *   - Dashboard : hero yang MEMBUNGKUS konten (avatar, sapaan, chip cuaca) di
 *     dalamnya, tinggi DINAMIS mengikuti padding+konten, dan wave-nya perlu
 *     disembunyikan khusus di desktop (`lg:hidden`, className Tailwind --
 *     tidak bisa dicapai lewat pendekatan `background-image` gabungan gradient
 *     + wave dalam 1 property seperti hook di bawah). Karena itu Dashboard
 *     pakai `RIBBON_GRADIENT_CLASS` (className, bukan style) untuk gradient +
 *     `<RibbonWaveEdge>` (elemen SVG DOM asli, bisa diberi className
 *     responsif) untuk wave -- built dari constants yang SAMA dengan hook ini.
 *
 * ARSITEKTUR (revisi KETIGA -- baca ini sebelum mengubah ukuran ribbon):
 * Dua percobaan sebelumnya me-render ribbon sebagai ELEMEN DOM (baik
 * `position:absolute` maupun alur-normal-dengan-margin-negatif). Keduanya
 * mengharuskan breadcrumb/Card "tahu" tentang ribbon (lewat z-index atau
 * margin overlap yang harus dihitung ulang tiap ribbon berubah ukuran) --
 * sumber constant bug (invisible ribbon, gap kebesaran, tumpang tindih).
 *
 * Sekarang ribbon BUKAN elemen DOM sama sekali -- murni `background-image`
 * (2 layer: svg lengkung + gradient warna) yang ditempel via hook ini ke
 * elemen yang SUDAH ADA dan SUDAH membungkus breadcrumb+konten (di
 * App.tsx). Konsekuensinya:
 *   - Breadcrumb & konten halaman TIDAK PERNAH perlu tahu ribbon itu ada.
 *     Tidak ada z-index, tidak ada margin overlap, tidak ada elemen extra
 *     yang bisa salah tumpuk -- background CSS secara definisi tidak
 *     pernah memengaruhi layout elemen lain.
 *   - Mengubah ukuran ribbon = ubah SATU angka (`RIBBON_HEIGHT` di bawah).
 *     Tidak ada file lain yang perlu disentuh sama sekali.
 *   - Di bawah ketinggian `RIBBON_HEIGHT`, tidak ada background-image yang
 *     menutupi lagi -- warna canvas biasa (`tokens.surface.canvas`, sudah
 *     terpasang di elemen yang sama) otomatis "muncul kembali" dengan
 *     sendirinya, tanpa perlu Card/apa pun menutupinya secara eksplisit.
 *
 * Batasan yang membuat implementasi ini SEDIKIT berbeda dari versi
 * elemen-DOM sebelumnya: warna svg lengkung tidak bisa lagi memakai
 * `fill="currentColor"` + CSS var (SVG yang dipakai lewat CSS
 * `background-image: url("data:image/svg+xml,...")` diperlakukan browser
 * sebagai resource terpisah, tidak mewarisi CSS var/`color` dari halaman).
 * Makanya warnanya di-hardcode di `WAVE_HEX` di bawah -- WAJIB disamakan
 * manual dengan `--color-slate-950` (dark) / `--color-slate-50` (light) di
 * index.css kalau suatu saat palet reskin berubah.
 */

export const RIBBON_HEIGHT = 220; // px -- default height untuk ribbon halaman non-Dashboard
const WAVE_HEIGHT = 44; // px -- tinggi area lengkung svg di tepi bawah ribbon

// Harus sinkron dengan index.css: --color-slate-950 (dark) / --color-slate-50 (light).
// Ini SENGAJA sama dengan warna `tokens.surface.canvas` per tema, supaya
// lengkung menyatu mulus ke canvas di baliknya. Dipakai KHUSUS oleh hook
// `usePageRibbonBackground` di bawah (pendekatan background-image data-URI,
// lihat batasan currentColor di komentar file). `RibbonWaveEdge` (elemen DOM
// asli, dipakai Dashboard) TIDAK butuh hex ini -- ia pakai `currentColor` +
// className Tailwind warna canvas biasa, jadi otomatis ikut CSS var halaman
// tanpa perlu hardcode/sinkron manual sama sekali.
export const RIBBON_WAVE_HEX: Record<RibbonTheme, string> = {
  dark_obsidian: "#0A1512",
  light_sakura: "#F5FAF8",
};

// Nilai CSS mentah (dipakai inline style oleh hook di bawah, untuk halaman
// non-Dashboard) & versi className Tailwind arbitrary-value (dipakai
// DashboardHeader.tsx) -- KEDUANYA HARUS merepresentasikan gradient yang
// SAMA PERSIS. Dua representasi ini tidak terhindarkan (satu butuh string
// CSS mentah untuk `style.backgroundImage`, satu butuh syntax className
// Tailwind), tapi sekarang cuma disimpan di SATU file ini -- bukan lagi
// tersebar di tokens.ts (dashboardHeader.heroGradient, sudah dihapus).
//
// FIX (mismatch status bar vs ribbon): `172deg` cuma miring ~8 derajat dari
// vertikal murni (sebelumnya `160deg`/~20 derajat -- masih terlalu miring,
// baris paling atas tetap sempat kelihatan blending sebelum keluar dari
// plateau di beberapa rasio lebar-layar/tinggi-status-bar). Karena kotak
// ribbon jauh lebih LEBAR (lebar layar) daripada TINGGI (RIBBON_HEIGHT),
// kemiringan sekecil apa pun tetap bikin baris paling atas (y=0, persis
// di bawah status bar) sedikit tidak seragam dari tepi kiri ke kanan --
// mengecilkan sudutnya mengecilkan juga selisih itu. `meta[name=
// "theme-color"]` (lihat STATUS_BAR_COLOR di ThemeContext.tsx) cuma bisa
// pasang SATU warna flat, jadi kelihatan tidak sinkron dengan gradient yang
// sudah bervariasi itu. Solusinya: stop kedua ditambahkan di posisi yang SAMA
// dengan stop pertama (hard color-stop / plateau 0%->26%, sebelumnya 15% --
// dinaikkan supaya ada margin aman lebih besar untuk status bar yang lebih
// tebal/notch) supaya strip teratas (area yang bersinggungan dengan status
// bar) tetap SOLID warna pertama di seluruh lebar layar, baru mulai
// blending diagonal setelah 26%.
// WAJIB: kalau angka `26%` di sini diubah, `STATUS_BAR_COLOR` di
// ThemeContext.tsx TETAP memakai warna stop pertama yang sama (tidak perlu
// ikut berubah -- cuma titik akhir plateau yang disesuaikan).
export const RIBBON_GRADIENT_CSS: Record<RibbonTheme, string> = {
  dark_obsidian: "linear-gradient(172deg, var(--color-indigo-500), var(--color-indigo-500) 26%, var(--color-emerald-500) 140%)",
  light_sakura: "linear-gradient(172deg, var(--color-rose-400), var(--color-rose-400) 26%, var(--color-rose-600) 140%)",
};

/** Versi className Tailwind dari `RIBBON_GRADIENT_CSS` di atas -- untuk konsumen yang butuh gradient sebagai class (mis. DashboardHeader.tsx), bukan inline style. */
export const RIBBON_GRADIENT_CLASS =
  "bg-[linear-gradient(172deg,var(--color-indigo-500),var(--color-indigo-500)_26%,var(--color-emerald-500)_140%)] light_sakura:bg-[linear-gradient(172deg,var(--color-rose-400),var(--color-rose-400)_26%,var(--color-rose-600)_140%)]";

// REVISI: endpoint kiri & kanan diubah dari y=28/y=20 menjadi y=0 supaya
// fill wave menyentuh SUDUT ATAS SVG di kedua tepi — menghilangkan artefak
// garis vertikal (batas lurus antara area fill dan area transparan) yang
// sebelumnya muncul di tepi kiri & kanan layar karena wave tidak mencapai
// puncak viewBox di sana (gradient masih terlihat di atas wave, dibatasi
// garis vertikal lurus oleh sisi fill). Bentuk lengkung di bagian tengah
// tidak berubah signifikan (control point sama, hanya anchor bergeser).
export const RIBBON_WAVE_PATH_D = "M0,0 C48,58 86,10 132,24 C178,38 216,58 264,0 L264,66 L0,66 Z";

/**
 * `heightPx`: opsional, default `RIBBON_HEIGHT` (220px) -- dipakai App.tsx
 * untuk semua halaman non-Dashboard. Diparameterisasi supaya hook ini generic
 * untuk pemanggil lain yang butuh ribbon background-image dengan tinggi
 * berbeda (Dashboard TIDAK memakai parameter ini -- lihat komentar file di
 * atas kenapa Dashboard pakai `RIBBON_GRADIENT_CLASS`+`RibbonWaveEdge`,
 * bukan hook ini).
 */
export function usePageRibbonBackground(heightPx: number = RIBBON_HEIGHT): { style: CSSProperties; className: string } {
  const { theme } = useTheme();

  const style = useMemo<CSSProperties>(() => {
    const waveHex = RIBBON_WAVE_HEX[theme];
    const waveSvgDataUri =
      `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 264 66" preserveAspectRatio="none">` +
        `<path d="${RIBBON_WAVE_PATH_D}" fill="${waveHex}"/></svg>`
      )}`;

    return {
      // Layer pertama (terdaftar duluan) tampil PALING ATAS -- svg lengkung
      // di atas, gradient di bawah, persis urutan visual yang diinginkan.
      backgroundImage: `url("${waveSvgDataUri}"), ${RIBBON_GRADIENT_CSS[theme]}`,
      backgroundRepeat: "no-repeat, no-repeat",
      // Lengkung diposisikan tepat di tepi bawah area gradient.
      backgroundPosition: `left ${heightPx - WAVE_HEIGHT}px, top`,
      backgroundSize: `100% ${WAVE_HEIGHT}px, 100% ${heightPx}px`,
    };
  }, [theme, heightPx]);

  return {
    style,
    // TIDAK perlu className bleed (-mx/-mt/px/pt) sama sekali di sini --
    // App.tsx menempelkan style ini ke div PEMBUNGKUS `<main>` yang TIDAK
    // punya `mx-auto`/`max-w-*` (beda dari revisi sebelumnya yang salah
    // taruh di div ber-`mx-auto`, menyebabkan margin negatif bertabrakan
    // dan bleed batal jalan). Karena CSS `background-image` secara default
    // (`background-origin: padding-box`) SUDAH otomatis dilukis di bawah
    // padding elemennya sendiri, background ini bleed ke tepi terluar
    // div pembungkus itu TANPA butuh margin negatif/positif apa pun.
    className: "",
  };
}

/**
 * Versi elemen DOM asli dari lengkung ribbon -- dipakai konsumen yang butuh
 * wave sebagai node SVG sungguhan (bukan layer background-image), supaya
 * bisa diberi className responsif Tailwind (mis. `lg:hidden`). Saat ini
 * satu-satunya konsumen adalah DashboardHeader.tsx (hero Dashboard, yang
 * wave-nya perlu hilang di breakpoint desktop -- lihat komentar file di
 * atas). Fill pakai `currentColor` + className warna canvas default (bisa
 * di-override lewat prop `className`), sehingga TIDAK perlu hex hardcode
 * seperti `RIBBON_WAVE_HEX` (beda dari batasan hook di atas, karena ini
 * elemen DOM biasa yang mewarisi CSS var halaman, bukan data-URI terpisah).
 */
export const RibbonWaveEdge: React.FC<{ className?: string }> = ({ className = "" }) => {
  return (
    <svg
      className={`text-slate-950 light_sakura:text-slate-50 ${className}`.trim()}
      viewBox="0 0 264 66"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={RIBBON_WAVE_PATH_D} fill="currentColor" />
    </svg>
  );
};
