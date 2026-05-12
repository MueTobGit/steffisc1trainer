-- Migration: UNIQUE Constraint auf liga_teilnehmer
-- Verhindert Race-Condition-Duplikate beim Liga-Beitritt
-- Kompatibel mit MariaDB (lokal) und Percona MySQL 8.0 (Hoster)
--
-- Sicher auszufuehren: IF NOT EXISTS verhindert Fehler bei wiederholtem Lauf.
-- Duplikate bereinigen (falls vorhanden) bevor der Constraint gesetzt wird.

-- Schritt 1: Eventuelle Duplikate entfernen (behält jeweils den Eintrag mit der kleinsten ID)
DELETE t1 FROM liga_teilnehmer t1
INNER JOIN liga_teilnehmer t2
    ON t1.liga_id = t2.liga_id
    AND t1.benutzer_id = t2.benutzer_id
    AND t1.id > t2.id;

-- Schritt 2: UNIQUE Constraint hinzufuegen (nur wenn noch nicht vorhanden)
ALTER TABLE liga_teilnehmer
    ADD CONSTRAINT uq_liga_benutzer UNIQUE (liga_id, benutzer_id);
