-- Migration: Restore missing generate_short_code() helper
-- Date: 2026-08-13
-- Description:
--   `public.generate_short_code()` seharusnya sudah dibuat sejak migration
--   paling awal fitur support chat (20260706000000_support_chat.sql), tapi
--   ternyata tidak ada di database live -- menyebabkan
--   `create_support_session()` gagal dengan "function
--   public.generate_short_code() does not exist" setiap kali user buka
--   tab Chat Admin.
--
--   CREATE OR REPLACE (bukan cuma CREATE) supaya migration ini aman
--   dijalankan berapa kali pun, baik function-nya benar-benar hilang
--   maupun cuma "kelihatan" hilang karena sebab lain.

CREATE OR REPLACE FUNCTION public.generate_short_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result text := '';
  i integer;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$;
