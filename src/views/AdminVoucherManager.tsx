import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { PremiumVoucher } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useLanguage } from "../contexts/LanguageContext";
import { Modal } from "../components/Modal";
import { Trash2, AlertTriangle, PlusCircle, CheckCircle, XCircle } from "lucide-react";

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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {t: t("voucher.total"), v: stats.total},
          {t: t("voucher.active_vouchers"), v: stats.active},
          {t: t("voucher.inactive_vouchers"), v: stats.inactive}
        ].map(s=>(
          <div key={s.t} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
            <p className="text-slate-400 text-sm">{s.t}</p>
            <p className="text-2xl font-bold text-white mt-1">{s.v}</p>
          </div>
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
        <h2 className="text-lg font-bold text-white mb-4">{t("voucher.create_voucher")}</h2>
        <div className="flex gap-4">
          <input placeholder={t("voucher.voucher_code")} value={code} onChange={e => setCode(e.target.value)} className="flex-1 bg-slate-800 border border-slate-700 p-3 rounded-xl text-white" />
          <input placeholder={t("voucher.discount_percent")} type="number" value={percent} onChange={e => setPercent(e.target.value)} className="w-32 bg-slate-800 border border-slate-700 p-3 rounded-xl text-white" />
          <button onClick={createVoucher} className="bg-indigo-600 text-white px-6 rounded-xl font-medium">{t("voucher.create")}</button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-800/50 text-xs text-slate-400 uppercase">
            <tr>
              <th className="p-4">{t("voucher.code")}</th>
              <th className="p-4">{t("voucher.discount", { percent: "" }).replace("{percent}%", "").trim()}</th>
              <th className="p-4">{t("voucher.active")}</th>
              <th className="p-4">{t("voucher.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {vouchers.map(v => (
              <tr key={v.id}>
                <td className="p-4 font-medium text-white">{v.code}</td>
                <td className="p-4">{v.discount_percent}%</td>
                <td className="p-4">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${v.is_active ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-700/40 text-slate-300"}`}>
                    {v.is_active ? t("voucher.active") : t("voucher.inactive_vouchers")}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    {v.is_active && <button onClick={() => setRevokeTarget(v)} className="text-amber-400 hover:text-amber-300">Revoke</button>}
                    <button onClick={() => setDeleteTarget(v)} className="text-red-400 hover:text-red-300"><Trash2 size={16}/></button>
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
