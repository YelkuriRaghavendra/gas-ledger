create table agency_settings (
  id boolean primary key default true check (id),
  business_name text not null default '',
  business_phone text,
  business_address text,
  price_per_cylinder numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

insert into agency_settings (id) values (true);

alter table agency_settings enable row level security;

create policy "public read agency settings" on agency_settings
  for select to anon, authenticated using (true);

create policy "owner update agency settings" on agency_settings
  for update to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
