<?php
/**
 * POST /api/auth/registrieren.php
 *
 * Neuen Benutzer registrieren.
 *
 * Body: { "benutzername": "...", "passwort": "...", "email": "...",
 *          "vorname": "...", "nachname": "..." }
 * Response: { erfolg: true, daten: { token, gueltig_bis, benutzer: {...} } }
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/antwort_helfer.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';
require_once dirname(__DIR__, 2) . '/konfiguration/datenbank.php';
require_once dirname(__DIR__, 2) . '/konfiguration/konstanten.php';
require_once dirname(__DIR__, 2) . '/konfiguration/hilfsfunktionen.php';

// Nur POST erlaubt
methode_erzwingen('POST');

// Body lesen
$daten = json_body_lesen();
pflichtfelder_pruefen($daten, ['benutzername', 'passwort', 'email']);

$benutzername = trim($daten['benutzername']);
$passwort = $daten['passwort'];
$email = trim($daten['email']);
$vorname = trim($daten['vorname'] ?? '');
$nachname = trim($daten['nachname'] ?? '');

// Validierung
benutzername_validieren($benutzername);
passwort_validieren($passwort);
email_validieren($email);

if ($vorname !== '') laenge_validieren($vorname, 'vorname', 1, 64);
if ($nachname !== '') laenge_validieren($nachname, 'nachname', 1, 64);

$pdo = db_verbindung();

// Duplikat-Schnellpruefung (benutzerfreundliche Fruehabbruch)
$stmt = $pdo->prepare("SELECT id FROM benutzer WHERE benutzername = ?");
$stmt->execute([$benutzername]);
if ($stmt->fetch()) {
    fehler_doppelter_eintrag('Dieser Benutzername ist bereits vergeben.');
}

$stmt = $pdo->prepare("SELECT id FROM benutzer WHERE email = ?");
$stmt->execute([$email]);
if ($stmt->fetch()) {
    fehler_doppelter_eintrag('Diese E-Mail-Adresse ist bereits registriert.');
}

// Passwort hashen (vor der Transaktion, da bcrypt etwas Zeit braucht)
$passwort_hash = password_hash($passwort, PASSWORD_BCRYPT, ['cost' => BCRYPT_KOSTEN]);

// Token vorbereiten
$token = token_erzeugen();
$gueltig_tage = (int) konfig_wert('token_gueltig_tage', (string) TOKEN_GUELTIG_TAGE);
$gueltig_bis = (new DateTime())->modify("+{$gueltig_tage} days")->format('Y-m-d H:i:s');

// Alle Schreiboperationen in einer Transaktion — verhindert Race-Condition
// bei gleichzeitigen Registrierungen (TOCTOU: die UNIQUE-Constraints der DB
// fangen verbleibende Duplikate ab).
$pdo->beginTransaction();

try {
    // Benutzer erstellen
    $stmt = $pdo->prepare("
        INSERT INTO benutzer (benutzername, passwort_hash, email, vorname, nachname, rolle, aktiv)
        VALUES (?, ?, ?, ?, ?, 'benutzer', TRUE)
    ");
    $stmt->execute([$benutzername, $passwort_hash, $email, $vorname ?: null, $nachname ?: null]);
    $benutzer_id = (int) $pdo->lastInsertId();

    // Statistik-Eintrag erstellen
    $stmt = $pdo->prepare("INSERT INTO benutzer_statistik (benutzer_id) VALUES (?)");
    $stmt->execute([$benutzer_id]);

    // Kategorie fuer den neuen Benutzer vorab anlegen (benannt nach Benutzername)
    $stmt_kat = $pdo->prepare('SELECT id FROM kategorien WHERE name = ? LIMIT 1');
    $stmt_kat->execute([$benutzername]);
    if ($stmt_kat->fetchColumn() === false) {
        $pdo->prepare('INSERT INTO kategorien (name, aktiv) VALUES (?, 1)')
            ->execute([$benutzername]);
    }

    // Token speichern
    $stmt = $pdo->prepare("
        INSERT INTO api_tokens (benutzer_id, token, geraet, gueltig_bis)
        VALUES (?, ?, 'Registrierung', ?)
    ");
    $stmt->execute([$benutzer_id, $token, $gueltig_bis]);

    // Letzter Login setzen
    $pdo->prepare("UPDATE benutzer SET letzter_login = NOW() WHERE id = ?")
        ->execute([$benutzer_id]);

    // Aktivitaet loggen
    $pdo->prepare("
        INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung)
        VALUES (?, 'login', 'Registrierung und erster Login')
    ")->execute([$benutzer_id]);

    $pdo->commit();
} catch (PDOException $e) {
    $pdo->rollBack();
    // SQLSTATE 23000 = Integrity constraint violation (Duplicate entry)
    if (str_starts_with($e->getCode(), '23')) {
        if (str_contains($e->getMessage(), 'benutzername')) {
            fehler_doppelter_eintrag('Dieser Benutzername ist bereits vergeben.');
        }
        fehler_doppelter_eintrag('Diese E-Mail-Adresse ist bereits registriert.');
    }
    throw $e;
}

// Antwort
json_erfolg([
    'token' => $token,
    'gueltig_bis' => $gueltig_bis,
    'benutzer' => [
        'id' => $benutzer_id,
        'benutzername' => $benutzername,
        'vorname' => $vorname ?: null,
        'nachname' => $nachname ?: null,
        'email' => $email,
        'spitzname' => null,
        'rolle' => 'benutzer',
        'media_id' => null,
    ]
], 'Registrierung erfolgreich.', 201);
