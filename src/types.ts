export interface UserSession {
  id: string;
  display_name: string;
  is_guest: boolean;
  preferred_language: "id" | "en";
  preferred_theme: "dark_obsidian" | "light_sakura";
  telegram_chat_id?: string | null;
  email?: string | null;
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
