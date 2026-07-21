import React from "react";
import { useThemeTokens } from "../hooks/useThemeTokens";

/**
 * Ribbon gradient + lengkung (wave) dekoratif -- versi "background-only"
 * dari hero di DashboardHeader.tsx, dipakai di SEMUA halaman lain (Wallet,
 * Budget, Riwayat, Tabungan, Cicilan, Tabungan Emas, Akun/Settings).
 *
 * BEDA dengan DashboardHeader.tsx: tidak ada judul/sapaan/chip cuaca/avatar
 * di sini -- MURNI cuma warna gradient + lengkung sebagai aksen latar
 * belakang di belakang kartu teratas tiap halaman.
 *
 * Cara pakai: taruh PERSIS SEBELUM kartu teratas halaman, lalu bungkus
 * ribbon+kartu itu dalam satu wrapper `relative` bersama supaya margin
 * negatif kartu tidak "diambil alih" oleh utility `space-y-*` milik
 * container terluar. Kartu tersebut diberi `relative z-10 -mt-6 sm:-mt-8`
 * supaya ia tampak "duduk" di atas ribbon.
 *
 * Full-bleed (-mx/-mt) melawan padding `<main>` di App.tsx
 * (`p-4 sm:p-6 lg:p-8`), sama seperti DashboardHeader, supaya menyentuh
 * tepi layar alih-alih berhenti di dalam padding halaman.
 *
 * PENTING: supaya ribbon ini benar-benar menyentuh tepi ATAS layar (persis
 * seperti hero Dashboard, tidak "terpotong"/didorong turun oleh
 * <Breadcrumbs />), <Breadcrumbs /> di App.tsx sengaja dirender sebagai
 * overlay `absolute` (bukan elemen block biasa yang makan tinggi baris) di
 * atas ribbon ini -- lihat App.tsx. Jangan kembalikan <Breadcrumbs />
 * menjadi elemen block statis sebelum ribbon, karena itu akan membuat
 * margin negatif `-mt-*` di atas cuma membatalkan padding `<main>`, bukan
 * tinggi breadcrumb, sehingga ribbon kembali terlihat mulai di bawah
 * breadcrumb alih-alih dari tepi layar.
 *
 * Tinggi ribbon (revisi -- lihat catatan di bawah): SEBELUMNYA komponen ini
 * meniru tinggi hero Dashboard PERSIS (pakai spacer kosong h-[102px] yang
 * besarnya = tinggi baris chip cuaca + judul sapaan di Dashboard). Ternyata
 * itu menyisakan area kosong yang sangat besar (~140-160px, terlihat jelas
 * di semua halaman non-Dashboard) karena halaman-halaman itu memang tidak
 * punya judul/chip sungguhan untuk mengisi ruang tsb -- spacer itu SEKARANG
 * DIHAPUS, dan padding bawah (`pb-*`) dikecilkan supaya ribbon jadi aksen
 * tipis di belakang breadcrumb, bukan blok kosong setinggi hero Dashboard.
 * Nilai `-mt-6 sm:-mt-8` pada kartu di tiap halaman (lihat pemakaian di
 * Wallets.tsx dkk) ikut dikecilkan senada dengan perubahan ini -- kalau
 * ribbon ini diperbesar lagi di masa depan, sesuaikan juga overlap kartu di
 * SEMUA halaman yang memakainya (cari `PageRibbonBackground` di src/views).
 */
export const PageRibbonBackground: React.FC = () => {
  const { tokens, cx } = useThemeTokens();

  return (
    <div
      aria-hidden="true"
      className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mt-8"
    >
      <div
        className={cx(
          "relative pt-5 sm:pt-6 pb-9 sm:pb-11",
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
    </div>
  );
};
