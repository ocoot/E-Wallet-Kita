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
 * ini SEKARANG betul-betul `position: absolute`, alih-alih elemen block
 * biasa yang ikut makan tinggi document flow seperti sebelumnya.
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
 * JEBAKAN KEDUA (sempat dicoba, JANGAN diulangi): mengganti stacking ribbon
 * jadi `-z-10` (negative z-index) supaya "pasti di belakang". Ini balik
 * membuat ribbon SAMA SEKALI TIDAK TERLIHAT, karena wrapper `relative`
 * milik tiap halaman TIDAK membentuk stacking context baru (cuma
 * `position: relative` tanpa z-index sendiri) -- akibatnya ribbon dengan
 * z-index negatif "kabur" ke stacking context milik nenek moyang yang
 * lebih tinggi (mis. `motion.div` transisi halaman di App.tsx yang punya
 * transform/opacity), lalu tergambar DI BELAKANG background solid milik
 * elemen lain di level itu -- bukan cuma di belakang kartu di halaman yang
 * sama. Solusinya: pakai `z-0` (bukan negatif) di sini, dan pastikan kartu
 * di tiap halaman punya `relative z-10` supaya urutan tumpuknya eksplisit
 * DI DALAM stacking context yang sama, tanpa lompat ke context lain.
 *
 * Sekarang ribbon murni dekoratif: `absolute z-0 top-0` di dalam wrapper
 * `relative` milik tiap halaman (`<div className="relative"><PageRibbonBackground />
 * <Card .../></div>`), TIDAK memengaruhi tinggi/posisi elemen apa pun di
 * atas maupun di bawahnya. Konten (Card/menu dsb.) sekarang cukup diberi
 * margin-top POSITIF (`mt-12 sm:mt-14`, lihat pemakaian di Wallets.tsx
 * dkk) supaya sebagian ribbon "mengintip" di belakangnya -- bukan lagi
 * margin negatif yang menariknya naik menembus tinggi ribbon.
 *
 * PENTING soal besaran overlap (REVISI -- fix "ribbon terpotong" jadi
 * garis/segitiga tipis di pojok kiri-atas, lihat laporan bug dengan
 * screenshot Dashboard vs halaman Dompet): lengkung svg (wave) SELALU
 * menempel di `bottom-0` ribbon dan tingginya PERSIS sama dengan `pb`
 * (h-9=pb-9, h-11=pb-11) -- jadi seluruh jatah `pb` itu "milik" wave,
 * dan zona warna SOLID polos (tanpa lekukan svg) cuma setinggi `pt`
 * saja, dihitung dari atas.
 *
 * Kartu halaman (`mt-12 sm:mt-14`, lihat pemakaian di Wallets.tsx dkk)
 * duduk pada jarak 48px/56px dari atas. Versi LAMA cuma punya
 * `pt-5 sm:pt-6` (20px/24px) sebagai zona solid -- jauh lebih kecil
 * dari overlap kartu (48/56px), jadi kartu itu memotong TEPAT DI
 * TENGAH lekukan svg wave alih-alih menutupinya secara utuh --
 * hasilnya cuma secuil segitiga/garis tipis lekukan yang nongol di
 * pojok kiri-atas kartu, BUKAN pita warna solid yang jelas seperti di
 * Dashboard.
 *
 * Fix-nya: `pt-16 sm:pt-20` (64px/80px) -- sengaja dibuat LEBIH BESAR
 * dari overlap kartu (48/56px) -- supaya seluruh zona yang tampil di
 * atas kartu adalah warna gradient SOLID (bukan potongan wave), dengan
 * sisa ~16-24px yang jelas terlihat sebagai pita warna bersih, mirip
 * proporsi hero Dashboard. `pb-9 sm:pb-11` (utuh selebar wave) TIDAK
 * diubah -- lekukan svg-nya tetap width penuh & tinggi sama, cuma
 * sekarang seluruhnya bersembunyi rapi di belakang kartu (tidak lagi
 * terpotong di tengah kurva).
 *
 * Full-bleed horizontal (-left/-right) melawan padding `<main>` di
 * App.tsx (`p-4 sm:p-6 lg:p-8`), sama seperti sebelumnya, supaya
 * menyentuh tepi layar alih-alih berhenti di dalam padding halaman --
 * ini TIDAK diubah oleh fix di atas, cuma `pt` vertikalnya saja yang
 * disesuaikan.
 */
export const PageRibbonBackground: React.FC = () => {
  const { tokens, cx } = useThemeTokens();

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-0 top-0 -left-4 -right-4 sm:-left-6 sm:-right-6 lg:-left-8 lg:-right-8 overflow-hidden"
    >
      <div
        className={cx(
          "relative pt-16 sm:pt-20 pb-9 sm:pb-11",
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
