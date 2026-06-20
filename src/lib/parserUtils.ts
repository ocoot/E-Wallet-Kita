/**
 * Normalizes numbers with Indonesian suffixes (k, rb, ribu, jt, juta, and decimals like 1.5jt)
 */
export function parseAmountFromString(text: string): number {
  // Clean Whitespaces and convert to lower case
  const cleaned = text.toLowerCase().replace(/\s+/g, '').replace(/,/g, '.');
  
  // Find any numbers possibly followed by suffix indicators
  // Matching format like: 1.5jt, 25rb, 1k, 350rb, 25000
  const regex = /([\d.]+)\s*(jt|juta|rb|ribu|k)?/i;
  const match = cleaned.match(regex);
  if (!match) return 0;
  
  const numValue = parseFloat(match[1]);
  const suffix = match[2];
  
  if (!suffix) return isNaN(numValue) ? 0 : numValue;
  
  if (suffix === 'jt' || suffix === 'juta') {
    return Math.round(numValue * 1000000);
  }
  if (suffix === 'rb' || suffix === 'ribu' || suffix === 'k') {
    return Math.round(numValue * 1000);
  }
  return isNaN(numValue) ? 0 : numValue;
}
