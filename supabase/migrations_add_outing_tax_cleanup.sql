-- Adds the special Ausgehen budget group for existing users and normalizes depot tax fields.

alter table public.accounts
  add column if not exists cost_basis numeric(12,2) not null default 0,
  add column if not exists tax_reserve numeric(12,2) not null default 0;

-- Keep stored tax_reserve in sync once for existing depot rows.
update public.accounts
set tax_reserve = greatest(0, (balance - cost_basis) * 0.275)
where type = 'investment';

-- Add Ausgehen as a category group without subcategories for every existing user that has categories.
insert into public.category_groups (user_id, kind, name, average_monthly_budget, budget_period, color, sort_order, is_active)
select distinct g.user_id, 'expense', 'Ausgehen', 250, 'daily', '#F97316', 999, true
from public.category_groups g
where not exists (
  select 1
  from public.category_groups x
  where x.user_id = g.user_id
    and lower(x.name) = 'ausgehen'
);
