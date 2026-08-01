# Perbaikan: Collapsing Header tidak muncul di halaman Monitor Error

## Root cause
`CollapsingPageHeader` sudah dipasang dengan benar di
`src/views/AdminErrorMonitor.tsx` (`<CollapsingPageHeader title=... backTo="/admin" />`),
dan state `isCollapsed` sudah menjadi `true` saat di-scroll (listener scroll
`<main>` bekerja). Masalahnya murni **CSS positioning**, bukan logic React:

1. Di `src/App.tsx`, seluruh konten route dibungkus `motion.div` untuk
   animasi transisi push/pop antar halaman. Variannya memakai properti `x`
   — termasuk di state diam `"center"` yaitu `x: 0`.
2. Framer Motion tetap menulis `transform: translateX(0px)` secara *inline*
   walau nilainya nol.
3. Menurut spesifikasi CSS, ancestor **apa pun** yang punya `transform`
   selain `none` (termasuk `translateX(0px)`) membentuk *containing block*
   baru untuk descendant `position: sticky` / `position: fixed`.
4. Akibatnya `sticky top-0` di `CollapsingPageHeader` tidak lagi dihitung
   relatif terhadap scrollport `<main overflow-y-auto>`, melainkan relatif
   ke box `motion.div` itu sendiri — jadi elemen ini berperilaku seperti
   `position: relative` biasa: diam di posisi flow normalnya (paling atas
   halaman) dan langsung ter-scroll lewat begitu saja saat user scroll ke
   bawah. Itu sebabnya secara visual komponennya "tidak ada" walau kode &
   state-nya sudah benar.

Bug ini adalah gotcha CSS yang cukup terkenal: *"transform on any ancestor
breaks position: sticky/fixed"*.

## Perbaikan
Alih-alih menghapus animasi transisi halaman (trade-off UX yang tidak
diinginkan), solusinya: keluarkan `CollapsingPageHeader` dari containing
block `motion.div` itu lewat **React Portal**, bukan lewat CSS trick.

### File yang diubah (3 file)
- `src/contexts/MainScrollContext.tsx`
  Tambah `HeaderPortalContext` / `HeaderPortalProvider` / `useHeaderPortalNode()`
  — context baru (terpisah dari `MainScrollContext` yang sudah ada) untuk
  membagikan node DOM tempat portal dipasang.
- `src/App.tsx`
  - Tambah `const [headerPortalNode, setHeaderPortalNode] = useState<HTMLDivElement | null>(null)`.
  - Pasang `<div ref={setHeaderPortalNode} className="contents" />` sebagai
    anak **langsung** `<main>`, **sebelum** `motion.div` transisi route
    (jadi bebas dari containing block transform-nya). `className="contents"`
    (Tailwind `display: contents`) dipakai supaya div ini murni titik pasang
    portal, tidak menambah box/pengaruh layout apa pun.
  - Bungkus pohon route dengan `<HeaderPortalProvider node={headerPortalNode}>`.
- `src/components/CollapsingPageHeader.tsx`
  - Ambil node portal lewat `useHeaderPortalNode()`.
  - Render kontennya lewat `createPortal(content, portalNode)` (dengan
    fallback render biasa kalau portal belum tersedia, mis. dipakai di luar
    App shell/test).
  - Ganti trik `-mx-4 sm:-mx-6 lg:-mx-8` (negative margin, dulu diasumsikan
    parent langsungnya adalah div berpadding `p-4 sm:p-6 lg:p-8`) menjadi
    `w-full px-4 sm:px-6 lg:px-8` biasa — karena sekarang komponen ini betulan
    anak langsung `<main>` (lebar penuh), bukan lagi bersarang di dalam div
    `max-w-7xl mx-auto` yang tidak lagi punya padding sendiri.

### Kenapa portal, bukan solusi lain?
- **Hapus animasi transisi (`x`) dari motion.div** → menghilangkan efek
  push/pop native-like di seluruh app, trade-off UX terlalu besar untuk 1
  komponen.
- **Ganti `sticky` → `fixed` dengan `top` dihitung manual dari JS** → tetap
  kena masalah yang sama, karena `transform` pada ancestor JUGA membentuk
  containing block baru untuk `position: fixed`, tidak cuma `sticky`.
- **Portal ke node di luar `motion.div`** → satu-satunya cara membuat
  elemen ini benar-benar lepas dari containing block transform tersebut,
  tanpa mengubah perilaku transisi halaman yang sudah ada. Pola ini juga
  reusable untuk header sticky halaman lain ke depannya (`useHeaderPortalNode`
  sudah general, bukan spesifik satu halaman).

## Cara apply
Timpa 3 file berikut di project dengan isi dari zip ini (struktur folder
sudah sama persis dengan project asli):
```
src/App.tsx
src/components/CollapsingPageHeader.tsx
src/contexts/MainScrollContext.tsx
```
Sudah diverifikasi dengan `tsc --noEmit` (bersih) dan `vite build` (sukses)
di sandbox sebelum dikirim.

## Cara verifikasi manual
1. Buka halaman Monitor Error (`/admin/error-monitor`) di HP.
2. Scroll ke bawah melewati header besar "Monitor Error" (± 48px).
3. Compact sticky bar (tombol back + judul "Monitor Error") sekarang
   benar-benar menempel di atas layar selama scroll, dengan efek
   `backdrop-blur` — bukan lagi ikut ter-scroll lewat begitu saja.
