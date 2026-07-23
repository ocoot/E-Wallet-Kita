import React, { useState } from "react";
import { Volume2 } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useThemeTokens } from "../../hooks/useThemeTokens";
import { audioFeedback } from "../../lib/audio";
import { MobileSettingsDetailPage } from "../../components/settings/MobileSettingsDetailPage";
import { ToggleSwitch } from "../../components/ui/ToggleSwitch";

/**
 * Halaman "Suara & Getar" -- sebelumnya tombol mute suara ada di footer
 * Sidebar (desktop) & lembar "Lainnya" MobileBottomNav (mobile), campur
 * dengan tombol bahasa/tema. Dipindah ke sini supaya sejalan dengan
 * kontrol preferensi lain (Tema, Bahasa, dst) yang semuanya sudah ada
 * halamannya sendiri di menu Pengaturan/Akun, dan supaya getar bisa diatur
 * TERPISAH dari suara (lihat lib/audio.ts).
 */
export const SoundHapticsSettings: React.FC = () => {
  const { t } = useLanguage();
  const { tokens, cx } = useThemeTokens();

  const [soundEnabled, setSoundEnabled] = useState(!audioFeedback.getIsMuted());
  const [hapticEnabled, setHapticEnabled] = useState(audioFeedback.getIsHapticEnabled());

  const handleToggleSound = (next: boolean) => {
    audioFeedback.setMuted(!next);
    setSoundEnabled(next);
    if (next) audioFeedback.playChime();
  };

  const handleToggleHaptic = (next: boolean) => {
    audioFeedback.setHapticEnabled(next);
    setHapticEnabled(next);
    if (next) audioFeedback.tapHaptic();
    audioFeedback.playClick();
  };

  return (
    <MobileSettingsDetailPage title={t("settings.menu_sound_haptics")} description={t("settings.menu_sound_haptics_desc")}>
      <div className={cx("p-5 rounded-2xl shadow-sm space-y-1", tokens.settings.profileCardBgBorder)}>
        <h3 className={cx("font-sans font-bold text-sm flex items-center gap-2 mb-3", tokens.settings.sectionHeadingBorder)}>
          <Volume2 size={14} className={cx(tokens.icon.accent)} />
          <span>{t("settings.menu_sound_haptics")}</span>
        </h3>

        <ToggleSwitch
          label={t("soundhaptics.toggle_sound_label")}
          description={t("soundhaptics.toggle_sound_desc")}
          checked={soundEnabled}
          onChange={handleToggleSound}
        />

        <div className={cx("h-px my-1", tokens.divide.subtleRose)} />

        <ToggleSwitch
          label={t("soundhaptics.toggle_haptic_label")}
          description={t("soundhaptics.toggle_haptic_desc")}
          checked={hapticEnabled}
          onChange={handleToggleHaptic}
        />
      </div>
    </MobileSettingsDetailPage>
  );
};
