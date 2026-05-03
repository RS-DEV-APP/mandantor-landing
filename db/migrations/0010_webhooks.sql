-- Mandantor — Outbound Webhooks für Drittsysteme.
-- Pro Kanzlei können mehrere Endpoints konfiguriert werden, die bei Akten-Lifecycle-
-- Events (akte.created, akte.submitted, akte.reopened) per HMAC-signiertem POST
-- benachrichtigt werden. v1: fire-and-forget mit Last-Status, keine Retry-Queue.

CREATE TABLE webhook_endpoint (
  id TEXT PRIMARY KEY,
  kanzlei_id TEXT NOT NULL REFERENCES kanzlei(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  signing_secret TEXT NOT NULL,
  events_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_success_at INTEGER,
  last_failure_at INTEGER,
  last_status_code INTEGER,
  last_error TEXT
);
CREATE INDEX idx_webhook_endpoint_kanzlei ON webhook_endpoint(kanzlei_id, active);
