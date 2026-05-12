<?php
/**
 * API: Admin — Datenbankverbindung testen
 *
 * POST /api/admin/db_testen.php
 *
 * Testet eine Datenbankverbindung mit den uebergebenen Zugangsdaten.
 * Erstellt KEINE permanente Verbindung (kein Singleton).
 *
 * Body: {
 *   "host":     "localhost",
 *   "name":     "vokabeltrainer",
 *   "user":     "root",
 *   "passwort": "...",    // leer = aktuelles Passwort behalten
 *   "charset":  "utf8mb4"
 * }
 *
 * Nur fuer Admins.
 */

declare(strict_types=1);

ob_start();

require_once dirname(__DIR__) . '/_middleware/antwort_helfer.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__, 2) . '/konfiguration/konstanten.php';
require_once dirname(__DIR__, 2) . '/konfiguration/datenbank.php';

methode_erzwingen('POST');

$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

$daten = json_body_lesen(true);

// Pflichtfelder
$host    = trim($daten['host']    ?? '');
$name    = trim($daten['name']    ?? '');
$user    = trim($daten['user']    ?? '');
$charset = trim($daten['charset'] ?? 'utf8mb4') ?: 'utf8mb4';

// Passwort: wenn leer oder Platzhalter → aktuell konfiguriertes nutzen
$pass_roh = $daten['passwort'] ?? '';
if (in_array($pass_roh, ['', '__GESETZT__', '__UNVERAENDERT__'], true)) {
    $pass = defined('DB_PASS') ? DB_PASS : '';
} else {
    $pass = (string) $pass_roh;
}

if ($host === '') {
    ob_end_clean();
    json_fehler('UNGUELTIGE_EINGABE', 'DB_HOST darf nicht leer sein.');
}
if ($name === '') {
    ob_end_clean();
    json_fehler('UNGUELTIGE_EINGABE', 'DB_NAME darf nicht leer sein.');
}

// Verbindungstest — NEUES PDO (kein Singleton!)
$dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s', $host, $name, $charset);

$optionen = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
    PDO::ATTR_TIMEOUT            => 5,
];

try {
    $test_pdo = new PDO($dsn, $user, $pass, $optionen);

    // Einfache Abfrage zur Verifikation
    $version = $test_pdo->query('SELECT VERSION() AS v')->fetchColumn();

    ob_end_clean();
    json_erfolg(
        [
            'server_version' => $version,
            'datenbank'      => $name,
            'host'           => $host,
        ],
        "Verbindung zu '{$name}' auf '{$host}' erfolgreich (MySQL {$version})."
    );

} catch (PDOException $e) {
    $msg = $e->getMessage();

    // Benutzerfreundliche Fehlermeldungen
    if (str_contains($msg, 'Access denied')) {
        $detail = "Zugriff verweigert — Benutzername oder Passwort falsch.";
    } elseif (str_contains($msg, 'Unknown database')) {
        $detail = "Datenbank '{$name}' existiert nicht.";
    } elseif (str_contains($msg, 'Connection refused') || str_contains($msg, "Can't connect")) {
        $detail = "Keine Verbindung zu '{$host}' moeglich — Host erreichbar?";
    } elseif (str_contains($msg, 'Unknown MySQL server host') || str_contains($msg, 'php_network_getaddresses')) {
        $detail = "Host '{$host}' nicht gefunden — Hostname pruefen.";
    } elseif (str_contains($msg, 'SQLSTATE[HY000] [2002]')) {
        $detail = "Verbindung abgelehnt — Laeuft der Datenbankserver?";
    } else {
        $detail = $msg;
    }

    ob_end_clean();
    json_fehler('DB_VERBINDUNGSFEHLER', $detail);

} catch (\Throwable $e) {
    ob_end_clean();
    json_fehler('DB_VERBINDUNGSFEHLER', 'Unerwarteter Fehler: ' . $e->getMessage());
}
