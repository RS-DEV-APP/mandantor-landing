-- Mandantor — Direktnachrichten zwischen Mandant und Kanzlei pro Akte.
-- v1: Polling-basiert (kein WebSocket). Mandant kann erst senden wenn Akte
-- submitted oder reopened ist (Vor-Submit-Phase ist Wizard-Workflow).
--
-- sender = 'mandant' | 'lawyer'
-- sender_user_id ist nur für 'lawyer' gesetzt (auf kanzlei_user.id).
-- read_at: Zeitpunkt der Lesebestätigung der Gegenseite.

CREATE TABLE message (
  id TEXT PRIMARY KEY,
  akte_id TEXT NOT NULL REFERENCES akte(id) ON DELETE CASCADE,
  kanzlei_id TEXT NOT NULL REFERENCES kanzlei(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('mandant', 'lawyer')),
  sender_user_id TEXT,
  body TEXT NOT NULL,
  read_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_message_akte ON message(akte_id, created_at);
CREATE INDEX idx_message_kanzlei_unread ON message(kanzlei_id, read_at) WHERE sender = 'mandant';
