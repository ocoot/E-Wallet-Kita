import React from "react";
import logoUrl from "../assets/images/user_logo_transparent.png";
import { useLanguage } from "../contexts/LanguageContext";

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
 */
export const MobileTopBar: React.FC = () => {
  const { t } = useLanguage();

  return (
    <header
      className="md:hidden sticky top-0 z-40 flex items-center gap-2 px-4 py-3 backdrop-blur-md relative
        bg-slate-950/90 text-white
        dark_obsidian:bg-slate-950/90
        light_sakura:bg-rose-500/90 light_sakura:text-white"
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
        className="absolute bottom-0 left-0 right-0 h-px
          bg-gradient-to-r from-transparent via-indigo-400/70 to-transparent
          light_sakura:via-rose-200"
        aria-hidden="true"
      />
    </header>
  );
};
