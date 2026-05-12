-- Migration: benutzer_lektionen_gestartet
-- Behebt Bug: "Neue Vokabeln" zeigte Vokabeln aus nicht-gestarteten Lektionen,
-- weil geteilte Vokabeln (lektion_vokabeln) falsche Lektionen als "gestartet" markierten.
--
-- Neue Tabelle trackt explizit, welche Lektionen ein Benutzer jemals trainiert hat.
-- Bestehende Daten: Aus fortschritt ableiten welche Lektionen bereits bearbeitet wurden.

CREATE TABLE IF NOT EXISTS benutzer_lektionen_gestartet (
    benutzer_id INT NOT NULL,
    lektion_id  INT NOT NULL,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (benutzer_id, lektion_id),
    FOREIGN KEY (benutzer_id) REFERENCES benutzer(id) ON DELETE CASCADE,
    FOREIGN KEY (lektion_id)  REFERENCES lektionen(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bestehende Nutzer: Lektionen eintragen, bei denen der Nutzer mindestens
-- 10% der Vokabeln gelernt hat (robuste Heuristik fuer "wirklich angefangen").
INSERT IGNORE INTO benutzer_lektionen_gestartet (benutzer_id, lektion_id, erstellt_am)
SELECT f.benutzer_id, lv.lektion_id, MIN(f.erstellt_am)
FROM fortschritt f
JOIN lektion_vokabeln lv ON lv.vokabel_id = f.vokabel_id
JOIN (
    SELECT lektion_id, COUNT(*) AS gesamt
    FROM lektion_vokabeln
    GROUP BY lektion_id
) t ON t.lektion_id = lv.lektion_id
WHERE f.richtung = 'DS'
GROUP BY f.benutzer_id, lv.lektion_id, t.gesamt
HAVING COUNT(DISTINCT f.vokabel_id) >= GREATEST(1, FLOOR(t.gesamt * 0.10));
