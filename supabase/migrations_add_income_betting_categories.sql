-- Adds better income categories and recategorizes legacy betting income.
-- Run once in Supabase SQL Editor after deploying this patch.

do $$
declare
  g record;
  next_sort integer;
  v_uncat uuid;
  v_bets uuid;
begin
  for g in
    select id, user_id
    from public.category_groups
    where kind = 'income' and lower(name) = 'einnahmen'
  loop
    update public.categories
    set name = 'Geschenke'
    where user_id = g.user_id
      and group_id = g.id
      and lower(name) = 'geschenk';

    select coalesce(max(sort_order), -1) + 1 into next_sort
    from public.categories
    where user_id = g.user_id and group_id = g.id;

    if not exists (
      select 1 from public.categories
      where user_id = g.user_id and group_id = g.id and lower(name) = 'unkategorisiert'
    ) then
      insert into public.categories(user_id, group_id, name, average_monthly_budget, budget_period, sort_order, is_active)
      values (g.user_id, g.id, 'Unkategorisiert', 0, 'monthly', 0, true);
    end if;

    if not exists (
      select 1 from public.categories
      where user_id = g.user_id and group_id = g.id and lower(name) = 'wetten'
    ) then
      insert into public.categories(user_id, group_id, name, average_monthly_budget, budget_period, sort_order, is_active)
      values (g.user_id, g.id, 'Wetten', 0, 'monthly', next_sort + 1, true);
    end if;

    select id into v_uncat
    from public.categories
    where user_id = g.user_id and group_id = g.id and lower(name) = 'unkategorisiert'
    order by created_at asc
    limit 1;

    select id into v_bets
    from public.categories
    where user_id = g.user_id and group_id = g.id and lower(name) = 'wetten'
    order by created_at asc
    limit 1;

    update public.transactions
    set category_id = v_bets
    where user_id = g.user_id
      and type = 'income'
      and group_id = g.id
      and note ilike '%Einkommen · bets%';

    update public.transactions
    set category_id = v_uncat
    where user_id = g.user_id
      and type = 'income'
      and group_id = g.id
      and category_id is null;
  end loop;
end $$;
