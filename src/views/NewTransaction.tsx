import React, { useState, useEffect } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { dbService } from "../lib/db";
import { UserSession } from "../lib/auth";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { Modal } from "../components/Modal";
import { Plus, ArrowLeftRight, Calendar, DollarSign, FileText, CheckCircle } from "lucide-react";
import { motion, useAnimation } from "motion/react";
import { audioFeedback } from "../lib/audio";

import { useNavigate } from "react-router-dom";

interface NewTransactionProps {
  onTransactionAdded: () => void;
}

export const NewTransaction: React.FC<NewTransactionProps> = ({
  onTransactionAdded
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentUser: UserSession = {
    id: user?.id || "",
    display_name: user?.user_metadata?.full_name || "User",
    is_guest: user?.is_anonymous || false,
    preferred_language: "id",
    preferred_theme: "dark_obsidian"
  };
  const { t } = useLanguage();
  const { showToast } = useToast();
  const shakeControls = useAnimation();

  // Trigger shake animation
  const triggerShake = async () => {
    await shakeControls.start({
      x: [-5, 5, -5, 5, 0],
      transition: { duration: 0.4 }
    });
  };

  const [type, setType] = useState<"income" | "expense">("expense");
  const [category, setCategory] = useState("food_drink");
  const [amount, setAmount] = useState<number | "">("");
  const [date, setDate] = useState(() => {
    return new Date().toISOString().split("T")[0]; // default is today YYYY-MM-DD
  });
  const [note, setNote] = useState("");

  // Confirmation Modals State
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Re-adjust categories on type switch
  useEffect(() => {
    if (type === "income") {
      setCategory("salary");
    } else {
      setCategory("food_drink");
    }
  }, [type]);

  const incomeCategories = ["salary", "bonus", "other"];
  const expenseCategories = ["food_drink", "monthly_groceries", "vegetables", "bills", "other"];
  const activeCategories = type === "income" ? incomeCategories : expenseCategories;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validations
    if (!amount || amount <= 0 || isNaN(amount)) {
      audioFeedback.playDullPluck();
      triggerShake();
      showToast(t("toast.invalid_amount"), "error");
      return;
    }

    const enteredDate = new Date(date);
    const today = new Date();
    today.setHours(23, 59, 59, 999); // allow today
    if (enteredDate > today) {
      audioFeedback.playDullPluck();
      triggerShake();
      showToast(t("toast.invalid_date"), "error");
      return;
    }

    setIsConfirmOpen(true);
  };

  const handleExecuteSave = () => {
    setIsConfirmOpen(false);
    setIsLoading(true);

    setTimeout(() => {
      try {
        dbService.saveTransaction(
          currentUser.id,
          type,
          category,
          Number(amount),
          note.trim() || null,
          "manual",
          date
        );

        showToast(t("toast.success_save"), "success");
        
        // Reset inputs
        setAmount("");
        setNote("");
        setDate(new Date().toISOString().split("T")[0]);
        
        onTransactionAdded(); // Trigger global cache updates
        navigate("/dashboard"); // Go back to dashboard!
      } catch (err) {
        console.error(err);
        showToast(t("toast.error_general"), "error");
      } finally {
        setIsLoading(false);
      }
    }, 600);
  };

  // Helper currency formatter
  const formatIDR = (num: number) => {
    return "Rp" + Math.round(num).toLocaleString("id-ID");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      
      {/* Header Info */}
      <div className="flex flex-col">
        <h2 className="font-sans font-bold text-2xl tracking-tight text-white light_sakura:text-slate-900">
          {t("transaction.add_title")}
        </h2>
        <p className="font-sans text-sm text-gray-400 mt-1 light_sakura:text-slate-500">
          Masukkan detail transaksi arus kas rumah tangga Anda secara rapi.
        </p>
      </div>

      {/* Main card box form */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 rounded-3xl border bg-slate-900 border-slate-900 transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 shadow-xs"
      >
        <motion.div animate={shakeControls}>
          <form onSubmit={handleSubmit} className="space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* 1. Transaction Type selector */}
            <div className="space-y-1.5">
              <label className="font-sans text-xs font-bold text-gray-400 light_sakura:text-slate-600 uppercase tracking-wider flex items-center gap-2">
                <ArrowLeftRight size={14} />
                <span>{t("transaction.label_type")}</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    audioFeedback.playClick();
                    setType("expense");
                  }}
                  className={`py-3 rounded-xl font-sans text-xs font-bold transition-all cursor-pointer border
                    ${type === "expense" 
                      ? "bg-red-500/10 border-red-500 text-red-400" 
                      : "bg-slate-950 border-slate-800 text-gray-400 hover:bg-slate-900 light_sakura:bg-rose-50/20 light_sakura:border-rose-100 light_sakura:text-slate-500"
                    }`}
                >
                  {t("transaction.expense")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    audioFeedback.playClick();
                    setType("income");
                  }}
                  className={`py-3 rounded-xl font-sans text-xs font-bold transition-all cursor-pointer border
                    ${type === "income" 
                      ? "bg-emerald-500/10 border-emerald-500 text-emerald-400" 
                      : "bg-slate-950 border-slate-800 text-gray-400 hover:bg-slate-900 light_sakura:bg-rose-50/20 light_sakura:border-rose-100 light_sakura:text-slate-500"
                    }`}
                >
                  {t("transaction.income")}
                </button>
              </div>
            </div>

            {/* 2. Classification categories selector */}
            <div className="space-y-2">
              <label className="font-sans text-xs font-bold text-gray-400 light_sakura:text-slate-600 uppercase tracking-wider block">
                {t("transaction.label_category")}
              </label>
              <select
                value={category}
                onChange={(e) => {
                  audioFeedback.playClick();
                  setCategory(e.target.value);
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 font-sans text-xs text-white outline-none focus:border-indigo-500 transition-colors light_sakura:bg-slate-50 light_sakura:border-rose-100 light_sakura:text-slate-800"
              >
                {activeCategories.map((key) => (
                  <option key={key} value={key}>
                    {t(`categories.${key}`)}
                  </option>
                ))}
              </select>
            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* 3. Number value amount input */}
            <div className="space-y-1.5">
              <label className="font-sans text-xs font-bold text-gray-400 light_sakura:text-slate-600 uppercase tracking-wider flex items-center gap-2">
                <DollarSign size={14} />
                <span>{t("transaction.label_amount")}</span>
              </label>
              <input
                type="number"
                required
                min={1}
                placeholder="0"
                disabled={isLoading}
                value={amount}
                onChange={(e) => setAmount(e.target.value !== "" ? parseInt(e.target.value) || 0 : "")}
                className="w-full pl-4 pr-4 py-3 bg-slate-950 border border-slate-800 text-white rounded-xl font-sans text-xs outline-none focus:border-indigo-500 transition-colors light_sakura:bg-slate-50 light_sakura:border-rose-100 light_sakura:text-slate-800"
              />
            </div>

            {/* 4. Transaction date Calendar input */}
            <div className="space-y-1.5">
              <label className="font-sans text-xs font-bold text-gray-400 light_sakura:text-slate-600 uppercase tracking-wider flex items-center gap-2">
                <Calendar size={14} />
                <span>{t("transaction.label_date")}</span>
              </label>
              <input
                type="date"
                required
                disabled={isLoading}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full pl-4 pr-4 py-3 bg-slate-950 border border-slate-800 text-white rounded-xl font-sans text-xs outline-none focus:border-indigo-500 transition-colors light_sakura:bg-slate-50 light_sakura:border-rose-100 light_sakura:text-slate-800"
              />
            </div>

          </div>

          {/* 5. Optional Note text description input */}
          <div className="space-y-1.5">
            <label className="font-sans text-xs font-bold text-gray-400 light_sakura:text-slate-600 uppercase tracking-wider flex items-center gap-2">
              <FileText size={14} />
              <span>{t("transaction.label_note")}</span>
            </label>
            <textarea
              rows={3}
              placeholder={t("transaction.placeholder_note")}
              disabled={isLoading}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-4 py-3 bg-slate-950 border border-slate-800 text-white rounded-xl font-sans text-xs outline-none focus:border-indigo-500 transition-colors placeholder:text-gray-600 light_sakura:bg-slate-50 light_sakura:border-rose-100 light_sakura:text-slate-800"
            />
          </div>

          {/* Submit action button */}
          <button
            type="submit"
            disabled={isLoading || amount === "" || amount === 0}
            className="w-full cursor-pointer py-4 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white rounded-xl font-sans text-xs font-bold shadow-lg shadow-indigo-600/10 flex items-center justify-center gap-2 transition-all disabled:opacity-30 disabled:pointer-events-none light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400"
          >
            <Plus size={16} />
            <span>{t("transaction.btn_submit")}</span>
          </button>

        </form>
        </motion.div>
      </motion.div>

      {/* Confirmation Modal */}
      <Modal
        isOpen={isConfirmOpen}
        title={t("confirm.save_transaction_title")}
        description={t("confirm.save_transaction_desc", {
          amount: amount !== "" ? formatIDR(amount) : "Rp0",
          category: t(`categories.${category}`)
        })}
        type="info"
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        onConfirm={handleExecuteSave}
        onCancel={() => {
          audioFeedback.playClick();
          setIsConfirmOpen(false);
        }}
      />

      {/* Loading state indicator */}
      {isLoading && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center">
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col items-center gap-3 text-white">
            <span className="w-8 h-8 border-3 border-t-transparent border-indigo-500 rounded-full animate-spin" />
            <p className="font-sans text-xs tracking-wide">{t("common.loading")}</p>
          </div>
        </div>
      )}

    </div>
  );
};
