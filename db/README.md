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
| `RESEND_API_KEY` | Secret | API-Key aus Resend (nur Workspace, in dem `mandantor.de` verifiziert ist) |
| `STRIPE_SECRET_KEY` | Secret (später) | Stripe Secret Key, beginnt mit `sk_test_` oder `sk_live_` |
| `STRIPE_WEBHOOK_SECRET` | Secret (später) | Webhook-Signing-Secret aus Stripe Dashboard, beginnt mit `whsec_` |
| `STRIPE_PRICE_STANDARD` | Environment Variable (später) | Stripe Price-ID des Standard-Tarifs, beginnt mit `price_` |

Nach Binding-Änderungen: nächster Deploy zieht sie automatisch — oder leeren Commit pushen.

## Migration-Reihenfolge

1. `0001_init.sql` — Schema von Tag 1 (kanzlei, magic_link, session, akte, akte_step, akte_file)
2. `0002_akten_typ.sql` — Vorlagen-Sets pro Mandats-Art
3. `0003_account_billing_users.sql` — User-Mgmt (kanzlei_user, user_invitation), Abo (subscription, invoice)

## Wichtig: Reihenfolge bei Code-Push und DB-Migration

**Migration immer VOR dem nächsten App-Deploy ausführen**, sonst 500-Fehler auf den Pages, die neue Tabellen verwenden. Cloudflare baut Astro-Pages innerhalb von 2–3 Min nach git-push. Wenn die DB schon migriert ist, läuft der nächste Build sauber durch.

## Stripe-Setup (für `0003_account_billing_users.sql`)

Die Tabellen `subscription` und `invoice` werden bei Migration für jede existierende Kanzlei mit Plan `pilot` (kostenlos) angelegt. Echte Bezahlung kommt erst, wenn Stripe-Keys in den Cloudflare-Bindings stehen UND der Webhook-Endpoint registriert ist (`/api/stripe/webhook`). Bis dahin zeigt `/app/account/billing` nur den Pilot-Status.
