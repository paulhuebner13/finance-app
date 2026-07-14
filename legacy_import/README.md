# Legacy Import aus finance.xlsx

Dateien:

- `supabase_import_finance_xlsx.sql`  
  Supabase-SQL-Import für historische Monatswerte aus `finance.xlsx`.

- `finance_xlsx_import_summary.csv`  
  Übersicht der erkannten Monatswerte zur Kontrolle.

- `finance_xlsx_import_transactions_preview.csv`  
  Vorschau der aggregierten Buchungen, die importiert werden.

## Was importiert wird

- Zeitraum: 2022-06 bis 2026-06.
- 2026-07 und später werden bewusst übersprungen, damit aktuelle Juli-2026-Werte in der App nicht überschrieben werden.
- Historische Monatsabschlüsse mit:
  - N26
  - Bank Austria
  - Bargeld
  - Kaution Wohnung
  - Scalable Capital
  - Schulden-Netto-Wert
  - vergleichbarer Wert
- Aggregierte Monatsbuchungen aus den alten Spalten.
- Investitionen aus der alten Investment-Spalte.

## Wichtig

Vor dem Ausführen im SQL-Script prüfen:

```sql
v_user_email text := 'paul.huebner13@gmail.com';
```

Wenn du in der App eine andere Login-Mail verwendest, diese Zeile anpassen.

Der Import ändert keine aktuellen Kontostände.
