<?php
/**
 * API: Admin — Benutzer-Daten direkt setzen
 *
 * POST /api/admin/benutzer_statistik_setzen.php
 *
 * Admin kann Profil-Daten eines Benutzers direkt setzen.
 *
 * Body:
 *   - benutzer_id          (Pflicht)
 *   - vorname              (optional)
 *   - nachname             (optional)
 *   - email                (optional)
 *   - spitzname            (optional)
 *   - neue_vokabeln_pro_tag (optional: 0-1000, 0=unbegrenzt)
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

$aenderungen = [];

if (isset($daten['email'])) {
    $email = trim($daten['email']);
    if ($email !== '') {
        email_validieren($email);
        $stmt = $pdo->prepare("SELECT id FROM benutzer WHERE email = ? AND id != ?");
        $stmt->execute([$email, $ziel_id]);
        if ($stmt->fetch()) {
            fehler_doppelter_eintrag('Diese E-Mail-Adresse ist bereits vergeben.');
        }
        $aenderungen['email'] = $email;
    } else {
        $aenderungen['email'] = null;
    }
}
if (isset($daten['vorname'])) {
    $vorname = trim($daten['vorname']);
    if ($vorname !== '') laenge_validieren($vorname, 'vorname', 1, 64);
    $aenderungen['vorname'] = $vorname ?: null;
}
if (isset($daten['nachname'])) {
    $nachname = trim($daten['nachname']);
    if ($nachname !== '') laenge_validieren($nachname, 'nachname', 1, 64);
    $aenderungen['nachname'] = $nachname ?: null;
}
if (isset($daten['spitzname'])) {
    $spitzname = trim($daten['spitzname']);
    if ($spitzname !== '') laenge_validieren($spitzname, 'spitzname', 1, 64);
    $aenderungen['spitzname'] = $spitzname ?: null;
}
if (isset($daten['neue_vokabeln_pro_tag'])) {
    $nvpt = (int) $daten['neue_vokabeln_pro_tag'];
    if ($nvpt < 0 || $nvpt > 1000) {
        fehler_ungueltige_eingabe('neue_vokabeln_pro_tag muss zwischen 0 und 1000 liegen.');
    }
    $aenderungen['neue_vokabeln_pro_tag'] = $nvpt;
}

if (empty($aenderungen)) {
    fehler_ungueltige_eingabe('Keine Aenderungen angegeben.');
}

$felder = array_map(fn($k) => "{$k} = ?", array_keys($aenderungen));
$werte  = array_values($aenderungen);
$werte[] = $ziel_id;
$pdo->prepare("UPDATE benutzer SET " . implode(', ', $felder) . " WHERE id = ?")
    ->execute($werte);

// --- Aktivitaet loggen ---
$stmt = $pdo->prepare("
    INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung, details_json)
    VALUES (?, 'admin_aktion', ?, ?)
");
$details = json_encode([
    'ziel_benutzer_id' => $ziel_id,
    'aenderungen'      => $aenderungen,
], JSON_UNESCAPED_UNICODE);
$stmt->execute([$benutzer['id'], "Benutzer-Daten aktualisiert (ID: {$ziel_id})", $details]);

json_erfolg(null, 'Benutzer-Daten erfolgreich aktualisiert.');
