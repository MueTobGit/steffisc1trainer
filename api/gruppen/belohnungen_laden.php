<?php
/**
 * API: Gruppen — Echte Belohnungen laden
 *
 * GET /api/gruppen/belohnungen_laden.php?gruppen_id=X
 *
 * Gibt alle echten Belohnungen einer Gruppe zurück.
 * Alle Mitglieder können lesen; Schreiben nur Leiter/Admin.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

methode_erzwingen('GET');

$benutzer    = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];
$gruppen_id  = (int) ($_GET['gruppen_id'] ?? 0);

if ($gruppen_id <= 0) {
    fehler_ungueltige_eingabe('gruppen_id fehlt.');
}

$pdo = db_verbindung();

// Gruppe existiert?
$stmt = $pdo->prepare("SELECT id FROM gruppen WHERE id = ? AND aktiv = 1");
$stmt->execute([$gruppen_id]);
if (!$stmt->fetch()) {
    fehler_nicht_gefunden('Gruppe nicht gefunden.');
}

// Mitglied prüfen
$stmt = $pdo->prepare("
    SELECT rolle FROM gruppen_mitglieder
    WHERE gruppen_id = ? AND benutzer_id = ?
");
$stmt->execute([$gruppen_id, $benutzer_id]);
$mitglied = $stmt->fetch();

if (!$mitglied && $benutzer['rolle'] !== 'admin') {
    fehler_nicht_berechtigt('Du bist kein Mitglied dieser Gruppe.');
}

$ist_leiter = $mitglied && in_array($mitglied['rolle'], ['admin', 'leiter'], true);
$ist_admin  = $benutzer['rolle'] === 'admin';

// Belohnungen laden (typ='echt', gruppen_id=X, aktiv=1 für Mitglieder, alle für Leiter)
$where_aktiv = ($ist_leiter || $ist_admin) ? '' : 'AND b.aktiv = 1';

$stmt = $pdo->prepare("
    SELECT id, code, titel, beschreibung, bild_pfad, bedingung_json, reihenfolge, aktiv, start_datum
    FROM belohnungen b
    WHERE b.gruppen_id = ? AND b.typ = 'echt'
    $where_aktiv
    ORDER BY b.reihenfolge ASC, b.id ASC
");
$stmt->execute([$gruppen_id]);
$belohnungen = $stmt->fetchAll();

foreach ($belohnungen as &$b) {
    $b['id']          = (int) $b['id'];
    $b['reihenfolge'] = (int) $b['reihenfolge'];
    $b['aktiv']       = (bool) $b['aktiv'];
    // Kriterien aus JSON extrahieren
    $bedingung = $b['bedingung_json'] ? (json_decode($b['bedingung_json'], true) ?: []) : [];
    $b['min_streak']          = (int)  ($bedingung['min_streak']          ?? 0);
    $b['streak_relativ']      = (bool) ($bedingung['streak_relativ']      ?? false);
    $b['min_vokabeln']        = (int)  ($bedingung['min_vokabeln']        ?? 0);
    $b['vokabeln_relativ']    = (bool) ($bedingung['vokabeln_relativ']    ?? false);
    $b['min_vokabeln_geuebt'] = (int)  ($bedingung['min_vokabeln_geuebt'] ?? 0);
    unset($b['bedingung_json']);
}
unset($b);

json_erfolg([
    'belohnungen'  => $belohnungen,
    'darf_verwalten' => $ist_leiter || $ist_admin,
]);
