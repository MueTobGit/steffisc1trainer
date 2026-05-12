<?php
/**
 * API: Admin — Liga aktualisieren
 *
 * POST /api/admin/liga_aktualisieren.php
 *
 * Body: id (Pflicht) + beliebige Felder: name, beschreibung, start_datum, end_datum, gruppen_id, aktiv
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
$id   = (int) ($body['id'] ?? 0);

if ($id <= 0) {
    fehler_ungueltige_eingabe('Liga-ID fehlt.');
}

$pdo = db_verbindung();

$stmt = $pdo->prepare("SELECT * FROM ligen WHERE id = ?");
$stmt->execute([$id]);
$liga = $stmt->fetch();

if (!$liga) {
    fehler_nicht_gefunden('Liga nicht gefunden.');
}

$felder = [];
$params = [];

if (isset($body['name'])) {
    $name = trim($body['name']);
    if (!$name) fehler_ungueltige_eingabe('Name darf nicht leer sein.');
    $felder[] = 'name = ?';
    $params[] = $name;
}

if (array_key_exists('beschreibung', $body)) {
    $felder[] = 'beschreibung = ?';
    $params[] = trim($body['beschreibung']) ?: null;
}

if (isset($body['start_datum'])) {
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $body['start_datum'])) {
        fehler_ungueltige_eingabe('start_datum muss im Format YYYY-MM-DD sein.');
    }
    $felder[] = 'start_datum = ?';
    $params[] = $body['start_datum'];
}

if (isset($body['end_datum'])) {
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $body['end_datum'])) {
        fehler_ungueltige_eingabe('end_datum muss im Format YYYY-MM-DD sein.');
    }
    $felder[] = 'end_datum = ?';
    $params[] = $body['end_datum'];
}

// Datums-Konsistenz nach Merge prüfen
$neues_start = $body['start_datum'] ?? $liga['start_datum'];
$neues_end   = $body['end_datum']   ?? $liga['end_datum'];
if ($neues_start >= $neues_end) {
    fehler_ungueltige_eingabe('Enddatum muss nach dem Startdatum liegen.');
}

if (array_key_exists('gruppen_id', $body)) {
    $felder[] = 'gruppen_id = ?';
    $gid = $body['gruppen_id'] ? (int) $body['gruppen_id'] : null;
    if ($gid) {
        $stmt2 = $pdo->prepare("SELECT id FROM gruppen WHERE id = ? AND aktiv = 1");
        $stmt2->execute([$gid]);
        if (!$stmt2->fetch()) {
            fehler_nicht_gefunden('Gruppe nicht gefunden oder inaktiv.');
        }
    }
    $params[] = $gid;
}

if (isset($body['aktiv'])) {
    $felder[] = 'aktiv = ?';
    $params[] = $body['aktiv'] ? 1 : 0;
}

if (isset($body['wiederholung'])) {
    $erlaubte_wiederholungen = ['nein', 'woechentlich', 'zweiwochentlich', 'monatlich', 'jaehrlich'];
    if (!in_array($body['wiederholung'], $erlaubte_wiederholungen, true)) {
        fehler_ungueltige_eingabe('Ungültiger Wiederholungswert.');
    }
    $felder[] = 'wiederholung = ?';
    $params[] = $body['wiederholung'];
}

if (isset($body['krone_typ'])) {
    $erlaubte_krone_typen = ['standard', 'wikinger', 'diamant'];
    if (!in_array($body['krone_typ'], $erlaubte_krone_typen, true)) {
        fehler_ungueltige_eingabe('Ungültiger Krone-Typ.');
    }
    $felder[] = 'krone_typ = ?';
    $params[] = $body['krone_typ'];
}

if (empty($felder)) {
    fehler_ungueltige_eingabe('Keine Felder zum Aktualisieren angegeben.');
}

$params[] = $id;
$stmt = $pdo->prepare("UPDATE ligen SET " . implode(', ', $felder) . " WHERE id = ?");
$stmt->execute($params);

// Admin-Aktion loggen
$stmt = $pdo->prepare("
    INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung, details_json)
    VALUES (?, 'admin_aktion', ?, ?)
");
$stmt->execute([
    $benutzer['id'],
    "Liga aktualisiert: {$liga['name']}",
    json_encode(['liga_id' => $id]),
]);

json_erfolg(null, 'Liga aktualisiert.');
