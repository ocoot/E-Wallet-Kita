-- ── Fix: chat-attachments bucket harus public ──────────────────────────
-- Migration sebelumnya (20260707000001_support_chat_attachments.sql) pakai
-- `insert ... on conflict (id) do nothing` untuk membuat bucket
-- 'chat-attachments'. Kalau bucket itu SUDAH ADA sebelumnya (mis. dibuat
-- manual lewat Dashboard dengan default private), ON CONFLICT DO NOTHING
-- membuat kolom `public` tidak pernah ke-update ke true.
--
-- Akibatnya getPublicUrl() tetap menghasilkan URL, tapi endpoint
-- /object/public/... akan menolak request (400/403) karena bucket-nya
-- masih private -> browser menampilkan broken image icon di chatbox,
-- baik untuk foto yang dikirim admin dari Telegram maupun upload user
-- dari web.
--
-- RLS select policy `chat_attachments_public_select` TIDAK cukup untuk
-- kasus ini, karena policy itu hanya berlaku di endpoint
-- /object/authenticated/ atau /object/sign/, bukan /object/public/.
-- ──────────────────────────────────────────────────────────────────────

-- 1. Kalau bucket sudah ada, paksa jadi public + samakan config lainnya.
update storage.buckets
set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
where id = 'chat-attachments';

-- 2. Kalau ternyata belum ada sama sekali (fresh project), buat baru.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select
  'chat-attachments',
  'chat-attachments',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
where not exists (
  select 1 from storage.buckets where id = 'chat-attachments'
);
