import { supabase } from "./supabase";
import { Transaction, Category, Budget, BillReminder } from "../types";

export const dbService = {
  async getCategories(): Promise<Category[]> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('type')
      .order('key');

    if (error) {
      console.error('Error fetching categories:', error);
      throw error;
    }

    return data as Category[];
  },

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
  },

  async approveReceiptDraft(draftId: string): Promise<boolean> {
    const { error } = await supabase
      .from('receipt_drafts')
      .update({ approved: true })
      .eq('id', draftId);

    if (error) {
      console.error('Error approving receipt draft:', error);
      return false;
    }
    return true;
  },

  // ── Budget per kategori ──────────────────────────────────────────────

  async getBudgets(userId: string): Promise<Budget[]> {
    const { data, error } = await supabase
      .from('budgets')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching budgets:', error);
      throw error;
    }

    return data as Budget[];
  },

  async upsertBudget(
    userId: string,
    categoryKey: string,
    monthlyLimit: number,
    alertThresholdPercent: number
  ): Promise<Budget> {
    const { data, error } = await supabase
      .from('budgets')
      .upsert(
        {
          user_id: userId,
          category_key: categoryKey,
          monthly_limit: monthlyLimit,
          alert_threshold_percent: alertThresholdPercent,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'user_id,category_key' }
      )
      .select()
      .single();

    if (error) {
      console.error('Error saving budget:', error);
      throw error;
    }

    return data as Budget;
  },

  async deleteBudget(userId: string, categoryKey: string): Promise<boolean> {
    const { error } = await supabase
      .from('budgets')
      .delete()
      .eq('user_id', userId)
      .eq('category_key', categoryKey);

    if (error) {
      console.error('Error deleting budget:', error);
      return false;
    }
    return true;
  },

  /**
   * Total pengeluaran (expense) untuk satu kategori dalam bulan tertentu.
   * filterMonth harus "YYYY-MM". Dipakai untuk menghitung progres budget.
   */
  async getCategoryExpenseForMonth(
    userId: string,
    categoryKey: string,
    filterMonth: string
  ): Promise<number> {
    const [year, month] = filterMonth.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const startDate = `${filterMonth}-01`;
    const endDate = `${filterMonth}-${String(lastDay).padStart(2, '0')}`;

    const { data, error } = await supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('type', 'expense')
      .eq('category', categoryKey)
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate);

    if (error) {
      console.error('Error fetching category expense for month:', error);
      throw error;
    }

    return (data || []).reduce((sum, row: any) => sum + Number(row.amount), 0);
  },

  // ── Pengingat Tagihan (Bill Reminders) ──────────────────────────────

  async getBillReminders(userId: string): Promise<BillReminder[]> {
    const { data, error } = await supabase
      .from('bill_reminders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching bill reminders:', error);
      throw error;
    }

    return data as BillReminder[];
  },

  async saveBillReminder(
    userId: string,
    payload: {
      name: string;
      category_key: string;
      amount: number | null;
      recurrence_type: "monthly" | "yearly" | "one_time";
      due_day: number | null;
      due_date: string | null;
      notes: string | null;
    }
  ): Promise<BillReminder> {
    const { data, error } = await supabase
      .from('bill_reminders')
      .insert({ user_id: userId, ...payload })
      .select()
      .single();

    if (error) {
      console.error('Error saving bill reminder:', error);
      throw error;
    }

    return data as BillReminder;
  },

  async updateBillReminder(
    userId: string,
    reminderId: string,
    updates: Partial<Pick<BillReminder, 'name' | 'category_key' | 'amount' | 'recurrence_type' | 'due_day' | 'due_date' | 'notes' | 'is_paid' | 'paid_at'>>
  ): Promise<BillReminder> {
    const payload: Record<string, any> = { ...updates, updated_at: new Date().toISOString() };

    const { data, error } = await supabase
      .from('bill_reminders')
      .update(payload)
      .eq('id', reminderId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating bill reminder:', error);
      throw error;
    }

    return data as BillReminder;
  },

  async deleteBillReminder(userId: string, reminderId: string): Promise<boolean> {
    const { error } = await supabase
      .from('bill_reminders')
      .delete()
      .eq('id', reminderId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting bill reminder:', error);
      return false;
    }
    return true;
  },

  // FIX #bill-tx: sebelumnya ini langsung UPDATE is_paid/paid_at tanpa
  // menyentuh transactions. Sekarang lewat RPC toggle_bill_paid_web supaya
  // Tandai Lunas/Batal Lunas juga otomatis insert/delete transaksi expense
  // terkait (lihat set_bill_paid_status, migration 20260710000000) --
  // logic itu SEKARANG SATU-SATUNYA SUMBER KEBENARAN di DB, jangan
  // tambahkan lagi UPDATE bill_reminders.is_paid langsung dari tempat lain.
  //
  // userId tetap jadi parameter (walau RPC pakai auth.uid() sendiri) supaya
  // signature & call site di BillReminders.tsx tidak perlu berubah.
  //
  // PENTING: RPC akan menolak (throw) kalau amount bill ini masih NULL saat
  // p_mark_paid=true -- caller (BillReminders.tsx) harus menampilkan error
  // ini ke user lewat toast, bukan diam-diam diabaikan.
  async markBillPaid(_userId: string, reminderId: string, paid: boolean): Promise<BillReminder> {
    const { data, error } = await supabase
      .rpc('toggle_bill_paid_web', { p_bill_id: reminderId, p_mark_paid: paid });

    if (error) {
      console.error('Error toggling bill paid status:', error);
      throw error;
    }
    if (!data || data.length === 0) {
      throw new Error('Bill reminder not found or not owned by current user');
    }

    // RPC hanya mengembalikan kolom ringkas (id, name, is_paid, paid_at,
    // linked_transaction_id), bukan seluruh baris bill_reminders. Re-fetch
    // baris lengkap supaya tipe kembalian tetap BillReminder utuh seperti
    // sebelumnya (caller di BillReminders.tsx mengandalkan field lengkap
    // lewat refresh() sesudahnya, tapi fungsi ini tetap harus konsisten
    // dengan signature lamanya).
    const { data: full, error: fetchErr } = await supabase
      .from('bill_reminders')
      .select('*')
      .eq('id', reminderId)
      .single();

    if (fetchErr) {
      console.error('Error refetching bill reminder after toggle:', fetchErr);
      throw fetchErr;
    }

    return full as BillReminder;
  }
};
