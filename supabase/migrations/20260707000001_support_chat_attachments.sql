-- ── Support Chat Attachments ─────────────────────────────────────────
-- 1. Storage bucket untuk file chat (gambar, dsb.)
-- 2. Kolom image_url di support_messages
-- 3. RLS policies untuk bucket chat-attachments
-- 4. Perubahan RPC admin_reply_support_session untuk mendukung image_url
-- ──────────────────────────────────────────────────────────────────────

-- 1. Buat bucket storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-attachments',
  'chat-attachments',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

-- 2. Kolom image_url di support_messages
alter table public.support_messages add column if not exists image_url text;

-- 3. RLS — semua user bisa baca file publik
do $$ begin
  create policy "chat_attachments_public_select"
    on storage.objects for select
    using ( bucket_id = 'chat-attachments' );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create policy "chat_attachments_auth_insert"
    on storage.objects for insert
    with check (
      bucket_id = 'chat-attachments'
      and auth.role() = 'authenticated'
    );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create policy "chat_attachments_owner_delete"
    on storage.objects for delete
    using (
      bucket_id = 'chat-attachments'
      and auth.uid()::text = (storage.foldername(name))[1]
    );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create policy "chat_attachments_service_insert"
    on storage.objects for insert
    with check (
      bucket_id = 'chat-attachments'
      and (storage.foldername(name))[1] = 'telegram'
    );
exception
  when duplicate_object then null;
end $$;

-- 4. Perbarui RPC admin_reply_support_session untuk dukung image_url
--    (drop dulu, create ulang dengan parameter image_url opsional)
drop function if exists public.admin_reply_support_session;

create or replace function public.admin_reply_support_session(
  p_session_id uuid,
  p_content text,
  p_image_url text default null
)
returns public.support_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.support_sessions;
  v_msg public.support_messages;
begin
  select id, status into strict v_session
  from public.support_sessions
  where id = p_session_id
    and status in ('open', 'claimed')
  for update;

  insert into public.support_messages (session_id, sender, content, image_url)
  values (p_session_id, 'admin', p_content, p_image_url)
  returning * into v_msg;

  if v_session.status = 'open' then
    update public.support_sessions set status = 'claimed', updated_at = now()
    where id = p_session_id;
  else
    update public.support_sessions set updated_at = now()
    where id = p_session_id;
  end if;

  return v_msg;
end;
$$;

-- 5. Perbarui juga fungsi user_message di support-bridge context —
--    create_support_session RPC tidak berubah.
--    Tapi kita buat RPC baru untuk kirim pesan user dengan image_url
create or replace function public.send_user_support_message(
  p_session_id uuid,
  p_content text,
  p_image_url text default null
)
returns public.support_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.support_sessions;
  v_msg public.support_messages;
begin
  select id, status, user_id into strict v_session
  from public.support_sessions
  where id = p_session_id
    and status in ('open', 'claimed')
  for update;

  -- Verifikasi bahwa caller adalah pemilik sesi (dilakukan juga di edge function)
  if v_session.user_id <> auth.uid() then
    raise exception 'Unauthorized';
  end if;

  insert into public.support_messages (session_id, sender, content, image_url)
  values (p_session_id, 'user', p_content, p_image_url)
  returning * into v_msg;

  update public.support_sessions set updated_at = now()
  where id = p_session_id;

  return v_msg;
end;
$$;
