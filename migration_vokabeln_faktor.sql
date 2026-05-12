-- Migration: neue_vokabeln_bonus → neue_vokabeln_faktor
-- Statt Bonus (0/10/20) jetzt Faktor als Prozent (50/100/200/300)
-- 50 = Entspannt (halbe Voreinstellung)
-- 100 = Normal (Voreinstellung)
-- 200 = Intensiv (2x Voreinstellung)
-- 300 = Intensiv+ (3x Voreinstellung)

-- Neue Spalte anlegen
ALTER TABLE benutzer
    ADD COLUMN neue_vokabeln_faktor SMALLINT NOT NULL DEFAULT 100 AFTER neue_vokabeln_bonus;

-- Bestehende Bonus-Werte migrieren (0→100, 10→200, 20→300)
UPDATE benutzer SET neue_vokabeln_faktor = CASE
    WHEN neue_vokabeln_bonus = 0  THEN 100
    WHEN neue_vokabeln_bonus = 10 THEN 200
    WHEN neue_vokabeln_bonus = 20 THEN 300
    ELSE 100
END;

-- Alte Spalte entfernen (optional, nach Verifizierung)
-- ALTER TABLE benutzer DROP COLUMN neue_vokabeln_bonus;
