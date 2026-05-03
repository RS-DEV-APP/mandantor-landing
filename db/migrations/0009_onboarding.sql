-- Mandantor — Onboarding-Wizard für Kanzleien
-- Beim ersten Login wird die Anwältin durch ein 5-stufiges Setup geführt.
-- Marker auf der Kanzlei (nicht User) damit auch eingeladene Member nicht
-- nochmal durch das Onboarding müssen, wenn die Kanzlei bereits eingerichtet ist.

ALTER TABLE kanzlei ADD COLUMN onboarding_completed_at INTEGER;

-- Backfill: alle bestehenden Kanzleien gelten als bereits onboarded —
-- der Wizard ist neu, Bestandskunden sollen nicht plötzlich darauf landen.
UPDATE kanzlei SET onboarding_completed_at = created_at WHERE onboarding_completed_at IS NULL;
