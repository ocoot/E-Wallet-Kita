// Sumber kebenaran tunggal untuk topik FAQ rule-based di SupportChatWidget.
// Label & isi jawaban TIDAK ditulis di sini -- diambil dari locale via t()
// (lihat namespace "support.faq.topics.*" di id.json/en.json), supaya
// konsisten dengan aturan i18n §3 master prompt. File ini hanya mendefinisikan
// topic_key + daftar keyword pemicu untuk fitur "ketik kata kunci".

export interface SupportFaqTopic {
  key: string;
  keywords: string[];
}

export const SUPPORT_FAQ_TOPICS: SupportFaqTopic[] = [
  { key: "dashboard", keywords: ["dasbor", "dashboard", "saldo", "ringkasan", "grafik"] },
  { key: "new_transaction", keywords: ["catat", "transaksi baru", "tambah transaksi", "struk", "ocr", "receipt", "record"] },
  { key: "history", keywords: ["riwayat", "history", "filter", "edit transaksi", "hapus transaksi"] },
  { key: "categories", keywords: ["kategori", "category", "categories"] },
  { key: "telegram", keywords: ["telegram", "bot", "link", "hubungkan", "connect"] },
  { key: "premium", keywords: ["premium", "voucher", "export", "upgrade"] },
];

/** Cari topik FAQ yang paling cocok berdasarkan keyword di teks user. Return null kalau tidak ada yang cocok (di luar konteks aplikasi). */
export function matchSupportFaqTopic(text: string): SupportFaqTopic | null {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;
  return SUPPORT_FAQ_TOPICS.find((topic) => topic.keywords.some((kw) => normalized.includes(kw))) ?? null;
}
