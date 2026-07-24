import React, { useState, useEffect } from "react";
import { AdminBackBar } from "../components/AdminBackBar";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { supabase } from "../lib/supabase";
import { PremiumVoucher } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { useLanguage } from "../contexts/LanguageContext";
import { Modal } from "../components/Modal";
import { DropdownField } from "../components/DropdownField";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { Trash2, PlusCircle, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { reportFrontendError } from "../lib/errorReporter";

interface PremiumVoucherWithUsage extends PremiumVoucher {
  usage_count?: number;
  last_used_at?: string | null;
}

export const AdminVoucherManager: React.FC = () => {
  const [vouchers, setVouchers] = useState<PremiumVoucherWithUsage[]>([]);
  const { tokens, cx } = useThemeTokens();
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<PremiumVoucherWithUsage | null>(null);
  const [activateTarget, setActivateTarget] = useState<PremiumVoucherWithUsage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PremiumVoucherWithUsage | null>(null);
  const [premiumPrice, setPremiumPrice] = useState("20000");
  const [isSavingPrice, setIsSavingPrice] = useState(false);
  const [pageSize, setPageSize] = useState<number | "all">(5);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [vouchersError, setVouchersError] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [savingAction, setSavingAction] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: "",
  });
  const { session } = useAuth();
  const { showToast } = useToast();
  const { t, locale } = useLanguage();

  useEffect(() => {
    setPage(0);
  }, [pageSize, vouchers.length]);

  const fetchVouchers = async () => {
    setLoading(true);
    setVouchersError(false);
    const { data, error } = await supabase
      .from("premium_vouchers")
      .select(`
        *,
        premium_transactions (
          id,
          created_at
        )
      `)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      showToast(error.message, "error");
      setVouchersError(true);
      setLoading(false);
      void reportFrontendError({
        source: "frontend:admin-voucher",
        message: error.message,
        context: { action: "fetch-vouchers" },
      });
      return;
    }

    const mapped = (data || []).map((v: any) => {
      const txs = v.premium_transactions || [];
      const usage_count = txs.length;
      const last_used_at = txs.length > 0
        ? txs.map((t: any) => t.created_at).sort((a: string, b: string) => b.localeCompare(a))[0]
        : null;
      return {
        ...v,
        usage_count,
        last_used_at
      };
    });

    setVouchers(mapped);
    setLoading(false);
  };

  const loadPrice = async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "premium_base_price")
      .single();

    if (data) {
      setPremiumPrice(data.value);
    }
  };

  useEffect(() => {
    fetchVouchers();
    loadPrice();
  }, []);

  const createVoucher = async () => {
    if (!session?.user.id || isCreating) return;
    setIsCreating(true);
    try {
      const { error } = await supabase
        .from("premium_vouchers")
        .insert({ code, discount_percent: Number(percent), created_by: session.user.id });
      if (error) {
        showToast(error.message, "error");
        void reportFrontendError({
          source: "frontend:admin-voucher",
          message: error.message,
          context: { action: "create-voucher" },
        });
        return;
      }
      showToast(t("voucher.success_create"), "success");
      await fetchVouchers();
      setCode("");
      setPercent("");
    } catch (err: any) {
      showToast(err?.message || t("toast.error_general"), "error");
      void reportFrontendError({
        source: "frontend:admin-voucher",
        message: err?.message || String(err),
        context: { action: "create-voucher" },
      });
    } finally {
      setIsCreating(false);
    }
  };

  const revokeVoucher = async () => {
    if (!revokeTarget) return;
    setSavingAction({ isOpen: true, message: t("admin.maintenance_saving") });
    try {
      const { error } = await supabase.from("premium_vouchers").update({ is_active: false, revoked_at: new Date().toISOString() }).eq("id", revokeTarget.id);
      if (error) {
        showToast(error.message, "error");
        void reportFrontendError({
          source: "frontend:admin-voucher",
          message: error.message,
          context: { action: "revoke-voucher", voucherId: revokeTarget.id },
        });
        return;
      }
      setRevokeTarget(null);
      showToast(t("voucher.success_revoke") || "Voucher berhasil dinonaktifkan", "success");
      await fetchVouchers();
    } catch (err: any) {
      showToast(err?.message || t("toast.error_general"), "error");
      void reportFrontendError({
        source: "frontend:admin-voucher",
        message: err?.message || String(err),
        context: { action: "revoke-voucher" },
      });
    } finally {
      setSavingAction({ isOpen: false, message: "" });
    }
  };

  const activateVoucher = async () => {
    if (!activateTarget) return;
    setSavingAction({ isOpen: true, message: t("admin.maintenance_saving") });
    try {
      const { error } = await supabase
        .from("premium_vouchers")
        .update({ is_active: true, revoked_at: null })
        .eq("id", activateTarget.id);

      if (error) {
        showToast(error.message, "error");
        void reportFrontendError({
          source: "frontend:admin-voucher",
          message: error.message,
          context: { action: "activate-voucher", voucherId: activateTarget.id },
        });
        return;
      }

      showToast(t("voucher.success_activate"), "success");
      setActivateTarget(null);
      await fetchVouchers();
    } catch (err: any) {
      showToast(err?.message || t("toast.error_general"), "error");
      void reportFrontendError({
        source: "frontend:admin-voucher",
        message: err?.message || String(err),
        context: { action: "activate-voucher" },
      });
    } finally {
      setSavingAction({ isOpen: false, message: "" });
    }
  };

  const deleteVoucher = async () => {
    if (!deleteTarget) return;
    setSavingAction({ isOpen: true, message: t("admin.maintenance_saving") });
    try {
      const { count, error: countError } = await supabase
        .from("premium_transactions")
        .select("*", { count: "exact", head: true })
        .eq("voucher_id", deleteTarget.id);

      if (countError) {
        showToast(countError.message, "error");
        void reportFrontendError({
          source: "frontend:admin-voucher",
          message: countError.message,
          context: { action: "delete-voucher-count-check", voucherId: deleteTarget.id },
        });
        return;
      }

      if (count && count > 0) {
        showToast(t("voucher.cannot_delete_used"), "error");
        setDeleteTarget(null);
        return;
      }

      const { error: deleteError } = await supabase
        .from("premium_vouchers")
        .delete()
        .eq("id", deleteTarget.id);

      if (deleteError) {
        showToast(deleteError.message, "error");
        void reportFrontendError({
          source: "frontend:admin-voucher",
          message: deleteError.message,
          context: { action: "delete-voucher", voucherId: deleteTarget.id },
        });
        return;
      }

      showToast(t("common.delete_success") || "Voucher berhasil dihapus", "success");
      setDeleteTarget(null);
      await fetchVouchers();
    } catch (err: any) {
      showToast(err?.message || t("toast.error_general"), "error");
      void reportFrontendError({
        source: "frontend:admin-voucher",
        message: err?.message || String(err),
        context: { action: "delete-voucher" },
      });
    } finally {
      setSavingAction({ isOpen: false, message: "" });
    }
  };

  const savePremiumPrice = async () => {
    setIsSavingPrice(true);
    const { error } = await supabase
      .from("app_settings")
      .update({ value: premiumPrice })
      .eq("key", "premium_base_price");

    setIsSavingPrice(false);
    if (error) {
      showToast(error.message, "error");
      void reportFrontendError({
        source: "frontend:admin-voucher",
        message: error.message,
        context: { action: "save-premium-price" },
      });
      return;
    }
    showToast(t("admin.price_updated"), "success");
  };

  const stats = {
    total: vouchers.length,
    active: vouchers.filter(v => v.is_active).length,
    inactive: vouchers.filter(v => !v.is_active).length
  };

  const formatDate = (isoStr: string | null | undefined) => {
    if (!isoStr) return "-";
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString(locale === "id" ? "id-ID" : "en-US", {
        day: "numeric",
        month: "short",
        year: "numeric"
      });
    } catch (e) {
      return "-";
    }
  };

  return (
    <div className="space-y-6">
      <div className="relative">
        <div>
          <AdminBackBar />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          {t: t("voucher.total"), v: stats.total, color: "text-indigo-500"},
          {t: t("voucher.active_vouchers"), v: stats.active, color: "text-emerald-500"},
          {t: t("voucher.inactive_vouchers"), v: stats.inactive, color: tokens.text.muted}
        ].map(s=>(
          <Card key={s.t} padding="sm" border="neutral" elevation="sm">
            <p className={cx("text-sm font-medium", tokens.text.muted)}>{s.t}</p>
            <p className={`text-3xl font-bold mt-2 ${s.color}`}>{s.v}</p>
          </Card>
        ))}
      </div>

      {/* Global Premium Price Setting Card */}
      <div className={cx("p-6 md:p-8 space-y-6 rounded-2xl border shadow-sm", tokens.surface.card, tokens.border.accent)}>
        <h2 className={cx("text-xl font-bold", tokens.text.onSurface)}>{t("admin.premium_price")}</h2>
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className={cx("block text-sm font-medium mb-1.5", tokens.text.secondary)}>{t("voucher.base_price")}</label>
            <Input
              type="number"
              placeholder="20000"
              value={premiumPrice}
              onChange={e => setPremiumPrice(e.target.value)}
              accent="indigo"
            />
          </div>
          <Button 
            variant="primary"
            onClick={savePremiumPrice} 
            disabled={isSavingPrice}
            isLoading={isSavingPrice}
            className="w-full sm:w-auto px-6 py-3.5 rounded-xl font-semibold shadow-md active:scale-95"
          >
            {t("common.save")}
          </Button>
        </div>
      </div>

      <div className={cx("p-6 md:p-8 rounded-2xl border shadow-sm", tokens.surface.card, tokens.border.accent)}>
        <h2 className={cx("text-xl font-bold mb-6", tokens.text.onSurface)}>{t("voucher.create_voucher")}</h2>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className={cx("block text-sm font-medium mb-1.5", tokens.text.secondary)}>{t("voucher.voucher_code")}</label>
            <Input placeholder={t("voucher.placeholder_code")} value={code} onChange={e => setCode(e.target.value)} accent="indigo" />
          </div>
          <div className="w-32">
            <label className={cx("block text-sm font-medium mb-1.5", tokens.text.secondary)}>{t("voucher.discount_percent")}</label>
            <Input placeholder="50" type="number" value={percent} onChange={e => setPercent(e.target.value)} accent="indigo" />
          </div>
          <Button
            variant="primary"
            onClick={createVoucher}
            disabled={isCreating}
            isLoading={isCreating}
            icon={<PlusCircle size={20} />}
            className="px-6 py-3 rounded-xl font-semibold"
          >
            {t("voucher.create")}
          </Button>
        </div>
      </div>

      <div className={cx("rounded-2xl border shadow-sm overflow-hidden", tokens.surface.card, tokens.border.default)}>
        {loading ? (
          <div className={cx("py-16 text-center text-sm", tokens.text.muted)}>{t("admin.loading")}</div>
        ) : vouchersError ? (
          <ErrorState onRetry={fetchVouchers} />
        ) : vouchers.length === 0 ? (
          <EmptyState message={t("voucher.no_vouchers")} />
        ) : (
        <div className="overflow-x-auto">
          <table className={cx("w-full text-left text-sm min-w-[700px]", tokens.text.label)}>
            <thead className={cx("uppercase text-xs", tokens.text.muted, tokens.surface.subtle)}>
              <tr className={tokens.divide.tableColumn}>
                <th className="p-6">{t("voucher.code")}</th>
                <th className="p-6">{t("voucher.discount", { percent: "" }).replace("{percent}%", "").trim()}</th>
                <th className="p-6">{t("voucher.active")}</th>
                <th className="p-6">{t("voucher.usage")}</th>
                <th className="p-6">{t("voucher.last_used")}</th>
                <th className="p-6 text-right">{t("voucher.actions")}</th>
              </tr>
            </thead>
            <tbody className={cx("divide-y", tokens.errorMonitor.tableDivide)}>
              {(pageSize === "all" ? vouchers : vouchers.slice(page * pageSize, (page + 1) * pageSize)).map(v => {
                const usageCount = v.usage_count || 0;
                return (
                  <tr key={v.id} className={cx("transition-colors", tokens.hover.surface, tokens.divide.tableColumn)}>
                    <td className={cx("p-6 font-semibold", tokens.text.primary)}>{v.code}</td>
                    <td className="p-6">{v.discount_percent}%</td>
                    <td className="p-6">
                      <Badge tone={v.is_active ? "success" : "neutral"} className="normal-case tracking-normal">
                        {v.is_active ? t("voucher.active") : t("voucher.inactive_vouchers")}
                      </Badge>
                    </td>
                    <td className="p-6">
                      <Badge tone={usageCount === 0 ? "neutral" : "info"} className="normal-case tracking-normal">
                        {usageCount === 0 ? t("voucher.never_used") : t("voucher.used_times", { count: usageCount }).replace("{count}", String(usageCount))}
                      </Badge>
                    </td>
                    <td className={cx("p-6", tokens.text.label)}>
                      {formatDate(v.last_used_at)}
                    </td>
                    <td className="p-6 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {v.is_active ? (
                          <button onClick={() => setRevokeTarget(v)} className="text-amber-500 hover:text-amber-600 font-medium cursor-pointer">{t("voucher.revoke")}</button>
                        ) : (
                          <button onClick={() => setActivateTarget(v)} className="text-emerald-500 hover:text-emerald-600 font-medium cursor-pointer">{t("voucher.activate")}</button>
                        )}
                        <button onClick={() => setDeleteTarget(v)} className="text-red-400 hover:text-red-500 cursor-pointer"><Trash2 size={18}/></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* Pagination Controls */}
      {!loading && !vouchersError && vouchers.length > 0 && (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2 mt-4 font-sans text-xs text-slate-400">
        {/* Page Size Selector */}
        <div className="flex items-center gap-2">
          <span>{t("admin.rows_per_page")}</span>
          <DropdownField
            className="w-24"
            value={String(pageSize)}
            onChange={(v) => {
              setPageSize(v === "all" ? "all" : Number(v));
              setPage(0);
            }}
            options={[
              { value: "5", label: "5" },
              { value: "10", label: "10" },
              { value: "15", label: "15" },
              { value: "20", label: "20" },
              { value: "all", label: t("common.all") },
            ]}
          />
        </div>

        {/* Pagination Info & Buttons */}
        {pageSize !== "all" && vouchers.length > pageSize ? (
          <div className="flex items-center gap-4">
            <div>
              {page * pageSize + 1}–{Math.min((page + 1) * pageSize, vouchers.length)} dari {vouchers.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                className={cx("p-2 rounded-xl border disabled:opacity-50 cursor-pointer", tokens.text.label, tokens.border.default, tokens.surface.card, tokens.hover.surface)}
              >
                <ChevronLeft size={14} />
              </button>
              <span className={cx("font-medium", tokens.text.onSurface)}>{page + 1} / {Math.ceil(vouchers.length / pageSize)}</span>
              <button
                disabled={(page + 1) * pageSize >= vouchers.length}
                onClick={() => setPage(p => p + 1)}
                className={cx("p-2 rounded-xl border disabled:opacity-50 cursor-pointer", tokens.text.label, tokens.border.default, tokens.surface.card, tokens.hover.surface)}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div className="text-slate-500 text-xs">
            {t("admin.showing_all_vouchers").replace("{count}", vouchers.length.toString())}
          </div>
        )}
      </div>
      )}

      <Modal
        isOpen={!!revokeTarget}
        title={t("voucher.confirm_revoke")}
        description={t("voucher.confirm_revoke_desc")}
        type="warning"
        confirmLabel={t("voucher.revoke")}
        cancelLabel={t("common.cancel")}
        onConfirm={revokeVoucher}
        onCancel={() => setRevokeTarget(null)}
        confirmDisabled={savingAction.isOpen}
      />

      <Modal
        isOpen={!!activateTarget}
        title={t("voucher.confirm_activate")}
        description={t("voucher.confirm_activate_desc")}
        type="info"
        confirmLabel={t("voucher.activate")}
        cancelLabel={t("common.cancel")}
        onConfirm={activateVoucher}
        onCancel={() => setActivateTarget(null)}
        confirmDisabled={savingAction.isOpen}
      />

      <Modal
        isOpen={!!deleteTarget}
        title={t("voucher.confirm_delete")}
        description={t("voucher.confirm_delete_desc")}
        type="danger"
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={deleteVoucher}
        onCancel={() => setDeleteTarget(null)}
        confirmDisabled={savingAction.isOpen}
      />

      <LoadingOverlay isOpen={savingAction.isOpen} message={savingAction.message} />
    </div>
  );
};
