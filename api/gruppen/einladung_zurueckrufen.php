<?php
/**
 * API: Gruppen — Einladung zurueckrufen
 *
 * POST /api/gruppen/einladung_zurueckrufen.php
 *
 * Setzt eine offene Einladung auf Status 'abgelaufen'.
 * Nur Admin/Leiter der zugehoerigen Gruppe.
 *
 * Body:
 *   - id (Pflicht) — Einladungs-ID
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';

methode_erzwingen('POST');

$benutzer    = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];

$body = json_body_lesen();
$id   = (int) ($body['id'] ?? 0);
if ($id < 1) {
    fehler_ungueltige_eingabe('Einladungs-ID ist erforderlich.');
}

$pdo = db_verbindung();

// Einladung laden
$stmt = $pdo->prepare("
    SELECT ge.id, ge.gruppen_id, ge.status
    FROM gruppen_einladungen ge
    WHERE ge.id = ?
");
$stmt->execute([$id]);
$einladung = $stmt->fetch();

if (!$einladung) {
    fehler_nicht_gefunden('Einladung nicht gefunden.');
}

$gruppen_id = (int) $einladung['gruppen_id'];

// Berechtigung: Admin/Leiter der Gruppe
if (!ist_admin($benutzer) && !gruppen_rolle_pruefen($benutzer_id, $gruppen_id, ['admin', 'leiter'])) {
    fehler_nicht_berechtigt('Nur Admins und Leiter koennen Einladungen zurueckrufen.');
}

if ($einladung['status'] !== 'offen') {
    fehler_ungueltige_eingabe('Diese Einladung ist bereits nicht mehr offen.');
}

$pdo->prepare("
    UPDATE gruppen_einladungen SET status = 'abgelaufen' WHERE id = ?
")->execute([$id]);

json_erfolg(null, 'Einladung zurueckgerufen.');
