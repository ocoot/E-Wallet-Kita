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
 * REVISI (fix ribbon-tidak-terlihat / breadcrumb-tumpang-tindih): komponen
 * ini SEKARANG betul-betul `position: absolute` + `-z-10`, alih-alih elemen
 * block biasa yang ikut makan tinggi document flow seperti sebelumnya.
 * Dulu ribbon ini dirender sebagai elemen normal (pakai margin negatif
 * `-mx/-mt` untuk full-bleed), lalu kartu di bawahnya "ditarik naik" pakai
 * margin negatif (`-mt-6 sm:-mt-8` dkk) supaya terlihat duduk di atas
 * ribbon -- pola ini bermasalah karena (1) kartu itu diberi `relative z-10`
 * sehingga context stacking-nya SELALU digambar di atas ribbon yang tidak
 * dipositioning, walau secara tinggi mestinya cuma menutupi sebagian; dan
 * (2) <Breadcrumbs /> sempat dirender `absolute` bertumpuk PERSIS di ruang
 * yang sama dengan ribbon supaya "tidak makan tinggi", yang malah membuat
 * pill breadcrumb menutupi/bertabrakan dengan judul kartu di bawahnya
 * karena keduanya sama-sama mengklaim ruang vertikal yang sama tanpa
 * masing-masing tahu tinggi elemen lain.
 *
 * Sekarang ribbon murni dekoratif: `absolute -z-10 top-0` di dalam wrapper
 * `relative` milik tiap halaman (`<div className="relative"><PageRibbonBackground />
 * <Card .../></div>`), TIDAK memengaruhi tinggi/posisi elemen apa pun di
 * atas maupun di bawahnya. Konten (Card/menu dsb.) sekarang cukup diberi
 * margin-top POSITIF kecil (mis. `mt-8 sm:mt-9`, lihat pemakaian di
 * Wallets.tsx dkk) supaya sebagian ribbon "mengintip" di belakangnya --
 * bukan lagi margin negatif yang menariknya naik menembus tinggi ribbon.
 * <Breadcrumbs /> di App.tsx juga sudah dikembalikan jadi elemen block
 * biasa (bukan overlay `absolute`) karena tidak perlu lagi berbagi ruang
 * dengan ribbon ini.
 *
 * Full-bleed horizontal (-left/-right) melawan padding `<main>` di
 * App.tsx (`p-4 sm:p-6 lg:p-8`), sama seperti sebelumnya, supaya
 * menyentuh tepi layar alih-alih berhenti di dalam padding halaman.
 * Tinggi ribbon (pt-5/pb-9 dkk) TIDAK diubah dari versi sebelumnya --
 * proporsi gradient+lengkungnya sudah meniru gaya hero Dashboard, cuma
 * sekarang benar-benar tampil (tidak lagi ketutup/ke-z-index-kan oleh
 * kartu) karena posisinya lepas dari document flow.
 */
export const PageRibbonBackground: React.FC = () => {
  const { tokens, cx } = useThemeTokens();

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -z-10 top-0 -left-4 -right-4 sm:-left-6 sm:-right-6 lg:-left-8 lg:-right-8 overflow-hidden"
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
