import React from "react";
import logoUrl from "../assets/images/user_logo_transparent.png";
import { useLanguage } from "../contexts/LanguageContext";
import { useThemeTokens } from "../hooks/useThemeTokens";

/**
 * Header khusus tampilan handphone. Berbeda dari header mobile versi lama
 * (yang sudah dihapus bersamaan drawer/hamburger saat navigasi mobile
 * dipindah ke `MobileBottomNav.tsx`), header ini murni untuk branding --
 * tidak ada lagi tombol buka-drawer karena navigasi kini ditangani navbar
 * bawah.
 *
 * `sticky top-0` dipasang di dalam elemen `<main>` yang scroll-nya
 * `overflow-y-auto` (lihat App.tsx), sehingga header ini akan terus
 * menempel di bagian atas viewport walau konten di bawahnya di-scroll --
 * bukan ikut ter-scroll keluar layar.
 *
 * Status bar-aware: karena header ini `sticky top-0` (menempel persis di
 * tepi atas viewport) dan app dijalankan sebagai PWA/wrapper native dengan
 * status bar transparan (lihat `apple-mobile-web-app-status-bar-style:
 * black-translucent` di index.html), tanpa padding tambahan logo+judul
 * akan langsung bertabrakan dengan jam/baterai/notch OS. `paddingTop`
 * memakai `env(safe-area-inset-top)` (butuh `viewport-fit=cover` di meta
 * viewport, sudah ditambahkan) ditambah jarak visual dasar yang sama
 * dengan `py-3` sebelumnya, supaya di browser biasa (safe-area = 0)
 * tampilannya identik dengan sebelum perubahan ini.
 */
export const MobileTopBar: React.FC = () => {
  const { tokens, cx } = useThemeTokens();
  const { t } = useLanguage();

  return (
    <header
      className={cx("md:hidden sticky top-0 z-40 flex items-center gap-2 px-4 pb-3 backdrop-blur-md relative", tokens.mobileTopBar.headerBg)}
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
    >
      <div className="shrink-0">
        <img src={logoUrl} alt="EWK Icon" className="w-8 h-8 object-contain" />
      </div>
      <h1 className="font-sans font-bold text-lg tracking-tight truncate">
        {t("app.title")}
      </h1>

      {/* Aksen gradient tipis pengganti border-b polos -- selaras dengan
          warna aksen FAB/tombol utama (indigo -> violet) supaya top bar
          punya "signature" brand yang konsisten dengan elemen lain,
          bukan sekadar garis abu-abu flat. */}
      <div
        className={cx("absolute bottom-0 left-0 right-0 h-px", tokens.mobileTopBar.accentGradientLine)}
        aria-hidden="true"
      />
    </header>
  );
};
