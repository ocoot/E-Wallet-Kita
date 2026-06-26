import fs from "node:fs";
import path from "node:path";
import { TFunc } from "../../src/lib/pdf/pdfTemplate.js";

/**
 * Creates a standard PDF translator function for backend use,
 * pulling translations from locales id/en JSON files using fs.readFileSync.
 * This avoids ESM import attribute issues on Vercel.
 */
export function createPdfTranslator(lang: "id" | "en"): TFunc {
  const filePath = path.join(process.cwd(), "src", "locales", `${lang}.json`);
  const locales = JSON.parse(fs.readFileSync(filePath, "utf8"));
  
  return (key: string, replacements?: Record<string, string | number>) => {
    const parts = key.split(".");
    let current: any = locales;
    for (const part of parts) {
      if (current && typeof current === "object" && part in current) {
        current = current[part];
      } else {
        return key;
      }
    }
    if (typeof current !== "string") {
      return key;
    }
    let result = current;
    if (replacements) {
      for (const [k, v] of Object.entries(replacements)) {
        result = result.replace(`{${k}}`, String(v));
      }
    }
    return result;
  };
}
