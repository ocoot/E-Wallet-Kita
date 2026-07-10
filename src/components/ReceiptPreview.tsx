import React, { useState, useEffect } from "react";
import { Receipt, Calendar, Store, CreditCard, Tag, Check, X, Edit3, Trash } from "lucide-react";
import { motion } from "motion/react";
import { useLanguage } from "../contexts/LanguageContext";
import { audioFeedback } from "../lib/audio";
import { useCategories } from "../hooks/useCategories";
import { DropdownField } from "./DropdownField";

interface ReceiptItem {
  name: string;
  qty: number;
  unit_price: number;
  subtotal: number;
}

interface ReceiptDraft {
  id?: string;
  merchant_name: string;
  receipt_date: string;
  total_amount: number;
  total_items: number;
  category: string;
  items: ReceiptItem[];
}

interface ReceiptPreviewProps {
  draft: ReceiptDraft;
  onApprove: (finalData: {
    amount: number;
    merchant_name: string;
    category: string;
    date: string;
    note: string;
  }) => void;
  onCancel: () => void;
}

export const ReceiptPreview: React.FC<ReceiptPreviewProps> = ({
  draft,
  onApprove,
  onCancel,
}) => {
  const { t, locale } = useLanguage();
  const { categories } = useCategories();

  // Local editable states initialized with draft values
  const [merchantName, setMerchantName] = useState(draft.merchant_name || "");
  const [amount, setAmount] = useState<number>(draft.total_amount || 0);
  const [date, setDate] = useState(() => {
    if (!draft.receipt_date) return new Date().toISOString().split("T")[0];
    try {
      return new Date(draft.receipt_date).toISOString().split("T")[0];
    } catch {
      return new Date().toISOString().split("T")[0];
    }
  });

  const [category, setCategory] = useState(draft.category || "other");
  const [note, setNote] = useState(() => {
    // Elegant default note with total items
    return `${draft.total_items || draft.items?.length || 0} item barang (${draft.merchant_name || ""})`;
  });

  const [isEditingItems, setIsEditingItems] = useState(false);
  const [items, setItems] = useState<ReceiptItem[]>(draft.items || []);

  const expenseCategories = categories.filter(c => c.type === 'expense' || c.type === 'both');

  // Sync category if draft.category is loaded later or if first load
  useEffect(() => {
    if (draft.category && !category) {
      setCategory(draft.category);
    }
  }, [draft.category]);

  // Format IDR Helper
  const formatIDR = (num: number) => {
    return "Rp" + Math.round(num).toLocaleString("id-ID");
  };

  const handleUpdateItem = (index: number, field: keyof ReceiptItem, val: string | number) => {
    const updated = [...items];
    const item = { ...updated[index] };
    
    if (field === "name") {
      item.name = String(val);
    } else if (field === "qty") {
      item.qty = Math.max(1, Number(val) || 1);
      item.subtotal = item.qty * item.unit_price;
    } else if (field === "unit_price") {
      item.unit_price = Math.max(0, Number(val) || 0);
      item.subtotal = item.qty * item.unit_price;
    }
    
    updated[index] = item;
    setItems(updated);

    // Dynamic auto recalculate total amount
    const newTotal = updated.reduce((sum, item) => sum + item.subtotal, 0);
    setAmount(newTotal);
  };

  const handleDeleteItem = (index: number) => {
    audioFeedback.playDullPluck();
    const updated = items.filter((_, i) => i !== index);
    setItems(updated);
    const newTotal = updated.reduce((sum, item) => sum + item.subtotal, 0);
    setAmount(newTotal);
  };

  const handleSave = () => {
    audioFeedback.playChime();
    
    // Construct list items into a descriptive note if desired
    let finalNote = note.trim();
    if (!finalNote) {
      finalNote = `${items.length} item dari ${merchantName}`;
    }

    onApprove({
      amount: Number(amount) || 0,
      merchant_name: merchantName.trim() || draft.merchant_name,
      category,
      date,
      note: finalNote,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="p-6 md:p-8 rounded-3xl border bg-slate-900 border-slate-800 light_sakura:bg-white light_sakura:border-rose-100 shadow-xl space-y-6 max-w-xl mx-auto"
    >
      {/* Receipt Header Badge */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-4 light_sakura:border-rose-100/50">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl light_sakura:bg-rose-50 light_sakura:text-rose-500">
            <Receipt size={20} />
          </div>
          <div>
            <h3 className="font-sans font-bold text-lg text-white light_sakura:text-slate-800">
              {t("transaction.review_title")}
            </h3>
            <p className="font-sans text-xs text-slate-400 light_sakura:text-slate-500">
              {t("transaction.review_subtitle")}
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            audioFeedback.playDullPluck();
            onCancel();
          }}
          className="p-2 text-slate-500 hover:text-white rounded-xl hover:bg-slate-800/50 cursor-pointer transition-all light_sakura:hover:bg-slate-100"
        >
          <X size={18} />
        </button>
      </div>

      {/* Structured Mock Cashier Struk */}
      <div className="relative p-5 rounded-2xl bg-slate-950 border border-slate-800/60 light_sakura:bg-slate-50/50 light_sakura:border-rose-100/40 font-mono text-xs space-y-4">
        {/* Merchant Info Edit */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Merchant Name */}
            <div className="space-y-1">
              <label className="text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-500 uppercase tracking-widest flex items-center gap-1.5 font-bold">
                <Store size={10} />
                <span>{t("transaction.merchant_label")}</span>
              </label>
              <input
                type="text"
                value={merchantName}
                onChange={(e) => setMerchantName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white focus:border-indigo-500 outline-none light_sakura:bg-white light_sakura:border-rose-200/60 light_sakura:text-slate-800"
              />
            </div>

            {/* Date */}
            <div className="space-y-1">
              <label className="text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-500 uppercase tracking-widest flex items-center gap-1.5 font-bold">
                <Calendar size={10} />
                <span>{t("transaction.date_label")}</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white focus:border-indigo-500 outline-none light_sakura:bg-white light_sakura:border-rose-200/60 light_sakura:text-slate-800"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Category selection */}
            <div className="space-y-1">
              <label className="text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-500 uppercase tracking-widest flex items-center gap-1.5 font-bold">
                <Tag size={10} />
                <span>{t("transaction.category_label")}</span>
              </label>
              <DropdownField
                value={category}
                onChange={setCategory}
                options={expenseCategories.map((cat) => ({
                  value: cat.key,
                  label: locale === "id" ? (cat.label_id || cat.key) : (cat.label_en || cat.key),
                }))}
              />
            </div>

            {/* Dynamic Total Amount */}
            <div className="space-y-1">
              <label className="text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-500 uppercase tracking-widest flex items-center gap-1.5 font-bold">
                <CreditCard size={10} />
                <span>{t("transaction.amount_label")}</span>
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white focus:border-indigo-500 outline-none font-bold text-emerald-400 light_sakura:bg-white light_sakura:border-rose-200/60 light_sakura:text-slate-800"
              />
            </div>
          </div>

          {/* Custom Note description */}
          <div className="space-y-1">
            <label className="text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-500 uppercase tracking-widest flex items-center gap-1.5 font-bold">
              <span>{t("transaction.note_label")}</span>
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Indomaret 5 item..."
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white focus:border-indigo-500 outline-none light_sakura:bg-white light_sakura:border-rose-200/60 light_sakura:text-slate-800"
            />
          </div>
        </div>

        {/* Dash divider */}
        <div className="border-t border-dashed border-slate-800 my-4 light_sakura:border-rose-200/70" />

        {/* Item Roster heading */}
        <div className="flex items-center justify-between text-slate-400 light_sakura:text-slate-500 text-[clamp(0.5625rem,2.6vw,0.625rem)] uppercase font-bold tracking-wider mb-2">
          <span>{t("transaction.items_heading")}</span>
          <button
            onClick={() => {
              audioFeedback.playClick();
              setIsEditingItems(!isEditingItems);
            }}
            className="text-indigo-400 hover:text-indigo-300 light_sakura:text-rose-500 cursor-pointer flex items-center gap-1"
          >
            <Edit3 size={11} />
            <span>{isEditingItems ? t("transaction.done_list") : t("transaction.edit_list")}</span>
          </button>
        </div>

        {/* Items List */}
        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
          {items.length === 0 ? (
            <p className="text-slate-500 italic text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-center py-2">
              {t("transaction.no_items")}
            </p>
          ) : (
            items.map((item, idx) => (
              <div key={idx} className="flex flex-col space-y-1 p-2 rounded-lg bg-slate-900/40 border border-slate-900 light_sakura:bg-white light_sakura:border-rose-100">
                {isEditingItems ? (
                  <div className="space-y-1.5">
                    {/* Item Name */}
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => handleUpdateItem(idx, "name", e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white outline-none light_sakura:bg-slate-50 light_sakura:border-rose-100 light_sakura:text-slate-800 text-[clamp(0.6188rem,2.86vw,0.6875rem)]"
                    />
                    {/* Item Math details */}
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 w-2/5">
                        <span className="text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-500">Qty:</span>
                        <input
                          type="number"
                          value={item.qty}
                          onChange={(e) => handleUpdateItem(idx, "qty", parseInt(e.target.value) || 1)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-white outline-none text-center text-[clamp(0.6188rem,2.86vw,0.6875rem)] light_sakura:bg-slate-50"
                        />
                      </div>
                      <div className="flex items-center gap-1 w-3/5">
                        <span className="text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-500">Price:</span>
                        <input
                          type="number"
                          value={item.unit_price}
                          onChange={(e) => handleUpdateItem(idx, "unit_price", parseInt(e.target.value) || 0)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-white outline-none text-right text-[clamp(0.6188rem,2.86vw,0.6875rem)] light_sakura:bg-slate-50"
                        />
                      </div>
                      <button
                        onClick={() => handleDeleteItem(idx)}
                        className="p-1 hover:text-red-400 text-slate-500 transition-colors cursor-pointer"
                        title="Delete Item"
                      >
                        <Trash size={12} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between text-[clamp(0.6188rem,2.86vw,0.6875rem)]">
                    <div className="space-y-0.5 max-w-[70%]">
                      <p className="text-slate-200 light_sakura:text-slate-800 font-bold truncate">
                        {item.name}
                      </p>
                      <p className="text-slate-500 light_sakura:text-slate-400 text-[clamp(0.5625rem,2.6vw,0.625rem)]">
                        {item.qty} pcs x {formatIDR(item.unit_price)}
                      </p>
                    </div>
                    <span className="text-slate-300 light_sakura:text-slate-700 font-semibold self-center">
                      {formatIDR(item.subtotal)}
                    </span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Paper tearing bottom effect deco */}
        <div className="pt-2 border-t border-dashed border-slate-800 flex justify-between font-bold text-white light_sakura:border-rose-200 light_sakura:text-slate-800">
          <span>{t("transaction.sum_label")}</span>
          <span className="text-emerald-400">{formatIDR(amount)}</span>
        </div>
      </div>

      {/* Button controls */}
      <div className="flex gap-3">
        <button
          onClick={() => {
            audioFeedback.playDullPluck();
            onCancel();
          }}
          className="flex-1 cursor-pointer py-3.5 px-4 bg-slate-800 hover:bg-slate-700/80 text-slate-300 rounded-xl font-sans text-xs font-bold flex items-center justify-center gap-2 transition-all border border-slate-800 light_sakura:bg-slate-100 light_sakura:text-slate-700 light_sakura:hover:bg-slate-200/80 light_sakura:border-transparent"
        >
          <X size={14} />
          <span>{t("transaction.discard")}</span>
        </button>

        <button
          onClick={handleSave}
          disabled={amount <= 0 || !merchantName}
          className="flex-2 cursor-pointer py-3.5 px-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-sans text-xs font-bold shadow-lg shadow-indigo-600/15 flex items-center justify-center gap-2 transition-all disabled:opacity-30 disabled:pointer-events-none light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400"
        >
          <Check size={14} />
          <span>{t("transaction.save")}</span>
        </button>
      </div>
    </motion.div>
  );
};
