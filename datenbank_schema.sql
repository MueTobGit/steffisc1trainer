-- ============================================================
-- Steffis C1-Trainer — Datenbankschema
-- 18 Tabellen + Seed-Daten
-- Kompatibel mit: MariaDB 10.4+, MySQL 8+
-- ============================================================
--
-- WICHTIG: CREATE DATABASE und USE sind hier auskommentiert.
-- Beim Hoster existiert die Datenbank bereits.
-- Lokal (XAMPP): Die zwei Zeilen einkommentieren und ausfuehren,
-- oder die Datenbank vorher manuell in phpMyAdmin anlegen.
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Lokal (XAMPP): Datenbank anlegen + auswaehlen.
-- Hoster: Diese zwei Zeilen auskommentiert lassen!
-- CREATE DATABASE IF NOT EXISTS SteffisC1Trainer
--     CHARACTER SET utf8mb4
--     COLLATE utf8mb4_unicode_ci;
-- USE SteffisC1Trainer;

-- ============================================================
-- 1. benutzer — Nutzerverwaltung
-- ============================================================
DROP TABLE IF EXISTS benutzer;
CREATE TABLE benutzer (
    id INT AUTO_INCREMENT PRIMARY KEY,
    benutzername VARCHAR(64) NOT NULL UNIQUE,
    passwort_hash VARCHAR(255) NOT NULL,
    vorname VARCHAR(64),
    nachname VARCHAR(64),
    email VARCHAR(128) UNIQUE,
    spitzname VARCHAR(64),
    rolle ENUM('admin','benutzer') DEFAULT 'benutzer',
    aktiv BOOLEAN DEFAULT TRUE,
    letzter_login DATETIME NULL,
    neue_vokabeln_pro_tag SMALLINT NOT NULL DEFAULT 10 COMMENT '0 = unbegrenzt',
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. api_tokens
-- ============================================================
DROP TABLE IF EXISTS api_tokens;
CREATE TABLE api_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    benutzer_id INT NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    geraet VARCHAR(255),
    aktiv BOOLEAN DEFAULT TRUE,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    gueltig_bis DATETIME NOT NULL,
    FOREIGN KEY (benutzer_id) REFERENCES benutzer(id) ON DELETE CASCADE,
    INDEX idx_token (token),
    INDEX idx_benutzer (benutzer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. kategorien — Kurse / Lehrwerke
-- ============================================================
DROP TABLE IF EXISTS kategorien;
CREATE TABLE kategorien (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    beschreibung TEXT,
    eltern_id INT NULL,
    reihenfolge INT DEFAULT 0,
    aktiv BOOLEAN DEFAULT TRUE,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (eltern_id) REFERENCES kategorien(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. vokabeln — Kernbereich (Englisch-Deutsch)
-- ============================================================
DROP TABLE IF EXISTS vokabeln;
CREATE TABLE vokabeln (
    id INT AUTO_INCREMENT PRIMARY KEY,
    englisch VARCHAR(128) NOT NULL,
    deutsch VARCHAR(256) NOT NULL,
    wortart ENUM('Nomen','Verb','Adjektiv','Adverb','Pronomen',
                 'Praeposition','Konjunktion','Interjektion','Phrase','Idiom','Sonstiges') NOT NULL,
    sprachniveau ENUM('A1','A2','B1','B2','C1','C2') DEFAULT 'C1',
    notizen TEXT,
    kategorie_id INT NULL,
    aktiv BOOLEAN DEFAULT TRUE,
    ist_privat BOOLEAN NOT NULL DEFAULT FALSE,
    besitzer_id INT NULL,
    erstellt_von INT NULL,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    aktualisiert_am DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (kategorie_id) REFERENCES kategorien(id) ON DELETE SET NULL,
    FOREIGN KEY (erstellt_von) REFERENCES benutzer(id) ON DELETE SET NULL,
    FOREIGN KEY (besitzer_id) REFERENCES benutzer(id) ON DELETE CASCADE,
    INDEX idx_englisch (englisch),
    INDEX idx_deutsch (deutsch),
    INDEX idx_wortart (wortart),
    INDEX idx_kategorie (kategorie_id),
    INDEX idx_privat (ist_privat, besitzer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. synonyme
-- ============================================================
DROP TABLE IF EXISTS synonyme;
CREATE TABLE synonyme (
    id INT AUTO_INCREMENT PRIMARY KEY,
    vokabel_id INT NOT NULL,
    synonym VARCHAR(128) NOT NULL,
    sprache ENUM('en','de') NOT NULL DEFAULT 'en',
    FOREIGN KEY (vokabel_id) REFERENCES vokabeln(id) ON DELETE CASCADE,
    INDEX idx_vokabel (vokabel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. saetze — Beispielsaetze mit Luecke (Grundform)
-- ============================================================
DROP TABLE IF EXISTS saetze;
CREATE TABLE saetze (
    id INT AUTO_INCREMENT PRIMARY KEY,
    vokabel_id INT NOT NULL,
    englisch_satz TEXT NOT NULL,
    deutsch_satz TEXT NOT NULL,
    benoetigte_form VARCHAR(128) NOT NULL,
    sprachniveau ENUM('A1','A2','B1','B2','C1','C2') DEFAULT 'C1',
    aktiv BOOLEAN DEFAULT TRUE,
    ist_privat BOOLEAN NOT NULL DEFAULT FALSE,
    besitzer_id INT NULL,
    erstellt_von INT NULL,
    aktualisiert_am DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (vokabel_id) REFERENCES vokabeln(id) ON DELETE CASCADE,
    FOREIGN KEY (erstellt_von) REFERENCES benutzer(id) ON DELETE SET NULL,
    FOREIGN KEY (besitzer_id) REFERENCES benutzer(id) ON DELETE CASCADE,
    INDEX idx_vokabel (vokabel_id),
    INDEX idx_privat (ist_privat, besitzer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7. themenfelder — m:n mit vokabeln moeglich
-- ============================================================
DROP TABLE IF EXISTS themenfelder;
CREATE TABLE themenfelder (
    id INT AUTO_INCREMENT PRIMARY KEY,
    titel VARCHAR(200) NOT NULL,
    beschreibung TEXT,
    kategorie_id INT NULL,
    reihenfolge INT DEFAULT 0,
    sprachniveau ENUM('A1','A2','B1','B2','C1','C2') DEFAULT 'C1',
    aktiv BOOLEAN DEFAULT TRUE,
    ist_privat BOOLEAN NOT NULL DEFAULT FALSE,
    besitzer_id INT NULL,
    erstellt_von INT NULL,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (kategorie_id) REFERENCES kategorien(id) ON DELETE SET NULL,
    FOREIGN KEY (erstellt_von) REFERENCES benutzer(id) ON DELETE SET NULL,
    FOREIGN KEY (besitzer_id) REFERENCES benutzer(id) ON DELETE CASCADE,
    INDEX idx_privat (ist_privat, besitzer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 8. themenfeld_vokabeln — eine Vokabel kann in mehreren Themenfeldern sein
-- ============================================================
DROP TABLE IF EXISTS themenfeld_vokabeln;
CREATE TABLE themenfeld_vokabeln (
    id INT AUTO_INCREMENT PRIMARY KEY,
    themenfeld_id INT NOT NULL,
    vokabel_id INT NOT NULL,
    reihenfolge INT DEFAULT 0,
    hinzugefuegt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (themenfeld_id) REFERENCES themenfelder(id) ON DELETE CASCADE,
    FOREIGN KEY (vokabel_id) REFERENCES vokabeln(id) ON DELETE CASCADE,
    UNIQUE (themenfeld_id, vokabel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 9. benutzer_favoriten
-- ============================================================
DROP TABLE IF EXISTS benutzer_favoriten;
CREATE TABLE benutzer_favoriten (
    id INT AUTO_INCREMENT PRIMARY KEY,
    benutzer_id INT NOT NULL,
    vokabel_id INT NOT NULL,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (benutzer_id) REFERENCES benutzer(id) ON DELETE CASCADE,
    FOREIGN KEY (vokabel_id) REFERENCES vokabeln(id) ON DELETE CASCADE,
    UNIQUE (benutzer_id, vokabel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 10. fortschritt — Lernstand pro Nutzer/Vokabel/Richtung (SM-2)
-- ED = Englisch -> Deutsch, DE = Deutsch -> Englisch
-- ============================================================
DROP TABLE IF EXISTS fortschritt;
CREATE TABLE fortschritt (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    benutzer_id INT NOT NULL,
    vokabel_id INT NOT NULL,
    richtung ENUM('ED','DE') NOT NULL,
    stufe TINYINT DEFAULT 0,
    zustand ENUM('neu','lernen','wiederholung','gelernt') DEFAULT 'neu',
    punkte INT DEFAULT 0,
    leichtigkeitsfaktor FLOAT DEFAULT 2.5,
    wiederholungen INT DEFAULT 0,
    intervall_tage INT DEFAULT 0,
    naechste_wiederholung DATE NULL,
    richtig_gesamt INT DEFAULT 0,
    falsch_gesamt INT DEFAULT 0,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    aktualisiert_am DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (benutzer_id) REFERENCES benutzer(id) ON DELETE CASCADE,
    FOREIGN KEY (vokabel_id) REFERENCES vokabeln(id) ON DELETE CASCADE,
    UNIQUE (benutzer_id, vokabel_id, richtung),
    INDEX idx_naechste (naechste_wiederholung),
    INDEX idx_zustand (zustand),
    INDEX idx_erstellt (benutzer_id, erstellt_am)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 11. abfrage_gewichte
-- ============================================================
DROP TABLE IF EXISTS abfrage_gewichte;
CREATE TABLE abfrage_gewichte (
    id INT AUTO_INCREMENT PRIMARY KEY,
    stufe TINYINT NOT NULL UNIQUE,
    gewicht FLOAT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO abfrage_gewichte (stufe, gewicht) VALUES
(0, 0), (1, 50), (2, 35), (3, 20), (4, 12), (5, 8), (6, 5);

-- ============================================================
-- 12. benutzer_statistik
-- ============================================================
DROP TABLE IF EXISTS benutzer_statistik;
CREATE TABLE benutzer_statistik (
    benutzer_id INT PRIMARY KEY,
    letztes_training DATE NULL,
    gesamt_trainings INT DEFAULT 0,
    gesamt_vokabeln_gelernt INT DEFAULT 0,
    FOREIGN KEY (benutzer_id) REFERENCES benutzer(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 13. aktivitaeten — Activity Log (60 Tage Aufbewahrung)
-- ============================================================
DROP TABLE IF EXISTS aktivitaeten;
CREATE TABLE aktivitaeten (
    id INT AUTO_INCREMENT PRIMARY KEY,
    benutzer_id INT NOT NULL,
    typ ENUM('training','login','admin_aktion') NOT NULL,
    beschreibung VARCHAR(500),
    details_json JSON NULL,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (benutzer_id) REFERENCES benutzer(id) ON DELETE CASCADE,
    INDEX idx_benutzer_zeit (benutzer_id, erstellt_am),
    INDEX idx_typ (typ)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 14. trainings_sitzungen
-- ============================================================
DROP TABLE IF EXISTS trainings_sitzungen;
CREATE TABLE trainings_sitzungen (
    id INT AUTO_INCREMENT PRIMARY KEY,
    benutzer_id INT NOT NULL,
    begonnen_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    beendet_am DATETIME NULL,
    anzahl_fragen INT DEFAULT 0,
    anzahl_richtig INT DEFAULT 0,
    typ ENUM('vokabel','satz','gemischt','schnell') DEFAULT 'gemischt',
    FOREIGN KEY (benutzer_id) REFERENCES benutzer(id) ON DELETE CASCADE,
    INDEX idx_benutzer_zeit (benutzer_id, begonnen_am)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 15. benutzer_themenfelder_gestartet
-- ============================================================
DROP TABLE IF EXISTS benutzer_themenfelder_gestartet;
CREATE TABLE benutzer_themenfelder_gestartet (
    benutzer_id INT NOT NULL,
    themenfeld_id INT NOT NULL,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (benutzer_id, themenfeld_id),
    FOREIGN KEY (benutzer_id) REFERENCES benutzer(id) ON DELETE CASCADE,
    FOREIGN KEY (themenfeld_id) REFERENCES themenfelder(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 16. app_konfiguration
-- ============================================================
DROP TABLE IF EXISTS app_konfiguration;
CREATE TABLE app_konfiguration (
    id INT AUTO_INCREMENT PRIMARY KEY,
    schluessel VARCHAR(64) NOT NULL UNIQUE,
    wert VARCHAR(255),
    beschreibung TEXT,
    aktualisiert_am DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO app_konfiguration (schluessel, wert, beschreibung) VALUES
('bewertung_modus',               'normal',       'strict = exakte Gross/Klein, normal = case-insensitive'),
('token_gueltig_tage',            '90',           'API-Token Gueltigkeit in Tagen'),
('neue_vokabeln_pro_tag',         '10',           'Standard neue Vokabeln pro Trainings-Tag (0 = unbegrenzt)'),
('standard_richtung',             'DE',           'Standard-Abfragerichtung: DE (Deutsch->Englisch) oder ED (Englisch->Deutsch)'),
('aktivitaeten_aufbewahrung_tage','60',           'Alte Aktivitaeten nach X Tagen loeschen'),
('backup_max_anzahl',             '10',           'Maximale Anzahl vorzuhaltender Backups (1-30)'),
('backup_auto_intervall',         'deaktiviert',  'Automatisches Backup-Intervall: deaktiviert | taeglich | woechentlich'),
('backup_letztes_auto',           '',             'Zeitstempel des letzten automatischen Backups (intern)'),
('max_private_vokabeln',          '2000',         'Maximale Anzahl privater Vokabeln pro Benutzer'),
('faellig_voraus_tage',           '0',            'Vokabeln gelten als faellig innerhalb dieser Anzahl Tage (0 = nur heute)'),
('gemischt_anteil_satz',          '25',           'Prozentualer Anteil von Satz-Fragen im Gemischt-Modus'),
('faellige_vokabeln_anteil',      '20',           'Anteil faelliger Vokabeln in Prozent die automatisch ins Training gemischt werden'),
('max_faellige_fuer_neue',        '30',           'Max. globale faellige Wiederholungen bevor keine neuen Vokabeln mehr eingefuehrt werden (0 = immer)'),
('trotzdem_richtig_limit',        '30',           'Max. Anteil Trotzdem-richtig-Nutzungen pro Training in Prozent'),
('gekonnt_schwelle',              '4',            'Ab welcher SM-2-Stufe gilt eine Vokabel als gekonnt (Standard: 4)'),
('wiederholt_stufe_schwelle',     '2',            'Mindest-SM-2-Stufe ab der eine Vokabel als Wiederholt zaehlt im Dashboard');

-- ============================================================
-- 17. app_texte — Grosse Freitexte
-- ============================================================
DROP TABLE IF EXISTS app_texte;
CREATE TABLE app_texte (
    schluessel VARCHAR(64) NOT NULL PRIMARY KEY,
    wert LONGTEXT NOT NULL DEFAULT '',
    aktualisiert_am DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO app_texte (schluessel, wert) VALUES
('system_titel',    'Steffis C1-Trainer'),
('betreiber_name',  ''),
('betreiber_email', ''),
('impressum_text',  ''),
('datenschutz_text','');

-- ============================================================
-- 18. Seed-Daten: Beispiel-Kategorie, Themenfeld, Vokabel
-- ============================================================

INSERT INTO kategorien (id, name, beschreibung, reihenfolge, aktiv) VALUES
(1, 'Advanced / Expert C1', 'C1 Englisch Vokabular fuer Fortgeschrittene', 1, TRUE);

INSERT INTO themenfelder (id, titel, beschreibung, kategorie_id, sprachniveau, reihenfolge, aktiv) VALUES
(1, 'House and Garden', 'Vokabular rund um Haus und Garten', 1, 'C1', 1, TRUE);

INSERT INTO vokabeln (id, englisch, deutsch, wortart, sprachniveau, kategorie_id, aktiv) VALUES
(1, 'house', 'das Haus', 'Nomen', 'C1', 1, TRUE);

INSERT INTO themenfeld_vokabeln (themenfeld_id, vokabel_id) VALUES (1, 1);

-- ============================================================
-- Benutzer anlegen
-- Admin:    Passwort Admin123!
-- Stefanie: Passwort Ratiplim2000
-- ============================================================
INSERT INTO benutzer (id, benutzername, passwort_hash, vorname, rolle, aktiv) VALUES
(1, 'Admin',    '$2y$12$95XE8I8VhPiUJLNjtLc/geFNEgeIus6WO41N1UR7ysPfi8D1TwDtO', 'Admin',    'admin', TRUE),
(2, 'Stefanie', '$2y$12$nGke3P4PJQ5kLqGE5qSjWOgcvy1rLLiucNJbicggsVzLND5lVk8Cy', 'Stefanie', 'admin', TRUE);

INSERT INTO benutzer_statistik (benutzer_id) VALUES (1), (2);

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- Passwort-Hashes generiert mit PHP password_hash(), cost=12
-- Admin=Admin123!, Stefanie=Ratiplim2000
-- ============================================================
