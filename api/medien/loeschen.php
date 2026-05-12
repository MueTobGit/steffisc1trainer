<?php
/**
 * API: Medien — Loeschen
 *
 * DELETE /api/medien/loeschen.php?id=X
 *
 * Hard-Delete: Datei + DB-Eintrag entfernen.
 * Nur Admin.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

// --- Methode pruefen ---
methode_erzwingen('DELETE');

// --- Authentifizierung + Autorisierung ---
$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

// --- ID ermitteln ---
$id = get_param_int('id');
if ($id < 1) {
    fehler_ungueltige_eingabe('Medien-ID ist erforderlich.');
}

// --- Medium laden ---
$medium = id_existiert($id, 'medien', 'Medium');

$pdo = db_verbindung();

// --- Referenzen pruefen ---
// Warnung wenn Medium noch irgendwo verknuepft ist
$referenzen = 0;

$tabellen = [
    ['vokabeln', 'media_id'],
    ['vokabel_formen', 'media_id'],
    ['saetze', 'media_id'],
    ['kategorien', 'media_id'],
    ['gruppen', 'media_id'],
    ['benutzer', 'media_id'],
];

foreach ($tabellen as [$tabelle, $spalte]) {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM {$tabelle} WHERE {$spalte} = ?");
    $stmt->execute([$id]);
    $referenzen += (int) $stmt->fetchColumn();
}

// --- Datei loeschen ---
$datei_pfad = OEFFENTLICH_PFAD . '/' . $medium['dateipfad'];
$datei_geloescht = false;

if (file_exists($datei_pfad)) {
    $datei_geloescht = unlink($datei_pfad);
    if (!$datei_geloescht) {
        error_log("Medien-Datei konnte nicht geloescht werden: {$datei_pfad}");
    }
} else {
    error_log("Medien-Datei nicht gefunden: {$datei_pfad}");
}

// --- DB-Eintrag loeschen ---
// FK-Referenzen werden durch ON DELETE SET NULL behandelt
$stmt = $pdo->prepare('DELETE FROM medien WHERE id = ?');
$stmt->execute([$id]);

json_erfolg([
    'id' => $id,
    'datei_geloescht' => $datei_geloescht,
    'referenzen_bereinigt' => $referenzen,
], 'Medium erfolgreich geloescht.');
