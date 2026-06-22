/**
 * Centralized category definitions
 * Single source of truth for all category keys, labels, and metadata
 */

export type CategoryKey = 
  | 'salary' 
  | 'bonus' 
  | 'food_drink' 
  | 'monthly_groceries' 
  | 'vegetables' 
  | 'bills' 
  | 'transport'
  | 'health'
  | 'shopping'
  | 'entertainment'
  | 'education'
  | 'other';

export type Lang = 'id' | 'en';

export interface CategoryDefinition {
  key: CategoryKey;
  id: string;
  en: string;
  type: 'income' | 'expense';
}

export const CATEGORIES: CategoryDefinition[] = [
  // Income
  { key: 'salary', id: 'Gaji', en: 'Salary', type: 'income' },
  { key: 'bonus', id: 'Bonus', en: 'Bonus', type: 'income' },
  
  // Expenses
  { key: 'food_drink', id: 'Makanan & Minuman', en: 'Food & Drink', type: 'expense' },
  { key: 'monthly_groceries', id: 'Belanja Bulanan', en: 'Monthly Groceries', type: 'expense' },
  { key: 'vegetables', id: 'Belanja Sayur', en: 'Vegetables', type: 'expense' },
  { key: 'bills', id: 'Tagihan', en: 'Bills', type: 'expense' },
  { key: 'transport', id: 'Transportasi', en: 'Transportation', type: 'expense' },
  { key: 'health', id: 'Kesehatan', en: 'Health', type: 'expense' },
  { key: 'shopping', id: 'Belanja Online', en: 'Online Shopping', type: 'expense' },
  { key: 'entertainment', id: 'Hiburan', en: 'Entertainment', type: 'expense' },
  { key: 'education', id: 'Pendidikan', en: 'Education', type: 'expense' },
  { key: 'other', id: 'Lain-lain', en: 'Other', type: 'expense' },
];

export function getCategoryLabel(key: string | null | undefined, lang: Lang = 'id'): string {
  if (!key) return lang === 'id' ? 'Lain-lain' : 'Other';
  const category = CATEGORIES.find(c => c.key === key);
  return category ? category[lang] : (lang === 'id' ? 'Lain-lain' : 'Other');
}

export function getCategoryType(key: string | null | undefined): 'income' | 'expense' {
  if (!key) return 'expense';
  const category = CATEGORIES.find(c => c.key === key);
  return category?.type ?? 'expense';
}

export function getAllCategoryKeys(): CategoryKey[] {
  return CATEGORIES.map(c => c.key);
}
