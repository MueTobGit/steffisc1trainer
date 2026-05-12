<?php
/**
 * API: Schnellueben — Antwort
 *
 * POST /api/schnellueben/antwort.php
 * Body: { sitzung_id, aufgabe_index, richtig }
 *
 * Zaehlt eine einzelne Antwort. Kein SM-2, kein Fortschritts-Update.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

methode_erzwingen('POST');
$benutzer = benutzer_authentifizieren();

$body = json_body_lesen();
pflichtfelder_pruefen($body, ['sitzung_id', 'aufgabe_index']);

$sitzung_id    = (int) $body['sitzung_id'];
$aufgabe_index = (int) $body['aufgabe_index'];
$richtig       = !empty($body['richtig']);

$pdo = db_verbindung();

$stmt = $pdo->prepare("SELECT id, benutzer_id, typ, beendet_am FROM trainings_sitzungen WHERE id = ? AND benutzer_id = ?");
$stmt->execute([$sitzung_id, $benutzer['id']]);
$sitzung = $stmt->fetch();

if (!$sitzung) {
    fehler_nicht_gefunden('Schnellueben-Sitzung nicht gefunden.');
}
if ($sitzung['typ'] !== 'schnell') {
    fehler_ungueltige_eingabe('Dies ist keine Schnellueben-Sitzung.');
}
if ($sitzung['beendet_am'] !== null) {
    fehler_ungueltige_eingabe('Diese Sitzung ist bereits beendet.');
}

$stmt = $pdo->prepare("
    UPDATE trainings_sitzungen
    SET anzahl_fragen  = anzahl_fragen + 1,
        anzahl_richtig = anzahl_richtig + ?
    WHERE id = ?
");
$stmt->execute([$richtig ? 1 : 0, $sitzung_id]);

json_erfolg(['richtig' => $richtig]);
