<?php
/**
 * API: Admin — SMTP-Verbindung testen
 *
 * POST /api/admin/smtp_testen.php
 *
 * Sendet eine Test-E-Mail ueber die konfigurierten SMTP-Einstellungen.
 * Empfaenger: uebergebene Adresse oder E-Mail des eingeloggten Admins.
 *
 * Body: { "an"?: "email@example.com" }
 *
 * Nur fuer Admins.
 */

declare(strict_types=1);

ob_start();

require_once dirname(__DIR__) . '/_middleware/antwort_helfer.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__, 2) . '/konfiguration/konstanten.php';
require_once dirname(__DIR__, 2) . '/konfiguration/datenbank.php';

methode_erzwingen('POST');

$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

$daten = json_body_lesen(true);

// Empfaenger bestimmen
$an_email = trim($daten['an'] ?? '');

if ($an_email === '') {
    // Standard: E-Mail des eingeloggten Admins
    $an_email = $benutzer['email'] ?? '';
}

if ($an_email === '' || !filter_var($an_email, FILTER_VALIDATE_EMAIL)) {
    ob_end_clean();
    json_fehler('UNGUELTIGE_EINGABE', 'Keine gueltige Empfaenger-E-Mail angegeben.');
}

// PHPMailer laden
require_once dirname(__DIR__, 2) . '/konfiguration/mail.php';

// Test-E-Mail zusammenbauen
$datum   = date('d.m.Y H:i:s');
$host    = $_SERVER['HTTP_HOST'] ?? 'localhost';
$von     = defined('SMTP_FROM') ? SMTP_FROM : 'konfiguriert';
$von_name = defined('SMTP_FROM_NAME') ? SMTP_FROM_NAME : 'Vokabeltrainer';

$html = mail_html_vorlage(
    "<p>Hej!</p>
    <p>Diese Test-E-Mail wurde vom <strong>Vokabeltrainer-Admin-Panel</strong> gesendet
    und bestaetigt, dass die SMTP-Konfiguration funktioniert.</p>
    <p><strong>Details:</strong></p>
    <ul style=\"font-size:14px;color:#344a5e;line-height:1.8;padding-left:1.2em\">
        <li>Gesendet am: {$datum}</li>
        <li>Server: {$host}</li>
        <li>SMTP-Host: " . (defined('SMTP_HOST') ? esc_html(SMTP_HOST) : '—') . "</li>
        <li>SMTP-Port: " . (defined('SMTP_PORT') ? (int)SMTP_PORT : '—') . "</li>
        <li>Absender: " . esc_html($von) . " (" . esc_html($von_name) . ")</li>
    </ul>
    <p>Falls du diese E-Mail erhalten hast, ist der E-Mail-Versand korrekt konfiguriert.</p>",
    'Vokabeltrainer — SMTP-Test'
);

// Mail senden — PHPMailer wirft Exception oder gibt false zurueck
// Wir brauchen die Fehlermeldung → direkt PHPMailer instanziieren

require_once dirname(__DIR__, 2) . '/vendor/phpmailer/phpmailer/src/Exception.php';
require_once dirname(__DIR__, 2) . '/vendor/phpmailer/phpmailer/src/PHPMailer.php';
require_once dirname(__DIR__, 2) . '/vendor/phpmailer/phpmailer/src/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;
use PHPMailer\PHPMailer\Exception as PHPMailerException;

$smtp_host = defined('SMTP_HOST') ? SMTP_HOST : '';

if ($smtp_host === '') {
    ob_end_clean();
    json_fehler('SMTP_NICHT_KONFIGURIERT', 'SMTP ist nicht konfiguriert (SMTP_HOST ist leer). Bitte zuerst die Server-Einstellungen speichern.');
}

try {
    $mail = new PHPMailer(true);

    // SMTP
    $mail->isSMTP();
    $mail->Host     = $smtp_host;
    $mail->Port     = defined('SMTP_PORT') ? (int)SMTP_PORT : 587;
    $mail->SMTPAuth = true;
    $mail->Username = defined('SMTP_USER') ? SMTP_USER : '';
    $mail->Password = defined('SMTP_PASS') ? SMTP_PASS : '';
    $mail->Timeout  = 10;

    $enc = strtolower((string)(defined('SMTP_VERSCHLUESSELUNG') ? SMTP_VERSCHLUESSELUNG : 'tls'));
    if ($enc === 'ssl') {
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
    } elseif ($enc === 'tls') {
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    } else {
        $mail->SMTPSecure = '';
        $mail->SMTPAutoTLS = false;
    }

    // Absender
    $von_addr = defined('SMTP_FROM')      ? SMTP_FROM      : ('noreply@' . $host);
    $von_nm   = defined('SMTP_FROM_NAME') ? SMTP_FROM_NAME : 'Vokabeltrainer';
    $mail->setFrom($von_addr, $von_nm);

    // Empfaenger
    $mail->addAddress($an_email);

    // Inhalt
    $mail->CharSet  = 'UTF-8';
    $mail->Encoding = 'quoted-printable';
    $mail->isHTML(true);
    $mail->Subject  = 'Vokabeltrainer — SMTP-Test';
    $mail->Body     = $html;
    $mail->AltBody  = "Vokabeltrainer SMTP-Test\nGesendet am: {$datum}\nSMTP-Host: {$smtp_host}\n\nFalls du diese E-Mail erhalten hast, funktioniert der E-Mail-Versand.";

    $mail->send();

    ob_end_clean();
    json_erfolg(
        ['empfaenger' => $an_email],
        "Test-E-Mail erfolgreich an {$an_email} gesendet."
    );

} catch (PHPMailerException $e) {
    ob_end_clean();
    json_fehler('SMTP_FEHLER', 'SMTP-Fehler: ' . $e->getMessage());
} catch (\Throwable $e) {
    ob_end_clean();
    json_fehler('SMTP_FEHLER', 'Fehler: ' . $e->getMessage());
}

/** Hilfsfunktion HTML escapen */
function esc_html(string $s): string {
    return htmlspecialchars($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
}
