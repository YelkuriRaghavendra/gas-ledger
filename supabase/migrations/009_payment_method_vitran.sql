-- Allow "vitran" as a third payment method on sales/payments.
-- Domestic bills can now be settled by cash, UPI, or vitran.
alter table transactions drop constraint if exists transactions_method_check;
alter table transactions add constraint transactions_method_check
  check (method in ('cash', 'upi', 'vitran'));
