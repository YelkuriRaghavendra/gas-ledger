create table customers (
  id         bigint generated always as identity primary key,
  name       text not null,
  phone      text,
  address    text,
  created_at timestamptz not null default now()
);

create table transactions (
  id          bigint generated always as identity primary key,
  customer_id bigint not null references customers(id) on delete cascade,
  type        text not null check (type in ('sale','return','payment')),
  qty         int not null default 0,
  empties     int not null default 0,
  amount      numeric(12,2) not null default 0,
  note        text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create index on transactions (customer_id, created_at desc);

create table profiles (
  id   uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  role text not null default 'staff' check (role in ('owner','staff'))
);

create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email), 'staff');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create view customer_balances as
select
  c.id, c.name, c.phone, c.address,
  coalesce(sum(t.qty)     filter (where t.type='sale'), 0)                                as sold,
  coalesce(sum(t.empties) filter (where t.type='sale'), 0)
    + coalesce(sum(t.qty) filter (where t.type='return'), 0)                             as returned,
  coalesce(sum(t.qty)     filter (where t.type='sale'), 0)
    - (coalesce(sum(t.empties) filter (where t.type='sale'), 0)
       + coalesce(sum(t.qty)  filter (where t.type='return'), 0))                        as empties_outstanding,
  coalesce(sum(t.amount)  filter (where t.type='sale'), 0)
    - coalesce(sum(t.amount) filter (where t.type='payment'), 0)                         as amount_due
from customers c
left join transactions t on t.customer_id = c.id
group by c.id;

create view activity_feed as
select
  t.id, t.customer_id, c.name as customer_name, t.type, t.qty, t.empties,
  t.amount, t.note, t.created_by, t.created_at
from transactions t
join customers c on c.id = t.customer_id
order by t.created_at desc;

alter table customers enable row level security;
alter table transactions enable row level security;
alter table profiles enable row level security;

create policy "read customers" on customers for select to authenticated using (true);
create policy "insert customers" on customers for insert to authenticated with check (true);
create policy "owner update customers" on customers for update to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
create policy "owner delete customers" on customers for delete to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

create policy "read transactions" on transactions for select to authenticated using (true);
create policy "insert own transactions" on transactions for insert to authenticated
  with check (created_by = auth.uid());
create policy "owner update transactions" on transactions for update to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
create policy "owner delete transactions" on transactions for delete to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

create policy "read own profile" on profiles for select to authenticated using (id = auth.uid());
