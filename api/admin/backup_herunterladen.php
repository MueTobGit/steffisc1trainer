<?php
/**
 * API: Admin — Backup herunterladen
 *
 * GET /api/admin/backup_herunterladen.php?datei=vokabeltrainer_2024-01-01_12-00-00.sql
 *
 * Liefert eine vorhandene Backup-Datei zum Download.
 * Strenge Dateinamen-Validierung zum Schutz vor Path-Traversal.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__, 2) . '/konfiguration/konstanten.php';

// --- Methode pruefen ---
methode_erzwingen('GET');

// --- Authentifizierung + Autorisierung ---
$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

// --- Dateiname validieren (streng: nur bekanntes Muster) ---
$datei = $_GET['datei'] ?? '';

if (!preg_match('/^vokabeltrainer_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(_upload|_vor_restore)?(_\d+)?\.sql$/', $datei)) {
    fehler_ungueltige_eingabe('Ungueltiger Dateiname.');
}

$backup_dir = BASIS_PFAD . '/backups';
$pfad       = $backup_dir . '/' . $datei;

if (!file_exists($pfad) || !is_file($pfad)) {
    fehler_nicht_gefunden('Backup-Datei nicht gefunden.');
}

// --- Datei ausliefern ---
while (ob_get_level()) ob_end_clean();

header('Content-Type: application/octet-stream');
header('Content-Disposition: attachment; filename="' . $datei . '"');
header('Content-Length: ' . filesize($pfad));
header('Cache-Control: no-cache, no-store, must-revalidate');

readfile($pfad);
exit;
