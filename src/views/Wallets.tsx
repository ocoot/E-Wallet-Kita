import React, { useState } from "react";
import { motion } from "motion/react";
import { Plus, Pencil, Archive, ArchiveRestore, History as HistoryIcon, Wallet as WalletIcon, Eye, EyeOff, Phone, CreditCard } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useWallets } from "../hooks/useWallets";
import { dbService } from "../lib/db";
import { WalletType, WalletWithBalance } from "../types";
import { useNavigate } from "react-router-dom";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { EmptyState } from "../components/EmptyState";

const GROUP_META: Record<Exclude<WalletType, "general">, { icon: string; labelKey: string; addKey: string; placeholderKey: string }> = {
  ewallet: { icon: "📱", labelKey: "wallet.group_ewallet", addKey: "wallet.add_wallet", placeholderKey: "wallet.field_name_placeholder_ewallet" },
  bank: { icon: "🏦", labelKey: "wallet.group_bank", addKey: "wallet.add_bank", placeholderKey: "wallet.field_name_placeholder_bank" },
  cash: { icon: "💵", labelKey: "wallet.group_cash", addKey: "wallet.add_cash", placeholderKey: "wallet.field_name_placeholder_cash" },
};

const formatIDR = (n: number) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");

/** Sembunyikan sebagian besar digit, sisakan 4 karakter terakhir terlihat -- mis. "••• 6789". */
const maskContact = (value: string) => {
  const digits = value.trim();
  if (digits.length <= 4) return "•".repeat(Math.max(digits.length, 3));
  return "•".repeat(digits.length - 4) + " " + digits.slice(-4);
};

export const Wallets: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { wallets, activeWallets, isLoading, refresh } = useWallets();
  const navigate = useNavigate();

  const [busy, setBusy] = useState(false);
  const [creatingType, setCreatingType] = useState<Exclude<WalletType, "general"> | null>(null);
  const [newName, setNewName] = useState("");
  const [newStartBalance, setNewStartBalance] = useState<number | "">("");
  const [newContact, setNewContact] = useState("");
  const [editingBalanceId, setEditingBalanceId] = useState<string | null>(null);
  const [balanceInput, setBalanceInput] = useState<number | "">("");
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactInput, setContactInput] = useState("");
  const [visibleContactIds, setVisibleContactIds] = useState<Set<string>>(new Set());

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

  const archivedWallets = wallets.filter((w) => w.is_archived);

  const handleCreateWallet = async (type: Exclude<WalletType, "general">) => {
    if (!user?.id || !newName.trim()) return;
    setBusy(true);
    try {
      const phone = type === "ewallet" ? (newContact.trim() || null) : null;
      const account = type === "bank" ? (newContact.trim() || null) : null;
      await dbService.createWallet(user.id, newName.trim(), type, null, Number(newStartBalance) || 0, phone, account);
      showToast(t("wallet.toast_wallet_created"), "success");
      setCreatingType(null);
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

  const handleToggleArchive = async (wallet: WalletWithBalance) => {
    if (!user?.id) return;
    setBusy(true);
    try {
      await dbService.updateWallet(user.id, wallet.id, { is_archived: !wallet.is_archived });
      showToast(t("wallet.toast_wallet_updated"), "success");
      await refresh();
    } catch {
      showToast(t("toast.error_general"), "error");
    } finally {
      setBusy(false);
    }
  };

  const WalletCard: React.FC<{ wallet: WalletWithBalance }> = ({ wallet }) => {
    const isGeneral = wallet.type === "general";
    const contactValue = wallet.type === "ewallet" ? wallet.phone_number : wallet.type === "bank" ? wallet.account_number : null;
    const contactLabel = wallet.type === "ewallet" ? t("wallet.field_phone") : t("wallet.field_account_number");
    const canHaveContact = wallet.type === "ewallet" || wallet.type === "bank";
    const isContactVisible = visibleContactIds.has(wallet.id);

    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-2xl border p-4 space-y-3 ${
          isGeneral
            ? "bg-indigo-500/5 border-indigo-500/30 light_sakura:bg-indigo-50/40 light_sakura:border-indigo-200"
            : "bg-slate-900 border-slate-800/60 light_sakura:bg-white light_sakura:border-rose-100/40"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-sans font-bold text-sm text-white truncate light_sakura:text-slate-900">{wallet.name}</p>
            {wallet.provider && (
              <p className="font-sans text-[11px] text-slate-400 truncate light_sakura:text-slate-500">{wallet.provider}</p>
            )}
          </div>
          <button
            onClick={() => handleToggleArchive(wallet)}
            title={wallet.is_archived ? t("wallet.unarchive") : t("wallet.archive")}
            disabled={isGeneral}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-800 hover:text-white cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed shrink-0 light_sakura:hover:bg-rose-100"
          >
            {wallet.is_archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
          </button>
        </div>

        {/* Nomor HP (e-wallet) / Nomor Rekening (bank) -- bisa disembunyikan */}
        {canHaveContact && (
          editingContactId === wallet.id ? (
            <div className="space-y-2">
              <input
                autoFocus
                value={contactInput}
                onChange={(e) => setContactInput(e.target.value)}
                placeholder={contactLabel}
                className="w-full px-3 py-2 rounded-xl text-sm bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500 light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-700"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleSaveContact(wallet)}
                  disabled={busy}
                  className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer disabled:opacity-50"
                >
                  {t("common.save")}
                </button>
                <button
                  onClick={() => setEditingContactId(null)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setEditingContactId(wallet.id); setContactInput(contactValue || ""); }}
              className="flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-lg bg-slate-950/40 hover:bg-slate-800/60 light_sakura:bg-rose-50/40 light_sakura:hover:bg-rose-100/60 cursor-pointer group"
            >
              {wallet.type === "ewallet" ? <Phone size={12} className="text-slate-500 shrink-0" /> : <CreditCard size={12} className="text-slate-500 shrink-0" />}
              <span className="font-sans text-[11px] text-slate-400 tabular-nums truncate light_sakura:text-slate-500 group-hover:text-slate-300">
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
            <input
              type="number"
              autoFocus
              value={balanceInput}
              onChange={(e) => setBalanceInput(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl text-sm bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500 light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-700"
            />
            <div className="flex gap-2">
              <button
                onClick={() => handleSaveBalance(wallet.id)}
                disabled={busy}
                className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer disabled:opacity-50"
              >
                {t("common.save")}
              </button>
              <button
                onClick={() => setEditingBalanceId(null)}
                className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="font-sans font-black text-xl tabular-nums text-white light_sakura:text-slate-900">
              {formatIDR(wallet.balance)}
            </p>
            {wallet.earmarked_amount > 0 && (
              <p className="font-sans text-[10px] text-amber-400/90 -mt-2">
                {t("wallet.earmarked_note", { earmarked: formatIDR(wallet.earmarked_amount), available: formatIDR(wallet.available_balance) })}
              </p>
            )}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => { setEditingBalanceId(wallet.id); setBalanceInput(Math.round(wallet.balance)); }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-slate-800/70 hover:bg-slate-700 text-slate-300 cursor-pointer light_sakura:bg-rose-50 light_sakura:hover:bg-rose-100 light_sakura:text-slate-600"
              >
                <Pencil size={11} /> {t("wallet.edit_balance")}
              </button>
              <button
                onClick={() => navigate("/transactions", { state: { filterWalletId: wallet.id } })}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-slate-800/70 hover:bg-slate-700 text-slate-300 cursor-pointer light_sakura:bg-rose-50 light_sakura:hover:bg-rose-100 light_sakura:text-slate-600"
              >
                <HistoryIcon size={11} /> {t("wallet.view_history")}
              </button>
            </div>
          </>
        )}
      </motion.div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="rounded-3xl border bg-slate-900 border-slate-800/60 light_sakura:bg-white light_sakura:border-rose-100/40 shadow-lg overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-600" />
        <div className="p-6 md:p-8 space-y-6">

          {/* Header */}
          <div>
            <h1 className="font-sans font-bold text-2xl tracking-tight text-white flex items-center gap-2 light_sakura:text-slate-900">
              <WalletIcon size={22} /> {t("wallet.title")}
            </h1>
            <p className="font-sans text-sm text-slate-400 mt-1 light_sakura:text-slate-500">{t("wallet.desc")}</p>
          </div>

          {/* Total banner */}
          <div className="rounded-2xl bg-indigo-500/8 border border-indigo-500/15 px-5 py-4 light_sakura:bg-indigo-50/60 light_sakura:border-indigo-100">
            <p className="font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-slate-400 uppercase tracking-widest light_sakura:text-slate-500">
              {t("wallet.total_balance")}
            </p>
            <p className="font-sans font-black text-3xl tabular-nums text-white mt-1 light_sakura:text-slate-900">
              {formatIDR(totalBalance)}
            </p>
          </div>

          {/* General wallet (Saldo Total) */}
          {generalWallet && (
            <div className="space-y-2">
              <h2 className="font-sans text-xs font-bold text-slate-300 uppercase tracking-wider light_sakura:text-slate-600">
                {t("wallet.group_general")}
              </h2>
              <p className="font-sans text-[11px] text-slate-500 -mt-1 light_sakura:text-slate-400">{t("wallet.general_desc")}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <WalletCard wallet={generalWallet} />
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
                  <h2 className="font-sans text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 light_sakura:text-slate-600">
                    <span>{meta.icon}</span> {t(meta.labelKey)}
                  </h2>
                  <button
                    onClick={() => { setCreatingType(type); setNewName(""); setNewStartBalance(""); setNewContact(""); }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 cursor-pointer light_sakura:bg-rose-50 light_sakura:hover:bg-rose-100 light_sakura:text-rose-600"
                  >
                    <Plus size={12} /> {t(meta.addKey)}
                  </button>
                </div>

                {creatingType === type && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-4 space-y-3 light_sakura:bg-indigo-50/30"
                  >
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1 light_sakura:text-slate-500">
                        {t("wallet.field_name")}
                      </label>
                      <input
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder={t(meta.placeholderKey)}
                        className="w-full px-3 py-2 rounded-xl text-sm bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500 light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-700"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1 light_sakura:text-slate-500">
                        {t("wallet.field_starting_balance")}
                      </label>
                      <input
                        type="number"
                        value={newStartBalance}
                        onChange={(e) => setNewStartBalance(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder="0"
                        className="w-full px-3 py-2 rounded-xl text-sm bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500 light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-700"
                      />
                    </div>
                    {(type === "ewallet" || type === "bank") && (
                      <div>
                        <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1 light_sakura:text-slate-500">
                          {type === "ewallet" ? t("wallet.field_phone") : t("wallet.field_account_number")}
                        </label>
                        <input
                          value={newContact}
                          onChange={(e) => setNewContact(e.target.value)}
                          placeholder={type === "ewallet" ? "08xxxxxxxxxx" : "1234567890"}
                          className="w-full px-3 py-2 rounded-xl text-sm bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500 light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-700"
                        />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCreateWallet(type)}
                        disabled={busy || !newName.trim()}
                        className="flex-1 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer disabled:opacity-50"
                      >
                        {t("wallet.btn_save_wallet")}
                      </button>
                      <button
                        onClick={() => setCreatingType(null)}
                        className="flex-1 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                      >
                        {t("wallet.btn_cancel")}
                      </button>
                    </div>
                  </motion.div>
                )}

                {items.length === 0 ? (
                  <p className="font-sans text-xs text-slate-500 italic px-1">{t("wallet.empty_group")}</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {items.map((w) => <WalletCard key={w.id} wallet={w} />)}
                  </div>
                )}
              </div>
            );
          })}

          {archivedWallets.length > 0 && (
            <div className="space-y-2 opacity-60">
              <h2 className="font-sans text-xs font-bold text-slate-400 uppercase tracking-wider">{t("wallet.archive")}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {archivedWallets.map((w) => <WalletCard key={w.id} wallet={w} />)}
              </div>
            </div>
          )}

          {!isLoading && activeWallets.length === 0 && <EmptyState />}

        </div>
      </div>

      <LoadingOverlay isOpen={busy} message={t("common.loading")} />
    </div>
  );
};
