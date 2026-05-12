-- Migration: Konfigurierbare gekonnt_schwelle + level_aufstieg_stufe
-- Kompatibel mit MariaDB (XAMPP lokal) und Percona MySQL 8.0.26-16 (Hoster)
--
-- gekonnt_schwelle (Standard: 4):
--   Ab welcher Stufe eine Vokabel als "gekonnt/gemeistert" gilt.
--   Betrifft: Grammatik-Freischaltung, Beherrschungsquote, Sprachniveau-Fortschritt,
--             Dashboard-Stats, Lektions-Fortschritt, Belohnungen "alle Formen gemeistert".
--
-- level_aufstieg_stufe (Standard: 3 — Ausnahme!):
--   Ab welcher Stufe eine Vokabel fuer den Lernweg-Aufstieg zaehlt.
--   Betrifft: Level-Berechnung (training/beenden, schnellueben/beenden, admin/level_neu_berechnen).
--   ACHTUNG: Nicht mit 'lernpfad_schwelle' (Prozentsatz fuer Lernpfad-Freischaltung) verwechseln!

INSERT INTO app_konfiguration (schluessel, wert, beschreibung, aktualisiert_am)
VALUES
    ('gekonnt_schwelle',     '4', 'Ab welcher Stufe gilt eine Vokabel als gekonnt/gemeistert (Standard: 4). Betrifft Statistik, Grammatik-Freischaltung, Sprachniveau-Fortschritt, Lektions-Fortschritt und Belohnungen.', NOW()),
    ('level_aufstieg_stufe', '3', 'Ab welcher Stufe zaehlt eine Vokabel fuer den Lernweg-Level-Aufstieg (Standard: 3). Bewusste Ausnahme zur gekonnt_schwelle. Nicht mit lernpfad_schwelle (Prozentsatz) verwechseln.', NOW())
ON DUPLICATE KEY UPDATE schluessel = schluessel;
