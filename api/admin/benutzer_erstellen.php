<?php
/**
 * API: Admin — Benutzer erstellen
 *
 * POST /api/admin/benutzer_erstellen.php
 *
 * Admin kann einen neuen Benutzer anlegen, inkl. Statistik-Eintrag.
 *
 * Body:
 *   - benutzername  (Pflicht)
 *   - passwort      (Pflicht)
 *   - email         (Pflicht)
 *   - vorname       (optional)
 *   - nachname      (optional)
 *   - spitzname     (optional)
 *   - rolle         (optional: 'admin' | 'benutzer', Standard: 'benutzer')
 *   - aktiv         (optional: boolean, Standard: true)
 *   - xp            (optional: int >= 0)
 *   - streak_tage   (optional: int >= 0)
 *   - globales_level (optional: 1-5)
 *   - bronze_sterne (optional: int >= 0)
 *   - silber_sterne (optional: int >= 0)
 *   - gold_sterne   (optional: int >= 0)
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';
require_once dirname(__DIR__, 2) . '/konfiguration/konstanten.php';
require_once dirname(__DIR__, 2) . '/konfiguration/hilfsfunktionen.php';

// --- Methode pruefen ---
methode_erzwingen('POST');

// --- Authentifizierung + Autorisierung ---
$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

// --- Body lesen ---
$daten = json_body_lesen();
pflichtfelder_pruefen($daten, ['benutzername', 'passwort', 'email']);

$benutzername = trim($daten['benutzername']);
$passwort     = $daten['passwort'];
$email        = trim($daten['email']);
$vorname      = trim($daten['vorname'] ?? '');
$nachname     = trim($daten['nachname'] ?? '');
$spitzname    = trim($daten['spitzname'] ?? '');
$rolle        = $daten['rolle'] ?? 'benutzer';
$aktiv        = isset($daten['aktiv']) ? (bool) $daten['aktiv'] : true;

// Statistik-Felder
$xp            = isset($daten['xp']) ? max(0, (int) $daten['xp']) : 0;
$streak_tage   = isset($daten['streak_tage']) ? max(0, (int) $daten['streak_tage']) : 0;
$globales_level = isset($daten['globales_level']) ? (int) $daten['globales_level'] : 1;
$bronze_sterne = isset($daten['bronze_sterne']) ? max(0, (int) $daten['bronze_sterne']) : 0;
$silber_sterne = isset($daten['silber_sterne']) ? max(0, (int) $daten['silber_sterne']) : 0;
$gold_sterne   = isset($daten['gold_sterne']) ? max(0, (int) $daten['gold_sterne']) : 0;

// --- Validierung ---
benutzername_validieren($benutzername);
passwort_validieren($passwort);
email_validieren($email);
enum_validieren($rolle, ['admin', 'benutzer'], 'rolle');

if ($globales_level < 1 || $globales_level > 5) {
    fehler_ungueltige_eingabe('globales_level muss zwischen 1 und 5 liegen.');
}
if ($vorname !== '') laenge_validieren($vorname, 'vorname', 1, 64);
if ($nachname !== '') laenge_validieren($nachname, 'nachname', 1, 64);
if ($spitzname !== '') laenge_validieren($spitzname, 'spitzname', 1, 64);

$pdo = db_verbindung();

// --- Duplikat pruefen: Benutzername ---
$stmt = $pdo->prepare("SELECT id FROM benutzer WHERE benutzername = ?");
$stmt->execute([$benutzername]);
if ($stmt->fetch()) {
    fehler_doppelter_eintrag('Dieser Benutzername ist bereits vergeben.');
}

// --- Duplikat pruefen: E-Mail ---
$stmt = $pdo->prepare("SELECT id FROM benutzer WHERE email = ?");
$stmt->execute([$email]);
if ($stmt->fetch()) {
    fehler_doppelter_eintrag('Diese E-Mail-Adresse ist bereits registriert.');
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
    $email,
    $vorname ?: null,
    $nachname ?: null,
    $spitzname ?: null,
    $rolle,
    $aktiv ? 1 : 0,
]);

$neuer_id = (int) $pdo->lastInsertId();

// --- Statistik-Eintrag erstellen ---
$stmt = $pdo->prepare("
    INSERT INTO benutzer_statistik
        (benutzer_id, xp, streak_tage, laengstes_streak, globales_level,
         bronze_sterne, silber_sterne, gold_sterne)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
");
$stmt->execute([
    $neuer_id,
    $xp,
    $streak_tage,
    $streak_tage,   // laengstes_streak = streak_tage beim Anlegen
    $globales_level,
    $bronze_sterne,
    $silber_sterne,
    $gold_sterne,
]);

// --- Aktivitaet loggen ---
$stmt = $pdo->prepare("
    INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung, details_json)
    VALUES (?, 'admin_aktion', ?, ?)
");
$details = json_encode([
    'neuer_benutzer_id'   => $neuer_id,
    'neuer_benutzername'  => $benutzername,
    'rolle'               => $rolle,
], JSON_UNESCAPED_UNICODE);
$stmt->execute([$benutzer['id'], "Benutzer erstellt: {$benutzername}", $details]);

json_erfolg(['id' => $neuer_id], 'Benutzer erfolgreich erstellt.', 201);
