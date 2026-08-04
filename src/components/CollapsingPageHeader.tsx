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
 * v4 (Agu 2026) -- KOREKSI atas v3: mode hasToolbarContent=true di v3 pakai
 * `position: sticky` (reserved-flow), yang di percobaan pertama dikasih
 * background canvas permanen supaya nggak transparan -- ternyata TETAP
 * kelihatan sebagai strip kosong terpisah antara status bar & ribbon
 * (dilaporkan lewat screenshot), independen dari warnanya. Akar masalahnya
 * `sticky` itu sendiri: container-nya menempati ruang SENDIRI di flow
 * SEBELUM ribbon sempat mulai. Fix: `position: fixed` (bukan sticky) --
 * dikeluarkan total dari flow, ribbon mulai persis di posisi yang sama
 * seperti sebelum fitur ini ada, back button/actions jadi OVERLAY/
 * mengambang di ATAS ribbon (bukan strip terpisah sebelum ribbon).
 * Konsekuensi: background balik transparan by default (kalau solid
 * permanen, nutupin ribbon di baliknya).
 *
 * v5 (Agu 2026) -- v4 sempat menambah backdrop bulat (`bg-black/15
 * backdrop-blur-sm`) di tiap tombol icon buat jaga kontras, TAPI
 * dilaporkan (screenshot) kelihatan aneh/nggak menyatu -- bentuk bulat
 * gelap "nempel" terpisah dari ribbon maupun dari bar solid pas sudah
 * discroll (efek "double circle" pas actions per-halaman juga sudah
 * bulat sendiri, mis. tombol + di Budget/Savings/dst). Backdrop itu
 * DIHAPUS lagi -- ikon sekarang polos tanpa backdrop sendiri, mengandalkan
 * kontras dari tokens.text.secondary + (nanti, kalau ternyata kurang
 * kebaca di atas ribbon tertentu) penyesuaian lanjutan berdasarkan
 * screenshot, bukan backdrop generik yang malah mengganggu visual.
 *
 * v6 (Agu 2026) -- lingkaran abu-abu yang masih kelihatan di beberapa
 * tombol (dilaporkan lewat screenshot, muncul/hilang tidak konsisten
 * antar tombol) TERNYATA bukan dari style kita -- itu default browser
 * focus-ring Android/Chrome di elemen `<button>` yang tidak di-reset,
 * kerender solid di tombol kecil `rounded-full`. Pola established di
 * codebase (banyak tombol lain sudah pakai `focus:outline-none`) diikuti
 * konsisten sekarang di back button & semua tombol `actions` per-halaman.
 *
 * v7 (Agu 2026) -- permintaan eksplisit: `actions` sekarang FADE IN/OUT
 * ikut scroll progress (opacity 0 di progress=0, opacity mengikuti
 * progress) via `actionsRef`, mirip small title -- BEDA dari back button
 * yang TETAP konstan full-visible dari mount (back = navigasi, harus
 * selalu reachable; actions = aksi sekunder yang oke baru muncul begitu
 * user mulai discroll). `pointerEvents` ikut ditoggle (bukan cuma
 * opacity) supaya area icon actions tidak bisa kepencet tak sengaja
 * waktu masih transparan/nyaris tak terlihat di atas ribbon.
 *
 * v8 (Agu 2026) -- KOREKSI atas v7: permintaan eksplisit lanjutan, back
 * button SEKARANG JUGA fade in/out ikut scroll progress (via
 * `backButtonRef`), sama persis logic-nya dengan actionsRef -- tidak ada
 * lagi elemen yang konstan full-visible dari mount di dalam bar ini
 * (cuma container `barRef` sendiri yang tetap fixed-position, TANPA
 * fade, supaya tetap tidak makan ruang flow -- lihat v4). Alasan v7
 * (back = navigasi, harus selalu reachable) TIDAK berlaku lagi di sini
 * atas keputusan eksplisit pemilik produk.
 *
 * v9 (Agu 2026) -- EDGE CASE penting yang ketemu setelah v7/v8: fade-on-
 * scroll bikin back/actions TIDAK PERNAH reachable di halaman yang
 * kontennya lebih pendek dari viewport (mis. EmptyState buat user baru
 * yang belum punya transaksi/wallet/cicilan/anggaran) -- karena scroll
 * event yang men-trigger fade itu sendiri tidak pernah terjadi kalau
 * tidak ada yang bisa discroll. Fix: `isScrollableRef`, dihitung dari
 * `el.scrollHeight > el.clientHeight`, di-recompute setiap kali
 * `contentWrapperRef` (total tinggi title+children, lewat ResizeObserver
 * yang sama dengan titleBlockRef) berubah ukuran -- mis. loading spinner
 * berganti EmptyState pendek. Kalau halaman TIDAK scrollable,
 * `toolbarButtonsProgress` dipaksa 1 (full-visible) buat back & actions
 * SAJA, terlepas dari scroll progress asli -- small title & background
 * bar TETAP pakai progress asli (tidak dipaksa), jadi large title masih
 * kelihatan penuh, cuma back/actions-nya yang di-override supaya tetap
 * reachable dari detik pertama di halaman-halaman yang memang tidak
 * bisa discroll.
 *
 * v10 (Agu 2026) -- EFEK SAMPING dari v9: begitu back/actions dipaksa
 * full-visible di halaman tidak-scrollable, ikonnya (yang overlay
 * `position: fixed` di atas ribbon, lihat v4) jadi NABRAK large title --
 * large title cuma punya ~16px jarak dari atas (padding bawaan App.tsx),
 * jauh lebih kecil dari tinggi toolbar (BAR_HEIGHT_PX, 48px), dan di
 * kondisi tidak-scrollable large title TIDAK ikut mengecil/bergeser
 * (progress asli tetap 0) jadi overlap-nya kelihatan jelas (dilaporkan
 * lewat screenshot, referensi pembanding: Xiaomi HyperAI settings --
 * back button punya baris sendiri, title di bawahnya). Fix:
 * `syncTitleClearance()`, dipanggil bareng setiap kali `isScrollableRef`
 * di-recompute -- nge-set `paddingTop: BAR_HEIGHT_PX` di titleBlockRef
 * KHUSUS kalau hasToolbarContent DAN tidak-scrollable; 0 di kondisi
 * lain. SENGAJA tidak diterapkan universal ke semua halaman
 * hasToolbarContent -- di halaman yang scrollable, large title sudah
 * otomatis mengecil & bergeser ke atas seiring toolbar fade-in
 * (translateY+scale di applyProgress(), progress yang sama), jadi
 * overlap-nya sendiri sudah teratasi oleh animasi collapse itu; kalau
 * clearance dipasang permanen di situ juga, large title jadi punya
 * jarak kosong aneh di atasnya padahal toolbar-nya sendiri transparan
 * (balik ke masalah "gap" ala v3).
 *
 * v11 (Agu 2026) -- BUG KRITIS di v10, dilaporkan sebagai "seluruh
 * konten bergerak-gerak sendiri" (tidak bisa di-screenshot karena
 * constant/rapid): v10 menghitung `isScrollableRef` dari `el.scrollHeight`
 * MENTAH-MENTAH, padahal `el.scrollHeight` itu SENDIRI ikut berubah
 * setiap kali `syncTitleClearance()` nambah/hapus padding -- membentuk
 * feedback loop TAK BERHENTI: padding ditambah -> scrollHeight naik ->
 * kehitung "scrollable" -> padding dihapus -> scrollHeight turun ->
 * kehitung "tidak scrollable" lagi -> padding ditambah lagi -> ulang
 * tanpa henti. Paling kentara di halaman yang tinggi kontennya PAS-PASAN
 * di ambang batas viewport (mis. Savings dengan 1 pocket -- cukup dekat
 * ke threshold sehingga +/-48px cukup buat nyebrang batas itu bolak-
 * balik). Fix: `appliedClearanceRef`, lacak padding yang KITA SENDIRI
 * terapkan (bukan baca balik dari inline style), lalu di-SUBTRACT dari
 * `el.scrollHeight` SEBELUM menghitung isScrollableRef di kedua lokasi
 * (`(el.scrollHeight - appliedClearanceRef.current) > el.clientHeight`)
 * -- jadi keputusan "scrollable atau tidak" selalu berbasis tinggi
 * konten NATURAL (tanpa campur tangan padding kita sendiri), stabil/
 * idempotent berapa kali pun observer ke-trigger ulang, memutus loop
 * total. Prinsip umum buat komponen serupa ke depan: kalau sebuah effect
 * MENGUKUR sesuatu untuk memutuskan MENGUBAH tata letak, dan perubahan
 * tata letak itu sendiri kebetulan mempengaruhi ukuran yang tadi diukur
 * -- itu sinyal wajib subtract/exclude kontribusi diri-sendiri dari
 * pengukuran, atau siap-siap kena feedback loop.
 *
 * v12 (Agu 2026) -- tap target back button & semua `actions` per-halaman
 * diperbesar dari p-1.5 (30x30px, di bawah minimum Apple HIG 44pt) ke
 * p-3.5 (46x46px). Kebetulan juga membenarkan distorsi tersembunyi: CSS
 * global di index.css maksa `min-height: 44px` di semua `<button>`
 * mobile (kecuali `.btn-exact`) -- tombol lama (30px lebar, dipaksa 44px
 * tinggi) jadi KAPSUL/OVAL, bukan lingkaran, walau `rounded-full`.
 * Ukuran baru (46x46, simetris) otomatis lolos rule itu tanpa distorsi.
 * Clearance small title direkalkulasi presisi (bukan cuma nebak angka
 * lebih besar): pl-10 -> pl-14 (back button 46px, tepi kanan ~48px dari
 * tepi bar, +8px buffer), pr-16 -> pr-32 (skenario 2-tombol actions:
 * 46*2+gap-1(4px)+padding bar(16px) = ~112px, +16px buffer). Nilai pr-32
 * dipakai SERAGAM baik utk halaman 1 maupun 2 actions -- halaman
 * 1-tombol cuma dapat sisa ruang lebih lega, lebih aman drpd hitung
 * jumlah children `actions` (rapuh, ReactNode opaque).
 *
 * v13 (Agu 2026) -- a11y: small title (`h2`) MURNI duplikat visual dari
 * large title (`h1`) -- teksnya identik, cuma beda kapan terlihat
 * (crossfade). Tanpa `aria-hidden`, screen reader (VoiceOver/TalkBack)
 * membaca judul halaman DUA KALI (dua heading terpisah dengan teks
 * sama). Fix: `aria-hidden="true"` di kedua h2 (mode toolbar & mode
 * materialize-on-scroll) -- h1 tetap satu-satunya heading yang
 * diumumkan assistive tech, h2 murni dekorasi visual.
 *
 * v14 (Agu 2026) -- BUG lain di kelas yang sama dengan v9/v11 (halaman
 * yang tinggi kontennya pas-pasan/borderline), dilaporkan lewat
 * screenshot: "title/subtitle tidak sepenuhnya hilang pas discroll".
 * `collapseDistanceRef` (jarak scroll yang dianggap perlu buat large
 * title collapse penuh) SEBELUMNYA cuma diukur dari tinggi title block
 * mentah (subtitle panjang, mis. Savings 3 baris teks, bisa bikin
 * ~150-180px), TANPA PERNAH di-clamp ke jarak scroll yang BENERAN
 * tersedia di halaman itu. Kalau subtitle-nya lebih tinggi dari total
 * ruang yang bisa discroll (mis. cuma ~80px sisa 1 pocket card),
 * progress (`scrollTop / collapseDistanceRef`) TIDAK PERNAH nyampe 1
 * bahkan pas discroll sampai mentok -- large title/subtitle "nyangkut"
 * ghosted selamanya di opacity parsial. Fix: `rawTitleHeightRef`
 * (tinggi title mentah, terpisah) + `syncCollapseDistance()` yang
 * meng-clamp `collapseDistanceRef` supaya TIDAK PERNAH melebihi
 * `el.scrollHeight - appliedClearanceRef.current - el.clientHeight`
 * (jarak scroll maksimum aktual, dikurangi kontribusi padding kita
 * sendiri -- alasan sama dengan v11) -- begitu discroll sampai mentok,
 * progress DIJAMIN nyampe 1 berapa pun tinggi title block-nya.
 * syncCollapseDistance() dipanggil di KEDUA titik yang sama dengan
 * syncTitleClearance() (ResizeObserver callback, REGARDLESS entry mana
 * yang berubah -- termasuk contentWrapperRef, karena perubahan tinggi
 * children JUGA mengubah maxScrollDistance walau title block sendiri
 * tidak resize -- + sync awal di mount).
 *
 * v15 (Agu 2026) -- v14 TERNYATA BELUM cukup (dilaporkan lewat screenshot
 * ulang, gejala identik masih terjadi) -- akar masalah sebenarnya bukan
 * cuma soal clamp collapseDistanceRef, tapi soal `el.scrollTop` yang
 * TIDAK SELALU persis 0 di halaman yang isScrollableRef.current-nya
 * FALSE (dianggap "tidak bisa discroll"). Rubber-band bounce/momentum
 * overshoot browser bisa menghasilkan scrollTop kecil (beberapa px)
 * sesaat walau halaman "secara teknis" tidak scrollable -- dan di v14,
 * `syncCollapseDistance()` SENGAJA TIDAK meng-clamp collapseDistanceRef
 * untuk kasus maxScrollDistance <= 0 (fallback ke `desired`, tinggi
 * title block mentah yang BESAR) -- kombinasi scrollTop kecil dibagi
 * collapseDistance besar itu menghasilkan progress kecil-tapi-nonzero
 * yang NYANGKUT di situ (large title & small title SAMA-SAMA separuh
 * terlihat, tumpang tindih, tidak pernah resolve ke salah satu state
 * bersih -- persis gejala yang dilaporkan berulang). Fix: `progress`
 * MENTAH (dipakai large title/small title/background bar) SEKARANG
 * JUGA dipaksa 0 kalau `!isScrollableRef.current` -- konsisten dengan
 * cara `toolbarButtonsProgress` (back/actions) sudah ditangani sejak v9,
 * cuma sekarang diterapkan ke SEMUA elemen yang scroll-linked, bukan
 * cuma toolbar buttons. Immune total dari noise scrollTop sekecil apa
 * pun di halaman yang memang tidak didesain buat discroll.
 *
 * MOBILE-ONLY: sama seperti versi sebelumnya, tidak dirender sama sekali
 * di breakpoint desktop (Sidebar persisten sudah jadi konteks navigasi).
 * Di desktop, large title dirender polos tanpa animasi/bar sticky sama
 * sekali (fallback statis) -- perubahan v3/v4 di atas TIDAK berlaku di
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
  // Dipakai kalau ada back button -- SEKARANG fade in/out ikut scroll
  // progress juga (sebelumnya konstan full-visible dari mount; diubah
  // atas permintaan eksplisit supaya perilakunya seragam dengan actions).
  const backButtonRef = useRef<HTMLButtonElement>(null);
  // Dipakai kalau ada `actions` -- wrapper-nya fade in/out ikut scroll
  // progress (lihat applyProgress()), SEKARANG SAMA seperti back button
  // di atas (keduanya fade bareng, tidak ada lagi yang konstan).
  const actionsRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const willChangeIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Jarak collapse AKTUAL, diukur dari tinggi titleBlockRef via
  // ResizeObserver (lihat effect di bawah) -- dipakai instead of angka
  // fixed di applyProgress(). Disimpan di ref (bukan state) karena
  // dibaca di dalam rAF loop yang jalan di luar siklus render React;
  // menaruhnya di state akan memicu re-render tiap kali ukurannya
  // berubah, padahal cuma perlu dibaca, bukan menggambar ulang apa pun.
  const collapseDistanceRef = useRef<number>(COLLAPSE_DISTANCE_FALLBACK);
  // Tinggi title block MENTAH (belum di-clamp) -- terpisah dari
  // collapseDistanceRef final supaya clamp-nya (lihat komentar di
  // syncCollapseDistance() di bawah) bisa direkalkulasi ulang kapan pun
  // el.scrollHeight berubah, TANPA harus nunggu titleBlockRef sendiri
  // ikut resize (mis. children di bawahnya berubah tinggi karena data
  // baru ke-load -- itu mengubah jarak scroll maksimum yang tersedia,
  // walau tinggi title block-nya sendiri tidak berubah sama sekali).
  const rawTitleHeightRef = useRef<number>(COLLAPSE_DISTANCE_FALLBACK);
  // Ref ke wrapper TOTAL konten body (title block + children) -- diukur
  // via ResizeObserver yang sama di bawah, buat tau apakah halaman ini
  // BISA discroll sama sekali. Kasus nyata: user baru gabung, belum ada
  // transaksi/wallet/cicilan/anggaran -- konten (cuma title + EmptyState
  // pendek) lebih pendek dari viewport, jadi `el.scrollTop` TIDAK PERNAH
  // berubah dari 0 -- kalau back/actions cuma reachable lewat fade-on-
  // scroll (lihat v7/v8 di atas), pengguna baru itu TIDAK PUNYA cara
  // sama sekali buka tombol Add/Refresh/back, karena scroll event yang
  // men-trigger fade itu tidak pernah terjadi.
  const contentWrapperRef = useRef<HTMLDivElement>(null);
  // true = halaman ini scrollable normal (fade-on-scroll back/actions
  // berlaku apa adanya). false = konten lebih pendek dari viewport --
  // back/actions DIPAKSA tetap full-visible terlepas dari scroll
  // progress (lihat applyProgress()), supaya tetap reachable. Default
  // true (optimistic) supaya tidak sempat "kedip" force-visible sekejap
  // sebelum ResizeObserver pertama kali sempat mengukur.
  const isScrollableRef = useRef<boolean>(true);
  // Lacak padding-top yang KITA SENDIRI terapkan ke titleBlockRef lewat
  // syncTitleClearance() (0 atau BAR_HEIGHT_PX) -- WAJIB dikeluarkan
  // (subtract) dari `el.scrollHeight` sebelum menghitung isScrollableRef,
  // supaya tidak muter (v10 sempat rilis TANPA ini dan bikin feedback
  // loop: padding nambah -> scrollHeight naik -> jadi "scrollable" ->
  // padding dihapus -> scrollHeight turun -> jadi "tidak scrollable" lagi
  // -> padding ditambah lagi -> ulang tanpa henti, kelihatan sebagai
  // "seluruh konten bergerak-gerak sendiri" khususnya di halaman yang
  // tingginya pas-pasan di ambang batas viewport, mis. Savings dengan
  // 1 pocket). Disimpan di ref (bukan dibaca balik dari inline style
  // via parseFloat) supaya tidak rapuh ke perubahan format string CSS.
  const appliedClearanceRef = useRef<number>(0);

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
      let progress = Math.min(Math.max(el.scrollTop / collapseDistanceRef.current, 0), 1);
      // v15 fix: kalau halaman ini TIDAK scrollable beneran
      // (isScrollableRef.current === false), progress mentah di atas
      // TETAP dipaksa 0 di sini -- sebelumnya cuma toolbarButtonsProgress
      // (back/actions) yang dipaksa (lihat v9), sementara progress
      // MENTAH yang dipakai large title/small title/background bar
      // dibiarkan apa adanya. Masalahnya: `el.scrollTop` TIDAK SELALU
      // persis 0 di halaman "tidak scrollable" -- rubber-band bounce/
      // momentum overshoot browser bisa menghasilkan scrollTop kecil
      // (beberapa px) sesaat, dan kalau itu kebagi collapseDistanceRef
      // yang (di v14) TIDAK di-clamp untuk kasus ini (branch `else
      // desired` di syncCollapseDistance(), collapseDistance-nya besar
      // -- tinggi title block mentah, BUKAN di-clamp ke maxScrollDistance
      // karena maxScrollDistance <= 0 di kondisi ini), hasilnya progress
      // kecil-tapi-nonzero yang NYANGKUT di situ (dilaporkan lewat
      // screenshot berulang -- large title & small title SAMA-SAMA
      // separuh terlihat, tumpang tindih, tidak pernah resolve ke salah
      // satu state bersih). Fix: konsisten dengan cara back/actions sudah
      // ditangani -- large/small title & background bar JUGA dipaksa
      // "seolah selalu di posisi paling atas" (progress=0) di halaman
      // yang memang tidak bisa discroll, immune dari noise scrollTop
      // sekecil apa pun.
      if (!isScrollableRef.current) progress = 0;

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
        // style statis di JSX (lihat di bawah), supaya BACK BUTTON
        // langsung reachable dari detik pertama halaman dibuka -- TIDAK
        // perlu discroll dulu. Cuma layer BACKGROUND (blur+warna+border)
        // di sini yang di-interpolasi ikut progress, biar tetap ada efek
        // "mengembun jadi solid" pas discroll -- persis kayak sebelumnya,
        // cuma sekarang yang fade itu background-nya doang, bukan seluruh
        // toolbar (termasuk back button).
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

      // Progress "efektif" KHUSUS buat back button & actions -- kalau
      // halaman ini tidak scrollable sama sekali (konten lebih pendek
      // dari viewport, mis. EmptyState buat user baru yang belum punya
      // transaksi/wallet/cicilan/anggaran), scroll event yang men-trigger
      // fade TIDAK PERNAH terjadi -- progress asli permanen 0, jadi
      // back/actions permanen tak-terlihat & tak-terjangkau kalau cuma
      // ikut progress asli. Di kondisi itu, paksa full-visible (seolah
      // progress=1) terlepas dari scroll beneran. Small title & background
      // bar TIDAK ikut dipaksa (tetap pakai `progress` asli di bawah) --
      // large title tetap kelihatan penuh di kondisi ini, cuma back/
      // actions-nya yang di-override supaya tetap reachable.
      const toolbarButtonsProgress = isScrollableRef.current ? progress : 1;

      if (backButtonRef.current) {
        // Back button fade in/out ikut scroll progress (efektif, lihat
        // toolbarButtonsProgress di atas) -- sebelumnya konstan
        // full-visible dari mount, diubah atas permintaan eksplisit
        // supaya seragam dengan actions (lihat blok actionsRef di bawah,
        // logic-nya sama persis).
        backButtonRef.current.style.opacity = String(toolbarButtonsProgress);
        backButtonRef.current.style.pointerEvents = toolbarButtonsProgress > 0.3 ? "auto" : "none";
      }

      if (actionsRef.current) {
        // `actions` (kalau diisi) fade in/out ikut scroll progress
        // (efektif) -- SAMA seperti back button di atas (keduanya fade
        // bareng, dan sama-sama di-override kalau halaman tidak
        // scrollable). pointerEvents ikut ditoggle (bukan cuma opacity)
        // supaya area icon-nya TIDAK bisa kepencet tak sengaja waktu
        // masih transparan/nyaris tak terlihat di atas ribbon.
        actionsRef.current.style.opacity = String(toolbarButtonsProgress);
        actionsRef.current.style.pointerEvents = toolbarButtonsProgress > 0.3 ? "auto" : "none";
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
    //
    // Instance yang SAMA juga dipakai observe contentWrapperRef (total
    // tinggi title+children) -- setiap kali ukurannya berubah (mis.
    // loading spinner berganti jadi EmptyState pendek, atau list yang
    // ke-fetch), isScrollableRef di-recompute dari
    // `el.scrollHeight > el.clientHeight`. Dua ResizeObserver target
    // beda tujuan (collapseDistance vs isScrollable) tapi digabung satu
    // instance -- lebih murah daripada bikin observer terpisah, dan
    // keduanya sama-sama perlu applyProgress() dipanggil ulang setelahnya.
    const syncTitleClearance = () => {
      // Reserve ruang ekstra di ATAS title block KHUSUS kalau toolbar
      // (back button dan/atau actions) di-paksa full-visible di kondisi
      // halaman tidak-scrollable (lihat v9) -- soalnya toolbar itu
      // `position: fixed` OVERLAY di atas ribbon (lihat v4), jadi kalau
      // large title dibiarkan mulai dari posisi natural-nya (cuma ~16px
      // dari atas, padding bawaan App.tsx), ikonnya numpuk/nabrak title
      // (dilaporkan lewat screenshot -- back arrow nabrak huruf pertama
      // judul). Referensi yang benar (dicontohkan user): back button
      // punya baris sendiri, title di bawahnya, tidak overlap.
      //
      // SENGAJA hanya diterapkan di kondisi tidak-scrollable, BUKAN
      // universal ke semua halaman hasToolbarContent -- di halaman yang
      // scrollable, begitu toolbar mulai fade-in (discroll dikit),
      // large title JUGA otomatis mengecil & bergeser ke atas
      // (translateY+scale, lihat largeTitleRef di atas) mengikuti
      // progress yang SAMA, jadi overlap-nya sendiri sudah teratasi oleh
      // animasi collapse itu -- kalau clearance ini dipasang permanen di
      // semua halaman, large title jadi punya jarak kosong aneh di
      // ataznya padahal toolbar-nya sendiri transparan/tidak kelihatan
      // (balik ke masalah "gap" ala v3).
      //
      // Deteksi hasToolbarContent lewat KEBERADAAN ref (bukan closure
      // variable `hasToolbarContent`) -- refs SELALU sinkron ke render
      // TERAKHIR regardless kapan effect ini terakhir jalan (dependency
      // array effect ini cuma [scrollRef, isDesktop]), jadi lebih akurat
      // daripada baca closure yang berpotensi stale kalau backTo/actions
      // berubah tanpa scrollRef/isDesktop ikut berubah.
      const hasToolbarContentNow = backButtonRef.current !== null || actionsRef.current !== null;
      const clearance = hasToolbarContentNow && !isScrollableRef.current ? BAR_HEIGHT_PX : 0;
      appliedClearanceRef.current = clearance;
      if (titleBlockRef.current) {
        titleBlockRef.current.style.paddingTop = `${clearance}px`;
      }
    };

    const syncCollapseDistance = () => {
      // v14 fix: collapseDistanceRef SEBELUMNYA cuma diukur dari tinggi
      // title block mentah (rawTitleHeightRef), TANPA pernah di-clamp ke
      // jarak scroll yang BENERAN tersedia di halaman ini
      // (`el.scrollHeight - el.clientHeight`) -- dilaporkan lewat
      // screenshot sebagai "title/subtitle tidak sepenuhnya hilang pas
      // discroll". Akar masalahnya: kalau subtitle panjang (mis. Savings,
      // 3 baris teks) bikin title block tinggi (~150-180px), TAPI total
      // ruang yang bisa discroll di halaman itu lebih pendek dari itu
      // (mis. cuma ~80px, sisa 1 pocket card), maka progress
      // (`scrollTop / collapseDistanceRef.current`) TIDAK PERNAH nyampe 1
      // bahkan pas discroll sampai mentok -- large title/subtitle jadi
      // "nyangkut" ghosted selamanya (opacity berhenti di, mis., ~0.5).
      //
      // Fix: collapseDistanceRef di-clamp supaya TIDAK PERNAH melebihi
      // jarak scroll maksimum aktual -- begitu user scroll sampai mentok,
      // progress DIJAMIN nyampe 1 (collapse penuh), berapa pun tinggi
      // title block-nya. `- appliedClearanceRef.current` di sini SAMA
      // alasannya dengan di isScrollableRef (v11) -- keluarkan kontribusi
      // padding yang kita sendiri tambahkan dari pengukuran, biar nggak
      // ikut kena feedback loop.
      const maxScrollDistance = el.scrollHeight - appliedClearanceRef.current - el.clientHeight;
      const desired = Math.max(rawTitleHeightRef.current, COLLAPSE_DISTANCE_MIN);
      collapseDistanceRef.current = maxScrollDistance > 0 ? Math.min(desired, maxScrollDistance) : desired;
    };

    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === titleBlockRef.current) {
            const measured = entry.contentRect.height;
            if (measured) {
              rawTitleHeightRef.current = measured;
            }
          }
        }
        // isScrollableRef & collapseDistanceRef DUA-DUANYA di-recompute
        // REGARDLESS entry mana yang berubah -- lebih murah & lebih
        // robust daripada nebak entry spesifik mana yang relevan, dan
        // operasinya sendiri murah (baca 2 properti DOM, bukan reflow
        // tambahan). PENTING: perubahan di contentWrapperRef (mis.
        // children lain berubah tinggi karena data baru ke-load) JUGA
        // mengubah `maxScrollDistance` yang dipakai syncCollapseDistance()
        // di atas, walau titleBlockRef sendiri tidak resize -- makanya
        // kedua sync ini dipanggil tiap kali observer manapun ke-trigger,
        // bukan cuma di dalam if-block titleBlockRef di atas.
        //
        // `- appliedClearanceRef.current` WAJIB ada (v11 fix) -- tanpa
        // ini, padding yang KITA SENDIRI tambahkan di syncTitleClearance()
        // ikut kehitung sebagai bagian scrollHeight, bikin feedback loop
        // tak berhenti (lihat komentar panjang di appliedClearanceRef).
        isScrollableRef.current = (el.scrollHeight - appliedClearanceRef.current) > el.clientHeight;
        syncTitleClearance();
        syncCollapseDistance();
        applyProgress();
      });
      if (titleBlockRef.current) resizeObserver.observe(titleBlockRef.current);
      if (contentWrapperRef.current) resizeObserver.observe(contentWrapperRef.current);
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

    // Sinkron di sini juga (bukan cuma nunggu callback async pertama dari
    // ResizeObserver di atas) -- supaya render pertama sudah langsung
    // pakai nilai yang benar, bukan default optimistic `true` sekejap.
    isScrollableRef.current = (el.scrollHeight - appliedClearanceRef.current) > el.clientHeight;
    syncTitleClearance();
    syncCollapseDistance();
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
    // button dan/atau actions. Back button & actions harus reachable dari
    // detik pertama halaman dibuka, tanpa perlu discroll dulu.
    //
    // FIX v2 (visual, Agu 2026) -- percobaan pertama (kasih barRef warna
    // canvas PERMANEN, masih posisi `sticky` reserved-flow) TERNYATA masih
    // kelihatan sebagai strip kosong terpisah dari ribbon (dilaporkan lewat
    // screenshot) -- akar masalah sebenarnya BUKAN soal warna, tapi soal
    // POSITIONING: `sticky` ikut reserved-flow, jadi container-nya nempatin
    // ruang SENDIRI sebelum ribbon sempat mulai, membentuk "pemisah" visual
    // antara status bar & ribbon apapun warnanya.
    //
    // Fix yang benar: barRef sekarang `position: fixed` (BUKAN sticky) --
    // dikeluarkan total dari document flow, tidak makan tempat SAMA SEKALI.
    // Ribbon di bawahnya jadi mulai persis di posisi yang sama seperti
    // sebelum fitur toolbar-selalu-tampil ini ada (langsung di bawah status
    // bar/notch) -- back button & actions sekarang OVERLAY/mengambang di
    // ATAS ribbon (bukan di strip terpisah SEBELUM ribbon). `top` di-set ke
    // `env(safe-area-inset-top)` (bukan 0) supaya sejajar dengan titik mulai
    // konten <main> yang juga di-padding sejumlah sama (lihat
    // `style={{paddingTop: ...}}` di App.tsx) -- z-30 memastikan tetap di
    // atas ribbon/konten yang discroll di baliknya.
    //
    // Konsekuensinya: background TIDAK bisa lagi permanen solid dari awal
    // (kalau iya, bakal nutupin ribbon di baliknya, balik jadi masalah
    // serupa) -- balik transparan by default, ribbon keliatan tembus di
    // baliknya (seperti nav bar overlay di atas hero image, pola umum).
    // barBgRef (blur+solid) tetap fade-in ikut scroll SEKARANG JADI
    // ESENSIAL (bukan cuma polish) -- begitu ribbon discroll keluar dari
    // balik toolbar, konten lain (list, card) yang lewat di baliknya perlu
    // backdrop solid supaya ikon tetap kebaca, bukan cuma efek estetika.
    // (v5: sempat dicoba tambah backdrop bulat sendiri per-tombol buat
    // jaga kontras independen dari progress, tapi dilaporkan kelihatan
    // aneh/nggak menyatu -- DIHAPUS lagi, ikon polos tanpa backdrop.)
    <div
      ref={barRef}
      style={{ top: "env(safe-area-inset-top)", height: BAR_HEIGHT_PX }}
      className="fixed inset-x-0 z-30 w-full flex items-center px-4 sm:px-6"
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
        // Back button sekarang fade in/out ikut scroll progress (lihat
        // applyProgress()) -- opacity awal 0 + pointerEvents none lewat
        // inline style (bukan class) supaya tidak "kedip" full visible
        // sekejap sebelum effect di atas sempat jalan pertama kali.
        <button
          ref={backButtonRef}
          type="button"
          onClick={handleBack}
          aria-label={t("common.back")}
          style={{ opacity: 0, pointerEvents: "none" }}
          className="relative z-10 shrink-0 -ml-3.5 p-3.5 rounded-full cursor-pointer active:scale-[0.92] transition-transform focus:outline-none"
        >
          <ChevronLeft size={18} className={tokens.text.secondary} />
        </button>
      )}
      {actions && (
        // Sama seperti back button di atas: actions fade in/out ikut scroll progress
        // (lihat applyProgress()) -- opacity awal 0 + pointerEvents none
        // lewat inline style (bukan class) supaya tidak "kedip" full
        // visible sekejap sebelum effect di atas sempat jalan pertama
        // kali. ml-auto dorong ke ujung kanan (back button di kiri cuma
        // flow item lain di flex ini, h2 title di tengah posisinya
        // absolute jadi tidak ikut mendorong).
        <div
          ref={actionsRef}
          style={{ opacity: 0, pointerEvents: "none" }}
          className="relative z-10 ml-auto shrink-0 flex items-center gap-1"
        >
          {actions}
        </div>
      )}
      {/* Small title TETAP crossfade ikut scroll progress seperti biasa
          (ini bagian "Large Title Navigation" yang tidak berubah) --
          cuma back button/actions/background di sekitarnya yang sekarang
          beda perilaku. Padding kondisional: pl-14 cuma kalau hasBack;
          pr-32 cuma kalau ada actions.
          v12 (Agu 2026): tap target back/actions diperbesar dari p-1.5
          (30x30px, di bawah standar) ke p-3.5 (46x46px, lolos minimum
          Apple HIG 44pt & mendekati Material Design 48dp) -- lihat juga
          className tiap tombol actions per-halaman (semuanya ikut
          diseragamkan p-1.5 -> p-3.5). Clearance dihitung ulang presisi:
          back button (padding 14px, -ml-14px, lebar total 46px) -> tepi
          kanannya jatuh di ~48px dari tepi bar sebenarnya (bar px-4 16px
          - margin 14px + lebar 46px), pl-14 (56px) kasih ~8px buffer.
          actions (ml-auto, TIDAK pakai margin-offset kayak back) -> 2
          tombol 46px + gap-1 (4px) + padding bar sendiri (16px) = ~112px
          dari tepi kanan sebenarnya, pr-32 (128px) kasih ~16px buffer.
          Nilai SAMA dipakai baik halaman 1 actions maupun 2 actions
          (skenario 2-tombol yang menentukan) -- halaman 1-tombol cuma
          dapat sisa ruang lebih lega, bukan masalah. */}
      <h2
        ref={smallTitleRef}
        aria-hidden="true"
        style={{ opacity: 0 }}
        className={cx(
          "absolute z-10 inset-x-0 text-center font-sans font-semibold text-sm truncate pointer-events-none",
          hasBack ? "pl-14" : "pl-4 sm:pl-6",
          actions ? "pr-32" : "pr-4 sm:pr-6",
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
        aria-hidden="true"
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
      <div ref={contentWrapperRef} className="space-y-6">
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
