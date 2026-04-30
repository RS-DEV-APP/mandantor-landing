-- Mandantor MVP — Initial schema
-- Run via: Cloudflare Dashboard → D1 → mandantor → Console → paste & execute

CREATE TABLE kanzlei (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  vollmacht_template TEXT,
  honorar_hourly TEXT,
  honorar_advance TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE magic_link (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  kanzlei_id TEXT,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  FOREIGN KEY (kanzlei_id) REFERENCES kanzlei(id)
);

CREATE TABLE session (
  token_hash TEXT PRIMARY KEY,
  kanzlei_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  ip_hash TEXT,
  ua_hash TEXT,
  FOREIGN KEY (kanzlei_id) REFERENCES kanzlei(id)
);

CREATE TABLE akte (
  id TEXT PRIMARY KEY,
  kanzlei_id TEXT NOT NULL,
  mandant_token TEXT NOT NULL UNIQUE,
  case_label TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  submitted_at INTEGER,
  FOREIGN KEY (kanzlei_id) REFERENCES kanzlei(id)
);

CREATE TABLE akte_step (
  akte_id TEXT NOT NULL,
  step_no INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  signed_at INTEGER,
  ip_hash TEXT,
  ua_hash TEXT,
  PRIMARY KEY (akte_id, step_no),
  FOREIGN KEY (akte_id) REFERENCES akte(id)
);

CREATE TABLE akte_file (
  id TEXT PRIMARY KEY,
  akte_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  mime_type TEXT,
  uploaded_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (akte_id) REFERENCES akte(id)
);

CREATE INDEX idx_akte_kanzlei ON akte(kanzlei_id);
CREATE INDEX idx_akte_token ON akte(mandant_token);
CREATE INDEX idx_session_kanzlei ON session(kanzlei_id);
CREATE INDEX idx_step_akte ON akte_step(akte_id);
CREATE INDEX idx_file_akte ON akte_file(akte_id);
