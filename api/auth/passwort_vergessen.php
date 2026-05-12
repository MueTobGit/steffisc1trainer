<?php
/**
 * POST /api/auth/passwort_vergessen.php
 *
 * Passwort-Zuruecksetzung per E-Mail anfordern.
 * Generiert einen Reset-Token und sendet eine E-Mail.
 *
 * Body: { "email": "..." }
 * Response: { erfolg: true, nachricht: "..." }
 *
 * Hinweis: Gibt immer Erfolg zurueck (auch bei unbekannter E-Mail),
 * um keine Information ueber registrierte Adressen preiszugeben.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/antwort_helfer.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__, 2) . '/konfiguration/datenbank.php';
require_once dirname(__DIR__, 2) . '/konfiguration/konstanten.php';
require_once dirname(__DIR__, 2) . '/konfiguration/hilfsfunktionen.php';
require_once dirname(__DIR__, 2) . '/konfiguration/mail.php';

// Nur POST erlaubt
methode_erzwingen('POST');

// Rate-Limiting pruefen
if (!rate_limit_pruefen('passwort_vergessen', 3, 30)) {
    fehler_rate_limit();
}

// Body lesen
$daten = json_body_lesen();
pflichtfelder_pruefen($daten, ['email']);

$email = trim($daten['email']);
email_validieren($email);

// Immer gleiche Antwort (Timing-Attack-Schutz)
$standard_antwort = 'Falls ein Konto mit dieser E-Mail existiert, wurde eine Nachricht zum Zuruecksetzen gesendet.';

$pdo = db_verbindung();

// Benutzer suchen
$stmt = $pdo->prepare("SELECT id, benutzername, vorname, aktiv FROM benutzer WHERE email = ?");
$stmt->execute([$email]);
$benutzer = $stmt->fetch();

if (!$benutzer || !$benutzer['aktiv']) {
    // Keine Info preisgeben
    json_erfolg(null, $standard_antwort);
}

// Reset-Token erzeugen (24 Stunden gueltig)
$reset_token = token_erzeugen();
$gueltig_bis = (new DateTime())->modify('+24 hours')->format('Y-m-d H:i:s');

// Token als spezielles API-Token speichern (Geraet = 'passwort_reset')
// Alte Reset-Tokens deaktivieren
$stmt = $pdo->prepare("
    UPDATE api_tokens SET aktiv = FALSE
    WHERE benutzer_id = ? AND geraet = 'passwort_reset'
");
$stmt->execute([$benutzer['id']]);

// Neues Reset-Token erstellen
$stmt = $pdo->prepare("
    INSERT INTO api_tokens (benutzer_id, token, geraet, gueltig_bis)
    VALUES (?, ?, 'passwort_reset', ?)
");
$stmt->execute([$benutzer['id'], $reset_token, $gueltig_bis]);

// E-Mail senden
$name = $benutzer['vorname'] ?: $benutzer['benutzername'];
$protokoll  = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$reset_link = $protokoll . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') .
    BASIS_URL . '/#/passwort-reset?token=' . $reset_token;

$betreff = 'Vokabeltrainer — Passwort zuruecksetzen';

$html_body = mail_html_vorlage(
    "<p>Hej {$name}!</p>
    <p>Du hast eine Passwort-Zuruecksetzung angefordert.</p>
    <p style=\"text-align:center\">
        <a href=\"{$reset_link}\" class=\"btn\">&#x1F512; Passwort zuruecksetzen</a>
    </p>
    <p>Oder kopiere diesen Link in deinen Browser:</p>
    <p style=\"word-break:break-all;font-size:13px;color:#546e7a\">{$reset_link}</p>
    <div class=\"hinweis\">Der Link ist <strong>24 Stunden</strong> gueltig.
    Falls du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren.</div>",
    $betreff
);

$gesendet = mail_senden($email, $name, $betreff, $html_body);

if (!$gesendet) {
    error_log("Passwort-Reset-Mail konnte nicht an {$email} gesendet werden.");
}

// Aktivitaet loggen
$stmt = $pdo->prepare("
    INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung)
    VALUES (?, 'admin_aktion', 'Passwort-Zuruecksetzung angefordert')
");
$stmt->execute([$benutzer['id']]);

json_erfolg(null, $standard_antwort);
