import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { PremiumVoucher } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useLanguage } from "../contexts/LanguageContext";
import { Modal } from "../components/Modal";
import { Trash2, PlusCircle } from "lucide-react";

export const AdminVoucherManager: React.FC = () => {
  const [vouchers, setVouchers] = useState<PremiumVoucher[]>([]);
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<PremiumVoucher | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PremiumVoucher | null>(null);
  const { session } = useAuth();
  const { showToast } = useToast();
  const { t } = useLanguage();

  const fetchVouchers = async () => {
    const { data } = await supabase
      .from("premium_vouchers")
      .select("*")
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false });
    setVouchers(data || []);
  };

  useEffect(() => { fetchVouchers(); }, []);

  const createVoucher = async () => {
    if (!session?.user.id) return;
    const { error } = await supabase
      .from("premium_vouchers")
      .insert({ code, discount_percent: Number(percent), created_by: session.user.id });
    if (error) { showToast(error.message, "error"); return; }
    showToast("Voucher created", "success");
    fetchVouchers();
    setCode("");
    setPercent("");
  };

  const revokeVoucher = async () => {
    if (!revokeTarget) return;
    await supabase.from("premium_vouchers").update({ is_active: false, revoked_at: new Date().toISOString() }).eq("id", revokeTarget.id);
    setRevokeTarget(null);
    fetchVouchers();
  };

  const deleteVoucher = async () => {
    if (!deleteTarget) return;
    await supabase.from("premium_vouchers").delete().eq("id", deleteTarget.id);
    setDeleteTarget(null);
    fetchVouchers();
  };

  const stats = {
    total: vouchers.length,
    active: vouchers.filter(v => v.is_active).length,
    inactive: vouchers.filter(v => !v.is_active).length
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

      <div className="bg-slate-900 light_sakura:bg-white p-8 rounded-3xl border border-slate-800 light_sakura:border-slate-100 shadow-sm">
        <h2 className="text-xl font-bold text-white light_sakura:text-slate-800 mb-6">{t("voucher.create_voucher")}</h2>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-300 light_sakura:text-slate-700 mb-1.5">{t("voucher.voucher_code")}</label>
            <input placeholder="Contoh: WELCOME50" value={code} onChange={e => setCode(e.target.value)} className="w-full bg-slate-800 light_sakura:bg-slate-50 border border-slate-700 light_sakura:border-slate-200 p-3 rounded-xl text-white light_sakura:text-slate-900 placeholder-slate-500 focus:ring-2 focus:ring-indigo-500" />
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
        <table className="w-full text-left text-sm text-slate-300 light_sakura:text-slate-600">
          <thead className="bg-slate-800 light_sakura:bg-slate-50 text-slate-400 light_sakura:text-slate-500 uppercase text-xs">
            <tr>
              <th className="p-6">{t("voucher.code")}</th>
              <th className="p-6">{t("voucher.discount", { percent: "" }).replace("{percent}%", "").trim()}</th>
              <th className="p-6">{t("voucher.active")}</th>
              <th className="p-6 text-right">{t("voucher.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 light_sakura:divide-slate-100">
            {vouchers.map(v => (
              <tr key={v.id} className="hover:bg-slate-800/50 light_sakura:hover:bg-slate-50/50">
                <td className="p-6 font-semibold text-white light_sakura:text-slate-900">{v.code}</td>
                <td className="p-6">{v.discount_percent}%</td>
                <td className="p-6">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${v.is_active ? "bg-emerald-900/20 light_sakura:bg-emerald-50 text-emerald-400 light_sakura:text-emerald-600" : "bg-slate-800 light_sakura:bg-slate-100 text-slate-400 light_sakura:text-slate-600"}`}>
                    {v.is_active ? t("voucher.active") : t("voucher.inactive_vouchers")}
                  </span>
                </td>
                <td className="p-6 text-right">
                  <div className="flex items-center justify-end gap-3">
                    {v.is_active && <button onClick={() => setRevokeTarget(v)} className="text-amber-500 hover:text-amber-600 font-medium cursor-pointer">Revoke</button>}
                    <button onClick={() => setDeleteTarget(v)} className="text-red-400 hover:text-red-500 cursor-pointer"><Trash2 size={18}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={!!revokeTarget}
        title={t("voucher.confirm_revoke")}
        description={t("voucher.confirm_revoke_desc")}
        type="warning"
        confirmLabel={t("common.revoke")}
        cancelLabel={t("common.cancel")}
        onConfirm={revokeVoucher}
        onCancel={() => setRevokeTarget(null)}
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
