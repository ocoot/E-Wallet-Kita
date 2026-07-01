type Lang = "id" | "en";

export const botText = {
  start: {
    id: () =>
      `Halo! Selamat datang di *E-Wallet Kita Bot* 🌸\n\n` +
      `Saya adalah asisten pintar untuk mencatat keuangan Anda secepat mengirim chat!\n\n` +
      `Untuk mulai mencatat, silakan *tautkan akun* Anda terlebih dahulu:\n` +
      `1️⃣ Buka website *E-Wallet Kita*\n` +
      `2️⃣ Masuk ke halaman *Pengaturan (Settings)*\n` +
      `3️⃣ Cari bagian *Koneksi Bot Telegram* dan tekan *Buat Kode Tautan*\n` +
      `4️⃣ Kirim perintah tautan berikut di sini:\n` +
      `     \`/link <kode_5_digit>\` (Contoh: \`/link 12345\`)\n\n` +
      `💡 Ketik \`/help\` untuk informasi bantuan commands.`,
    en: () =>
      `Hello! Welcome to *E-Wallet Kita Bot* 🌸\n\n` +
      `I'm a smart assistant to track your finances as fast as sending a chat!\n\n` +
      `To get started, please *link your account* first:\n` +
      `1️⃣ Open the *E-Wallet Kita* website\n` +
      `2️⃣ Go to the *Settings* page\n` +
      `3️⃣ Find the *Telegram Bot Connection* section and tap *Generate Link Code*\n` +
      `4️⃣ Send the link command here:\n` +
      `     \`/link <5_digit_code>\` (Example: \`/link 12345\`)\n\n` +
      `💡 Type \`/help\` for command information.`,
  },
  help: {
    id: () =>
      `💡 *Panduan Asisten E-Wallet Kita Bot*:\n\n` +
      `1️⃣ *Koneksi Akun*:\n` +
      `     Ketik \`/link <kode_5_digit>\`\n` +
      `     Contoh: \`/link 58204\`\n\n` +
      `2️⃣ *Mencatat Keuangan* (Setelah Terhubung):\n` +
      `     Cukup tulis pesan chat apa saja tentang transaksi Anda, kirim *pesan suara* 🎙️, atau kirim *foto struk belanja* 🧾!\n` +
      `     Contoh teks:\n` +
      `     • \`Makan siang bersama bu siska 45rb\`\n` +
      `     • \`Gaji sampingan jualan kue 1.2jt\`\n` +
      `     • \`Belanja sayur bayam 12k\`\n` +
      `     • \`Bayar tagihan listrik rumah 250rb\`\n` +
      `     Atau cukup rekam pesan suara: _"beli bensin 50 ribu"_ 🎙️\n\n` +
      `3️⃣ *Daftar Perintah (Commands)*:\n` +
      `     • \`/saldo\` - Ringkasan saldo & perbandingan bulan ini vs bulan lalu.\n` +
      `     • \`/riwayat\` - Tampilkan 5 transaksi terakhir.\n` +
      `     • \`/pdf\` - Ekspor laporan PDF Bulan Ini Berjalan\n` +
      `     • \`/pdf DDMMYYYY-DDMMYYYY\` - Ekspor laporan PDF Penuh (Maks 3 Bulan)\n` +
      `     • \`/hapus\` - Batalkan & hapus transaksi terakhir.\n` +
      `     • \`/unlink\` - Memutuskan koneksi akun Telegram dari sistem.\n` +
      `     • \`/help\` - Membuka pesan bantuan ini.`,
    en: () =>
      `💡 *E-Wallet Kita Bot Guide*:\n\n` +
      `1️⃣ *Account Connection*:\n` +
      `     Type \`/link <5_digit_code>\`\n` +
      `     Example: \`/link 58204\`\n\n` +
      `2️⃣ *Recording Finances* (After Linking):\n` +
      `     Just write any chat message about your transaction, send a *voice note* 🎙️, or send a *receipt photo* 🧾!\n` +
      `     Text examples:\n` +
      `     • \`Lunch with colleagues 45rb\`\n` +
      `     • \`Side income selling cakes 1.2jt\`\n` +
      `     • \`Bought vegetables 12k\`\n` +
      `     • \`Paid electricity bill 250rb\`\n` +
      `     Or just record a voice note: _"gas 50k"_ 🎙️\n\n` +
      `3️⃣ *Command List*:\n` +
      `     • \`/saldo\` - Balance summary & comparison vs last month.\n` +
      `     • \`/riwayat\` - Show last 5 transactions.\n` +
      `     • \`/pdf\` - Export current month's PDF report\n` +
      `     • \`/pdf DDMMYYYY-DDMMYYYY\` - Export full PDF report (Maximum 3 months)\n` +
      `     • \`/hapus\` - Undo & delete the last transaction.\n` +
      `     • \`/unlink\` - Disconnect your Telegram account from the system.\n` +
      `     • \`/help\` - Show this help message.`,
  },
  pdfGenerating: {
    id: () => "🔄 _Sedang menyiapkan laporan PDF Anda..._",
    en: () => "🔄 _Generating your PDF report..._",
  },
  pdfNoTransactions: {
    id: () => "📭 Tidak ada transaksi pada periode ini untuk diekspor.",
    en: () => "📭 No transactions found in this period to export.",
  },
  pdfInvalidFormat: {
    id: () => "⚠️ *Format perintah /pdf salah.*\n\nContoh penggunaan:\n• \`/pdf\` - Laporan penuh bulan ini\n• \`/pdf ringkasan\` - Ringkasan saja bulan ini\n• \`/pdf 0126\` - Laporan penuh bulan Januari 2026\n• \`/pdf 0126 ringkasan\` - Ringkasan bulan Januari 2026\n• \`/pdf 01062026 - 15062026\` - Laporan tanggal tertentu\n• \`/pdf 01062026 - 15062026 ringkasan\` - Ringkasan tanggal tertentu",
    en: () => "⚠️ *Invalid /pdf command format.*\n\nExamples:\n• \`/pdf\` - Full report for this month\n• \`/pdf ringkasan\` - Summary only for this month\n• \`/pdf 0126\` - Full report for Jan 2026\n• \`/pdf 0126 ringkasan\` - Summary for Jan 2026\n• \`/pdf 01062026 - 15062026\` - Report for specific date range\n• \`/pdf 01062026 - 15062026 ringkasan\` - Summary for specific date range",
  },
  pdfInvalidMonth: {
    id: () => "⚠️ *Bulan atau tahun tidak valid.*\nBulan harus antara 01 dan 12. Contoh: \`/pdf 0126\`",
    en: () => "⚠️ *Invalid month or year.*\nMonth must be between 01 and 12. Example: \`/pdf 0126\`",
  },
  pdfInvalidDate: {
    id: (val: string) => `⚠️ *Tanggal tidak valid*: "${val}" (misal 31022025 tidak ada).`,
    en: (val: string) => `⚠️ *Invalid date*: "${val}" (e.g. 31022025 does not exist).`,
  },
  pdfRangeInvalid: {
    id: () => "⚠️ Tanggal mulai tidak boleh setelah tanggal akhir!",
    en: () => "⚠️ Start date cannot be after end date!",
  },
  pdfRangeTooLong: {
    id: () => "❌ Rentang laporan maksimal 3 bulan.\n\nContoh:\n/pdf 01012026-31032026",
    en: () => "❌ Maximum report range is 3 months.\n\nExample:\n/pdf 01012026-31032026",
  },
  pdfCaption: {
    id: (period: string) => `Laporan transaksi PDF Anda untuk periode *${period}* berhasil dibuat. 🌸`,
    en: (period: string) => `Your transaction report PDF for period *${period}* has been successfully generated. 🌸`,
  },
  // FIX #10: Language selection prompt on /start before /link
  langPrompt: {
    id: () => `🌐 Pilih bahasa / Choose language:`,
    en: () => `🌐 Pilih bahasa / Choose language:`,
  },
  linkBadFormat: {
    id: () => "⚠️ Format perintah salah. Silakan kirim dalam format: `/link <kode_5_digit>` - Contoh: `/link 12345`.",
    en: () => "⚠️ Invalid command format. Please send in the format: `/link <5_digit_code>` - Example: `/link 12345`.",
  },
  linkInternalError: {
    id: (msg: string) => `⚠️ Terjadi error internal saat menautkan akun: ${msg}`,
    en: (msg: string) => `⚠️ An internal error occurred while linking your account: ${msg}`,
  },
  linkSuccess: {
    id: (displayName: string) =>
      `🎉 *Tautan Akun Berhasil Terhubung!* ✅\n\n` +
      `Halo, *${displayName}*! Chat ini sekarang aman terhubung dengan aplikasi *E-Wallet Kita*.\n\n` +
      `Sekarang Anda sudah bisa langsung melakukan pencatatan keuangan otomatis. Silakan tulis transaksi pertama Anda!`,
    en: (displayName: string) =>
      `🎉 *Account Successfully Linked!* ✅\n\n` +
      `Hello, *${displayName}*! This chat is now securely linked to the *E-Wallet Kita* app.\n\n` +
      `You can now record your finances automatically. Go ahead and write your first transaction!`,
  },
  linkFailed: {
    id: (errMsg: string) => `❌ *Gagal Tertaut*\n\n${errMsg}`,
    en: (errMsg: string) => `❌ *Linking Failed*\n\n${errMsg}`,
  },
  linkInvalidCodeFallback: {
    id: () => "Kode tautan tidak valid atau telah kedaluwarsa.",
    en: () => "The link code is invalid or has expired.",
  },
  linkLockedOut: {
    id: (minutes: number) => `🔐 *Brute Force Terdeteksi*\n\nAnda telah melebihi batas percobaan penautan akun. Silakan coba lagi setelah ${minutes} menit.`,
    en: (minutes: number) => `🔐 *Brute Force Detected*\n\nYou have exceeded the maximum account linking attempts. Please try again in ${minutes} minutes.`,
  },
  unlinkFailed: {
    id: (msg: string) => `❌ Gagal memutuskan tautan: ${msg}`,
    en: (msg: string) => `❌ Failed to unlink account: ${msg}`,
  },
  unlinkSuccess: {
    id: () => "👋 *Koneksi bot Telegram dibatalkan.* Hubungan chat ini dengan E-Wallet Kita berhasil diputuskan.",
    en: () => "👋 *Telegram bot connection removed.* This chat has been successfully unlinked from E-Wallet Kita.",
  },
  saldoError: {
    id: () => "⚠️ Terjadi kesalahan internal saat memuat data saldo.",
    en: () => "⚠️ An internal error occurred while loading your balance data.",
  },
  saldoNotLinked: {
    id: () => "⚠️ *Akun belum terhubung.* Silakan hubungkan Telegram Anda terlebih dahulu menggunakan perintah `/link <kode>`.",
    en: () => "⚠️ *Account not linked.* Please link your Telegram first using the `/link <code>` command.",
  },
  // FIX #11 (saldo): Now includes last-month comparison
  saldoSummary: {
    id: (
      displayName: string,
      incStr: string, expStr: string, balStr: string,
      prevIncStr: string, prevExpStr: string,
      expDiffIcon: string, expDiffPct: string
    ) =>
      `📊 *Ringkasan Keuangan Bulan Ini* 🌸\n\n` +
      `Halo, *${displayName}*!\n\n` +
      `*— Bulan Ini —*\n` +
      `• *Total Pemasukan*: 📥 \`${incStr}\`\n` +
      `• *Total Pengeluaran*: 📤 \`${expStr}\`\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• *Saldo Tabungan*: 💰 *${balStr}*\n\n` +
      `*— Bulan Lalu —*\n` +
      `• Pemasukan: \`${prevIncStr}\`\n` +
      `• Pengeluaran: \`${prevExpStr}\`\n\n` +
      `${expDiffIcon} Pengeluaran bulan ini *${expDiffPct}* dibanding bulan lalu.\n\n` +
      `_Gunakan bot ini untuk terus merekam transaksi harian secara praktis!_`,
    en: (
      displayName: string,
      incStr: string, expStr: string, balStr: string,
      prevIncStr: string, prevExpStr: string,
      expDiffIcon: string, expDiffPct: string
    ) =>
      `📊 *This Month's Financial Summary* 🌸\n\n` +
      `Hello, *${displayName}*!\n\n` +
      `*— This Month —*\n` +
      `• *Total Income*: 📥 \`${incStr}\`\n` +
      `• *Total Expense*: 📤 \`${expStr}\`\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• *Net Balance*: 💰 *${balStr}*\n\n` +
      `*— Last Month —*\n` +
      `• Income: \`${prevIncStr}\`\n` +
      `• Expense: \`${prevExpStr}\`\n\n` +
      `${expDiffIcon} Spending this month is *${expDiffPct}* vs last month.\n\n` +
      `_Keep using this bot to conveniently track your daily transactions!_`,
  },
  unknownCommand: {
    id: () => "⚠️ Perintah tidak dikenali. Silakan ketik `/help` untuk bantuan.",
    en: () => "⚠️ Unrecognized command. Please type `/help` for assistance.",
  },
  profileLookupError: {
    id: () => "⚠️ Terjadi kegagalan pencarian profil akun.",
    en: () => "⚠️ Failed to look up your account profile.",
  },
  notLinkedForTx: {
    id: () =>
      `⚠️ *Akun Belum Terhubung*\n\n` +
      `Maaf, kami tidak bisa mencatat transaksi Anda karena chat ini belum terhubung ke akun mana pun.\n\n` +
      `Silakan ketik \`/link <kode_5_digit>\` untuk menautkan akun.`,
    en: () =>
      `⚠️ *Account Not Linked*\n\n` +
      `Sorry, we can't record your transaction because this chat isn't linked to any account yet.\n\n` +
      `Please type \`/link <5_digit_code>\` to link your account.`,
  },
  analyzing: {
    id: () => "🔄 _Sedang menganalisis catatan keuangan Anda..._",
    en: () => "🔄 _Analyzing your financial note..._",
  },
  voiceTranscribing: {
    id: () => "🎙️ _Sedang mendengarkan pesan suara Anda..._",
    en: () => "🎙️ _Listening to your voice note..._",
  },
  voiceHeard: {
    id: (transcript: string) => `🎙️ *Transkrip Suara*: _"${transcript}"_`,
    en: (transcript: string) => `🎙️ *Voice Transcript*: _"${transcript}"_`,
  },
  voiceTranscribeError: {
    id: () =>
      `⚠️ *Gagal Memproses Pesan Suara*\n\n` +
      `Maaf, kami tidak berhasil mendengar/memahami pesan suara Anda dengan jelas.\n` +
      `Coba rekam ulang di tempat yang tidak berisik, atau ketik transaksinya secara manual (mis. "beli bensin 50 ribu").`,
    en: () =>
      `⚠️ *Failed to Process Voice Note*\n\n` +
      `Sorry, we couldn't clearly hear/understand your voice note.\n` +
      `Try recording again somewhere quiet, or type the transaction manually (e.g. "gas 50k").`,
  },
  voiceTooLong: {
    id: () => "⚠️ Pesan suara terlalu panjang (maks. 60 detik). Coba rekam versi yang lebih singkat.",
    en: () => "⚠️ Voice note is too long (max. 60 seconds). Please record a shorter version.",
  },
  amountNotDetected: {
    id: () =>
      `⚠️ *Gagal Membaca Nominal*\n\n` +
      `Nominal angka uang tidak berhasil terdeteksi.\n` +
      `Contoh input benar:\n` +
      `- "Makan nasi goreng *40rb*"\n` +
      `- "Beli galon aqua *Rp 20.000*"\n` +
      `- "Bayar listrik *Rp250.000*"\n\n` +
      `Silakan ulangi kembali!`,
    en: () =>
      `⚠️ *Couldn't Detect Amount*\n\n` +
      `We couldn't detect a numeric amount.\n` +
      `Example of valid input:\n` +
      `- "Fried rice for lunch *40rb*"\n` +
      `- "Bought water gallon *Rp 20.000*"\n` +
      `- "Paid electricity *Rp250.000*"\n\n` +
      `Please try again!`,
  },
  draftSaveError: {
    id: () => "⚠️ Terjadi kesalahan internal saat menyimpan draf transaksi. Silakan coba lagi.",
    en: () => "⚠️ An internal error occurred while saving the transaction draft. Please try again.",
  },
  draftPrompt: {
    id: (typeLabel: string, catLabel: string, currencyStr: string, originalText: string) =>
      `📝 *Draf Catatan Transaksi*\n` +
      `Apakah rincian keuangan berikut sudah sesuai?\n\n` +
      `• *Tipe*: ${typeLabel}\n` +
      `• *Kategori*: ${catLabel}\n` +
      `• *Nominal*: *${currencyStr}*\n` +
      `• *Catatan*: "${originalText}"\n\n` +
      `_Jika nominal salah, ketik ulang dengan nominal yang benar._`,
    en: (typeLabel: string, catLabel: string, currencyStr: string, originalText: string) =>
      `📝 *Transaction Draft*\n` +
      `Does the following financial detail look correct?\n\n` +
      `• *Type*: ${typeLabel}\n` +
      `• *Category*: ${catLabel}\n` +
      `• *Amount*: *${currencyStr}*\n` +
      `• *Note*: "${originalText}"\n\n` +
      `_If the amount is wrong, type a correction below._`,
  },
  // FIX #11 (draft): Added "Edit Amount" button hint in draft prompt (handled via cancel + retype)
  editAmountHint: {
    id: () => "✏️ *Edit Nominal?*\nKirim pesan baru dengan nominal yang benar, misalnya:\n`Edit: 75rb`",
    en: () => "✏️ *Edit Amount?*\nSend a new message with the correct amount, e.g.:\n`Edit: 75rb`",
  },
  parseError: {
    id: () => "⚠️ Maaf, asisten parsing kami mengalami kendala teknis sementara. Mohon coba ulangi beberapa saat lagi.",
    en: () => "⚠️ Sorry, our parsing assistant is experiencing temporary technical issues. Please try again shortly.",
  },
  txTypeIncome:  { id: () => "📥 Pemasukan",   en: () => "📥 Income" },
  txTypeExpense: { id: () => "📤 Pengeluaran", en: () => "📤 Expense" },
  btnConfirm:    { id: () => "✅ Benar, Simpan",  en: () => "✅ Correct, Save" },
  btnCancel:     { id: () => "❌ Batalkan",        en: () => "❌ Cancel" },
  // FIX #11: Edit amount inline button
  btnEditAmount: { id: () => "✏️ Edit Nominal",    en: () => "✏️ Edit Amount" },
  editAmountPrompt: {
    id: () => "✏️ *Edit Nominal*\n\nKirim nominal yang benar sekarang.\nContoh: `75rb` atau `Rp 75.000`",
    en: () => "✏️ *Edit Amount*\n\nSend the correct amount now.\nExample: `75rb` or `Rp 75.000`",
  },
  btnEditCategory: { id: () => "🏷️ Edit Kategori", en: () => "🏷️ Edit Category" },
  editCategoryPrompt: {
    id: () => "🏷️ *Edit Kategori*\n\nPilih kategori yang sesuai di bawah ini:",
    en: () => "🏷️ *Edit Category*\n\nPlease choose the correct category below:",
  },
  btnBackToDraft: { id: () => "↩️ Kembali", en: () => "↩️ Back" },
  cbCategoryUpdated: {
    id: () => "Kategori berhasil diperbarui.",
    en: () => "Category updated successfully.",
  },
  cbExpired: {
    id: () => "Transaksi tidak ditemukan atau sudah kadaluwarsa.",
    en: () => "Transaction not found or has expired.",
  },
  msgExpired: {
    id: () => "❌ *Sesi Konfirmasi Kedaluwarsa*\n_Silakan tulis ulang transaksi keuangan Anda di bawah ini._",
    en: () => "❌ *Confirmation Session Expired*\n_Please re-write your financial transaction below._",
  },
  cbSaveFailed: {
    id: () => "Gagal menyimpan transaksi.",
    en: () => "Failed to save transaction.",
  },
  msgSaveFailed: {
    id: (msg: string) => `❌ *Gagal Menyimpan Transaksi*\n_Koneksi database bermasalah: ${msg}_`,
    en: (msg: string) => `❌ *Failed to Save Transaction*\n_Database connection issue: ${msg}_`,
  },
  cbSaveSuccess: {
    id: () => "Transaksi berhasil dicatat!",
    en: () => "Transaction successfully recorded!",
  },
  msgSaveSuccess: {
    id: (typeLabel: string, catLabel: string, amountStr: string, originalText: string) =>
      `✅ *Transaksi Berhasil Disimpan!*\n\n` +
      `• *Tipe*: ${typeLabel}\n` +
      `• *Kategori*: ${catLabel}\n` +
      `• *Jumlah*: *${amountStr}*\n` +
      `• *Catatan*: "${originalText}"\n\n` +
      `_Catatan telah tersimpan secara aman ke E-Wallet Kita._ 🌸`,
    en: (typeLabel: string, catLabel: string, amountStr: string, originalText: string) =>
      `✅ *Transaction Saved Successfully!*\n\n` +
      `• *Type*: ${typeLabel}\n` +
      `• *Category*: ${catLabel}\n` +
      `• *Amount*: *${amountStr}*\n` +
      `• *Note*: "${originalText}"\n\n` +
      `_Your record has been safely saved to E-Wallet Kita._ 🌸`,
  },
  cbCancelled: {
    id: () => "Pencatatan dibatalkan.",
    en: () => "Recording cancelled.",
  },
  msgCancelled: {
    id: () => "❌ *Pencatatan transaksi telah dibatalkan.*",
    en: () => "❌ *Transaction recording has been cancelled.*",
  },
  // FIX #8: /riwayat command
  riwayatNotLinked: {
    id: () => "⚠️ *Akun belum terhubung.* Gunakan `/link <kode>` untuk menautkan akun.",
    en: () => "⚠️ *Account not linked.* Use `/link <code>` to link your account.",
  },
  riwayatEmpty: {
    id: () => "📭 *Belum ada transaksi yang tercatat* untuk akun Anda.",
    en: () => "📭 *No transactions recorded yet* for your account.",
  },
  riwayatHeader: {
    id: () => `📋 *5 Transaksi Terakhir* 🌸\n\n`,
    en: () => `📋 *Last 5 Transactions* 🌸\n\n`,
  },
  riwayatFooter: {
    id: () => `\n_Gunakan \`/hapus\` untuk membatalkan transaksi terakhir._`,
    en: () => `\n_Use \`/hapus\` to undo the last transaction._`,
  },
  riwayatError: {
    id: () => "⚠️ Gagal memuat riwayat transaksi. Silakan coba lagi.",
    en: () => "⚠️ Failed to load transaction history. Please try again.",
  },
  // FIX #12 (hapus): /hapus command - delete last transaction
  hapusNotLinked: {
    id: () => "⚠️ *Akun belum terhubung.* Gunakan `/link <kode>` untuk menautkan akun.",
    en: () => "⚠️ *Account not linked.* Use `/link <code>` to link your account.",
  },
  hapusNone: {
    id: () => "📭 *Tidak ada transaksi* yang bisa dihapus.",
    en: () => "📭 *No transactions* to delete.",
  },
  hapusSuccess: {
    id: (typeLabel: string, catLabel: string, amountStr: string, note: string) =>
      `🗑️ *Transaksi Terakhir Berhasil Dihapus*\n\n` +
      `• *Tipe*: ${typeLabel}\n` +
      `• *Kategori*: ${catLabel}\n` +
      `• *Jumlah*: ${amountStr}\n` +
      `• *Catatan*: "${note}"\n\n` +
      `_Transaksi telah dihapus dari E-Wallet Kita._`,
    en: (typeLabel: string, catLabel: string, amountStr: string, note: string) =>
      `🗑️ *Last Transaction Successfully Deleted*\n\n` +
      `• *Type*: ${typeLabel}\n` +
      `• *Category*: ${catLabel}\n` +
      `• *Amount*: ${amountStr}\n` +
      `• *Note*: "${note}"\n\n` +
      `_Transaction has been removed from E-Wallet Kita._`,
  },
  hapusError: {
    id: (msg: string) => `❌ Gagal menghapus transaksi: ${msg}`,
    en: (msg: string) => `❌ Failed to delete transaction: ${msg}`,
  },
  cbLangSet: {
    id: () => "✅ Bahasa Indonesia dipilih!",
    en: () => "✅ English selected!",
  },
  // Fitur sedang dikunci oleh admin lewat tab Maintenance di Admin Panel.
  // `reason` adalah pesan running text yang diatur admin (boleh kosong),
  // sehingga teks aktual selalu berasal dari data, bukan dari hardcode.
  featureUnderMaintenance: {
    id: (reason: string) =>
      reason
        ? `🛠️ *Fitur ini sedang tidak dapat digunakan karena sedang dilakukan maintenance.*\n\n_${reason}_`
        : `🛠️ *Fitur ini sedang tidak dapat digunakan karena sedang dilakukan maintenance.*`,
    en: (reason: string) =>
      reason
        ? `🛠️ *This feature is temporarily unavailable due to ongoing maintenance.*\n\n_${reason}_`
        : `🛠️ *This feature is temporarily unavailable due to ongoing maintenance.*`,
  },
  // Budget per kategori: peringatan dikirim setelah transaksi tersimpan
  // (baik via chat text maupun receipt OCR) kalau kategori sudah
  // mendekati/melewati alert_threshold_percent budget bulan ini.
  budgetWarningThreshold: {
    id: (catLabel: string, percent: string) =>
      `⚠️ *Peringatan Anggaran*\n_Pengeluaran kategori *${catLabel}* sudah mencapai *${percent}%* dari anggaran bulan ini._`,
    en: (catLabel: string, percent: string) =>
      `⚠️ *Budget Warning*\n_Spending for category *${catLabel}* has reached *${percent}%* of this month's budget._`,
  },
  budgetWarningOver: {
    id: (catLabel: string, percent: string) =>
      `🚨 *Anggaran Terlampaui*\n_Pengeluaran kategori *${catLabel}* sudah *${percent}%* dari batas anggaran bulan ini._`,
    en: (catLabel: string, percent: string) =>
      `🚨 *Budget Exceeded*\n_Spending for category *${catLabel}* is already at *${percent}%* of this month's budget limit._`,
  },
  // Respons untuk tombol "Tandai Lunas" pada pesan reminder tagihan
  // (lihat supabase/functions/bill-reminder-notifier). Teks reminder itu
  // sendiri (judul, baris jatuh tempo, dll) dibuat di dalam Edge Function
  // tersebut, bukan di sini, karena Edge Function (Deno) tidak bisa
  // import file ini (lingkungan Node/Vercel) -- lihat komentar di
  // reminderText() pada Edge Function untuk detail kenapa terpisah.
  billMarkPaidSuccess: {
    id: () => "✅ Lunas!",
    en: () => "✅ Paid!",
  },
  billMarkPaidConfirmed: {
    id: (name: string) => `✅ *Tagihan "${name}" ditandai lunas.*\n\nTransaksi pengeluaran sudah otomatis tercatat di riwayat & saldo kamu.`,
    en: (name: string) => `✅ *Bill "${name}" marked as paid.*\n\nAn expense transaction has been recorded automatically in your history & balance.`,
  },
  billMarkPaidConfirmedNoAmount: {
    id: (name: string) => `✅ *Tagihan "${name}" ditandai lunas.*\n\nNominalnya belum diisi, jadi belum ada transaksi otomatis. Catat pengeluarannya sendiri lewat chat atau web app ya.`,
    en: (name: string) => `✅ *Bill "${name}" marked as paid.*\n\nNo amount was set, so no transaction was recorded automatically. Please log the expense yourself via chat or the web app.`,
  },
  billAlreadyPaidOrNotFound: {
    id: () => "ℹ️ Tagihan ini sudah ditandai lunas sebelumnya atau tidak ditemukan.",
    en: () => "ℹ️ This bill was already marked as paid or could not be found.",
  },
  // Prompt konfirmasi sebelum bill_paid: benar-benar dieksekusi -- karena
  // aksi ini akan mengubah saldo & riwayat transaksi, user diberi tahu
  // dulu dan harus menekan tombol konfirmasi terpisah.
  billMarkPaidConfirmPrompt: {
    id: (name: string, amount: string) => `❓ *Tandai "${name}" lunas?*\n\nSaldo kamu akan berkurang ${amount} dan tercatat otomatis di riwayat transaksi.`,
    en: (name: string, amount: string) => `❓ *Mark "${name}" as paid?*\n\nYour balance will decrease by ${amount} and it will be recorded automatically in your transaction history.`,
  },
  billBtnConfirmPaid: {
    id: () => "✅ Ya, Tandai Lunas",
    en: () => "✅ Yes, Mark as Paid",
  },
  billBtnCancelPaid: {
    id: () => "❌ Batalkan",
    en: () => "❌ Cancel",
  },
  billMarkPaidConfirmPromptNoAmount: {
    id: (name: string) => `❓ *Tandai "${name}" lunas?*\n\nNominalnya belum diisi, jadi tidak akan ada transaksi otomatis -- kamu perlu mencatatnya sendiri setelah ini.`,
    en: (name: string) => `❓ *Mark "${name}" as paid?*\n\nNo amount was set, so no transaction will be recorded automatically -- you'll need to log it yourself afterwards.`,
  },
};

export function tr<K extends keyof typeof botText>(key: K, lang: Lang, ...args: Parameters<(typeof botText)[K][Lang]>): string {
  const entry = botText[key][lang] as (...a: any[]) => string;
  return entry(...args);
}
