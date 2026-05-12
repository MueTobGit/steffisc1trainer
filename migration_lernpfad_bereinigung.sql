-- ============================================================
-- migration_lernpfad_bereinigung.sql
--
-- Bereinigt benutzer_lektionen_gestartet:
-- Entfernt Eintraege fuer oeffentliche Lektionen, die nach der
-- Lernpfad-Logik (noch) nicht freigeschaltet waren.
--
-- Nicht betroffen (werden nie angefasst):
--   - Private Lektionen (ist_privat = 1) — immer zugaenglich
--   - Admins (rolle = 'admin')
--   - Benutzer mit lernpfad_aktiv = 0
--
-- Lernpfad-Regel (identisch zu api/lektionen/lernpfad.php):
--   - Lektionen sind innerhalb ihrer Kategorie alphabetisch nach
--     Titel geordnet.
--   - Die erste Lektion jeder Kategorie ist immer freigeschaltet.
--   - Lektion N+1 wird freigeschaltet, sobald Lektion N
--     >= lernpfad_schwelle % der Vokabeln auf Stufe >= 3 (DS) hat.
--   - Ist Lektion N unter der Schwelle, bleiben N+1, N+2, ...
--     gesperrt — unabhaengig vom Fortschritt der folgenden.
--
-- Ausfuehren auf Produktionsdatenbank (Percona MySQL 8.0.26):
--   1. Backup-Schritt laufen lassen (automatisch in Transaktion).
--   2. Vorschau-SELECT (auskommentiert) pruefen.
--   3. ROLLBACK durch COMMIT ersetzen wenn Ergebnis korrekt ist.
-- ============================================================

-- ---- Schritt 1: Sicherheitskopie ----
CREATE TABLE IF NOT EXISTS _backup_blg_bereinigung_2026 (
    benutzer_id  INT NOT NULL,
    lektion_id   INT NOT NULL,
    erstellt_am  DATETIME,
    geloescht_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (benutzer_id, lektion_id)
);

INSERT IGNORE INTO _backup_blg_bereinigung_2026 (benutzer_id, lektion_id, erstellt_am)
SELECT blg.benutzer_id, blg.lektion_id, blg.erstellt_am
FROM benutzer_lektionen_gestartet blg
JOIN benutzer  b   ON b.id  = blg.benutzer_id AND b.lernpfad_aktiv = 1 AND b.rolle != 'admin'
JOIN lektionen lek ON lek.id = blg.lektion_id AND lek.ist_privat = 0;

-- ---- Schritt 2: Vorschau (zum Pruefen vor dem DELETE) ----
-- Einkommentieren um zu sehen, was geloescht wird:
/*
SELECT
    b.benutzername,
    lek.titel              AS lektion,
    k.name                 AS kategorie,
    blg.erstellt_am
FROM benutzer_lektionen_gestartet blg
JOIN benutzer  b   ON b.id   = blg.benutzer_id AND b.lernpfad_aktiv = 1 AND b.rolle != 'admin'
JOIN lektionen lek ON lek.id = blg.lektion_id
                   AND lek.ist_privat = 0 AND lek.aktiv = 1 AND lek.kategorie_id IS NOT NULL
LEFT JOIN kategorien k ON k.id = lek.kategorie_id
WHERE
    -- Es gibt eine fruehere Lektion (d.h. nicht die erste in der Kategorie)
    EXISTS (
        SELECT 1 FROM lektionen erste
        WHERE erste.kategorie_id = lek.kategorie_id
          AND erste.titel        < lek.titel
          AND erste.aktiv = 1 AND erste.ist_privat = 0
    )
    -- UND mindestens ein Vorgaenger liegt unter der Schwelle
    AND EXISTS (
        SELECT 1 FROM lektionen vg
        WHERE vg.kategorie_id = lek.kategorie_id
          AND vg.titel        < lek.titel
          AND vg.aktiv = 1 AND vg.ist_privat = 0
          AND (
              -- Leere Vorgaenger-Lektion gilt als nicht bestanden
              NOT EXISTS (SELECT 1 FROM lektion_vokabeln WHERE lektion_id = vg.id)
              OR
              -- Stufe-3-Anteil des Vorgaengers unter der Schwelle
              (
                  SELECT COALESCE(SUM(CASE WHEN fp.stufe >= 3 THEN 1 ELSE 0 END), 0)
                  FROM lektion_vokabeln lv
                  LEFT JOIN fortschritt fp
                    ON fp.vokabel_id = lv.vokabel_id
                   AND fp.benutzer_id = blg.benutzer_id
                   AND fp.richtung   = 'DS'
                  WHERE lv.lektion_id = vg.id
              ) < (
                  SELECT COUNT(*) *
                      COALESCE(
                          (SELECT CAST(wert AS DECIMAL(5,2)) / 100
                           FROM app_konfiguration
                           WHERE schluessel = 'lernpfad_schwelle'
                           LIMIT 1),
                          0.50
                      )
                  FROM lektion_vokabeln WHERE lektion_id = vg.id
              )
          )
    )
ORDER BY b.benutzername, k.name, lek.titel;
*/

-- ---- Schritt 3: Bereinigung ----
START TRANSACTION;

DELETE blg
FROM benutzer_lektionen_gestartet blg
JOIN benutzer  b   ON b.id   = blg.benutzer_id
                   AND b.lernpfad_aktiv = 1
                   AND b.rolle != 'admin'
JOIN lektionen lek ON lek.id = blg.lektion_id
                   AND lek.ist_privat    = 0
                   AND lek.aktiv         = 1
                   AND lek.kategorie_id IS NOT NULL
WHERE
    -- Nicht die erste Lektion ihrer Kategorie (erste ist immer frei)
    EXISTS (
        SELECT 1 FROM lektionen erste
        WHERE erste.kategorie_id = lek.kategorie_id
          AND erste.titel        < lek.titel
          AND erste.aktiv = 1 AND erste.ist_privat = 0
    )
    -- Mindestens ein Vorgaenger liegt unter der Schwelle
    AND EXISTS (
        SELECT 1 FROM lektionen vg
        WHERE vg.kategorie_id = lek.kategorie_id
          AND vg.titel        < lek.titel
          AND vg.aktiv = 1 AND vg.ist_privat = 0
          AND (
              -- Leere Vorgaenger-Lektion = nicht bestanden
              NOT EXISTS (SELECT 1 FROM lektion_vokabeln WHERE lektion_id = vg.id)
              OR
              -- Stufe-3-Anteil unter Schwelle (pro Vorgaenger einzeln geprueft)
              (
                  SELECT COALESCE(SUM(CASE WHEN fp.stufe >= 3 THEN 1 ELSE 0 END), 0)
                  FROM lektion_vokabeln lv
                  LEFT JOIN fortschritt fp
                    ON fp.vokabel_id = lv.vokabel_id
                   AND fp.benutzer_id = blg.benutzer_id
                   AND fp.richtung   = 'DS'
                  WHERE lv.lektion_id = vg.id
              ) < (
                  SELECT COUNT(*) *
                      COALESCE(
                          (SELECT CAST(wert AS DECIMAL(5,2)) / 100
                           FROM app_konfiguration
                           WHERE schluessel = 'lernpfad_schwelle'
                           LIMIT 1),
                          0.50
                      )
                  FROM lektion_vokabeln WHERE lektion_id = vg.id
              )
          )
    );

SELECT ROW_COUNT() AS geloeschte_eintraege;

-- Ergebnis pruefen: verbleibende Eintraege pro Benutzer
SELECT b.benutzername, COUNT(*) AS verbleibende_lektionen
FROM benutzer_lektionen_gestartet blg
JOIN benutzer b ON b.id = blg.benutzer_id
GROUP BY b.benutzername
ORDER BY verbleibende_lektionen DESC;

-- *** ROLLBACK zum Testen — durch COMMIT ersetzen wenn Ergebnis stimmt! ***
-- ROLLBACK;
COMMIT;
