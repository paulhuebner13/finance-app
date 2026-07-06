alter table public.accounts
  add column if not exists cost_basis numeric(12,2) not null default 0,
  add column if not exists tax_reserve numeric(12,2) not null default 0;

create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person text not null,
  kind text not null check (kind in ('i_owe', 'owed_to_me')),
  amount numeric(12,2) not null default 0,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.month_closing_debts (
  id uuid primary key default gen_random_uuid(),
  closing_id uuid not null references public.month_closings(id) on delete cascade,
  debt_id uuid not null references public.debts(id) on delete cascade,
  actual_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique(closing_id, debt_id)
);

create index if not exists debts_user_idx on public.debts(user_id);
create index if not exists closing_debts_closing_idx on public.month_closing_debts(closing_id);

alter table public.debts enable row level security;
alter table public.month_closing_debts enable row level security;

drop policy if exists "debts_select_own" on public.debts;
drop policy if exists "debts_insert_own" on public.debts;
drop policy if exists "debts_update_own" on public.debts;
drop policy if exists "debts_delete_own" on public.debts;
create policy "debts_select_own" on public.debts for select using (auth.uid() = user_id);
create policy "debts_insert_own" on public.debts for insert with check (auth.uid() = user_id);
create policy "debts_update_own" on public.debts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "debts_delete_own" on public.debts for delete using (auth.uid() = user_id);

drop policy if exists "closing_debts_select_own" on public.month_closing_debts;
drop policy if exists "closing_debts_insert_own" on public.month_closing_debts;
drop policy if exists "closing_debts_update_own" on public.month_closing_debts;
drop policy if exists "closing_debts_delete_own" on public.month_closing_debts;
create policy "closing_debts_select_own" on public.month_closing_debts for select using (
  exists (select 1 from public.month_closings c where c.id = closing_id and c.user_id = auth.uid())
);
create policy "closing_debts_insert_own" on public.month_closing_debts for insert with check (
  exists (select 1 from public.month_closings c where c.id = closing_id and c.user_id = auth.uid())
);
create policy "closing_debts_update_own" on public.month_closing_debts for update using (
  exists (select 1 from public.month_closings c where c.id = closing_id and c.user_id = auth.uid())
) with check (
  exists (select 1 from public.month_closings c where c.id = closing_id and c.user_id = auth.uid())
);
create policy "closing_debts_delete_own" on public.month_closing_debts for delete using (
  exists (select 1 from public.month_closings c where c.id = closing_id and c.user_id = auth.uid())
);

-- Gruppenbudget ab jetzt als Summe der aktiven Unterbudgets speichern.
update public.category_groups g
set average_monthly_budget = coalesce((
  select sum(c.average_monthly_budget)
  from public.categories c
  where c.group_id = g.id and c.is_active = true
), 0);
