<?php
/**
 * API: Gruppen — Echte Belohnung aktualisieren
 *
 * POST /api/gruppen/belohnung_aktualisieren.php
 *
 * Nur Gruppenleiter oder Admin.
 * Body: id (Pflicht) + beliebige Felder: titel, beschreibung, xp_wert, reihenfolge, aktiv
 * Kriterien: min_streak, streak_relativ, min_vokabeln, vokabeln_relativ, min_vokabeln_geuebt
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

methode_erzwingen('POST');

$benutzer    = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];

$body = json_body_lesen();
$id   = (int) ($body['id'] ?? 0);

if ($id <= 0) {
    fehler_ungueltige_eingabe('Belohnungs-ID fehlt.');
}

$pdo = db_verbindung();

$stmt = $pdo->prepare("SELECT id, gruppen_id FROM belohnungen WHERE id = ? AND typ = 'echt'");
$stmt->execute([$id]);
$belohnung = $stmt->fetch();

if (!$belohnung) {
    fehler_nicht_gefunden('Belohnung nicht gefunden.');
}

$gruppen_id = (int) $belohnung['gruppen_id'];

// Berechtigung prüfen
$stmt = $pdo->prepare("
    SELECT rolle FROM gruppen_mitglieder
    WHERE gruppen_id = ? AND benutzer_id = ?
");
$stmt->execute([$gruppen_id, $benutzer_id]);
$mitglied = $stmt->fetch();

$ist_leiter = $mitglied && in_array($mitglied['rolle'], ['admin', 'leiter'], true);
if (!$ist_leiter && $benutzer['rolle'] !== 'admin') {
    fehler_nicht_berechtigt('Nur Gruppenleiter können Belohnungen verwalten.');
}

$felder = [];
$params = [];

if (isset($body['titel'])) {
    $titel = trim($body['titel']);
    if (!$titel) fehler_ungueltige_eingabe('Titel darf nicht leer sein.');
    $felder[] = 'titel = ?';
    $params[] = $titel;
}

if (array_key_exists('beschreibung', $body)) {
    $felder[] = 'beschreibung = ?';
    $params[] = trim($body['beschreibung']) ?: null;
}

// Kriterien aktualisieren (immer als Einheit)
$kriterien_felder = ['min_streak', 'streak_relativ', 'min_vokabeln', 'vokabeln_relativ', 'min_vokabeln_geuebt'];
$hat_kriterien = false;
foreach ($kriterien_felder as $f) {
    if (isset($body[$f])) { $hat_kriterien = true; break; }
}

if ($hat_kriterien) {
    $stmt_bel = $pdo->prepare("SELECT bedingung_json FROM belohnungen WHERE id = ?");
    $stmt_bel->execute([$id]);
    $bel_row = $stmt_bel->fetch();
    $alte = $bel_row && $bel_row['bedingung_json']
        ? (json_decode($bel_row['bedingung_json'], true) ?: [])
        : [];

    $min_streak          = max(0, (int)  ($body['min_streak']          ?? $alte['min_streak']          ?? 0));
    $streak_relativ      = (bool)         ($body['streak_relativ']      ?? $alte['streak_relativ']      ?? false);
    $min_vokabeln        = max(0, (int)  ($body['min_vokabeln']        ?? $alte['min_vokabeln']        ?? 0));
    $vokabeln_relativ    = (bool)         ($body['vokabeln_relativ']    ?? $alte['vokabeln_relativ']    ?? false);
    $min_vokabeln_geuebt = max(0, (int)  ($body['min_vokabeln_geuebt'] ?? $alte['min_vokabeln_geuebt'] ?? 0));

    if ($min_streak === 0 && $min_vokabeln === 0 && $min_vokabeln_geuebt === 0) {
        fehler_ungueltige_eingabe('Mindestens ein Kriterium muss groesser als 0 sein.');
    }

    $felder[] = 'bedingung_json = ?';
    $params[] = json_encode([
        'min_streak'          => $min_streak,
        'streak_relativ'      => $streak_relativ,
        'min_vokabeln'        => $min_vokabeln,
        'vokabeln_relativ'    => $vokabeln_relativ,
        'min_vokabeln_geuebt' => $min_vokabeln_geuebt,
    ]);
}

if (isset($body['reihenfolge'])) {
    $felder[] = 'reihenfolge = ?';
    $params[] = max(0, (int) $body['reihenfolge']);
}

if (isset($body['aktiv'])) {
    $felder[] = 'aktiv = ?';
    $params[] = $body['aktiv'] ? 1 : 0;
}

if (array_key_exists('start_datum', $body)) {
    $sd = $body['start_datum'] !== null ? trim((string) $body['start_datum']) : null;
    if (!empty($sd) && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $sd)) {
        fehler_ungueltige_eingabe('start_datum muss im Format YYYY-MM-DD sein.');
    }
    $felder[] = 'start_datum = ?';
    $params[] = !empty($sd) ? $sd : null;
}

if (empty($felder)) {
    fehler_ungueltige_eingabe('Keine Felder zum Aktualisieren angegeben.');
}

$params[] = $id;
$stmt = $pdo->prepare("UPDATE belohnungen SET " . implode(', ', $felder) . " WHERE id = ?");
$stmt->execute($params);

json_erfolg(null, 'Belohnung aktualisiert.');
