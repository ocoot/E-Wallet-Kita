-- Migration: Support Chat Tables and RPCs
-- Date: 2026-07-06
-- Description: Create support_sessions, support_messages tables and related functions with tight RLS policies

-- 1. Create support_sessions table
create table if not exists public.support_sessions (
    id uuid default gen_random_uuid() primary key,
    short_code text not null unique,
    status text not null default 'open' check (status in ('open', 'claimed', 'closed')),
    user_id uuid references auth.users(id) on delete cascade not null,
    created_at timestamptz default timezone('utc'::text, now()) not null,
    updated_at timestamptz default timezone('utc'::text, now()) not null
);

-- 2. Create support_messages table
create table if not exists public.support_messages (
    id uuid default gen_random_uuid() primary key,
    session_id uuid references public.support_sessions(id) on delete cascade not null,
    sender text not null check (sender in ('user', 'admin')),
    content text not null,
    created_at timestamptz default timezone('utc'::text, now()) not null
);

-- 3. Enable Row Level Security (RLS)
alter table public.support_sessions enable row level security;
alter table public.support_messages enable row level security;

-- 4. Create RLS Policies for support_sessions
drop policy if exists "support_sessions_select" on public.support_sessions;
create policy "support_sessions_select" on public.support_sessions
    for select using (auth.uid() = user_id or public.is_admin_or_owner());

drop policy if exists "support_sessions_insert" on public.support_sessions;
create policy "support_sessions_insert" on public.support_sessions
    for insert with check (auth.uid() = user_id or public.is_admin_or_owner());

drop policy if exists "support_sessions_update" on public.support_sessions;
create policy "support_sessions_update" on public.support_sessions
    for update using (auth.uid() = user_id or public.is_admin_or_owner());

-- 5. Create RLS Policies for support_messages
drop policy if exists "support_messages_select" on public.support_messages;
create policy "support_messages_select" on public.support_messages
    for select using (
        exists (
            select 1 from public.support_sessions s 
            where s.id = session_id and (s.user_id = auth.uid() or public.is_admin_or_owner())
        )
    );

drop policy if exists "support_messages_insert" on public.support_messages;
create policy "support_messages_insert" on public.support_messages
    for insert with check (
        exists (
            select 1 from public.support_sessions s 
            where s.id = session_id and (s.user_id = auth.uid() or public.is_admin_or_owner())
        )
    );

-- 6. Helper function to generate a random 6-character short code
create or replace function public.generate_short_code()
returns text as $$
declare
  chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result text := '';
  i integer;
begin
  for i in 1..6 loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  end loop;
  return result;
end;
$$ language plpgsql;

-- 7. RPC function to create a new support session for the current user
create or replace function public.create_support_session()
returns setof public.support_sessions security definer as $$
declare
  new_session_id uuid;
  v_short_code text;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  -- Generate unique short_code
  loop
    v_short_code := public.generate_short_code();
    exit when not exists (select 1 from public.support_sessions where short_code = v_short_code);
  end loop;

  insert into public.support_sessions (user_id, short_code, status)
  values (v_user_id, v_short_code, 'open')
  returning id into new_session_id;

  return query select * from public.support_sessions where id = new_session_id;
END;
$$ language plpgsql;

-- 8. RPC function to close an active support session
create or replace function public.close_support_session(p_session_id uuid)
returns void security definer as $$
BEGIN
  update public.support_sessions
  set status = 'closed'
  where id = p_session_id and (user_id = auth.uid() or public.is_admin_or_owner());
END;
$$ language plpgsql;

-- 9. RPC function to cleanup closed support sessions for the user (or all if admin)
create or replace function public.cleanup_closed_support_sessions()
returns void security definer as $$
BEGIN
  delete from public.support_sessions
  where status = 'closed' and (user_id = auth.uid() or public.is_admin_or_owner());
END;
$$ language plpgsql;
