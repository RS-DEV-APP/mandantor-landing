-- Mandantor — Aufbewahrungs-Automatik
-- (§ 50 BRAO, § 8 IV GwG; Datenschutzminimierung Pre-Submit)

ALTER TABLE kanzlei ADD COLUMN retention_years INTEGER;        -- override; default 5 wenn NULL
ALTER TABLE kanzlei ADD COLUMN draft_retention_months INTEGER; -- override; default 12 wenn NULL
ALTER TABLE akte ADD COLUMN retention_marked_at INTEGER;       -- gesetzt vom Cron; markiert Akten als reif für manuelles Hard-Delete

CREATE INDEX idx_akte_retention ON akte(status, submitted_at, retention_marked_at);
