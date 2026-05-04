-- Mandantor — Sprache pro Akte (DE/EN-Mandanten-UI + Mails)
-- Die Anwältin wählt die Sprache beim Anlegen einer Akte. Default = 'de'.
-- Akte.lang steuert sowohl /m/[token]-Wizard als auch 4 Mandant-Mails.

ALTER TABLE akte ADD COLUMN lang TEXT NOT NULL DEFAULT 'de';
