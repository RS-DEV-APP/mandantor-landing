-- Mandantor — Account-Bereich: Users, Einladungen, Abonnement, Rechnungen
-- Run via: Cloudflare Dashboard → D1 → mandantor → Console → paste & execute

-- ── Users (mehrere Anwält:innen pro Kanzlei) ──────────────────────────────
CREATE TABLE kanzlei_user (
  id TEXT PRIMARY KEY,
  kanzlei_id TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'admin',          -- 'admin' | 'member'
  status TEXT NOT NULL DEFAULT 'active',       -- 'active' | 'invited' | 'removed'
  invited_by_user_id TEXT,
  invited_at INTEGER,
  joined_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (kanzlei_id) REFERENCES kanzlei(id),
  FOREIGN KEY (invited_by_user_id) REFERENCES kanzlei_user(id)
);
CREATE UNIQUE INDEX idx_kanzlei_user_email ON kanzlei_user(email);
CREATE INDEX idx_kanzlei_user_kanzlei ON kanzlei_user(kanzlei_id);

-- Backfill: für jede existierende Kanzlei einen Admin-User mit deren Email anlegen.
-- ID = kanzlei.id (so kann session.user_id direkt mit kanzlei.id mappen, wenn nötig).
INSERT INTO kanzlei_user (id, kanzlei_id, email, display_name, role, status, joined_at)
  SELECT id, id, email, display_name, 'admin', 'active', created_at FROM kanzlei;

-- ── Session: zeigt jetzt auf user statt direkt auf kanzlei ────────────────
ALTER TABLE session ADD COLUMN user_id TEXT REFERENCES kanzlei_user(id);

-- Backfill: existierende sessions bekommen den Admin-User der Kanzlei (id = kanzlei_id)
UPDATE session SET user_id = kanzlei_id WHERE user_id IS NULL;

-- ── Einladungen ──────────────────────────────────────────────────────────
CREATE TABLE user_invitation (
  token_hash TEXT PRIMARY KEY,
  kanzlei_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  invited_by_user_id TEXT,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (kanzlei_id) REFERENCES kanzlei(id),
  FOREIGN KEY (invited_by_user_id) REFERENCES kanzlei_user(id)
);
CREATE INDEX idx_invite_kanzlei ON user_invitation(kanzlei_id);

-- ── Subscription (Stripe) ────────────────────────────────────────────────
CREATE TABLE subscription (
  kanzlei_id TEXT PRIMARY KEY,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan TEXT NOT NULL DEFAULT 'pilot',          -- 'pilot' | 'standard' | 'pro'
  status TEXT NOT NULL DEFAULT 'pilot',        -- 'pilot' | 'active' | 'past_due' | 'canceled'
  current_period_end INTEGER,
  seat_count INTEGER NOT NULL DEFAULT 1,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (kanzlei_id) REFERENCES kanzlei(id)
);

-- Backfill: jede existierende Kanzlei bekommt 'pilot' Subscription
INSERT INTO subscription (kanzlei_id, plan, status, seat_count)
  SELECT id, 'pilot', 'pilot', 1 FROM kanzlei;

-- ── Invoices (Stripe-Spiegel) ────────────────────────────────────────────
CREATE TABLE invoice (
  id TEXT PRIMARY KEY,
  kanzlei_id TEXT NOT NULL,
  stripe_invoice_id TEXT UNIQUE,
  number TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL,                        -- 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'
  hosted_invoice_url TEXT,
  invoice_pdf_url TEXT,
  period_start INTEGER,
  period_end INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (kanzlei_id) REFERENCES kanzlei(id)
);
CREATE INDEX idx_invoice_kanzlei ON invoice(kanzlei_id);
