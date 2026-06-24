alter table app_settings enable row level security;

create policy "app_settings_select"
on app_settings
for select
to authenticated
using (true);

create policy "app_settings_update"
on app_settings
for update
to authenticated
using (
  exists (
    select 1
    from users u
    where u.id = auth.uid()
      and u.role in ('owner','admin')
  )
);
