<?php
/**
 * API: Admin — Datenbank-Backup wiederherstellen
 *
 * POST /api/admin/backup_wiederherstellen.php
 *
 * Stellt ein vorhandenes SQL-Backup wieder her.
 * Erstellt VOR der Wiederherstellung automatisch ein Sicherungs-Backup.
 *
 * Body (JSON):
 *   - dateiname:           String  (Backup-Dateiname aus backup_liste, oder Name einer hochgeladenen Datei)
 *   - inkl_konfiguration:  Boolean (Standard: false — app_konfiguration NICHT ueberschreiben)
 *
 * Sicherheit:
 *   - Strenge Dateinamen-Validierung (Regex)
 *   - Nur .sql-Dateien aus dem backups/-Verzeichnis
 *   - Automatisches Sicherungs-Backup vor Wiederherstellung
 *   - Nur Admin
 */

declare(strict_types=1);

// Output-Buffer: verhindert dass Warnings den JSON-Response korrumpieren
ob_start();

require_once dirname(__DIR__) . '/_middleware/antwort_helfer.php';
require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__, 2) . '/konfiguration/konstanten.php';
require_once dirname(__DIR__, 2) . '/konfiguration/hilfsfunktionen.php';

// Warnings loggen, nicht ausgeben
set_error_handler(function (int $errno, string $errstr): bool {
    error_log("backup_wiederherstellen.php [{$errno}]: {$errstr}");
    return true;
});

// --- Methode pruefen ---
methode_erzwingen('POST');

// --- Authentifizierung + Autorisierung ---
$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

// --- Body lesen ---
$daten = json_body_lesen();

$dateiname           = isset($daten['dateiname']) ? trim((string) $daten['dateiname']) : '';
$inkl_konfiguration  = !empty($daten['inkl_konfiguration']);

// --- Dateiname validieren ---
// Erlaubt: Standard-Format, _upload-Suffix, _vor_restore-Suffix, und optionaler _N Zaehler
if (!preg_match('/^vokabeltrainer_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(_upload|_vor_restore)?(_\d+)?\.sql$/', $dateiname)) {
    ob_end_clean();
    restore_error_handler();
    fehler_ungueltige_eingabe('Ungueltiger Dateiname.');
}

$backup_dir = BASIS_PFAD . '/backups';
$dateipfad  = $backup_dir . '/' . $dateiname;

if (!file_exists($dateipfad) || !is_file($dateipfad)) {
    ob_end_clean();
    restore_error_handler();
    fehler_nicht_gefunden('Backup-Datei nicht gefunden.');
}

// --- Ressourcen-Limits temporaer erhoehen ---
@ini_set('memory_limit', '512M');
@set_time_limit(300);

// --- Sicherungs-Backup VOR der Wiederherstellung erstellen ---
$pdo = db_verbindung();
$sicherung_dateiname = '';

try {
    $sicherung_sql = _sicherung_dump_erstellen($pdo);

    if (!empty($sicherung_sql) && strlen($sicherung_sql) > 50) {
        $sicherung_dateiname = 'vokabeltrainer_' . date('Y-m-d_H-i-s') . '_vor_restore.sql';
        $sicherung_pfad      = $backup_dir . '/' . $sicherung_dateiname;
        @file_put_contents($sicherung_pfad, $sicherung_sql);
        unset($sicherung_sql);
    }
} catch (\Throwable $e) {
    error_log('Sicherungs-Backup vor Restore fehlgeschlagen: ' . $e->getMessage());
    // Trotzdem fortfahren — der Admin hat sich bewusst entschieden
}

// --- SQL-Backup einlesen ---
$sql_inhalt = @file_get_contents($dateipfad);
if ($sql_inhalt === false || strlen($sql_inhalt) < 50) {
    ob_end_clean();
    restore_error_handler();
    fehler_server('Backup-Datei konnte nicht gelesen werden oder ist leer.');
}

// --- SQL-Statements parsen und ausfuehren ---
try {
    $statistik = _backup_einspielen($pdo, $sql_inhalt, $inkl_konfiguration);
} catch (\Throwable $e) {
    error_log('Backup-Wiederherstellung fehlgeschlagen: ' . $e->getMessage());
    ob_end_clean();
    restore_error_handler();
    fehler_server('Wiederherstellung fehlgeschlagen: ' . $e->getMessage());
}

unset($sql_inhalt);

// --- Aktivitaet loggen (die Tabelle existiert nach dem Restore hoffentlich noch) ---
try {
    // Gleiche PDO-Verbindung verwenden (Singleton), Tabellen existieren nach Restore
    $stmt = $pdo->prepare("
        INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung, details_json)
        VALUES (?, 'admin_aktion', ?, ?)
    ");
    $stmt->execute([
        $benutzer['id'],
        "Datenbank-Backup wiederhergestellt: {$dateiname}",
        json_encode([
            'dateiname'           => $dateiname,
            'inkl_konfiguration'  => $inkl_konfiguration,
            'sicherung'           => $sicherung_dateiname,
            'statistik'           => $statistik,
        ], JSON_UNESCAPED_UNICODE),
    ]);
} catch (\Throwable $e) {
    error_log('Restore-Logging-Fehler: ' . $e->getMessage());
}

// --- Antwort ---
ob_end_clean();
restore_error_handler();

json_erfolg([
    'dateiname'           => $dateiname,
    'sicherung_erstellt'  => $sicherung_dateiname,
    'inkl_konfiguration'  => $inkl_konfiguration,
    'statistik'           => $statistik,
], 'Backup erfolgreich wiederhergestellt.');


// ============================================================
// Hilfsfunktionen
// ============================================================

/**
 * Minimaler SQL-Dump fuer das Sicherungs-Backup (gleiche Logik wie backup_ausfuehren.php)
 */
function _sicherung_dump_erstellen(\PDO $pdo): string
{
    $buf  = "-- Sicherungs-Backup VOR Wiederherstellung\n";
    $buf .= "-- Erstellt: " . date('Y-m-d H:i:s') . "\n";
    $buf .= "-- =====================================================\n\n";
    $buf .= "SET NAMES utf8mb4;\n";
    $buf .= "SET FOREIGN_KEY_CHECKS = 0;\n\n";

    $tabellen = $pdo->query("SHOW TABLES")->fetchAll(\PDO::FETCH_COLUMN);

    foreach ($tabellen as $tabelle) {
        $row = $pdo->query("SHOW CREATE TABLE `{$tabelle}`")->fetch(\PDO::FETCH_NUM);
        if (!$row) continue;

        $buf .= "DROP TABLE IF EXISTS `{$tabelle}`;\n";
        $buf .= $row[1] . ";\n\n";

        $anzahl = (int) $pdo->query("SELECT COUNT(*) FROM `{$tabelle}`")->fetchColumn();
        if ($anzahl === 0) continue;

        $erste_zeile = $pdo->query("SELECT * FROM `{$tabelle}` LIMIT 1")->fetch(\PDO::FETCH_ASSOC);
        if (!$erste_zeile) continue;

        $spalten_namen = array_keys($erste_zeile);
        $spalten_sql   = '`' . implode('`, `', $spalten_namen) . '`';
        $order_spalte  = in_array('id', $spalten_namen, true) ? '`id`' : '`' . $spalten_namen[0] . '`';

        $offset = 0;
        while ($offset < $anzahl) {
            $zeilen = $pdo->query(
                "SELECT * FROM `{$tabelle}` ORDER BY {$order_spalte} ASC LIMIT 200 OFFSET {$offset}"
            )->fetchAll(\PDO::FETCH_ASSOC);

            if (empty($zeilen)) break;

            $buf .= "INSERT INTO `{$tabelle}` ({$spalten_sql}) VALUES\n";
            $werte_zeilen = [];
            foreach ($zeilen as $zeile) {
                $werte = array_map(static fn($w) => $w === null ? 'NULL' : $pdo->quote((string) $w), array_values($zeile));
                $werte_zeilen[] = '(' . implode(', ', $werte) . ')';
            }
            $buf   .= implode(",\n", $werte_zeilen) . ";\n\n";
            $offset += 200;
        }
    }

    $buf .= "SET FOREIGN_KEY_CHECKS = 1;\n";
    return $buf;
}

/**
 * SQL-Backup parsen und Statement fuer Statement ausfuehren.
 *
 * Wenn $inkl_konfiguration === false, werden alle Statements die
 * die Tabelle `app_konfiguration` betreffen uebersprungen (DROP, CREATE, INSERT).
 *
 * @return array Statistik (tabellen_erstellt, inserts, uebersprungen)
 */
function _backup_einspielen(\PDO $pdo, string $sql_inhalt, bool $inkl_konfiguration): array
{
    $statistik = [
        'tabellen_erstellt' => 0,
        'inserts'           => 0,
        'uebersprungen'     => 0,
        'fehler'            => [],
    ];

    // SQL in einzelne Statements aufteilen
    // Einfacher Parser: Splitten an ";\n" (Statement-Ende)
    // Beachtet keine Strings mit ;\n — aber unsere Backups escapen Werte mit quote()
    $statements = _sql_statements_parsen($sql_inhalt);

    // Konfigurationsschutz: Aktuelle Werte sichern falls noetig
    $konfig_backup = [];
    if (!$inkl_konfiguration) {
        try {
            $konfig_backup = $pdo->query("SELECT schluessel, wert FROM app_konfiguration")
                                 ->fetchAll(\PDO::FETCH_KEY_PAIR);
        } catch (\Throwable $e) {
            // Tabelle existiert evtl. nicht
        }
    }

    // FOREIGN_KEY_CHECKS deaktivieren
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");

    foreach ($statements as $stmt_sql) {
        $stmt_trimmed = trim($stmt_sql);
        if ($stmt_trimmed === '' || str_starts_with($stmt_trimmed, '--')) {
            continue;
        }

        // SET-Statements direkt ausfuehren
        if (preg_match('/^SET\s/i', $stmt_trimmed)) {
            try { $pdo->exec($stmt_trimmed); } catch (\Throwable $e) { /* ignorieren */ }
            continue;
        }

        // Konfigurationsschutz: app_konfiguration-Statements ueberspringen
        if (!$inkl_konfiguration && _betrifft_konfig_tabelle($stmt_trimmed)) {
            $statistik['uebersprungen']++;
            continue;
        }

        try {
            $pdo->exec($stmt_trimmed);

            if (preg_match('/^(DROP\s+TABLE|CREATE\s+TABLE)/i', $stmt_trimmed)) {
                $statistik['tabellen_erstellt']++;
            } elseif (preg_match('/^INSERT\s/i', $stmt_trimmed)) {
                $statistik['inserts']++;
            }
        } catch (\Throwable $e) {
            $kurz = mb_substr($stmt_trimmed, 0, 80);
            $statistik['fehler'][] = "{$kurz}… → " . $e->getMessage();
            error_log("Restore-SQL-Fehler: " . $e->getMessage() . " | Statement: " . mb_substr($stmt_trimmed, 0, 200));
        }
    }

    // Konfigurationsschutz: Falls Tabelle im Backup neu erstellt wurde (nicht uebersprungen),
    // aber wir die Konfig behalten wollten → alte Werte zurueckschreiben
    if (!$inkl_konfiguration && !empty($konfig_backup)) {
        try {
            // Pruefen ob die Tabelle existiert (wurde sie evtl. doch gedroppt?)
            $pdo->query("SELECT 1 FROM app_konfiguration LIMIT 1");
            // Tabelle existiert — Werte aktualisieren
            $stmt = $pdo->prepare("UPDATE app_konfiguration SET wert = ? WHERE schluessel = ?");
            foreach ($konfig_backup as $schluessel => $wert) {
                $stmt->execute([$wert, $schluessel]);
            }
        } catch (\Throwable $e) {
            // Tabelle wurde geloescht und nicht neu erstellt — Konfig verloren
            error_log('Konfig-Restore fehlgeschlagen: ' . $e->getMessage());
        }
    }

    // FOREIGN_KEY_CHECKS wieder aktivieren
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");

    return $statistik;
}

/**
 * Pruefen ob ein SQL-Statement die Tabelle app_konfiguration betrifft.
 */
function _betrifft_konfig_tabelle(string $sql): bool
{
    // DROP TABLE / CREATE TABLE / INSERT INTO app_konfiguration
    return (bool) preg_match('/\bapp_konfiguration\b/i', $sql);
}

/**
 * SQL-String in einzelne Statements aufteilen.
 *
 * Beruecksichtigt Strings in einfachen Anfuehrungszeichen.
 * Unterstuetzt beide gaengigen Escape-Stile:
 *   - Backslash-Escaping: \'  (MySQL/MariaDB-Standard, mysqldump-Ausgabe)
 *   - Verdopplung:        ''  (ANSI-SQL-Standard)
 */
function _sql_statements_parsen(string $sql): array
{
    $statements = [];
    $laenge     = strlen($sql);
    $aktuell    = '';
    $in_string  = false;
    $i          = 0;

    while ($i < $laenge) {
        $ch = $sql[$i];

        if ($in_string) {
            // Backslash-Escape: naechstes Zeichen blind uebernehmen (\' \\ \n ...)
            if ($ch === '\\' && ($i + 1) < $laenge) {
                $aktuell .= $ch . $sql[$i + 1];
                $i += 2;
                continue;
            }
            // Verdoppeltes Anführungszeichen: ''
            if ($ch === "'" && ($i + 1) < $laenge && $sql[$i + 1] === "'") {
                $aktuell .= "''";
                $i += 2;
                continue;
            }
            // String-Ende
            if ($ch === "'") {
                $in_string = false;
            }
            $aktuell .= $ch;
            $i++;
            continue;
        }

        // Kommentare ueberspringen (-- bis Zeilenende)
        if ($ch === '-' && ($i + 1) < $laenge && $sql[$i + 1] === '-') {
            $ende = strpos($sql, "\n", $i);
            if ($ende === false) break;
            $i = $ende + 1;
            continue;
        }

        if ($ch === "'") {
            $in_string = true;
            $aktuell .= $ch;
            $i++;
            continue;
        }

        if ($ch === ';') {
            $trimmed = trim($aktuell);
            if ($trimmed !== '') {
                $statements[] = $trimmed;
            }
            $aktuell = '';
            $i++;
            continue;
        }

        $aktuell .= $ch;
        $i++;
    }

    // Letztes Statement (ohne abschliessendes Semikolon)
    $trimmed = trim($aktuell);
    if ($trimmed !== '' && !str_starts_with($trimmed, '--')) {
        $statements[] = $trimmed;
    }

    return $statements;
}
