-- Allow negative booking and recurring amounts for refunds/corrections.
-- Existing databases created before this patch still have CHECK (amount > 0).
-- This migration drops those old constraints and replaces them with CHECK (amount <> 0).

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.transactions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%amount%> 0%'
  loop
    execute format('alter table public.transactions drop constraint if exists %I', constraint_name);
  end loop;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.transactions'::regclass
      and conname = 'transactions_amount_nonzero_check'
  ) then
    alter table public.transactions
      add constraint transactions_amount_nonzero_check check (amount <> 0);
  end if;
end $$;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.recurring_transactions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%amount%> 0%'
  loop
    execute format('alter table public.recurring_transactions drop constraint if exists %I', constraint_name);
  end loop;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.recurring_transactions'::regclass
      and conname = 'recurring_transactions_amount_nonzero_check'
  ) then
    alter table public.recurring_transactions
      add constraint recurring_transactions_amount_nonzero_check check (amount <> 0);
  end if;
end $$;
