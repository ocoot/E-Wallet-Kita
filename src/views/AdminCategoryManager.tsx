import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { useAdmin } from "../hooks/useAdmin";
import { Tag, Plus, Pencil, Check, X, ToggleLeft, ToggleRight, RefreshCw } from "lucide-react";

interface Category {
  id: string;
  key: string;
  type: "income" | "expense" | "both";
  label_id: string | null;
  label_en: string | null;
  is_active: boolean;
}

export const AdminCategoryManager: React.FC = () => {
  const { showToast } = useToast();
  const { t } = useLanguage();
  const { isAdmin } = useAdmin();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ label_id: "", label_en: "", type: "expense" as string, is_active: true });
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ key: "", label_id: "", label_en: "", type: "expense" });

  const typeColors = {
    income:  "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    expense: "bg-red-500/10 border-red-500/20 text-red-400",
    both:    "bg-purple-500/10 border-purple-500/20 text-purple-400",
  };

  const loadCategories = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("type")
      .order("key");
    if (error) { 
      showToast(t("toast.error_general"), "error"); 
    } else { 
      setCategories(data || []); 
    }
    setLoading(false);
  }, [showToast, t]);

  useEffect(() => {
    if (isAdmin) {
      loadCategories();
    }
  }, [loadCategories, isAdmin]);

  const startEdit = (cat: Category) => {
    setEditingKey(cat.key);
    setEditForm({
      label_id: cat.label_id || "",
      label_en: cat.label_en || "",
      type: cat.type,
      is_active: cat.is_active,
    });
  };

  const saveEdit = async (key: string) => {
    const { error } = await supabase.rpc("admin_update_category", {
      p_key: key,
      p_label_id: editForm.label_id,
      p_label_en: editForm.label_en,
      p_type: editForm.type,
      p_is_active: editForm.is_active,
    });
    if (error) { showToast(error.message, "error"); return; }
    showToast("Kategori berhasil diperbarui", "success");
    setEditingKey(null);
    loadCategories();
  };

  const handleAdd = async () => {
    if (!addForm.key || !addForm.label_id) {
      showToast("Key & Label wajib diisi", "error");
      return;
    }
    const { error } = await supabase.rpc("admin_add_category", {
      p_key: addForm.key.toLowerCase().replace(/\s+/g, "_"),
      p_label_id: addForm.label_id,
      p_label_en: addForm.label_en,
      p_type: addForm.type,
    });
    if (error) { showToast(error.message, "error"); return; }
    showToast("Kategori baru berhasil ditambahkan", "success");
    setShowAddForm(false);
    setAddForm({ key: "", label_id: "", label_en: "", type: "expense" });
    loadCategories();
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-sans font-black text-lg text-white flex items-center gap-2 light_sakura:text-slate-800">
            <Tag className="text-purple-400 light_sakura:text-rose-500" size={20} />
            {t("admin.category_manager_title")}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5 light_sakura:text-slate-500">
            {t("admin.category_manager_desc")}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadCategories}
            className="p-2 rounded-xl border border-slate-800 hover:bg-slate-900 text-slate-400 cursor-pointer transition-colors light_sakura:border-rose-200 light_sakura:hover:bg-rose-100"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setShowAddForm(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-black rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400 hover:bg-teal-500/20 cursor-pointer transition-colors light_sakura:bg-rose-100 light_sakura:border-rose-300 light_sakura:text-rose-600"
          >
            <Plus size={12} /> {t("admin.add_category")}
          </button>
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="rounded-2xl border border-teal-500/20 bg-teal-500/5 p-5 space-y-3 light_sakura:border-rose-200 light_sakura:bg-rose-100/10">
          <p className="text-xs font-black text-teal-400 uppercase tracking-wider light_sakura:text-rose-600">
            {t("admin.add_category_title")}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <InputField label={t("admin.key_label")} value={addForm.key}
              onChange={v => setAddForm(f => ({ ...f, key: v }))} placeholder="misal: transport_online" />
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1 light_sakura:text-slate-500">{t("admin.type_label")}</label>
              <select
                value={addForm.type}
                onChange={e => setAddForm(f => ({ ...f, type: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl text-xs bg-slate-900 border border-slate-800 text-slate-300 focus:outline-none cursor-pointer light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-700"
              >
                <option value="income">Income</option>
                <option value="expense">Expense</option>
                <option value="both">Both</option>
              </select>
            </div>
            <InputField label={t("admin.label_id_label")} value={addForm.label_id}
              onChange={v => setAddForm(f => ({ ...f, label_id: v }))} placeholder="misal: Transportasi Online" />
            <InputField label={t("admin.label_en_label")} value={addForm.label_en}
              onChange={v => setAddForm(f => ({ ...f, label_en: v }))} placeholder="misal: Online Transport" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAddForm(false)}
              className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-800 text-slate-400 hover:bg-slate-900 cursor-pointer light_sakura:border-rose-200 light_sakura:text-slate-500">
              {t("admin.cancel_btn")}
            </button>
            <button onClick={handleAdd}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-teal-500/20 border border-teal-500/30 text-teal-400 hover:bg-teal-500/30 cursor-pointer light_sakura:bg-rose-200 light_sakura:border-rose-300 light_sakura:text-rose-600">
              {t("admin.save_category_btn")}
            </button>
          </div>
        </div>
      )}

      {/* Category List */}
      {loading ? (
        <div className="py-12 text-center text-slate-500 text-sm light_sakura:text-rose-500">{t("admin.loading")}</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/40 light_sakura:border-rose-100 light_sakura:bg-white">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-[10px] font-black text-slate-400 uppercase tracking-wider light_sakura:border-rose-100 light_sakura:bg-rose-50/50 light_sakura:text-slate-500">
                <th className="px-4 py-3">{t("admin.table_key_col")}</th>
                <th className="px-4 py-3">{t("admin.table_label_id_col")}</th>
                <th className="px-4 py-3">{t("admin.table_label_en_col")}</th>
                <th className="px-4 py-3">{t("admin.table_type_col")}</th>
                <th className="px-4 py-3">{t("admin.table_status_col")}</th>
                <th className="px-4 py-3 text-right">{t("admin.table_actions_col")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 light_sakura:divide-rose-100">
              {categories.map(cat => (
                <tr key={cat.key} className={`transition-colors ${!cat.is_active ? "opacity-50" : ""} hover:bg-slate-900/20 light_sakura:hover:bg-rose-50/30`}>
                  <td className="px-4 py-3 font-mono text-[10px] text-slate-400 light_sakura:text-slate-500">{cat.key}</td>

                  {editingKey === cat.key ? (
                    <>
                      <td className="px-4 py-2">
                        <input value={editForm.label_id} onChange={e => setEditForm(f => ({ ...f, label_id: e.target.value }))}
                          className="w-full px-2 py-1 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-teal-500 light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-700" />
                      </td>
                      <td className="px-4 py-2">
                        <input value={editForm.label_en} onChange={e => setEditForm(f => ({ ...f, label_en: e.target.value }))}
                          className="w-full px-2 py-1 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-teal-500 light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-700" />
                      </td>
                      <td className="px-4 py-2">
                        <select value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value as any }))}
                          className="px-2 py-1 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-300 focus:outline-none cursor-pointer light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-700">
                          <option value="income">Income</option>
                          <option value="expense">Expense</option>
                          <option value="both">Both</option>
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <button onClick={() => setEditForm(f => ({ ...f, is_active: !f.is_active }))}
                          className={`flex items-center gap-1 text-[10px] font-bold cursor-pointer ${editForm.is_active ? "text-emerald-400" : "text-slate-500"}`}>
                          {editForm.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                          {editForm.is_active ? t("admin.status_active_col") : t("admin.status_inactive_col")}
                        </button>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => saveEdit(cat.key)}
                            className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 cursor-pointer">
                            <Check size={12} />
                          </button>
                          <button onClick={() => setEditingKey(null)}
                            className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-700 cursor-pointer">
                            <X size={12} />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-xs text-slate-300 light_sakura:text-slate-800">{cat.label_id || "—"}</td>
                      <td className="px-4 py-3 text-xs text-slate-400 light_sakura:text-slate-500">{cat.label_en || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase border
                          ${cat.type === "income" ? typeColors.income : cat.type === "expense" ? typeColors.expense : typeColors.both}`}>
                          {cat.type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold ${cat.is_active ? "text-emerald-400" : "text-slate-600"}`}>
                          {cat.is_active ? t("admin.status_active_col") : t("admin.status_inactive_col")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => startEdit(cat)}
                          className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer transition-colors light_sakura:border-rose-100 light_sakura:text-slate-500 light_sakura:hover:bg-rose-100">
                          <Pencil size={12} />
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const InputField: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string }> = ({ label, value, onChange, placeholder }) => {
  return (
    <div>
      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1 light_sakura:text-slate-500">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-xl text-xs bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500 light_sakura:bg-white light_sakura:border-rose-250 light_sakura:text-slate-800 light_sakura:placeholder-slate-400"
      />
    </div>
  );
};
