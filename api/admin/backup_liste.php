<?php
/**
 * API: Admin — Backup-Liste
 *
 * GET /api/admin/backup_liste.php
 *
 * Liefert alle vorhandenen Backup-Dateien mit Metadaten.
 * Nur fuer Admins.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__, 2) . '/konfiguration/konstanten.php';
require_once dirname(__DIR__, 2) . '/konfiguration/hilfsfunktionen.php';

// --- Methode pruefen ---
methode_erzwingen('GET');

// --- Authentifizierung + Autorisierung ---
$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

$backup_dir = BASIS_PFAD . '/backups';

if (!is_dir($backup_dir)) {
    json_erfolg([
        'backups'     => [],
        'max_backups' => (int) konfig_wert('backup_max_anzahl', '10'),
    ]);
}

// --- Dateien einlesen ---
$dateien = glob($backup_dir . '/vokabeltrainer_*.sql') ?: [];
usort($dateien, fn($a, $b) => filemtime($b) <=> filemtime($a)); // neueste zuerst

$pdo        = db_verbindung();
$backups    = [];
foreach ($dateien as $pfad) {
    $name    = basename($pfad);
    $groesse = filesize($pfad);
    $zeit    = filemtime($pfad);

    $backups[] = [
        'dateiname'   => $name,
        'groesse_kb'  => round($groesse / 1024, 1),
        'erstellt_am' => date('Y-m-d H:i:s', $zeit),
    ];
}

json_erfolg([
    'backups'     => $backups,
    'max_backups' => (int) konfig_wert('backup_max_anzahl', '10'),
]);
