import React from "react";
import { useThemeTokens } from "../hooks/useThemeTokens";

/**
 * Ribbon gradient + lengkung (wave) dekoratif -- versi "background-only"
 * dari hero di DashboardHeader.tsx, dipakai di SEMUA halaman lain (Wallet,
 * Budget, Riwayat, Tabungan, Cicilan, Tabungan Emas, Akun/Settings).
 *
 * BEDA dengan DashboardHeader.tsx: tidak ada judul/sapaan/chip cuaca/avatar
 * di sini -- MURNI cuma warna gradient + lengkung sebagai aksen latar
 * belakang di belakang kartu teratas tiap halaman (sesuai instruksi:
 * "cukup style dan warna ribbonnya saja dipakai sebagai aksen" /
 * "perlakukan itu seperti sebuah background").
 *
 * Cara pakai: taruh PERSIS SEBELUM kartu teratas halaman, lalu bungkus
 * ribbon+kartu itu dalam satu wrapper `relative` bersama supaya margin
 * negatif kartu tidak "diambil alih" oleh utility `space-y-*` milik
 * container terluar. Kartu tersebut diberi `relative z-10 -mt-14 sm:-mt-16`
 * supaya ia tampak "duduk" di atas ribbon -- pola overlap yang sama persis
 * dengan Kartu Pos Dompet "Saldo Anda" di Dashboard.
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
 * Tinggi ribbon (h-32 sm:h-40) sengaja dibuat sedikit lebih panjang dari
 * versi sebelumnya (h-28 sm:h-32) supaya proporsinya lebih dekat dengan
 * hero Dashboard yang lebih tinggi, dan supaya chip breadcrumb overlay di
 * atas tetap punya cukup ruang napas sebelum lengkung wave di bagian bawah.
 */
export const PageRibbonBackground: React.FC = () => {
  const { tokens, cx } = useThemeTokens();

  return (
    <div
      aria-hidden="true"
      className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mt-8"
    >
      <div className={cx("relative h-32 sm:h-40", tokens.dashboardHeader.heroGradient)}>
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
