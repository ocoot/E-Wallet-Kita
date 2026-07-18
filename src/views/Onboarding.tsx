import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { useThemeTokens } from "../hooks/useThemeTokens";
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
  FileDown,
  PiggyBank,
  ReceiptText,
  Send,
  Wallet,
  Target,
  Coins,
  CalendarClock
} from "lucide-react";
import { audioFeedback } from "../lib/audio";
import { DropdownField } from "../components/DropdownField";

export const Onboarding: React.FC = () => {
  const { t, locale } = useLanguage();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { tokens, cx } = useThemeTokens();

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
    if (currentStep < stepsCount - 1) {
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

  const stepsCount = 11;

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
      <div className={cx("w-full max-w-3xl flex items-center justify-between mb-6 text-sm", tokens.text.mutedAlt)}>
        <div className="flex items-center gap-2">
          <BookOpen className={cx(tokens.text.successStrong)} size={18} />
          <span className="font-medium tracking-tight">
            {t("onboarding.step_of", { current: currentStep + 1, total: stepsCount })}
          </span>
        </div>
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className={cx("p-2 rounded-xl border transition-colors", tokens.onboarding.soundToggleBtn, tokens.surface.card, tokens.border.accent)}
          title="Toggle Onboarding Sound"
        >
          {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
      </div>

      {/* Main Glassmorphic Container Card */}
      <div className={cx("w-full max-w-3xl backdrop-blur-md rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden", tokens.onboarding.mainCardBgBorder)}>
        {/* Ambient top decoration */}
        <div className={cx("absolute top-0 inset-x-0 h-[2px]", tokens.onboarding.ambientGlow)} />

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
                <div className={cx("mx-auto w-16 h-16 rounded-full flex items-center justify-center animate-pulse", tokens.chip.accentEmerald)}>
                  <Sparkles size={32} />
                </div>
                <div className="space-y-2">
                  <h1 className={cx("text-2xl sm:text-3xl font-bold tracking-tight", tokens.text.onSurface)}>
                    {t("onboarding.welcome_title")}
                  </h1>
                  <p className={cx("max-w-lg mx-auto text-sm sm:text-base", tokens.text.mutedAlt)}>
                    {t("onboarding.welcome_desc")}
                  </p>
                </div>

                <div className={cx("rounded-2xl p-4 border text-left space-y-3 max-w-md mx-auto", tokens.onboarding.bulletFeatureItem, tokens.surface.sunken)}>
                  <div className={cx("flex items-start gap-3 text-sm", tokens.text.secondary)}>
                    <span className="flex-shrink-0">{t("onboarding.welcome_point_1")}</span>
                  </div>
                  <div className={cx("flex items-start gap-3 text-sm", tokens.text.secondary)}>
                    <span className="flex-shrink-0">{t("onboarding.welcome_point_2")}</span>
                  </div>
                  <div className={cx("flex items-start gap-3 text-sm", tokens.text.secondary)}>
                    <span className="flex-shrink-0">{t("onboarding.welcome_point_3")}</span>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 1: CATAT MANDIRI PRACTICE */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className={cx("w-10 h-10 rounded-xl flex items-center justify-center", tokens.chip.accentEmerald)}>
                    <Edit3 size={20} />
                  </div>
                  <div>
                    <h2 className={cx("text-xl font-bold", tokens.text.onSurface)}>
                      {t("onboarding.catat_title")}
                    </h2>
                    <p className={cx("text-xs sm:text-sm", tokens.text.mutedAlt)}>
                      {t("onboarding.catat_desc")}
                    </p>
                  </div>
                </div>

                {/* Simulated form interface */}
                <div className={cx("rounded-2xl p-5 border", tokens.onboarding.interactiveFormBgBorder)}>
                  <h3 className={cx("text-xs font-semibold uppercase tracking-wider mb-4", tokens.text.muted)}>
                    {t("onboarding.catat_practice_title")}
                  </h3>

                  <form onSubmit={handlePracticeSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Amount */}
                      <div>
                        <label className={cx("block text-xs font-medium mb-1", tokens.text.mutedAlt)}>
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
                            className={cx("w-full pl-9 pr-3 py-2 text-sm rounded-xl border focus:outline-none disabled:opacity-50", tokens.onboarding.inputFocus, tokens.border.strong, tokens.text.onSurface, tokens.surface.card)}
                          />
                        </div>
                      </div>

                      {/* Category selection */}
                      <div>
                        <label className={cx("block text-xs font-medium mb-1", tokens.text.mutedAlt)}>
                          {t("onboarding.catat_practice_cat")}
                        </label>
                        <DropdownField
                          value={practiceCategory}
                          onChange={setPracticeCategory}
                          disabled={hasPracticedCatat}
                          options={[
                            { value: "food_drink", label: t("categories.food_drink") },
                            { value: "transport", label: t("categories.transport") },
                            { value: "shopping", label: t("categories.shopping") },
                            { value: "other", label: t("categories.other") },
                          ]}
                        />
                      </div>
                    </div>

                    {/* Note description */}
                    <div>
                      <label className={cx("block text-xs font-medium mb-1", tokens.text.mutedAlt)}>
                        {t("onboarding.catat_practice_note")}
                      </label>
                      <input
                        type="text"
                        placeholder={t("onboarding.practice_note_placeholder")}
                        value={practiceNote}
                        onChange={(e) => setPracticeNote(e.target.value)}
                        disabled={hasPracticedCatat}
                        className={cx(tokens.form.input, "disabled:opacity-50")}
                      />
                    </div>

                    {!hasPracticedCatat ? (
                      <button
                        type="submit"
                        className={cx("w-full py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2", tokens.onboarding.btnShadow, tokens.button.accentEmerald)}
                      >
                        <Plus size={16} />
                        {t("onboarding.catat_practice_btn")}
                      </button>
                    ) : (
                      <div className={cx("p-3 rounded-xl flex items-center gap-2.5 text-xs sm:text-sm font-medium", tokens.onboarding.practiceSuccessBgBorder)}>
                        <CheckCircle2 size={18} className={cx("flex-shrink-0", tokens.text.successStrong)} />
                        <span>{t("onboarding.catat_practice_success")}</span>
                      </div>
                    )}
                  </form>
                </div>
              </div>
            )}

            {/* STEP 2: TELEGRAM BOT */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className={cx("w-10 h-10 rounded-xl flex items-center justify-center", tokens.chip.accentEmerald)}>
                    <Send size={20} />
                  </div>
                  <div>
                    <h2 className={cx("text-xl font-bold", tokens.text.onSurface)}>
                      {t("onboarding.telegram_title")}
                    </h2>
                    <p className={cx("text-xs sm:text-sm", tokens.text.mutedAlt)}>
                      {t("onboarding.telegram_desc")}
                    </p>
                  </div>
                </div>

                <div className={cx("grid grid-cols-1 md:grid-cols-2 gap-3 text-xs")}>
                  <div className={cx("flex items-start gap-2", tokens.onboarding.bulletFeatureItem)}>
                    <CheckCircle2 size={14} className={cx("mt-0.5", tokens.text.successStrong)} />
                    <span>{t("onboarding.telegram_feature_1")}</span>
                  </div>
                  <div className={cx("flex items-start gap-2", tokens.onboarding.bulletFeatureItem)}>
                    <CheckCircle2 size={14} className={cx("mt-0.5", tokens.text.successStrong)} />
                    <span>{t("onboarding.telegram_feature_2")}</span>
                  </div>
                </div>

                {/* Simulated chat bubble mockup */}
                <div className={cx("space-y-3 rounded-2xl p-5 border", tokens.onboarding.interactiveFormBgBorder)}>
                  <h3 className={cx("text-xs font-semibold uppercase tracking-wider", tokens.text.muted)}>
                    {t("onboarding.catat_practice_title")} (Simulasi)
                  </h3>

                  <div className="flex justify-end">
                    <div className="max-w-[75%] bg-indigo-500 text-white text-xs sm:text-sm px-3.5 py-2 rounded-2xl rounded-tr-sm shadow-sm">
                      {t("onboarding.telegram_mock_user_msg")}
                    </div>
                  </div>
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.4 }}
                    className="flex justify-start"
                  >
                    <div className={cx("max-w-[75%] border text-xs sm:text-sm px-3.5 py-2 rounded-2xl rounded-tl-sm shadow-sm", tokens.surface.card, tokens.border.accent, tokens.text.secondary)}>
                      {t("onboarding.telegram_mock_bot_reply")}
                    </div>
                  </motion.div>
                </div>

                <p className="text-[clamp(0.625rem,2.6vw,0.6875rem)] text-slate-500 text-center">
                  {t("onboarding.telegram_setup_hint")}
                </p>
              </div>
            )}

            {/* STEP 3: RIWAYAT TRANSAKSI AND FILTERS */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className={cx("w-10 h-10 rounded-xl flex items-center justify-center", tokens.chip.accentEmerald)}>
                    <ListFilter size={20} />
                  </div>
                  <div>
                    <h2 className={cx("text-xl font-bold", tokens.text.onSurface)}>
                      {t("onboarding.history_title")}
                    </h2>
                    <p className={cx("text-xs sm:text-sm", tokens.text.mutedAlt)}>
                      {t("onboarding.history_desc")}
                    </p>
                  </div>
                </div>

                {/* Bullet items explaining ledger utilities */}
                <div className={cx("grid grid-cols-1 md:grid-cols-3 gap-3 text-xs")}>
                  <div className={cx(tokens.onboarding.bulletFeatureItem)}>
                    {t("onboarding.history_feature_1")}
                  </div>
                  <div className={cx(tokens.onboarding.bulletFeatureItem)}>
                    {t("onboarding.history_feature_2")}
                  </div>
                  <div className={cx(tokens.onboarding.bulletFeatureItem)}>
                    {t("onboarding.history_feature_3")}
                  </div>
                </div>

                {/* Simulated Ledger Interaction */}
                <div className={cx("space-y-4 rounded-2xl p-5 border", tokens.onboarding.interactiveFormBgBorder)}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className={cx("text-xs font-semibold uppercase tracking-wider", tokens.text.muted)}>
                        {t("onboarding.history_practice_title")}
                      </h3>
                      <p className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] sm:text-xs", tokens.text.mutedAlt)}>
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
                      className={cx("self-start sm:self-auto py-1 px-3 rounded-lg flex items-center gap-1.5 transition-colors", tokens.onboarding.actionBtnSecondary)}
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
                        className={cx("w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border focus:outline-none", tokens.onboarding.inputFocus, tokens.border.strong, tokens.text.onSurface, tokens.surface.card)}
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
                          className={cx(
                            "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                            selectedCategoryFilter === item.key
                              ? tokens.onboarding.stepPillActive
                              : tokens.onboarding.stepPillInactive
                          )}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Simulated ledger rows */}
                  <div className={cx("rounded-xl overflow-hidden border", tokens.border.accent)}>
                    <div className={cx("grid grid-cols-4 gap-2 px-3 py-2 text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider", tokens.onboarding.tableHeaderBgText)}>
                      <span>{t("history.col_date")}</span>
                      <span className="col-span-2">{t("history.search_label")}</span>
                      <span className="text-right">{t("history.col_amount")}</span>
                    </div>

                    <div className={cx("divide-y", tokens.onboarding.tableDivider)}>
                      {filteredMockTransactions.length > 0 ? (
                        filteredMockTransactions.map((tx) => (
                          <div
                            key={tx.id}
                            className={cx("grid grid-cols-4 gap-2 px-3 py-2.5 items-center text-xs", tokens.text.onSurface)}
                          >
                            <span className={cx("font-mono text-[clamp(0.5625rem,2.6vw,0.625rem)]", tokens.text.faint)}>{tx.date}</span>
                            <div className="col-span-2 flex flex-col min-w-0">
                              <span className="font-semibold truncate">{tx.note}</span>
                              <span className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)]", tokens.text.faint)}>
                                {t(`categories.${tx.category}`)}
                              </span>
                            </div>
                            <span
                              className={cx(
                                "text-right font-semibold font-mono",
                                tx.type === "income" ? tokens.text.success : tokens.text.danger
                              )}
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

            {/* STEP 4: WALLETS */}
            {currentStep === 4 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className={cx("w-10 h-10 rounded-xl flex items-center justify-center", tokens.chip.accentEmerald)}>
                    <Wallet size={20} />
                  </div>
                  <div>
                    <h2 className={cx("text-xl font-bold", tokens.text.onSurface)}>
                      {t("onboarding.wallet_title")}
                    </h2>
                    <p className={cx("text-xs sm:text-sm", tokens.text.mutedAlt)}>
                      {t("onboarding.wallet_desc")}
                    </p>
                  </div>
                </div>

                <div className={cx("grid grid-cols-1 md:grid-cols-2 gap-3 text-xs")}>
                  <div className={cx("flex items-start gap-2", tokens.onboarding.bulletFeatureItem)}>
                    <CheckCircle2 size={14} className={cx("mt-0.5", tokens.text.successStrong)} />
                    <span>{t("onboarding.wallet_feature_1")}</span>
                  </div>
                  <div className={cx("flex items-start gap-2", tokens.onboarding.bulletFeatureItem)}>
                    <CheckCircle2 size={14} className={cx("mt-0.5", tokens.text.successStrong)} />
                    <span>{t("onboarding.wallet_feature_2")}</span>
                  </div>
                </div>

                {/* Simulated wallet list */}
                <div className={cx("space-y-3 rounded-2xl p-5 border", tokens.onboarding.interactiveFormBgBorder)}>
                  <h3 className={cx("text-xs font-semibold uppercase tracking-wider", tokens.text.muted)}>
                    {t("onboarding.catat_practice_title")} (Simulasi)
                  </h3>

                  {[
                    { label: "GoPay", amount: "Rp250.000" },
                    { label: "BCA", amount: "Rp2.100.000" },
                    { label: t("wallet.group_cash"), amount: "Rp50.000" },
                  ].map((w, i) => (
                    <div key={i} className={cx("flex items-center justify-between p-3 rounded-xl border shadow-sm", tokens.surface.card, tokens.border.accent)}>
                      <div className="flex items-center gap-2.5">
                        <div className={cx("w-8 h-8 rounded-full flex items-center justify-center", tokens.onboarding.iconCircularBg)}>
                          <Wallet size={14} />
                        </div>
                        <span className={cx("text-sm font-semibold", tokens.text.onSurface)}>{w.label}</span>
                      </div>
                      <span className={cx("text-sm font-mono", tokens.text.label)}>{w.amount}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 5: BUDGET */}
            {currentStep === 5 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className={cx("w-10 h-10 rounded-xl flex items-center justify-center", tokens.chip.accentEmerald)}>
                    <PiggyBank size={20} />
                  </div>
                  <div>
                    <h2 className={cx("text-xl font-bold", tokens.text.onSurface)}>
                      {t("onboarding.budget_title")}
                    </h2>
                    <p className={cx("text-xs sm:text-sm", tokens.text.mutedAlt)}>
                      {t("onboarding.budget_desc")}
                    </p>
                  </div>
                </div>

                <div className={cx("grid grid-cols-1 md:grid-cols-2 gap-3 text-xs")}>
                  <div className={cx("flex items-start gap-2", tokens.onboarding.bulletFeatureItem)}>
                    <CheckCircle2 size={14} className={cx("mt-0.5", tokens.text.successStrong)} />
                    <span>{t("onboarding.budget_feature_1")}</span>
                  </div>
                  <div className={cx("flex items-start gap-2", tokens.onboarding.bulletFeatureItem)}>
                    <CheckCircle2 size={14} className={cx("mt-0.5", tokens.text.successStrong)} />
                    <span>{t("onboarding.budget_feature_2")}</span>
                  </div>
                </div>

                {/* Simulated Budget Visual */}
                <div className={cx("space-y-4 rounded-2xl p-5 border", tokens.onboarding.interactiveFormBgBorder)}>
                  <h3 className={cx("text-xs font-semibold uppercase tracking-wider", tokens.text.muted)}>
                    {t("onboarding.catat_practice_title")} (Simulasi)
                  </h3>

                  <div className="space-y-4">
                    <div className={cx("p-4 rounded-xl border shadow-sm", tokens.surface.card, tokens.border.accent)}>
                      <div className="flex justify-between items-center mb-2">
                        <span className={cx("text-sm font-semibold", tokens.text.onSurface)}>{t("categories.food_drink")}</span>
                        <span className="text-xs text-rose-400 font-mono">85%</span>
                      </div>
                      <div className={cx("h-2 w-full rounded-full overflow-hidden", tokens.surface.subtle)}>
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: "85%" }}
                          transition={{ duration: 1, delay: 0.5 }}
                          className="h-full bg-gradient-to-r from-orange-500 to-rose-500" 
                        />
                      </div>
                      <div className="flex justify-between items-center mt-2 text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-500">
                        <span>Rp850.000</span>
                        <span>Limit: Rp1.000.000</span>
                      </div>
                    </div>

                    <div className={cx("p-3 rounded-xl flex items-center gap-3 text-xs", tokens.onboarding.practiceWarningBgBorder)}>
                      <Sparkles size={16} className="text-rose-500" />
                      <span>{t("budget.toast_warning_threshold", { category: t("categories.food_drink"), percent: 85 })}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 6: SAVINGS POCKETS */}
            {currentStep === 6 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className={cx("w-10 h-10 rounded-xl flex items-center justify-center", tokens.chip.accentEmerald)}>
                    <Target size={20} />
                  </div>
                  <div>
                    <h2 className={cx("text-xl font-bold", tokens.text.onSurface)}>
                      {t("onboarding.savings_title")}
                    </h2>
                    <p className={cx("text-xs sm:text-sm", tokens.text.mutedAlt)}>
                      {t("onboarding.savings_desc")}
                    </p>
                  </div>
                </div>

                <div className={cx("grid grid-cols-1 md:grid-cols-2 gap-3 text-xs")}>
                  <div className={cx("flex items-start gap-2", tokens.onboarding.bulletFeatureItem)}>
                    <CheckCircle2 size={14} className={cx("mt-0.5", tokens.text.successStrong)} />
                    <span>{t("onboarding.savings_feature_1")}</span>
                  </div>
                  <div className={cx("flex items-start gap-2", tokens.onboarding.bulletFeatureItem)}>
                    <CheckCircle2 size={14} className={cx("mt-0.5", tokens.text.successStrong)} />
                    <span>{t("onboarding.savings_feature_2")}</span>
                  </div>
                </div>

                {/* Simulated savings progress */}
                <div className={cx("space-y-4 rounded-2xl p-5 border", tokens.onboarding.interactiveFormBgBorder)}>
                  <h3 className={cx("text-xs font-semibold uppercase tracking-wider", tokens.text.muted)}>
                    {t("onboarding.catat_practice_title")} (Simulasi)
                  </h3>

                  <div className={cx("p-4 rounded-xl border shadow-sm", tokens.surface.card, tokens.border.accent)}>
                    <div className="flex justify-between items-center mb-2">
                      <span className={cx("text-sm font-semibold", tokens.text.onSurface)}>{t("onboarding.savings_mock_pocket_name")}</span>
                      <span className={cx("text-xs font-mono", tokens.text.successStrong)}>35%</span>
                    </div>
                    <div className={cx("h-2 w-full rounded-full overflow-hidden", tokens.surface.subtle)}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: "35%" }}
                        transition={{ duration: 1, delay: 0.5 }}
                        className={cx("h-full", tokens.onboarding.savingsProgressGlow)}
                      />
                    </div>
                    <div className="flex justify-between items-center mt-2 text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-500">
                      <span>Rp3.500.000</span>
                      <span>{t("onboarding.savings_mock_target")}: Rp10.000.000</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 7: GOLD SAVINGS */}
            {currentStep === 7 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className={cx("w-10 h-10 rounded-xl flex items-center justify-center", tokens.chip.accentEmerald)}>
                    <Coins size={20} />
                  </div>
                  <div>
                    <h2 className={cx("text-xl font-bold", tokens.text.onSurface)}>
                      {t("gold.page_title")}
                    </h2>
                    <p className={cx("text-xs sm:text-sm", tokens.text.mutedAlt)}>
                      {t("onboarding.gold_desc")}
                    </p>
                  </div>
                </div>

                <div className={cx("grid grid-cols-1 md:grid-cols-2 gap-3 text-xs")}>
                  <div className={cx("flex items-start gap-2", tokens.onboarding.bulletFeatureItem)}>
                    <CheckCircle2 size={14} className={cx("mt-0.5", tokens.text.successStrong)} />
                    <span>{t("onboarding.gold_feature_1")}</span>
                  </div>
                  <div className={cx("flex items-start gap-2", tokens.onboarding.bulletFeatureItem)}>
                    <CheckCircle2 size={14} className={cx("mt-0.5", tokens.text.successStrong)} />
                    <span>{t("onboarding.gold_feature_2")}</span>
                  </div>
                </div>

                {/* Simulated gold pocket card */}
                <div className={cx("space-y-4 rounded-2xl p-5 border", tokens.onboarding.interactiveFormBgBorder)}>
                  <h3 className={cx("text-xs font-semibold uppercase tracking-wider", tokens.text.muted)}>
                    {t("onboarding.catat_practice_title")} (Simulasi)
                  </h3>

                  <div className={cx("p-4 rounded-xl shadow-sm", tokens.onboarding.goldGoldCard)}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={cx("text-sm font-bold", tokens.text.onSurface)}>2.5 gram Antam</p>
                        <p className="text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-500 mt-0.5">{t("gold.stat_market_value")}: Rp3.250.000</p>
                      </div>
                      <span className={cx("px-2.5 py-1 rounded-lg text-xs font-bold", tokens.onboarding.goldBadgeBg, tokens.text.success)}>
                        +Rp150.000
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 8: INSTALLMENTS */}
            {currentStep === 8 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className={cx("w-10 h-10 rounded-xl flex items-center justify-center", tokens.chip.accentEmerald)}>
                    <CalendarClock size={20} />
                  </div>
                  <div>
                    <h2 className={cx("text-xl font-bold", tokens.text.onSurface)}>
                      {t("installments.page_title")}
                    </h2>
                    <p className={cx("text-xs sm:text-sm", tokens.text.mutedAlt)}>
                      {t("onboarding.installments_desc")}
                    </p>
                  </div>
                </div>

                <div className={cx("grid grid-cols-1 md:grid-cols-2 gap-3 text-xs")}>
                  <div className={cx("flex items-start gap-2", tokens.onboarding.bulletFeatureItem)}>
                    <CheckCircle2 size={14} className={cx("mt-0.5", tokens.text.successStrong)} />
                    <span>{t("onboarding.installments_feature_1")}</span>
                  </div>
                  <div className={cx("flex items-start gap-2", tokens.onboarding.bulletFeatureItem)}>
                    <CheckCircle2 size={14} className={cx("mt-0.5", tokens.text.successStrong)} />
                    <span>{t("onboarding.installments_feature_2")}</span>
                  </div>
                </div>

                {/* Simulated installment progress */}
                <div className={cx("space-y-4 rounded-2xl p-5 border", tokens.onboarding.interactiveFormBgBorder)}>
                  <h3 className={cx("text-xs font-semibold uppercase tracking-wider", tokens.text.muted)}>
                    {t("onboarding.catat_practice_title")} (Simulasi)
                  </h3>

                  <div className={cx("p-4 rounded-xl border shadow-sm", tokens.surface.card, tokens.border.accent)}>
                    <div className="flex justify-between items-center mb-2">
                      <span className={cx("text-sm font-semibold", tokens.text.onSurface)}>{t("onboarding.installments_mock_name")}</span>
                      <span className="text-xs text-slate-400 font-mono">8/24 {t("onboarding.installments_mock_unit")}</span>
                    </div>
                    <div className={cx("h-2 w-full rounded-full overflow-hidden", tokens.surface.subtle)}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: "33%" }}
                        transition={{ duration: 1, delay: 0.5 }}
                        className="h-full bg-gradient-to-r from-sky-500 to-indigo-400"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 9: BILLS */}
            {currentStep === 9 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className={cx("w-10 h-10 rounded-xl flex items-center justify-center", tokens.chip.accentEmerald)}>
                    <ReceiptText size={20} />
                  </div>
                  <div>
                    <h2 className={cx("text-xl font-bold", tokens.text.onSurface)}>
                      {t("onboarding.bill_title")}
                    </h2>
                    <p className={cx("text-xs sm:text-sm", tokens.text.mutedAlt)}>
                      {t("onboarding.bill_desc")}
                    </p>
                  </div>
                </div>

                <div className={cx("grid grid-cols-1 md:grid-cols-2 gap-3 text-xs")}>
                  <div className={cx("flex items-start gap-2", tokens.onboarding.bulletFeatureItem)}>
                    <CheckCircle2 size={14} className={cx("mt-0.5", tokens.text.successStrong)} />
                    <span>{t("onboarding.bill_feature_1")}</span>
                  </div>
                  <div className={cx("flex items-start gap-2", tokens.onboarding.bulletFeatureItem)}>
                    <CheckCircle2 size={14} className={cx("mt-0.5", tokens.text.successStrong)} />
                    <span>{t("onboarding.bill_feature_2")}</span>
                  </div>
                </div>

                {/* Simulated Bill Card */}
                <div className={cx("space-y-4 rounded-2xl p-5 border", tokens.onboarding.interactiveFormBgBorder)}>
                  <h3 className={cx("text-xs font-semibold uppercase tracking-wider", tokens.text.muted)}>
                    {t("onboarding.catat_practice_title")} (Simulasi)
                  </h3>

                  <div className={cx("p-4 rounded-xl border shadow-sm relative overflow-hidden", tokens.surface.card, tokens.border.accent)}>
                    <div className="absolute top-0 right-0 p-2">
                      <span className={cx("px-2 py-0.5 rounded text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold", tokens.onboarding.badgeDueSoon)}>
                        {t("bill_reminders.status_due_soon")}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-3 mb-4">
                      <div className={cx("w-10 h-10 rounded-full flex items-center justify-center", tokens.onboarding.iconCircularBg)}>
                        <ReceiptText size={18} />
                      </div>
                      <div>
                        <h4 className={cx("text-sm font-bold", tokens.text.onSurface)}>PLN Pasca Bayar</h4>
                        <p className="text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-500">{t("bill_reminders.due_day_label", { day: 20 })}</p>
                      </div>
                    </div>

                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-500 uppercase tracking-wider">{t("bill_reminders.amount_label")}</p>
                        <p className={cx("text-sm font-mono font-bold", tokens.text.onSurface)}>Rp350.000</p>
                      </div>
                      <button 
                        type="button"
                        onClick={() => {
                          playSuccess();
                          showToast(t("bill_reminders.marked_paid"), "success");
                        }}
                        className={cx("px-3 py-1.5 rounded-lg text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold transition-colors", tokens.button.accentEmerald)}
                      >
                        {t("bill_reminders.mark_paid")}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 10: WRAP UP / GET STARTED */}
            {currentStep === 10 && (
              <div className="text-center space-y-6 py-4">
                <div className={cx("mx-auto w-16 h-16 rounded-full flex items-center justify-center animate-bounce", tokens.chip.accentEmerald)}>
                  <CheckCircle2 size={32} />
                </div>
                <div className="space-y-2">
                  <h1 className={cx("text-2xl sm:text-3xl font-bold tracking-tight", tokens.text.onSurface)}>
                    {t("onboarding.concl_title")}
                  </h1>
                  <p className={cx("max-w-lg mx-auto text-sm sm:text-base", tokens.text.mutedAlt)}>
                    {t("onboarding.concl_desc")}
                  </p>
                </div>

                <div className={cx("max-w-md mx-auto p-4 rounded-2xl text-left", tokens.onboarding.conclusionCardBgBorder)}>
                  <p className={cx("text-xs sm:text-sm font-medium", tokens.onboarding.conclusionTipText)}>
                    {t("onboarding.concl_tip")}
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Stepper Buttons Controls */}
        <div className={cx("flex items-center justify-between mt-8 pt-6 border-t", tokens.border.accent)}>
          <button
            onClick={handleSkip}
            className={cx("text-xs sm:text-sm font-medium transition-colors", tokens.onboarding.skipBtn)}
          >
            {t("onboarding.btn_skip")}
          </button>

          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button
                onClick={handleBack}
                className={cx("py-2 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5", tokens.onboarding.backBtn)}
              >
                <ArrowLeft size={16} />
                {t("onboarding.btn_prev")}
              </button>
            )}

            <button
              onClick={handleNext}
              className={cx("py-2 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5", tokens.onboarding.btnShadow, tokens.button.accentEmerald)}
            >
              <span>{currentStep === stepsCount - 1 ? t("onboarding.btn_finish") : t("onboarding.btn_next")}</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
