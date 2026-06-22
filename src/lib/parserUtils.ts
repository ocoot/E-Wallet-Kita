/**
 * Unified parser for financial amounts in natural language (handling IDR suffixes and separators).
 */
export function parseAmountFromString(text: string): number {
  if (!text) return 0;
  
  let cleaned = text.toLowerCase().replace(/\s+/g, '');
  
  // Regex to match: [Digits/Separators] + [Suffix]
  // Suffix: jt/juta, rb/ribu/k
  const regex = /^([\d.,]+)\s*(jt|juta|rb|ribu|k)?$/i;
  const match = cleaned.match(regex);
  
  if (!match) return 0;
  
  const numPart = match[1];
  const suffix = match[2];
  
  let numValue: number;
  
  // Logic: 
  // If suffix exists, dot is decimal (e.g. 1.5jt -> 1500000)
  // If no suffix, dot is thousands separator (e.g. 250.000 -> 250000)
  if (suffix) {
    numValue = parseFloat(numPart.replace(/,/g, '.'));
  } else {
    numValue = parseFloat(numPart.replace(/\./g, '').replace(/,/g, '.'));
  }
  
  if (isNaN(numValue)) return 0;
  
  if (suffix === 'jt' || suffix === 'juta' || suffix === 'm') {
    return Math.round(numValue * 1_000_000);
  }
  if (suffix === 'rb' || suffix === 'ribu' || suffix === 'k') {
    return Math.round(numValue * 1_000);
  }
  
  return Math.round(numValue);
}
