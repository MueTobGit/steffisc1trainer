<?php
/**
 * API: Gruppen — Echte Belohnung löschen
 *
 * POST /api/gruppen/belohnung_loeschen.php
 *
 * Nur Gruppenleiter oder Admin.
 * Body: id (Belohnungs-ID)
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

methode_erzwingen('POST');

$benutzer    = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];

$body = json_body_lesen();
$id   = (int) ($body['id'] ?? 0);

if ($id <= 0) {
    fehler_ungueltige_eingabe('Belohnungs-ID fehlt.');
}

$pdo = db_verbindung();

$stmt = $pdo->prepare("SELECT id, code, titel, gruppen_id FROM belohnungen WHERE id = ? AND typ = 'echt'");
$stmt->execute([$id]);
$belohnung = $stmt->fetch();

if (!$belohnung) {
    fehler_nicht_gefunden('Belohnung nicht gefunden.');
}

$gruppen_id = (int) $belohnung['gruppen_id'];

// Berechtigung prüfen
$stmt = $pdo->prepare("
    SELECT rolle FROM gruppen_mitglieder
    WHERE gruppen_id = ? AND benutzer_id = ?
");
$stmt->execute([$gruppen_id, $benutzer_id]);
$mitglied = $stmt->fetch();

$ist_leiter = $mitglied && in_array($mitglied['rolle'], ['admin', 'leiter'], true);
if (!$ist_leiter && $benutzer['rolle'] !== 'admin') {
    fehler_nicht_berechtigt('Nur Gruppenleiter können Belohnungen löschen.');
}

$stmt = $pdo->prepare("DELETE FROM belohnungen WHERE id = ?");
$stmt->execute([$id]);

json_erfolg(null, 'Belohnung gelöscht.');
