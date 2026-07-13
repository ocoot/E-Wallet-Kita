-- Migration: Support Chat Improvements
-- Date: 2026-08-10
-- Description:
--   Perbaikan workflow live chat admin (via Telegram bridge) supaya sesi
--   dari beberapa user yang berjalan bersamaan tidak saling tumpang tindih:
--
--   1. Satu user hanya boleh punya SATU sesi aktif (open/claimed) di satu
--      waktu -- partial unique index + create_support_session() dibuat
--      idempotent (return sesi existing kalau sudah ada, bukan bikin baru).
--      Sebelumnya user bisa punya sesi "orphan" kalau buka 2 tab, dan
--      balasan admin ke sesi lama tidak akan pernah muncul di tab yang
--      sedang mereka lihat.
--   2. RPC admin_list_support_sessions() -- daftar semua sesi aktif +
--      nama user + preview pesan terakhir, dasar untuk panel admin ringan
--      di dalam AdminPanel (menggantikan ketergantungan penuh pada
--      Telegram untuk memantau ada berapa sesi berjalan bersamaan).
--   3. RPC admin_reply_support_session() -- admin bisa balas langsung dari
--      web (bukan cuma lewat reply Telegram yang rawan salah sasaran),
--      auto-set status jadi 'claimed' kalau masih 'open'.
--
-- Catatan: opsi Telegram Forum Topics (routing otomatis per-thread) masih
-- di luar scope migration ini -- menunggu supergroup-nya disiapkan dulu.

-- 1. Cegah user punya lebih dari satu sesi aktif secara bersamaan.
--    (Kalau kebetulan sudah ada data yang melanggar ini di database,
--    migration akan gagal di step ini -- jalankan cleanup manual dulu:
--    sisakan 1 sesi open/claimed terbaru per user, tutup sisanya.)
CREATE UNIQUE INDEX IF NOT EXISTS support_sessions_one_active_per_user
  ON public.support_sessions (user_id)
  WHERE status IN ('open', 'claimed');

-- 2. create_support_session() jadi idempotent: kalau user sudah punya
--    sesi aktif, kembalikan itu saja alih-alih coba insert baru (yang
--    sekarang akan gagal kena unique index di atas).
--    DROP dulu -- Postgres menolak CREATE OR REPLACE kalau return type
--    fungsi berubah (di sini SET search_path menambah signature baru),
--    sama seperti kasus get_wallets_with_balance sebelumnya.
DROP FUNCTION IF EXISTS public.create_support_session();

CREATE OR REPLACE FUNCTION public.create_support_session()
RETURNS SETOF public.support_sessions
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  new_session_id uuid;
  v_short_code text;
  v_user_id uuid;
  v_existing_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Kalau user sudah punya sesi open/claimed, jangan bikin duplikat --
  -- kembalikan sesi yang sudah ada supaya client selalu nyambung ke
  -- satu sesi yang sama, dari tab/device manapun.
  SELECT id INTO v_existing_id
  FROM public.support_sessions
  WHERE user_id = v_user_id AND status IN ('open', 'claimed')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN QUERY SELECT * FROM public.support_sessions WHERE id = v_existing_id;
    RETURN;
  END IF;

  LOOP
    v_short_code := public.generate_short_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.support_sessions WHERE short_code = v_short_code);
  END LOOP;

  INSERT INTO public.support_sessions (user_id, short_code, status)
  VALUES (v_user_id, v_short_code, 'open')
  RETURNING id INTO new_session_id;

  RETURN QUERY SELECT * FROM public.support_sessions WHERE id = new_session_id;
EXCEPTION
  WHEN unique_violation THEN
    -- Race condition: dua request nyaris bersamaan lolos pengecekan di
    -- atas. Salah satunya kena unique index, tinggal ambil sesi yang
    -- berhasil dibuat oleh request lainnya.
    RETURN QUERY
      SELECT * FROM public.support_sessions
      WHERE user_id = v_user_id AND status IN ('open', 'claimed')
      ORDER BY created_at DESC
      LIMIT 1;
END;
$$;

-- 3. RPC: daftar sesi aktif untuk Admin Panel (list + preview pesan
--    terakhir), supaya admin bisa lihat semua sesi yang sedang berjalan
--    bersamaan dalam satu layar -- tidak lagi mengandalkan scroll histori
--    Telegram untuk tahu "ada berapa chat aktif sekarang".
DROP FUNCTION IF EXISTS public.admin_list_support_sessions();

CREATE OR REPLACE FUNCTION public.admin_list_support_sessions()
RETURNS TABLE (
  id uuid,
  short_code text,
  status text,
  user_id uuid,
  user_display_name text,
  user_email text,
  created_at timestamptz,
  updated_at timestamptz,
  last_message_at timestamptz,
  last_message_preview text,
  last_message_sender text,
  message_count bigint
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Hanya admin atau owner yang dapat mengakses daftar sesi support.';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.short_code,
    s.status,
    s.user_id,
    u.display_name,
    u.email,
    s.created_at,
    s.updated_at,
    lm.created_at AS last_message_at,
    lm.content AS last_message_preview,
    lm.sender AS last_message_sender,
    COALESCE(mc.message_count, 0) AS message_count
  FROM public.support_sessions s
  LEFT JOIN public.users u ON u.id = s.user_id
  LEFT JOIN LATERAL (
    SELECT content, sender, created_at
    FROM public.support_messages sm
    WHERE sm.session_id = s.id
    ORDER BY sm.created_at DESC
    LIMIT 1
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS message_count
    FROM public.support_messages sm2
    WHERE sm2.session_id = s.id
  ) mc ON true
  WHERE s.status IN ('open', 'claimed')
  ORDER BY COALESCE(lm.created_at, s.created_at) DESC;
END;
$$;

-- 4. RPC: admin balas sesi langsung dari web Admin Panel (jalur tambahan
--    di luar Telegram reply-matching yang rawan human error saat ada
--    beberapa sesi aktif bersamaan). Auto-claim sesi kalau masih 'open'.
DROP FUNCTION IF EXISTS public.admin_reply_support_session(uuid, text);

CREATE OR REPLACE FUNCTION public.admin_reply_support_session(
  p_session_id uuid,
  p_content text
)
RETURNS public.support_messages
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_role text;
  v_new_message public.support_messages;
BEGIN
  SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Hanya admin atau owner yang dapat membalas sesi support.';
  END IF;

  IF p_content IS NULL OR length(trim(p_content)) = 0 THEN
    RAISE EXCEPTION 'Isi pesan tidak boleh kosong.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.support_sessions
    WHERE id = p_session_id AND status IN ('open', 'claimed')
  ) THEN
    RAISE EXCEPTION 'Sesi tidak ditemukan atau sudah ditutup.';
  END IF;

  INSERT INTO public.support_messages (session_id, sender, content)
  VALUES (p_session_id, 'admin', trim(p_content))
  RETURNING * INTO v_new_message;

  UPDATE public.support_sessions
  SET status = 'claimed', updated_at = now()
  WHERE id = p_session_id AND status = 'open';

  RETURN v_new_message;
END;
$$;
