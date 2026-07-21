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
 * Tinggi ribbon: alih-alih angka height tetap (h-32/h-40) yang ternyata
 * MASIH lebih pendek dari hero Dashboard sungguhan, sekarang tinggi
 * ribbon ini disusun dari padding vertikal YANG SAMA PERSIS dengan
 * DashboardHeader.tsx (pt-5/pt-6 & pb-20/pb-24), ditambah satu spacer
 * kosong (`h-[102px]`) yang besarnya = tinggi gabungan baris chip cuaca
 * (~26px) + margin `mt-4` (16px) + judul sapaan `<h1>` 2 baris (~60px)
 * di hero Dashboard. Hasilnya total tinggi container ribbon di sini jadi
 * SAMA PERSIS dengan total tinggi hero Dashboard (202px mobile / 222px
 * sm+), walau di halaman lain tidak ada teks/chip sungguhan yang
 * dirender -- supaya rasio ribbon-terlihat-vs-tertutup-kartu (lihat
 * catatan overlap di atas) konsisten di semua halaman.
 *
 * Kalau padding/ukuran font di hero DashboardHeader.tsx berubah di masa
 * depan, angka spacer `h-[102px]` di bawah ini perlu disesuaikan juga
 * supaya kedua ribbon tetap match.
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
          "relative pt-5 sm:pt-6 pb-20 sm:pb-24",
          tokens.dashboardHeader.heroGradient
        )}
      >
        {/* Spacer setinggi chip cuaca + judul sapaan hero Dashboard --
            lihat catatan tinggi ribbon di atas. */}
        <div className="h-[102px]" />
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
