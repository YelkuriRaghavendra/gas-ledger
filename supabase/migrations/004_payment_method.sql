alter table transactions add column method text check (method in ('cash','upi'));
