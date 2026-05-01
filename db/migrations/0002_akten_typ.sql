-- Mandantor — Akten-Typen (Vorlagen-Sets pro Kanzlei)
-- Run via: Cloudflare Dashboard → D1 → mandantor → Console → paste & execute

CREATE TABLE akten_typ (
  id TEXT PRIMARY KEY,
  kanzlei_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  vollmacht_template TEXT,
  honorar_hourly TEXT,
  honorar_advance TEXT,
  dsgvo_template TEXT,
  file_hints_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (kanzlei_id) REFERENCES kanzlei(id)
);

CREATE INDEX idx_akten_typ_kanzlei ON akten_typ(kanzlei_id);

-- Existing akten get a nullable foreign key to akten_typ
ALTER TABLE akte ADD COLUMN akten_typ_id TEXT REFERENCES akten_typ(id);

CREATE INDEX idx_akte_typ ON akte(akten_typ_id);
