-- Mandantor — Block B: Branding (Logo + Farbe), 2FA TOTP, Recovery-Codes
-- Run via: Cloudflare Dashboard → D1 → mandantor → Console → paste & execute

-- Branding pro Kanzlei
ALTER TABLE kanzlei ADD COLUMN logo_r2_key TEXT;
ALTER TABLE kanzlei ADD COLUMN logo_mime_type TEXT;
ALTER TABLE kanzlei ADD COLUMN brand_color TEXT;

-- 2FA TOTP pro User
ALTER TABLE kanzlei_user ADD COLUMN totp_secret TEXT;
ALTER TABLE kanzlei_user ADD COLUMN totp_enabled_at INTEGER;
ALTER TABLE kanzlei_user ADD COLUMN recovery_codes_json TEXT;

-- Pending session (zwischen Magic-Link-Verify und TOTP-Verify)
CREATE TABLE pending_2fa (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kanzlei_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES kanzlei_user(id),
  FOREIGN KEY (kanzlei_id) REFERENCES kanzlei(id)
);
