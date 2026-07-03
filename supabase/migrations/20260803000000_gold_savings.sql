-- Migration: Pos Tabungan Emas (Gold Savings)
-- Date: 2026-08-03
-- Root cause / why:
--   User ingin pos tabungan baru yang nilainya mengikuti harga emas pasar
--   (Antam, UBS, Galeri 24, dst), BUKAN nominal Rupiah tetap seperti
--   savings_pockets yang sudah ada. Emas TIDAK bisa numpang ke tabel
--   savings_pockets karena semantiknya beda secara fundamental:
--     - savings_pockets.current_amount = saldo Rupiah statis, hanya berubah
--       lewat deposit/withdraw manual (lihat 20260801000000_savings_pockets.sql).
--       Bahkan pocket_type 'investment' yang sudah ada cuma LABEL -- tidak
--       ada tracking harga pasar riil di baliknya.
--     - Emas = kepemilikan dalam GRAM yang nilai Rupiah-nya mengambang
--       harian ikut harga pasar. Memaksakannya ke current_amount akan
--       merusak akurasi "Total Tabungan"/"Total Kekayaan" di dashboard.
--
-- Constraint khusus dari user: hanya tersisa 2 slot endpoint Vercel di
-- api/* (10 dari limit 12 sudah terpakai), diminta maksimal nambah 1.
-- Solusi: PAKAI 0 ENDPOINT VERCEL BARU SAMA SEKALI.
--   - Sinkronisasi harga (server-to-server, tidak perlu dipanggil browser)
--     -> Supabase Edge Function `gold-price-sync` + pg_cron, PERSIS pola
--        `bill-reminder-notifier` (lihat 20260709000000_bill_reminder_notifications.sql
--        & 20260728000001_fix_bill_reminder_cron_placeholder.sql). Kuota
--        Edge Function terpisah dari kuota Vercel api/*, tidak numpang sama sekali.
--   - Transaksi beli/jual (butuh atomicity: grams + cash_locked + entry log
--     harus konsisten) -> RPC Postgres SECURITY INVOKER dipanggil langsung
--     dari client via supabase.rpc(), PERSIS pola deposit_to_pocket_for_user
--     / withdraw_from_pocket_for_user. Tidak butuh Vercel endpoint apapun.
--
-- Model kepemilikan (hybrid, sesuai keputusan user):
--   - Kasus "sudah punya emas fisik": dicatat lewat RPC
--     adjust_gold_holding_for_user(direction='add'), MENAMBAH grams_owned
--     TANPA menyentuh cash_locked_amount (tidak ada uang app yang keluar,
--     jadi "Saldo Tersedia" tidak berkurang) -- tapi TETAP menambah "Total
--     Kekayaan" karena itu aset yang memang sudah dimiliki user.
--   - Kasus "berencana beli": RPC buy_gold_for_user, memotong "Saldo
--     Tersedia" sebesar p_idr_amount (via cash_locked_amount += p_idr_amount)
--     dan menambah grams_owned di harga pasar + margin saat itu.
--
-- Akuntansi cash_locked_amount (PENTING, baca sebelum mengubah):
--   cash_locked_amount BUKAN "modal/cost basis" dalam arti akuntansi baku --
--   ia murni penanda "berapa Rupiah yang sudah keluar dari Saldo Tersedia
--   dan belum kembali", supaya:
--     Saldo Tersedia = get_accumulated_balance().balance
--                       - SUM(savings_pockets.current_amount)
--                       - SUM(gold_pockets.cash_locked_amount)
--   selalu benar SECARA CASH-FLOW, apapun untung/rugi emasnya:
--     - buy:  cash_locked_amount += p_idr_amount (persis uang yang keluar)
--     - sell: cash_locked_amount -= idr_amount_diterima (persis uang yang masuk
--             balik) -- BUKAN dikurangi proporsional cost-basis. Ini SENGAJA
--             dibiarkan bisa jadi negatif kalau user profit lalu jual habis
--             (mis. modal 1jt, jual di harga 1.2jt -> cash_locked_amount jadi
--             -200rb), karena itu justru cara paling sederhana & benar untuk
--             membuat Saldo Tersedia otomatis bertambah persis sebesar profit
--             realized tsb, tanpa perlu insert manual ke transactions atau
--             logic recognition P&L terpisah. Untuk TAMPILAN ke user, jangan
--             tampilkan kolom ini mentah-mentah sebagai "modal" -- gunakan
--             get_gold_holdings_summary() yang sudah menghitung nilai pasar
--             & untung/rugi secara terpisah dan lebih mudah dibaca.
--   - manual_add/manual_remove (declare emas fisik): TIDAK menyentuh
--     cash_locked_amount sama sekali (tidak ada cash flow di app).
--
-- Harga acuan: user memilih brand per pocket saat dibuat (kolom `brand`,
-- immutable secara konvensi UI walau tidak di-enforce DB -- lihat catatan
-- di kolom). Sumber data: logam-mulia-api (iamutaki, gratis/open-source,
-- Cloudflare Worker) https://logam-mulia-api.iamutaki.workers.dev/api/prices/{brand}.
-- Spread: aplikasi MENAMBAH margin sendiri di atas harga sumber (bukan
-- pakai spread asli sumber apa adanya) -- persentase disimpan di
-- app_settings (gold_margin_buy_pct, gold_margin_sell_pct) supaya bisa
-- diubah admin tanpa deploy ulang, mengikuti pola persis premium_base_price
-- / dummy_qris_enabled di app_settings.

-- ─────────────────────────────────────────────────────────────
-- 0. Config di app_settings (reuse tabel yang sudah ada)
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.app_settings (key, value) VALUES
    ('gold_margin_buy_pct', '3'),
    ('gold_margin_sell_pct', '2'),
    ('gold_price_staleness_hours', '60')
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 1. Tabel gold_prices -- harga referensi harian per brand, diisi HANYA
--    oleh Edge Function gold-price-sync (service role, bypass RLS).
--    Bukan per-user, jadi tidak ada kolom user_id.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gold_prices (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand                 TEXT NOT NULL CHECK (brand IN (
                              'antam', 'logammulia', 'ubs', 'galeri24',
                              'pegadaian', 'sampoernagold', 'hartadinataabadi'
                          )),
    sell_price_per_gram   NUMERIC NOT NULL CHECK (sell_price_per_gram > 0),
    buyback_price_per_gram NUMERIC NOT NULL CHECK (buyback_price_per_gram > 0),
    price_date            DATE NOT NULL,
    source                TEXT NOT NULL DEFAULT 'logam-mulia-api',
    fetched_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (brand, price_date)
);

ALTER TABLE public.gold_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can read gold prices" ON public.gold_prices;
CREATE POLICY "Anyone authenticated can read gold prices"
    ON public.gold_prices FOR SELECT
    USING (TRUE);

-- Tidak ada policy INSERT/UPDATE untuk anon/authenticated -- hanya Edge
-- Function gold-price-sync (service role, otomatis bypass RLS) yang menulis.
REVOKE INSERT, UPDATE, DELETE ON public.gold_prices FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_gold_prices_brand_date ON public.gold_prices(brand, price_date DESC);

-- ─────────────────────────────────────────────────────────────
-- 2. Tabel gold_pockets -- satu baris per pos tabungan emas per user.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gold_pockets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    -- Brand acuan harga, dipilih user saat pembuatan pos. Disengaja tidak
    -- diubah lewat UI setelah dibuat (campur brand akan bikin cost-basis
    -- cash_locked_amount tidak bermakna), tapi tidak di-enforce immutable
    -- di level DB supaya admin/migration tetap bisa memperbaiki data salah.
    brand               TEXT NOT NULL CHECK (brand IN (
                              'antam', 'logammulia', 'ubs', 'galeri24',
                              'pegadaian', 'sampoernagold', 'hartadinataabadi'
                          )),
    grams_owned         NUMERIC NOT NULL DEFAULT 0 CHECK (grams_owned >= 0),
    -- Lihat catatan akuntansi panjang di atas file ini. BUKAN cost basis
    -- akuntansi baku -- murni penanda cash-flow keluar/masuk app, boleh negatif.
    cash_locked_amount  NUMERIC NOT NULL DEFAULT 0,
    notes               TEXT,
    is_archived         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.gold_pockets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select their own gold pockets" ON public.gold_pockets;
CREATE POLICY "Users can select their own gold pockets"
    ON public.gold_pockets FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own gold pockets" ON public.gold_pockets;
CREATE POLICY "Users can insert their own gold pockets"
    ON public.gold_pockets FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own gold pockets" ON public.gold_pockets;
CREATE POLICY "Users can update their own gold pockets"
    ON public.gold_pockets FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own gold pockets" ON public.gold_pockets;
CREATE POLICY "Users can delete their own gold pockets"
    ON public.gold_pockets FOR DELETE
    USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_gold_pockets_user_id ON public.gold_pockets(user_id);

-- ─────────────────────────────────────────────────────────────
-- 3. Tabel gold_pocket_entries -- ledger riwayat (audit trail), sumber
--    kebenaran tetap kolom di gold_pockets, di-update atomik dalam RPC yang sama.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gold_pocket_entries (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pocket_id            UUID NOT NULL REFERENCES public.gold_pockets(id) ON DELETE CASCADE,
    user_id              UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    entry_type           TEXT NOT NULL CHECK (entry_type IN ('buy', 'sell', 'manual_add', 'manual_remove')),
    grams                NUMERIC NOT NULL CHECK (grams > 0),
    -- Harga efektif (sudah termasuk margin aplikasi) yang dipakai saat itu.
    -- NULL untuk manual_add/manual_remove karena tidak selalu diketahui
    -- harga beli aslinya (emas fisik yang sudah dimiliki sebelum pakai app).
    price_per_gram_used  NUMERIC,
    -- Uang yang benar-benar keluar/masuk Saldo Tersedia. NULL untuk
    -- manual_add/manual_remove (tidak ada cash flow di app).
    idr_amount           NUMERIC,
    note                 TEXT,
    entry_date           DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at           TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.gold_pocket_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select their own gold entries" ON public.gold_pocket_entries;
CREATE POLICY "Users can select their own gold entries"
    ON public.gold_pocket_entries FOR SELECT
    USING (auth.uid() = user_id);

-- Sama seperti savings_pocket_entries: tidak ada policy INSERT langsung
-- yang dipakai client. Semua mutasi WAJIB lewat RPC di bawah supaya
-- grams_owned/cash_locked_amount di gold_pockets tidak pernah tidak-sinkron.
DROP POLICY IF EXISTS "Only RPC can insert gold entries" ON public.gold_pocket_entries;
CREATE POLICY "Only RPC can insert gold entries"
    ON public.gold_pocket_entries FOR INSERT
    WITH CHECK (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.gold_pocket_entries FROM authenticated;

CREATE INDEX IF NOT EXISTS idx_gold_pocket_entries_pocket_id ON public.gold_pocket_entries(pocket_id);
CREATE INDEX IF NOT EXISTS idx_gold_pocket_entries_user_id ON public.gold_pocket_entries(user_id);

INSERT INTO public.maintenance_feature_locks (feature_key, is_locked) VALUES
    ('gold_savings', FALSE)
ON CONFLICT (feature_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 4. Helper: ambil harga terbaru + validasi staleness untuk satu brand.
--    Dipakai oleh buy/sell agar tidak duplikasi logic & staleness guard.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._get_fresh_gold_price(p_brand TEXT)
RETURNS public.gold_prices
SECURITY INVOKER
LANGUAGE plpgsql
AS $$
DECLARE
    v_price public.gold_prices;
    v_staleness_hours NUMERIC;
BEGIN
    SELECT * INTO v_price
    FROM public.gold_prices
    WHERE brand = p_brand
    ORDER BY price_date DESC, fetched_at DESC
    LIMIT 1;

    IF v_price IS NULL THEN
        RAISE EXCEPTION 'PRICE_NOT_AVAILABLE';
    END IF;

    SELECT COALESCE(value::NUMERIC, 60) INTO v_staleness_hours
    FROM public.app_settings WHERE key = 'gold_price_staleness_hours';

    -- Guard penting: kalau pg_cron/Edge Function gagal diam-diam (sudah
    -- pernah terjadi di fitur bill_reminder -- lihat migration
    -- 20260728000001), user TIDAK BOLEH tetap bertransaksi di harga basi
    -- tanpa sadar. Lebih baik transaksi ditolak & user diberi tahu, daripada
    -- salah harga dan merugikan salah satu pihak.
    IF v_price.fetched_at < NOW() - (v_staleness_hours || ' hours')::INTERVAL THEN
        RAISE EXCEPTION 'PRICE_STALE';
    END IF;

    RETURN v_price;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._get_fresh_gold_price(TEXT) FROM PUBLIC, anon;
-- SECURITY INVOKER berarti fungsi ini jalan dengan privilese PEMANGGIL,
-- bukan pembuat fungsi -- dan pemanggilnya (buy_gold_for_user /
-- sell_gold_for_user) sendiri SECURITY INVOKER, jadi yang benar-benar
-- mengeksekusi tetap role 'authenticated'. Kalau EXECUTE di-revoke dari
-- authenticated, buy/sell akan gagal "permission denied for function"
-- setiap saat, bukan cuma saat harga stale.
GRANT EXECUTE ON FUNCTION public._get_fresh_gold_price(TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. RPC: buy_gold_for_user -- beli emas pakai Saldo Tersedia.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.buy_gold_for_user(
    p_pocket_id UUID,
    p_idr_amount NUMERIC,
    p_note TEXT DEFAULT NULL,
    p_entry_date DATE DEFAULT CURRENT_DATE
)
RETURNS public.gold_pockets
SECURITY INVOKER
LANGUAGE plpgsql
AS $$
DECLARE
    v_pocket public.gold_pockets;
    v_price public.gold_prices;
    v_margin_pct NUMERIC;
    v_effective_price NUMERIC;
    v_grams NUMERIC;
BEGIN
    IF p_idr_amount IS NULL OR p_idr_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT';
    END IF;

    SELECT * INTO v_pocket
    FROM public.gold_pockets
    WHERE id = p_pocket_id AND user_id = auth.uid()
    FOR UPDATE;

    IF v_pocket IS NULL THEN
        RAISE EXCEPTION 'POCKET_NOT_FOUND';
    END IF;
    IF v_pocket.is_archived THEN
        RAISE EXCEPTION 'POCKET_ARCHIVED';
    END IF;

    v_price := public._get_fresh_gold_price(v_pocket.brand);

    SELECT COALESCE(value::NUMERIC, 0) INTO v_margin_pct
    FROM public.app_settings WHERE key = 'gold_margin_buy_pct';

    v_effective_price := v_price.sell_price_per_gram * (1 + v_margin_pct / 100);
    v_grams := ROUND(p_idr_amount / v_effective_price, 4);

    IF v_grams <= 0 THEN
        RAISE EXCEPTION 'AMOUNT_TOO_SMALL';
    END IF;

    INSERT INTO public.gold_pocket_entries
        (pocket_id, user_id, entry_type, grams, price_per_gram_used, idr_amount, note, entry_date)
    VALUES
        (p_pocket_id, auth.uid(), 'buy', v_grams, v_effective_price, p_idr_amount, p_note, p_entry_date);

    UPDATE public.gold_pockets
    SET grams_owned = grams_owned + v_grams,
        cash_locked_amount = cash_locked_amount + p_idr_amount,
        updated_at = NOW()
    WHERE id = p_pocket_id
    RETURNING * INTO v_pocket;

    RETURN v_pocket;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.buy_gold_for_user(UUID, NUMERIC, TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_gold_for_user(UUID, NUMERIC, TEXT, DATE) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 6. RPC: sell_gold_for_user -- jual sebagian/seluruh gram, hasil masuk
--    balik ke Saldo Tersedia.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sell_gold_for_user(
    p_pocket_id UUID,
    p_grams NUMERIC,
    p_note TEXT DEFAULT NULL,
    p_entry_date DATE DEFAULT CURRENT_DATE
)
RETURNS public.gold_pockets
SECURITY INVOKER
LANGUAGE plpgsql
AS $$
DECLARE
    v_pocket public.gold_pockets;
    v_price public.gold_prices;
    v_margin_pct NUMERIC;
    v_effective_price NUMERIC;
    v_idr_amount NUMERIC;
BEGIN
    IF p_grams IS NULL OR p_grams <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT';
    END IF;

    SELECT * INTO v_pocket
    FROM public.gold_pockets
    WHERE id = p_pocket_id AND user_id = auth.uid()
    FOR UPDATE;

    IF v_pocket IS NULL THEN
        RAISE EXCEPTION 'POCKET_NOT_FOUND';
    END IF;
    IF p_grams > v_pocket.grams_owned THEN
        RAISE EXCEPTION 'INSUFFICIENT_GOLD_BALANCE';
    END IF;

    v_price := public._get_fresh_gold_price(v_pocket.brand);

    SELECT COALESCE(value::NUMERIC, 0) INTO v_margin_pct
    FROM public.app_settings WHERE key = 'gold_margin_sell_pct';

    v_effective_price := v_price.buyback_price_per_gram * (1 - v_margin_pct / 100);
    v_idr_amount := ROUND(p_grams * v_effective_price, 0);

    INSERT INTO public.gold_pocket_entries
        (pocket_id, user_id, entry_type, grams, price_per_gram_used, idr_amount, note, entry_date)
    VALUES
        (p_pocket_id, auth.uid(), 'sell', p_grams, v_effective_price, v_idr_amount, p_note, p_entry_date);

    -- Lihat catatan akuntansi di atas file: cash_locked_amount dikurangi
    -- persis sejumlah uang yang diterima (BUKAN proporsi cost-basis),
    -- boleh jadi negatif -- itu caranya profit realized otomatis nambah
    -- Saldo Tersedia tanpa insert transaksi terpisah.
    UPDATE public.gold_pockets
    SET grams_owned = grams_owned - p_grams,
        cash_locked_amount = cash_locked_amount - v_idr_amount,
        updated_at = NOW()
    WHERE id = p_pocket_id
    RETURNING * INTO v_pocket;

    RETURN v_pocket;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sell_gold_for_user(UUID, NUMERIC, TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sell_gold_for_user(UUID, NUMERIC, TEXT, DATE) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 7. RPC: adjust_gold_holding_for_user -- declare emas fisik yang sudah
--    dimiliki (add) atau koreksi/keluar di luar app (remove). TIDAK
--    menyentuh cash_locked_amount / Saldo Tersedia sama sekali.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.adjust_gold_holding_for_user(
    p_pocket_id UUID,
    p_direction TEXT, -- 'add' | 'remove'
    p_grams NUMERIC,
    p_note TEXT DEFAULT NULL,
    p_entry_date DATE DEFAULT CURRENT_DATE
)
RETURNS public.gold_pockets
SECURITY INVOKER
LANGUAGE plpgsql
AS $$
DECLARE
    v_pocket public.gold_pockets;
    v_entry_type TEXT;
BEGIN
    IF p_grams IS NULL OR p_grams <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT';
    END IF;
    IF p_direction NOT IN ('add', 'remove') THEN
        RAISE EXCEPTION 'INVALID_DIRECTION';
    END IF;

    SELECT * INTO v_pocket
    FROM public.gold_pockets
    WHERE id = p_pocket_id AND user_id = auth.uid()
    FOR UPDATE;

    IF v_pocket IS NULL THEN
        RAISE EXCEPTION 'POCKET_NOT_FOUND';
    END IF;

    v_entry_type := CASE WHEN p_direction = 'add' THEN 'manual_add' ELSE 'manual_remove' END;

    IF p_direction = 'remove' AND p_grams > v_pocket.grams_owned THEN
        RAISE EXCEPTION 'INSUFFICIENT_GOLD_BALANCE';
    END IF;

    INSERT INTO public.gold_pocket_entries
        (pocket_id, user_id, entry_type, grams, price_per_gram_used, idr_amount, note, entry_date)
    VALUES
        (p_pocket_id, auth.uid(), v_entry_type, p_grams, NULL, NULL, p_note, p_entry_date);

    UPDATE public.gold_pockets
    SET grams_owned = grams_owned + (CASE WHEN p_direction = 'add' THEN p_grams ELSE -p_grams END),
        updated_at = NOW()
    WHERE id = p_pocket_id
    RETURNING * INTO v_pocket;

    RETURN v_pocket;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.adjust_gold_holding_for_user(UUID, TEXT, NUMERIC, TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_gold_holding_for_user(UUID, TEXT, NUMERIC, TEXT, DATE) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 8. RPC: get_gold_holdings_summary -- agregat untuk dashboard: total gram,
--    total cash_locked (pengurang Saldo Tersedia), estimasi nilai pasar
--    sekarang (penambah Total Kekayaan, pakai harga BUYBACK -- nilai
--    likuidasi realistis, bukan harga jual), dan untung/rugi belum
--    direalisasi.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_gold_holdings_summary()
RETURNS TABLE (
    total_grams NUMERIC,
    total_cash_locked NUMERIC,
    total_market_value NUMERIC,
    unrealized_gain_loss NUMERIC,
    pocket_count INTEGER,
    stale_pocket_count INTEGER
)
SECURITY INVOKER
LANGUAGE plpgsql
AS $$
DECLARE
    v_staleness_hours NUMERIC;
BEGIN
    SELECT COALESCE(value::NUMERIC, 60) INTO v_staleness_hours
    FROM public.app_settings WHERE key = 'gold_price_staleness_hours';

    RETURN QUERY
    WITH latest_price AS (
        SELECT DISTINCT ON (brand) brand, buyback_price_per_gram, fetched_at
        FROM public.gold_prices
        ORDER BY brand, price_date DESC, fetched_at DESC
    ),
    valued AS (
        SELECT
            p.grams_owned,
            p.cash_locked_amount,
            p.grams_owned * COALESCE(lp.buyback_price_per_gram, 0) AS market_value,
            (lp.brand IS NULL OR lp.fetched_at < NOW() - (v_staleness_hours || ' hours')::INTERVAL) AS is_stale
        FROM public.gold_pockets p
        LEFT JOIN latest_price lp ON lp.brand = p.brand
        WHERE p.user_id = auth.uid() AND p.is_archived = FALSE
    )
    SELECT
        COALESCE(SUM(v.grams_owned), 0),
        COALESCE(SUM(v.cash_locked_amount), 0),
        COALESCE(SUM(v.market_value), 0),
        COALESCE(SUM(v.market_value) - SUM(v.cash_locked_amount), 0),
        COUNT(*)::INTEGER,
        COUNT(*) FILTER (WHERE v.is_stale)::INTEGER
    FROM valued v;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_gold_holdings_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_gold_holdings_summary() TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 9. pg_cron: sinkronisasi harga 1x/hari, jam 09:00 WIB (02:00 UTC) --
--    setelah Logam Mulia & sebagian besar retailer publish harga pagi
--    (umumnya ~08:30 WIB). PERSIS pola bill-reminder-notify-hourly:
--    net.http_post ke Edge Function, Authorization dari Vault (BUKAN
--    literal placeholder -- lihat root cause di migration
--    20260728000001_fix_bill_reminder_cron_placeholder.sql, jangan ulangi
--    kesalahan yang sama).
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'gold-price-sync-daily';
EXCEPTION WHEN OTHERS THEN
    NULL; -- aman kalau belum pernah dijadwalkan
END $$;

SELECT cron.schedule(
    'gold-price-sync-daily',
    '0 2 * * *',
    $$
    SELECT net.http_post(
        url := 'https://enzooigugdeaiqhnvims.supabase.co/functions/v1/gold-price-sync',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
        ),
        body := '{}'::jsonb
    );
    $$
);

COMMENT ON FUNCTION public.get_gold_holdings_summary() IS
    'Dipakai Dashboard untuk kartu Total Tabungan Emas. Harga sinkron 1x/hari lewat Edge Function gold-price-sync, dijadwalkan job pg_cron gold-price-sync-daily jam 02:00 UTC (09:00 WIB).';
