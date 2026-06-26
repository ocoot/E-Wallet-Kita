import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  BookOpen,
  Edit3,
  ListFilter,
  Volume2,
  VolumeX,
  Plus,
  Search,
  Filter,
  FileDown
} from "lucide-react";
import { audioFeedback } from "../lib/audio";

export const Onboarding: React.FC = () => {
  const { t, locale } = useLanguage();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Practice state for Step 2: Catat Mandiri
  const [practiceAmount, setPracticeAmount] = useState<string>("");
  const [practiceCategory, setPracticeCategory] = useState<string>("food_drink");
  const [practiceNote, setPracticeNote] = useState<string>("");
  const [hasPracticedCatat, setHasPracticedCatat] = useState<boolean>(false);

  // Practice state for Step 3: Riwayat Transaksi
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const playClick = () => {
    if (soundEnabled) {
      audioFeedback.playClick();
    }
  };

  const playSuccess = () => {
    if (soundEnabled) {
      audioFeedback.playChime();
    }
  };

  const handleNext = () => {
    playClick();
    if (currentStep < 3) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    playClick();
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSkip = () => {
    playClick();
    handleComplete();
  };

  const handleComplete = () => {
    localStorage.setItem("ewallet_onboarding_completed", "true");
    showToast(t("onboarding.start_toast"), "success");
    navigate("/dashboard");
  };

  const handlePracticeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!practiceAmount || Number(practiceAmount) <= 0) {
      showToast(t("toast.invalid_amount"), "error");
      return;
    }
    playSuccess();
    setHasPracticedCatat(true);
    showToast(t("onboarding.catat_practice_success"), "success");
  };

  const stepsCount = 6;

  // Mock data for Step 3 Riwayat Transaksi Filter Practice
  const mockTransactions = [
    {
      id: "mock-1",
      note: t("onboarding.history_mock_note_1"),
      category: "food_drink",
      type: "expense" as const,
      amount: 45000,
      date: "2026-06-25"
    },
    {
      id: "mock-2",
      note: t("onboarding.history_mock_note_2"),
      category: "salary",
      type: "income" as const,
      amount: 1500000,
      date: "2026-06-24"
    },
    {
      id: "mock-3",
      note: t("onboarding.history_mock_note_3"),
      category: "food_drink",
      type: "expense" as const,
      amount: 35000,
      date: "2026-06-23"
    },
    {
      id: "mock-4",
      note: t("onboarding.history_mock_note_4"),
      category: "transport",
      type: "expense" as const,
      amount: 20000,
      date: "2026-06-22"
    }
  ];

  // Filtered mock data
  const filteredMockTransactions = mockTransactions.filter((tx) => {
    const matchesFilter = selectedCategoryFilter === "all" || tx.category === selectedCategoryFilter;
    const matchesSearch = tx.note.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="min-h-[80vh] flex flex-col justify-center items-center py-6 sm:py-10 px-4 select-none">
      {/* Sound Controller and Progress indicator */}
      <div className="w-full max-w-3xl flex items-center justify-between mb-6 text-sm text-slate-400 light_sakura:text-slate-600">
        <div className="flex items-center gap-2">
          <BookOpen className="text-emerald-500 light_sakura:text-rose-500" size={18} />
          <span className="font-medium tracking-tight">
            {t("onboarding.step_of", { current: currentStep + 1, total: stepsCount })}
          </span>
        </div>
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 light_sakura:bg-white light_sakura:border-rose-100 light_sakura:hover:bg-rose-50/50 light_sakura:text-rose-600 transition-colors"
          title="Toggle Onboarding Sound"
        >
          {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
      </div>

      {/* Main Glassmorphic Container Card */}
      <div className="w-full max-w-3xl bg-slate-900/50 border border-slate-800/80 backdrop-blur-md rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden light_sakura:bg-white light_sakura:border-rose-100/80">
        {/* Ambient top decoration */}
        <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-500 to-transparent light_sakura:via-rose-400" />

        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            {/* STEP 0: WELCOME */}
            {currentStep === 0 && (
              <div className="text-center space-y-6">
                <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 light_sakura:bg-rose-500/10 light_sakura:text-rose-500 animate-pulse">
                  <Sparkles size={32} />
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white light_sakura:text-slate-800">
                    {t("onboarding.welcome_title")}
                  </h1>
                  <p className="text-slate-400 light_sakura:text-slate-600 max-w-lg mx-auto text-sm sm:text-base">
                    {t("onboarding.welcome_desc")}
                  </p>
                </div>

                <div className="bg-slate-950/40 rounded-2xl p-4 border border-slate-800/50 text-left space-y-3 max-w-md mx-auto light_sakura:bg-rose-50/30 light_sakura:border-rose-100">
                  <div className="flex items-start gap-3 text-sm text-slate-300 light_sakura:text-slate-700">
                    <span className="flex-shrink-0">{t("onboarding.welcome_point_1")}</span>
                  </div>
                  <div className="flex items-start gap-3 text-sm text-slate-300 light_sakura:text-slate-700">
                    <span className="flex-shrink-0">{t("onboarding.welcome_point_2")}</span>
                  </div>
                  <div className="flex items-start gap-3 text-sm text-slate-300 light_sakura:text-slate-700">
                    <span className="flex-shrink-0">{t("onboarding.welcome_point_3")}</span>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 1: CATAT MANDIRI PRACTICE */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 light_sakura:bg-rose-500/10 light_sakura:text-rose-500">
                    <Edit3 size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white light_sakura:text-slate-800">
                      {t("onboarding.catat_title")}
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-400 light_sakura:text-slate-600">
                      {t("onboarding.catat_desc")}
                    </p>
                  </div>
                </div>

                {/* Simulated form interface */}
                <div className="bg-slate-950/60 rounded-2xl p-5 border border-slate-800/80 light_sakura:bg-rose-50/20 light_sakura:border-rose-100">
                  <h3 className="text-xs font-semibold text-slate-400 light_sakura:text-slate-500 uppercase tracking-wider mb-4">
                    {t("onboarding.catat_practice_title")}
                  </h3>

                  <form onSubmit={handlePracticeSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Amount */}
                      <div>
                        <label className="block text-xs font-medium text-slate-400 light_sakura:text-slate-600 mb-1">
                          {t("onboarding.catat_practice_amount")} <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-semibold">Rp</span>
                          <input
                            type="number"
                            required
                            placeholder="e.g. 50000"
                            value={practiceAmount}
                            onChange={(e) => setPracticeAmount(e.target.value)}
                            disabled={hasPracticedCatat}
                            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-800 bg-slate-900 text-white focus:outline-none focus:border-emerald-500 light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-800 light_sakura:focus:border-rose-400 disabled:opacity-50"
                          />
                        </div>
                      </div>

                      {/* Category selection */}
                      <div>
                        <label className="block text-xs font-medium text-slate-400 light_sakura:text-slate-600 mb-1">
                          {t("onboarding.catat_practice_cat")}
                        </label>
                        <select
                          value={practiceCategory}
                          onChange={(e) => setPracticeCategory(e.target.value)}
                          disabled={hasPracticedCatat}
                          className="w-full px-3 py-2 text-sm rounded-xl border border-slate-800 bg-slate-900 text-white focus:outline-none focus:border-emerald-500 light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-800 light_sakura:focus:border-rose-400 disabled:opacity-50"
                        >
                          <option value="food_drink">{t("categories.food_drink")}</option>
                          <option value="transport">{t("categories.transport")}</option>
                          <option value="shopping">{t("categories.shopping")}</option>
                          <option value="other">{t("categories.other")}</option>
                        </select>
                      </div>
                    </div>

                    {/* Note description */}
                    <div>
                      <label className="block text-xs font-medium text-slate-400 light_sakura:text-slate-600 mb-1">
                        {t("onboarding.catat_practice_note")}
                      </label>
                      <input
                        type="text"
                        placeholder={t("onboarding.practice_note_placeholder")}
                        value={practiceNote}
                        onChange={(e) => setPracticeNote(e.target.value)}
                        disabled={hasPracticedCatat}
                        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-800 bg-slate-900 text-white focus:outline-none focus:border-emerald-500 light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-800 light_sakura:focus:border-rose-400 disabled:opacity-50"
                      />
                    </div>

                    {!hasPracticedCatat ? (
                      <button
                        type="submit"
                        className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400 shadow-lg shadow-emerald-500/20 light_sakura:shadow-rose-500/20"
                      >
                        <Plus size={16} />
                        {t("onboarding.catat_practice_btn")}
                      </button>
                    ) : (
                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-2.5 text-xs sm:text-sm font-medium light_sakura:bg-rose-500/10 light_sakura:border-rose-500/20 light_sakura:text-rose-600">
                        <CheckCircle2 size={18} className="flex-shrink-0 text-emerald-500 light_sakura:text-rose-500" />
                        <span>{t("onboarding.catat_practice_success")}</span>
                      </div>
                    )}
                  </form>
                </div>
              </div>
            )}

            {/* STEP 2: RIWAYAT TRANSAKSI AND FILTERS */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 light_sakura:bg-rose-500/10 light_sakura:text-rose-500">
                    <ListFilter size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white light_sakura:text-slate-800">
                      {t("onboarding.history_title")}
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-400 light_sakura:text-slate-600">
                      {t("onboarding.history_desc")}
                    </p>
                  </div>
                </div>

                {/* Bullet items explaining ledger utilities */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-300 light_sakura:text-slate-700">
                  <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/40 light_sakura:bg-rose-50/10 light_sakura:border-rose-100">
                    {t("onboarding.history_feature_1")}
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/40 light_sakura:bg-rose-50/10 light_sakura:border-rose-100">
                    {t("onboarding.history_feature_2")}
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/40 light_sakura:bg-rose-50/10 light_sakura:border-rose-100">
                    {t("onboarding.history_feature_3")}
                  </div>
                </div>

                {/* Simulated Ledger Interaction */}
                <div className="bg-slate-950/60 rounded-2xl p-5 border border-slate-800/80 space-y-4 light_sakura:bg-rose-50/20 light_sakura:border-rose-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xs font-semibold text-slate-400 light_sakura:text-slate-500 uppercase tracking-wider">
                        {t("onboarding.history_practice_title")}
                      </h3>
                      <p className="text-[10px] sm:text-xs text-slate-500 light_sakura:text-slate-600">
                        {t("onboarding.history_practice_desc")}
                      </p>
                    </div>

                    {/* Quick Mock Download PDF Button */}
                    <button
                      type="button"
                      onClick={() => {
                        playSuccess();
                        showToast(t("onboarding.simulated_export_success"), "success");
                      }}
                      className="self-start sm:self-auto py-1 px-3 rounded-lg border border-slate-800 hover:border-slate-700 text-xs text-slate-300 flex items-center gap-1.5 light_sakura:border-rose-200 light_sakura:text-rose-600 light_sakura:hover:bg-rose-50 transition-colors"
                    >
                      <FileDown size={14} />
                      <span>{t("history.export_menu_label")}</span>
                    </button>
                  </div>

                  {/* Search and filter Controls mock */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                      <input
                        type="text"
                        placeholder={t("history.search_placeholder")}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-800 bg-slate-900 text-white focus:outline-none focus:border-emerald-500 light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-800"
                      />
                    </div>

                    {/* Filter Category Tabs */}
                    <div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0">
                      {[
                        { key: "all", label: t("onboarding.history_filter_all") },
                        { key: "food_drink", label: t("categories.food_drink") },
                        { key: "salary", label: t("categories.salary") }
                      ].map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => {
                            playClick();
                            setSelectedCategoryFilter(item.key);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                            selectedCategoryFilter === item.key
                              ? "bg-emerald-500 text-white light_sakura:bg-rose-500"
                              : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-300 light_sakura:bg-white light_sakura:border-rose-100 light_sakura:text-slate-600"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Simulated ledger rows */}
                  <div className="border border-slate-800/80 rounded-xl overflow-hidden light_sakura:border-rose-100">
                    <div className="grid grid-cols-4 gap-2 px-3 py-2 bg-slate-900/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider light_sakura:bg-rose-100/30 light_sakura:text-slate-600">
                      <span>{t("history.col_date")}</span>
                      <span className="col-span-2">{t("history.search_label")}</span>
                      <span className="text-right">{t("history.col_amount")}</span>
                    </div>

                    <div className="divide-y divide-slate-800/60 light_sakura:divide-rose-50">
                      {filteredMockTransactions.length > 0 ? (
                        filteredMockTransactions.map((tx) => (
                          <div
                            key={tx.id}
                            className="grid grid-cols-4 gap-2 px-3 py-2.5 items-center text-xs text-slate-300 light_sakura:text-slate-800"
                          >
                            <span className="text-slate-500 font-mono text-[10px]">{tx.date}</span>
                            <div className="col-span-2 flex flex-col min-w-0">
                              <span className="font-semibold truncate">{tx.note}</span>
                              <span className="text-[10px] text-slate-500">
                                {t(`categories.${tx.category}`)}
                              </span>
                            </div>
                            <span
                              className={`text-right font-semibold font-mono ${
                                tx.type === "income" ? "text-emerald-400 light_sakura:text-emerald-600" : "text-rose-400 light_sakura:text-rose-500"
                              }`}
                            >
                              {tx.type === "income" ? "+" : "-"}
                              Rp{tx.amount.toLocaleString()}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="py-4 text-center text-xs text-slate-500">
                          {t("history.no_transactions")}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: BUDGET */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 light_sakura:bg-rose-500/10 light_sakura:text-rose-500">
                    <ListFilter size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white light_sakura:text-slate-800">
                      {t("onboarding.budget_title")}
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-400 light_sakura:text-slate-600">
                      {t("onboarding.budget_desc")}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 text-xs text-slate-300 light_sakura:text-slate-700">
                  <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/40 light_sakura:bg-rose-50/10 light_sakura:border-rose-100">
                    {t("onboarding.budget_feature_1")}
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/40 light_sakura:bg-rose-50/10 light_sakura:border-rose-100">
                    {t("onboarding.budget_feature_2")}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: BILLS */}
            {currentStep === 4 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 light_sakura:bg-rose-500/10 light_sakura:text-rose-500">
                    <ListFilter size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white light_sakura:text-slate-800">
                      {t("onboarding.bill_title")}
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-400 light_sakura:text-slate-600">
                      {t("onboarding.bill_desc")}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 text-xs text-slate-300 light_sakura:text-slate-700">
                  <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/40 light_sakura:bg-rose-50/10 light_sakura:border-rose-100">
                    {t("onboarding.bill_feature_1")}
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/40 light_sakura:bg-rose-50/10 light_sakura:border-rose-100">
                    {t("onboarding.bill_feature_2")}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 5: WRAP UP / GET STARTED */}
            {currentStep === 5 && (
              <div className="text-center space-y-6 py-4">
                <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 light_sakura:bg-rose-500/10 light_sakura:text-rose-500 animate-bounce">
                  <CheckCircle2 size={32} />
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white light_sakura:text-slate-800">
                    {t("onboarding.concl_title")}
                  </h1>
                  <p className="text-slate-400 light_sakura:text-slate-600 max-w-lg mx-auto text-sm sm:text-base">
                    {t("onboarding.concl_desc")}
                  </p>
                </div>

                <div className="max-w-md mx-auto p-4 rounded-2xl bg-gradient-to-br from-slate-950 to-slate-900 border border-slate-800/80 text-left light_sakura:from-rose-50/40 light_sakura:to-rose-50/10 light_sakura:border-rose-100">
                  <p className="text-xs sm:text-sm font-medium text-emerald-400 light_sakura:text-rose-600">
                    {t("onboarding.concl_tip")}
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Stepper Buttons Controls */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-800/50 light_sakura:border-rose-100">
          <button
            onClick={handleSkip}
            className="text-slate-500 hover:text-slate-400 text-xs sm:text-sm font-medium transition-colors light_sakura:text-slate-500 light_sakura:hover:text-slate-700"
          >
            {t("onboarding.btn_skip")}
          </button>

          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button
                onClick={handleBack}
                className="py-2 px-4 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 light_sakura:border-rose-200 light_sakura:text-rose-600 light_sakura:hover:bg-rose-50/50"
              >
                <ArrowLeft size={16} />
                {t("onboarding.btn_prev")}
              </button>
            )}

            <button
              onClick={handleNext}
              className="py-2 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400 shadow-lg shadow-emerald-500/20 light_sakura:shadow-rose-500/20"
            >
              <span>{currentStep === 5 ? t("onboarding.btn_finish") : t("onboarding.btn_next")}</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
