# Finance App

Mobile-first Finanz-App als Next.js/Supabase/Vercel Starter.

## Enthalten

- Login / Konto erstellen mit Supabase Auth
- Supabase Postgres Schema mit Row Level Security
- Startseite mit aktuellem Monat
- `+ Buchung` Modal
  - Ausgabe = rot
  - Einnahme = grün
  - Umbuchung = gelb
  - Investition = violett
- Kategorien mit eigenen Farben und Budget-Bars
- Durchschnittsmonat-Logik: 30,44 Tage
- Konten-Seite mit aktivem Geld, gebundenem Geld und Investmentkonten
- Buchungen-Seite mit Bearbeiten und Löschen
- Wiederkehrende Buchungen
- Monatsabschluss-Popup mit echten Kontoständen
- Depot/Investments-Seite für z. B. Scalable Capital
- Analyse-Seite mit Kategorie- und Unterkategorie-Auswertung
- PWA Manifest

## 1. Lokal starten

```bash
npm install
cp .env.example .env.local
npm run dev
```

Windows PowerShell:

```powershell
copy .env.example .env.local
npm install
npm run dev
```

Dann öffnen:

```text
http://localhost:3000
```

## 2. Supabase einrichten

1. Neues Supabase-Projekt erstellen.
2. SQL Editor öffnen.
3. `supabase/schema.sql` komplett kopieren.
4. In Supabase einfügen und ausführen.
5. Unter Project Settings → API holen:
   - Project URL
   - anon public key

Dann in `.env.local` eintragen:

```env
NEXT_PUBLIC_SUPABASE_URL=https://dein-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=dein-anon-public-key
```

Niemals den `service_role` Key ins Frontend, GitHub oder Vercel Public Env schreiben.

## 3. GitHub

```bash
git init
git add .
git commit -m "Initial finance app"
git branch -M main
git remote add origin https://github.com/DEIN_USERNAME/finance-app.git
git push -u origin main
```

`.env.local`, `.next` und `node_modules` werden durch `.gitignore` nicht hochgeladen.

## 4. Vercel

1. Vercel öffnen.
2. Neues Projekt importieren.
3. GitHub-Repo auswählen.
4. Environment Variables setzen:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

5. Deploy drücken.

## Investment-Logik

Investitionen sind kein normaler Konsum. Eine Investitionsbuchung zieht Geld vom Zahlungskonto ab und erhöht ein Investmentkonto, z. B. Scalable Capital. Im Dashboard wird sie separat als `Investiert` angezeigt und nicht zu normalen Ausgaben gezählt.

Der echte Depotwert kann schwanken. Deshalb gibt es:

- Depot-Seite: aktuellen Scalable-Capital-Stand manuell eintragen
- Monatsabschluss: Investmentkonten werden wie andere Konten abgefragt

Eine direkte Kurs-/Depot-Automatisierung ist absichtlich nicht eingebaut, weil Scalable Capital keine einfache offizielle Public API für private Apps anbietet.
