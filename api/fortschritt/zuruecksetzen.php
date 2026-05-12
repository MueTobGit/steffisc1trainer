<?php
/**
 * API: Fortschritt — Zuruecksetzen
 *
 * POST /api/fortschritt/zuruecksetzen.php
 * Body: { vokabel_id, richtung, bestaetigung: true }
 *
 * Setzt den Fortschritt einer Vokabel/Richtung komplett zurueck.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

// --- Methode pruefen ---
methode_erzwingen('POST');

// --- Authentifizierung ---
$benutzer = benutzer_authentifizieren();

// --- Eingabe validieren ---
$body = json_body_lesen();
pflichtfelder_pruefen($body, ['vokabel_id', 'richtung', 'bestaetigung']);

$vokabel_id = (int) $body['vokabel_id'];
if ($vokabel_id < 1) {
    fehler_ungueltige_eingabe('Vokabel-ID muss eine positive Ganzzahl sein.');
}

$richtung = $body['richtung'];
enum_validieren($richtung, ['DS', 'SD'], 'richtung');

if (empty($body['bestaetigung'])) {
    fehler_ungueltige_eingabe('Bestaetigung ist erforderlich um den Fortschritt zurueckzusetzen.');
}

$pdo = db_verbindung();

// --- Fortschritt zuruecksetzen ---
$stmt = $pdo->prepare("
    UPDATE fortschritt
    SET stufe = 0,
        zustand = 'neu',
        leichtigkeitsfaktor = ?,
        wiederholungen = 0,
        intervall_tage = 0,
        naechste_wiederholung = NULL,
        aktualisiert_am = NOW()
    WHERE benutzer_id = ? AND vokabel_id = ? AND richtung = ?
");
$stmt->execute([START_LEICHTIGKEITSFAKTOR, $benutzer['id'], $vokabel_id, $richtung]);

$betroffen = $stmt->rowCount();

if ($betroffen === 0) {
    fehler_nicht_gefunden('Kein Fortschritt fuer diese Vokabel/Richtung gefunden.');
}

json_erfolg(null, 'Fortschritt wurde zurueckgesetzt.');
