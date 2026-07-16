import React from "react";
import { WorldCupDoodle } from "./doodles/WorldCupDoodle";

/**
 * Registry doodle per event -- pola "Google Doodle" untuk EWK.
 *
 * Cara nambah doodle baru untuk event lain:
 *   1. Buat komponen baru di `doodles/`, contoh `ValentineDoodle.tsx`.
 *   2. Import & daftarkan di map di bawah dengan key = `doodleId`.
 *   3. Set `overlay.doodleId` pada event terkait di `api/eventCalendar.ts`.
 * Tidak perlu ubah apa pun di DashboardHeader.
 */
const DOODLE_REGISTRY: Record<string, React.FC<{ size?: number; className?: string }>> = {
  "fifa-world-cup": WorldCupDoodle,
};

interface EventDoodleProps {
  doodleId: string;
  size?: number;
  className?: string;
}

export const EventDoodle: React.FC<EventDoodleProps> = ({ doodleId, size, className }) => {
  const Doodle = DOODLE_REGISTRY[doodleId];
  if (!Doodle) return null;
  return <Doodle size={size} className={className} />;
};
