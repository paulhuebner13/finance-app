alter table public.month_closings
  add column if not exists debt_net_value numeric(12,2) not null default 0,
  add column if not exists comparable_value numeric(12,2) not null default 0;

-- Backfill debt net value from stored debt snapshots where possible.
update public.month_closings c
set debt_net_value = coalesce((
  select sum(
    case when d.kind = 'owed_to_me'
      then mcd.actual_amount
      else -mcd.actual_amount
    end
  )
  from public.month_closing_debts mcd
  join public.debts d on d.id = mcd.debt_id
  where mcd.closing_id = c.id
), 0)
where c.debt_net_value = 0;

-- Backfill the comparable value used for Ausgehen:
-- active accounts that are included in available net worth + net debt value.
update public.month_closings c
set comparable_value = coalesce((
  select sum(mcb.actual_balance)
  from public.month_closing_balances mcb
  join public.accounts a on a.id = mcb.account_id
  where mcb.closing_id = c.id
    and a.type = 'active'
    and a.include_in_available_net_worth = true
), 0) + coalesce(c.debt_net_value, 0)
where c.comparable_value = 0;
