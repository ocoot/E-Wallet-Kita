import React from "react";
import { useThemeTokens } from "../hooks/useThemeTokens";

/**
 * Ribbon gradient + lengkung (wave) dekoratif -- versi "background-only"
 * dari hero di DashboardHeader.tsx, dipakai di SEMUA halaman lain (Wallet,
 * Budget, Riwayat, Tabungan, Cicilan, Tabungan Emas, Akun/Settings, Admin).
 *
 * ARSITEKTUR (revisi -- baca ini sebelum mengubah ukuran ribbon):
 * Versi sebelumnya menyatukan ribbon dengan posisi kartu lewat trik
 * "margin negatif" (ribbon di-render dalam alur normal lalu kartu ditarik
 * naik ke atasnya pakai `-mt-*`). Itu membuat tinggi ribbon & posisi kartu
 * SALING BERGANTUNG secara implisit -- setiap ribbon diubah ukurannya,
 * overlap kartu harus ikut dihitung ulang secara manual, dan gampang
 * salah (kartu jadi tumpang tindih dengan breadcrumb, seperti yang pernah
 * terjadi). Sekarang ribbon ini murni LATAR BELAKANG:
 *
 *   - `position: absolute`, `-z-10`, `aria-hidden` -- keluar dari document
 *     flow sepenuhnya. Merender/mengubah ukuran komponen ini TIDAK PERNAH
 *     mendorong atau menggeser elemen lain -- persis seperti background
 *     biasa.
 *   - Tinggi ribbon FIXED (`h-[202px] sm:h-[222px]`) -- sama persis
 *     dengan tinggi hero asli di Dashboard, TIDAK dikecilkan lagi.
 *   - Supaya kartu/konten di bawah breadcrumb tidak tumpang tindih dengan
 *     ribbon maupun breadcrumb, elemen pembungkus konten (Card, dst) di
 *     tiap halaman pemanggil diberi `mt-[186px] sm:mt-[198px]` (POSITIF,
 *     bukan negatif) -- angka ini = tinggi ribbon di atas DIKURANGI
 *     padding atas `<main>` (`p-4`=16px / `p-6`=24px, lihat App.tsx),
 *     karena ribbon bergeser naik `-top-4/-top-6/-top-8` untuk menembus
 *     padding tsb dan menyentuh tepi layar (lihat di bawah).
 *
 * KALAU ANDA MENGUBAH TINGGI RIBBON DI BAWAH INI (`h-[202px] sm:h-[222px]`),
 * WAJIB update juga `mt-[186px] sm:mt-[198px]` di SEMUA halaman pemanggil
 * (cari `PageRibbonBackground` di src/views) dengan rumus yang sama:
 * mt_baru = tinggi_ribbon_baru - padding_atas_main_pada_breakpoint_itu.
 *
 * Cara pakai di halaman: taruh `<PageRibbonBackground />` sebagai anak
 * pertama dari satu wrapper `relative` (supaya posisi absolute-nya
 * terikat ke wrapper itu, bukan ke ancestor lain yang tidak terduga),
 * lalu beri elemen konten setelahnya class `mt-[186px] sm:mt-[198px]`
 * (TANPA perlu `relative`/`z-10` lagi -- ribbon sudah `-z-10` dan tidak
 * pernah tumpang tindih dengan konten karena margin di atas):
 *
 *   <div className="relative">
 *     <PageRibbonBackground />
 *     <Card className="mt-[186px] sm:mt-[198px] ...">...</Card>
 *   </div>
 *
 * Full-bleed horizontal (-inset-x-4/6/8) + `-top-4/-6/-8` melawan padding
 * `<main>` di App.tsx (`p-4 sm:p-6 lg:p-8`), sama seperti DashboardHeader,
 * supaya ribbon menyentuh tepi layar alih-alih berhenti di dalam padding
 * halaman.
 *
 * PENTING: <Breadcrumbs /> di App.tsx dirender sebagai overlay `absolute`
 * (bukan elemen block biasa) supaya tidak mendorong ribbon/konten turun --
 * lihat App.tsx. Ribbon setinggi 202/222px ini jauh lebih tinggi dari pill
 * breadcrumb (~40-48px), jadi breadcrumb selalu berada di dalam area
 * ribbon, bukan di luarnya.
 */
export const PageRibbonBackground: React.FC = () => {
  const { tokens, cx } = useThemeTokens();

  return (
    <div
      aria-hidden="true"
      className={cx(
        "absolute -inset-x-4 -top-4 sm:-inset-x-6 sm:-top-6 lg:-inset-x-8 lg:-top-8",
        "h-[202px] sm:h-[222px] -z-10 overflow-hidden pointer-events-none",
        tokens.dashboardHeader.heroGradient
      )}
    >
      <svg
        className={cx("absolute bottom-0 left-0 w-full h-9 sm:h-11 block", tokens.dashboardHeader.waveFill)}
        viewBox="0 0 264 66"
        preserveAspectRatio="none"
      >
        <path
          d="M0,28 C48,58 86,10 132,24 C178,38 216,58 264,20 L264,66 L0,66 Z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
};
