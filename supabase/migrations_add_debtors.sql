create table if not exists public.debtors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('i_owe', 'owed_to_me')),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.debts
  add column if not exists debtor_id uuid references public.debtors(id) on delete set null,
  add column if not exists date date not null default current_date;

create index if not exists debtors_user_idx on public.debtors(user_id);
create index if not exists debts_debtor_idx on public.debts(debtor_id);

alter table public.debtors enable row level security;

drop policy if exists "debtors_select_own" on public.debtors;
drop policy if exists "debtors_insert_own" on public.debtors;
drop policy if exists "debtors_update_own" on public.debtors;
drop policy if exists "debtors_delete_own" on public.debtors;

create policy "debtors_select_own" on public.debtors for select using (auth.uid() = user_id);
create policy "debtors_insert_own" on public.debtors for insert with check (auth.uid() = user_id);
create policy "debtors_update_own" on public.debtors for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "debtors_delete_own" on public.debtors for delete using (auth.uid() = user_id);

create unique index if not exists debtors_one_default_idx
on public.debtors(user_id)
where is_default and is_active;

-- Existing legacy debt rows remain usable as debts without a debtor.
update public.debts
set date = created_at::date
where date is null;
