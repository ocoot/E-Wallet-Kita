/**
 * Unified parser for financial amounts in natural language (handling IDR suffixes and separators).
 *
 * FIX: Previously this only matched if the ENTIRE string was just a number + suffix
 * (e.g. "25rb" worked but "beli kopi 25rb" or "makan siang 50000" returned 0).
 * Now it scans the whole text for amount-like tokens and picks the best candidate,
 * so natural-language transaction messages parse correctly.
 */
export function parseAmountFromString(text: string): number {
  if (!text) return 0;

  const lower = text.toLowerCase();

  // Find every "number [+ optional suffix]" token anywhere in the string.
  // Examples it should catch: "25rb", "Rp 250.000", "1.5jt", "50000", "15k"
  const tokenRegex = /(\d[\d.,]*)\s*(jt|juta|rb|ribu|k)?\b/gi;

  type Candidate = { value: number; hasSuffix: boolean; raw: string };
  const candidates: Candidate[] = [];

  let m: RegExpExecArray | null;
  while ((m = tokenRegex.exec(lower)) !== null) {
    const numPart = m[1];
    const suffix = m[2];

    // Skip bare tokens that are almost certainly not an amount (e.g. lone "1" from "1x")
    let numValue: number;
    if (suffix) {
      // dot/comma is a decimal separator when followed by a multiplier (1.5jt -> 1.5 * 1_000_000)
      numValue = parseFloat(numPart.replace(/,/g, '.'));
    } else {
      // dot is an Indonesian thousands separator when there's no suffix (250.000 -> 250000)
      numValue = parseFloat(numPart.replace(/\./g, '').replace(/,/g, '.'));
    }

    if (isNaN(numValue)) continue;

    let value: number;
    if (suffix === 'jt' || suffix === 'juta') {
      value = Math.round(numValue * 1_000_000);
    } else if (suffix === 'rb' || suffix === 'ribu' || suffix === 'k') {
      value = Math.round(numValue * 1_000);
    } else {
      value = Math.round(numValue);
    }

    // Bare small numbers without a suffix (e.g. "3" in "beli 3 ayam") are almost
    // always a quantity, not a Rupiah amount — require at least 3 digits (>= 100)
    // unless there's an explicit thousand/million suffix attached.
    const looksLikeQuantity = !suffix && value < 100;

    if (value > 0 && !looksLikeQuantity) {
      candidates.push({ value, hasSuffix: !!suffix, raw: m[0] });
    }
  }

  if (candidates.length === 0) return 0;

  // Prefer tokens that had an explicit amount suffix (rb/jt/k) since those are
  // almost always the transaction amount rather than an incidental number
  // (dates, quantities, etc). Among same-priority candidates, take the largest.
  const withSuffix = candidates.filter(c => c.hasSuffix);
  const pool = withSuffix.length > 0 ? withSuffix : candidates;

  return pool.reduce((max, c) => (c.value > max.value ? c : max), pool[0]).value;
}
