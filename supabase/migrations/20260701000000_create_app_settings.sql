create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

insert into app_settings (
  key,
  value
)
values (
  'premium_base_price',
  '20000'
)
on conflict (key) do nothing;
