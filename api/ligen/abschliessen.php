<?php
/**
 * API: Ligen — Abschliessen
 *
 * POST /api/ligen/abschliessen.php
 * Body: { "liga_id": 1 }
 *
 * Admin-only. Schliesst eine abgelaufene Liga ab und vergibt
 * Kronen (Platz 1–3) sowie die entsprechenden Belohnungen.
 * Idempotent: mehrfaches Aufrufen ist sicher.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once __DIR__ . '/_ligen_helfer.php';

methode_erzwingen('POST');

$benutzer = benutzer_authentifizieren();
if ($benutzer['rolle'] !== 'admin') {
    fehler_nicht_berechtigt('Nur Administratoren koennen Ligas abschliessen.');
}

$daten   = json_body_lesen();
$liga_id = isset($daten['liga_id']) ? (int) $daten['liga_id'] : 0;
if ($liga_id < 1) {
    fehler_ungueltige_eingabe('liga_id ist erforderlich.');
}

$pdo = db_verbindung();

// Liga laden
$stmt = $pdo->prepare("SELECT id, name, end_datum FROM ligen WHERE id = ?");
$stmt->execute([$liga_id]);
$liga = $stmt->fetch();
if (!$liga) {
    fehler_nicht_gefunden('Liga nicht gefunden.');
}

// Liga muss beendet sein
if ($liga['end_datum'] >= date('Y-m-d')) {
    fehler_ungueltige_eingabe('Die Liga laeuft noch. Abschliessen erst nach end_datum moeglich.');
}

// Kronen vergeben (idempotent)
$gewinner = liga_kronen_vergeben($pdo, $liga_id);

json_erfolg([
    'liga_id'         => $liga_id,
    'liga_name'       => $liga['name'],
    'gewinner'        => $gewinner,
    'kronen_vergeben' => count($gewinner),
]);
