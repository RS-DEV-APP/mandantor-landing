# Mandantor — Datenbank

D1 (SQLite-at-edge, EU) — Cloudflare-managed.

## Migrations anwenden

Cloudflare Dashboard → **Workers & Pages** → **D1** → `mandantor` → **Console** → SQL aus `migrations/0001_init.sql` einfügen → Run.

Bei neuen Migrations: gleicher Vorgang mit der nächsten `000N_*.sql`-Datei.

## Bindings

In Cloudflare Pages → `mandantor-landing` → **Settings** → **Functions** → **Bindings**:

| Variable | Typ | Resource |
|----------|-----|----------|
| `DB` | D1 Database | `mandantor` |
| `UPLOADS` | R2 Bucket | `mandantor-uploads` |
| `SECRET_KEY` | Environment Variable | (zufälliger 64-Zeichen-String, für Token-Hashing) |

Nach Binding-Änderungen: nächster Deploy zieht sie automatisch.
