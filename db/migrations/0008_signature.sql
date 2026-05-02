-- Mandantor — Signatur-Layer Erweiterung (QES via Skribble/D-Trust)
-- Heute: nur Skelett. Aktiviert wenn SKRIBBLE_USERNAME + SKRIBBLE_API_KEY gesetzt sind.

CREATE TABLE signature_request (
  id TEXT PRIMARY KEY,
  akte_id TEXT NOT NULL,
  step_no INTEGER NOT NULL,
  provider TEXT NOT NULL,                  -- 'skribble' | 'd-trust' | 'internal-ees'
  level TEXT NOT NULL,                     -- 'EES' | 'FES' | 'QES'
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'sent' | 'signed' | 'declined' | 'expired'
  external_session_id TEXT,                -- Skribble signatureRequest.id
  signed_pdf_r2_key TEXT,
  evidence_pdf_r2_key TEXT,
  requested_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  expires_at INTEGER,
  FOREIGN KEY (akte_id) REFERENCES akte(id)
);
CREATE INDEX idx_signature_akte ON signature_request(akte_id);
CREATE INDEX idx_signature_external ON signature_request(external_session_id);

-- akten_typ-Erweiterung: pro Step ein optionales Signatur-Niveau
-- Format: JSON {"2": "QES", "3": "EES", "4": "QES"}  (nur Override; default = EES für 2-4)
ALTER TABLE akten_typ ADD COLUMN signature_levels_json TEXT;
