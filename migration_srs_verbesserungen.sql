-- Migration: SRS-Verbesserungen — neuer Konfig-Schlüssel max_faellige_fuer_neue
--
-- Hintergrund: Neue Vokabeln werden ab jetzt nur noch eingeführt, wenn der globale
-- Wiederholungs-Rückstand unter dieser Schwelle liegt. Verhindert, dass neue Items
-- in eine Session gemischt werden, während der User (z.B. nach einer Pause) noch
-- viele fällige Wiederholungen abzuarbeiten hat.
--
-- Kompatibel mit MariaDB (lokal/XAMPP) und MySQL 8.0 (Hoster/Percona).

INSERT IGNORE INTO app_konfiguration (schluessel, wert, beschreibung)
VALUES (
    'max_faellige_fuer_neue',
    '30',
    'Max. globale faellige Wiederholungen bevor keine neuen Vokabeln mehr eingeführt werden (0 = immer neue erlaubt)'
);

-- Schwelle von 10 auf 30 erhöht: 10 war zu niedrig und blockierte neue Vokabeln
-- bei Nutzern mit vielen gelernten Wörtern (16 Fällige bei 154 Gelernten = normal).
UPDATE app_konfiguration
SET wert = '30'
WHERE schluessel = 'max_faellige_fuer_neue' AND wert = '10';
