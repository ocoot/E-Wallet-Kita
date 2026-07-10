import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { useAdmin } from "../hooks/useAdmin";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { ScrollableTableWrapper } from "../components/ScrollableTableWrapper";
import { DropdownField } from "../components/DropdownField";
import { Tag, Plus, Pencil, Check, X, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

interface Category {
  id: string;
  key: string;
  type: "income" | "expense" | "both";
  label_id: string | null;
  label_en: string | null;
  description_id: string | null;
  description_en: string | null;
  priority: number;
  is_active: boolean;
}

export const AdminCategoryManager: React.FC = () => {
  const { showToast } = useToast();
  const { t, locale } = useLanguage();
  const { isAdmin } = useAdmin();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ 
    label_id: "", 
    label_en: "", 
    type: "expense" as string, 
    is_active: true,
    description_id: "",
    description_en: "",
    priority: 100
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ 
    key: "", 
    label_id: "", 
    label_en: "", 
    type: "expense",
    description_id: "",
    description_en: "",
    priority: 100
  });
  const [savingAction, setSavingAction] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: ""
  });
  const [pageSize, setPageSize] = useState<number | "all">(10);
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [pageSize, categories.length]);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("priority", { ascending: false })
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
      description_id: cat.description_id || "",
      description_en: cat.description_en || "",
      priority: cat.priority ?? 100,
    });
  };

  const saveEdit = async (key: string) => {
    setSavingAction({ isOpen: true, message: "Saving category..." });
    try {
      const { error } = await supabase.rpc("admin_update_category", {
        p_key: key,
        p_label_id: editForm.label_id,
        p_label_en: editForm.label_en,
        p_type: editForm.type,
        p_is_active: editForm.is_active,
        p_description_id: editForm.description_id || null,
        p_description_en: editForm.description_en || null,
        p_priority: editForm.priority,
      });
      if (error) { showToast(error.message, "error"); return; }
      showToast("Category updated", "success");
      setEditingKey(null);
      loadCategories();
    } finally {
      setSavingAction({ isOpen: false, message: "" });
    }
  };

  const handleAdd = async () => {
    if (!addForm.key || !addForm.label_id) {
      showToast("Key & Label required", "error");
      return;
    }
    setSavingAction({ isOpen: true, message: "Adding new category..." });
    try {
      const { error } = await supabase.rpc("admin_add_category", {
        p_key: addForm.key.toLowerCase().replace(/\s+/g, "_"),
        p_label_id: addForm.label_id,
        p_label_en: addForm.label_en,
        p_type: addForm.type,
        p_description_id: addForm.description_id || null,
        p_description_en: addForm.description_en || null,
        p_priority: addForm.priority,
      });
      if (error) { showToast(error.message, "error"); return; }
      showToast("Category added", "success");
      setShowAddForm(false);
      setAddForm({ 
        key: "", 
        label_id: "", 
        label_en: "", 
        type: "expense",
        description_id: "",
        description_en: "",
        priority: 100
      });
      loadCategories();
    } finally {
      setSavingAction({ isOpen: false, message: "" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Wrapped in One Card Container */}
      <div className="bg-slate-900 light_sakura:bg-white p-6 md:p-8 rounded-3xl border border-slate-800 light_sakura:border-slate-100 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-sans font-bold text-2xl tracking-tight text-white light_sakura:text-slate-900 flex items-center gap-2">
              <Tag className="text-purple-500" size={24} />
              {t("admin.category_manager_title")}
            </h1>
            <p className="text-sm text-slate-400 light_sakura:text-slate-500 mt-1">
              {t("admin.category_manager_desc")}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={loadCategories}
              className="p-2 rounded-xl border border-slate-700 light_sakura:border-slate-200 hover:bg-slate-800 light_sakura:hover:bg-slate-50 text-slate-300 light_sakura:text-slate-600 cursor-pointer transition-colors"
            >
              <RefreshCw size={16} />
            </button>
            <button
              onClick={() => setShowAddForm(v => !v)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer transition-colors"
            >
              <Plus size={16} /> {t("admin.add_category")}
            </button>
          </div>
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-slate-900 light_sakura:bg-white p-8 rounded-3xl border border-slate-800 light_sakura:border-slate-100 shadow-sm space-y-6">
          <h3 className="font-semibold text-white light_sakura:text-slate-800">{t("admin.add_category_title")}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InputField label={t("admin.key_label")} value={addForm.key}
              onChange={v => setAddForm(f => ({ ...f, key: v }))} placeholder="e.g., transport_online" />
            <div>
              <label className="block text-sm font-medium text-slate-300 light_sakura:text-slate-700 mb-1.5">{t("admin.type_label")}</label>
              <DropdownField
                value={addForm.type}
                onChange={(v) => setAddForm(f => ({ ...f, type: v }))}
                options={[
                  { value: "income", label: "Income" },
                  { value: "expense", label: "Expense" },
                  { value: "both", label: "Both" },
                ]}
              />
            </div>
            <InputField label={t("admin.label_id_label")} value={addForm.label_id}
              onChange={v => setAddForm(f => ({ ...f, label_id: v }))} placeholder="e.g., Online Transport" />
            <InputField label={t("admin.label_en_label")} value={addForm.label_en}
              onChange={v => setAddForm(f => ({ ...f, label_en: v }))} placeholder="e.g., Online Transport" />
            <InputField label="Description (ID)" value={addForm.description_id}
              onChange={v => setAddForm(f => ({ ...f, description_id: v }))} placeholder="Context for AI (ID)..." />
            <InputField label="Description (EN)" value={addForm.description_en}
              onChange={v => setAddForm(f => ({ ...f, description_en: v }))} placeholder="Context for AI (EN)..." />
            <InputField label="Priority" value={String(addForm.priority)}
              onChange={v => setAddForm(f => ({ ...f, priority: Number(v) || 0 }))} placeholder="100" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAddForm(false)}
              className="px-6 py-3 text-sm font-semibold rounded-xl text-slate-400 light_sakura:text-slate-600 hover:bg-slate-800 light_sakura:hover:bg-slate-50 cursor-pointer">
              {t("admin.cancel_btn")}
            </button>
            <button onClick={handleAdd}
              className="px-6 py-3 text-sm font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer">
              {t("admin.save_category_btn")}
            </button>
          </div>
        </div>
      )}

      {/* Category List */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 light_sakura:text-slate-500 text-sm">{t("admin.loading")}</div>
      ) : (
        <div className="rounded-3xl border border-slate-800 light_sakura:border-slate-100 bg-slate-900 light_sakura:bg-white shadow-sm overflow-hidden">
          <ScrollableTableWrapper>
            <table className="w-full text-left text-sm text-slate-300 light_sakura:text-slate-600 min-w-[900px]">
              <thead className="bg-slate-800 light_sakura:bg-slate-50 text-slate-400 light_sakura:text-slate-500 uppercase text-xs">
                <tr>
                  <th className="px-6 py-4">Priority</th>
                  <th className="px-6 py-4">{t("admin.table_key_col")}</th>
                  <th className="px-6 py-4">{t("admin.table_label_id_col")}</th>
                  <th className="px-6 py-4">{t("admin.table_label_en_col")}</th>
                  <th className="px-6 py-4">Description</th>
                  <th className="px-6 py-4">{t("admin.table_type_col")}</th>
                  <th className="px-6 py-4">{t("admin.table_status_col")}</th>
                  <th className="px-6 py-4 text-right">{t("admin.table_actions_col")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 light_sakura:divide-slate-100">
                {(pageSize === "all" ? categories : categories.slice(page * pageSize, (page + 1) * pageSize)).map(cat => (
                  <tr key={cat.key} className={`transition-colors ${!cat.is_active ? "opacity-60" : ""} hover:bg-slate-800/50 light_sakura:hover:bg-slate-50/50`}>
                    <td className="px-6 py-4">
                      {editingKey === cat.key ? (
                        <input type="number" value={editForm.priority} onChange={e => setEditForm(f => ({ ...f, priority: Number(e.target.value) || 0 }))}
                          className="w-16 px-2 py-1 text-xs bg-slate-800 light_sakura:bg-slate-50 border border-slate-700 light_sakura:border-slate-200 rounded text-white light_sakura:text-slate-900" />
                      ) : (
                        <span className="text-xs text-slate-500">{cat.priority}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-400 light_sakura:text-slate-500">{cat.key}</td>

                    {editingKey === cat.key ? (
                      <>
                        <td className="px-6 py-4">
                          <input value={editForm.label_id} onChange={e => setEditForm(f => ({ ...f, label_id: e.target.value }))}
                            className="w-full px-3 py-2 text-sm bg-slate-800 light_sakura:bg-slate-50 border border-slate-700 light_sakura:border-slate-200 rounded-xl text-white light_sakura:text-slate-900 focus:ring-2 focus:ring-indigo-500" />
                        </td>
                        <td className="px-6 py-4">
                          <input value={editForm.label_en} onChange={e => setEditForm(f => ({ ...f, label_en: e.target.value }))}
                            className="w-full px-3 py-2 text-sm bg-slate-800 light_sakura:bg-slate-50 border border-slate-700 light_sakura:border-slate-200 rounded-xl text-white light_sakura:text-slate-900 focus:ring-2 focus:ring-indigo-500" />
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <input placeholder="ID" value={editForm.description_id} onChange={e => setEditForm(f => ({ ...f, description_id: e.target.value }))}
                              className="w-full px-2 py-1 text-xs bg-slate-800 light_sakura:bg-slate-50 border border-slate-700 light_sakura:border-slate-200 rounded text-white light_sakura:text-slate-900" />
                            <input placeholder="EN" value={editForm.description_en} onChange={e => setEditForm(f => ({ ...f, description_en: e.target.value }))}
                              className="w-full px-2 py-1 text-xs bg-slate-800 light_sakura:bg-slate-50 border border-slate-700 light_sakura:border-slate-200 rounded text-white light_sakura:text-slate-900" />
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <DropdownField
                            className="w-32"
                            value={editForm.type}
                            onChange={(v) => setEditForm(f => ({ ...f, type: v as any }))}
                            options={[
                              { value: "income", label: "Income" },
                              { value: "expense", label: "Expense" },
                              { value: "both", label: "Both" },
                            ]}
                          />
                        </td>
                        <td className="px-6 py-4">
                          <button onClick={() => setEditForm(f => ({ ...f, is_active: !f.is_active }))}
                            className={`text-sm font-semibold cursor-pointer ${editForm.is_active ? "text-emerald-400 light_sakura:text-emerald-600" : "text-slate-400 light_sakura:text-slate-500"}`}>
                            {editForm.is_active ? t("admin.status_active_col") : t("admin.status_inactive_col")}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => saveEdit(cat.key)}
                              className="p-2 rounded-xl bg-emerald-950/40 light_sakura:bg-emerald-50 text-emerald-400 light_sakura:text-emerald-600 hover:bg-emerald-950/60 light_sakura:hover:bg-emerald-100 cursor-pointer">
                              <Check size={16} />
                            </button>
                            <button onClick={() => setEditingKey(null)}
                              className="p-2 rounded-xl bg-slate-800 light_sakura:bg-slate-100 text-slate-400 light_sakura:text-slate-600 hover:bg-slate-700 light_sakura:hover:bg-slate-200 cursor-pointer">
                              <X size={16} />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4 text-sm text-white light_sakura:text-slate-900">{cat.label_id || "—"}</td>
                        <td className="px-6 py-4 text-sm text-slate-400 light_sakura:text-slate-500">{cat.label_en || "—"}</td>
                        <td className="px-6 py-4 text-xs text-slate-500 truncate max-w-[150px]" title={cat.description_id || ""}>
                          {cat.description_id || "—"}
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 light_sakura:bg-slate-100 text-slate-400 light_sakura:text-slate-600 capitalize">
                            {cat.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-sm font-semibold ${cat.is_active ? "text-emerald-400 light_sakura:text-emerald-600" : "text-slate-400 light_sakura:text-slate-500"}`}>
                            {cat.is_active ? t("admin.status_active_col") : t("admin.status_inactive_col")}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button onClick={() => startEdit(cat)}
                            className="p-2 rounded-xl border border-slate-700 light_sakura:border-slate-200 text-slate-400 light_sakura:text-slate-500 hover:bg-slate-800 light_sakura:hover:bg-slate-50 cursor-pointer transition-colors">
                            <Pencil size={16} />
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTableWrapper>
        </div>
      )}

      {/* Pagination Controls */}
      {!loading && (
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
          {pageSize !== "all" && categories.length > pageSize ? (
            <div className="flex items-center gap-4">
              <div>
                {page * pageSize + 1}–{Math.min((page + 1) * pageSize, categories.length)} dari {categories.length}
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                  className="p-2 rounded-xl bg-slate-900 light_sakura:bg-white border border-slate-800 light_sakura:border-slate-200 text-slate-300 light_sakura:text-slate-600 hover:bg-slate-800 light_sakura:hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="font-medium text-white light_sakura:text-slate-800">{page + 1} / {Math.ceil(categories.length / pageSize)}</span>
                <button
                  disabled={(page + 1) * pageSize >= categories.length}
                  onClick={() => setPage(p => p + 1)}
                  className="p-2 rounded-xl bg-slate-900 light_sakura:bg-white border border-slate-800 light_sakura:border-slate-200 text-slate-300 light_sakura:text-slate-600 hover:bg-slate-800 light_sakura:hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="text-slate-500 text-xs">
              {t("admin.showing_all_categories").replace("{count}", categories.length.toString())}
            </div>
          )}
        </div>
      )}
      <LoadingOverlay isOpen={savingAction.isOpen} message={savingAction.message} />
    </div>
  );
};

const InputField: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string }> = ({ label, value, onChange, placeholder }) => {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 light_sakura:text-slate-700 mb-1.5">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-3 rounded-xl border border-slate-700 light_sakura:border-slate-200 bg-slate-800 light_sakura:bg-slate-50 text-white light_sakura:text-slate-900 focus:ring-2 focus:ring-indigo-500 placeholder-slate-500"
      />
    </div>
  );
};
