-- Mandantor — Status-Pipeline pro Akten-Typ.
-- Anwältin definiert pro Akten-Typ eine Liste von Phasen (z. B. "Ersteinschätzung →
-- Schriftsatz → Einreichung → Verhandlung"). Pro Akte wird die aktuelle Phase
-- gespeichert; Mandant sieht im Wizard einen Phasen-Stepper.
--
-- phases_json = JSON-Array mit Strings, z. B. ["Ersteinschätzung","Schriftsatz",…]
-- akte.current_phase = Index in dieser Liste (0-basiert) oder NULL wenn noch nicht gesetzt.

ALTER TABLE akten_typ ADD COLUMN phases_json TEXT;
ALTER TABLE akte ADD COLUMN current_phase INTEGER;
ALTER TABLE akte ADD COLUMN phase_updated_at INTEGER;
