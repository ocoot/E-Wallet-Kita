import React, { useEffect, useState } from "react";
import { Lock, Fingerprint, ShieldAlert, KeyRound, Delete } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { useToast } from "../../contexts/ToastContext";
import { useThemeTokens } from "../../hooks/useThemeTokens";
import { audioFeedback } from "../../lib/audio";
import { useAppLock } from "../../contexts/AppLockContext";
import { MobileSettingsDetailPage } from "../../components/settings/MobileSettingsDetailPage";
import { ToggleSwitch } from "../../components/ui/ToggleSwitch";
import { ModalShell } from "../../components/ui/ModalShell";
import {
  getAppLockState,
  isValidPinFormat,
  setPin as savePin,
  verifyPin,
  setAppLockEnabled,
  isBiometricSupported,
  registerBiometric,
  disableBiometric,
  resetAppLock,
} from "../../lib/appLock";

const PIN_LENGTH = 6;

type PinModalMode = "setup" | "confirm-disable" | "confirm-reset";

/**
 * Pad angka kecil dipakai ulang di 3 alur berbeda (setup PIN baru, ketik PIN
 * lama untuk menonaktifkan, ketik PIN lama untuk reset) -- semua modal ini
 * hanya perlu "beri saya 6 digit", bedanya cuma judul & apa yang terjadi
 * sesudahnya, jadi cukup satu komponen internal yang menerima callback.
 */
const PinPad: React.FC<{ value: string; onChange: (next: string) => void; disabled?: boolean }> = ({
  value,
  onChange,
  disabled,
}) => {
  const { tokens, cx } = useThemeTokens();
  return (
    <div className="grid grid-cols-3 gap-3 justify-items-center">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <button
          key={d}
          type="button"
          disabled={disabled || value.length >= PIN_LENGTH}
          onClick={() => { audioFeedback.playClick(); onChange(value + d); }}
          className={cx("w-14 h-14 rounded-full font-sans text-lg font-semibold transition-transform active:scale-90 cursor-pointer disabled:opacity-50", tokens.surface.sunken, tokens.text.onSurface)}
        >
          {d}
        </button>
      ))}
      <div />
      <button
        type="button"
        disabled={disabled || value.length >= PIN_LENGTH}
        onClick={() => { audioFeedback.playClick(); onChange(value + "0"); }}
        className={cx("w-14 h-14 rounded-full font-sans text-lg font-semibold transition-transform active:scale-90 cursor-pointer disabled:opacity-50", tokens.surface.sunken, tokens.text.onSurface)}
      >
        0
      </button>
      <button
        type="button"
        disabled={disabled || value.length === 0}
        onClick={() => { audioFeedback.playClick(); onChange(value.slice(0, -1)); }}
        className={cx("w-14 h-14 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-30", tokens.text.muted)}
      >
        <Delete size={20} />
      </button>
    </div>
  );
};

const PinDots: React.FC<{ length: number; filled: number; error?: boolean }> = ({ length, filled, error }) => {
  const { tokens, cx } = useThemeTokens();
  return (
    <div className="flex items-center justify-center gap-3">
      {Array.from({ length }).map((_, i) => (
        <span
          key={i}
          className={cx(
            "w-3 h-3 rounded-full border-2 transition-colors",
            i < filled ? (error ? "bg-red-500 border-red-500" : "bg-indigo-500 border-indigo-500") : cx(tokens.border.strong)
          )}
        />
      ))}
    </div>
  );
};

export const AppLockSettings: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const { tokens, cx } = useThemeTokens();
  const { refreshLockFeatureState } = useAppLock();

  const userId = user?.id ?? null;
  const displayName = user?.user_metadata?.full_name || user?.email || "user";

  const [state, setState] = useState(() => getAppLockState(userId));
  const [biometricSupported, setBiometricSupported] = useState(false);

  const refresh = () => setState(getAppLockState(userId));

  useEffect(() => {
    refresh();
    isBiometricSupported().then(setBiometricSupported);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ── Setup / ganti PIN (2 langkah: masukkan, lalu konfirmasi ulang) ──
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinStep, setPinStep] = useState<"enter" | "confirm">("enter");
  const [pinFirstEntry, setPinFirstEntry] = useState("");
  const [pinDraft, setPinDraft] = useState("");
  const [pinError, setPinError] = useState(false);

  const openPinSetup = () => {
    setPinStep("enter");
    setPinFirstEntry("");
    setPinDraft("");
    setPinError(false);
    setPinModalOpen(true);
  };

  const handlePinDraftChange = async (next: string) => {
    setPinDraft(next);
    setPinError(false);
    if (next.length !== PIN_LENGTH || !userId) return;

    if (pinStep === "enter") {
      if (!isValidPinFormat(next)) {
        setPinError(true);
        setTimeout(() => setPinDraft(""), 400);
        return;
      }
      setPinFirstEntry(next);
      setTimeout(() => {
        setPinStep("confirm");
        setPinDraft("");
      }, 150);
      return;
    }

    // step "confirm"
    if (next !== pinFirstEntry) {
      audioFeedback.playDullPluck();
      setPinError(true);
      showToast(t("applock.toast_pin_mismatch"), "error");
      setTimeout(() => {
        setPinStep("enter");
        setPinFirstEntry("");
        setPinDraft("");
        setPinError(false);
      }, 500);
      return;
    }

    await savePin(userId, next);
    audioFeedback.playChime();
    showToast(t("applock.toast_pin_saved"), "success");
    setPinModalOpen(false);
    refresh();

    // Kalau ini setup PERTAMA kali (belum ada PIN sebelumnya) dan user
    // sebelumnya sudah menekan toggle "Aktifkan", langsung aktifkan sekarang
    // -- lihat handleToggleEnabled().
    if (pendingEnableAfterSetup) {
      setAppLockEnabled(userId, true);
      refreshLockFeatureState();
      setPendingEnableAfterSetup(false);
      refresh();
    }
  };

  const [pendingEnableAfterSetup, setPendingEnableAfterSetup] = useState(false);

  const handleToggleEnabled = (next: boolean) => {
    if (!userId) return;
    if (next && !state.pinHash) {
      // Belum ada PIN sama sekali -- minta setup dulu, baru aktifkan.
      setPendingEnableAfterSetup(true);
      openPinSetup();
      return;
    }
    if (!next) {
      // Menonaktifkan: minta konfirmasi PIN lama demi keamanan (mencegah
      // orang lain yang sekadar pegang HP ter-login mematikan kunci).
      openConfirmModal("confirm-disable");
      return;
    }
    setAppLockEnabled(userId, true);
    refreshLockFeatureState();
    refresh();
    audioFeedback.playChime();
  };

  // ── Modal konfirmasi PIN lama (untuk nonaktifkan / reset) ──
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<PinModalMode>("confirm-disable");
  const [confirmDraft, setConfirmDraft] = useState("");
  const [confirmError, setConfirmError] = useState(false);

  const openConfirmModal = (mode: PinModalMode) => {
    setConfirmMode(mode);
    setConfirmDraft("");
    setConfirmError(false);
    setConfirmModalOpen(true);
  };

  const handleConfirmDraftChange = async (next: string) => {
    setConfirmDraft(next);
    setConfirmError(false);
    if (next.length !== PIN_LENGTH || !userId) return;

    const ok = await verifyPin(userId, next);
    if (!ok) {
      audioFeedback.playDullPluck();
      setConfirmError(true);
      setTimeout(() => setConfirmDraft(""), 400);
      return;
    }

    audioFeedback.playChime();
    setConfirmModalOpen(false);

    if (confirmMode === "confirm-disable") {
      setAppLockEnabled(userId, false);
      refreshLockFeatureState();
      showToast(t("applock.toast_disabled"), "info");
    } else if (confirmMode === "confirm-reset") {
      resetAppLock(userId);
      refreshLockFeatureState();
      showToast(t("applock.toast_reset_success"), "success");
    }
    refresh();
  };

  // ── Face ID / Touch ID ──
  const handleToggleBiometric = async (next: boolean) => {
    if (!userId) return;
    if (!state.pinHash) {
      showToast(t("applock.toast_setup_pin_first"), "error");
      return;
    }
    if (!next) {
      disableBiometric(userId);
      refresh();
      audioFeedback.playClick();
      return;
    }
    const ok = await registerBiometric(userId, displayName);
    if (ok) {
      audioFeedback.playChime();
      showToast(t("applock.toast_biometric_enabled"), "success");
    } else {
      audioFeedback.playDullPluck();
      showToast(t("applock.toast_biometric_failed"), "error");
    }
    refresh();
  };

  return (
    <MobileSettingsDetailPage title={t("applock.menu_label")} description={t("applock.menu_desc")}>
      <div className={cx("p-5 rounded-2xl shadow-sm space-y-1", tokens.settings.profileCardBgBorder)}>
        <h3 className={cx("font-sans font-bold text-sm flex items-center gap-2 mb-3", tokens.settings.sectionHeadingBorder)}>
          <Lock size={14} className={cx(tokens.icon.accent)} />
          <span>{t("applock.section_title")}</span>
        </h3>
        <p className={cx("font-sans text-xs leading-relaxed mb-3", tokens.text.muted)}>
          {t("applock.section_desc")}
        </p>

        <ToggleSwitch
          label={t("applock.toggle_enable_label")}
          description={t("applock.toggle_enable_desc")}
          checked={state.enabled}
          onChange={handleToggleEnabled}
        />

        <div className={cx("h-px my-1", tokens.divide.subtleRose)} />

        <div className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className={cx("font-sans text-xs font-semibold", tokens.text.heading)}>
              {state.pinHash ? t("applock.btn_change_pin") : t("applock.btn_setup_pin")}
            </p>
            <p className={cx("font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] leading-relaxed mt-0.5", tokens.text.muted)}>
              {t("applock.pin_row_desc")}
            </p>
          </div>
          <button
            type="button"
            onClick={openPinSetup}
            className={cx("shrink-0 px-3.5 py-2 rounded-xl font-sans text-xs font-bold cursor-pointer flex items-center gap-1.5", tokens.settings.langToggleBtnBg, tokens.text.accent)}
          >
            <KeyRound size={13} />
            {state.pinHash ? t("common.change") : t("applock.btn_setup_pin")}
          </button>
        </div>

        {biometricSupported && (
          <>
            <div className={cx("h-px my-1", tokens.divide.subtleRose)} />
            <ToggleSwitch
              label={t("applock.toggle_biometric_label")}
              description={t("applock.toggle_biometric_desc")}
              checked={state.biometricEnabled}
              onChange={handleToggleBiometric}
            />
          </>
        )}
      </div>

      {state.pinHash && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 space-y-2.5 mt-5">
          <div className="flex items-start gap-2.5">
            <ShieldAlert size={14} className="text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className={cx("font-sans text-xs font-semibold", tokens.text.dangerSoft)}>
                {t("applock.reset_title")}
              </p>
              <p className="font-sans text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-500 leading-relaxed mt-0.5">
                {t("applock.reset_desc")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { audioFeedback.playClick(); openConfirmModal("confirm-reset"); }}
            className="w-full cursor-pointer border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 py-2.5 rounded-xl font-sans text-xs font-semibold text-red-400 tracking-tight transition-all"
          >
            {t("applock.reset_button")}
          </button>
        </div>
      )}

      {/* Modal: setup / ganti PIN */}
      <ModalShell isOpen={pinModalOpen} onClose={() => setPinModalOpen(false)} maxWidth="max-w-xs" ariaLabel={t("applock.btn_setup_pin")} className="p-6">
        <div className="space-y-5 text-center">
          <h3 className={cx("font-sans font-bold text-sm", tokens.text.heading)}>
            {pinStep === "enter" ? t("applock.setup_step_enter") : t("applock.setup_step_confirm")}
          </h3>
          <PinDots length={PIN_LENGTH} filled={pinDraft.length} error={pinError} />
          <PinPad value={pinDraft} onChange={handlePinDraftChange} />
        </div>
      </ModalShell>

      {/* Modal: konfirmasi PIN lama (nonaktifkan / reset) */}
      <ModalShell isOpen={confirmModalOpen} onClose={() => setConfirmModalOpen(false)} maxWidth="max-w-xs" ariaLabel={t("applock.confirm_pin_title")} className="p-6">
        <div className="space-y-5 text-center">
          <h3 className={cx("font-sans font-bold text-sm", tokens.text.heading)}>
            {t("applock.confirm_pin_title")}
          </h3>
          <p className={cx("font-sans text-xs -mt-3", tokens.text.muted)}>{t("applock.confirm_pin_desc")}</p>
          <PinDots length={PIN_LENGTH} filled={confirmDraft.length} error={confirmError} />
          <PinPad value={confirmDraft} onChange={handleConfirmDraftChange} />
        </div>
      </ModalShell>
    </MobileSettingsDetailPage>
  );
};
