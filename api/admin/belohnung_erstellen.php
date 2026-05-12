<?php
/**
 * API: Admin — Belohnung erstellen
 *
 * POST /api/admin/belohnung_erstellen.php
 *
 * Body: code, titel, beschreibung?, typ, bild_pfad?, bedingung_json?, xp_wert?, reihenfolge?, aktiv?
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

$code        = trim($body['code'] ?? '');
$titel       = trim($body['titel'] ?? '');
$beschreibung = trim($body['beschreibung'] ?? '');
$typ         = $body['typ'] ?? 'abzeichen';
$bild_pfad   = trim($body['bild_pfad'] ?? '');
$bedingung   = $body['bedingung'] ?? null;
$xp_wert     = max(0, (int) ($body['xp_wert'] ?? 0));
$reihenfolge = max(0, (int) ($body['reihenfolge'] ?? 0));
$aktiv       = (bool) ($body['aktiv'] ?? true);

if (!$code || !$titel) {
    fehler_ungueltige_eingabe('Code und Titel sind Pflichtfelder.');
}

$erlaubte_typen = ['abzeichen', 'meilenstein', 'titel', 'echt'];
if (!in_array($typ, $erlaubte_typen, true)) {
    fehler_ungueltige_eingabe('Ungültiger Typ. Erlaubt: ' . implode(', ', $erlaubte_typen));
}

// Code darf nur alphanumerisch + Unterstrich sein
if (!preg_match('/^[a-z0-9_]+$/', $code)) {
    fehler_ungueltige_eingabe('Code darf nur Kleinbuchstaben, Ziffern und Unterstriche enthalten.');
}

$bedingung_json = $bedingung ? json_encode($bedingung, JSON_UNESCAPED_UNICODE) : null;

$pdo = db_verbindung();

// Doppelten Code prüfen
$stmt = $pdo->prepare("SELECT id FROM belohnungen WHERE code = ?");
$stmt->execute([$code]);
if ($stmt->fetch()) {
    fehler_doppelter_eintrag("Code '$code' wird bereits verwendet.");
}

$stmt = $pdo->prepare("
    INSERT INTO belohnungen (code, titel, beschreibung, typ, bild_pfad, bedingung_json, xp_wert, reihenfolge, aktiv)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
");
$stmt->execute([
    $code,
    $titel,
    $beschreibung ?: null,
    $typ,
    $bild_pfad ?: null,
    $bedingung_json,
    $xp_wert,
    $reihenfolge,
    $aktiv ? 1 : 0,
]);

$neue_id = (int) $pdo->lastInsertId();

// Admin-Aktion loggen
$stmt = $pdo->prepare("
    INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung, details_json)
    VALUES (?, 'admin_aktion', ?, ?)
");
$stmt->execute([
    $benutzer['id'],
    "Belohnung erstellt: $code",
    json_encode(['belohnung_id' => $neue_id, 'code' => $code, 'typ' => $typ]),
]);

json_erfolg(['id' => $neue_id], 'Belohnung erfolgreich erstellt.');
