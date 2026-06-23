import { supabase } from "./supabase";
import { Transaction } from "../types";

export const dbService = {
  async getTransactions(userId: string, filterMonth?: string): Promise<Transaction[]> {
    let query = supabase
      .from('transactions')
      .select('*')
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false });

    // RLS filters this by user_id automatically, but we include it for safety
    query = query.eq('user_id', userId);

    if (filterMonth) {
      // filterMonth is "YYYY-MM"
      const [year, month] = filterMonth.split('-').map(Number);
      const lastDay = new Date(year, month, 0).getDate();
      const startDate = `${filterMonth}-01`;
      const endDate = `${filterMonth}-${lastDay}`;
      query = query.gte('transaction_date', startDate).lte('transaction_date', endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching transactions:', error);
      throw error;
    }

    // If no transactions exist, we could seed but usually in real DB we just return empty
    // To maintain the "beautiful UI" requirement, let's keep the client-side seeding 
    // ONLY if it's a first-time guest or specifically requested to show samples.
    // For now, let's just return what's in the DB.
    return data as Transaction[];
  },

  /**
   * Fetch all transactions between two ISO dates (inclusive), ignoring the
   * monthly filter used by the History page. Used by PDF export so that
   * "PDF Penuh" (multi-month range) is not limited to a single month.
   * startDate/endDate must be in "YYYY-MM-DD" format.
   */
  async getTransactionsBetween(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<Transaction[]> {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate)
      .order('transaction_date', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching transactions between dates:', error);
      throw error;
    }

    return data as Transaction[];
  },

  async saveTransaction(
    userId: string,
    type: "income" | "expense",
    category: string,
    amount: number,
    note: string | null,
    source: "manual" | "ai_web" | "telegram",
    transactionDate: string
  ): Promise<Transaction> {
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        type,
        category,
        amount: Math.max(0, amount),
        note: note ? note.trim() : null,
        source,
        transaction_date: transactionDate
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving transaction:', error);
      throw error;
    }

    return data as Transaction;
  },

  async deleteTransaction(userId: string, transactionId: string): Promise<boolean> {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', transactionId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting transaction:', error);
      return false;
    }
    return true;
  },

  async updateTransaction(
    userId: string,
    transactionId: string,
    updates: { category?: string; amount?: number }
  ): Promise<Transaction> {
    const payload: Record<string, any> = {};
    if (updates.category !== undefined) payload.category = updates.category;
    if (updates.amount !== undefined) payload.amount = Math.max(0, updates.amount);

    const { data, error } = await supabase
      .from('transactions')
      .update(payload)
      .eq('id', transactionId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating transaction:', error);
      throw error;
    }

    return data as Transaction;
  },

  async purgeAllTransactions(userId: string): Promise<void> {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('Error purging transactions:', error);
      throw error;
    }
  }
};

