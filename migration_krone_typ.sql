-- ============================================================
-- Migration: krone_typ-Spalte in ligen-Tabelle
-- Datum: 2026-03-30
-- Beschreibung: Fügt krone_typ (standard / wikinger / diamant)
--               zur ligen-Tabelle hinzu, damit der Admin pro Liga
--               das Aussehen der Siegeskrone wählen kann.
-- ============================================================

-- Spalte hinzufügen (idempotent via IF NOT EXISTS — MySQL 8.0+)
ALTER TABLE ligen
    ADD COLUMN IF NOT EXISTS krone_typ
        ENUM('standard', 'wikinger', 'diamant')
        NOT NULL DEFAULT 'standard'
        COMMENT 'Aussehen der Sieger-Krone: standard=Goldene Krone, wikinger=Nordische Wikingerkrone, diamant=Diamant-Krone'
        AFTER wiederholung;

-- Bestehende Ligen behalten den Standard-Typ (DEFAULT greift automatisch)
