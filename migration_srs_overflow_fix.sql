-- ============================================================
-- migration_srs_overflow_fix.sql
--
-- Behebt den SRS-Intervall-Overflow-Bug:
-- Durch unbegrenztes EF-Wachstum (+0.1 pro perfekter Antwort)
-- konnten intervall_tage den MySQL-INT-MAX (2147483647) erreichen.
-- DATE_ADD mit diesem Wert überlief das DATE-Feld → 0000-00-00.
-- Einträge mit naechste_wiederholung = '0000-00-00' erscheinen
-- immer als fällig und stecken dauerhaft in "Wiederholen".
--
-- Betrifft:
--   Lucia:     11 × 0000-00-00 (immer fällig), 16 × überlange Zukunft, 15 × EF > 5.0
--   sarah_2012: 10 × 0000-00-00,               17 × überlange Zukunft, 10 × EF > 5.0
--   tobias:      0 × 0000-00-00,                2 × überlange Zukunft,  0 × EF > 5.0
--
-- Strategie:
--   1. intervall_tage auf MAX (365 = 1 Jahr) kappen
--   2. naechste_wiederholung neu berechnen: CURDATE() + intervall_tage
--      (NICHT aktualisiert_am — das wäre u.U. Jahre alt → naechste_wiederholung
--       läge trotz Kappung noch in der Vergangenheit → weiterhin immer fällig)
--      aktualisiert_am wird ebenfalls auf NOW() gesetzt (frischer Ausgangspunkt).
--   3. leichtigkeitsfaktor auf max. 5.0 kappen
--
-- Algorithmus-Fix (Code) ist in lern_algorithmus.php und konstanten.php
-- bereits eingebaut — diese Migration repariert nur die Altdaten.
-- ============================================================

-- ---- Schritt 1: Sicherheitskopie ----
CREATE TABLE IF NOT EXISTS _backup_fortschritt_srs_overflow (
    id              BIGINT NOT NULL,
    benutzer_id     INT NOT NULL,
    vokabel_id      INT NOT NULL,
    richtung        VARCHAR(2),
    stufe           TINYINT,
    intervall_tage  INT,
    leichtigkeitsfaktor FLOAT,
    naechste_wiederholung DATE,
    gesichert_am    DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

INSERT IGNORE INTO _backup_fortschritt_srs_overflow
    (id, benutzer_id, vokabel_id, richtung, stufe, intervall_tage, leichtigkeitsfaktor, naechste_wiederholung)
SELECT id, benutzer_id, vokabel_id, richtung, stufe, intervall_tage, leichtigkeitsfaktor, naechste_wiederholung
FROM fortschritt
WHERE naechste_wiederholung = '0000-00-00'
   OR intervall_tage > 365
   OR leichtigkeitsfaktor > 5.0;

-- ---- Schritt 2: Vorschau (zum Prüfen vor dem UPDATE) ----
/*
SELECT b.benutzername, v.schwedisch, f.stufe, f.wiederholungen,
    f.intervall_tage, f.leichtigkeitsfaktor,
    f.naechste_wiederholung, f.aktualisiert_am,
    -- Neuer geplanter Wert:
    LEAST(f.intervall_tage, 365) AS neues_intervall,
    DATE_ADD(DATE(f.aktualisiert_am), INTERVAL LEAST(f.intervall_tage, 365) DAY) AS neue_wiederholung
FROM fortschritt f
JOIN benutzer b ON b.id = f.benutzer_id
JOIN vokabeln v ON v.id = f.vokabel_id
WHERE f.naechste_wiederholung = '0000-00-00' OR f.intervall_tage > 365
ORDER BY b.benutzername, f.stufe DESC;
*/

-- ---- Schritt 3: Reparatur ----
START TRANSACTION;

-- 3a. intervall_tage kappen + naechste_wiederholung neu setzen
--     Basisdatum: CURDATE() statt aktualisiert_am, weil aktualisiert_am
--     u.U. Jahre alt ist → aktualisiert_am + 365 könnte trotzdem in der
--     Vergangenheit liegen → Vokabel bliebe weiterhin "fällig".
--     aktualisiert_am wird ebenfalls auf NOW() gesetzt, damit es als
--     sinnvoller Startpunkt für künftige Intervall-Berechnungen gilt.
UPDATE fortschritt
SET
    intervall_tage        = LEAST(intervall_tage, 365),
    naechste_wiederholung = DATE_ADD(CURDATE(), INTERVAL LEAST(intervall_tage, 365) DAY),
    aktualisiert_am       = NOW()
WHERE naechste_wiederholung = '0000-00-00'
   OR intervall_tage > 365;

-- 3b. leichtigkeitsfaktor auf 5.0 kappen (kein Einfluss auf naechste_wiederholung)
UPDATE fortschritt
SET leichtigkeitsfaktor = 5.0
WHERE leichtigkeitsfaktor > 5.0;

-- ---- Ergebnis prüfen ----
SELECT ROW_COUNT() AS aktualisierte_ef_eintraege;

-- Sollte nach dem Update 0 ergeben (keine Anomalien mehr):
SELECT
    SUM(CASE WHEN naechste_wiederholung = '0000-00-00' THEN 1 ELSE 0 END) AS nulldaten_verbleibend,
    SUM(CASE WHEN naechste_wiederholung <= CURDATE()   THEN 1 ELSE 0 END) AS noch_faellig_verbleibend,
    SUM(CASE WHEN intervall_tage > 365                 THEN 1 ELSE 0 END) AS ueberlang_verbleibend,
    SUM(CASE WHEN leichtigkeitsfaktor > 5.0            THEN 1 ELSE 0 END) AS ef_zu_hoch_verbleibend
FROM fortschritt
WHERE id IN (SELECT id FROM _backup_fortschritt_srs_overflow);

-- Wie sehen Lucias vorher-stuck Einträge danach aus?
SELECT b.benutzername, v.schwedisch, f.stufe,
    f.intervall_tage, f.leichtigkeitsfaktor,
    f.naechste_wiederholung, f.aktualisiert_am
FROM fortschritt f
JOIN benutzer b ON b.id = f.benutzer_id
JOIN vokabeln v ON v.id = f.vokabel_id
WHERE f.benutzer_id = 4 AND f.stufe = 6 AND f.richtung = 'DS'
  AND f.naechste_wiederholung > CURDATE()
ORDER BY f.naechste_wiederholung DESC
LIMIT 10;

-- *** ROLLBACK zum Testen — durch COMMIT ersetzen wenn Ergebnis stimmt! ***
ROLLBACK;
-- COMMIT;
