import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Fingerprint, Delete, ShieldAlert, LogOut } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { useAppLock } from "../contexts/AppLockContext";
import { audioFeedback } from "../lib/audio";
import {
  verifyPin,
  hasBiometricConfigured,
  verifyBiometric,
  resetAppLock,
} from "../lib/appLock";
import logoUrl from "../assets/images/user_logo_transparent.png";

const PIN_LENGTH = 6;

/**
 * Layar kunci penuh (menutupi seluruh app) yang muncul saat
 * `useAppLock().isLocked` true. Dirender di App.tsx SEBELUM konten utama
 * (dashboard/saldo/dll) di-mount, supaya data sensitif tidak sempat kelihatan
 * sekilas sebelum PIN/biometric diverifikasi.
 */
export const AppLockScreen: React.FC = () => {
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const { tokens, cx } = useThemeTokens();
  const { unlock } = useAppLock();

  const userId = user?.id ?? null;
  const displayName = user?.user_metadata?.full_name || user?.email || t("admin.guest_user");

  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    setBiometricAvailable(hasBiometricConfigured(userId));
  }, [userId]);

  const tryBiometric = useCallback(async () => {
    if (!userId) return;
    const ok = await verifyBiometric(userId);
    if (ok) {
      audioFeedback.playChime();
      unlock();
    }
  }, [userId, unlock]);

  // Tawarkan Face ID/Touch ID otomatis begitu layar kunci muncul, supaya
  // user tidak perlu menekan tombol dulu -- konsisten dengan pola app
  // native (mis. lock screen iOS langsung memicu Face ID).
  useEffect(() => {
    if (biometricAvailable) {
      void tryBiometric();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biometricAvailable]);

  const handleDigit = async (digit: string) => {
    if (isVerifying || pin.length >= PIN_LENGTH) return;
    audioFeedback.playClick();
    const nextPin = pin + digit;
    setPin(nextPin);
    setError(false);

    if (nextPin.length === PIN_LENGTH && userId) {
      setIsVerifying(true);
      const ok = await verifyPin(userId, nextPin);
      if (ok) {
        audioFeedback.playChime();
        unlock();
      } else {
        audioFeedback.playDullPluck();
        setError(true);
        setTimeout(() => {
          setPin("");
          setError(false);
        }, 450);
      }
      setIsVerifying(false);
    }
  };

  const handleBackspace = () => {
    if (isVerifying || pin.length === 0) return;
    audioFeedback.playClick();
    setPin((p) => p.slice(0, -1));
  };

  const handleResetConfirmed = async () => {
    if (!userId) return;
    setIsResetConfirmOpen(false);
    setIsSigningOut(true);
    // Reset PIN/biometric device ini, lalu paksa logout -- login ulang
    // (password/Google) berfungsi sebagai pembuktian identitas sebelum user
    // bisa setup PIN baru lewat Settings > Kunci Aplikasi. Ini mencegah
    // orang yang sekadar memegang HP ter-login "lupa PIN"-kan App Lock
    // begitu saja tanpa tahu kredensial akunnya.
    resetAppLock(userId);
    await signOut();
  };

  return (
    <div
      className={cx(
        "fixed inset-0 z-[200] flex flex-col items-center justify-between px-6 py-10",
        tokens.surface.canvas,
        tokens.text.onSurface
      )}
      role="dialog"
      aria-modal="true"
      aria-label={t("applock.screen_title")}
    >
      <div className="flex-1 flex flex-col items-center justify-center gap-6 w-full max-w-xs">
        <img src={logoUrl} alt="" className="w-14 h-14 rounded-2xl shadow-lg" />

        <div className="text-center space-y-1">
          <p className={cx("font-sans text-sm font-semibold", tokens.text.heading)}>{displayName}</p>
          <p className={cx("font-sans text-xs", tokens.text.muted)}>{t("applock.enter_pin_prompt")}</p>
        </div>

        {/* PIN dots */}
        <motion.div
          animate={error ? { x: [0, -8, 8, -8, 8, 0] } : { x: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-3.5"
        >
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <span
              key={i}
              className={cx(
                "w-3.5 h-3.5 rounded-full border-2 transition-colors duration-150",
                i < pin.length
                  ? error
                    ? "bg-red-500 border-red-500"
                    : "bg-indigo-500 border-indigo-500"
                  : cx(tokens.border.strong, "bg-transparent")
              )}
            />
          ))}
        </motion.div>

        {/* Number pad */}
        <div className="grid grid-cols-3 gap-4 mt-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              disabled={isVerifying}
              className={cx(
                "w-16 h-16 rounded-full flex items-center justify-center font-sans text-xl font-semibold transition-transform active:scale-90 cursor-pointer disabled:opacity-50",
                tokens.surface.sunken,
                tokens.text.onSurface
              )}
            >
              {digit}
            </button>
          ))}

          {biometricAvailable ? (
            <button
              type="button"
              onClick={() => void tryBiometric()}
              aria-label={t("applock.use_biometric")}
              className={cx(
                "w-16 h-16 rounded-full flex items-center justify-center transition-transform active:scale-90 cursor-pointer",
                tokens.text.accent
              )}
            >
              <Fingerprint size={26} />
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={() => handleDigit("0")}
            disabled={isVerifying}
            className={cx(
              "w-16 h-16 rounded-full flex items-center justify-center font-sans text-xl font-semibold transition-transform active:scale-90 cursor-pointer disabled:opacity-50",
              tokens.surface.sunken,
              tokens.text.onSurface
            )}
          >
            0
          </button>

          <button
            type="button"
            onClick={handleBackspace}
            aria-label={t("applock.backspace")}
            className={cx("w-16 h-16 rounded-full flex items-center justify-center transition-transform active:scale-90 cursor-pointer", tokens.text.muted)}
          >
            <Delete size={22} />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => { audioFeedback.playClick(); setIsResetConfirmOpen(true); }}
        className={cx("font-sans text-xs font-semibold underline underline-offset-2 cursor-pointer", tokens.text.muted)}
      >
        {t("applock.forgot_pin")}
      </button>

      <AnimatePresence>
        {isResetConfirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 backdrop-blur-xs px-6"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={cx("w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-2xl", tokens.surface.card, tokens.border.default, "border")}
            >
              <div className="flex items-center gap-2.5">
                <ShieldAlert size={20} className="text-amber-400 shrink-0" />
                <h3 className={cx("font-sans font-bold text-sm", tokens.text.heading)}>
                  {t("applock.reset_confirm_title")}
                </h3>
              </div>
              <p className={cx("font-sans text-xs leading-relaxed", tokens.text.muted)}>
                {t("applock.reset_confirm_desc")}
              </p>
              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { audioFeedback.playClick(); setIsResetConfirmOpen(false); }}
                  className={cx("px-4 py-2 rounded-xl font-sans text-xs font-semibold cursor-pointer", tokens.text.muted)}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  disabled={isSigningOut}
                  onClick={handleResetConfirmed}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-sans text-xs font-bold cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
                >
                  <LogOut size={13} />
                  {t("applock.reset_confirm_button")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
