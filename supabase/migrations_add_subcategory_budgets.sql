-- Run this once in Supabase SQL Editor for existing projects.
alter table public.category_groups
  add column if not exists budget_period text not null default 'daily' check (budget_period in ('daily', 'monthly'));

alter table public.categories
  add column if not exists average_monthly_budget numeric(12,2) not null default 0,
  add column if not exists budget_period text not null default 'daily' check (budget_period in ('daily', 'monthly'));

update public.category_groups set budget_period = 'monthly'
where name in ('Wohnen', 'Kommunikation & Abos', 'Versicherungen', 'Investieren', 'Einnahmen');

update public.categories set budget_period = 'monthly'
where name in ('Miete', 'Strom', 'Heizung', 'Wasser', 'Internet', 'Handy', 'Handyvertrag', 'Spotify', 'Google', 'ChatGPT', 'F1', 'Berufsunfähigkeit', 'Zusatzversicherung', 'Haftpflicht', 'Gym', 'TC', 'ETF', 'Aktien', 'Krypto', 'Tagesgeld', 'Sparkonto', 'Gehalt', 'Taschengeld', 'Nebenjob');

update public.categories c set average_monthly_budget = v.budget
from (values
  ('Miete', 600), ('Strom', 35), ('Heizung', 30), ('Wasser', 15), ('Internet', 20),
  ('Lebensmittel', 300), ('Essen', 120), ('Drogerie', 45), ('Friseur', 25), ('Gesundheit', 40), ('Haushalt', 20),
  ('Jahreskarte', 40), ('Öffis', 10), ('Taxi/Uber', 15), ('Bahn', 15),
  ('Handyvertrag', 20), ('Laptop/Elektronik', 25), ('Spotify', 11), ('Google', 3), ('ChatGPT', 23), ('F1', 7),
  ('Berufsunfähigkeit', 50), ('Zusatzversicherung', 30),
  ('Kleidung', 60), ('Gym', 35), ('Sport', 35), ('Geschenke', 40), ('Anschaffungen', 60), ('TC', 20),
  ('Aktivitäten', 60), ('Urlaub', 80), ('Tickets', 35), ('Restaurant', 80), ('Wetten', 20),
  ('ETF', 300)
) as v(name, budget)
where c.name = v.name and c.average_monthly_budget = 0;
