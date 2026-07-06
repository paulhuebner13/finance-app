# Finance App

Mobile-first Finanz-App mit Supabase Auth, Konten, Budgets, Buchungen, Depot, Schulden und Monatsabschluss.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## Supabase

Für neue Projekte `supabase/schema.sql` ausführen.

Für bestehende Projekte zuerst bestehende Migrationen ausführen und danach:

- `supabase/migrations_add_debts_investments_outing.sql`

## Deploy

```bash
npm run build
git add .
git commit -m "Update budget debt and depot flow"
git push
```
