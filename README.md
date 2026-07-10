# Finance App Patch

Änderungen:
- Ausgehen wird zentral als nicht getrackte Differenz berechnet.
- Die Berechnung berücksichtigt aktive Konten, Netto-Schulden und alle getrackten Buchungen inklusive Einnahmen, Ausgaben, Umbuchungen und Investitionen.
- Schuldenwert ist in Abrechnung und alten Abrechnungen direkt als Gesamtwert editierbar.
- Neue Monatsabrechnung übernimmt als Standard den aktuellen Netto-Schuldenwert aus dem Schulden-Tab.
- Analyse verwendet dieselbe Ausgehen-Logik wie Start.

Keine neue Supabase-Migration notwendig, sofern `debt_net_value` und `comparable_value` aus dem letzten Patch bereits existieren.
