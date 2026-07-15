import { supabase } from "./supabase";
import { Transaction, Category, Budget, BillReminder, Installment, AccumulatedBalance, SavingsPocket, SavingsPocketEntry, SavingsSummary, SavingsPocketType, GoldPocket, GoldPocketEntry, GoldHoldingsSummary, GoldBrand, ACTIVE_GOLD_BRANDS, Wallet, WalletWithBalance, WalletType } from "../types";

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

  // Root cause / why: insiden 15/7/2026 -- ditemukan 9 baris transaksi
  // untuk 1 struk fisik yang sama (merchant, nominal, tanggal, catatan
  // identik), tersebar 12 jam, kategori beda-beda tiap percobaan. Bukan
  // bug teknis (tombol konfirmasi sudah correctly disabled saat isSaving,
  // jadi bukan double-click race) -- pengguna berulang kali submit ULANG
  // struk fisik yang SAMA karena tidak yakin percobaan sebelumnya
  // tersimpan, dan aplikasi tidak pernah memperingatkan "ini mirip
  // transaksi yang sudah ada". Fungsi ini dipanggil dari layar konfirmasi
  // (ConfirmTransactionModal) SEBELUM saveTransaction, murni untuk
  // menampilkan peringatan -- tidak memblokir, karena transaksi mirip yang
  // memang legitimate (mis. beli kopi 20rb 2x sehari) tetap harus bisa
  // disimpan tanpa gesekan.
  async findPossibleDuplicateTransaction(
    userId: string,
    amount: number,
    transactionDate: string,
    note: string | null
  ): Promise<Transaction | null> {
    if (!note || !note.trim()) return null;

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('amount', amount)
      .eq('transaction_date', transactionDate)
      .eq('note', note.trim())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      // Soft-fail: kegagalan cek duplikat TIDAK BOLEH menghalangi pengguna
      // menyimpan transaksi yang sah -- ini cuma lapisan peringatan.
      console.error('Error checking possible duplicate transaction:', error);
      return null;
    }
    return (data as Transaction) ?? null;
  },

  async saveTransaction(
    userId: string,
    type: "income" | "expense",
    category: string,
    amount: number,
    note: string | null,
    source: "manual" | "ai_web" | "telegram",
    transactionDate: string,
    walletId?: string | null
  ): Promise<Transaction> {
    // Kalau tidak ada wallet dipilih, tetap arahkan ke pos "Saldo Total"
    // supaya setiap transaksi selalu punya rumah -- konsisten dengan
    // perilaku backfill untuk transaksi lama.
    const resolvedWalletId = walletId ?? (await dbService.ensureGeneralWallet(userId));

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        type,
        category,
        amount: Math.max(0, amount),
        note: note ? note.trim() : null,
        source,
        transaction_date: transactionDate,
        wallet_id: resolvedWalletId
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
    updates: { category?: string; amount?: number; transaction_date?: string; wallet_id?: string | null }
  ): Promise<Transaction> {
    const payload: Record<string, any> = {};
    if (updates.category !== undefined) payload.category = updates.category;
    if (updates.amount !== undefined) payload.amount = Math.max(0, updates.amount);
    if (updates.transaction_date !== undefined) payload.transaction_date = updates.transaction_date;
    if (updates.wallet_id !== undefined) payload.wallet_id = updates.wallet_id;

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

  // ── Pos Dompet (Wallets) ──────────────────────────────────────────────
  // Lihat migration 20260708000000_wallets_pos_system.sql untuk skema & RPC.

  /** Pastikan pos "Saldo Total" ada, kembalikan id-nya. Aman dipanggil berkali-kali. */
  async ensureGeneralWallet(userId: string): Promise<string> {
    const { data, error } = await supabase.rpc('ensure_general_wallet', { p_user_id: userId });
    if (error) {
      console.error('Error ensuring general wallet:', error);
      throw error;
    }
    return data as string;
  },

  async getWallets(userId: string): Promise<WalletWithBalance[]> {
    const { data, error } = await supabase.rpc('get_wallets_with_balance', { p_user_id: userId });
    if (error) {
      console.error('Error fetching wallets:', error);
      throw error;
    }
    return (data ?? []) as WalletWithBalance[];
  },

  async createWallet(
    userId: string,
    name: string,
    type: Exclude<WalletType, 'general'>,
    provider: string | null,
    startingBalance: number = 0,
    phoneNumber: string | null = null,
    accountNumber: string | null = null
  ): Promise<string> {
    const { data, error } = await supabase.rpc('create_wallet', {
      p_user_id: userId,
      p_name: name,
      p_type: type,
      p_provider: provider,
      p_starting_balance: startingBalance,
      p_phone_number: phoneNumber,
      p_account_number: accountNumber
    });
    if (error) {
      console.error('Error creating wallet:', error);
      throw error;
    }
    return data as string;
  },

  /** Edit saldo manual: user memasukkan saldo "sebenarnya", sistem menyesuaikan basisnya. */
  async setWalletBalance(userId: string, walletId: string, newBalance: number): Promise<void> {
    const { error } = await supabase.rpc('set_wallet_balance', {
      p_user_id: userId,
      p_wallet_id: walletId,
      p_new_balance: newBalance
    });
    if (error) {
      console.error('Error setting wallet balance:', error);
      throw error;
    }
  },

  async updateWallet(
    userId: string,
    walletId: string,
    updates: {
      name?: string;
      provider?: string | null;
      is_archived?: boolean;
      phoneNumber?: string | null;
      accountNumber?: string | null;
      clearPhoneNumber?: boolean;
      clearAccountNumber?: boolean;
    }
  ): Promise<void> {
    const { error } = await supabase.rpc('update_wallet', {
      p_user_id: userId,
      p_wallet_id: walletId,
      p_name: updates.name ?? null,
      p_provider: updates.provider ?? null,
      p_is_archived: updates.is_archived ?? null,
      p_phone_number: updates.phoneNumber ?? null,
      p_account_number: updates.accountNumber ?? null,
      p_clear_phone_number: updates.clearPhoneNumber ?? false,
      p_clear_account_number: updates.clearAccountNumber ?? false
    });
    if (error) {
      console.error('Error updating wallet:', error);
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
      wallet_id?: string | null;
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
    updates: Partial<Pick<BillReminder, 'name' | 'category_key' | 'amount' | 'recurrence_type' | 'due_day' | 'due_date' | 'notes' | 'is_paid' | 'paid_at' | 'wallet_id'>>
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

  /**
   * Tandai bill reminder lunas. Pakai RPC mark_bill_paid_for_user supaya
   * insert transaksi (kalau amount terisi) + update is_paid terjadi dalam
   * satu operasi atomic (lihat migration 20260710000000).
   * needsManualAmount = true artinya amount bill ini NULL, jadi tidak ada
   * transaksi yang otomatis dibuat -- caller (UI) harus arahkan user ke
   * form transaksi manual.
   */
  async markBillPaidWithTransaction(billId: string): Promise<{
    linkedTransactionId: string | null;
    needsManualAmount: boolean;
  }> {
    const { data, error } = await supabase.rpc('mark_bill_paid_for_user', { p_bill_id: billId });
    if (error) {
      console.error('Error marking bill paid:', error);
      throw error;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      // Tidak ditemukan / sudah lunas duluan
      throw new Error('BILL_NOT_FOUND_OR_ALREADY_PAID');
    }
    return {
      linkedTransactionId: row.linked_transaction_id ?? null,
      needsManualAmount: !!row.needs_manual_amount
    };
  },

  /**
   * Batalkan status lunas. RPC unmark_bill_paid_for_user akan ikut
   * menghapus transaksi yang sebelumnya dibuat otomatis (linked_transaction_id),
   * supaya saldo & riwayat konsisten lagi dengan status bill.
   */
  async unmarkBillPaid(billId: string): Promise<{ deletedTransactionId: string | null }> {
    const { data, error } = await supabase.rpc('unmark_bill_paid_for_user', { p_bill_id: billId });
    if (error) {
      console.error('Error unmarking bill paid:', error);
      throw error;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      throw new Error('BILL_NOT_FOUND_OR_NOT_PAID');
    }
    return { deletedTransactionId: row.deleted_transaction_id ?? null };
  },

  async markBillPaid(userId: string, reminderId: string, paid: boolean): Promise<BillReminder> {
    return await dbService.updateBillReminder(userId, reminderId, {
      is_paid: paid,
      paid_at: paid ? new Date().toISOString() : null
    });
  },

  // ── Cicilan / Utang Jangka Panjang (Installments) ───────────────────

  async getInstallments(userId: string): Promise<Installment[]> {
    const { data, error } = await supabase
      .from('installments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching installments:', error);
      throw error;
    }

    return data as Installment[];
  },

  async saveInstallment(
    userId: string,
    payload: {
      name: string;
      category_key: string;
      principal_amount: number | null;
      monthly_amount: number | null;
      total_months: number;
      start_date: string;
      notes: string | null;
      wallet_id?: string | null;
    }
  ): Promise<Installment> {
    const { data, error } = await supabase
      .from('installments')
      .insert({ user_id: userId, ...payload })
      .select()
      .single();

    if (error) {
      console.error('Error saving installment:', error);
      throw error;
    }

    return data as Installment;
  },

  async updateInstallment(
    userId: string,
    installmentId: string,
    updates: Partial<Pick<Installment, 'name' | 'category_key' | 'principal_amount' | 'monthly_amount' | 'total_months' | 'start_date' | 'notes' | 'wallet_id'>>
  ): Promise<Installment> {
    const payload: Record<string, any> = { ...updates, updated_at: new Date().toISOString() };

    const { data, error } = await supabase
      .from('installments')
      .update(payload)
      .eq('id', installmentId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating installment:', error);
      throw error;
    }

    return data as Installment;
  },

  async deleteInstallment(userId: string, installmentId: string): Promise<boolean> {
    const { error } = await supabase
      .from('installments')
      .delete()
      .eq('id', installmentId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting installment:', error);
      return false;
    }
    return true;
  },

  /**
   * Tandai 1 bulan cicilan lunas. Pakai RPC supaya increment months_paid +
   * insert transaksi (kalau monthly_amount terisi) atomic dalam satu
   * operasi -- sama polanya dengan markBillPaidWithTransaction.
   */
  async markInstallmentMonthPaid(installmentId: string): Promise<{
    monthsPaid: number;
    totalMonths: number;
    isCompleted: boolean;
    linkedTransactionId: string | null;
    needsManualAmount: boolean;
  }> {
    const { data, error } = await supabase.rpc('mark_installment_month_paid_for_user', { p_installment_id: installmentId });
    if (error) {
      console.error('Error marking installment month paid:', error);
      throw error;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      throw new Error('INSTALLMENT_NOT_FOUND_OR_ALREADY_COMPLETE');
    }
    return {
      monthsPaid: row.months_paid,
      totalMonths: row.total_months,
      isCompleted: !!row.is_completed,
      linkedTransactionId: row.linked_transaction_id ?? null,
      needsManualAmount: !!row.needs_manual_amount
    };
  },

  /** Batalkan pembayaran bulan terakhir (undo). Ikut menghapus transaksi terkait. */
  async unmarkInstallmentLastPayment(installmentId: string): Promise<{
    monthsPaid: number;
    deletedTransactionId: string | null;
  }> {
    const { data, error } = await supabase.rpc('unmark_installment_last_payment_for_user', { p_installment_id: installmentId });
    if (error) {
      console.error('Error unmarking installment payment:', error);
      throw error;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      throw new Error('INSTALLMENT_NOT_FOUND_OR_NO_PAYMENTS');
    }
    return {
      monthsPaid: row.months_paid,
      deletedTransactionId: row.deleted_transaction_id ?? null
    };
  },

  // ── Saldo Terakumulasi (Accumulated Balance) ─────────────────────────

  /**
   * Total saldo terakumulasi dari SELURUH transaksi user sampai tanggal
   * tertentu (default: hari ini), bukan cuma bulan berjalan. Dihitung di
   * server (SUM agregat) lewat RPC get_accumulated_balance supaya tidak
   * perlu fetch seluruh baris transaksi ke client.
   */
  async getAccumulatedBalance(asOfDate?: string): Promise<AccumulatedBalance> {
    const { data, error } = await supabase.rpc('get_accumulated_balance', asOfDate ? { p_as_of_date: asOfDate } : {});
    if (error) {
      console.error('Error fetching accumulated balance:', error);
      throw error;
    }
    const row = Array.isArray(data) ? data[0] : data;
    return {
      income_total: Number(row?.income_total ?? 0),
      expense_total: Number(row?.expense_total ?? 0),
      balance: Number(row?.balance ?? 0),
      first_transaction_date: row?.first_transaction_date ?? null
    };
  },

  // ── Tabungan (Savings Pockets) ──────────────────────────────────────
  // CRUD dasar pocket = direct table access (pola sama dengan bill_reminders),
  // diamankan RLS. Deposit/withdraw WAJIB lewat RPC karena harus atomik
  // dengan penulisan ke savings_pocket_entries (lihat migration terkait).

  async getSavingsPockets(userId: string): Promise<SavingsPocket[]> {
    const { data, error } = await supabase
      .from('savings_pockets')
      .select('*')
      .eq('user_id', userId)
      .order('is_archived', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching savings pockets:', error);
      throw error;
    }

    return data as SavingsPocket[];
  },

  async createSavingsPocket(
    userId: string,
    payload: {
      name: string;
      pocket_type: SavingsPocketType;
      target_amount: number | null;
      target_date: string | null;
      notes: string | null;
      wallet_id?: string | null;
    }
  ): Promise<SavingsPocket> {
    const { data, error } = await supabase
      .from('savings_pockets')
      .insert({ user_id: userId, ...payload })
      .select()
      .single();

    if (error) {
      console.error('Error creating savings pocket:', error);
      throw error;
    }

    return data as SavingsPocket;
  },

  async updateSavingsPocket(
    userId: string,
    pocketId: string,
    updates: Partial<Pick<SavingsPocket, 'name' | 'target_amount' | 'target_date' | 'notes' | 'is_archived' | 'wallet_id'>>
  ): Promise<SavingsPocket> {
    const payload: Record<string, any> = { ...updates, updated_at: new Date().toISOString() };

    const { data, error } = await supabase
      .from('savings_pockets')
      .update(payload)
      .eq('id', pocketId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating savings pocket:', error);
      throw error;
    }

    return data as SavingsPocket;
  },

  async deleteSavingsPocket(userId: string, pocketId: string): Promise<boolean> {
    const { error } = await supabase
      .from('savings_pockets')
      .delete()
      .eq('id', pocketId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting savings pocket:', error);
      return false;
    }
    return true;
  },

  async getSavingsPocketEntries(userId: string, pocketId: string): Promise<SavingsPocketEntry[]> {
    const { data, error } = await supabase
      .from('savings_pocket_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('pocket_id', pocketId)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching savings pocket entries:', error);
      throw error;
    }

    return data as SavingsPocketEntry[];
  },

  /**
   * Setor dana dari saldo tersedia ke sebuah pocket. TIDAK menyentuh
   * transactions/accumulated balance -- murni reklasifikasi internal.
   */
  async depositToPocket(
    pocketId: string,
    amount: number,
    note: string | null,
    entryDate?: string
  ): Promise<SavingsPocket> {
    const { data, error } = await supabase.rpc('deposit_to_pocket_for_user', {
      p_pocket_id: pocketId,
      p_amount: amount,
      p_note: note,
      ...(entryDate ? { p_entry_date: entryDate } : {})
    });

    if (error) {
      console.error('Error depositing to pocket:', error);
      throw error;
    }

    return data as SavingsPocket;
  },

  /**
   * Tarik dana dari pocket kembali ke saldo tersedia. RPC akan menolak
   * (error INSUFFICIENT_POCKET_BALANCE) kalau amount > current_amount.
   */
  async withdrawFromPocket(
    pocketId: string,
    amount: number,
    note: string | null,
    entryDate?: string
  ): Promise<SavingsPocket> {
    const { data, error } = await supabase.rpc('withdraw_from_pocket_for_user', {
      p_pocket_id: pocketId,
      p_amount: amount,
      p_note: note,
      ...(entryDate ? { p_entry_date: entryDate } : {})
    });

    if (error) {
      console.error('Error withdrawing from pocket:', error);
      throw error;
    }

    return data as SavingsPocket;
  },

  /**
   * Total tersimpan di semua pocket aktif (non-archived) + jumlah pocket.
   * Dipakai untuk menghitung "Saldo Tersedia" = accumulated balance - total_saved.
   */
  async getSavingsSummary(): Promise<SavingsSummary> {
    const { data, error } = await supabase.rpc('get_savings_summary');
    if (error) {
      console.error('Error fetching savings summary:', error);
      throw error;
    }
    const row = Array.isArray(data) ? data[0] : data;
    return {
      total_saved: Number(row?.total_saved ?? 0),
      pocket_count: Number(row?.pocket_count ?? 0)
    };
  },

  // ── Tabungan Emas (Gold Savings) ───────────────────────────
  // CRUD dasar pocket = direct table access (sama seperti savings_pockets).
  // Buy/sell/adjust WAJIB lewat RPC karena harus atomik dengan
  // gold_pocket_entries + validasi harga terkini (lihat migration
  // 20260803000000_gold_savings.sql untuk detail akuntansi cash_locked_amount).

  async getGoldPockets(userId: string): Promise<GoldPocket[]> {
    const { data, error } = await supabase
      .from('gold_pockets')
      .select('*')
      .eq('user_id', userId)
      .order('is_archived', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching gold pockets:', error);
      throw error;
    }

    return data as GoldPocket[];
  },

  async createGoldPocket(
    userId: string,
    payload: { name: string; brand: GoldBrand; notes: string | null; wallet_id?: string | null }
  ): Promise<GoldPocket> {
    const { data, error } = await supabase
      .from('gold_pockets')
      .insert({ user_id: userId, ...payload })
      .select()
      .single();

    if (error) {
      console.error('Error creating gold pocket:', error);
      throw error;
    }

    return data as GoldPocket;
  },

  async updateGoldPocket(
    userId: string,
    pocketId: string,
    updates: Partial<Pick<GoldPocket, 'name' | 'notes' | 'is_archived' | 'wallet_id'>>
  ): Promise<GoldPocket> {
    const payload: Record<string, any> = { ...updates, updated_at: new Date().toISOString() };

    const { data, error } = await supabase
      .from('gold_pockets')
      .update(payload)
      .eq('id', pocketId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating gold pocket:', error);
      throw error;
    }

    return data as GoldPocket;
  },

  async deleteGoldPocket(userId: string, pocketId: string): Promise<boolean> {
    const { error } = await supabase
      .from('gold_pockets')
      .delete()
      .eq('id', pocketId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting gold pocket:', error);
      return false;
    }
    return true;
  },

  async getGoldPocketEntries(userId: string, pocketId: string): Promise<GoldPocketEntry[]> {
    const { data, error } = await supabase
      .from('gold_pocket_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('pocket_id', pocketId)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching gold pocket entries:', error);
      throw error;
    }

    return data as GoldPocketEntry[];
  },

  /**
   * Simulasi beli emas di harga acuan pasar + margin aplikasi. TIDAK
   * memotong Saldo Tersedia (lihat migration
   * 20260814000000_decouple_gold_simulation_from_balance.sql) -- murni
   * mencatat gram & cash_locked_amount (basis hitung Untung/Rugi).
   */
  async buyGold(
    pocketId: string,
    idrAmount: number,
    note: string | null,
    entryDate?: string
  ): Promise<GoldPocket> {
    const { data, error } = await supabase.rpc('buy_gold_for_user', {
      p_pocket_id: pocketId,
      p_idr_amount: idrAmount,
      p_note: note,
      ...(entryDate ? { p_entry_date: entryDate } : {})
    });

    if (error) {
      console.error('Error buying gold:', error);
      throw error;
    }

    return data as GoldPocket;
  },

  /**
   * Simulasi jual sebagian/seluruh gram di harga acuan buyback dikurangi
   * margin aplikasi. TIDAK menambah Saldo Tersedia -- murni mencatat gram
   * & cash_locked_amount (lihat migration
   * 20260814000000_decouple_gold_simulation_from_balance.sql).
   */
  async sellGold(
    pocketId: string,
    grams: number,
    note: string | null,
    entryDate?: string
  ): Promise<GoldPocket> {
    const { data, error } = await supabase.rpc('sell_gold_for_user', {
      p_pocket_id: pocketId,
      p_grams: grams,
      p_note: note,
      ...(entryDate ? { p_entry_date: entryDate } : {})
    });

    if (error) {
      console.error('Error selling gold:', error);
      throw error;
    }

    return data as GoldPocket;
  },

  /**
   * Declare emas fisik yang sudah dimiliki (direction='add') atau koreksi
   * keluar di luar app (direction='remove'). TIDAK memotong/menambah Saldo
   * Tersedia -- lihat catatan di migration.
   */
  async adjustGoldHolding(
    pocketId: string,
    direction: 'add' | 'remove',
    grams: number,
    note: string | null,
    entryDate?: string
  ): Promise<GoldPocket> {
    const { data, error } = await supabase.rpc('adjust_gold_holding_for_user', {
      p_pocket_id: pocketId,
      p_direction: direction,
      p_grams: grams,
      p_note: note,
      ...(entryDate ? { p_entry_date: entryDate } : {})
    });

    if (error) {
      console.error('Error adjusting gold holding:', error);
      throw error;
    }

    return data as GoldPocket;
  },

  /**
   * Total gram, cash_locked (basis hitung Untung/Rugi -- BUKAN pengurang
   * Saldo Tersedia sejak migration
   * 20260814000000_decouple_gold_simulation_from_balance.sql), estimasi
   * nilai pasar sekarang & untung/rugi belum direalisasi (penambah Total
   * Kekayaan).
   */
  async getGoldHoldingsSummary(): Promise<GoldHoldingsSummary> {
    const { data, error } = await supabase.rpc('get_gold_holdings_summary');
    if (error) {
      console.error('Error fetching gold holdings summary:', error);
      throw error;
    }
    const row = Array.isArray(data) ? data[0] : data;
    return {
      total_grams: Number(row?.total_grams ?? 0),
      total_cash_locked: Number(row?.total_cash_locked ?? 0),
      total_market_value: Number(row?.total_market_value ?? 0),
      unrealized_gain_loss: Number(row?.unrealized_gain_loss ?? 0),
      pocket_count: Number(row?.pocket_count ?? 0),
      stale_pocket_count: Number(row?.stale_pocket_count ?? 0)
    };
  },

  /** Harga terbaru semua brand (untuk halaman pilih brand & tampilan harga). */
  async getLatestGoldPrices(): Promise<Array<{
    brand: GoldBrand;
    sell_price_per_gram: number;
    // Nullable sejak migration 20260803020000_allow_null_buyback_price.sql --
    // selaraskan dengan GoldPriceRow di useGoldSavings.ts.
    buyback_price_per_gram: number | null;
    price_date: string;
    fetched_at: string;
    // Ditambahkan untuk indikator ↑↓ perbandingan harga vs hari sebelumnya
    // (lihat GoldSavings.tsx). `null` kalau brand baru pertama kali sync
    // atau memang belum ada data 2 hari berbeda.
    prev_sell_price_per_gram: number | null;
    prev_buyback_price_per_gram: number | null;
    prev_price_date: string | null;
  }>> {
    const { data, error } = await supabase
      .from('gold_prices')
      .select('brand, sell_price_per_gram, buyback_price_per_gram, price_date, fetched_at')
      .in('brand', ACTIVE_GOLD_BRANDS)
      .order('price_date', { ascending: false })
      .order('fetched_at', { ascending: false });

    if (error) {
      console.error('Error fetching gold prices:', error);
      throw error;
    }

    // Data sudah terurut price_date terbaru dulu. Kolom `gold_prices` punya
    // UNIQUE(brand, price_date), jadi ambil maksimal 2 baris pertama yang
    // ditemui per brand: baris ke-1 = harga terbaru, baris ke-2 (otomatis
    // price_date berbeda karena constraint unique) = harga hari sebelumnya.
    const rowsByBrand = new Map<string, any[]>();
    for (const row of (data || [])) {
      const existing = rowsByBrand.get(row.brand) ?? [];
      if (existing.length < 2) {
        existing.push(row);
        rowsByBrand.set(row.brand, existing);
      }
    }

    return Array.from(rowsByBrand.values()).map(([latest, prev]) => ({
      brand: latest.brand,
      sell_price_per_gram: latest.sell_price_per_gram,
      buyback_price_per_gram: latest.buyback_price_per_gram,
      price_date: latest.price_date,
      fetched_at: latest.fetched_at,
      prev_sell_price_per_gram: prev?.sell_price_per_gram ?? null,
      prev_buyback_price_per_gram: prev?.buyback_price_per_gram ?? null,
      prev_price_date: prev?.price_date ?? null,
    }));
  }
};
