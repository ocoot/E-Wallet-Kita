export interface Transaction {
  id: string;
  user_id: string;
  type: "income" | "expense";
  category: string; // key of translation, e.g. "food_drink", "salary", etc.
  amount: number;
  note: string | null;
  source: "manual" | "ai_web" | "telegram";
  transaction_date: string; // YYYY-MM-DD
  created_at: string;
}

export const dbService = {
  getTransactions(userId: string, filterMonth?: string): Transaction[] {
    const list = this._getAllTransactions();
    
    // Filter by user ID first (perfect simulation of Row Level Security - RLS!)
    let userList = list.filter(t => t.user_id === userId);

    // If no transactions exist for this user, seed some sample records so the UI charts & summaries look beautiful!
    if (userList.length === 0) {
      userList = this._seedSampleTransactions(userId);
    }

    // Apply month filter if provided (YYYY-MM)
    if (filterMonth) {
      userList = userList.filter(t => t.transaction_date.startsWith(filterMonth));
    }

    // Sort descending by date, then newly created first
    return userList.sort((a, b) => {
      const dateCompare = b.transaction_date.localeCompare(a.transaction_date);
      if (dateCompare !== 0) return dateCompare;
      return b.created_at.localeCompare(a.created_at);
    });
  },

  saveTransaction(
    userId: string,
    type: "income" | "expense",
    category: string,
    amount: number,
    note: string | null,
    source: "manual" | "ai_web" | "telegram",
    transactionDate: string
  ): Transaction {
    const newTx: Transaction = {
      id: "tx_" + Math.random().toString(36).substr(2, 9),
      user_id: userId,
      type,
      category,
      amount: Math.max(0, amount),
      note: note ? note.trim() : null,
      source,
      transaction_date: transactionDate,
      created_at: new Date().toISOString()
    };

    const all = this._getAllTransactions();
    all.push(newTx);
    this._saveAllTransactions(all);

    return newTx;
  },

  deleteTransaction(userId: string, transactionId: string): boolean {
    const all = this._getAllTransactions();
    
    // RLS Enforcement: Verify ownership before deleting
    const targetIdx = all.findIndex(t => t.id === transactionId && t.user_id === userId);
    if (targetIdx === -1) return false;

    all.splice(targetIdx, 1);
    this._saveAllTransactions(all);
    return true;
  },

  purgeAllTransactions(userId: string): void {
    const all = this._getAllTransactions();
    // Keep only other users' data (simulated RLS isolation)
    const survivors = all.filter(t => t.user_id !== userId);
    
    // Write empty array indicator inside cache to stop re-seeding on next read
    localStorage.setItem(`purged_${userId}`, "true");
    
    this._saveAllTransactions(survivors);
  },

  // Internal helpers
  _getAllTransactions(): Transaction[] {
    const raw = localStorage.getItem("ewallet_transactions");
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  },

  _saveAllTransactions(transactions: Transaction[]): void {
    localStorage.setItem("ewallet_transactions", JSON.stringify(transactions));
  },

  _seedSampleTransactions(userId: string): Transaction[] {
    // Check if the user specifically requested to keep it empty after purging
    if (localStorage.getItem(`purged_${userId}`) === "true") {
      return [];
    }

    const today = new Date();
    const currYear = today.getFullYear(); // Will be 2026 based on metadata
    const currMonth = String(today.getMonth() + 1).padStart(2, "0"); // Will be "06" for June

    const seed: Transaction[] = [
      {
        id: `seed_1_${userId}`,
        user_id: userId,
        type: "income",
        category: "salary",
        amount: 8500000,
        note: "Gaji Pokok Utama",
        source: "manual",
        transaction_date: `${currYear}-${currMonth}-01`,
        created_at: new Date(today.getTime() - 19 * 24 * 3600000).toISOString()
      },
      {
        id: `seed_2_${userId}`,
        user_id: userId,
        type: "income",
        category: "bonus",
        amount: 1500000,
        note: "Bonus Sampingan",
        source: "ai_web",
        transaction_date: `${currYear}-${currMonth}-15`,
        created_at: new Date(today.getTime() - 5 * 24 * 3600000).toISOString()
      },
      {
        id: `seed_3_${userId}`,
        user_id: userId,
        type: "expense",
        category: "monthly_groceries",
        amount: 1250000,
        note: "Belanja Bulanan Carrefour",
        source: "manual",
        transaction_date: `${currYear}-${currMonth}-03`,
        created_at: new Date(today.getTime() - 17 * 24 * 3600000).toISOString()
      },
      {
        id: `seed_4_${userId}`,
        user_id: userId,
        type: "expense",
        category: "bills",
        amount: 450000,
        note: "Tagihan Listrik & Internet rumah",
        source: "ai_web",
        transaction_date: `${currYear}-${currMonth}-05`,
        created_at: new Date(today.getTime() - 15 * 24 * 3600000).toISOString()
      },
      {
        id: `seed_5_${userId}`,
        user_id: userId,
        type: "expense",
        category: "food_drink",
        amount: 125000,
        note: "Makan Bakso sekeluarga dkk",
        source: "manual",
        transaction_date: `${currYear}-${currMonth}-10`,
        created_at: new Date(today.getTime() - 10 * 24 * 3600000).toISOString()
      },
      {
        id: `seed_6_${userId}`,
        user_id: userId,
        type: "expense",
        category: "vegetables",
        amount: 45000,
        note: "Beli sayur pakis dkk di pasar",
        source: "telegram",
        transaction_date: `${currYear}-${currMonth}-18`,
        created_at: new Date(today.getTime() - 2 * 24 * 3600000).toISOString()
      }
    ];

    const all = this._getAllTransactions();
    all.push(...seed);
    this._saveAllTransactions(all);

    return seed;
  }
};
