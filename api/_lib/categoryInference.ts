export function inferCategoryKey(text: string): string {
  const t = text.toLowerCase();

  // Income
  if (/gaji|gajian|salary|upah|transfer masuk|terima gaji/.test(t)) return "salary";
  if (/bonus|hadiah|thr|sampingan|freelance|komisi|cashback|refund|kembalian/.test(t)) return "bonus";

  // Food & Drink
  if (/makan|minum|beli bakso|kopi|warung|restoran|cafe|kantin|soto|nasi|bakmi|mie|pizza|burger|ayam|pecel|gado|es teh|jus|minuman|makanan|boba|martabak|dimsum|sushi|steak|bebek/.test(t)) return "food_drink";

  // Monthly Groceries
  if (/belanja bulanan|supermarket|alfamart|indomaret|hypermart|giant|transmart|lottemart|groceries|sembako|beras|gula|minyak|tepung/.test(t)) return "monthly_groceries";

  // Vegetables / wet market
  if (/sayur|pasar|bumbu|rempah|wortel|bayam|tomat|cabe|bawang|kentang|kubis|kangkung/.test(t)) return "vegetables";

  // Bills / Utilities
  if (/listrik|air|pdam|pulsa|tagihan|wifi|internet|token|pln|telkom|indihome|telkomsel|xl|im3|tri|byU|smartfren|axis|gas|isi daya/.test(t)) return "bills";

  // Transport
  if (/grab|gojek|gocar|grabbike|ojek|bensin|bbm|solar|pertamax|pertalite|parkir|tol|bus|busway|transjakarta|mrt|lrt|krl|kereta|tiket|beli tiket|pesawat|taxiu?|angkot/.test(t)) return "transport";

  // Health
  if (/dokter|obat|apotik|apotek|klinik|rumah sakit|rs |puskesmas|bidan|bpjs|kesehatan|vitamin|suplemen|masker|covid|periksa|rawat/.test(t)) return "health";

  // Shopping / Online
  if (/tokopedia|shopee|lazada|bukalapak|blibli|tiktok shop|amazon|beli online|order|belanja online|baju|sepatu|tas|celana|kaos|dress|jaket/.test(t)) return "shopping";

  // Entertainment
  if (/netflix|spotify|youtube|games|game|steam|playstation|bioskop|cinema|nonton|hiburan|konser|event|tiket masuk/.test(t)) return "entertainment";

  // Education
  if (/sekolah|kuliah|kursus|les|bimbel|buku|alat tulis|spp|uang gedung|pendidikan/.test(t)) return "education";

  return "other";
}
