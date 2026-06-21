import { VercelRequest, VercelResponse } from '@vercel/node';
import { parseAmountFromString } from '../../src/lib/parserUtils';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const scenarios = [
    "Makan siang 25000",
    "Gaji 1.5jt",
    "Belanja sayur 25rb",
    "Bonus 1k",
    "Tagihan listrik 350rb"
  ];
  const results = scenarios.map(txt => ({
    input: txt,
    parsedAmount: parseAmountFromString(txt)
  }));
  res.json({ info: "Unit test for parsing Indonesian suffixes", results });
}
