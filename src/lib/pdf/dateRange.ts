/**
 * Date helpers for PDF export.
 *
 * IMPORTANT: never build an end-of-month date by hardcoding "-31". Always
 * derive the last real day of the month via `new Date(year, month, 0)`,
 * otherwise invalid dates like "2026-06-31" get sent to Postgres and the
 * query fails with error 22008 (date/time field value out of range).
 */

const pad2 = (n: number) => String(n).padStart(2, "0");

export const toISODate = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Last calendar day of a given (1-indexed) month/year, e.g. (2026, 6) -> 30 */
export const lastDayOfMonth = (year: number, month1to12: number): number =>
  new Date(year, month1to12, 0).getDate();

/**
 * Range for "PDF Ringkasan": from day 1 of the current month through today.
 */
export const getCurrentMonthToDateRange = (): { start: Date; end: Date } => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { start, end };
};

/**
 * Range for "PDF Penuh": from day 1 of fromMonth through the last real day
 * of toMonth. Inputs are "YYYY-MM" strings as used by <input type="month">.
 */
export const getMonthRange = (
  fromMonth: string,
  toMonth: string
): { start: Date; end: Date } => {
  const [fy, fm] = fromMonth.split("-").map(Number);
  const [ty, tm] = toMonth.split("-").map(Number);

  const start = new Date(fy, fm - 1, 1);
  const lastDay = lastDayOfMonth(ty, tm);
  const end = new Date(ty, tm - 1, lastDay);

  return { start, end };
};

/**
 * Inclusive month-count difference between two "YYYY-MM" strings.
 * e.g. diffMonthsInclusive("2026-03", "2026-05") => 3 (Mar, Apr, May)
 */
export const diffMonthsInclusive = (
  fromMonth: string,
  toMonth: string
): number => {
  const [fy, fm] = fromMonth.split("-").map(Number);
  const [ty, tm] = toMonth.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
};

export const MAX_RANGE_MONTHS = 3;

export const isRangeValid = (fromMonth: string, toMonth: string): boolean => {
  if (!fromMonth || !toMonth) return false;
  const months = diffMonthsInclusive(fromMonth, toMonth);
  return months >= 1 && months <= MAX_RANGE_MONTHS;
};

/** Generates a 5-digit (max) unique-ish document number, e.g. "04821" */
export const generateDocNumber = (): string => {
  const n = Math.floor(Math.random() * 100000);
  return String(n).padStart(5, "0");
};
