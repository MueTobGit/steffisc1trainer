<?php
/**
 * API: Admin — Backup-Datei hochladen
 *
 * POST /api/admin/backup_hochladen.php  (multipart/form-data)
 *
 * Nimmt eine .sql-Backup-Datei entgegen und legt sie im backups/-Verzeichnis ab.
 * Der Dateiname wird normalisiert auf das Standardformat:
 *   vokabeltrainer_YYYY-MM-DD_HH-MM-SS.sql
 *
 * Maximal 50 MB.
 * Nur Admin.
 *
 * Formular-Felder:
 *   - datei: Die .sql-Datei (file upload)
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/antwort_helfer.php';
require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__, 2) . '/konfiguration/konstanten.php';
require_once dirname(__DIR__, 2) . '/konfiguration/hilfsfunktionen.php';

// --- Methode pruefen ---
methode_erzwingen('POST');

// --- Authentifizierung + Autorisierung ---
$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

// --- Datei-Upload pruefen ---
if (empty($_FILES['datei']) || $_FILES['datei']['error'] !== UPLOAD_ERR_OK) {
    $upload_fehler = $_FILES['datei']['error'] ?? -1;
    fehler_ungueltige_eingabe("Keine Datei hochgeladen oder Upload-Fehler (Code: {$upload_fehler}).");
}

$datei = $_FILES['datei'];

// Groessen-Limit: 50 MB
$max_bytes = 50 * 1024 * 1024;
if ($datei['size'] > $max_bytes) {
    fehler_ungueltige_eingabe('Datei zu gross (maximal 50 MB).');
}

// Nur .sql-Dateien akzeptieren
$original_name = basename($datei['name']);
$endung = strtolower(pathinfo($original_name, PATHINFO_EXTENSION));
if ($endung !== 'sql') {
    fehler_ungueltige_eingabe('Nur .sql-Dateien sind erlaubt.');
}

// --- Inhalt pruefen: muss SQL-Statements enthalten ---
$inhalt_probe = file_get_contents($datei['tmp_name'], false, null, 0, 1024);
if ($inhalt_probe === false || strlen(trim($inhalt_probe)) < 10) {
    fehler_ungueltige_eingabe('Datei ist leer oder nicht lesbar.');
}

// Rudimentaere Pruefung: Enthaelt die Datei typische SQL-Keywords?
$inhalt_lower = strtolower($inhalt_probe);
$hat_sql = str_contains($inhalt_lower, 'create table')
        || str_contains($inhalt_lower, 'insert into')
        || str_contains($inhalt_lower, 'set names')
        || str_contains($inhalt_lower, 'drop table');
if (!$hat_sql) {
    fehler_ungueltige_eingabe('Datei scheint kein gueltiges SQL-Backup zu sein.');
}

// --- Backup-Verzeichnis ---
$backup_dir = BASIS_PFAD . '/backups';
if (!is_dir($backup_dir)) {
    if (!@mkdir($backup_dir, 0750, true)) {
        fehler_server('Backup-Verzeichnis konnte nicht erstellt werden.');
    }
    @file_put_contents($backup_dir . '/.htaccess', "Require all denied\n");
}

// --- Dateiname generieren ---
// Wenn der Originalname dem Standardformat entspricht, beibehalten.
// Sonst: neuen Zeitstempel-Namen vergeben.
if (preg_match('/^vokabeltrainer_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.sql$/', $original_name)) {
    $ziel_name = $original_name;
} else {
    $ziel_name = 'vokabeltrainer_' . date('Y-m-d_H-i-s') . '_upload.sql';
}

// Kollision vermeiden
$ziel_pfad = $backup_dir . '/' . $ziel_name;
$zaehler = 1;
while (file_exists($ziel_pfad)) {
    $name_ohne = pathinfo($ziel_name, PATHINFO_FILENAME);
    $ziel_pfad = $backup_dir . '/' . $name_ohne . '_' . $zaehler . '.sql';
    $zaehler++;
}
$ziel_name = basename($ziel_pfad);

// --- Datei verschieben ---
if (!move_uploaded_file($datei['tmp_name'], $ziel_pfad)) {
    fehler_server('Datei konnte nicht ins Backup-Verzeichnis verschoben werden.');
}

// --- Aktivitaet loggen ---
try {
    $pdo = db_verbindung();
    $stmt = $pdo->prepare("
        INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung, details_json)
        VALUES (?, 'admin_aktion', ?, ?)
    ");
    $stmt->execute([
        $benutzer['id'],
        "Backup-Datei hochgeladen: {$ziel_name}",
        json_encode([
            'dateiname'       => $ziel_name,
            'original_name'   => $original_name,
            'groesse_kb'      => round($datei['size'] / 1024, 1),
        ], JSON_UNESCAPED_UNICODE),
    ]);
} catch (\Throwable $e) {
    error_log('Backup-Upload-Logging-Fehler: ' . $e->getMessage());
}

json_erfolg([
    'dateiname'     => $ziel_name,
    'original_name' => $original_name,
    'groesse_kb'    => round(filesize($ziel_pfad) / 1024, 1),
], 'Backup-Datei erfolgreich hochgeladen.');
