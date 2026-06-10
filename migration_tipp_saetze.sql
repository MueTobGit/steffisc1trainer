-- ============================================================
-- Migration: Tipp-Sätze (Nachtippen-Übungsmodus)
-- Neue Tabelle tipp_saetze — unabhängig von vokabelgebundenen saetze
-- ============================================================

CREATE TABLE IF NOT EXISTS tipp_saetze (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    text            TEXT NOT NULL,
    themenfeld_id   INT NULL,
    aktiv           BOOLEAN NOT NULL DEFAULT TRUE,
    erstellt_am     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    erstellt_von    INT NULL,
    aktualisiert_am DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (themenfeld_id) REFERENCES themenfelder(id) ON DELETE SET NULL,
    FOREIGN KEY (erstellt_von)  REFERENCES benutzer(id)     ON DELETE SET NULL,
    INDEX idx_themenfeld (themenfeld_id),
    INDEX idx_aktiv      (aktiv)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
