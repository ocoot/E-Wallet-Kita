import React, { useRef, useState, useCallback, useLayoutEffect, useEffect } from "react";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { audioFeedback } from "../lib/audio";

interface DashboardWalletCarouselProps {
  /**
   * Kartu "dashboard dinamis" (greeting/cuaca -- DashboardHeader) -- snap-item
   * PERTAMA di strip.
   */
  headerSlot: React.ReactNode;
  /**
   * Kartu Pos Dompet -- sekarang SATU kartu selector (dropdown, lihat
   * DashboardWalletSelectorCard.tsx) alih-alih banyak kartu per pos yang
   * di-loop di sini. Snap-item KEDUA di strip.
   */
  walletSlot: React.ReactNode;
}

/**
 * Strip carousel dashboard -- gabungan kartu "dashboard dinamis" (greeting +
 * cuaca, `headerSlot`) dan kartu Pos Dompet selector (`walletSlot`), jadi
 * SATU baris yang bisa digeser (swipe) horizontal, snap satu-per-satu --
 * pola swipe yang sama seperti versi sebelumnya (saat kartu Pos Dompet masih
 * berupa banyak kartu per pos), cuma sekarang cuma ADA 2 snap-item: kartu
 * dashboard dinamis, lalu kartu Pos Dompet selector tunggal (isinya sendiri
 * punya dropdown untuk berpindah pos -- lihat DashboardWalletSelectorCard.tsx).
 *
 * Komponen ini sekarang murni "wrapper swipe" generik (mekanisme snap-scroll
 * + dot indikator) -- semua logic fetch wallet/render kartu per-provider
 * sudah pindah total ke DashboardWalletSelectorCard.tsx, supaya kartu
 * selector itu juga bisa dipakai berdiri sendiri (tanpa carousel) kalau
 * suatu saat dibutuhkan.
 *
 * TINGGI STRIP -- otomatis menyesuaikan kartu yang sedang aktif (bukan
 * dipaku ke tinggi kartu paling tinggi di antara semuanya):
 * Sebelumnya, karena semua snap-item ada dalam SATU flex row yang sama,
 * tinggi wrapper scroll (dan otomatis jarak ke dot indikator di bawahnya)
 * selalu mengikuti kartu PALING TINGGI di antara `headerSlot` (kartu
 * greeting, isinya bisa lebih tinggi kalau ada info anggaran/event
 * musiman) dan `walletSlot` (kartu Pos Dompet selector, biasanya lebih
 * pendek) -- akibatnya, saat kartu yang lebih PENDEK sedang aktif/terlihat,
 * ada jarak kosong ganjil antara kartu itu dan dot indikator di bawahnya
 * (dot-nya "menunggu" di posisi kartu yang lebih tinggi).
 * Sekarang tinggi wrapper scroll di-set secara eksplisit lewat inline
 * style `height`, diukur dari tinggi asli snap-item yang SEDANG AKTIF saja
 * (lihat `updateHeight`), dengan transisi halus (`transition-[height]`)
 * setiap kali pindah kartu. `ResizeObserver` dipasang di kedua snap-item
 * supaya tinggi ikut ter-update otomatis kalau konten salah satu kartu
 * berubah tinggi belakangan (mis. data cuaca/badge event baru masuk
 * setelah render pertama, atau breakpoint layar berubah).
 */
export const DashboardWalletCarousel: React.FC<DashboardWalletCarouselProps> = ({ headerSlot, walletSlot }) => {
  const { tokens, cx } = useThemeTokens();
  const [activeIndex, setActiveIndex] = useState(0);
  const [stripHeight, setStripHeight] = useState<number | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);

  const slots = [headerSlot, walletSlot];

  const updateHeight = useCallback(() => {
    const active = slotRefs.current[activeIndex];
    if (active) setStripHeight(active.offsetHeight);
  }, [activeIndex]);

  // Ukur ulang tiap kali kartu aktif berganti (swipe manual atau lewat dot).
  useLayoutEffect(() => {
    updateHeight();
  }, [updateHeight]);

  // Pantau perubahan tinggi konten di SEMUA snap-item (bukan cuma yang
  // aktif) -- supaya begitu kartu yang sedang tidak terlihat berubah tinggi
  // (mis. data async selesai dimuat), transisi tinggi tetap mulus saat user
  // swipe ke sana nanti, tanpa nunggu resize event lain.
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => updateHeight());
    slotRefs.current.forEach((el) => { if (el) ro.observe(el); });
    return () => ro.disconnect();
  }, [slots.length, updateHeight]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.children.length === 0) return;
    const cardWidth = (el.children[0] as HTMLElement).offsetWidth + 12; // + gap-3
    const idx = Math.round(el.scrollLeft / cardWidth);
    setActiveIndex(Math.max(0, Math.min(idx, el.children.length - 1)));
  }, []);

  const scrollToIndex = (idx: number) => {
    const el = scrollRef.current;
    if (!el || !el.children[idx]) return;
    const card = el.children[idx] as HTMLElement;
    el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: "smooth" });
  };

  return (
    <div className="space-y-2.5 w-full">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ height: stripHeight }}
        className="flex items-start gap-3 overflow-x-auto overflow-y-hidden snap-x snap-mandatory -mx-1 px-1 scroll-smooth transition-[height] duration-300 ease-out [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {slots.map((slot, idx) => (
          // w-full HARUS sama persis dengan lebar wrapper luar (w-full di
          // atas) supaya tidak ada sliver kartu berikutnya yang nongol --
          // overflow-x-auto hanya meng-clip pada batas lebar wrapper, bukan
          // per-kartu. `ref` di sini dipakai `updateHeight`/ResizeObserver
          // untuk mengukur tinggi asli tiap kartu (lihat catatan di atas).
          <div
            key={idx}
            ref={(el) => { slotRefs.current[idx] = el; }}
            className="shrink-0 w-full snap-center"
          >
            {slot}
          </div>
        ))}
      </div>

      {slots.length > 1 && (
        <div className="flex items-center justify-center gap-1 pt-0.5">
          {slots.map((_, idx) => (
            <button
              key={idx}
              type="button"
              aria-label={`${idx + 1}`}
              onClick={() => { audioFeedback.playClick(); scrollToIndex(idx); }}
              // `btn-exact`: lolos dari rule global tap-target mobile yang
              // memaksa min-height 44px ke semua <button> (lihat index.css).
              // `relative before:-inset-y-3.5 ...`: dot-nya sendiri tetap
              // kecil (h-1) secara visual, tapi area sentuh diperlebar
              // secara transparan lewat pseudo-element ::before supaya tetap
              // nyaman disentuh di layar mobile.
              className={cx(
                "btn-exact relative h-1 rounded-full transition-all cursor-pointer active:scale-90 before:absolute before:-inset-y-3.5 before:-inset-x-1 before:content-['']",
                idx === activeIndex ? tokens.dashboardWalletCarousel.dotActive : cx("w-1", tokens.mobileBottomNav.sheetGrip)
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
};
