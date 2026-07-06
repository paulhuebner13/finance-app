-- Einmal in Supabase SQL Editor ausführen, wenn du vorher schon die alte schema.sql ausgeführt hast.
alter table public.accounts
  add column if not exists is_default boolean not null default false;

-- Falls noch kein Standardkonto gesetzt ist, nimm das erste aktive Konto.
with first_active as (
  select distinct on (user_id) id, user_id
  from public.accounts
  where type = 'active'
  order by user_id, created_at asc
)
update public.accounts a
set is_default = true
from first_active f
where a.id = f.id
  and not exists (
    select 1 from public.accounts x
    where x.user_id = a.user_id and x.is_default = true
  );

create unique index if not exists accounts_one_default_idx
on public.accounts(user_id)
where is_default;
