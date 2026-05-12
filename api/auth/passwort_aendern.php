<?php
/**
 * POST /api/auth/passwort_aendern.php
 *
 * Passwort aendern (authentifizierter Benutzer).
 *
 * Header: Authorization: Bearer <token>
 * Body: { "altes_passwort": "...", "neues_passwort": "..." }
 * Response: { erfolg: true, nachricht: "..." }
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/antwort_helfer.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

// Nur POST erlaubt
methode_erzwingen('POST');

// Benutzer authentifizieren
$benutzer = benutzer_authentifizieren();

// Body lesen
$daten = json_body_lesen();
pflichtfelder_pruefen($daten, ['altes_passwort', 'neues_passwort']);

$altes_passwort = $daten['altes_passwort'];
$neues_passwort = $daten['neues_passwort'];

// Neues Passwort validieren
passwort_validieren($neues_passwort);

// Altes Passwort pruefen
$pdo = db_verbindung();
$stmt = $pdo->prepare("SELECT passwort_hash FROM benutzer WHERE id = ?");
$stmt->execute([$benutzer['id']]);
$hash = $stmt->fetchColumn();

if (!password_verify($altes_passwort, $hash)) {
    fehler_ungueltige_eingabe('Das alte Passwort ist falsch.');
}

// Neues Passwort setzen
$neuer_hash = password_hash($neues_passwort, PASSWORD_BCRYPT, ['cost' => BCRYPT_KOSTEN]);
$stmt = $pdo->prepare("UPDATE benutzer SET passwort_hash = ? WHERE id = ?");
$stmt->execute([$neuer_hash, $benutzer['id']]);

// Alle anderen Tokens deaktivieren (Sicherheit)
$stmt = $pdo->prepare("UPDATE api_tokens SET aktiv = FALSE WHERE benutzer_id = ? AND id != ?");
$stmt->execute([$benutzer['id'], $benutzer['token_id']]);

// Aktivitaet loggen
$stmt = $pdo->prepare("
    INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung)
    VALUES (?, 'admin_aktion', 'Passwort geaendert')
");
$stmt->execute([$benutzer['id']]);

json_erfolg(null, 'Passwort erfolgreich geaendert.');
