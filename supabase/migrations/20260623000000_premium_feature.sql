-- Premium (lifetime) feature support
alter table public.users
  add column if not exists is_premium boolean not null default false,
  add column if not exists premium_paid_at timestamptz;

create table if not exists public.premium_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  order_id text not null unique,
  amount integer not null,
  total_amount integer,
  status text not null default 'PENDING', -- PENDING | SUCCESS | EXPIRED | FAILED
  qris_url text,
  direct_url text,
  signature text,
  is_sandbox boolean not null default false,
  expired_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_premium_tx_user on public.premium_transactions(user_id);

alter table public.premium_transactions enable row level security;

-- user hanya bisa membaca transaksi miliknya sendiri
drop policy if exists "premium_tx_select_own" on public.premium_transactions;
create policy "premium_tx_select_own"
  on public.premium_transactions for select
  using (auth.uid() = user_id);

-- insert/update hanya lewat service role (server), jadi tidak ada policy insert/update untuk anon/authenticated
revoke insert, update, delete on public.premium_transactions from anon, authenticated;
