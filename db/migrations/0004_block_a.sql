-- Mandantor — Block A: Reminder, Re-Open, Notizen, Such-Felder

-- ── Akte: Mandant-Email + Workflow-Felder ───────────────────────────────
ALTER TABLE akte ADD COLUMN mandant_email TEXT;
ALTER TABLE akte ADD COLUMN mandant_name TEXT;
ALTER TABLE akte ADD COLUMN reminder_sent_at INTEGER;
ALTER TABLE akte ADD COLUMN reopened_at INTEGER;
ALTER TABLE akte ADD COLUMN reopen_reason TEXT;

CREATE INDEX idx_akte_mandant_email ON akte(mandant_email);
CREATE INDEX idx_akte_status_reminder ON akte(status, reminder_sent_at);

-- ── Notizen ─────────────────────────────────────────────────────────────
CREATE TABLE akte_note (
  id TEXT PRIMARY KEY,
  akte_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (akte_id) REFERENCES akte(id),
  FOREIGN KEY (user_id) REFERENCES kanzlei_user(id)
);
CREATE INDEX idx_akte_note_akte ON akte_note(akte_id);
