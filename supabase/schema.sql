-- Finance App Starter Schema
-- In Supabase: SQL Editor öffnen, alles einfügen, Run drücken.

create extension if not exists pgcrypto;

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('active', 'bound', 'investment')),
  include_in_available_net_worth boolean not null default true,
  is_default boolean not null default false,
  balance numeric(12,2) not null default 0,
  color text not null default '#38BDF8',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.category_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('expense', 'income', 'investment')),
  name text not null,
  average_monthly_budget numeric(12,2) not null default 0,
  budget_period text not null default 'daily' check (budget_period in ('daily', 'monthly')),
  color text not null default '#8B5CF6',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.category_groups(id) on delete cascade,
  name text not null,
  average_monthly_budget numeric(12,2) not null default 0,
  budget_period text not null default 'daily' check (budget_period in ('daily', 'monthly')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('expense', 'income', 'transfer', 'investment')),
  amount numeric(12,2) not null check (amount > 0),
  date date not null default current_date,
  account_id uuid references public.accounts(id),
  from_account_id uuid references public.accounts(id),
  to_account_id uuid references public.accounts(id),
  group_id uuid references public.category_groups(id),
  category_id uuid references public.categories(id),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('expense', 'income', 'transfer', 'investment')),
  amount numeric(12,2) not null check (amount > 0),
  account_id uuid references public.accounts(id),
  from_account_id uuid references public.accounts(id),
  to_account_id uuid references public.accounts(id),
  group_id uuid references public.category_groups(id),
  category_id uuid references public.categories(id),
  note text,
  day_of_month integer not null check (day_of_month between 1 and 31),
  active boolean not null default true,
  last_created_month text,
  created_at timestamptz not null default now()
);

create table if not exists public.month_closings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,
  closed_at timestamptz not null default now(),
  unique(user_id, month)
);

create table if not exists public.month_closing_balances (
  id uuid primary key default gen_random_uuid(),
  closing_id uuid not null references public.month_closings(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  actual_balance numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique(closing_id, account_id)
);

create index if not exists accounts_user_idx on public.accounts(user_id);
create unique index if not exists accounts_one_default_idx on public.accounts(user_id) where is_default;
create index if not exists category_groups_user_idx on public.category_groups(user_id);
create index if not exists categories_user_idx on public.categories(user_id);
create index if not exists transactions_user_date_idx on public.transactions(user_id, date);
create index if not exists recurring_user_idx on public.recurring_transactions(user_id);
create index if not exists closings_user_month_idx on public.month_closings(user_id, month);

alter table public.accounts enable row level security;
alter table public.category_groups enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.recurring_transactions enable row level security;
alter table public.month_closings enable row level security;
alter table public.month_closing_balances enable row level security;

-- Drop old policies if this file is re-run.
drop policy if exists "accounts_select_own" on public.accounts;
drop policy if exists "accounts_insert_own" on public.accounts;
drop policy if exists "accounts_update_own" on public.accounts;
drop policy if exists "accounts_delete_own" on public.accounts;

create policy "accounts_select_own" on public.accounts for select using (auth.uid() = user_id);
create policy "accounts_insert_own" on public.accounts for insert with check (auth.uid() = user_id);
create policy "accounts_update_own" on public.accounts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "accounts_delete_own" on public.accounts for delete using (auth.uid() = user_id);

drop policy if exists "category_groups_select_own" on public.category_groups;
drop policy if exists "category_groups_insert_own" on public.category_groups;
drop policy if exists "category_groups_update_own" on public.category_groups;
drop policy if exists "category_groups_delete_own" on public.category_groups;

create policy "category_groups_select_own" on public.category_groups for select using (auth.uid() = user_id);
create policy "category_groups_insert_own" on public.category_groups for insert with check (auth.uid() = user_id);
create policy "category_groups_update_own" on public.category_groups for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "category_groups_delete_own" on public.category_groups for delete using (auth.uid() = user_id);

drop policy if exists "categories_select_own" on public.categories;
drop policy if exists "categories_insert_own" on public.categories;
drop policy if exists "categories_update_own" on public.categories;
drop policy if exists "categories_delete_own" on public.categories;

create policy "categories_select_own" on public.categories for select using (auth.uid() = user_id);
create policy "categories_insert_own" on public.categories for insert with check (auth.uid() = user_id);
create policy "categories_update_own" on public.categories for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "categories_delete_own" on public.categories for delete using (auth.uid() = user_id);

drop policy if exists "transactions_select_own" on public.transactions;
drop policy if exists "transactions_insert_own" on public.transactions;
drop policy if exists "transactions_update_own" on public.transactions;
drop policy if exists "transactions_delete_own" on public.transactions;

create policy "transactions_select_own" on public.transactions for select using (auth.uid() = user_id);
create policy "transactions_insert_own" on public.transactions for insert with check (auth.uid() = user_id);
create policy "transactions_update_own" on public.transactions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "transactions_delete_own" on public.transactions for delete using (auth.uid() = user_id);

drop policy if exists "recurring_select_own" on public.recurring_transactions;
drop policy if exists "recurring_insert_own" on public.recurring_transactions;
drop policy if exists "recurring_update_own" on public.recurring_transactions;
drop policy if exists "recurring_delete_own" on public.recurring_transactions;

create policy "recurring_select_own" on public.recurring_transactions for select using (auth.uid() = user_id);
create policy "recurring_insert_own" on public.recurring_transactions for insert with check (auth.uid() = user_id);
create policy "recurring_update_own" on public.recurring_transactions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "recurring_delete_own" on public.recurring_transactions for delete using (auth.uid() = user_id);

drop policy if exists "closings_select_own" on public.month_closings;
drop policy if exists "closings_insert_own" on public.month_closings;
drop policy if exists "closings_update_own" on public.month_closings;
drop policy if exists "closings_delete_own" on public.month_closings;

create policy "closings_select_own" on public.month_closings for select using (auth.uid() = user_id);
create policy "closings_insert_own" on public.month_closings for insert with check (auth.uid() = user_id);
create policy "closings_update_own" on public.month_closings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "closings_delete_own" on public.month_closings for delete using (auth.uid() = user_id);

drop policy if exists "closing_balances_select_own" on public.month_closing_balances;
drop policy if exists "closing_balances_insert_own" on public.month_closing_balances;
drop policy if exists "closing_balances_update_own" on public.month_closing_balances;
drop policy if exists "closing_balances_delete_own" on public.month_closing_balances;

create policy "closing_balances_select_own" on public.month_closing_balances for select using (
  exists (select 1 from public.month_closings c where c.id = closing_id and c.user_id = auth.uid())
);
create policy "closing_balances_insert_own" on public.month_closing_balances for insert with check (
  exists (select 1 from public.month_closings c where c.id = closing_id and c.user_id = auth.uid())
);
create policy "closing_balances_update_own" on public.month_closing_balances for update using (
  exists (select 1 from public.month_closings c where c.id = closing_id and c.user_id = auth.uid())
) with check (
  exists (select 1 from public.month_closings c where c.id = closing_id and c.user_id = auth.uid())
);
create policy "closing_balances_delete_own" on public.month_closing_balances for delete using (
  exists (select 1 from public.month_closings c where c.id = closing_id and c.user_id = auth.uid())
);
