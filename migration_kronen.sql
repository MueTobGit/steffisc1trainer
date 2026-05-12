-- ============================================================
-- Migration: Liga-Kronen
-- Erstellt: 2026-03-30
--
-- Neue Tabelle: benutzer_kronen
-- Neue Belohnungen: liga_gold, liga_silber, liga_bronze
--
-- Kompatibel mit MariaDB (lokal) + MySQL 8.0 (Hoster).
-- ============================================================

-- ---- Tabelle benutzer_kronen ----
CREATE TABLE IF NOT EXISTS benutzer_kronen (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    benutzer_id INT NOT NULL,
    liga_id     INT NOT NULL,
    rang        TINYINT NOT NULL COMMENT '1=Goldene Krone, 2=Silberne Krone, 3=Lorbeerkranz',
    punkte      INT NOT NULL DEFAULT 0,
    vergeben_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (benutzer_id) REFERENCES benutzer(id) ON DELETE CASCADE,
    FOREIGN KEY (liga_id)     REFERENCES ligen(id)    ON DELETE CASCADE,
    UNIQUE KEY uq_benutzer_liga (benutzer_id, liga_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- Liga-Belohnungen ----
INSERT IGNORE INTO belohnungen (code, titel, beschreibung, typ, bedingung_json, xp_wert, reihenfolge) VALUES
('liga_gold',   'Goldene Krone',  'Platz 1 in einer Liga — unschlagbar!',    'meilenstein', '{"typ":"liga_rang","wert":1}', 500, 14),
('liga_silber', 'Silberne Krone', 'Platz 2 in einer Liga — fast ganz oben!', 'meilenstein', '{"typ":"liga_rang","wert":2}', 250, 15),
('liga_bronze', 'Lorbeerkranz',   'Platz 3 in einer Liga — beeindruckend!',  'meilenstein', '{"typ":"liga_rang","wert":3}', 100, 16);
