-- Migration Session 3
-- Fuegt hinzugefuegt_am-Spalte zu themenfeld_vokabeln hinzu

ALTER TABLE themenfeld_vokabeln
    ADD COLUMN hinzugefuegt_am DATETIME DEFAULT CURRENT_TIMESTAMP;
