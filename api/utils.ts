export function inferCategoryKey(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("makan") || t.includes("minum") || t.includes("beli bakso") || t.includes("kopi") || t.includes("warung") || t.includes("restoran")) {
    return "food_drink";
  }
  if (t.includes("gaji") || t.includes("gajian") || t.includes("salary") || t.includes("upah") || t.includes("transfer masuk")) {
    return "salary";
  }
  if (t.includes("bonus") || t.includes("hadiah") || t.includes("thr") || t.includes("sampingan")) {
    return "bonus";
  }
  if (t.includes("belanja bulanan") || t.includes("supermarket") || t.includes("alfamart") || t.includes("indomaret") || t.includes("groceries")) {
    return "monthly_groceries";
  }
  if (t.includes("sayur") || t.includes("pasar") || t.includes("bumbu") || t.includes("belanja sayur")) {
    return "vegetables";
  }
  if (t.includes("listrik") || t.includes("air") || t.includes("pdam") || t.includes("pulsa") || t.includes("tagihan") || t.includes("wifi") || t.includes("internet") || t.includes("token")) {
    return "bills";
  }
  return "other";
}
