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
 * Kata Sandi & Keamanan, Notifikasi, dst).
 * Sekarang terintegrasi dengan CollapsingPageHeader -- memiliki animasi
 * Large Title collapse ke compact sticky top bar saat discroll.
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
      className="max-w-4xl mx-auto space-y-5 pb-24 lg:hidden"
    >
      <CollapsingPageHeader
        title={title}
        subtitle={description}
        backTo="/settings"
      >
        {children}
      </CollapsingPageHeader>
    </motion.div>
  );
};
