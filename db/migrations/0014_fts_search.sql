-- Mandantor — Volltextsuche via SQLite FTS5.
-- Eine virtuelle Tabelle aggregiert pro Akte: case_label, mandant_name, mandant_email,
-- ai_summary, sowie Stammdaten (Step 1) + Sachverhalt (Step 6) + alle Notizen-Bodies.
-- Wir füllen sie programmatisch aus lib/search.ts (rebuildFts) statt mit DB-Triggern,
-- damit wir Kontrolle über die Aggregation haben (verschlüsselte Notizen entschlüsseln,
-- step_data parsen etc.).

CREATE VIRTUAL TABLE akte_fts USING fts5(
  akte_id UNINDEXED,
  kanzlei_id UNINDEXED,
  content,
  tokenize='porter unicode61'
);
