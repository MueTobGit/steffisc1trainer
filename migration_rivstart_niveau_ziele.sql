-- Migration: Rivstart-Sprachniveau-Ziele in app_konfiguration eintragen
-- Kumulativwerte nach Rivstart A1=850, A2=1500, B1=3000, B2=5000
-- Bereits in datenbank_schema.sql enthalten (fuer Neu-Installationen).

INSERT INTO app_konfiguration (schluessel, wert, beschreibung)
VALUES
    ('niveau_ziel_a1', '850',  'Rivstart-Ziel A1 (kumulativ): Anzahl gemeisteter Vokabeln fuer A1-Niveau (Standard: 850).'),
    ('niveau_ziel_a2', '1500', 'Rivstart-Ziel A2 (kumulativ): Anzahl gemeisteter Vokabeln fuer A2-Niveau (Standard: 1500).'),
    ('niveau_ziel_b1', '3000', 'Rivstart-Ziel B1 (kumulativ): Anzahl gemeisteter Vokabeln fuer B1-Niveau (Standard: 3000).'),
    ('niveau_ziel_b2', '5000', 'Rivstart-Ziel B2 (kumulativ): Anzahl gemeisteter Vokabeln fuer B2-Niveau (Standard: 5000).')
ON DUPLICATE KEY UPDATE wert = VALUES(wert), beschreibung = VALUES(beschreibung);
