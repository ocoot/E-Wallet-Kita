-- Migration: Webpush notification saat admin membalas sesi Support Chat
-- Date: 2026-08-19
-- Description:
--   Sekarang balasan admin ke Support Chat cuma sampai ke user lewat
--   Supabase Realtime (postgres_changes di SupportChatWidget.tsx), yang
--   hanya jalan selagi widget-nya subscribed (app/tab user aktif). Kalau
--   tab/app sedang di background atau tertutup, user tidak tahu ada
--   balasan sampai buka lagi.
--
--   Migration ini menambahkan:
--     1. Kolom `user_viewing` di `support_sessions` -- flag yang di-set
--        oleh client (lewat RPC di bawah) untuk menandai apakah user
--        SEDANG membuka widget chat pada sesi tsb (tab "admin" terbuka +
--        halaman visible). Dipakai untuk menghindari notifikasi ganda:
--        kalau user sedang melihat chat-nya, dia sudah dapat pesan lewat
--        Realtime + suara notifikasi -- webpush tidak perlu dikirim lagi.
--     2. RPC `set_support_session_viewing(session_id, viewing)` -- satu-
--        satunya jalan client mengubah flag itu, dibatasi hanya untuk
--        kolom ini saja (bukan update tabel langsung) supaya user tidak
--        bisa mengubah kolom lain (status, short_code, dst) lewat celah
--        yang sama.
--     3. Trigger AFTER INSERT di `support_messages` (khusus sender =
--        'admin') yang mengecek status sesi & flag `user_viewing`
--        langsung di SQL, lalu memanggil endpoint internal Vercel yang
--        SUDAH ADA, `/api/internal/send-bill-reminder-push.ts`, lewat
--        `net.http_post` kalau memang perlu dikirim push.
--
--        SENGAJA reuse endpoint itu (bukan bikin endpoint baru
--        `send-support-reply-push.ts`) -- endpoint tsb sudah generik
--        (terima user_id/title/body/data apa saja, tidak spesifik ke
--        bill reminder), dan project ini sudah PAS di limit 12
--        Serverless Function route pada Vercel Hobby plan (file di
--        `api/_lib/*` tidak dihitung karena prefix `_`, tapi 12 route
--        di luar itu sudah penuh). Menambah 1 file route baru di `api/`
--        akan membuat deployment gagal dengan error "No more than 12
--        Serverless Functions..." kecuali upgrade ke Pro plan.
--
--   Trigger ini otomatis menangkap KEDUA jalur balasan admin yang ada di
--   codebase (RPC admin_reply_support_session() dari Admin Panel web,
--   MAUPUN insert langsung dari supabase/functions/support-bridge saat
--   admin balas lewat grup Telegram) -- karena keduanya sama-sama
--   melakukan INSERT ke support_messages dengan sender='admin'. Tidak
--   perlu ubah dua tempat itu.
--
--   Kenapa langsung panggil Vercel dari trigger (bukan lewat Edge
--   Function Deno perantara seperti pola bill-reminder-notifier):
--   business logic-nya (cek status + user_viewing) sudah cukup murah
--   dilakukan langsung di SQL trigger, jadi tidak perlu hop tambahan.
--
-- Prasyarat (HARUS ada sebelum migration ini efektif mengirim push,
-- idempotent kalau sudah ada -- mengikuti pola vault secret di
-- 20260728000001_fix_bill_reminder_cron_placeholder.sql):
--   Secret 'internal_api_secret' di Supabase Vault, isinya HARUS SAMA
--   PERSIS dengan env var `INTERNAL_API_SECRET` di project Vercel.
--   Buat lewat SQL Editor (sebagai superuser/owner) kalau belum ada:
--     select vault.create_secret('<NILAI_INTERNAL_API_SECRET_ASLI>', 'internal_api_secret');

-- 1. Kolom flag "sedang dilihat user"
alter table public.support_sessions
  add column if not exists user_viewing boolean not null default false;

comment on column public.support_sessions.user_viewing is
  'True selagi user sedang membuka tab "admin" di SupportChatWidget untuk sesi ini (halaman visible). Diset lewat RPC set_support_session_viewing(), dipakai trigger notify_support_reply_push() untuk skip webpush kalau user sudah pasti lihat balasan lewat Realtime.';

-- 2. RPC: satu-satunya jalur client mengubah flag di atas
create or replace function public.set_support_session_viewing(
  p_session_id uuid,
  p_viewing boolean
)
returns void
security definer
set search_path = public
language plpgsql
as $$
begin
  update public.support_sessions
  set user_viewing = p_viewing
  where id = p_session_id
    and user_id = auth.uid(); -- hanya pemilik sesi yang boleh set flag miliknya sendiri

  -- Sengaja tidak raise error kalau 0 row terupdate (mis. sesi sudah
  -- closed/dihapus barengan saat client masih sempat memanggil ini saat
  -- unmount) -- flag ini murni best-effort UX, bukan data kritikal.
end;
$$;

grant execute on function public.set_support_session_viewing(uuid, boolean) to authenticated;

-- 3. URL project & konfigurasi endpoint push -- ganti kalau migration ini
--    dijalankan di project Supabase/Vercel yang berbeda dari yang ini.
--    (Pola sama seperti hardcoded URL di 20260728000001: project ref &
--    domain Vercel tidak rahasia, yang rahasia cuma secret di Vault.)
create or replace function public.notify_support_reply_push()
returns trigger
security definer
set search_path = public
language plpgsql
as $$
declare
  v_session record;
  v_secret text;
  v_title text;
  v_body text;
begin
  select user_id, status, user_viewing
    into v_session
    from public.support_sessions
    where id = new.session_id;

  -- Sesi tidak ditemukan, sudah closed, atau user sedang membuka widget
  -- chat sesi ini (sudah dapat lewat Realtime + suara notifikasi) --
  -- tidak perlu kirim webpush, hindari notifikasi ganda.
  if v_session is null
     or v_session.status = 'closed'
     or v_session.user_viewing then
    return new;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'internal_api_secret';

  if v_secret is null then
    -- Secret belum di-set (lihat prasyarat di atas) -- jangan sampai
    -- gagal-nya pg_net menggagalkan INSERT pesan admin itu sendiri.
    raise warning 'notify_support_reply_push: vault secret internal_api_secret belum ada, webpush di-skip';
    return new;
  end if;

  v_title := 'Balasan dari Admin Support';
  v_body := case
    when length(new.content) > 120 then left(new.content, 117) || '...'
    else new.content
  end;

  perform net.http_post(
    url := 'https://e-wallet-kita.vercel.app/api/internal/send-bill-reminder-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', v_secret
    ),
    body := jsonb_build_object(
      'user_id', v_session.user_id,
      'title', v_title,
      'body', v_body,
      'data', jsonb_build_object(
        'type', 'support_reply',
        'session_id', new.session_id::text
      )
    )
  );

  return new;
exception when others then
  -- Kegagalan kirim push TIDAK BOLEH menggagalkan insert pesan admin
  -- (sama seperti sendBudgetWarningIfNeeded/FCM push di telegram-webhook.ts
  -- yang selalu non-blocking terhadap alur utama).
  raise warning 'notify_support_reply_push gagal: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_support_messages_notify_push on public.support_messages;

create trigger trg_support_messages_notify_push
  after insert on public.support_messages
  for each row
  when (new.sender = 'admin')
  execute function public.notify_support_reply_push();

comment on trigger trg_support_messages_notify_push on public.support_messages is
  'Kirim webpush ke user pemilik sesi saat admin membalas (via Admin Panel web ATAUPUN grup Telegram, keduanya insert ke tabel ini), kecuali sesi sudah closed atau user sedang membuka widget chat sesi tsb (support_sessions.user_viewing). Lihat notify_support_reply_push() dan api/internal/send-bill-reminder-push.ts (endpoint generik yang di-reuse, lihat komentar di atas function ini).';
