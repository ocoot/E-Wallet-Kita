import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { PremiumVoucher } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useLanguage } from "../contexts/LanguageContext";
import { Modal } from "../components/Modal";
import { DropdownField } from "../components/DropdownField";
import { Trash2, PlusCircle, ChevronLeft, ChevronRight } from "lucide-react";

interface PremiumVoucherWithUsage extends PremiumVoucher {
  usage_count?: number;
  last_used_at?: string | null;
}

export const AdminVoucherManager: React.FC = () => {
  const [vouchers, setVouchers] = useState<PremiumVoucherWithUsage[]>([]);
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<PremiumVoucherWithUsage | null>(null);
  const [activateTarget, setActivateTarget] = useState<PremiumVoucherWithUsage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PremiumVoucherWithUsage | null>(null);
  const [premiumPrice, setPremiumPrice] = useState("20000");
  const [isSavingPrice, setIsSavingPrice] = useState(false);
  const [pageSize, setPageSize] = useState<number | "all">(10);
  const [page, setPage] = useState(0);
  const { session } = useAuth();
  const { showToast } = useToast();
  const { t, locale } = useLanguage();

  useEffect(() => {
    setPage(0);
  }, [pageSize, vouchers.length]);

  const fetchVouchers = async () => {
    const { data } = await supabase
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
    if (!session?.user.id) return;
    const { error } = await supabase
      .from("premium_vouchers")
      .insert({ code, discount_percent: Number(percent), created_by: session.user.id });
    if (error) { showToast(error.message, "error"); return; }
    showToast(t("voucher.success_create"), "success");
    fetchVouchers();
    setCode("");
    setPercent("");
  };

  const revokeVoucher = async () => {
    if (!revokeTarget) return;
    await supabase.from("premium_vouchers").update({ is_active: false, revoked_at: new Date().toISOString() }).eq("id", revokeTarget.id);
    setRevokeTarget(null);
    showToast(t("voucher.success_revoke") || "Voucher berhasil dinonaktifkan", "success");
    fetchVouchers();
  };

  const activateVoucher = async () => {
    if (!activateTarget) return;
    const { error } = await supabase
      .from("premium_vouchers")
      .update({ is_active: true, revoked_at: null })
      .eq("id", activateTarget.id);

    if (error) {
      showToast(error.message, "error");
      return;
    }

    showToast(t("voucher.success_activate"), "success");
    setActivateTarget(null);
    fetchVouchers();
  };

  const deleteVoucher = async () => {
    if (!deleteTarget) return;

    const { count, error: countError } = await supabase
      .from("premium_transactions")
      .select("*", { count: "exact", head: true })
      .eq("voucher_id", deleteTarget.id);

    if (countError) {
      showToast(countError.message, "error");
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
      return;
    }

    showToast(t("common.delete_success") || "Voucher berhasil dihapus", "success");
    setDeleteTarget(null);
    fetchVouchers();
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          {t: t("voucher.total"), v: stats.total, color: "text-indigo-500"},
          {t: t("voucher.active_vouchers"), v: stats.active, color: "text-emerald-500"},
          {t: t("voucher.inactive_vouchers"), v: stats.inactive, color: "text-slate-400 light_sakura:text-slate-500"}
        ].map(s=>(
          <div key={s.t} className="bg-slate-900 light_sakura:bg-white p-6 rounded-3xl border border-slate-800 light_sakura:border-slate-100 shadow-sm">
            <p className="text-slate-400 light_sakura:text-slate-500 text-sm font-medium">{s.t}</p>
            <p className={`text-3xl font-bold mt-2 ${s.color}`}>{s.v}</p>
          </div>
        ))}
      </div>

      {/* Global Premium Price Setting Card */}
      <div className="bg-slate-900 light_sakura:bg-white p-8 rounded-3xl border border-slate-800 light_sakura:border-slate-100 shadow-sm space-y-6">
        <h2 className="text-xl font-bold text-white light_sakura:text-slate-800">{t("admin.premium_price")}</h2>
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-300 light_sakura:text-slate-700 mb-1.5">{t("voucher.base_price")}</label>
            <input 
              type="number" 
              placeholder="20000" 
              value={premiumPrice} 
              onChange={e => setPremiumPrice(e.target.value)} 
              className="w-full bg-slate-800 light_sakura:bg-slate-50 border border-slate-700 light_sakura:border-slate-200 p-3 rounded-xl text-white light_sakura:text-slate-900 placeholder-slate-500 focus:ring-2 focus:ring-indigo-500" 
            />
          </div>
          <button 
            onClick={savePremiumPrice} 
            disabled={isSavingPrice}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-all shadow-md active:scale-95"
          >
            {t("common.save")}
          </button>
        </div>
      </div>

      <div className="bg-slate-900 light_sakura:bg-white p-8 rounded-3xl border border-slate-800 light_sakura:border-slate-100 shadow-sm">
        <h2 className="text-xl font-bold text-white light_sakura:text-slate-800 mb-6">{t("voucher.create_voucher")}</h2>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-300 light_sakura:text-slate-700 mb-1.5">{t("voucher.voucher_code")}</label>
            <input placeholder={t("voucher.placeholder_code")} value={code} onChange={e => setCode(e.target.value)} className="w-full bg-slate-800 light_sakura:bg-slate-50 border border-slate-700 light_sakura:border-slate-200 p-3 rounded-xl text-white light_sakura:text-slate-900 placeholder-slate-500 focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div className="w-32">
            <label className="block text-sm font-medium text-slate-300 light_sakura:text-slate-700 mb-1.5">{t("voucher.discount_percent")}</label>
            <input placeholder="50" type="number" value={percent} onChange={e => setPercent(e.target.value)} className="w-full bg-slate-800 light_sakura:bg-slate-50 border border-slate-700 light_sakura:border-slate-200 p-3 rounded-xl text-white light_sakura:text-slate-900 placeholder-slate-500 focus:ring-2 focus:ring-indigo-500" />
          </div>
          <button onClick={createVoucher} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 cursor-pointer">
            <PlusCircle size={20} /> {t("voucher.create")}
          </button>
        </div>
      </div>

      <div className="bg-slate-900 light_sakura:bg-white rounded-3xl border border-slate-800 light_sakura:border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300 light_sakura:text-slate-600 min-w-[700px]">
            <thead className="bg-slate-800 light_sakura:bg-slate-50 text-slate-400 light_sakura:text-slate-500 uppercase text-xs">
              <tr>
                <th className="p-6">{t("voucher.code")}</th>
                <th className="p-6">{t("voucher.discount", { percent: "" }).replace("{percent}%", "").trim()}</th>
                <th className="p-6">{t("voucher.active")}</th>
                <th className="p-6">{t("voucher.usage")}</th>
                <th className="p-6">{t("voucher.last_used")}</th>
                <th className="p-6 text-right">{t("voucher.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 light_sakura:divide-slate-100">
              {(pageSize === "all" ? vouchers : vouchers.slice(page * pageSize, (page + 1) * pageSize)).map(v => {
                const usageCount = v.usage_count || 0;
                return (
                  <tr key={v.id} className="hover:bg-slate-800/50 light_sakura:hover:bg-slate-50/50">
                    <td className="p-6 font-semibold text-white light_sakura:text-slate-900">{v.code}</td>
                    <td className="p-6">{v.discount_percent}%</td>
                    <td className="p-6">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${v.is_active ? "bg-emerald-900/20 light_sakura:bg-emerald-50 text-emerald-400 light_sakura:text-emerald-600" : "bg-slate-800 light_sakura:bg-slate-100 text-slate-400 light_sakura:text-slate-600"}`}>
                        {v.is_active ? t("voucher.active") : t("voucher.inactive_vouchers")}
                      </span>
                    </td>
                    <td className="p-6">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${usageCount === 0 ? "bg-slate-800 light_sakura:bg-slate-100 text-slate-400 light_sakura:text-slate-600" : "bg-indigo-900/20 light_sakura:bg-indigo-50 text-indigo-400 light_sakura:text-indigo-600"}`}>
                        {usageCount === 0 ? t("voucher.never_used") : t("voucher.used_times", { count: usageCount }).replace("{count}", String(usageCount))}
                      </span>
                    </td>
                    <td className="p-6 text-slate-300 light_sakura:text-slate-600">
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
      </div>

      {/* Pagination Controls */}
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
                className="p-2 rounded-xl bg-slate-900 light_sakura:bg-white border border-slate-800 light_sakura:border-slate-200 text-slate-300 light_sakura:text-slate-600 hover:bg-slate-800 light_sakura:hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="font-medium text-white light_sakura:text-slate-800">{page + 1} / {Math.ceil(vouchers.length / pageSize)}</span>
              <button
                disabled={(page + 1) * pageSize >= vouchers.length}
                onClick={() => setPage(p => p + 1)}
                className="p-2 rounded-xl bg-slate-900 light_sakura:bg-white border border-slate-800 light_sakura:border-slate-200 text-slate-300 light_sakura:text-slate-600 hover:bg-slate-800 light_sakura:hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
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

      <Modal
        isOpen={!!revokeTarget}
        title={t("voucher.confirm_revoke")}
        description={t("voucher.confirm_revoke_desc")}
        type="warning"
        confirmLabel={t("voucher.revoke")}
        cancelLabel={t("common.cancel")}
        onConfirm={revokeVoucher}
        onCancel={() => setRevokeTarget(null)}
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
      />
    </div>
  );
};
