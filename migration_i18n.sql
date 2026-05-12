-- ============================================================
-- Migration: Internationalisierung (i18n)
-- ============================================================

-- 1. Sprache-Feld für Benutzer (Standardsprache pro User)
ALTER TABLE benutzer
    ADD COLUMN sprache ENUM('de','sv') NOT NULL DEFAULT 'de'
    AFTER neue_vokabeln_faktor;

-- Hinweis: Die Tabelle 'uebersetzungen' wurde entfernt.
-- Übersetzungen werden file-basiert in oeffentlich/sprachen/module/ verwaltet.
-- Zum Entfernen aus bestehenden Datenbanken:
-- DROP TABLE IF EXISTS uebersetzungen;
