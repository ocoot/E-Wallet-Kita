export interface UserSession {
  id: string;
  display_name: string;
  is_guest: boolean;
  preferred_language: "id" | "en";
  preferred_theme: "dark_obsidian" | "light_sakura";
  telegram_chat_id?: string | null;
  email?: string | null;
}

export interface UserProfile {
  id: string;
  email?: string;
  display_name: string;
  is_premium: boolean;
  is_banned: boolean;
  role: "owner" | "admin" | "user";
}

export interface Transaction {
  id: string;
  user_id: string;
  type: "income" | "expense";
  category: string;
  amount: number;
  note: string | null;
  source: "manual" | "ai_web" | "telegram";
  transaction_date: string;
  created_at: string;
}

export interface Category {
  id: string;
  key: string;
  type: "income" | "expense" | "both";
  label_id: string | null;
  label_en: string | null;
  description_id?: string | null;
  description_en?: string | null;
  priority?: number;
  is_active: boolean;
}

export interface Budget {
  id: string;
  user_id: string;
  category_key: string;
  monthly_limit: number;
  alert_threshold_percent: number;
  created_at: string;
  updated_at: string;
}

export interface PremiumVoucher {
  id: string;
  code: string;
  discount_percent: number;
  created_by: string;
  is_active: boolean;
  created_at: string;
  revoked_at?: string | null;
}

export interface UserVoucherClaim {
  id: string;
  voucher_id: string;
  user_id: string;
  claimed_at: string;
}

export interface PremiumPricing {
  basePrice: number;
  discountPercent: number;
  discountAmount: number;
  finalPrice: number;
}

export interface BillReminder {
  id: string;
  user_id: string;
  name: string;
  category_key: string;
  amount: number | null;
  recurrence_type: "monthly" | "yearly" | "one_time";
  due_day: number | null;       // untuk monthly
  due_date: string | null;      // untuk yearly/one_time (YYYY-MM-DD)
  notes: string | null;
  is_paid: boolean;
  paid_at: string | null;
  linked_transaction_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Installment {
  id: string;
  user_id: string;
  name: string;
  category_key: string;
  principal_amount: number | null;
  monthly_amount: number | null;
  total_months: number;
  months_paid: number;
  start_date: string;
  is_completed: boolean;
  notes: string | null;
  last_transaction_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccumulatedBalance {
  income_total: number;
  expense_total: number;
  balance: number;
  first_transaction_date: string | null;
}

export type SavingsPocketType =
  | "emergency_fund"  // Dana Darurat
  | "goal"            // Tabungan Tujuan (liburan, gawai, nikah, dst)
  | "education"       // Tabungan Pendidikan
  | "retirement"      // Dana Pensiun
  | "investment";     // Investasi

export interface SavingsPocket {
  id: string;
  user_id: string;
  name: string;
  pocket_type: SavingsPocketType;
  target_amount: number | null;
  target_date: string | null;
  current_amount: number;
  notes: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface SavingsPocketEntry {
  id: string;
  pocket_id: string;
  user_id: string;
  direction: "deposit" | "withdrawal";
  amount: number;
  note: string | null;
  entry_date: string;
  created_at: string;
}

export interface SavingsSummary {
  total_saved: number;
  pocket_count: number;
}
