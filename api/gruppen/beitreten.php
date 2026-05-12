<?php
/**
 * API: Gruppen — Beitreten
 *
 * POST /api/gruppen/beitreten.php
 *
 * Einer Gruppe ueber Einladungs-Token beitreten.
 * Prueft Gruppen-Limit pro User (aus app_konfiguration: max_gruppen_pro_user).
 *
 * Body:
 *   - token (Pflicht)
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';
require_once dirname(__DIR__) . '/_middleware/sichtbarkeit.php';

// --- Methode pruefen ---
methode_erzwingen('POST');

// --- Authentifizierung ---
$benutzer    = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];

// --- Body lesen ---
$daten = json_body_lesen();

// Entweder 'token' oder 'kurz_code' muss angegeben sein
$token     = isset($daten['token'])     ? trim($daten['token'])     : null;
$kurz_code = isset($daten['kurz_code']) ? strtoupper(trim($daten['kurz_code'])) : null;

if (!$token && !$kurz_code) {
    fehler_ungueltige_eingabe('Token oder Kurzcode ist erforderlich.');
}

$pdo = db_verbindung();

// --- Gruppen-Limit pruefen ---
gruppen_limit_pruefen($pdo, $benutzer_id);

// --- Einladung suchen (per Token oder Kurzcode) ---
if ($token) {
    $stmt = $pdo->prepare("
        SELECT ge.*, g.name AS gruppen_name, g.max_mitglieder
        FROM gruppen_einladungen ge
        JOIN gruppen g ON g.id = ge.gruppen_id AND g.aktiv = 1
        WHERE ge.token = ? AND ge.status = 'offen' AND ge.gueltig_bis > NOW()
    ");
    $stmt->execute([$token]);
} else {
    $stmt = $pdo->prepare("
        SELECT ge.*, g.name AS gruppen_name, g.max_mitglieder
        FROM gruppen_einladungen ge
        JOIN gruppen g ON g.id = ge.gruppen_id AND g.aktiv = 1
        WHERE ge.kurz_code = ? AND ge.status = 'offen' AND ge.gueltig_bis > NOW()
    ");
    $stmt->execute([$kurz_code]);
}
$einladung = $stmt->fetch();

if (!$einladung) {
    fehler_ungueltige_eingabe('Einladung ungueltig oder abgelaufen.');
}

$gruppen_id = (int) $einladung['gruppen_id'];

// --- Bereits Mitglied? ---
$stmt = $pdo->prepare("
    SELECT id FROM gruppen_mitglieder
    WHERE gruppen_id = ? AND benutzer_id = ?
");
$stmt->execute([$gruppen_id, $benutzer_id]);
if ($stmt->fetch()) {
    fehler_doppelter_eintrag('Du bist bereits Mitglied dieser Gruppe.');
}

// --- Max Mitglieder pruefen (Gruppen-seitiges Limit) ---
$stmt = $pdo->prepare("SELECT COUNT(*) FROM gruppen_mitglieder WHERE gruppen_id = ?");
$stmt->execute([$gruppen_id]);
$aktuelle_anzahl = (int) $stmt->fetchColumn();

if ($aktuelle_anzahl >= (int) $einladung['max_mitglieder']) {
    fehler_ungueltige_eingabe('Die Gruppe hat die maximale Mitgliederzahl erreicht.');
}

// --- Transaction: Einladung annehmen + Mitglied werden ---
$pdo->beginTransaction();

try {
    $stmt = $pdo->prepare("
        UPDATE gruppen_einladungen SET status = 'angenommen' WHERE id = ?
    ");
    $stmt->execute([(int) $einladung['id']]);

    $stmt = $pdo->prepare("
        INSERT INTO gruppen_mitglieder (gruppen_id, benutzer_id, rolle)
        VALUES (?, ?, 'mitglied')
    ");
    $stmt->execute([$gruppen_id, $benutzer_id]);

    $pdo->commit();
} catch (\Throwable $e) {
    $pdo->rollBack();
    fehler_server('Beitritt konnte nicht durchgefuehrt werden.');
}

json_erfolg([
    'gruppe' => [
        'id'   => $gruppen_id,
        'name' => $einladung['gruppen_name'],
    ],
], 'Gruppe erfolgreich beigetreten.');
