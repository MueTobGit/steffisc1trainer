<?php
/**
 * API: Admin — Benutzer-Statistik direkt setzen
 *
 * POST /api/admin/benutzer_statistik_setzen.php
 *
 * Admin kann XP, Streak-Tage, Sterne und Level eines Benutzers direkt setzen.
 *
 * Body:
 *   - benutzer_id   (Pflicht)
 *   - xp            (optional: int >= 0)
 *   - streak_tage   (optional: int >= 0)
 *   - globales_level (optional: 1-5)
 *   - bronze_sterne (optional: int >= 0)
 *   - silber_sterne (optional: int >= 0)
 *   - gold_sterne   (optional: int >= 0)
 *   - vorname       (optional, Benutzer-Tabelle)
 *   - nachname      (optional, Benutzer-Tabelle)
 *   - email         (optional, Benutzer-Tabelle)
 *   - spitzname     (optional, Benutzer-Tabelle)
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

// --- Methode pruefen ---
methode_erzwingen('POST');

// --- Authentifizierung + Autorisierung ---
$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

// --- Body lesen ---
$daten = json_body_lesen();
pflichtfelder_pruefen($daten, ['benutzer_id']);

$ziel_id = positive_ganzzahl_validieren($daten['benutzer_id'], 'benutzer_id');

$pdo = db_verbindung();

// --- Ziel-Benutzer pruefen ---
$stmt = $pdo->prepare("SELECT id, benutzername FROM benutzer WHERE id = ?");
$stmt->execute([$ziel_id]);
$ziel = $stmt->fetch();

if (!$ziel) {
    fehler_nicht_gefunden('Benutzer nicht gefunden.');
}

$aenderungen_benutzer   = [];
$aenderungen_statistik  = [];

// --- Benutzer-Tabellen-Felder ---
if (isset($daten['email'])) {
    $email = trim($daten['email']);
    email_validieren($email);
    // Duplikat pruefen (ausser eigene E-Mail)
    $stmt = $pdo->prepare("SELECT id FROM benutzer WHERE email = ? AND id != ?");
    $stmt->execute([$email, $ziel_id]);
    if ($stmt->fetch()) {
        fehler_doppelter_eintrag('Diese E-Mail-Adresse ist bereits vergeben.');
    }
    $aenderungen_benutzer['email'] = $email;
}
if (isset($daten['vorname'])) {
    $vorname = trim($daten['vorname']);
    if ($vorname !== '') laenge_validieren($vorname, 'vorname', 1, 64);
    $aenderungen_benutzer['vorname'] = $vorname ?: null;
}
if (isset($daten['nachname'])) {
    $nachname = trim($daten['nachname']);
    if ($nachname !== '') laenge_validieren($nachname, 'nachname', 1, 64);
    $aenderungen_benutzer['nachname'] = $nachname ?: null;
}
if (isset($daten['spitzname'])) {
    $spitzname = trim($daten['spitzname']);
    if ($spitzname !== '') laenge_validieren($spitzname, 'spitzname', 1, 64);
    $aenderungen_benutzer['spitzname'] = $spitzname ?: null;
}

// --- Statistik-Felder ---
if (isset($daten['xp'])) {
    $xp = (int) $daten['xp'];
    if ($xp < 0) fehler_ungueltige_eingabe('xp darf nicht negativ sein.');
    $aenderungen_statistik['xp'] = $xp;
}
if (isset($daten['streak_tage'])) {
    $streak = (int) $daten['streak_tage'];
    if ($streak < 0) fehler_ungueltige_eingabe('streak_tage darf nicht negativ sein.');
    $aenderungen_statistik['streak_tage'] = $streak;
}
if (isset($daten['globales_level'])) {
    $level = (int) $daten['globales_level'];
    if ($level < 1 || $level > 5) {
        fehler_ungueltige_eingabe('globales_level muss zwischen 1 und 5 liegen.');
    }
    $aenderungen_statistik['globales_level'] = $level;
}
if (isset($daten['bronze_sterne'])) {
    $sterne = (int) $daten['bronze_sterne'];
    if ($sterne < 0) fehler_ungueltige_eingabe('bronze_sterne darf nicht negativ sein.');
    $aenderungen_statistik['bronze_sterne'] = $sterne;
}
if (isset($daten['silber_sterne'])) {
    $sterne = (int) $daten['silber_sterne'];
    if ($sterne < 0) fehler_ungueltige_eingabe('silber_sterne darf nicht negativ sein.');
    $aenderungen_statistik['silber_sterne'] = $sterne;
}
if (isset($daten['gold_sterne'])) {
    $sterne = (int) $daten['gold_sterne'];
    if ($sterne < 0) fehler_ungueltige_eingabe('gold_sterne darf nicht negativ sein.');
    $aenderungen_statistik['gold_sterne'] = $sterne;
}

if (empty($aenderungen_benutzer) && empty($aenderungen_statistik)) {
    fehler_ungueltige_eingabe('Keine Aenderungen angegeben.');
}

// --- Benutzer-Tabelle aktualisieren ---
if (!empty($aenderungen_benutzer)) {
    $felder = array_map(fn($k) => "{$k} = ?", array_keys($aenderungen_benutzer));
    $werte  = array_values($aenderungen_benutzer);
    $werte[] = $ziel_id;
    $pdo->prepare("UPDATE benutzer SET " . implode(', ', $felder) . " WHERE id = ?")
        ->execute($werte);
}

// --- Statistik-Tabelle aktualisieren ---
if (!empty($aenderungen_statistik)) {
    // Sicherstellen, dass Statistik-Eintrag existiert
    $pdo->prepare("INSERT IGNORE INTO benutzer_statistik (benutzer_id) VALUES (?)")
        ->execute([$ziel_id]);

    $felder = array_map(fn($k) => "{$k} = ?", array_keys($aenderungen_statistik));
    $werte  = array_values($aenderungen_statistik);
    $werte[] = $ziel_id;
    $pdo->prepare("UPDATE benutzer_statistik SET " . implode(', ', $felder) . " WHERE benutzer_id = ?")
        ->execute($werte);
}

// --- Aktivitaet loggen ---
$stmt = $pdo->prepare("
    INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung, details_json)
    VALUES (?, 'admin_aktion', ?, ?)
");
$details = json_encode([
    'ziel_benutzer_id'      => $ziel_id,
    'aenderungen_benutzer'  => $aenderungen_benutzer,
    'aenderungen_statistik' => $aenderungen_statistik,
], JSON_UNESCAPED_UNICODE);
$stmt->execute([$benutzer['id'], "Benutzer-Daten aktualisiert (ID: {$ziel_id})", $details]);

json_erfolg(null, 'Benutzer-Daten erfolgreich aktualisiert.');
