<?php
/**
 * API: Profil — Avatar löschen
 *
 * DELETE /api/profil/avatar_loeschen.php
 *
 * Entfernt das Profilbild des aktuellen Nutzers.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

methode_erzwingen('DELETE');

$benutzer    = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];
$media_id    = (int) ($benutzer['media_id'] ?? 0);

if ($media_id === 0) {
    json_erfolg([], 'Kein Avatar vorhanden.');
}

$pdo = db_verbindung();

// Datei-Pfad holen
$stmt = $pdo->prepare("SELECT dateipfad FROM medien WHERE id = ?");
$stmt->execute([$media_id]);
$pfad = $stmt->fetchColumn();

// Nur Avatar-Dateien löschen
if ($pfad && str_contains($pfad, '/avatare/')) {
    $abs = UPLOAD_PFAD . '/' . ltrim(str_replace('uploads/', '', $pfad), '/');
    if (file_exists($abs)) {
        @unlink($abs);
    }
    $pdo->prepare("DELETE FROM medien WHERE id = ?")->execute([$media_id]);
}

// media_id im Benutzer-Datensatz leeren
$pdo->prepare("UPDATE benutzer SET media_id = NULL WHERE id = ?")
    ->execute([$benutzer_id]);

json_erfolg([], 'Avatar gelöscht.');
