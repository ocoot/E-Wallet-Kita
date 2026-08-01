import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { useIsDesktopViewport } from "../../hooks/useIsDesktopViewport";
import { CollapsingPageHeader } from "../CollapsingPageHeader";

interface MobileSettingsDetailPageProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

/**
 * Shell halaman detail untuk tiap menu di Profile/Akun (mis. Kelola Profil,
 * Kata Sandi & Keamanan, Notifikasi, dst). Setiap menu di daftar
 * `/settings` (mobile) membuka route barunya sendiri yang dibungkus shell
 * ini -- header dengan tombol kembali + judul, konsisten di semua halaman.
 *
 * Ini murni redesign MOBILE/TABLET (< lg, 1024px): di breakpoint desktop,
 * layar grid lama `/settings` sudah menampilkan semua kontrol sekaligus,
 * jadi kalau shell ini somehow diakses dari layar desktop (mis. buka link
 * langsung), kita arahkan balik ke `/settings` alih-alih menampilkan
 * halaman detail yang tidak didesain untuk layar lebar.
 *
 * REDESIGN (Agu 2026): header card statis (title+back dalam satu box
 * solid) diganti `CollapsingPageHeader` v2 -- title sekarang jadi large
 * title ala iOS yang mengecil+fade+"pindah" jadi small title di navbar
 * sticky begitu discroll, `backTo="/settings"` tetap konstan di kiri
 * navbar sejak awal. Karena shell ini dipakai SEMUA 11 halaman detail
 * settings (Profil, Keamanan, Notifikasi, Bahasa, Tema, PWA, Telegram,
 * Privasi, App Lock, Suara & Haptik, Syarat, Kebijakan Privasi), satu
 * perubahan di sini otomatis konsisten di semuanya -- tidak perlu sentuh
 * 11 file itu satu-satu.
 */
export const MobileSettingsDetailPage: React.FC<MobileSettingsDetailPageProps> = ({
  title,
  description,
  children,
}) => {
  const navigate = useNavigate();
  const isDesktop = useIsDesktopViewport();

  useEffect(() => {
    if (isDesktop) {
      navigate("/settings", { replace: true });
    }
  }, [isDesktop, navigate]);

  if (isDesktop) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.18 }}
      className="max-w-4xl mx-auto pb-24 lg:hidden"
    >
      <CollapsingPageHeader title={title} subtitle={description} backTo="/settings">
        {children}
      </CollapsingPageHeader>
    </motion.div>
  );
};
