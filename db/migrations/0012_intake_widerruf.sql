-- Mandantor — Block 1+2: Sachverhalt, Widerrufsbelehrung, Public-Intake.
-- Bestehende Akten-Typen behalten den alten 5-Schritt-Flow (include_*-Defaults = 0);
-- die Anwältin schaltet pro Typ frei. Public-Intake ist pro Kanzlei opt-in.

-- Kanzlei-Branding-Erweiterung
ALTER TABLE kanzlei ADD COLUMN impressum_url TEXT;
ALTER TABLE kanzlei ADD COLUMN datenschutz_url TEXT;
ALTER TABLE kanzlei ADD COLUMN public_intake_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE kanzlei ADD COLUMN public_intake_other_enabled INTEGER NOT NULL DEFAULT 1;

-- Akten-Typ: Flow-Schalter + optionaler Widerrufstext
ALTER TABLE akten_typ ADD COLUMN include_sachverhalt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE akten_typ ADD COLUMN include_widerruf INTEGER NOT NULL DEFAULT 0;
ALTER TABLE akten_typ ADD COLUMN widerruf_template TEXT;

-- Akte: Herkunft (lawyer-first vs. public-first)
ALTER TABLE akte ADD COLUMN intake_source TEXT NOT NULL DEFAULT 'lawyer';
