import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { PremiumVoucher } from "../types";

export const AdminVoucherManager: React.FC = () => {
  const [vouchers, setVouchers] = useState<PremiumVoucher[]>([]);
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState("");

  const fetchVouchers = async () => {
    const { data } = await supabase.from("premium_vouchers").select("*");
    setVouchers(data || []);
  };

  useEffect(() => { fetchVouchers(); }, []);

  const createVoucher = async () => {
    await supabase.from("premium_vouchers").insert({
      code,
      discount_percent: parseInt(percent),
    });
    fetchVouchers();
    setCode("");
    setPercent("");
  };

  const revokeVoucher = async (id: string) => {
    await supabase
      .from("premium_vouchers")
      .update({ is_active: false, revoked_at: new Date().toISOString() })
      .eq("id", id);
    fetchVouchers();
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input placeholder="Code" value={code} onChange={e => setCode(e.target.value)} className="border p-2" />
        <input placeholder="Percent" value={percent} onChange={e => setPercent(e.target.value)} className="border p-2" />
        <button onClick={createVoucher} className="bg-blue-500 text-white p-2">Create</button>
      </div>
      <table className="w-full border">
        <thead><tr><th>Code</th><th>Percent</th><th>Active</th><th>Actions</th></tr></thead>
        <tbody>
          {vouchers.map(v => (
            <tr key={v.id}>
              <td>{v.code}</td>
              <td>{v.discount_percent}%</td>
              <td>{v.is_active ? "Yes" : "No"}</td>
              <td>{v.is_active && <button onClick={() => revokeVoucher(v.id)} className="text-red-500">Revoke</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
