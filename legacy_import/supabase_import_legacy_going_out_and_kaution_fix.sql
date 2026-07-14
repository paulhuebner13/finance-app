-- Fix historical Ausgehen values and Kaution Wohnung handling for the finance.xlsx import.
-- This can be run after the main import. It is idempotent.
-- It does NOT touch July 2026 or current account balances.

do $$
declare
  v_user_email text := 'paul.huebner13@gmail.com';
  v_user_id uuid;
  v_group_id uuid;
  v_account_id uuid;
  rec jsonb;
begin
  select id into v_user_id
  from auth.users
  where lower(email) = lower(v_user_email)
  order by created_at desc
  limit 1;

  if v_user_id is null then
    raise exception 'No Supabase auth user found for email %', v_user_email;
  end if;

  -- Kaution Wohnung is gebundenes Geld, not available/comparable money.
  update public.accounts
  set type = 'bound',
      include_in_available_net_worth = false
  where user_id = v_user_id
    and lower(name) in ('kaution wohnung', 'kaution');

  -- Fix historical closing snapshots around the Kaution months. These values exclude gebundenes Geld.
  update public.month_closings
  set debt_net_value = 2519.96,
      comparable_value = 6015.47
  where user_id = v_user_id and month = '2025-10';

  update public.month_closings
  set debt_net_value = 2040.80,
      comparable_value = 5217.39
  where user_id = v_user_id and month = '2025-11';

  update public.month_closings
  set debt_net_value = 2160.46,
      comparable_value = 4908.89
  where user_id = v_user_id and month = '2025-12';

  -- If an older generated import accidentally booked Kaution as a normal Wohnen expense, remove only that legacy row.
  delete from public.transactions t
  using public.category_groups g
  where t.user_id = v_user_id
    and t.group_id = g.id
    and g.user_id = v_user_id
    and lower(g.name) = 'wohnen'
    and t.date >= date '2025-10-01'
    and t.date < date '2025-12-01'
    and t.amount = 2325
    and coalesce(t.note, '') ilike 'Legacy Import finance.xlsx%';

  select id into v_group_id
  from public.category_groups
  where user_id = v_user_id and lower(name) = 'ausgehen' and kind = 'expense'
  order by created_at asc
  limit 1;

  select id into v_account_id
  from public.accounts
  where user_id = v_user_id and lower(name) = 'n26'
  order by created_at asc
  limit 1;

  if v_group_id is null then
    insert into public.category_groups(user_id, kind, name, average_monthly_budget, budget_period, color, sort_order, is_active)
    values (v_user_id, 'expense', 'Ausgehen', 0, 'daily', '#ef4444', 80, true)
    returning id into v_group_id;
  end if;

  -- Use explicit historical Ausgehen rows from the spreadsheet so old months do not depend on reconstructed cash-flow math.
  delete from public.transactions t
  where t.user_id = v_user_id
    and t.type = 'expense'
    and t.group_id = v_group_id
    and coalesce(t.note, '') = 'Legacy Import finance.xlsx · Ausgehen · berechneter Monatswert';

  for rec in select * from jsonb_array_elements('[{"date": "2022-07-01", "amount": 142.85}, {"date": "2022-08-01", "amount": 204.57}, {"date": "2022-09-01", "amount": 234.52}, {"date": "2022-10-01", "amount": 212.95}, {"date": "2022-11-01", "amount": 235.12}, {"date": "2022-12-01", "amount": 349.51}, {"date": "2023-01-01", "amount": 199.2}, {"date": "2023-02-01", "amount": 283.93}, {"date": "2023-03-01", "amount": 140.03}, {"date": "2023-04-01", "amount": 136.49}, {"date": "2023-05-01", "amount": 171.48}, {"date": "2023-06-01", "amount": 119.39}, {"date": "2023-07-01", "amount": 401.21}, {"date": "2023-08-01", "amount": 195.69}, {"date": "2023-09-01", "amount": 437.3}, {"date": "2023-10-01", "amount": 195.93}, {"date": "2023-11-01", "amount": 34.59}, {"date": "2023-12-01", "amount": 242.6}, {"date": "2024-01-01", "amount": 71.25}, {"date": "2024-02-01", "amount": 281.45}, {"date": "2024-03-01", "amount": 216.06}, {"date": "2024-04-01", "amount": 37.79}, {"date": "2024-05-01", "amount": 81.91}, {"date": "2024-06-01", "amount": 91.1}, {"date": "2024-07-01", "amount": 390.96}, {"date": "2024-08-01", "amount": 61.65}, {"date": "2024-09-01", "amount": 93.02}, {"date": "2024-10-01", "amount": 261.34}, {"date": "2024-11-01", "amount": 187.07}, {"date": "2024-12-01", "amount": 192.08}, {"date": "2025-01-01", "amount": 240.88}, {"date": "2025-02-01", "amount": 143.76}, {"date": "2025-03-01", "amount": 200.16}, {"date": "2025-04-01", "amount": 82.8}, {"date": "2025-05-01", "amount": 244.8}, {"date": "2025-06-01", "amount": 77.52}, {"date": "2025-07-01", "amount": 490.92}, {"date": "2025-08-01", "amount": 299.66}, {"date": "2025-09-01", "amount": 370.76}, {"date": "2025-10-01", "amount": 513.98}, {"date": "2025-11-01", "amount": 175.59}, {"date": "2025-12-01", "amount": 197.63}, {"date": "2026-01-01", "amount": 104.49}, {"date": "2026-02-01", "amount": 118.29}, {"date": "2026-03-01", "amount": 200.49}, {"date": "2026-04-01", "amount": 84.85}, {"date": "2026-05-01", "amount": 186.27}, {"date": "2026-06-01", "amount": 412.12}]'::jsonb) loop
    insert into public.transactions(user_id, type, amount, date, account_id, group_id, category_id, note)
    values (
      v_user_id,
      'expense',
      (rec->>'amount')::numeric,
      (rec->>'date')::date,
      v_account_id,
      v_group_id,
      null,
      'Legacy Import finance.xlsx · Ausgehen · berechneter Monatswert'
    );
  end loop;

  raise notice 'Legacy Ausgehen/Kaution fix complete for user %.', v_user_email;
end $$;
