<?php
/**
 * API: Schnellueben — Sitzung beenden
 *
 * POST /api/schnellueben/beenden.php
 * Body: { sitzung_id }
 *
 * Schliesst die Schnellueben-Sitzung ab und aktualisiert die Trainings-Statistik.
 * Kein SM-2, kein Fortschritts-Update.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';
require_once dirname(__DIR__, 2) . '/konfiguration/hilfsfunktionen.php';

methode_erzwingen('POST');
$benutzer = benutzer_authentifizieren();

$body = json_body_lesen();
pflichtfelder_pruefen($body, ['sitzung_id']);
$sitzung_id = (int) $body['sitzung_id'];

$pdo = db_verbindung();

$stmt = $pdo->prepare("SELECT * FROM trainings_sitzungen WHERE id = ? AND benutzer_id = ?");
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

$pdo->prepare("UPDATE trainings_sitzungen SET beendet_am = NOW() WHERE id = ?")
    ->execute([$sitzung_id]);

$anzahl_fragen  = (int) $sitzung['anzahl_fragen'];
$anzahl_richtig = (int) $sitzung['anzahl_richtig'];
$genauigkeit    = $anzahl_fragen > 0 ? (int) round(($anzahl_richtig / $anzahl_fragen) * 100) : 0;

// Statistik sicherstellen + aktualisieren
$pdo->prepare("INSERT IGNORE INTO benutzer_statistik (benutzer_id) VALUES (?)")
    ->execute([$benutzer['id']]);

$pdo->prepare("
    UPDATE benutzer_statistik
    SET letztes_training     = NOW(),
        gesamt_trainings     = gesamt_trainings + 1
    WHERE benutzer_id = ?
")->execute([$benutzer['id']]);

// Aktivitaet loggen
$stmt = $pdo->prepare("
    INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung, details_json)
    VALUES (?, 'training', ?, ?)
");
$beschreibung = "Schnellueben abgeschlossen: {$anzahl_richtig}/{$anzahl_fragen} richtig";
$details = json_encode([
    'sitzung_id'  => $sitzung_id,
    'typ'         => 'schnell',
    'fragen'      => $anzahl_fragen,
    'richtig'     => $anzahl_richtig,
    'genauigkeit' => $genauigkeit,
], JSON_UNESCAPED_UNICODE);
$stmt->execute([$benutzer['id'], $beschreibung, $details]);

json_erfolg([
    'zusammenfassung' => [
        'anzahl_fragen'  => $anzahl_fragen,
        'anzahl_richtig' => $anzahl_richtig,
        'genauigkeit'    => $genauigkeit,
    ],
]);
