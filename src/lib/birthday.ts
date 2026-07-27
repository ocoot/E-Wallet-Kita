/**
 * Helper tanggal ulang tahun -- SATU-SATUNYA sumber kebenaran di frontend
 * untuk "kapan ulang tahun user DIRAYAKAN/ditampilkan" pada suatu tahun.
 *
 * Kenapa perlu logic khusus (bukan sekadar cocokkan month+day)?
 * users.birth_date bisa jatuh di 29 Februari. Di tahun non-kabisat tanggal
 * itu tidak ada -- keputusan produk: dirayakan sehari setelahnya, yaitu
 * 1 Maret (BUKAN 28 Februari, dan BUKAN "tidak dirayakan sama sekali").
 *
 * PENTING -- drift risk: logic yang sama (secara konsep) direplikasi di
 * SQL sebagai `public.get_observed_birthday(date, int)` pada migration
 * 20260830000000_birthday_reminders.sql, dipakai oleh RPC
 * `get_due_birthday_reminders_for_notification` untuk jalur notifikasi
 * Telegram H-1. Kalau aturan pergeseran 29 Feb berubah, WAJIB disinkronkan
 * di kedua tempat (lihat komentar drift di migration tsb).
 */

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Bulan & tanggal mentah dari birth_date (YYYY-MM-DD), tanpa tahun. */
export interface BirthMonthDay {
  month: number; // 1-12
  day: number; // 1-31
}

export function parseBirthDate(birthDate: string | null | undefined): BirthMonthDay | null {
  if (!birthDate) return null;
  const parts = birthDate.split("-").map((v) => parseInt(v, 10));
  const [, month, day] = parts;
  if (!month || !day || Number.isNaN(month) || Number.isNaN(day)) return null;
  return { month, day };
}

/**
 * Tanggal ulang tahun yang DIRAYAKAN pada `year` tertentu -- sudah termasuk
 * pergeseran 29 Feb -> 1 Mar di tahun non-kabisat.
 */
export function getObservedBirthday(birth: BirthMonthDay, year: number): BirthMonthDay {
  if (birth.month === 2 && birth.day === 29 && !isLeapYear(year)) {
    return { month: 3, day: 1 };
  }
  return birth;
}

/** Apakah `dateStr` (YYYY-MM-DD) adalah tanggal ulang tahun yang dirayakan tahun itu. */
export function isBirthdayOnDate(birthDate: string | null | undefined, dateStr: string): boolean {
  const birth = parseBirthDate(birthDate);
  if (!birth) return false;
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  if (!year || !month || !day) return false;
  const observed = getObservedBirthday(birth, year);
  return observed.month === month && observed.day === day;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Dipakai untuk banner in-app (lihat MainLayout di App.tsx): apakah "hari
 * ini" ('today') atau "besok" ('tomorrow') adalah ulang tahun user yang
 * dirayakan, relatif ke tanggal LOKAL perangkat saat ini. Null kalau bukan
 * keduanya (atau user belum mengisi tanggal lahir).
 */
export function getBirthdayReminderKind(
  birthDate: string | null | undefined,
  now: Date = new Date()
): "today" | "tomorrow" | null {
  if (!birthDate) return null;
  const todayStr = toISODate(now);
  if (isBirthdayOnDate(birthDate, todayStr)) return "today";
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = toISODate(tomorrow);
  if (isBirthdayOnDate(birthDate, tomorrowStr)) return "tomorrow";
  return null;
}
