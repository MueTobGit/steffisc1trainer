<?php
/**
 * API: Admin — Datenbank-Backup erstellen
 *
 * POST /api/admin/backup_ausfuehren.php
 *
 * Erstellt ein vollstaendiges SQL-Dump der Datenbank als Backup-Datei
 * im Backup-Verzeichnis. Verwaltet rollierende Backups (max. Anzahl konfigurierbar).
 *
 * Body (optional):
 *   - modus: 'speichern' (Standard) — Datei serverseitig ablegen, JSON-Antwort
 *
 * Backup-Pfad: BASIS_PFAD/backups/
 * Dateiname:   vokabeltrainer_YYYY-MM-DD_HH-MM-SS.sql
 */

declare(strict_types=1);

// Output-Buffer sofort starten: verhindert dass PHP-Warnings/Notices
// den JSON-Response korrumpieren
ob_start();

require_once dirname(__DIR__) . '/_middleware/antwort_helfer.php';
require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__, 2) . '/konfiguration/konstanten.php';
require_once dirname(__DIR__, 2) . '/konfiguration/hilfsfunktionen.php';

// PHP-Warnings/Notices loggen aber nicht ausgeben
set_error_handler(function (int $errno, string $errstr): bool {
    error_log("backup_ausfuehren.php [{$errno}]: {$errstr}");
    return true;
});

// --- Methode pruefen ---
methode_erzwingen('POST');

// --- Authentifizierung + Autorisierung ---
$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

// --- Body lesen (nicht-pflicht: leerer Body ist OK, modus hat Default-Wert) ---
$daten = json_body_lesen(false);
$modus = isset($daten['modus']) ? (string) $daten['modus'] : 'speichern';

// --- Backup-Verzeichnis anlegen ---
$backup_dir = BASIS_PFAD . '/backups';
if (!is_dir($backup_dir)) {
    if (!@mkdir($backup_dir, 0750, true)) {
        ob_end_clean();
        fehler_server('Backup-Verzeichnis konnte nicht erstellt werden.');
    }
    // Direkten Web-Zugriff sperren
    @file_put_contents($backup_dir . '/.htaccess', "Require all denied\n");
}

// --- Konfiguration laden ---
$pdo         = db_verbindung();
$max_backups = (int) konfig_wert('backup_max_anzahl', '10');
$max_backups = max(1, min(30, $max_backups));

// --- Ressourcen-Limits temporaer erhoehen ---
@ini_set('memory_limit', '256M');
@set_time_limit(120);

// --- SQL-Dump erstellen (stream-basiert: kein vollstaendiger String im Speicher) ---
$zeitstempel = date('Y-m-d_H-i-s');
$dateiname   = "vokabeltrainer_{$zeitstempel}.sql";
$dateipfad   = $backup_dir . '/' . $dateiname;

$fp = @fopen($dateipfad, 'w');
if ($fp === false) {
    ob_end_clean();
    restore_error_handler();
    fehler_server('Backup-Datei konnte nicht geoeffnet werden. Bitte Schreibrechte im backups/-Ordner pruefen.');
}

try {
    _backup_datenbank_dump($pdo, $fp);
} catch (\Throwable $e) {
    fclose($fp);
    @unlink($dateipfad);
    error_log('Backup-Dump-Fehler: ' . $e->getMessage());
    ob_end_clean();
    restore_error_handler();
    fehler_server('Datenbank-Dump fehlgeschlagen: ' . $e->getMessage());
}

fclose($fp);
$bytes = @filesize($dateipfad);

if ($bytes === false || $bytes < 50) {
    @unlink($dateipfad);
    ob_end_clean();
    restore_error_handler();
    fehler_server('Datenbank-Dump ist leer oder ungueltig.');
}

// --- Rollierende Backups: aelteste loeschen wenn Limit ueberschritten ---
$alle_backups = glob($backup_dir . '/vokabeltrainer_*.sql') ?: [];
if (!empty($alle_backups)) {
    usort($alle_backups, static fn($a, $b) => filemtime($a) <=> filemtime($b));
    while (count($alle_backups) > $max_backups) {
        @unlink(array_shift($alle_backups));
    }
}

// --- Aktivitaet loggen ---
try {
    $stmt = $pdo->prepare("
        INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung, details_json)
        VALUES (?, 'admin_aktion', ?, ?)
    ");
    $stmt->execute([
        $benutzer['id'],
        "Datenbank-Backup erstellt: {$dateiname}",
        json_encode(['dateiname' => $dateiname, 'groesse' => $bytes], JSON_UNESCAPED_UNICODE),
    ]);
} catch (\Throwable $e) {
    error_log('Backup-Logging-Fehler: ' . $e->getMessage());
}

// --- Unerwuenschte Ausgaben verwerfen, saubere JSON-Antwort senden ---
ob_end_clean();
restore_error_handler();

json_erfolg([
    'dateiname'   => $dateiname,
    'groesse_kb'  => round($bytes / 1024, 1),
    'zeitstempel' => $zeitstempel,
], 'Backup erfolgreich erstellt.');

// ============================================================
// Hilfsfunktion: SQL-Dump (pure PHP, kein mysqldump)
// ============================================================

/**
 * Vollstaendigen SQL-Dump stream-basiert in ein Dateihandle schreiben.
 *
 * Kein vollstaendiger String im Speicher: jeder Block wird sofort per fwrite()
 * in die Datei geschrieben. Auch grosse Datenbanken (>100 MB) bleiben stabil.
 *
 * @param resource $fp Offenes Dateihandle (beschreibbar)
 * @throws \RuntimeException bei PDO-Fehlern
 */
function _backup_datenbank_dump(\PDO $pdo, $fp): void
{
    $w = static fn(string $s) => fwrite($fp, $s);

    $w("-- Vokabeltrainer Datenbank-Backup\n");
    $w("-- Erstellt:   " . date('Y-m-d H:i:s') . "\n");
    $w("-- Datenbank:  " . DB_NAME . "\n");
    $w("-- =====================================================\n\n");
    $w("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;\n");
    // SQL-Mode normalisieren: NO_BACKSLASH_ESCAPES vom Quell-Server darf den
    // Import nicht beeinflussen; Backslash-Escaping muss beim Restore aktiv sein.
    $w("SET @ALTE_SQL_MODE=@@SQL_MODE, sql_mode='NO_AUTO_VALUE_ON_ZERO';\n");
    $w("SET FOREIGN_KEY_CHECKS = 0;\n\n");

    // Alle Tabellen ermitteln
    $tabellen = $pdo->query("SHOW TABLES")->fetchAll(\PDO::FETCH_COLUMN);

    foreach ($tabellen as $tabelle) {
        // CREATE TABLE Statement holen und fuer MariaDB-Kompatibilitaet anpassen
        $row = $pdo->query("SHOW CREATE TABLE `{$tabelle}`")->fetch(\PDO::FETCH_NUM);
        if (!$row) {
            continue;
        }

        $w("-- ---------------------------------------------------\n");
        $w("-- Tabelle: `{$tabelle}`\n");
        $w("-- ---------------------------------------------------\n");
        $w("DROP TABLE IF EXISTS `{$tabelle}`;\n");
        $w(_create_table_mariadb_kompatibel($row[1]) . ";\n\n");

        // Anzahl Zeilen pruefen
        $anzahl = (int) $pdo->query("SELECT COUNT(*) FROM `{$tabelle}`")->fetchColumn();
        if ($anzahl === 0) {
            continue;
        }

        // Spaltentypen fuer numerische Erkennung laden
        $numerische_spalten = [];
        foreach ($pdo->query("SHOW COLUMNS FROM `{$tabelle}`")->fetchAll() as $col) {
            if (preg_match('/^(tinyint|smallint|mediumint|int|bigint|float|double|decimal|numeric|bit)\b/i', $col['Type'])) {
                $numerische_spalten[$col['Field']] = true;
            }
        }

        $spalten_namen = array_keys($pdo->query("SELECT * FROM `{$tabelle}` LIMIT 1")->fetch(\PDO::FETCH_ASSOC) ?: []);
        if (empty($spalten_namen)) {
            continue;
        }
        $spalten_sql  = '`' . implode('`, `', $spalten_namen) . '`';
        $order_spalte = in_array('id', $spalten_namen, true) ? '`id`' : '`' . $spalten_namen[0] . '`';

        // Daten in Bloecken lesen und direkt schreiben
        $block_groesse = 200;
        $offset        = 0;

        while ($offset < $anzahl) {
            $zeilen = $pdo->query(
                "SELECT * FROM `{$tabelle}` ORDER BY {$order_spalte} ASC LIMIT {$block_groesse} OFFSET {$offset}"
            )->fetchAll(\PDO::FETCH_ASSOC);

            if (empty($zeilen)) {
                break;
            }

            $w("INSERT INTO `{$tabelle}` ({$spalten_sql}) VALUES\n");

            $werte_zeilen = [];
            foreach ($zeilen as $zeile) {
                $werte = [];
                foreach ($zeile as $spalte => $wert) {
                    if ($wert === null) {
                        $werte[] = 'NULL';
                    } elseif ($numerische_spalten[$spalte] ?? false) {
                        $werte[] = (string) $wert;
                    } else {
                        $werte[] = _sql_string_escapen((string) $wert);
                    }
                }
                $werte_zeilen[] = '(' . implode(', ', $werte) . ')';
            }

            $w(implode(",\n", $werte_zeilen) . ";\n\n");
            $offset += $block_groesse;
        }
    }

    $w("SET FOREIGN_KEY_CHECKS = 1;\n");
    $w("SET sql_mode=@ALTE_SQL_MODE;\n");
    $w("-- Ende des Backups\n");
}

/**
 * String-Wert SQL-sicher escapen — identisch zu mysqldump-Ausgabe.
 *
 * Backslash-Escaping funktioniert beim Restore, weil der Dump-Header
 * sql_mode ohne NO_BACKSLASH_ESCAPES setzt. PDO::quote() wird bewusst
 * nicht verwendet: es haengt vom sql_mode des Quell-Servers ab und
 * liefert bei NO_BACKSLASH_ESCAPES inkonsistente Ergebnisse.
 */
function _sql_string_escapen(string $wert): string
{
    return "'" . str_replace(
        ['\\',    "\0",   "\n",   "\r",   "'",    "\x1a"],
        ['\\\\',  '\\0',  '\\n',  '\\r',  "\\'",  '\\Z'],
        $wert
    ) . "'";
}

/**
 * SHOW-CREATE-TABLE-Ausgabe von MySQL 8.0 fuer MariaDB anpassen.
 *
 * MySQL 8 und MariaDB unterscheiden sich in Kollationsnamen, DEFAULT-Syntax
 * und einzelnen Schluesseln. Diese Funktion glaettet die bekannten Differenzen.
 */
function _create_table_mariadb_kompatibel(string $sql): string
{
    // MySQL-8-Kollationen → MariaDB-aequivalente
    $sql = str_replace(
        ['utf8mb4_0900_ai_ci', 'utf8mb4_0900_as_ci', 'utf8mb4_0900_as_cs',
         'utf8_general_ci',    'utf8_unicode_ci'],
        ['utf8mb4_unicode_ci', 'utf8mb4_unicode_ci', 'utf8mb4_bin',
         'utf8mb4_unicode_ci', 'utf8mb4_unicode_ci'],
        $sql
    );

    // DEFAULT (expr) → DEFAULT expr  (MySQL 8 klammert Ausdruecke, MariaDB nicht)
    $sql = preg_replace('/\bDEFAULT \(NULL\)/',              'DEFAULT NULL',              $sql) ?? $sql;
    $sql = preg_replace('/\bDEFAULT \(CURRENT_TIMESTAMP\)/', 'DEFAULT CURRENT_TIMESTAMP', $sql) ?? $sql;
    $sql = preg_replace('/\bDEFAULT \((\d+)\)/',             'DEFAULT $1',                $sql) ?? $sql;

    // VISIBLE-Schluessel entfernen (MySQL 8.0.23+, unbekannt in MariaDB)
    $sql = preg_replace('/\s+VISIBLE\b/', '', $sql) ?? $sql;

    return $sql;
}
