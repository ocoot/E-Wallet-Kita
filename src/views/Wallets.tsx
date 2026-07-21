import React, { useState } from "react";
import { motion } from "motion/react";
import { Plus, Pencil, Trash2, History as HistoryIcon, Wallet as WalletIcon, Eye, EyeOff, Phone, CreditCard } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useWallets } from "../hooks/useWallets";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { dbService } from "../lib/db";
import { WalletType, WalletWithBalance } from "../types";
import { useNavigate } from "react-router-dom";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { WalletPickerField } from "../components/WalletPickerField";
import { ProviderBadge } from "../components/ProviderBadge";
import { Modal } from "../components/Modal";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { AnimatedNumber } from "../components/ui/AnimatedNumber";
import { Card } from "../components/ui/Card";
import { PageRibbonBackground } from "../components/PageRibbonBackground";
import { PROVIDER_CATALOG, OTHER_PROVIDER_ID } from "../data/walletProviders";

const GROUP_META: Record<Exclude<WalletType, "general">, { icon: string; labelKey: string; addKey: string; placeholderKey: string }> = {
  ewallet: { icon: "", labelKey: "wallet.group_ewallet", addKey: "wallet.add_wallet", placeholderKey: "wallet.field_name_placeholder_ewallet" },
  bank: { icon: "", labelKey: "wallet.group_bank", addKey: "wallet.add_bank", placeholderKey: "wallet.field_name_placeholder_bank" },
  cash: { icon: "", labelKey: "wallet.group_cash", addKey: "wallet.add_cash", placeholderKey: "wallet.field_name_placeholder_cash" },
};

const formatIDR = (n: number) => "Rp\u00A0" + Math.round(n || 0).toLocaleString("id-ID");

/** Sembunyikan sebagian besar digit, sisakan 4 karakter terakhir terlihat -- mis. "••• 6789". */
const maskContact = (value: string) => {
  const digits = value.trim();
  if (digits.length <= 4) return "•".repeat(Math.max(digits.length, 3));
  return "•".repeat(digits.length - 4) + " " + digits.slice(-4);
};

/** Untuk kolom nomor HP (e-wallet) -- keyboard numerik ala dial-pad (boleh +). */
const CONTACT_KEYBOARD_PROPS_PHONE = { type: "tel" as const, inputMode: "tel" as const };
/** Untuk kolom nomor rekening (bank) -- keyboard numerik murni digit, tanpa plus/bintang/pagar. */
const CONTACT_KEYBOARD_PROPS_ACCOUNT = { type: "text" as const, inputMode: "numeric" as const, pattern: "[0-9]*" };

interface WalletCardProps {
  wallet: WalletWithBalance;
  cardSurfaceClass: string;
  editingContactId: string | null;
  contactInput: string;
  setContactInput: (v: string) => void;
  setEditingContactId: (id: string | null) => void;
  editingBalanceId: string | null;
  balanceInput: number | "";
  setBalanceInput: (v: number | "") => void;
  setEditingBalanceId: (id: string | null) => void;
  visibleContactIds: Set<string>;
  toggleContactVisibility: (id: string) => void;
  busy: boolean;
  setWalletToDelete: (w: WalletWithBalance | null) => void;
  handleSaveContact: (wallet: WalletWithBalance) => void;
  handleSaveBalance: (walletId: string) => void;
}

/**
 * Sengaja dipindah jadi komponen top-level (BUKAN didefinisikan di dalam body
 * `Wallets`). Sebelumnya `WalletCard` dibuat ulang sebagai fungsi baru setiap
 * kali `Wallets` re-render (mis. tiap ketikan 1 huruf/angka di kolom nomor
 * HP/rekening memicu re-render lewat `setContactInput`). Karena identitas
 * tipe komponennya berubah tiap render, React membongkar-pasang ULANG semua
 * kartu pos dompet dari nol -- termasuk memutar ulang animasi masuk
 * `motion.div` (`initial opacity:0 -> animate opacity:1`) setiap kartu --
 * itulah "layar berkedip" yang dilaporkan tiap kali mengetik satu karakter.
 * Dengan `WalletCard` jadi komponen stabil di luar, React cukup
 * memperbarui DOM yang berubah saja, tanpa remount/replay animasi.
 */
const WalletCard: React.FC<WalletCardProps> = ({
  wallet,
  cardSurfaceClass,
  editingContactId,
  contactInput,
  setContactInput,
  setEditingContactId,
  editingBalanceId,
  balanceInput,
  setBalanceInput,
  setEditingBalanceId,
  visibleContactIds,
  toggleContactVisibility,
  busy,
  setWalletToDelete,
  handleSaveContact,
  handleSaveBalance,
}) => {
  const { t } = useLanguage();
  const { tokens, cx } = useThemeTokens();
  const navigate = useNavigate();

  const isGeneral = wallet.type === "general";
  const contactValue = wallet.type === "ewallet" ? wallet.phone_number : wallet.type === "bank" ? wallet.account_number : null;
  const contactLabel = wallet.type === "ewallet" ? t("wallet.field_phone") : t("wallet.field_account_number");
  const canHaveContact = wallet.type === "ewallet" || wallet.type === "bank";
  const isContactVisible = visibleContactIds.has(wallet.id);
  // Keyboard numerik yang sesuai: dial-pad ber-"+" utk nomor HP, digit murni
  // utk nomor rekening -- lihat gambar referensi "Use The Right Keyboard".
  const contactKeyboardProps = wallet.type === "ewallet" ? CONTACT_KEYBOARD_PROPS_PHONE : CONTACT_KEYBOARD_PROPS_ACCOUNT;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cx(
        "rounded-2xl border p-4 space-y-3",
        isGeneral
          ? cx(tokens.surface.sunken, tokens.border.accent)
          : cardSurfaceClass
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex items-center gap-2.5">
          {!isGeneral && (wallet.type === "ewallet" || wallet.type === "bank") && (
            <ProviderBadge type={wallet.type} provider={wallet.provider} size={32} />
          )}
          <div className="min-w-0">
            <p className={cx("font-sans font-bold text-sm truncate", tokens.text.primary)}>{wallet.name}</p>
            {wallet.provider && wallet.provider !== wallet.name && (
              <p className={cx("font-sans text-[clamp(0.6188rem,2.86vw,0.6875rem)] truncate", tokens.text.muted)}>{wallet.provider}</p>
            )}
          </div>
        </div>
        <button
          onClick={() => setWalletToDelete(wallet)}
          title={t("wallet.delete_wallet")}
          disabled={isGeneral}
          className={cx("p-1.5 rounded-lg hover:bg-red-500/15 cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed shrink-0", tokens.text.danger)}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Nomor HP (e-wallet) / Nomor Rekening (bank) -- bisa disembunyikan */}
      {canHaveContact && (
        editingContactId === wallet.id ? (
          <div className="space-y-2">
            <Input
              size="compact"
              autoFocus
              value={contactInput}
              onChange={(e) => setContactInput(e.target.value)}
              placeholder={contactLabel}
              {...contactKeyboardProps}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => handleSaveContact(wallet)}
                disabled={busy}
                className="flex-1 py-1.5 rounded-lg text-xs"
              >
                {t("common.save")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setEditingContactId(null)}
                className="flex-1 py-1.5 rounded-lg text-xs"
              >
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setEditingContactId(wallet.id); setContactInput(contactValue || ""); }}
            className={cx("flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-lg cursor-pointer group", tokens.surface.sunken, tokens.hover.surface)}
          >
            {wallet.type === "ewallet" ? <Phone size={12} className="text-slate-500 shrink-0" /> : <CreditCard size={12} className="text-slate-500 shrink-0" />}
            <span className={cx("font-sans text-[clamp(0.6188rem,2.86vw,0.6875rem)] tabular-nums truncate group-hover:text-slate-300", tokens.text.muted)}>
              {contactValue
                ? (isContactVisible ? contactValue : maskContact(contactValue))
                : `+ ${contactLabel}`}
            </span>
            {contactValue && (
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); toggleContactVisibility(wallet.id); }}
                className="ml-auto p-1 rounded text-slate-500 hover:text-white cursor-pointer shrink-0"
              >
                {isContactVisible ? <EyeOff size={12} /> : <Eye size={12} />}
              </span>
            )}
          </button>
        )
      )}

      {editingBalanceId === wallet.id ? (
        <div className="space-y-2">
          <Input
            size="compact"
            type="number"
            inputMode="decimal"
            autoFocus
            value={balanceInput}
            onChange={(e) => setBalanceInput(e.target.value === "" ? "" : Number(e.target.value))}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => handleSaveBalance(wallet.id)}
              disabled={busy}
              className="flex-1 py-1.5 rounded-lg text-xs"
            >
              {t("common.save")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setEditingBalanceId(null)}
              className="flex-1 py-1.5 rounded-lg text-xs"
            >
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className={cx("font-mono font-black text-xl tabular-nums", tokens.text.primary)}>
            <AnimatedNumber value={wallet.balance} format={formatIDR} />
          </p>
          {wallet.earmarked_amount > 0 && (
            <p className="font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] text-amber-400/90 -mt-2">
              {t("wallet.earmarked_note", { earmarked: formatIDR(wallet.earmarked_amount), available: formatIDR(wallet.available_balance) })}
            </p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => { setEditingBalanceId(wallet.id); setBalanceInput(Math.round(wallet.balance)); }}
              className={cx("flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-bold cursor-pointer", tokens.surface.sunken, tokens.hover.surface, tokens.text.label)}
            >
              <Pencil size={11} /> {t("wallet.edit_balance")}
            </button>
            <button
              onClick={() => navigate("/transactions", { state: { filterWalletId: wallet.id } })}
              className={cx("flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-bold cursor-pointer", tokens.surface.sunken, tokens.hover.surface, tokens.text.label)}
            >
              <HistoryIcon size={11} /> {t("wallet.view_history")}
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
};

export const Wallets: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { wallets, activeWallets, isLoading, error: walletsError, refresh } = useWallets();
  const navigate = useNavigate();
  const { tokens, cx } = useThemeTokens();
  // Border/opacity kombinasi ini (/60, /40) spesifik untuk halaman ini --
  // dipakai 2x di bawah (kartu wallet biasa & wrapper utama). Bukan token
  // global karena opacity-nya beda dari tokens.border.default/accent.
  const cardSurfaceClass = cx(tokens.surface.card, tokens.border.accent);

  const [busy, setBusy] = useState(false);
  const [creatingType, setCreatingType] = useState<Exclude<WalletType, "general"> | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [newStartBalance, setNewStartBalance] = useState<number | "">("");
  const [newContact, setNewContact] = useState("");
  const [editingBalanceId, setEditingBalanceId] = useState<string | null>(null);
  const [balanceInput, setBalanceInput] = useState<number | "">("");
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactInput, setContactInput] = useState("");
  const [visibleContactIds, setVisibleContactIds] = useState<Set<string>>(new Set());
  const [walletToDelete, setWalletToDelete] = useState<WalletWithBalance | null>(null);

  const openCreateForm = (type: Exclude<WalletType, "general">) => {
    setCreatingType(type);
    setSelectedProviderId("");
    setNewName("");
    setNewStartBalance("");
    setNewContact("");
  };

  const toggleContactVisibility = (walletId: string) => {
    setVisibleContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(walletId)) next.delete(walletId); else next.add(walletId);
      return next;
    });
  };

  const generalWallet = wallets.find((w) => w.type === "general") || null;
  const totalBalance = activeWallets.reduce((sum, w) => sum + w.balance, 0);

  const grouped = (type: Exclude<WalletType, "general">) =>
    activeWallets.filter((w) => w.type === type);

  const isCatalogType = (type: Exclude<WalletType, "general">): type is "ewallet" | "bank" => type === "ewallet" || type === "bank";

  /** Provider dari katalog yang sedang dipilih di dropdown (kalau bukan "Lainnya"/cash). */
  const selectedCatalogProvider = (type: Exclude<WalletType, "general">) =>
    isCatalogType(type) ? PROVIDER_CATALOG[type].find((p) => p.id === selectedProviderId) || null : null;

  const isOtherSelected = (type: Exclude<WalletType, "general">) =>
    isCatalogType(type) && (selectedProviderId === OTHER_PROVIDER_ID || (!!selectedProviderId && !selectedCatalogProvider(type)));

  const isFormValid = (type: Exclude<WalletType, "general">) => {
    if (!isCatalogType(type)) return !!newName.trim();
    if (!selectedProviderId) return false;
    if (isOtherSelected(type)) return !!newName.trim();
    return true;
  };

  const handleCreateWallet = async (type: Exclude<WalletType, "general">) => {
    if (!user?.id || !isFormValid(type)) return;
    setBusy(true);
    try {
      const catalogMatch = selectedCatalogProvider(type);
      const finalName = isCatalogType(type) ? (catalogMatch ? catalogMatch.name : newName.trim()) : newName.trim();
      const finalProvider = catalogMatch ? catalogMatch.name : null;
      const phone = type === "ewallet" ? (newContact.trim() || null) : null;
      const account = type === "bank" ? (newContact.trim() || null) : null;
      await dbService.createWallet(user.id, finalName, type, finalProvider, Number(newStartBalance) || 0, phone, account);
      showToast(t("wallet.toast_wallet_created"), "success");
      setCreatingType(null);
      setSelectedProviderId("");
      setNewName("");
      setNewStartBalance("");
      setNewContact("");
      await refresh();
    } catch {
      showToast(t("toast.error_general"), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveContact = async (wallet: WalletWithBalance) => {
    if (!user?.id) return;
    setBusy(true);
    try {
      const trimmed = contactInput.trim();
      if (wallet.type === "ewallet") {
        await dbService.updateWallet(user.id, wallet.id, { phoneNumber: trimmed || null, clearPhoneNumber: !trimmed });
      } else if (wallet.type === "bank") {
        await dbService.updateWallet(user.id, wallet.id, { accountNumber: trimmed || null, clearAccountNumber: !trimmed });
      }
      showToast(t("wallet.toast_wallet_updated"), "success");
      setEditingContactId(null);
      await refresh();
    } catch {
      showToast(t("toast.error_general"), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveBalance = async (walletId: string) => {
    if (!user?.id || balanceInput === "") return;
    setBusy(true);
    try {
      await dbService.setWalletBalance(user.id, walletId, Number(balanceInput));
      showToast(t("wallet.toast_balance_updated"), "success");
      setEditingBalanceId(null);
      await refresh();
    } catch {
      showToast(t("toast.error_general"), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteWallet = async () => {
    if (!user?.id || !walletToDelete) return;
    setBusy(true);
    try {
      await dbService.deleteWallet(user.id, walletToDelete.id);
      showToast(t("wallet.toast_wallet_deleted"), "success");
      setWalletToDelete(null);
      await refresh();
    } catch {
      showToast(t("toast.error_general"), "error");
    } finally {
      setBusy(false);
    }
  };

  // Props yang sama dipakai di semua instance <WalletCard>, di-spread biar
  // tidak mengetik ulang 10+ props di 2 tempat pemanggilan berbeda.
  const walletCardSharedProps = {
    cardSurfaceClass,
    editingContactId,
    contactInput,
    setContactInput,
    setEditingContactId,
    editingBalanceId,
    balanceInput,
    setBalanceInput,
    setEditingBalanceId,
    visibleContactIds,
    toggleContactVisibility,
    busy,
    setWalletToDelete,
    handleSaveContact,
    handleSaveBalance,
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Perbaikan prioritas 1 (AUDIT-konsistensi-komponen.md): migrasi dari
          div manual ke <Card elevation="lg" padding="none"> supaya shadow
          elevation-nya diatur terpusat lewat primitive. */}
      <div className="relative flow-root">
        <PageRibbonBackground />
        <Card elevation="lg" padding="none" className="relative z-10 mt-12 sm:mt-14 overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-600" />
        <div className="p-6 md:p-8 space-y-6">

          {/* Header */}
          <div>
            <h1 className={cx("font-sans font-bold text-2xl tracking-tight flex items-center gap-2", tokens.text.primary)}>
              <WalletIcon size={22} /> {t("wallet.title")}
            </h1>
            <p className={cx("font-sans text-sm mt-1", tokens.text.muted)}>{t("wallet.desc")}</p>
          </div>

          {/* Total banner */}
          <div className={cx("rounded-2xl border px-5 py-4", tokens.surface.sunken, tokens.border.accent)}>
            <p className={cx("font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-widest", tokens.text.muted)}>
              {t("wallet.total_balance")}
            </p>
            <p className={cx("font-mono font-black text-3xl tabular-nums mt-1", tokens.text.primary)}>
              <AnimatedNumber value={totalBalance} format={formatIDR} />
            </p>
          </div>

          {/* General wallet (Saldo Total) */}
          {generalWallet && (
            <div className="space-y-2">
              <h2 className={cx("font-sans text-xs font-bold uppercase tracking-wider", tokens.text.label)}>
                {t("wallet.group_general")}
              </h2>
              <p className={cx("font-sans text-[clamp(0.6188rem,2.86vw,0.6875rem)] -mt-1", tokens.text.faint)}>{t("wallet.general_desc")}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <WalletCard wallet={generalWallet} {...walletCardSharedProps} />
              </div>
            </div>
          )}

          {/* E-Wallet / Bank / Cash groups */}
          {(["ewallet", "bank", "cash"] as const).map((type) => {
            const meta = GROUP_META[type];
            const items = grouped(type);
            return (
              <div key={type} className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className={cx("font-sans text-xs font-bold uppercase tracking-wider flex items-center gap-1.5", tokens.text.label)}>
                    <span>{meta.icon}</span> {t(meta.labelKey)}
                  </h2>
                  <button
                    onClick={() => openCreateForm(type)}
                    className={cx("flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-bold cursor-pointer", tokens.surface.sunken, tokens.hover.surface, tokens.text.accent)}
                  >
                    <Plus size={12} /> {t(meta.addKey)}
                  </button>
                </div>

                {creatingType === type && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className={cx("rounded-2xl border p-4 space-y-3", tokens.surface.sunken, tokens.border.accent)}
                  >
                    {isCatalogType(type) ? (
                      <>
                        <div>
                          <label className={cx("text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-bold uppercase block mb-1", tokens.text.muted)}>
                            {t("wallet.field_provider")}
                          </label>
                          <WalletPickerField
                            options={[
                              ...PROVIDER_CATALOG[type].map((p) => ({ value: p.id, label: p.name })),
                              { value: OTHER_PROVIDER_ID, label: t("wallet.provider_other") },
                            ]}
                            value={selectedProviderId}
                            onChange={(v) => {
                              setSelectedProviderId(v);
                              const match = PROVIDER_CATALOG[type].find((p) => p.id === v);
                              setNewName(match ? match.name : "");
                            }}
                            placeholder={t("wallet.field_provider_placeholder")}
                          />
                        </div>
                        {isOtherSelected(type) && (
                          <div>
                            <label className={cx("text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-bold uppercase block mb-1", tokens.text.muted)}>
                              {t("wallet.field_name")}
                            </label>
                            <Input
                              size="compact"
                              autoFocus
                              value={newName}
                              onChange={(e) => setNewName(e.target.value)}
                              placeholder={t(meta.placeholderKey)}
                            />
                          </div>
                        )}
                      </>
                    ) : (
                      <div>
                        <label className={cx("text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-bold uppercase block mb-1", tokens.text.muted)}>
                          {t("wallet.field_name")}
                        </label>
                        <Input
                          size="compact"
                          autoFocus
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder={t(meta.placeholderKey)}
                        />
                      </div>
                    )}
                    <div>
                      <label className={cx("text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-bold uppercase block mb-1", tokens.text.muted)}>
                        {t("wallet.field_starting_balance")}
                      </label>
                      <Input
                        size="compact"
                        type="number"
                        inputMode="decimal"
                        value={newStartBalance}
                        onChange={(e) => setNewStartBalance(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder="0"
                      />
                    </div>
                    {isCatalogType(type) && (
                      <div>
                        <label className={cx("text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-bold uppercase block mb-1", tokens.text.muted)}>
                          {type === "ewallet" ? t("wallet.field_phone") : t("wallet.field_account_number")}
                        </label>
                        <Input
                          size="compact"
                          value={newContact}
                          onChange={(e) => setNewContact(e.target.value)}
                          placeholder={type === "ewallet" ? "08xxxxxxxxxx" : "1234567890"}
                          {...(type === "ewallet" ? CONTACT_KEYBOARD_PROPS_PHONE : CONTACT_KEYBOARD_PROPS_ACCOUNT)}
                        />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleCreateWallet(type)}
                        disabled={busy || !isFormValid(type)}
                        className="flex-1 py-2 rounded-xl text-xs"
                      >
                        {t("wallet.btn_save_wallet")}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setCreatingType(null)}
                        className="flex-1 py-2 rounded-xl text-xs"
                      >
                        {t("wallet.btn_cancel")}
                      </Button>
                    </div>
                  </motion.div>
                )}

                {items.length === 0 ? (
                  <p className="font-sans text-xs text-slate-500 italic px-1">{t("wallet.empty_group")}</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {items.map((w) => <WalletCard key={w.id} wallet={w} {...walletCardSharedProps} />)}
                  </div>
                )}
              </div>
            );
          })}

          {!isLoading && walletsError && <ErrorState onRetry={refresh} />}
          {!isLoading && !walletsError && activeWallets.length === 0 && <EmptyState />}

        </div>
        </Card>
      </div>

      <Modal
        isOpen={walletToDelete !== null}
        type="danger"
        title={walletToDelete ? t("wallet.delete_wallet_confirm_title", { name: walletToDelete.name }) : ""}
        description={walletToDelete ? t("wallet.delete_wallet_confirm_desc", { name: walletToDelete.name }) : ""}
        confirmLabel={t("wallet.delete_wallet_confirm_button")}
        cancelLabel={t("wallet.btn_cancel")}
        onConfirm={handleDeleteWallet}
        onCancel={() => setWalletToDelete(null)}
        confirmDisabled={busy}
      />

      <LoadingOverlay isOpen={busy} message={t("common.loading")} />
    </div>
  );
};
