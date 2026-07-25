import React, { useState, useEffect, useCallback } from "react";
import { AdminBackBar } from "../components/AdminBackBar";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { useAdmin } from "../hooks/useAdmin";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { ErrorState } from "../components/ErrorState";
import { ScrollableTableWrapper } from "../components/ScrollableTableWrapper";
import { DropdownField } from "../components/DropdownField";
import { Button } from "../components/ui/Button";
import { BADGE_SIZE_CLASSES } from "../components/ui/Badge";
import { Plus, Pencil, Check, X, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { reportFrontendError } from "../lib/errorReporter";

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
  const { tokens, cx } = useThemeTokens();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState(false);
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
  const [pageSize, setPageSize] = useState<number | "all">(5);
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [pageSize, categories.length]);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    setCategoriesError(false);
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("priority", { ascending: false })
      .order("type")
      .order("key");
    if (error) { 
      showToast(t("toast.error_general"), "error"); 
      setCategoriesError(true);
      void reportFrontendError({
        source: "frontend:admin-category",
        message: error.message,
        context: { action: "load-categories" },
      });
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
      if (error) {
        showToast(error.message, "error");
        void reportFrontendError({
          source: "frontend:admin-category",
          message: error.message,
          context: { action: "save-edit", key },
        });
        return;
      }
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
      if (error) {
        showToast(error.message, "error");
        void reportFrontendError({
          source: "frontend:admin-category",
          message: error.message,
          context: { action: "add-category", key: addForm.key },
        });
        return;
      }
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
      <div className="relative">
        <div>
          <AdminBackBar />
        </div>
      </div>

      {/* Header wrapped in a solid card surface (bukan lagi teks mengambang
          langsung di atas ribbon gradient) supaya kontras subtitle terjamin. */}
      <div className={cx("p-6 sm:p-7 lg:p-8 rounded-2xl border shadow-sm", tokens.surface.card, tokens.border.accent)}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className={cx("font-sans font-bold text-2xl tracking-tight", tokens.text.heading)}>
              {t("admin.category_manager_title")}
            </h1>
            <p className={cx("text-sm mt-1", tokens.text.muted)}>
              {t("admin.category_manager_desc")}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={loadCategories}
              className={cx("p-2 rounded-xl border cursor-pointer transition-colors", tokens.text.label, tokens.border.strong, tokens.hover.surface)}
            >
              <RefreshCw size={16} />
            </button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowAddForm(v => !v)}
              icon={<Plus size={16} />}
              className="rounded-xl"
            >
              {t("admin.add_category")}
            </Button>
          </div>
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className={cx("p-8 space-y-6 rounded-2xl border shadow-sm", tokens.surface.card, tokens.border.accent)}>
          <h3 className={cx("font-semibold", tokens.text.onSurface)}>{t("admin.add_category_title")}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InputField label={t("admin.key_label")} value={addForm.key}
              onChange={v => setAddForm(f => ({ ...f, key: v }))} placeholder="e.g., transport_online" />
            <div>
              <label className={cx("block text-sm font-medium mb-1.5", tokens.text.secondary)}>{t("admin.type_label")}</label>
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
            <Button
              variant="secondary"
              onClick={() => setShowAddForm(false)}
              className="px-6 py-3 text-sm rounded-xl"
            >
              {t("admin.cancel_btn")}
            </Button>
            <Button
              variant="primary"
              onClick={handleAdd}
              className="px-6 py-3 text-sm rounded-xl"
            >
              {t("admin.save_category_btn")}
            </Button>
          </div>
        </div>
      )}

      {/* Category List */}
      {loading ? (
        <div className={cx("py-16 text-center text-sm", tokens.text.muted)}>{t("admin.loading")}</div>
      ) : categoriesError ? (
        <ErrorState onRetry={loadCategories} />
      ) : (
        <div className={cx("rounded-2xl border shadow-sm overflow-hidden", tokens.surface.card, tokens.border.default)}>
          <ScrollableTableWrapper>
            <table className={cx("w-full text-left text-sm min-w-[900px]", tokens.text.label)}>
              <thead className={cx("uppercase text-xs", tokens.text.muted, tokens.surface.subtle)}>
                <tr className={tokens.divide.tableColumn}>
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
              <tbody className={cx("divide-y", tokens.errorMonitor.tableDivide)}>
                {(pageSize === "all" ? categories : categories.slice(page * pageSize, (page + 1) * pageSize)).map(cat => (
                  <tr key={cat.key} className={cx("transition-colors", !cat.is_active ? "opacity-60" : "", tokens.errorMonitor.tableRowHover, tokens.divide.tableColumn)}>
                    <td className="px-6 py-4">
                      {editingKey === cat.key ? (
                        <input type="number" value={editForm.priority} onChange={e => setEditForm(f => ({ ...f, priority: Number(e.target.value) || 0 }))}
                          className={cx("w-16 px-2 py-1 text-xs border rounded", tokens.text.primary, tokens.surface.subtle, tokens.border.strong)} />
                      ) : (
                        <span className="text-xs text-slate-500">{cat.priority}</span>
                      )}
                    </td>
                    <td className={cx("px-6 py-4 font-mono text-xs", tokens.text.muted)}>{cat.key}</td>

                    {editingKey === cat.key ? (
                      <>
                        <td className="px-6 py-4">
                          <input value={editForm.label_id} onChange={e => setEditForm(f => ({ ...f, label_id: e.target.value }))}
                            className={cx("w-full px-3 py-2 text-sm border rounded-xl focus:ring-2 focus:ring-indigo-500", tokens.text.primary, tokens.surface.subtle, tokens.border.strong)} />
                        </td>
                        <td className="px-6 py-4">
                          <input value={editForm.label_en} onChange={e => setEditForm(f => ({ ...f, label_en: e.target.value }))}
                            className={cx("w-full px-3 py-2 text-sm border rounded-xl focus:ring-2 focus:ring-indigo-500", tokens.text.primary, tokens.surface.subtle, tokens.border.strong)} />
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <input placeholder="ID" value={editForm.description_id} onChange={e => setEditForm(f => ({ ...f, description_id: e.target.value }))}
                              className={cx("w-full px-2 py-1 text-xs border rounded", tokens.text.primary, tokens.surface.subtle, tokens.border.strong)} />
                            <input placeholder="EN" value={editForm.description_en} onChange={e => setEditForm(f => ({ ...f, description_en: e.target.value }))}
                              className={cx("w-full px-2 py-1 text-xs border rounded", tokens.text.primary, tokens.surface.subtle, tokens.border.strong)} />
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
                            className={`text-sm font-semibold cursor-pointer ${editForm.is_active ? tokens.text.success : tokens.text.muted}`}>
                            {editForm.is_active ? t("admin.status_active_col") : t("admin.status_inactive_col")}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => saveEdit(cat.key)}
                              className={cx("p-2 rounded-xl", tokens.adminCategoryManager.saveBtn, tokens.text.success)}>
                              <Check size={16} />
                            </button>
                            <button onClick={() => setEditingKey(null)}
                              className={cx("p-2 rounded-xl cursor-pointer", tokens.button.cancelSlate, tokens.text.mutedAlt)}>
                              <X size={16} />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className={cx("px-6 py-4 text-sm", tokens.text.primary)}>{cat.label_id || "—"}</td>
                        <td className={cx("px-6 py-4 text-sm", tokens.text.muted)}>{cat.label_en || "—"}</td>
                        <td className="px-6 py-4 text-xs text-slate-500 truncate max-w-[150px]" title={cat.description_id || ""}>
                          {cat.description_id || "—"}
                        </td>
                        <td className="px-6 py-4">
                          <span className={cx("rounded-full text-xs font-semibold capitalize", BADGE_SIZE_CLASSES.sm, tokens.errorMonitor.progressBg, tokens.text.mutedAlt)}>
                            {cat.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-sm font-semibold ${cat.is_active ? tokens.text.success : tokens.text.muted}`}>
                            {cat.is_active ? t("admin.status_active_col") : t("admin.status_inactive_col")}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button onClick={() => startEdit(cat)}
                            className={cx("p-2 rounded-xl border cursor-pointer transition-colors", tokens.text.muted, tokens.border.strong, tokens.hover.surface)}>
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
                  className={cx("p-2 rounded-xl border disabled:opacity-50 cursor-pointer", tokens.errorMonitor.paginationBtn, tokens.text.label, tokens.surface.card, tokens.hover.surface)}
                >
                  <ChevronLeft size={14} />
                </button>
                <span className={cx("font-medium", tokens.text.onSurface)}>{page + 1} / {Math.ceil(categories.length / pageSize)}</span>
                <button
                  disabled={(page + 1) * pageSize >= categories.length}
                  onClick={() => setPage(p => p + 1)}
                  className={cx("p-2 rounded-xl border disabled:opacity-50 cursor-pointer", tokens.errorMonitor.paginationBtn, tokens.text.label, tokens.surface.card, tokens.hover.surface)}
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
  const { tokens, cx } = useThemeTokens();
  return (
    <div>
      <label className={cx("block text-sm font-medium mb-1.5", tokens.text.secondary)}>{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={cx("w-full px-4 py-3 rounded-xl border focus:ring-2 focus:ring-indigo-500 placeholder-slate-500", tokens.text.primary, tokens.surface.subtle, tokens.border.strong)}
      />
    </div>
  );
};
