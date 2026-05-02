-- Mandantor — Append-only Audit-Log mit Hash-Chain pro Kanzlei
-- (Tilman-Spec Abschnitt 11; § 8 GwG Aufzeichnungspflicht; Art. 30 DSGVO)

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kanzlei_id TEXT NOT NULL,
  occurred_at INTEGER NOT NULL DEFAULT (unixepoch()),
  actor_user_id TEXT,                  -- NULL = system/cron
  actor_email TEXT,                    -- denormalisiert für lesbare Anzeige nach User-Löschung
  event_type TEXT NOT NULL,            -- z.B. 'akte.created', 'akte.submitted', '2fa.enabled'
  subject_type TEXT,                   -- z.B. 'akte', 'kanzlei_user', 'kanzlei'
  subject_id TEXT,                     -- ID des betroffenen Subjekts
  payload_json TEXT NOT NULL,          -- JSON mit Event-Details
  previous_hash TEXT NOT NULL,         -- 'GENESIS' für ersten Eintrag
  this_hash TEXT NOT NULL,             -- HMAC-SHA256 über (previous + payload-canonical)
  ip_hash TEXT,
  ua_hash TEXT,
  FOREIGN KEY (kanzlei_id) REFERENCES kanzlei(id),
  FOREIGN KEY (actor_user_id) REFERENCES kanzlei_user(id)
);
CREATE INDEX idx_audit_kanzlei_time ON audit_log(kanzlei_id, occurred_at DESC);
CREATE INDEX idx_audit_subject ON audit_log(subject_type, subject_id);
