/**
 * Web Share API (Level 2, dengan `files`) -- memunculkan share-sheet OS asli
 * (di Android: daftar app WhatsApp/Gmail/Drive/dll; di iOS: share sheet
 * Safari) supaya export laporan tidak harus lewat "download lalu share
 * manual dari File Manager", yang terasa jauh dari native.
 *
 * TIDAK semua browser mendukung `navigator.share` dengan `files` (mis.
 * Firefox desktop, sebagian besar browser desktop non-Chromium) -- makanya
 * SELALU feature-detect lewat `canShareFiles()` sebelum menawarkan tombol
 * "Bagikan" di UI, dan sediakan tombol "Unduh" (`doc.save()`/anchor
 * download biasa) sebagai fallback yang tetap berfungsi di mana pun.
 */

export function canShareFiles(file: File): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.share !== "function") return false;
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
  if (typeof nav.canShare === "function") {
    try {
      return nav.canShare({ files: [file] });
    } catch {
      return false;
    }
  }
  // Browser lama yang punya `share()` tapi belum punya `canShare()` --
  // anggap tidak didukung untuk file (lebih aman daripada asumsi berhasil).
  return false;
}

/**
 * Memicu share-sheet OS untuk satu file. Mengembalikan `true` kalau share
 * sheet berhasil dibuka (BUKAN berarti user memilih tujuan tertentu --
 * `navigator.share` resolve begitu saja setelah share sheet ditutup dengan
 * sukses). Mengembalikan `false` kalau user membatalkan (`AbortError`,
 * ini kondisi NORMAL, bukan error) atau kalau share gagal karena sebab
 * lain -- caller sebaiknya diam-diam fallback ke download pada kedua kasus.
 */
export async function shareFile(file: File, title?: string, text?: string): Promise<boolean> {
  if (!canShareFiles(file)) return false;
  try {
    await navigator.share({ files: [file], title, text });
    return true;
  } catch (err) {
    if ((err as DOMException)?.name === "AbortError") return false;
    return false;
  }
}
