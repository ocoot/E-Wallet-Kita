import React, { useState, useMemo } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { dbService } from "../lib/db";
import { useGoldSavings } from "../hooks/useGoldSavings";
import { useWallets } from "../hooks/useWallets";
import { GoldPocket, GoldBrand, ACTIVE_GOLD_BRANDS } from "../types";
import { Modal } from "../components/Modal";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { InfoTooltip } from "../components/InfoTooltip";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { useBackGestureTrap } from "../hooks/useBackGestureTrap";
import { ModalShell } from "../components/ui/ModalShell";
import { DropdownField } from "../components/DropdownField";
import { motion, AnimatePresence } from "motion/react";
import { audioFeedback } from "../lib/audio";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import {
  Coins, Plus, Trash2, Edit2, ArrowDownCircle, ArrowUpCircle,
  Archive, ArchiveRestore, Info, AlertTriangle, PackagePlus, PackageMinus
} from "lucide-react";

// GOLD_BRANDS lama (7 brand) diganti ACTIVE_GOLD_BRANDS dari types.ts --
// supaya user tidak bisa membuat pos untuk brand yang sudah tidak lagi
// disinkron gold-price-sync (lihat cakupan yang dipersempit ke 4 brand).

const formatIDR = (num: number | null) => num != null ? "Rp\u00A0" + Math.round(num).toLocaleString("id-ID") : "-";
const formatGrams = (num: number) => `${num.toLocaleString("id-ID", { maximumFractionDigits: 4 })} gr`;

// Format price_date (kolom DATE, contoh "2026-07-04") jadi label panjang
// ("04 Juli 2026") maupun pendek ("04 Jul") sesuai locale aktif. Dibuat local
// noon (bukan parse langsung sebagai UTC midnight) supaya tidak ada risiko
// mundur satu hari akibat pergeseran timezone browser user.
const parsePriceDate = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
};
const formatPriceDateLong = (dateStr: string, locale: string): string =>
  new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", {
    day: "2-digit", month: "long", year: "numeric",
  }).format(parsePriceDate(dateStr));

// Indikator ↑/↓ perbandingan harga (sell atau buyback) brand tertentu vs
// harga hari sebelumnya. Return null (tidak render apa-apa) kalau data
// pembanding belum ada atau harganya persis sama -- supaya tidak menampilkan
// panah yang menyesatkan saat sebenarnya tidak ada perubahan atau memang
// belum ada histori 2 hari.
// Ditampilkan dalam bentuk NOMINAL rupiah (bukan persen lagi) supaya user
// langsung tahu berapa besar pergerakan harganya dalam Rupiah per gram.
const renderPriceDelta = (
  current: number | null | undefined,
  prev: number | null | undefined,
  t: (key: string, replacements?: Record<string, string | number>) => string
) => {
  if (current == null || prev == null || prev === 0) return null;
  const diff = current - prev;
  if (diff === 0) return null;
  const isUp = diff > 0;
  const diffLabel = formatIDR(Math.abs(diff));
  return (
    <span
      className={`inline-flex items-center gap-0.5 whitespace-nowrap ${isUp ? "text-emerald-400" : "text-red-400"}`}
      title={t(isUp ? "gold.price_up_hint" : "gold.price_down_hint", { amount: diffLabel })}
    >
      {isUp ? "▲" : "▼"} {diffLabel}
    </span>
  );
};

interface PocketFormState {
  name: string;
  brand: GoldBrand;
  notes: string;
  wallet_id: string;
}
const emptyForm = (): PocketFormState => ({ name: "", brand: "antam", notes: "", wallet_id: "" });

type MoveDirection = "buy" | "sell" | "manual_add" | "manual_remove";

export const GoldSavings: React.FC = () => {
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { pockets, summary, prices, loading, error: pocketsError, refresh } = useGoldSavings(user?.id);
  const { activeWallets } = useWallets();
  const { tokens, cx } = useThemeTokens();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<GoldPocket | null>(null);
  const [form, setForm] = useState<PocketFormState>(emptyForm());
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GoldPocket | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [moveTarget, setMoveTarget] = useState<{ pocket: GoldPocket; direction: MoveDirection } | null>(null);
  const [moveValue, setMoveValue] = useState("");
  const [moveNote, setMoveNote] = useState("");
  const [isMoving, setIsMoving] = useState(false);

  useLockBodyScroll(isFormOpen || !!moveTarget);
  // Menjebak swipe-back/tombol-back HP saat modal ini terbuka, supaya
  // menutup modal (tetap di halaman Tabungan Emas) -- bukan malah
  // menavigasi balik ke halaman sebelumnya (lihat useBackGestureTrap.ts).
  const { close: closeForm } = useBackGestureTrap(isFormOpen, setIsFormOpen);
  const isMoveOpen = !!moveTarget;
  const setIsMoveOpen = (open: boolean) => { if (!open) setMoveTarget(null); };
  const { close: closeMoveModal } = useBackGestureTrap(isMoveOpen, setIsMoveOpen);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Kartu emas "fisik" (Konsep D): id pos yang sedang di-flip (nampilkan sisi
  // aksi). Set (bukan single value) supaya beberapa kartu bisa flip
  // independen kalau usernya memang mau bandingkan aksi 2 pos sekaligus.
  const [flippedIds, setFlippedIds] = useState<Set<string>>(new Set());
  const toggleFlip = (id: string) => {
    setFlippedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const activePockets = useMemo(() => pockets.filter(p => !p.is_archived), [pockets]);
  const archivedPockets = useMemo(() => pockets.filter(p => p.is_archived), [pockets]);
  const priceByBrand = useMemo(() => new Map(prices.map(p => [p.brand, p])), [prices]);
  // price_date terbaru di antara semua brand aktif -- dipakai sebagai
  // headline "Harga terbaru per: ...". Kalau ada brand yang price_date-nya
  // BEDA dari yang paling baru ini (mis. pegadaian ketinggalan sehari
  // karena source-nya gagal sync), kita tandai priceDatesMismatch = true
  // supaya usernya tahu bukan semua harga di strip itu sama segarnya --
  // ini persis kasus nyata yang pernah kejadian di gold-price-sync (lihat
  // catatan bug timeout di migration 20260704000000_fix_gold_price_sync_cron_timeout.sql).
  const latestPriceDate = useMemo(() => {
    if (prices.length === 0) return null;
    return prices.reduce((max, p) => (p.price_date > max ? p.price_date : max), prices[0].price_date);
  }, [prices]);
  const priceDatesMismatch = useMemo(
    () => latestPriceDate != null && prices.some(p => p.price_date !== latestPriceDate),
    [prices, latestPriceDate]
  );
  // Defensif: kalau pos yang sedang diedit brand-nya sudah tidak lagi
  // disinkron (di luar ACTIVE_GOLD_BRANDS -- mis. dibuat sebelum cakupan
  // dipersempit), tetap tampilkan brand itu di dropdown supaya tidak
  // kelihatan kosong/salah pilih. Select tetap disabled saat edit, jadi
  // ini murni supaya nilainya kebaca benar, bukan supaya bisa dipilih ulang.
  const formBrandOptions = useMemo(() => {
    if (editTarget && !ACTIVE_GOLD_BRANDS.includes(editTarget.brand)) {
      return [editTarget.brand, ...ACTIVE_GOLD_BRANDS];
    }
    return ACTIVE_GOLD_BRANDS;
  }, [editTarget]);

  const openAddForm = () => { setEditTarget(null); setForm(emptyForm()); setIsFormOpen(true); };
  const openEditForm = (p: GoldPocket) => {
    setEditTarget(p);
    setForm({ name: p.name, brand: p.brand, notes: p.notes ?? "", wallet_id: p.wallet_id ?? "" });
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;
    const trimmedName = form.name.trim();
    if (!trimmedName) { audioFeedback.playDullPluck(); showToast(t("gold.invalid_name"), "error"); return; }

    setIsSaving(true);
    try {
      if (editTarget) {
        // Brand sengaja tidak ikut di-submit saat edit -- lihat catatan di
        // migration (brand acuan harga tidak dianjurkan berubah setelah
        // pocket punya transaksi, supaya cash_locked_amount tetap bermakna).
        await dbService.updateGoldPocket(user.id, editTarget.id, { name: trimmedName, notes: form.notes.trim() || null, wallet_id: form.wallet_id || null });
      } else {
        await dbService.createGoldPocket(user.id, { name: trimmedName, brand: form.brand, notes: form.notes.trim() || null, wallet_id: form.wallet_id || null });
      }
      showToast(t("gold.save_success"), "success");
      audioFeedback.playClick();
      closeForm();
      await refresh();
    } catch { showToast(t("gold.save_error"), "error"); }
    finally { setIsSaving(false); }
  };

  const handleDeleteConfirmed = async () => {
    if (!user || !deleteTarget) return;
    setIsDeleting(true);
    try {
      const ok = await dbService.deleteGoldPocket(user.id, deleteTarget.id);
      if (ok) { showToast(t("gold.delete_success"), "success"); await refresh(); }
      else showToast(t("gold.delete_error"), "error");
    } catch { showToast(t("gold.delete_error"), "error"); }
    finally { setIsDeleting(false); setDeleteTarget(null); }
  };

  const toggleArchive = async (p: GoldPocket) => {
    if (!user) return;
    setBusyId(p.id);
    try {
      await dbService.updateGoldPocket(user.id, p.id, { is_archived: !p.is_archived });
      audioFeedback.playClick();
      await refresh();
    } catch { showToast(t("gold.save_error"), "error"); }
    finally { setBusyId(null); }
  };

  const openMove = (pocket: GoldPocket, direction: MoveDirection) => {
    audioFeedback.playClick();
    setMoveTarget({ pocket, direction });
    setMoveValue("");
    setMoveNote("");
  };

  const executeMove = async () => {
    if (!moveTarget || !user) return;
    const num = Number(moveValue);
    if (!moveValue.trim() || isNaN(num) || num <= 0) {
      audioFeedback.playDullPluck(); showToast(t("gold.invalid_amount"), "error"); return;
    }

    setIsMoving(true);
    try {
      const { pocket, direction } = moveTarget;
      if (direction === "buy") {
        await dbService.buyGold(pocket.id, num, moveNote.trim() || null);
        showToast(t("gold.buy_success", { name: pocket.name }), "success");
      } else if (direction === "sell") {
        await dbService.sellGold(pocket.id, num, moveNote.trim() || null);
        showToast(t("gold.sell_success", { name: pocket.name }), "success");
      } else if (direction === "manual_add") {
        await dbService.adjustGoldHolding(pocket.id, "add", num, moveNote.trim() || null);
        showToast(t("gold.manual_add_success", { name: pocket.name }), "success");
      } else {
        await dbService.adjustGoldHolding(pocket.id, "remove", num, moveNote.trim() || null);
        showToast(t("gold.manual_remove_success", { name: pocket.name }), "success");
      }
      audioFeedback.playClick();
      closeMoveModal();
      await refresh();
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (msg.includes("PRICE_STALE")) showToast(t("gold.price_stale_error"), "error");
      else if (msg.includes("BUYBACK_PRICE_UNAVAILABLE")) showToast(t("gold.buyback_unavailable_error"), "error");
      else if (msg.includes("PRICE_NOT_AVAILABLE")) showToast(t("gold.price_unavailable_error"), "error");
      else if (msg.includes("INSUFFICIENT_GOLD_BALANCE")) showToast(t("gold.insufficient_gold_error"), "error");
      else if (msg.includes("AMOUNT_TOO_SMALL")) showToast(t("gold.amount_too_small_error"), "error");
      else showToast(t("gold.move_error"), "error");
    } finally { setIsMoving(false); }
  };

  // Catatan framing (Opsi A - lihat diskusi produk): "buy"/"sell" adalah
  // SIMULASI pencatatan pribadi berbasis harga acuan (sumber + margin
  // aplikasi), BUKAN eksekusi transaksi ke toko emas riil. `button` untuk
  // kedua arah ini sengaja pakai key `_button_confirm` yang eksplisit
  // menyebut "Simulasi" (beda dari label tombol pendek di kartu depan,
  // "Beli"/"Jual", yang ruangnya terlalu sempit untuk teks itu) -- supaya
  // titik keputusan terakhir sebelum saldo terpotong/bertambah tetap jujur
  // soal sifat simulatifnya. `isSimulated` dipakai renderer modal untuk
  // menampilkan disclaimer tambahan (lihat sim_disclaimer_title/text) yang
  // TIDAK relevan untuk manual_add/manual_remove karena dua arah itu murni
  // pencatatan kepemilikan fisik, tidak menyentuh harga acuan app sama sekali.
  const moveModalCopy: Record<MoveDirection, { title: string; desc: string; button: string; barClass: string; buttonVariant: "primary" | "secondary" | "danger" | "danger-ghost" | "success" | "ghost"; isSimulated: boolean }> = {
    buy: { title: "gold.buy_title", desc: "gold.buy_desc", button: "gold.buy_button_confirm", barClass: "bg-emerald-500", buttonVariant: "success", isSimulated: true },
    sell: { title: "gold.sell_title", desc: "gold.sell_desc", button: "gold.sell_button_confirm", barClass: "bg-indigo-500", buttonVariant: "primary", isSimulated: true },
    manual_add: { title: "gold.manual_add_title", desc: "gold.manual_add_desc", button: "gold.manual_add_button", barClass: "bg-sky-500", buttonVariant: "primary", isSimulated: false },
    manual_remove: { title: "gold.manual_remove_title", desc: "gold.manual_remove_desc", button: "gold.manual_remove_button", barClass: "bg-amber-500", buttonVariant: "danger", isSimulated: false },
  };

  const renderPocketCard = (p: GoldPocket) => {
    const price = priceByBrand.get(p.brand);
    // Sama seperti get_gold_holdings_summary di database: kalau buyback
    // belum tersedia, estimasi pakai harga jual (lebih dekat ke kenyataan
    // daripada 0, yang sebelumnya bikin kartu ini menampilkan "Rp0" padahal
    // di kartu ringkasan atas sudah benar karena RPC-nya sudah fallback).
    const effectivePricePerGram = price?.buyback_price_per_gram ?? price?.sell_price_per_gram ?? null;
    const isEstimated = !!price && price.buyback_price_per_gram == null && price.sell_price_per_gram != null;
    const marketValue = effectivePricePerGram != null ? p.grams_owned * effectivePricePerGram : null;
    const gainLoss = marketValue != null ? marketValue - p.cash_locked_amount : null;
    const isFlipped = flippedIds.has(p.id);

    return (
      <motion.div key={p.id} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} className={isFlipped ? "relative z-50" : "relative"}>
        {/* Tinggi kartu SENGAJA tidak di-fix (dulu h-48 tetap) -- kartu jadi
            "min-height" saja dan boleh tumbuh mengikuti konten (nominal
            untung/rugi, catatan, dsb). Sisi depan tetap di alur normal
            (bukan absolute) supaya tingginya menentukan tinggi wrapper;
            sisi belakang absolute inset-0 mengikuti tinggi itu. Ini supaya
            teks nominal yang panjang tidak pernah terpotong / bertabrakan
            dengan elemen lain, apa pun panjang angkanya. */}
        <div className="[perspective:1200px]">
          <div
            className={`relative w-full min-h-48 transition-transform duration-500 [transform-style:preserve-3d] rounded-2xl ${isFlipped ? "[transform:rotateY(180deg)]" : ""}`}
          >
            {/* ===== SISI DEPAN: kartu emas fisik (tap untuk buka aksi) =====
                pointer-events-none saat isFlipped: backface-visibility:hidden
                SAJA tidak cukup di beberapa browser mobile -- elemen yang
                "tersembunyi" secara visual kadang masih ke-hit-test dan
                mencegat tap yang seharusnya kena tombol di sisi belakang. */}
            <div
              role="button"
              tabIndex={isFlipped ? -1 : 0}
              aria-label={t("gold.card_show_actions")}
              onClick={() => !isFlipped && toggleFlip(p.id)}
              onKeyDown={(e) => { if (!isFlipped && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggleFlip(p.id); } }}
              className={`relative w-full min-h-48 rounded-2xl p-3.5 flex flex-col justify-between gap-2 [backface-visibility:hidden] shadow-lg gold-card-shine cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${p.is_archived ? "is-archived" : ""} ${isFlipped ? "pointer-events-none" : ""}`}
            >
              <div className="relative z-[1] flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-sans font-bold text-[clamp(0.7313rem,3.38vw,0.8125rem)] text-amber-950 truncate">{p.name}</p>
                  <p className="text-[clamp(0.4781rem,2.21vw,0.5312rem)] font-bold uppercase tracking-wide text-amber-900/70">{t(`gold.brand_${p.brand}`)}</p>
                </div>
                {p.is_archived && (
                  <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-md text-[clamp(0.45rem,2.08vw,0.5rem)] font-bold bg-black/20 text-white">
                    {t("gold.archived_badge")}
                  </span>
                )}
              </div>

              <div className="relative z-[1]">
                <p className="font-black text-[clamp(1.2375rem,5.72vw,1.375rem)] leading-none text-amber-950 tracking-tight">{formatGrams(p.grams_owned)}</p>
                {p.notes && <p className="text-[clamp(0.5062rem,2.34vw,0.5625rem)] text-amber-900/70 italic truncate mt-1">{p.notes}</p>}
              </div>

              {/* Nominal nilai pasar & badge untung/rugi ditumpuk VERTIKAL
                  (bukan bersebelahan seperti sebelumnya) supaya keduanya
                  tidak pernah berebut ruang horizontal di kartu yang
                  sempit -- itulah penyebab teks yang tadinya bertabrakan/
                  saling tumpang tindih. */}
              <div className="relative z-[1] flex flex-col gap-1">
                <p className="text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold font-mono text-amber-950 leading-tight tabular-nums tracking-tight break-words">
                  {marketValue != null ? formatIDR(marketValue) : t("gold.price_unavailable_short")}
                </p>
                {isEstimated && <p className="text-[clamp(0.45rem,2.08vw,0.5rem)] text-amber-900/60 leading-snug">{t("gold.est_from_sell_price_note")}</p>}
                {p.cash_locked_amount === 0 && p.grams_owned > 0 && (
                  <p className="text-[clamp(0.45rem,2.08vw,0.5rem)] text-amber-900/60 leading-snug">{t("gold.no_cost_basis_note")}</p>
                )}
                {gainLoss != null && p.grams_owned > 0 && p.cash_locked_amount > 0 && (
                  <span className={`relative self-start inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[clamp(0.5344rem,2.47vw,0.5938rem)] font-bold font-mono tabular-nums ${gainLoss >= 0 ? "bg-black/15 text-emerald-950" : "bg-black/25 text-red-950"}`}>
                    {gainLoss >= 0 ? "▲" : "▼"} {formatIDR(Math.abs(gainLoss))}
                    <span onClick={(e) => e.stopPropagation()} className="text-black/50">
                      <InfoTooltip text={t("gold.unrealized_tooltip")} align="left" />
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* ===== SISI BELAKANG: aksi -- kartu sendiri TIDAK menutup kalau
                diketuk (dulu susah kena karena grid tombolnya padat). Tutup
                dilakukan lewat backdrop tak-terlihat yang menutupi seluruh
                halaman DI LUAR kartu (lihat render backdrop di bawah), atau
                tombol Escape. z-50 di wrapper motion.div (atas) memastikan
                kartu ini tetap di atas backdrop selama terbuka. */}
            <div
              onKeyDown={(e) => { if (e.key === "Escape") { toggleFlip(p.id); } }}
              className={cx(
                "absolute inset-0 rounded-2xl p-2.5 [backface-visibility:hidden] [transform:rotateY(180deg)] border shadow-lg",
                tokens.surface.card,
                tokens.border.accent,
                !isFlipped && "pointer-events-none"
              )}
            >
              <div className="grid grid-cols-2 gap-1.5 h-full content-center">
                <button onClick={(e) => { e.stopPropagation(); openMove(p, "buy"); }} disabled={busyId === p.id || p.is_archived} tabIndex={isFlipped ? 0 : -1}
                  className="flex items-center justify-center gap-1 py-2 rounded-xl text-[clamp(0.5906rem,2.73vw,0.6562rem)] font-semibold transition-colors cursor-pointer disabled:opacity-50 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25">
                  <ArrowDownCircle size={12} /> {t("gold.buy_button")}
                </button>
                <button onClick={(e) => { e.stopPropagation(); openMove(p, "sell"); }} disabled={busyId === p.id || p.is_archived || p.grams_owned <= 0 || !price?.buyback_price_per_gram} tabIndex={isFlipped ? 0 : -1}
                  title={!price?.buyback_price_per_gram ? t("gold.buyback_unavailable_hint") : undefined}
                  className={cx(
                    "flex items-center justify-center gap-1 py-2 rounded-xl text-[clamp(0.5906rem,2.73vw,0.6562rem)] font-semibold transition-colors cursor-pointer disabled:opacity-50",
                    tokens.gold.actionBtnBg,
                    tokens.text.accent
                  )}
                >
                  <ArrowUpCircle size={12} /> {t("gold.sell_button")}
                </button>
                <button onClick={(e) => { e.stopPropagation(); openMove(p, "manual_add"); }} disabled={busyId === p.id || p.is_archived} tabIndex={isFlipped ? 0 : -1}
                  className="flex items-center justify-center gap-1 py-2 rounded-xl text-[clamp(0.5906rem,2.73vw,0.6562rem)] font-semibold transition-colors cursor-pointer disabled:opacity-50 bg-sky-500/15 text-sky-400 hover:bg-sky-500/25">
                  <PackagePlus size={12} /> {t("gold.manual_add_button_short")}
                </button>
                <button onClick={(e) => { e.stopPropagation(); openMove(p, "manual_remove"); }} disabled={busyId === p.id || p.is_archived || p.grams_owned <= 0} tabIndex={isFlipped ? 0 : -1}
                  className="flex items-center justify-center gap-1 py-2 rounded-xl text-[clamp(0.5906rem,2.73vw,0.6562rem)] font-semibold transition-colors cursor-pointer disabled:opacity-50 bg-slate-700/40 text-slate-400 hover:bg-slate-700/60">
                  <PackageMinus size={12} /> {t("gold.manual_remove_button_short")}
                </button>
                <button onClick={(e) => { e.stopPropagation(); audioFeedback.playClick(); openEditForm(p); }} tabIndex={isFlipped ? 0 : -1}
                  className={cx("flex items-center justify-center gap-1 py-2 rounded-xl text-[clamp(0.5906rem,2.73vw,0.6562rem)] font-semibold transition-colors cursor-pointer", tokens.gold.editBtnBg, tokens.text.label)}>
                  <Edit2 size={12} /> {t("common.edit")}
                </button>
                <button onClick={(e) => { e.stopPropagation(); toggleArchive(p); }} disabled={busyId === p.id} tabIndex={isFlipped ? 0 : -1}
                  className="flex items-center justify-center gap-1 py-2 rounded-xl text-[clamp(0.5906rem,2.73vw,0.6562rem)] font-semibold transition-colors cursor-pointer disabled:opacity-50 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20">
                  {p.is_archived ? <ArchiveRestore size={12} /> : <Archive size={12} />} {t(p.is_archived ? "gold.unarchive_button" : "gold.archive_button")}
                </button>
                <button onClick={(e) => { e.stopPropagation(); audioFeedback.playClick(); setDeleteTarget(p); }} tabIndex={isFlipped ? 0 : -1}
                  className={cx(
                    "col-span-2 flex items-center justify-center gap-1 py-2 rounded-xl text-[clamp(0.5906rem,2.73vw,0.6562rem)] font-semibold transition-colors cursor-pointer",
                    tokens.gold.deleteBtnBg,
                    tokens.text.danger
                  )}
                >
                  <Trash2 size={12} /> {t("common.delete")}
                </button>
              </div>
            </div>
          </div>
        </div>
        <p className="text-center text-[clamp(0.5062rem,2.34vw,0.5625rem)] text-slate-500 mt-1.5 select-none">
          {t(isFlipped ? "gold.card_tap_hint_front" : "gold.card_tap_hint_actions")}
        </p>
      </motion.div>
    );
  };

  const copy = moveTarget ? moveModalCopy[moveTarget.direction] : null;
  const isGramInput = moveTarget?.direction === "sell" || moveTarget?.direction === "manual_add" || moveTarget?.direction === "manual_remove";

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">

      {/* Backdrop tak-terlihat -- muncul begitu ada kartu emas yang terbuka
          (flippedIds tidak kosong), menutupi SELURUH halaman ini. Kartu yang
          sedang terbuka dinaikkan ke z-50 (lihat renderPocketCard) supaya
          tetap di atas backdrop & tetap bisa diklik normal; ngetuk di luar
          kartu (di mana saja) kena backdrop ini dan menutup semua kartu. */}
      {flippedIds.size > 0 && (
        <div
          className="fixed inset-0 z-40 cursor-default"
          aria-hidden="true"
          onClick={() => setFlippedIds(new Set())}
        />
      )}

      {/* Perbaikan prioritas 1 (AUDIT-konsistensi-komponen.md): migrasi dari
          div manual ke <Card elevation="lg" padding="none"> supaya shadow
          elevation-nya diatur terpusat lewat primitive. */}
      <div className="relative flow-root">
        <Card elevation="lg" padding="none" className="relative z-10 mt-24 sm:mt-28 overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500" />
        <div className="p-6 md:p-8 space-y-6">

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className={cx("font-sans font-bold text-2xl tracking-tight", tokens.text.primary)}>
                {t("gold.page_title")}
              </h1>
              <p className={cx("text-sm mt-1 leading-relaxed", tokens.text.muted)}>
                {t("gold.page_subtitle")}
              </p>
            </div>
            <button onClick={() => { audioFeedback.playClick(); openAddForm(); }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors shadow-lg shadow-amber-500/20 shrink-0 cursor-pointer">
              <Plus size={16} /> {t("gold.add_button")}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className={cx("rounded-2xl px-3 py-3", tokens.gold.statGramsBgBorder)}>
              <span className="text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider text-slate-500 block mb-1">{t("gold.stat_total_grams")}</span>
              <p className={cx("font-bold text-sm sm:text-lg leading-tight whitespace-nowrap tabular-nums tracking-tight", tokens.text.warning)}>{formatGrams(summary.total_grams)}</p>
            </div>
            <div className={cx("rounded-2xl px-3 py-3", tokens.gold.statValBgBorder)}>
              <span className="text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider text-slate-500 block mb-1">{t("gold.stat_market_value")}</span>
              <p className={cx("font-bold font-mono text-sm sm:text-lg leading-tight whitespace-nowrap tabular-nums tracking-tight", tokens.text.accentStrong)}>{formatIDR(summary.total_market_value)}</p>
              {/* Footnote "estimasi" -- nilai ini dihitung dari harga acuan
                  (sumber + margin app), bukan harga jual resmi yang bisa
                  langsung dieksekusi ke toko. Lihat sim_disclaimer_* untuk
                  penjelasan lebih lengkap di modal beli/jual. */}
              <p className="text-[clamp(0.45rem,2.08vw,0.5rem)] text-slate-500 mt-0.5 leading-snug">{t("gold.stat_market_value_note")}</p>
            </div>
            <div className={cx("rounded-2xl px-3 py-3 border", tokens.surface.subtle, tokens.border.strong)}>
              <span className="text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider text-slate-500 block mb-1">{t("gold.stat_cash_locked")}</span>
              <p className={cx("font-bold font-mono text-sm sm:text-lg leading-tight whitespace-nowrap tabular-nums tracking-tight", tokens.text.secondary)}>{formatIDR(summary.total_cash_locked)}</p>
              {/* Sejak migration 20260814000000_decouple_gold_simulation_from_balance.sql,
                  angka ini TIDAK LAGI berarti "uang yang terpotong dari
                  Saldo Tersedia" -- murni basis hitung Untung/Rugi. Footnote
                  ini penting supaya label kartu (yang dulu "Saldo Terpotong")
                  tidak menyesatkan lagi soal efeknya ke saldo riil. */}
              <p className="text-[clamp(0.45rem,2.08vw,0.5rem)] text-slate-500 mt-0.5 leading-snug">{t("gold.stat_cash_locked_note")}</p>
            </div>
            <div className={cx("rounded-2xl border px-3 py-3", summary.unrealized_gain_loss >= 0 ? tokens.gold.gainBgBorder : tokens.gold.lossBgBorder)}>
              <span className="text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider text-slate-500 block mb-1">{t("gold.stat_gain_loss")}</span>
              <p className={cx(
                "font-bold font-mono text-sm sm:text-lg leading-tight whitespace-nowrap tabular-nums tracking-tight",
                summary.unrealized_gain_loss >= 0 ? tokens.text.success : tokens.text.danger
              )}>
                {summary.unrealized_gain_loss >= 0 ? "+" : ""}{formatIDR(summary.unrealized_gain_loss)}
              </p>
            </div>
          </div>

          {summary.stale_pocket_count > 0 && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
              <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[clamp(0.6188rem,2.86vw,0.6875rem)] leading-relaxed text-amber-300">{t("gold.stale_price_warning")}</p>
            </div>
          )}

          <div className={cx("flex items-start gap-2.5 rounded-2xl border px-4 py-3", tokens.gold.infoBannerBgBorder)}>
            <Info size={14} className={cx("shrink-0 mt-0.5", tokens.text.accent)} />
            <p className={cx("text-[clamp(0.6188rem,2.86vw,0.6875rem)] leading-relaxed", tokens.text.mutedAlt)}>{t("gold.info_banner_text")}</p>
          </div>

          {/* Ticker harga pasar -- auto-scroll (Konsep D), berhenti sebentar
              saat di-hover/di-tap supaya masih bisa dibaca kalau perlu.
              Konten di-duplikasi 2x supaya loop-nya mulus (lihat .gold-marquee-track). */}
          {prices.length > 0 && (
            <div className="space-y-2">
              <p className={cx("text-[clamp(0.5906rem,2.73vw,0.6562rem)] font-semibold px-1", tokens.text.faint)}>
                {t(priceDatesMismatch ? "gold.prices_updated_mismatch" : "gold.prices_updated_as_of", {
                  date: formatPriceDateLong(latestPriceDate as string, locale),
                })}
              </p>
              <div className={cx("gold-marquee-viewport overflow-hidden rounded-xl border py-2", tokens.surface.sunken, tokens.border.default)}>
                <div className="gold-marquee-track">
                  {[...prices, ...prices].map((pr, idx) => {
                    const isStaleVsOthers = priceDatesMismatch && pr.price_date !== latestPriceDate;
                    return (
                      <div
                        key={`${pr.brand}-${idx}`}
                        title={isStaleVsOthers ? t("gold.price_stale_brand_hint") : undefined}
                        className={cx(
                          "shrink-0 px-4 py-0.5 border-r",
                          tokens.border.default,
                          isStaleVsOthers ? "bg-amber-500/5" : ""
                        )}
                      >
                        <p className="text-[clamp(0.5062rem,2.34vw,0.5625rem)] font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">{t(`gold.brand_${pr.brand}`)}</p>
                        <p className={cx("text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-bold font-mono tabular-nums flex items-center gap-1 whitespace-nowrap", tokens.text.warning)}>
                          {formatIDR(pr.sell_price_per_gram)}
                          {renderPriceDelta(pr.sell_price_per_gram, pr.prev_sell_price_per_gram, t)}
                        </p>
                        <p className="text-[clamp(0.5062rem,2.34vw,0.5625rem)] text-slate-500 font-mono tabular-nums flex items-center gap-1 whitespace-nowrap">
                          {t("gold.buyback_short")} {formatIDR(pr.buyback_price_per_gram)}
                          {renderPriceDelta(pr.buyback_price_per_gram, pr.prev_buyback_price_per_gram, t)}
                          {isStaleVsOthers && <AlertTriangle size={8} className="shrink-0 text-amber-400 ml-0.5" />}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
            </div>
          ) : pocketsError ? (
            <ErrorState onRetry={refresh} />
          ) : pockets.length === 0 ? (
            <EmptyState icon={<Coins size={40} className={cx(tokens.icon.muted)} />} title={t("gold.empty_title")} description={t("gold.empty_desc")} />
          ) : (
            <AnimatePresence>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {activePockets.map(renderPocketCard)}
                {archivedPockets.map(renderPocketCard)}
              </div>
            </AnimatePresence>
          )}
        </div>
        </Card>
      </div>

      {/* Add/Edit pocket form modal */}
      <ModalShell
        isOpen={isFormOpen}
        onClose={closeForm}
        maxWidth="max-w-md"
        labelledBy="gold-form-title"
        className="overflow-hidden"
      >
        <div className="h-1 w-full bg-gradient-to-r from-amber-500 to-yellow-500" />
        <div className="p-6 space-y-4">
          <h2 id="gold-form-title" className={cx("font-sans font-bold text-lg", tokens.text.heading)}>
            {editTarget ? t("gold.edit_title") : t("gold.add_title")}
          </h2>
          <Input
            type="text"
            label={t("gold.form_name")}
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder={t("gold.form_name_placeholder")}
            accent="amber"
          />
          <div>
            <label className="block text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t("gold.form_brand")}</label>
            <DropdownField
              accent="amber"
              value={form.brand}
              disabled={!!editTarget}
              onChange={(v) => setForm(f => ({ ...f, brand: v as GoldBrand }))}
              options={formBrandOptions.map(b => ({ value: b, label: t(`gold.brand_${b}`) }))}
            />
            <p className="text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-500 mt-1.5 leading-relaxed">
              {editTarget ? t("gold.form_brand_locked_hint") : t("gold.form_brand_hint")}
            </p>
          </div>
          <div>
            <label className="block text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t("wallet.label_pos")}</label>
            <DropdownField
              accent="amber"
              value={form.wallet_id}
              onChange={(v) => setForm(f => ({ ...f, wallet_id: v }))}
              options={activeWallets.map((w) => {
                const icon = w.type === "general" ? "" : w.type === "ewallet" ? "" : w.type === "bank" ? "" : "";
                const label = w.type === "general" ? t("wallet.group_general") : `${w.name}${(w.provider && w.provider !== w.name) ? ` · ${w.provider}` : ""}`;
                return { value: w.type === "general" ? "" : w.id, label: `${icon} ${label} (${formatIDR(w.balance)})` };
              })}
            />
          </div>
          <Input
            type="text"
            label={t("gold.form_notes")}
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder={t("gold.form_notes_placeholder")}
            accent="amber"
          />
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={closeForm} className="flex-1 py-3 rounded-2xl font-semibold text-sm">{t("common.cancel")}</Button>
            <Button variant="warning" onClick={handleSave} disabled={isSaving} isLoading={isSaving} className="flex-1 py-3 rounded-2xl font-semibold text-sm">{t("common.save")}</Button>
          </div>
        </div>
      </ModalShell>

      {/* Buy/Sell/Manual adjust modal */}
      <ModalShell
        isOpen={!!(moveTarget && copy)}
        onClose={closeMoveModal}
        maxWidth="max-w-sm"
        labelledBy="gold-move-title"
        className="overflow-hidden"
      >
        {moveTarget && copy && (
          <>
            <div className={`h-1 w-full ${copy.barClass}`} />
            <div className="p-6 space-y-4">
              <div>
                <h2 id="gold-move-title" className={cx("font-sans font-bold text-lg", tokens.text.heading)}>
                  {t(copy.title, { name: moveTarget.pocket.name })}
                </h2>
                <p className="text-xs text-slate-400 mt-1">{t(copy.desc)}</p>
              </div>
              {/* Disclaimer simulasi -- HANYA untuk buy/sell (isSimulated),
                  karena manual_add/manual_remove tidak menyentuh harga
                  acuan app sama sekali (murni catat kepemilikan fisik).
                  Ditaruh di titik keputusan terakhir sebelum saldo
                  berubah, bukan cuma di banner atas halaman, supaya user
                  tidak bisa terlewat membacanya persis sebelum konfirmasi. */}
              {copy.isSimulated && (
                <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-3">
                  <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-bold text-amber-300 leading-relaxed">{t("gold.sim_disclaimer_title")}</p>
                    <p className="text-[clamp(0.5906rem,2.73vw,0.6562rem)] text-amber-300/80 leading-relaxed mt-0.5">{t("gold.sim_disclaimer_text")}</p>
                  </div>
                </div>
              )}
              <div>
                <Input
                  type="number"
                  label={isGramInput ? t("gold.form_grams") : t("gold.form_idr_amount")}
                  value={moveValue}
                  onChange={e => setMoveValue(e.target.value)}
                  placeholder={isGramInput ? t("gold.form_grams_placeholder") : t("gold.form_idr_amount_placeholder")}
                  min={0}
                  step={isGramInput ? "0.0001" : "1000"}
                  autoFocus
                  accent="amber"
                />
                {(moveTarget.direction === "sell" || moveTarget.direction === "manual_remove") && (
                  <p className="text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-500 mt-1.5">{t("gold.owned_grams_hint", { amount: formatGrams(moveTarget.pocket.grams_owned) })}</p>
                )}
              </div>
              <Input
                type="text"
                label={t("gold.form_entry_note")}
                value={moveNote}
                onChange={e => setMoveNote(e.target.value)}
                accent="amber"
              />
              <div className="flex gap-3 pt-1">
                <Button variant="secondary" onClick={closeMoveModal} className="flex-1 py-3 rounded-2xl font-semibold text-sm">{t("common.cancel")}</Button>
                <Button variant={copy.buttonVariant} onClick={executeMove} disabled={isMoving} isLoading={isMoving} className="flex-1 py-3 rounded-2xl font-semibold text-sm">
                  {t(copy.button)}
                </Button>
              </div>
            </div>
          </>
        )}
      </ModalShell>

      <Modal isOpen={!!deleteTarget} title={t("gold.delete_confirm_title")} description={t("gold.delete_confirm_desc", { name: deleteTarget?.name ?? "" })} type="danger" confirmLabel={t("common.delete")} cancelLabel={t("common.cancel")} onConfirm={handleDeleteConfirmed} onCancel={() => setDeleteTarget(null)} confirmDisabled={isDeleting} />
    </motion.div>
  );
};