-- Fix: log_ai_usage harus bisa dipanggil oleh authenticated dan service_role
-- karena client Supabase dari server menggunakan service_role key via REST API,
-- yang secara internal masih butuh EXECUTE grant ke authenticated atau public.

GRANT EXECUTE ON FUNCTION public.log_ai_usage TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_ai_usage TO anon;
