-- Mandantor — KI-Analyse von Mandanten-Sachverhalten.
-- Pro Akte werden Zusammenfassung + Sentiment via Claude API erzeugt und gecacht.
-- Auslöser: Public-Intake-Submit, Step-6-Save, oder manueller Klick aus der Akten-Ansicht.
--
-- PII (Email/Telefon/IBAN) wird vor LLM-Call lokal redaktiert (siehe lib/pii_redact.ts).
-- Tokens-Felder dienen einfachem Cost-Tracking für die Anwältin.

ALTER TABLE akte ADD COLUMN ai_summary TEXT;
ALTER TABLE akte ADD COLUMN ai_sentiment TEXT;       -- 'neutral' | 'frustrated' | 'urgent' | 'unclear'
ALTER TABLE akte ADD COLUMN ai_analyzed_at INTEGER;
ALTER TABLE akte ADD COLUMN ai_input_tokens INTEGER;
ALTER TABLE akte ADD COLUMN ai_output_tokens INTEGER;
ALTER TABLE akte ADD COLUMN ai_model TEXT;
