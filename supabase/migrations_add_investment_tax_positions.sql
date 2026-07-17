create table if not exists public.investment_tax_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null default 'Position',
  profit_loss numeric(12,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists investment_tax_positions_user_idx on public.investment_tax_positions(user_id);
create index if not exists investment_tax_positions_account_idx on public.investment_tax_positions(account_id);

alter table public.investment_tax_positions enable row level security;

drop policy if exists "investment_tax_positions_select_own" on public.investment_tax_positions;
drop policy if exists "investment_tax_positions_insert_own" on public.investment_tax_positions;
drop policy if exists "investment_tax_positions_update_own" on public.investment_tax_positions;
drop policy if exists "investment_tax_positions_delete_own" on public.investment_tax_positions;

create policy "investment_tax_positions_select_own" on public.investment_tax_positions for select using (auth.uid() = user_id);
create policy "investment_tax_positions_insert_own" on public.investment_tax_positions for insert with check (auth.uid() = user_id);
create policy "investment_tax_positions_update_own" on public.investment_tax_positions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "investment_tax_positions_delete_own" on public.investment_tax_positions for delete using (auth.uid() = user_id);

-- Optional: keep stored tax_reserve roughly in sync for accounts after positions exist.
update public.accounts a
set tax_reserve = coalesce(t.tax, 0)
from (
  select account_id, greatest(0, sum(profit_loss)) * 0.275 as tax
  from public.investment_tax_positions
  where is_active = true
  group by account_id
) t
where a.id = t.account_id;
