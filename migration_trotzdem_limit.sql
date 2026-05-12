-- ============================================================
-- Migration: Trotzdem-richtig-Limit als konfigurierbare Option
-- ============================================================

INSERT IGNORE INTO app_konfiguration (schluessel, wert, beschreibung)
VALUES ('trotzdem_richtig_limit', '30',
        'Max. Anteil "Trotzdem richtig"-Nutzungen pro Training in Prozent (1-100, Standard: 30)');
