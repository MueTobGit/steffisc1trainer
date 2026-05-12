<?php
/**
 * API: Admin — Benutzer erstellen
 *
 * POST /api/admin/benutzer_erstellen.php
 *
 * Admin kann einen neuen Benutzer anlegen.
 *
 * Body:
 *   - benutzername  (Pflicht)
 *   - passwort      (Pflicht)
 *   - email         (optional)
 *   - vorname       (optional)
 *   - nachname      (optional)
 *   - spitzname     (optional)
 *   - rolle         (optional: 'admin' | 'benutzer', Standard: 'benutzer')
 *   - aktiv         (optional: boolean, Standard: true)
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
pflichtfelder_pruefen($daten, ['benutzername', 'passwort']);

$benutzername = trim($daten['benutzername']);
$passwort     = $daten['passwort'];
$email        = strtolower(trim($daten['email'] ?? ''));
$vorname      = trim($daten['vorname'] ?? '');
$nachname     = trim($daten['nachname'] ?? '');
$spitzname    = trim($daten['spitzname'] ?? '');
$rolle        = $daten['rolle'] ?? 'benutzer';
$aktiv        = isset($daten['aktiv']) ? (bool) $daten['aktiv'] : true;

// --- Validierung ---
benutzername_validieren($benutzername);
passwort_validieren($passwort);
if ($email !== '') email_validieren($email);
enum_validieren($rolle, ['admin', 'benutzer'], 'rolle');
if ($vorname !== '') laenge_validieren($vorname, 'vorname', 1, 64);
if ($nachname !== '') laenge_validieren($nachname, 'nachname', 1, 64);
if ($spitzname !== '') laenge_validieren($spitzname, 'spitzname', 1, 64);

$pdo = db_verbindung();

// --- Duplikat pruefen ---
$stmt = $pdo->prepare("SELECT id FROM benutzer WHERE benutzername = ?");
$stmt->execute([$benutzername]);
if ($stmt->fetch()) {
    fehler_doppelter_eintrag('Dieser Benutzername ist bereits vergeben.');
}

if ($email !== '') {
    $stmt = $pdo->prepare("SELECT id FROM benutzer WHERE email = ?");
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        fehler_doppelter_eintrag('Diese E-Mail-Adresse ist bereits registriert.');
    }
}

// --- Passwort hashen ---
$passwort_hash = password_hash($passwort, PASSWORD_BCRYPT, ['cost' => BCRYPT_KOSTEN]);

// --- Benutzer erstellen ---
$stmt = $pdo->prepare("
    INSERT INTO benutzer (benutzername, passwort_hash, email, vorname, nachname, spitzname, rolle, aktiv)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
");
$stmt->execute([
    $benutzername,
    $passwort_hash,
    $email ?: null,
    $vorname ?: null,
    $nachname ?: null,
    $spitzname ?: null,
    $rolle,
    $aktiv ? 1 : 0,
]);

$neuer_id = (int) $pdo->lastInsertId();

// --- Leeren Statistik-Eintrag anlegen ---
$pdo->prepare("INSERT INTO benutzer_statistik (benutzer_id) VALUES (?)")
    ->execute([$neuer_id]);

// --- Aktivitaet loggen ---
$stmt = $pdo->prepare("
    INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung, details_json)
    VALUES (?, 'admin_aktion', ?, ?)
");
$details = json_encode([
    'neuer_benutzer_id'  => $neuer_id,
    'neuer_benutzername' => $benutzername,
    'rolle'              => $rolle,
], JSON_UNESCAPED_UNICODE);
$stmt->execute([$benutzer['id'], "Benutzer erstellt: {$benutzername}", $details]);

json_erfolg(['id' => $neuer_id], 'Benutzer erfolgreich erstellt.', 201);
