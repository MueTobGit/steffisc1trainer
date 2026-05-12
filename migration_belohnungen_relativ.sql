-- Migration: Relative Kriterien für echte Belohnungen
-- Ändert benutzer_belohnungen für Snapshot-basiertes Tracking.
-- Kompatibel mit MariaDB (lokal) und MySQL 8.0 (Hoster).

-- 1. freigeschaltet_am: DEFAULT CURRENT_TIMESTAMP → NULL (bestehende Werte bleiben)
ALTER TABLE benutzer_belohnungen
    MODIFY COLUMN freigeschaltet_am DATETIME NULL DEFAULT NULL;

-- 2. snapshot_json für Ausgangswerte bei relativen Kriterien
ALTER TABLE benutzer_belohnungen
    ADD COLUMN snapshot_json JSON NULL;

-- 3. Bestehende Zeilen: freigeschaltet_am war DEFAULT CURRENT_TIMESTAMP,
--    d.h. alle Zeilen haben einen Wert → keine Datenmigration nötig.
--    snapshot_json bleibt NULL für bestehende (freigeschaltete) Zeilen.
