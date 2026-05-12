<?php
/**
 * API: Admin — Liga erstellen
 *
 * POST /api/admin/liga_erstellen.php
 *
 * Body: name, beschreibung?, start_datum (YYYY-MM-DD), end_datum (YYYY-MM-DD), gruppen_id?, aktiv?, wiederholung?
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

methode_erzwingen('POST');

$benutzer = benutzer_authentifizieren();
if ($benutzer['rolle'] !== 'admin') {
    fehler_nicht_berechtigt('Nur Admins haben Zugriff.');
}

$body = json_body_lesen();

$name         = trim($body['name'] ?? '');
$beschreibung = trim($body['beschreibung'] ?? '');
$start_datum  = trim($body['start_datum'] ?? '');
$end_datum    = trim($body['end_datum'] ?? '');
$gruppen_id   = isset($body['gruppen_id']) ? (int) $body['gruppen_id'] : null;
$aktiv        = (bool) ($body['aktiv'] ?? true);

$erlaubte_wiederholungen = ['nein', 'woechentlich', 'zweiwochentlich', 'monatlich', 'jaehrlich'];
$wiederholung = in_array($body['wiederholung'] ?? '', $erlaubte_wiederholungen, true)
    ? $body['wiederholung']
    : 'nein';

$erlaubte_krone_typen = ['standard', 'wikinger', 'diamant'];
$krone_typ = in_array($body['krone_typ'] ?? '', $erlaubte_krone_typen, true)
    ? $body['krone_typ']
    : 'standard';

if (!$name) {
    fehler_ungueltige_eingabe('Name ist ein Pflichtfeld.');
}

if (!$start_datum || !$end_datum) {
    fehler_ungueltige_eingabe('Start- und Enddatum sind Pflichtfelder (Format: YYYY-MM-DD).');
}

// Datumsformat validieren
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $start_datum) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $end_datum)) {
    fehler_ungueltige_eingabe('Datum muss im Format YYYY-MM-DD vorliegen.');
}

if ($start_datum >= $end_datum) {
    fehler_ungueltige_eingabe('Enddatum muss nach dem Startdatum liegen.');
}

$pdo = db_verbindung();

// Gruppe prüfen wenn angegeben
if ($gruppen_id) {
    $stmt = $pdo->prepare("SELECT id FROM gruppen WHERE id = ? AND aktiv = 1");
    $stmt->execute([$gruppen_id]);
    if (!$stmt->fetch()) {
        fehler_nicht_gefunden('Gruppe nicht gefunden oder inaktiv.');
    }
}

$stmt = $pdo->prepare("
    INSERT INTO ligen (name, beschreibung, start_datum, end_datum, gruppen_id, aktiv, wiederholung, krone_typ)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
");
$stmt->execute([
    $name,
    $beschreibung ?: null,
    $start_datum,
    $end_datum,
    $gruppen_id,
    $aktiv ? 1 : 0,
    $wiederholung,
    $krone_typ,
]);

$neue_id = (int) $pdo->lastInsertId();

// Admin-Aktion loggen
$stmt = $pdo->prepare("
    INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung, details_json)
    VALUES (?, 'admin_aktion', ?, ?)
");
$stmt->execute([
    $benutzer['id'],
    "Liga erstellt: $name",
    json_encode(['liga_id' => $neue_id, 'start' => $start_datum, 'end' => $end_datum]),
]);

json_erfolg(['id' => $neue_id], 'Liga erfolgreich erstellt.');
