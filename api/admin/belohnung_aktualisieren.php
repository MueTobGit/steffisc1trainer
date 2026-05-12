<?php
/**
 * API: Admin — Belohnung aktualisieren
 *
 * POST /api/admin/belohnung_aktualisieren.php
 *
 * Body: id (Pflicht) + beliebige Felder: titel, beschreibung, typ, bild_pfad, bedingung, xp_wert, reihenfolge, aktiv
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
    fehler_ungueltige_eingabe('Belohnungs-ID fehlt.');
}

$pdo = db_verbindung();

$stmt = $pdo->prepare("SELECT * FROM belohnungen WHERE id = ?");
$stmt->execute([$id]);
$belohnung = $stmt->fetch();

if (!$belohnung) {
    fehler_nicht_gefunden('Belohnung nicht gefunden.');
}

// Felder zusammenbauen
$felder  = [];
$params  = [];

if (isset($body['titel'])) {
    $titel = trim($body['titel']);
    if (!$titel) fehler_ungueltige_eingabe('Titel darf nicht leer sein.');
    $felder[]  = 'titel = ?';
    $params[]  = $titel;
}

if (array_key_exists('beschreibung', $body)) {
    $felder[] = 'beschreibung = ?';
    $params[] = trim($body['beschreibung']) ?: null;
}

if (isset($body['typ'])) {
    $erlaubte_typen = ['abzeichen', 'meilenstein', 'titel', 'echt'];
    if (!in_array($body['typ'], $erlaubte_typen, true)) {
        fehler_ungueltige_eingabe('Ungültiger Typ.');
    }
    $felder[] = 'typ = ?';
    $params[] = $body['typ'];
}

if (array_key_exists('bild_pfad', $body)) {
    $felder[] = 'bild_pfad = ?';
    $params[] = trim($body['bild_pfad']) ?: null;
}

if (array_key_exists('bedingung', $body)) {
    $felder[] = 'bedingung_json = ?';
    $params[] = $body['bedingung'] ? json_encode($body['bedingung'], JSON_UNESCAPED_UNICODE) : null;
}

if (isset($body['xp_wert'])) {
    $felder[] = 'xp_wert = ?';
    $params[] = max(0, (int) $body['xp_wert']);
}

if (isset($body['reihenfolge'])) {
    $felder[] = 'reihenfolge = ?';
    $params[] = max(0, (int) $body['reihenfolge']);
}

if (isset($body['aktiv'])) {
    $felder[] = 'aktiv = ?';
    $params[] = $body['aktiv'] ? 1 : 0;
}

if (empty($felder)) {
    fehler_ungueltige_eingabe('Keine Felder zum Aktualisieren angegeben.');
}

$params[] = $id;
$stmt = $pdo->prepare("UPDATE belohnungen SET " . implode(', ', $felder) . " WHERE id = ?");
$stmt->execute($params);

// Admin-Aktion loggen
$stmt = $pdo->prepare("
    INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung, details_json)
    VALUES (?, 'admin_aktion', ?, ?)
");
$stmt->execute([
    $benutzer['id'],
    "Belohnung aktualisiert: {$belohnung['code']}",
    json_encode(['belohnung_id' => $id]),
]);

json_erfolg(null, 'Belohnung aktualisiert.');
