import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { useToast } from "../contexts/ToastContext";
import logoUrl from "../assets/images/user_logo_transparent.png";
import { Mail, Lock, User, LogIn, Sparkles, AlertCircle, Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence, useAnimation } from "motion/react";
import { Modal } from "../components/Modal";
import { audioFeedback } from "../lib/audio";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { Input } from "../components/ui/Input";

/* ─────────────────────────────────────────────────────────
   Brand panel decoration — faint background arc rings only.
   Kept absolute + very low-opacity so it never visually competes
   with foreground text/buttons.
───────────────────────────────────────────────────────── */
const BrandPanelArcs: React.FC = () => {
  const { tokens } = useThemeTokens();
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none select-none"
      viewBox="0 0 400 600"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="380" cy="30"  r="180" fill="none" strokeWidth="1" className={tokens.login.arc1}/>
      <circle cx="380" cy="30"  r="130" fill="none" strokeWidth="1" className={tokens.login.arc2}/>
      <circle cx="20"  cy="570" r="200" fill="none" strokeWidth="1" className={tokens.login.arc3}/>
      <circle cx="20"  cy="570" r="130" fill="none" strokeWidth="1" className={tokens.login.arc4}/>
      <line x1="0" y1="300" x2="400" y2="300" strokeWidth="0.5" className={tokens.login.line}/>
      <line x1="200" y1="0" x2="200" y2="600" strokeWidth="0.5" className={tokens.login.line}/>
    </svg>
  );
};

/* ─────────────────────────────────────────────────────────
   Brand logo mark — glow halo + concentric rings + logo image.
   Renders as a normal in-flow block (NOT absolutely centered over
   the whole panel), so it always sits in its own dedicated space
   between the header and footer content and never overlaps them.
   `compact` shrinks it for the mobile landing panel.
 * ───────────────────────────────────────────────────────── */
const BrandLogoMark: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { tokens } = useThemeTokens();
  const haloSize = compact ? "w-40 h-40" : "w-52 h-52";
  const ring1Size = compact ? "w-32 h-32" : "w-44 h-44";
  const ring2Size = compact ? "w-26 h-26" : "w-36 h-36";
  const imgSize = compact ? "w-20 h-20" : "w-28 h-28";
  return (
    <div className="relative flex items-center justify-center pointer-events-none select-none">
      {/* Outer glow halo */}
      <div className={`absolute ${haloSize} rounded-full blur-[60px] ${tokens.login.glow}`} />
      {/* Concentric ring 1 */}
      <div className={`absolute ${ring1Size} rounded-full border ${tokens.login.ring1}`} />
      {/* Concentric ring 2 */}
      <div className={`absolute ${ring2Size} rounded-full border ${tokens.login.ring2}`} />
      {/* Logo image */}
      <motion.img
        src={logoUrl}
        alt="E-Wallet Kita"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.25, duration: 0.7, ease: "easeOut" }}
        className={`relative ${imgSize} object-contain ${tokens.login.logoGlow}`}
      />
    </div>
  );
};

/* ─────────────────────────────────────────────────────────
   Floating stat chip used inside brand panel
 * ───────────────────────────────────────────────────────── */
const StatChip: React.FC<{ label: string; value: string; delay?: number }> = ({ label, value, delay = 0 }) => {
  const { tokens, cx } = useThemeTokens();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.6, ease: "easeOut" }}
      className={cx(
        "flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-sm",
        tokens.login.statChip
      )}
    >
      <span className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] font-semibold tabular-nums", tokens.login.statChipVal)}>{value}</span>
      <span className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)]", tokens.login.statChipLbl)}>{label}</span>
    </motion.div>
  );
};

/* ─────────────────────────────────────────────────────────
   Reusable input field with icon
───────────────────────────────────────────────────────── */
interface InputFieldProps {
  icon: React.ReactNode;
  label: string;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  required?: boolean;
  minLength?: number;
  rightAddon?: React.ReactNode;
  autoComplete?: string;
}
/**
 * Thin wrapper over the shared `<Input>` primitive (src/components/ui/Input.tsx).
 * Login.tsx used to hand-roll this field with its own radius (`rounded-xl` vs
 * Input's `rounded-2xl`), padding (`pl-10 pr-10 py-3` vs Input's `px-4 py-3`/`pl-11`),
 * and its own token pair (`tokens.login.inputFieldBgBorder`/`inputFieldFocus`)
 * instead of `tokens.surface.subtle`/`border.strong` used everywhere else.
 * Public props kept identical so every call site below stays unchanged.
 */
const InputField: React.FC<InputFieldProps> = ({
  icon, label, type, placeholder, value, onChange,
  disabled, required, minLength, rightAddon, autoComplete
}) => {
  return (
    <Input
      label={label || undefined}
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      required={required}
      minLength={minLength}
      autoComplete={autoComplete}
      leftIcon={icon}
      rightElement={rightAddon}
    />
  );
};

/* ════════════════════════════════════════════════════════
   MAIN LOGIN COMPONENT
════════════════════════════════════════════════════════ */
export const Login: React.FC = () => {
  const { t } = useLanguage();
  const { signInWithGoogle, signInAsGuest } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const shakeControls = useAnimation();
  const { tokens, cx } = useThemeTokens();

  const [isSignUp, setIsSignUp]               = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  // Mobile-only flow: "landing" shows the welcome panel with Sign In / Create
  // Account buttons; "form" shows the actual auth form. Desktop always shows
  // both panels side-by-side, so this state is simply ignored at md+ widths.
  const [mobileStage, setMobileStage]         = useState<"landing" | "form">("landing");
  const [email, setEmail]                     = useState("");
  const [password, setPassword]               = useState("");
  const [displayName, setDisplayName]         = useState("");
  const [isLoading, setIsLoading]             = useState(false);
  const [showPassword, setShowPassword]       = useState(false);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    type: "info" | "warning";
    onConfirm: () => void;
  }>({ isOpen: false, title: "", description: "", type: "info", onConfirm: () => {} });

  const triggerShake = async () => {
    await shakeControls.start({ x: [-6, 6, -4, 4, 0], transition: { duration: 0.4 } });
  };

  // Switches the right-hand form between Sign In / Sign Up. Used by the
  // desktop brand-panel tabs and the mobile landing buttons.
  const goToAuthMode = (signUp: boolean) => {
    audioFeedback.playClick();
    setIsForgotPassword(false);
    setIsSignUp(signUp);
    setMobileStage("form");
  };

  /* ── Handlers ─────────────────────────────────────── */
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    audioFeedback.playClick();
    if (!email || !email.includes("@")) {
      audioFeedback.playDullPluck(); triggerShake();
      showToast(t("auth.validation_email"), "error"); return;
    }
    setConfirmModal({
      isOpen: true,
      title: t("auth.forgot_password_title"),
      description: t("auth.confirm_forgot_password_desc", { email }),
      type: "info",
      onConfirm: async () => {
        audioFeedback.playClick();
        setConfirmModal((p) => ({ ...p, isOpen: false }));
        setIsLoading(true);
        try {
          const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
          if (error) throw error;
          showToast(t("auth.forgot_password_success"), "success");
          setIsForgotPassword(false);
        } catch (err: any) { audioFeedback.playDullPluck(); showToast(err.message, "error"); }
        setIsLoading(false);
      }
    });
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    audioFeedback.playClick();
    if (!email || !email.includes("@")) {
      audioFeedback.playDullPluck(); triggerShake();
      showToast(t("auth.validation_email"), "error"); return;
    }
    if (!password || password.length < 6) {
      audioFeedback.playDullPluck(); triggerShake();
      showToast(t("auth.validation_pass"), "error"); return;
    }
    if (isSignUp && !displayName.trim()) {
      audioFeedback.playDullPluck(); triggerShake();
      showToast(t("auth.toast_blank_name"), "error"); return;
    }
    setConfirmModal({
      isOpen: true,
      title: isSignUp ? t("auth.confirm_signup_title") : t("auth.confirm_login_title"),
      description: isSignUp ? t("auth.confirm_signup_desc", { email }) : t("auth.confirm_login_desc", { email }),
      type: "info",
      onConfirm: async () => {
        audioFeedback.playClick();
        setConfirmModal((p) => ({ ...p, isOpen: false }));
        setIsLoading(true);
        try {
          if (isSignUp) {
            const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: displayName } } });
            if (error) throw error;
            showToast(t("toast.welcome_signup"), "success");
          } else {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            showToast(t("auth.toast_signin_success"), "success");
            navigate("/dashboard");
          }
        } catch (e: any) { audioFeedback.playDullPluck(); showToast(e.message, "error"); }
        setIsLoading(false);
      }
    });
  };

  const handleGuestLogin = async () => {
    audioFeedback.playClick();
    setConfirmModal({
      isOpen: true, title: t("auth.confirm_guest_title"), description: t("auth.confirm_guest_desc"), type: "warning",
      onConfirm: async () => {
        audioFeedback.playClick();
        setConfirmModal((p) => ({ ...p, isOpen: false }));
        setIsLoading(true);
        try { await signInAsGuest(); audioFeedback.playChime(); showToast(t("toast.welcome_auth"), "success"); navigate("/dashboard"); }
        catch (e: any) { showToast(e.message, "error"); }
        setIsLoading(false);
      }
    });
  };

  const handleGoogleLogin = async () => {
    audioFeedback.playClick();
    setConfirmModal({
      isOpen: true, title: t("auth.confirm_google_title"), description: t("auth.confirm_google_desc"), type: "info",
      onConfirm: async () => {
        audioFeedback.playClick();
        setConfirmModal((p) => ({ ...p, isOpen: false }));
        setIsLoading(true);
        try { await signInWithGoogle(); }
        catch (e: any) { showToast(e.message, "error"); }
        setIsLoading(false);
      }
    });
  };

  /* ── Render ───────────────────────────────────────── */
  return (
    <div className={cx(
      "min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-300 relative overflow-hidden",
      tokens.surface.canvas
    )}>

      {/* Page-level ambient glow */}
      <div className={cx("absolute -left-32 top-0 w-96 h-96 rounded-full pointer-events-none", tokens.login.ambientGlow1)} />
      <div className={cx("absolute right-0 bottom-0 w-80 h-80 rounded-full pointer-events-none", tokens.login.ambientGlow2)} />

      {/* ── Outer card wrapper ── */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
        className={cx(
          "w-full max-w-[880px] relative z-10 rounded-3xl overflow-hidden flex flex-col md:flex-row",
          tokens.login.cardShadow
        )}
      >

        {/* ══════════════════════════════════════════════
            LEFT — Brand / Welcome panel
        ══════════════════════════════════════════════ */}
        <div className={cx(
          "relative md:w-[42%] flex-shrink-0 hidden md:flex flex-col p-10 overflow-hidden",
          tokens.login.brandPanelBg
        )}>

          <BrandPanelArcs />

          {/* Brand header */}
          <div className="relative z-10">
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="flex items-center gap-3 mb-8"
            >
              <img
                src={logoUrl}
                alt="E-Wallet Kita"
                className="w-9 h-9 object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
              />
              <span className="font-bold text-base tracking-tight text-white/90">
                E-Wallet Kita
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.55 }}
              className="font-bold text-3xl leading-snug text-white mb-3"
            >
              {t("auth.login_title")}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.55 }}
              className="text-sm text-white/60 leading-relaxed"
            >
              {t("auth.login_subtitle")}
            </motion.p>
          </div>

          {/* Logo mark — its own dedicated space, never overlapping the
              header text above or the chips/tabs below */}
          <div className="relative z-10 my-10 flex justify-center">
            <BrandLogoMark />
          </div>

          {/* Bottom block: stat chips + Sign In/Sign Up tab switcher,
              grouped together so spacing stays even regardless of card height */}
          <div className="relative z-10 mt-auto flex flex-col gap-5">
            {/* Floating stat chips */}
            <div className="flex flex-col gap-2">
              <StatChip value="" label="End-to-end encrypted" delay={0.55} />
              <StatChip value="" label="Cloud sync across devices" delay={0.65} />
              <StatChip value="" label="Real-time transaction tracking" delay={0.75} />
            </div>

            {/* Divider to visually separate chips from the tab switcher */}
            <div className={cx("h-px", tokens.login.divider)} />

            {/* Desktop Sign In / Sign Up tab switcher */}
            <div className={cx("flex items-center gap-1.5 p-1 rounded-full backdrop-blur-sm", tokens.login.tabBg)}>
              <button
                type="button"
                onClick={() => goToAuthMode(false)}
                disabled={isLoading}
                className={cx(
                  "flex-1 py-2 rounded-full text-xs font-semibold transition-all disabled:opacity-40",
                  !isSignUp && !isForgotPassword
                    ? tokens.login.tabBtnActive
                    : tokens.login.tabBtnInactive
                )}
              >
                {t("auth.panel_tab_signin")}
              </button>
              <button
                type="button"
                onClick={() => goToAuthMode(true)}
                disabled={isLoading}
                className={cx(
                  "flex-1 py-2 rounded-full text-xs font-semibold transition-all disabled:opacity-40",
                  isSignUp && !isForgotPassword
                    ? tokens.login.tabBtnActive
                    : tokens.login.tabBtnInactive
                )}
              >
                {t("auth.panel_tab_signup")}
              </button>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════
            MOBILE-ONLY — Welcome landing panel
            Shown before the form, mirrors the brand panel above but
            full-width, with explicit Sign In / Create Account buttons.
        ══════════════════════════════════════════════ */}
        {mobileStage === "landing" && (
          <div className={cx(
            "relative flex md:hidden flex-col p-8 overflow-hidden",
            tokens.login.brandPanelBg
          )}>

            <BrandPanelArcs />

            <div className="relative z-10">
              <motion.div
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="flex items-center gap-3 mb-8"
              >
                <img
                  src={logoUrl}
                  alt="E-Wallet Kita"
                  className="w-9 h-9 object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
                />
                <span className="font-bold text-base tracking-tight text-white/90">
                  E-Wallet Kita
                </span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.55 }}
                className="font-bold text-2xl leading-snug text-white mb-3"
              >
                {t("auth.login_title")}
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.55 }}
                className="text-sm text-white/60 leading-relaxed"
              >
                {t("auth.login_subtitle")}
              </motion.p>
            </div>

            {/* Logo mark — own dedicated space, clear of the subtitle above
                and the buttons below */}
            <div className="relative z-10 my-9 flex justify-center">
              <BrandLogoMark compact />
            </div>

            {/* Sign In / Create Account entry buttons */}
            <div className="relative z-10 flex flex-col gap-2.5">
              <motion.button
                whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.985 }}
                type="button"
                onClick={() => goToAuthMode(false)}
                className={cx(
                  "w-full py-3.5 rounded-xl text-sm font-semibold shadow-[0_4px_24px_rgba(0,0,0,0.25)] flex items-center justify-center gap-2",
                  tokens.login.tabBtnActive
                )}
              >
                <LogIn size={15} />
                <span>{t("auth.btn_signin")}</span>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.985 }}
                type="button"
                onClick={() => goToAuthMode(true)}
                className="w-full py-3.5 rounded-xl text-sm font-semibold
                           border border-white/30 text-white
                           flex items-center justify-center gap-2
                           hover:bg-white/10 transition-colors"
              >
                <User size={15} />
                <span>{t("auth.btn_signup")}</span>
              </motion.button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            RIGHT — Form panel
        ══════════════════════════════════════════════ */}
        <div className={cx(
          "flex-1 flex-col justify-center p-8 md:p-10",
          tokens.surface.card,
          mobileStage === "form" ? "flex" : "hidden md:flex"
        )}>

          {/* Mobile-only brand mark + back button */}
          <div className="flex md:hidden items-center justify-between mb-7">
            <div className="flex items-center gap-2.5">
              <img
                src={logoUrl}
                alt="E-Wallet Kita"
                className="w-8 h-8 object-contain"
              />
              <span className={cx("font-bold text-sm", tokens.text.onSurface)}>
                E-Wallet Kita
              </span>
            </div>
            <button
              type="button"
              onClick={() => { audioFeedback.playClick(); setMobileStage("landing"); }}
              disabled={isLoading}
              className={cx("text-xs font-semibold hover:underline disabled:opacity-50", tokens.icon.accent)}
            >
              {t("auth.back_to_welcome")}
            </button>
          </div>

          <AnimatePresence mode="wait">

            {/* ── Forgot Password view ── */}
            {isForgotPassword ? (
              <motion.div
                key="forgot"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.28 }}
              >
                <div className="mb-7">
                  <div className={cx("w-11 h-11 rounded-2xl flex items-center justify-center mb-4", tokens.login.iconBg)}>
                    <Lock size={20} className={cx(tokens.icon.accent)} />
                  </div>
                  <h2 className={cx("font-bold text-xl mb-1", tokens.text.primary)}>
                    {t("auth.forgot_password_title")}
                  </h2>
                  <p className={cx("text-xs leading-relaxed", tokens.text.muted)}>
                    {t("auth.forgot_password_desc")}
                  </p>
                </div>

                <motion.div animate={shakeControls}>
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <InputField
                      icon={<Mail size={15} />}
                      label={t("auth.label_email")}
                      type="email"
                      placeholder={t("auth.placeholder_email")}
                      value={email}
                      onChange={setEmail}
                      disabled={isLoading}
                      required
                      autoComplete="email"
                    />
                    <motion.button
                      whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.985 }}
                      type="submit" disabled={isLoading}
                      className={cx(
                        "w-full py-3.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:pointer-events-none",
                        tokens.login.ctaBtn
                      )}
                    >
                      {isLoading
                        ? <span className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin" />
                        : <><Mail size={15} /><span>{t("auth.forgot_password_btn")}</span></>
                      }
                    </motion.button>
                  </form>
                </motion.div>

                <div className="text-center mt-5">
                  <button
                    onClick={() => { audioFeedback.playClick(); setIsForgotPassword(false); }}
                    disabled={isLoading}
                    className={cx("text-xs hover:underline cursor-pointer disabled:opacity-50", tokens.icon.accent)}
                  >
                    {t("auth.forgot_password_back")}
                  </button>
                </div>
              </motion.div>

            ) : (
              /* ── Sign In / Sign Up view ── */
              <motion.div
                key={isSignUp ? "signup" : "signin"}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.28 }}
              >
                {/* Section heading */}
                <div className="mb-7">
                  <h2 className={cx("font-bold text-xl mb-0.5", tokens.text.primary)}>
                    {isSignUp ? t("auth.btn_signup") : t("auth.btn_signin")}
                  </h2>
                  <p className={cx("text-xs", tokens.text.muted)}>
                    {isSignUp ? t("auth.to_signin") : t("auth.to_signup")}
                  </p>
                </div>

                {/* ── Email form ── */}
                <motion.div animate={shakeControls}>
                  <form onSubmit={handleEmailAuth} className="space-y-3.5">
                    {isSignUp && (
                      <InputField
                        icon={<User size={15} />}
                        label={t("auth.label_display_name")}
                        type="text"
                        placeholder={t("auth.placeholder_display_name")}
                        value={displayName}
                        onChange={setDisplayName}
                        disabled={isLoading}
                        required
                        autoComplete="name"
                      />
                    )}

                    <InputField
                      icon={<Mail size={15} />}
                      label={t("auth.label_email")}
                      type="email"
                      placeholder={t("auth.placeholder_email")}
                      value={email}
                      onChange={setEmail}
                      disabled={isLoading}
                      required
                      autoComplete="email"
                    />

                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold tracking-[0.12em] uppercase", tokens.text.muted)}>
                          {t("auth.label_password")}
                        </label>
                        {!isSignUp && (
                          <button
                            type="button"
                            onClick={() => { audioFeedback.playClick(); setIsForgotPassword(true); }}
                            disabled={isLoading}
                            className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] hover:underline cursor-pointer", tokens.icon.accent)}
                          >
                            {t("auth.forgot_password")}
                          </button>
                        )}
                      </div>
                      <InputField
                        icon={<Lock size={15} />}
                        label=""
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={setPassword}
                        disabled={isLoading}
                        required
                        minLength={6}
                        autoComplete={isSignUp ? "new-password" : "current-password"}
                        rightAddon={
                          <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => setShowPassword((v) => !v)}
                            className={cx(tokens.login.eyeBtn)}
                          >
                            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        }
                      />
                    </div>

                    {/* Primary CTA */}
                    <motion.button
                      whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.985 }}
                      type="submit" disabled={isLoading}
                      className={cx(
                        "w-full py-3.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:pointer-events-none mt-1",
                        tokens.login.ctaBtn
                      )}
                    >
                      {isLoading
                        ? <span className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin" />
                        : <><LogIn size={15} /><span>{isSignUp ? t("auth.btn_signup") : t("auth.btn_signin")}</span></>
                      }
                    </motion.button>
                  </form>
                </motion.div>

                {/* Toggle sign in ↔ sign up */}
                <div className="text-center mt-4">
                  <button
                    onClick={() => { audioFeedback.playClick(); setIsSignUp(!isSignUp); }}
                    disabled={isLoading}
                    className={cx("text-xs hover:underline cursor-pointer disabled:opacity-50", tokens.icon.accent)}
                  >
                    {isSignUp ? t("auth.to_signin") : t("auth.to_signup")}
                  </button>
                </div>

                {/* Divider */}
                <div className="relative my-5 flex items-center">
                  <div className={cx("flex-1 h-px", tokens.login.formDivider)} />
                  <span className={cx("px-3 text-[clamp(0.5625rem,2.6vw,0.625rem)] font-semibold uppercase tracking-widest", tokens.text.faint)}>
                    {t("auth.or_divider_instant")}
                  </span>
                  <div className={cx("flex-1 h-px", tokens.login.formDivider)} />
                </div>

                {/* Instant login buttons */}
                <div className="space-y-2.5">

                  {/* Google */}
                  <motion.button
                    whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.985 }}
                    type="button" onClick={handleGoogleLogin} disabled={isLoading}
                    className={cx(
                      "w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2.5 transition-all disabled:opacity-40",
                      tokens.login.googleBtn
                    )}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" className="shrink-0">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.08H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.92l2.85-2.22.81-.6z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.08l3.66 2.84c.87-2.6 3.3-4.54 6.16-4.54z"/>
                    </svg>
                    <span>{t("auth.login_google")}</span>
                  </motion.button>

                  {/* Guest */}
                  <motion.button
                    whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.985 }}
                    type="button" onClick={handleGuestLogin} disabled={isLoading}
                    className={cx(
                      "w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-40",
                      tokens.login.guestBtn
                    )}
                  >
                    <Sparkles size={14} />
                    <span>{t("auth.login_guest")}</span>
                  </motion.button>
                </div>

                {/* Guest disclaimer */}
                <div className={cx(
                  "mt-5 flex gap-2 p-3 rounded-xl text-[clamp(0.5625rem,2.6vw,0.625rem)] leading-relaxed",
                  tokens.login.disclaimerBgBorder,
                  tokens.text.muted
                )}>
                  <AlertCircle size={13} className={cx("shrink-0 mt-0.5", tokens.login.disclaimerIcon)} />
                  <p>{t("auth.guest_disclaimer")}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Footer Copyright */}
      <footer className="mt-8 relative z-10 text-center text-xs text-slate-500 transition-colors duration-300">
        <p>
          © {new Date().getFullYear()} E-Wallet Kita App. All Rights Reserved | Budi Hertanto |{" "}
          <a 
            href="https://github.com/ocoot" 
            target="_blank" 
            rel="noopener noreferrer"
            className={cx("transition-colors duration-200 underline inline-flex items-center gap-1", tokens.login.footerLink)}
          >
            Github: @ocoot
          </a>
        </p>
      </footer>

      {/* ── Confirmation Modal ── */}
      <Modal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        description={confirmModal.description}
        type={confirmModal.type}
        confirmLabel={t("auth.confirm_continue")}
        cancelLabel={t("common.cancel")}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => { audioFeedback.playClick(); setConfirmModal((p) => ({ ...p, isOpen: false })); }}
      />

      {/* ── Full-screen loading overlay ── */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center
                       bg-slate-950/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.93, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.93, opacity: 0 }}
              className={cx("flex flex-col items-center text-center p-8 border rounded-3xl shadow-2xl max-w-xs w-full", tokens.surface.card, tokens.border.accent)}
            >
              <div className="relative w-14 h-14 flex items-center justify-center mb-4">
                <div className={cx("absolute inset-0 border-[3px] rounded-full", tokens.login.spinnerRing1)} />
                <div className={cx("absolute inset-0 border-[3px] border-transparent rounded-full animate-spin", tokens.login.spinnerRing2)} />
                <img
                  src={logoUrl}
                  alt=""
                  className="w-7 h-7 object-contain animate-pulse"
                />
              </div>
              <h3 className={cx("font-bold text-base mb-1", tokens.text.primary)}>
                {t("common.loading")}
              </h3>
              <p className={cx("text-xs leading-relaxed", tokens.text.muted)}>
                {isSignUp ? t("auth.loading_signup_desc") : t("auth.loading_signin_desc")}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
