-- Migration: Lernpfad-Only + Aufgaben-System
-- Ausführen auf: MariaDB (lokal) und MySQL 8 (Hoster, Percona 8.0.26)
--
-- 1. lernpfad_aktiv aus benutzer entfernen (alle Nutzer nutzen immer Lernpfad)
-- 2. letzte_lektion_ids ebenfalls entfernen
-- 3. benutzer_aufgaben-Tabelle anlegen (Voraus-Lernen / Hausaufgaben)
--
-- HINWEIS: DROP COLUMN IF EXISTS ist erst ab MySQL 8.0.28 verfügbar und
-- DELIMITER-Syntax wird von phpMyAdmin nicht unterstützt.
-- Daher: zwei separate ALTER TABLE ohne IF EXISTS.
-- Falls eine Spalte bereits entfernt wurde, die jeweilige Zeile einfach überspringen.

-- ---------------------------------------------------------------
-- Schritt 1a: lernpfad_aktiv entfernen
-- (ignorieren falls Fehler "Unknown column" — bereits entfernt)
-- ---------------------------------------------------------------

ALTER TABLE benutzer DROP COLUMN lernpfad_aktiv;

-- ---------------------------------------------------------------
-- Schritt 1b: letzte_lektion_ids entfernen
-- (ignorieren falls Fehler "Unknown column" — bereits entfernt)
-- ---------------------------------------------------------------

ALTER TABLE benutzer DROP COLUMN letzte_lektion_ids;

-- ---------------------------------------------------------------
-- Schritt 2: benutzer_aufgaben-Tabelle anlegen
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS benutzer_aufgaben (
    id          INT      NOT NULL AUTO_INCREMENT,
    benutzer_id INT      NOT NULL,
    lektion_id  INT      NOT NULL,
    erstellt_am DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_benutzer_lektion (benutzer_id, lektion_id),
    CONSTRAINT fk_aufgaben_benutzer FOREIGN KEY (benutzer_id) REFERENCES benutzer  (id) ON DELETE CASCADE,
    CONSTRAINT fk_aufgaben_lektion  FOREIGN KEY (lektion_id)  REFERENCES lektionen (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
