import { useMemo } from "react";
import { useTheme } from "../contexts/ThemeContext";
import type { CSSProperties } from "react";

/**
 * Ribbon gradient + lengkung (wave) dekoratif di belakang breadcrumb, untuk
 * SEMUA halaman kecuali Dashboard (yang punya hero sendiri, lihat
 * DashboardHeader.tsx).
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

const RIBBON_HEIGHT = 220; // px -- satu-satunya angka yang perlu diubah untuk resize ribbon
const WAVE_HEIGHT = 44; // px -- tinggi area lengkung svg di tepi bawah ribbon

// Harus sinkron dengan index.css: --color-slate-950 (dark) / --color-slate-50 (light).
// Ini SENGAJA sama dengan warna `tokens.surface.canvas` per tema, supaya
// lengkung menyatu mulus ke canvas di baliknya (persis niat `waveFill` versi lama).
const WAVE_HEX: Record<"dark_obsidian" | "light_sakura", string> = {
  dark_obsidian: "#0A1512",
  light_sakura: "#F5FAF8",
};

// Harus sinkron dengan tokens.dashboardHeader.heroGradient di tokens.ts.
// Boleh tetap pakai var(--color-...) di sini (beda dari WAVE_HEX) karena
// ini dipasang lewat inline style ke elemen HALAMAN BIASA (bukan data-URI
// svg terpisah), yang SEPENUHNYA mewarisi CSS custom property halaman.
const GRADIENT_CSS: Record<"dark_obsidian" | "light_sakura", string> = {
  dark_obsidian: "linear-gradient(160deg, var(--color-indigo-500), var(--color-emerald-500) 140%)",
  light_sakura: "linear-gradient(160deg, var(--color-rose-400), var(--color-rose-600) 140%)",
};

const WAVE_PATH_D = "M0,28 C48,58 86,10 132,24 C178,38 216,58 264,20 L264,66 L0,66 Z";

export function usePageRibbonBackground(): { style: CSSProperties; className: string } {
  const { theme } = useTheme();

  const style = useMemo<CSSProperties>(() => {
    const waveHex = WAVE_HEX[theme];
    const waveSvgDataUri =
      `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 264 66" preserveAspectRatio="none">` +
        `<path d="${WAVE_PATH_D}" fill="${waveHex}"/></svg>`
      )}`;

    return {
      // Layer pertama (terdaftar duluan) tampil PALING ATAS -- svg lengkung
      // di atas, gradient di bawah, persis urutan visual yang diinginkan.
      backgroundImage: `url("${waveSvgDataUri}"), ${GRADIENT_CSS[theme]}`,
      backgroundRepeat: "no-repeat, no-repeat",
      // Lengkung diposisikan tepat di tepi bawah area gradient.
      backgroundPosition: `left ${RIBBON_HEIGHT - WAVE_HEIGHT}px, top`,
      backgroundSize: `100% ${WAVE_HEIGHT}px, 100% ${RIBBON_HEIGHT}px`,
    };
  }, [theme]);

  return {
    style,
    // Full-bleed sampai tepi layar (melawan padding `<main>` di App.tsx),
    // dengan padding pengganti supaya breadcrumb/konten di dalamnya TETAP
    // di posisi visual yang sama seperti sebelumnya -- murni kosmetik
    // bleed, tidak menyentuh margin/z-index elemen anak sama sekali.
    className: "-mx-4 -mt-4 px-4 pt-4 sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6 lg:-mx-8 lg:-mt-8 lg:px-8 lg:pt-8",
  };
}
