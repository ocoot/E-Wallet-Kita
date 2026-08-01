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
 * v3 (Agu 2026) -- toolbar (back button + `actions`) sekarang PUNYA DUA
 * MODE tergantung apakah halaman punya elemen interaktif di toolbar:
 *   - hasToolbarContent=true (ada backTo dan/atau actions): container bar
 *     FIXED height sejak mount, reachable dari detik pertama tanpa perlu
 *     discroll. Cuma background (blur/warna/border) yang di-interpolasi
 *     terpisah ikut scroll (layer barBgRef). Ini FIX buat masalah dobel:
 *     sebelumnya `actions` ikut fade bareng seluruh bar (yang baru
 *     materialize ~60-80px setelah scroll), padahal tombol/card versi
 *     ASLI-nya di body (di bawah large title) baru keluar viewport JAUH
 *     lebih dalam dari itu -- jadi ada rentang scroll di mana KEDUANYA
 *     kelihatan bareng (dobel tombol Add/Refresh di layar yang sama).
 *     Solusinya: begitu actions dipakai, tombol ASLI di body halaman
 *     HARUS dihapus/dikondisikan -- actions di toolbar jadi SATU-SATUNYA
 *     sumber buat aksi itu, bukan duplikat.
 *   - hasToolbarContent=false (halaman polos, mis. History/Wallets tanpa
 *     backTo/actions): tetap mode lama "materialize on scroll" (height 0
 *     -> BAR_HEIGHT_PX ikut progress) -- tidak ada elemen interaktif yang
 *     perlu dijaga reachable, jadi bar yang baru nongol pas discroll
 *     masih pas & tidak menyisakan strip kosong permanen di atas ribbon.
 *
 * MOBILE-ONLY: sama seperti versi sebelumnya, tidak dirender sama sekali
 * di breakpoint desktop (Sidebar persisten sudah jadi konteks navigasi).
 * Di desktop, large title dirender polos tanpa animasi/bar sticky sama
 * sekali (fallback statis) -- perubahan v3 di atas TIDAK berlaku di
 * desktop karena cabang `if (isDesktop)` return lebih dulu, sebelum
 * `bar`/hasToolbarContent sempat dihitung/dirender sama sekali.
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
  // Cuma dipakai/di-mount kalau hasToolbarContent -- lihat komentar di
  // applyProgress() soal kenapa background bar dipisah dari container-nya.
  const barBgRef = useRef<HTMLDivElement>(null);
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
      if (barBgRef.current) {
        // MODE "toolbar selalu tampil" (halaman punya back button atau
        // actions) -- container bar (barRef) SENGAJA tidak disentuh sama
        // sekali di sini, tingginya fixed BAR_HEIGHT_PX dari awal lewat
        // style statis di JSX (lihat di bawah), supaya back button &
        // actions langsung reachable dari detik pertama halaman dibuka --
        // TIDAK perlu discroll dulu. Cuma layer BACKGROUND (blur+warna+
        // border) di sini yang di-interpolasi ikut progress, biar tetap
        // ada efek "mengembun jadi solid" pas discroll -- persis kayak
        // sebelumnya, cuma sekarang yang fade itu background-nya doang,
        // bukan seluruh toolbar (termasuk tombol-tombolnya).
        barBgRef.current.style.opacity = String(Math.min(progress * 1.4, 1));
        barBgRef.current.style.borderBottomWidth = progress > 0.02 ? "1px" : "0px";
      } else if (barRef.current) {
        // MODE lama "materialize on scroll" -- HANYA dipakai halaman yang
        // sama sekali tidak punya back button maupun actions (murni
        // small title kosmetik, tidak ada elemen interaktif yang perlu
        // dijaga reachable) -- lihat komentar panjang di bawah kenapa
        // height juga diinterpolasi (bukan cuma opacity).
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
  // Halaman yang punya elemen INTERAKTIF di toolbar (back button dan/atau
  // actions) dapat mode "toolbar selalu tampil" -- reachable dari detik
  // pertama, tidak perlu discroll dulu (lihat cabang `bar` di bawah).
  // Halaman polos (cuma small title kosmetik, tanpa back/actions) tetap
  // pakai mode lama "materialize on scroll" -- tidak ada yang perlu
  // dijaga reachable-nya, jadi bar yang nongol on-scroll masih pas.
  const hasToolbarContent = hasBack || !!actions;

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

  const bar = hasToolbarContent ? (
    // MODE "toolbar selalu tampil" -- dipakai kalau halaman punya back
    // button dan/atau actions. Container-nya (barRef) SENGAJA fixed
    // height sejak mount (BUKAN diinterpolasi 0 -> BAR_HEIGHT_PX kayak
    // mode lama) -- supaya back button & actions langsung reachable dari
    // detik pertama halaman dibuka, tidak perlu discroll dulu. Sebagai
    // gantinya, background (blur+warna+border) dipisah ke layer sendiri
    // (barBgRef, absolute inset-0 di belakang tombol2) yang TETAP
    // di-interpolasi ikut scroll progress -- efek "mengembun jadi solid"
    // pas discroll masih kerasa, cuma sekarang backgroundnya doang yang
    // fade, bukan seluruh toolbar termasuk tombol2 di dalamnya.
    <div
      ref={barRef}
      style={{ height: BAR_HEIGHT_PX }}
      className="sticky top-0 z-30 w-full flex items-center px-4 sm:px-6"
    >
      <div
        ref={barBgRef}
        style={{ opacity: 0, borderBottomWidth: 0 }}
        className={cx(
          "absolute inset-0 backdrop-blur-md",
          "bg-slate-900/85 light_sakura:bg-white/85",
          tokens.border.default
        )}
      />
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
        // Sama seperti back button, actions SELALU full terlihat sejak
        // mount (bukan fade terpisah) -- ml-auto dorong ke ujung kanan
        // (back button di kiri cuma flow item lain di flex ini, h2 title
        // di tengah posisinya absolute jadi tidak ikut mendorong).
        <div className="relative z-10 ml-auto shrink-0 flex items-center gap-1">
          {actions}
        </div>
      )}
      {/* Small title TETAP crossfade ikut scroll progress seperti biasa
          (ini bagian "Large Title Navigation" yang tidak berubah) --
          cuma back button/actions/background di sekitarnya yang sekarang
          beda perilaku. Padding kondisional: pl-10 cuma kalau hasBack;
          pr-16 cuma kalau ada actions (2 icon-button ukuran biasa butuh
          lebih dari 40px) supaya title yang truncate tidak ketiban. */}
      <h2
        ref={smallTitleRef}
        style={{ opacity: 0 }}
        className={cx(
          "absolute z-10 inset-x-0 text-center font-sans font-semibold text-sm truncate pointer-events-none",
          hasBack ? "pl-10" : "pl-4 sm:pl-6",
          actions ? "pr-16" : "pr-4 sm:pr-6",
          tokens.text.heading
        )}
      >
        {title}
      </h2>
    </div>
  ) : (
    // MODE lama "materialize on scroll" -- halaman tanpa back button
    // maupun actions (mis. History, Wallets tanpa keduanya). Tidak ada
    // elemen interaktif yang perlu dijaga reachable, jadi bar yang
    // benar2 nongol cuma pas discroll (height+opacity+border sama2
    // diinterpolasi dari 0) masih pas -- lihat komentar panjang di
    // applyProgress() soal kenapa height juga diinterpolasi, bukan cuma
    // opacity.
    <div
      ref={barRef}
      style={{ opacity: 0, height: 0, borderBottomWidth: 0 }}
      className={cx(
        "sticky top-0 z-30 w-full overflow-hidden flex items-center px-4 sm:px-6 backdrop-blur-md",
        "bg-slate-900/85 light_sakura:bg-white/85",
        tokens.border.default
      )}
    >
      <h2
        ref={smallTitleRef}
        style={{ opacity: 0 }}
        className={cx(
          "absolute inset-x-0 pl-4 sm:pl-6 pr-4 sm:pr-6 text-center font-sans font-semibold text-sm truncate pointer-events-none",
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
