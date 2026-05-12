<?php
/**
 * API: Admin — Benutzer aktualisieren
 *
 * POST /api/admin/benutzer_aktualisieren.php
 *
 * Admin kann Rolle und Status eines Benutzers aendern.
 *
 * Body:
 *   - benutzer_id (Pflicht)
 *   - rolle (optional: 'admin' | 'benutzer')
 *   - aktiv (optional: boolean)
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
$stmt = $pdo->prepare("SELECT id, rolle FROM benutzer WHERE id = ?");
$stmt->execute([$ziel_id]);
$ziel = $stmt->fetch();

if (!$ziel) {
    fehler_nicht_gefunden('Benutzer nicht gefunden.');
}

$aenderungen = [];

// --- Rolle ---
if (isset($daten['rolle'])) {
    if ($ziel_id === (int) $benutzer['id']) {
        fehler_ungueltige_eingabe('Eigene Rolle kann nicht geaendert werden.');
    }
    enum_validieren($daten['rolle'], ['admin', 'benutzer'], 'rolle');
    $aenderungen['rolle'] = $daten['rolle'];
}

// --- Aktiv ---
if (isset($daten['aktiv'])) {
    $aenderungen['aktiv'] = $daten['aktiv'] ? 1 : 0;
}

if (empty($aenderungen)) {
    fehler_ungueltige_eingabe('Keine Aenderungen angegeben.');
}

// --- Updates ausfuehren ---
// Benutzer-Tabelle (rolle, aktiv)
$benutzer_felder = [];
$benutzer_werte = [];
foreach (['rolle', 'aktiv'] as $feld) {
    if (array_key_exists($feld, $aenderungen)) {
        $benutzer_felder[] = "{$feld} = ?";
        $benutzer_werte[] = $aenderungen[$feld];
    }
}
if (!empty($benutzer_felder)) {
    $benutzer_werte[] = $ziel_id;
    $stmt = $pdo->prepare("UPDATE benutzer SET " . implode(', ', $benutzer_felder) . " WHERE id = ?");
    $stmt->execute($benutzer_werte);
}

// --- Aktivitaet loggen ---
$stmt = $pdo->prepare("
    INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung, details_json)
    VALUES (?, 'admin_aktion', ?, ?)
");
$details = json_encode([
    'ziel_benutzer_id' => $ziel_id,
    'aenderungen' => $aenderungen,
], JSON_UNESCAPED_UNICODE);
$stmt->execute([$benutzer['id'], 'Benutzer aktualisiert (ID: ' . $ziel_id . ')', $details]);

json_erfolg(null, 'Benutzer erfolgreich aktualisiert.');
