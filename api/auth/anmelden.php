<?php
/**
 * POST /api/auth/anmelden.php
 *
 * Login: Benutzername + Passwort → API-Token
 *
 * Body: { "benutzername": "...", "passwort": "...", "geraet": "..." }
 * Response: { erfolg: true, daten: { token, gueltig_bis, benutzer: {...} } }
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/antwort_helfer.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';
require_once dirname(__DIR__, 2) . '/konfiguration/datenbank.php';
require_once dirname(__DIR__, 2) . '/konfiguration/konstanten.php';
require_once dirname(__DIR__, 2) . '/konfiguration/hilfsfunktionen.php';

// Nur POST erlaubt
methode_erzwingen('POST');

// Rate-Limiting pruefen
if (!rate_limit_pruefen('login')) {
    fehler_rate_limit();
}

// Body lesen
$daten = json_body_lesen();
pflichtfelder_pruefen($daten, ['benutzername', 'passwort']);

$benutzername = trim($daten['benutzername']);
$passwort = $daten['passwort'];
$geraet = trim($daten['geraet'] ?? 'Unbekannt');

// Benutzer suchen
$pdo = db_verbindung();
$stmt = $pdo->prepare("SELECT * FROM benutzer WHERE benutzername = ?");
$stmt->execute([$benutzername]);
$benutzer = $stmt->fetch();

if (!$benutzer) {
    rate_limit_erhoehen('login');
    fehler_nicht_authentifiziert('Benutzername oder Passwort falsch.');
}

// Passwort pruefen
if (!password_verify($passwort, $benutzer['passwort_hash'])) {
    rate_limit_erhoehen('login');
    fehler_nicht_authentifiziert('Benutzername oder Passwort falsch.');
}

// Benutzer aktiv?
if (!$benutzer['aktiv']) {
    fehler_nicht_berechtigt('Benutzerkonto ist deaktiviert.');
}

// Token erzeugen
$token = token_erzeugen();
$gueltig_tage = (int) konfig_wert('token_gueltig_tage', (string) TOKEN_GUELTIG_TAGE);
$gueltig_bis = (new DateTime())->modify("+{$gueltig_tage} days")->format('Y-m-d H:i:s');

$stmt = $pdo->prepare("
    INSERT INTO api_tokens (benutzer_id, token, geraet, gueltig_bis)
    VALUES (?, ?, ?, ?)
");
$stmt->execute([$benutzer['id'], $token, $geraet, $gueltig_bis]);

// Letzter Login aktualisieren
$stmt = $pdo->prepare("UPDATE benutzer SET letzter_login = NOW() WHERE id = ?");
$stmt->execute([$benutzer['id']]);

// Aktivitaet loggen
$stmt = $pdo->prepare("
    INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung)
    VALUES (?, 'login', ?)
");
$stmt->execute([$benutzer['id'], "Login von Geraet: {$geraet}"]);

// Antwort
json_erfolg([
    'token' => $token,
    'gueltig_bis' => $gueltig_bis,
    'benutzer' => [
        'id' => (int) $benutzer['id'],
        'benutzername' => $benutzer['benutzername'],
        'vorname' => $benutzer['vorname'],
        'nachname' => $benutzer['nachname'],
        'email' => $benutzer['email'],
        'spitzname' => $benutzer['spitzname'],
        'rolle' => $benutzer['rolle'],
    ]
], 'Erfolgreich angemeldet.');
