# Finance App

Next.js + Supabase finance app.

## Wichtig nach diesem Patch

In Supabase einmal ausführen:

- `supabase/migrations_add_outing_tax_cleanup.sql`

Danach lokal:

```powershell
npm.cmd config set registry https://registry.npmjs.org/
Remove-Item package-lock.json -Force
Remove-Item node_modules -Recurse -Force -ErrorAction SilentlyContinue
npm.cmd install
npm.cmd run build
git add .
git commit -m "Update money budgets depot"
git push
```

Falls `package-lock.json` beim Kopieren ersetzt wurde: vor dem Push prüfen:

```powershell
Select-String -Path package-lock.json -Pattern "applied-caas"
```

Es darf nichts ausgegeben werden.
