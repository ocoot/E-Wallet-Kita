import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { useMainScrollRef, useHeaderPortalNode } from "../contexts/MainScrollContext";
import { useIsDesktopViewport } from "../hooks/useIsDesktopViewport";
import { audioFeedback } from "../lib/audio";
import { useLanguage } from "../contexts/LanguageContext";

/** Fallback (px) dipakai SEBELUM ResizeObserver sempat mengukur tinggi
 *  large title block yang sesungguhnya (mis. render pertama sebelum efek
 *  jalan) -- begitu terukur, nilai aktual (lihat `collapseDistanceRef`)
 *  dipakai, bukan angka ini. Sebelumnya ini angka mati yang dipakai sama
 *  rata di semua halaman padahal tinggi large title+subtitle beda-beda
 *  per halaman (subtitle 2 baris vs 1 baris, dst) -- efeknya transisi
 *  bisa "selesai" sebelum/sesudah large title beneran keluar viewport
 *  tergantung halaman. Sekarang diukur otomatis dari elemen aslinya. */
const COLLAPSE_DISTANCE_FALLBACK = 64;

/** Batas bawah jarak collapse (px) supaya progress tidak "meledak" ke 1
 *  hampir seketika kalau large title block terukur sangat pendek (mis.
 *  title tanpa subtitle sama sekali) -- collapse yang terlalu instan
 *  terasa seperti glitch, bukan transisi. */
const COLLAPSE_DISTANCE_MIN = 32;

/** Tinggi penuh (px) bar sticky begitu progress = 1. Dipakai untuk
 *  menginterpolasi `height` bar dari 0 -> nilai ini (BUKAN cuma opacity) --
 *  lihat komentar panjang soal kenapa di bagian bawah file ini. */
const BAR_HEIGHT_PX = 48;

interface CollapsingPageHeaderProps {
  /** Judul halaman. Dipakai UNTUK KEDUANYA: large title besar di badan
   *  halaman (progress=0) dan small title di navbar sticky (progress=1). */
  title: string;
  /** Subtitle opsional di bawah large title. Ikut fade keluar bareng large
   *  title (malah sedikit lebih cepat, lihat pengali di applyProgress) --
   *  TIDAK pernah muncul di navbar kecil (navbar cuma judul singkat). */
  subtitle?: string;
  /** Path tujuan tombol back. Kalau tidak diisi sama sekali (undefined),
   *  tombol back tidak dirender (dipakai utk halaman tab utama seperti
   *  Riwayat/Anggaran yang diakses lewat bottom-nav, bukan navigasi push
   *  bertingkat). Isi string kosong "" utk pakai `navigate(-1)` (kembali
   *  ke entry sebelumnya, sama seperti AdminBackBar); isi path spesifik
   *  utk tujuan tetap. */
  backTo?: string;
  /** Konten opsional yang nempel di kanan sticky bar (mirip tombol "Edit"
   *  di pojok kanan-atas ala iOS) -- dipakai utk aksi halaman (Export,
   *  Refresh, dst) yang perlu tetap kejangkau walau large title & tombol
   *  aksi aslinya di body sudah discroll keluar dari view. TIDAK
   *  dirender di large title area (body) -- itu tanggung jawab halaman
   *  masing-masing; slot ini KHUSUS versi ringkas di sticky bar.
   *  Sengaja dibatasi ke icon-button kecil (bukan tombol berlabel teks
   *  penuh) -- small title di tengah bar cuma dapat reserved pr-16 kalau
   *  actions diisi, kalau actions terlalu lebar judulnya bisa ketiban. */
  actions?: React.ReactNode;
  /** Konten halaman (cards, tabs, list, dst) dirender di bawah large
   *  title, mengikuti flow scroll normal `<main>`. */
  children?: React.ReactNode;
}

/**
 * v2 (Agu 2026) -- REDESIGN dari versi pilot sebelumnya (dulu cuma sticky
 * bar on/off berdasar threshold biner, large title-nya dirender terpisah
 * oleh tiap halaman di dalam card bersolid border). Sekarang komponen ini
 * MEMILIKI kedua title (large & small) sekaligus, dan transisinya
 * diinterpolasi TERUS-MENERUS mengikuti scrollTop -- bukan lagi on/off,
 * biar pola "Large Title Navigation Bar" ala iOS Settings/Mail beneran
 * kerasa halus (judul besar mengecil+fade+naik jadi small title di
 * navbar, bukan langsung muncul/hilang).
 *
 * Interpolasi ditulis LANGSUNG ke DOM lewat ref (bukan React state) di
 * dalam scroll handler yang di-throttle rAF -- scroll-linked animation
 * yang re-render tiap frame lewat setState akan berat & patah-patah,
 * sedangkan commit langsung ke `style` tidak lewat reconciliation React
 * sama sekali, jadi tetap 60fps walau dipasang di banyak halaman
 * sekaligus.
 *
 * Back button (kalau `backTo` diisi) SENGAJA selalu terlihat penuh dari
 * awal (tidak ikut fade) -- constant di kiri bar, cuma small title di
 * tengah bar yang fade-in seiring scroll. Large title (fade+scale+naik)
 * dirender terpisah di badan halaman, bukan di dalam bar portal ini --
 * jadi transisinya berupa CROSSFADE dua elemen berbeda posisi, bukan satu
 * elemen yang benar-benar berpindah tempat (lebih murah & lebih robust
 * lintas layout halaman yang beda-beda dibanding FLIP-style shared
 * element transition).
 *
 * MOBILE-ONLY: sama seperti versi sebelumnya, tidak dirender sama sekali
 * di breakpoint desktop (Sidebar persisten sudah jadi konteks navigasi).
 * Di desktop, large title dirender polos tanpa animasi/bar sticky sama
 * sekali (fallback statis).
 *
 * Portal ke `HeaderPortalProvider` node (anak langsung `<main>`, DI LUAR
 * `motion.div` transisi route) tetap dipertahankan -- lihat komentar
 * panjang soal bug containing-block transform di MainScrollContext.tsx,
 * masih berlaku identik di v2 ini.
 */
export const CollapsingPageHeader: React.FC<CollapsingPageHeaderProps> = ({
  title,
  subtitle,
  backTo,
  actions,
  children,
}) => {
  const navigate = useNavigate();
  const { tokens, cx } = useThemeTokens();
  const scrollRef = useMainScrollRef();
  const portalNode = useHeaderPortalNode();
  const isDesktop = useIsDesktopViewport();
  const { t } = useLanguage();

  const largeTitleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const titleBlockRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const smallTitleRef = useRef<HTMLHeadingElement>(null);
  const rafRef = useRef<number | null>(null);
  const willChangeIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Jarak collapse AKTUAL, diukur dari tinggi titleBlockRef via
  // ResizeObserver (lihat effect di bawah) -- dipakai instead of angka
  // fixed di applyProgress(). Disimpan di ref (bukan state) karena
  // dibaca di dalam rAF loop yang jalan di luar siklus render React;
  // menaruhnya di state akan memicu re-render tiap kali ukurannya
  // berubah, padahal cuma perlu dibaca, bukan menggambar ulang apa pun.
  const collapseDistanceRef = useRef<number>(COLLAPSE_DISTANCE_FALLBACK);

  useEffect(() => {
    // Tidak perlu pasang scroll listener di desktop -- lihat catatan
    // "MOBILE-ONLY" di komentar komponen. Guard di DALAM effect (bukan
    // skip pemanggilan hook) supaya urutan hooks tetap konsisten antar
    // render sesuai Rules of Hooks.
    if (isDesktop) return;

    const el = scrollRef?.current;
    if (!el) return;

    const applyProgress = () => {
      rafRef.current = null;
      const progress = Math.min(Math.max(el.scrollTop / collapseDistanceRef.current, 0), 1);

      if (largeTitleRef.current) {
        largeTitleRef.current.style.opacity = String(1 - progress);
        largeTitleRef.current.style.transform =
          `translateY(${-progress * 10}px) scale(${1 - progress * 0.22})`;
      }
      if (subtitleRef.current) {
        // Subtitle fade lebih cepat (dikali 1.6) supaya sudah hilang
        // duluan sebelum large title benar-benar keluar -- kalau samaan
        // kecepatan, subtitle yang font-nya lebih kecil jadi kelihatan
        // "nyangkut" paling akhir & terasa aneh dibanding judulnya sendiri.
        subtitleRef.current.style.opacity = String(Math.max(0, 1 - progress * 1.6));
      }
      if (smallTitleRef.current) {
        smallTitleRef.current.style.opacity = String(progress);
        smallTitleRef.current.style.transform = `translateY(${(1 - progress) * 6}px)`;
      }
      if (barRef.current) {
        // Background/border/blur bar ikut progress juga (bukan langsung
        // penuh) -- biar transisinya kelihatan seperti SATU bar yang
        // "mengembun" jadi solid, bukan bar yang tiba-tiba nongol.
        barRef.current.style.opacity = String(Math.min(progress * 1.4, 1));
        // PENTING: bar ini adalah flow child PALING ATAS di dalam <main>
        // (portal-nya dipasang SEBELUM ribbon/breadcrumb, lihat App.tsx) --
        // kalau cuma opacity yang dianimasikan, tinggi bar (padding+konten)
        // tetap "makan tempat" walau progress=0, jadi ada gap kosong di
        // atas ribbon SEBELUM sempat discroll sama sekali. Makanya height
        // juga diinterpolasi 0 -> BAR_HEIGHT_PX, bukan cuma opacity --
        // begitu progress balik ke 0 (scroll ke atas lagi), bar beneran
        // collapse ke 0px, bukan cuma transparan.
        barRef.current.style.height = `${progress * BAR_HEIGHT_PX}px`;
        // Border TIDAK ikut ke-clip oleh `overflow-hidden` milik elemen
        // ini sendiri (overflow-hidden cuma meng-clip KONTEN/child yang
        // meluber, bukan border box-nya sendiri) -- kalau border-bottom
        // dibiarkan permanen lewat class Tailwind statis, dia tetap
        // menambah 1px tinggi walau height & opacity sudah 0, keluar
        // sebagai garis 1px yang "nyangkut" persis di batas status
        // bar/ribbon. Makanya lebar border JUGA diinterpolasi manual di
        // sini (bukan lewat class border-b statis) -- 0 di progress=0.
        barRef.current.style.borderBottomWidth = progress > 0.02 ? "1px" : "0px";
      }
    };

    // Ukur tinggi title block (h1 + subtitle) yang SEBENARNYA dari DOM,
    // bukan angka mati -- subtitle 2 baris (mis. History) beda tinggi
    // dari subtitle 1 baris (mis. GoldSavings), jadi jarak collapse yang
    // pas juga beda per halaman. ResizeObserver dipakai (bukan cuma
    // getBoundingClientRect() sekali di mount) karena tinggi subtitle
    // bisa berubah SETELAH mount juga -- mis. subtitle yang isinya angka
    // dinamis (jumlah, tanggal) bikin subtitle wrap ke baris ke-2 hanya
    // setelah data async selesai di-fetch, bukan pas render pertama.
    // applyProgress() dipanggil ulang tiap kali ukuran berubah supaya
    // transisi yang sedang berjalan/sudah settle ikut ter-resync ke
    // jarak collapse yang baru, bukan nunggu scroll event berikutnya.
    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined" && titleBlockRef.current) {
      resizeObserver = new ResizeObserver((entries) => {
        const measured = entries[0]?.contentRect.height;
        if (measured) {
          collapseDistanceRef.current = Math.max(measured, COLLAPSE_DISTANCE_MIN);
          applyProgress();
        }
      });
      resizeObserver.observe(titleBlockRef.current);
    }

    const handleScroll = () => {
      // willChange cuma diaktifkan SELAMA scroll aktif, lalu di-clear balik
      // ke "auto" begitu scroll berhenti (idle 200ms) -- kalau dipasang
      // permanen lewat style statis, browser terus menahan compositing
      // layer terpisah untuk large title di SEMUA halaman yang pakai
      // komponen ini sekaligus (22 halaman), walau usernya lagi diam di
      // satu halaman. Lumayan buat memory/baterai di HP low-end.
      if (largeTitleRef.current) largeTitleRef.current.style.willChange = "transform, opacity";
      if (subtitleRef.current) subtitleRef.current.style.willChange = "opacity";

      if (willChangeIdleTimeoutRef.current != null) clearTimeout(willChangeIdleTimeoutRef.current);
      willChangeIdleTimeoutRef.current = setTimeout(() => {
        if (largeTitleRef.current) largeTitleRef.current.style.willChange = "auto";
        if (subtitleRef.current) subtitleRef.current.style.willChange = "auto";
      }, 200);

      if (rafRef.current == null) rafRef.current = requestAnimationFrame(applyProgress);
    };

    applyProgress(); // sinkron begitu mount, kalau halaman dibuka sudah dalam posisi scroll (mis. balik dari sub-halaman)
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScroll);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (willChangeIdleTimeoutRef.current != null) clearTimeout(willChangeIdleTimeoutRef.current);
      resizeObserver?.disconnect();
    };
  }, [scrollRef, isDesktop]);

  const handleBack = () => {
    audioFeedback.playClick();
    if (backTo) navigate(backTo);
    else navigate(-1);
  };

  const hasBack = backTo !== undefined;

  // Fallback desktop: large title polos tanpa animasi/bar sama sekali.
  if (isDesktop) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className={cx("font-sans font-extrabold text-2xl tracking-[-0.025em] leading-tight", tokens.text.primary)}>
            {title}
          </h1>
          {subtitle && (
            <p className={cx("text-sm mt-1", tokens.text.heroSubtitle)}>{subtitle}</p>
          )}
        </div>
        {children}
      </div>
    );
  }

  const bar = (
    <div
      ref={barRef}
      // height & opacity awal 0 lewat inline style (bukan class) supaya
      // tidak kedip "full height/opacity" sekejap sebelum effect di atas
      // sempat jalan pertama kali (mis. kalau render pertama browser
      // sempat paint sebelum JS commit style dari applyProgress()).
      style={{ opacity: 0, height: 0, borderBottomWidth: 0 }}
      className={cx(
        "sticky top-0 z-30 w-full overflow-hidden flex items-center px-4 sm:px-6 backdrop-blur-md",
        "bg-slate-900/85 light_sakura:bg-white/85",
        tokens.border.default
      )}
    >
      {hasBack && (
        <button
          type="button"
          onClick={handleBack}
          aria-label={t("common.back")}
          className="relative z-10 shrink-0 -ml-1.5 p-1.5 rounded-full cursor-pointer active:scale-[0.92] transition-transform"
        >
          <ChevronLeft size={18} className={tokens.text.secondary} />
        </button>
      )}
      {actions && (
        // Sama seperti back button, actions SENGAJA tidak ikut fade
        // progress -- begitu bar-nya sendiri kelihatan (progress > 0),
        // actions langsung full terlihat, bukan fade terpisah. ml-auto
        // dorong ke ujung kanan (back button di sebelah kiri cuma flow
        // item lain di flex ini, h2 title di tengah posisinya absolute
        // jadi tidak ikut mendorong).
        <div className="relative z-10 ml-auto shrink-0 flex items-center gap-1">
          {actions}
        </div>
      )}
      {/* Small title diposisikan absolute & inset-x-0 supaya benar-benar
          center terhadap lebar bar, bukan center terhadap sisa ruang
          setelah tombol back/actions. Padding kiri/kanan SEKARANG
          kondisional -- sebelumnya px-10 statis di kedua sisi walau
          halaman tanpa backTo (mis. History, Wallets) sama sekali tidak
          punya tombol back, jadi ada ruang kosong nggak perlu. pl-10
          cuma dipasang kalau hasBack; pr-16 cuma kalau ada actions (2
          icon-button ukuran biasa butuh lebih dari 40px). Kalau
          keduanya kosong, title dapat ruang penuh (pl-4 sm:pl-6/pr-4
          sm:pr-6 -- senada dengan padding tepi bar sendiri). */}
      <h2
        ref={smallTitleRef}
        style={{ opacity: 0 }}
        className={cx(
          "absolute inset-x-0 text-center font-sans font-semibold text-sm truncate pointer-events-none",
          hasBack ? "pl-10" : "pl-4 sm:pl-6",
          actions ? "pr-16" : "pr-4 sm:pr-6",
          tokens.text.heading
        )}
      >
        {title}
      </h2>
    </div>
  );

  return (
    <>
      {portalNode ? createPortal(bar, portalNode) : bar}
      <div className="space-y-6">
        <div ref={titleBlockRef}>
          <h1
            ref={largeTitleRef}
            style={{ transformOrigin: "left top" }}
            className={cx("font-sans font-extrabold text-2xl tracking-[-0.025em] leading-tight", tokens.text.primary)}
          >
            {title}
          </h1>
          {subtitle && (
            <p ref={subtitleRef} className={cx("text-sm mt-1", tokens.text.heroSubtitle)}>
              {subtitle}
            </p>
          )}
        </div>
        {children}
      </div>
    </>
  );
};
