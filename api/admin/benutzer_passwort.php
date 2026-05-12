<?php
/**
 * API: Admin — Benutzer-Passwort setzen
 *
 * POST /api/admin/benutzer_passwort.php
 *
 * Admin setzt das Passwort eines Benutzers (kein altes Passwort noetig).
 * Alle bestehenden API-Tokens des Benutzers werden invalidiert.
 *
 * Body:
 *   - benutzer_id (Pflicht)
 *   - passwort    (Pflicht, min. 8 Zeichen, 1 Gross, 1 Klein, 1 Zahl)
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';
require_once dirname(__DIR__, 2) . '/konfiguration/konstanten.php';

// --- Methode pruefen ---
methode_erzwingen('POST');

// --- Authentifizierung + Autorisierung ---
$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

// --- Body lesen ---
$daten = json_body_lesen();
pflichtfelder_pruefen($daten, ['benutzer_id', 'passwort']);

$ziel_id  = positive_ganzzahl_validieren($daten['benutzer_id'], 'benutzer_id');
$passwort = $daten['passwort'];

// --- Passwort validieren ---
passwort_validieren($passwort);

$pdo = db_verbindung();

// --- Ziel-Benutzer pruefen ---
$stmt = $pdo->prepare("SELECT id, benutzername FROM benutzer WHERE id = ?");
$stmt->execute([$ziel_id]);
$ziel = $stmt->fetch();

if (!$ziel) {
    fehler_nicht_gefunden('Benutzer nicht gefunden.');
}

// --- Passwort hashen und speichern ---
$passwort_hash = password_hash($passwort, PASSWORD_BCRYPT, ['cost' => BCRYPT_KOSTEN]);

$stmt = $pdo->prepare("UPDATE benutzer SET passwort_hash = ? WHERE id = ?");
$stmt->execute([$passwort_hash, $ziel_id]);

// --- Alle Tokens des Benutzers invalidieren (ausser eigenem) ---
$stmt = $pdo->prepare("DELETE FROM api_tokens WHERE benutzer_id = ?");
$stmt->execute([$ziel_id]);

// --- Aktivitaet loggen ---
$stmt = $pdo->prepare("
    INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung, details_json)
    VALUES (?, 'admin_aktion', ?, ?)
");
$details = json_encode([
    'ziel_benutzer_id'   => $ziel_id,
    'ziel_benutzername'  => $ziel['benutzername'],
    'aktion'             => 'passwort_geaendert',
], JSON_UNESCAPED_UNICODE);
$stmt->execute([
    $benutzer['id'],
    "Passwort geaendert fuer Benutzer: {$ziel['benutzername']}",
    $details,
]);

json_erfolg(null, 'Passwort wurde geaendert. Alle aktiven Sitzungen des Benutzers wurden beendet.');
