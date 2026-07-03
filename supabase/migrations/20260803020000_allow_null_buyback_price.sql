-- Fix: sumber harga (logam-mulia-api) sering tidak punya data buyback untuk
-- brand tertentu (logammulia, hartadinataabadi terkonfirmasi dari log
-- Supabase user -- buybackPrice: null / 0), padahal sellPrice-nya valid.
--
-- Migration gold_savings awal mewajibkan buyback_price_per_gram NOT NULL +
-- CHECK > 0, sehingga gold-price-sync membuang SELURUH baris brand itu
-- (termasuk sellPrice yang sebenarnya valid) hanya karena buyback kosong.
-- Fix: izinkan buyback_price_per_gram NULL di gold_prices (harga jual tetap
-- tersimpan, fitur Beli tetap jalan untuk brand itu), dan blokir Jual secara
-- eksplisit untuk brand yang belum punya data buyback -- BUKAN dibiarkan
-- lolos dengan NULL * (1 - margin) = NULL, yang tanpa guard ini akan
-- korup cash_locked_amount pocket (NULL - NULL = NULL secara permanen).

ALTER TABLE public.gold_prices ALTER COLUMN buyback_price_per_gram DROP NOT NULL;

-- sell_gold_for_user: tambah guard eksplisit untuk buyback_price_per_gram NULL.
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

    -- Guard baru: jangan biarkan buyback NULL lolos ke perhitungan (akan
    -- menghasilkan idr_amount NULL dan merusak cash_locked_amount secara diam-diam).
    IF v_price.buyback_price_per_gram IS NULL THEN
        RAISE EXCEPTION 'BUYBACK_PRICE_UNAVAILABLE';
    END IF;

    SELECT COALESCE(value::NUMERIC, 0) INTO v_margin_pct
    FROM public.app_settings WHERE key = 'gold_margin_sell_pct';

    v_effective_price := v_price.buyback_price_per_gram * (1 - v_margin_pct / 100);
    v_idr_amount := ROUND(p_grams * v_effective_price, 0);

    INSERT INTO public.gold_pocket_entries
        (pocket_id, user_id, entry_type, grams, price_per_gram_used, idr_amount, note, entry_date)
    VALUES
        (p_pocket_id, auth.uid(), 'sell', p_grams, v_effective_price, v_idr_amount, p_note, p_entry_date);

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

-- get_gold_holdings_summary: kalau buyback belum ada, pakai sell_price
-- sebagai estimasi nilai pasar (lebih dekat ke kenyataan daripada 0, yang
-- akan membuat "Untung/Rugi" salah tampil seolah rugi total). Estimasi ini
-- akan sedikit lebih tinggi dari buyback riil (buyback biasanya di bawah
-- harga jual), jadi murni untuk tampilan sementara -- transaksi Jual
-- sungguhan tetap diblokir oleh guard di atas sampai buyback tersedia.
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
        SELECT DISTINCT ON (brand) brand, sell_price_per_gram, buyback_price_per_gram, fetched_at
        FROM public.gold_prices
        ORDER BY brand, price_date DESC, fetched_at DESC
    ),
    valued AS (
        SELECT
            p.grams_owned,
            p.cash_locked_amount,
            p.grams_owned * COALESCE(lp.buyback_price_per_gram, lp.sell_price_per_gram, 0) AS market_value,
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
