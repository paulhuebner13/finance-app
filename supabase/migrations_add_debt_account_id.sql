alter table public.debts
  add column if not exists account_id uuid references public.accounts(id) on delete set null;

create index if not exists debts_account_id_idx on public.debts(account_id);
