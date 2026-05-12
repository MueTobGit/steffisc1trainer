<?php
/**
 * E-Mail-Versand via PHPMailer (SMTP)
 *
 * Zentrale Funktion fuer den E-Mail-Versand in der gesamten Anwendung.
 * Konfiguration kommt aus umgebung.php (SMTP_HOST, SMTP_PORT, ...).
 *
 * Fallback: Wenn SMTP_HOST leer ist, wird natives PHP mail() versucht.
 */

declare(strict_types=1);

// PHPMailer laden (manuell installiert, kein Composer)
require_once BASIS_PFAD . '/vendor/phpmailer/phpmailer/src/Exception.php';
require_once BASIS_PFAD . '/vendor/phpmailer/phpmailer/src/PHPMailer.php';
require_once BASIS_PFAD . '/vendor/phpmailer/phpmailer/src/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;
use PHPMailer\PHPMailer\Exception as PHPMailerException;

/**
 * E-Mail senden.
 *
 * @param string $an_email      Empfaenger-Adresse
 * @param string $an_name       Empfaenger-Name (darf leer sein)
 * @param string $betreff       E-Mail-Betreff
 * @param string $html_body     HTML-Inhalt der E-Mail
 * @param string $text_body     Plaintext-Fallback (wird automatisch generiert wenn leer)
 * @return bool                 true bei Erfolg, false bei Fehler
 */
function mail_senden(
    string $an_email,
    string $an_name,
    string $betreff,
    string $html_body,
    string $text_body = ''
): bool {
    // Plaintext-Fallback automatisch erzeugen
    if ($text_body === '') {
        $text_body = strip_tags(
            preg_replace(['/<br\s*\/?>/i', '/<\/p>/i', '/<\/div>/i'], "\n", $html_body) ?? $html_body
        );
        $text_body = html_entity_decode($text_body, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text_body = preg_replace('/\n{3,}/', "\n\n", trim($text_body)) ?? trim($text_body);
    }

    // SMTP-Host aus Konfiguration
    $smtp_host = defined('SMTP_HOST') ? SMTP_HOST : '';

    // Fallback: natives mail() wenn kein SMTP konfiguriert
    if ($smtp_host === '') {
        return _mail_nativ_senden($an_email, $an_name, $betreff, $html_body, $text_body);
    }

    try {
        $mail = new PHPMailer(true); // true = Exceptions aktivieren

        // ---- SMTP-Einstellungen ----
        $mail->isSMTP();
        $mail->Host       = $smtp_host;
        $mail->Port       = defined('SMTP_PORT') ? (int) SMTP_PORT : 587;
        $mail->SMTPAuth   = true;
        $mail->Username   = defined('SMTP_USER') ? SMTP_USER : '';
        $mail->Password   = defined('SMTP_PASS') ? SMTP_PASS : '';

        $verschluesselung = defined('SMTP_VERSCHLUESSELUNG') ? strtolower((string) SMTP_VERSCHLUESSELUNG) : 'tls';
        if ($verschluesselung === 'ssl') {
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
        } elseif ($verschluesselung === 'tls') {
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        } else {
            $mail->SMTPSecure = '';
            $mail->SMTPAutoTLS = false;
        }

        // ---- Absender ----
        $from      = defined('SMTP_FROM')      ? SMTP_FROM      : ('noreply@' . ($_SERVER['HTTP_HOST'] ?? 'localhost'));
        $from_name = defined('SMTP_FROM_NAME') ? SMTP_FROM_NAME : 'Vokabeltrainer';
        $mail->setFrom($from, $from_name);
        $mail->addReplyTo($from, $from_name);

        // ---- Empfaenger ----
        $mail->addAddress($an_email, $an_name);

        // ---- Inhalt ----
        $mail->CharSet  = 'UTF-8';
        $mail->Encoding = 'quoted-printable';
        $mail->isHTML(true);
        $mail->Subject  = $betreff;
        $mail->Body     = $html_body;
        $mail->AltBody  = $text_body;

        // Debug nur in Entwicklungsumgebung
        if (defined('APP_UMGEBUNG') && APP_UMGEBUNG === 'development') {
            $mail->SMTPDebug = SMTP::DEBUG_OFF; // Auf SMTP::DEBUG_SERVER fuer SMTP-Logs
        }

        $mail->send();
        return true;

    } catch (PHPMailerException $e) {
        error_log("mail_senden() PHPMailer-Fehler an {$an_email}: " . $e->getMessage());
        return false;
    } catch (\Throwable $e) {
        error_log("mail_senden() unerwarteter Fehler: " . $e->getMessage());
        return false;
    }
}

/**
 * Natives PHP mail() als Fallback wenn kein SMTP konfiguriert.
 * Funktioniert nur wenn der Server Sendmail/Postfix konfiguriert hat.
 */
function _mail_nativ_senden(
    string $an_email,
    string $an_name,
    string $betreff,
    string $html_body,
    string $text_body
): bool {
    $from      = 'noreply@' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
    $from_name = 'Vokabeltrainer';

    $grenze = 'VT_MAIL_' . bin2hex(random_bytes(8));
    $headers = implode("\r\n", [
        "MIME-Version: 1.0",
        "Content-Type: multipart/alternative; boundary=\"{$grenze}\"",
        "From: =?UTF-8?B?" . base64_encode("{$from_name}") . "?= <{$from}>",
        "Reply-To: {$from}",
        "X-Mailer: Vokabeltrainer",
    ]);

    $body  = "--{$grenze}\r\n";
    $body .= "Content-Type: text/plain; charset=UTF-8\r\n";
    $body .= "Content-Transfer-Encoding: quoted-printable\r\n\r\n";
    $body .= quoted_printable_encode($text_body) . "\r\n";
    $body .= "--{$grenze}\r\n";
    $body .= "Content-Type: text/html; charset=UTF-8\r\n";
    $body .= "Content-Transfer-Encoding: quoted-printable\r\n\r\n";
    $body .= quoted_printable_encode($html_body) . "\r\n";
    $body .= "--{$grenze}--";

    $betreff_encoded = '=?UTF-8?B?' . base64_encode($betreff) . '?=';
    $an = $an_name ? "=?UTF-8?B?" . base64_encode($an_name) . "?= <{$an_email}>" : $an_email;

    $gesendet = @mail($an, $betreff_encoded, $body, $headers);
    if (!$gesendet) {
        error_log("mail_senden() natives mail() fehlgeschlagen an {$an_email}");
    }
    return (bool) $gesendet;
}

/**
 * HTML-Vorlage fuer E-Mails erzeugen.
 * Gibt vollstaendiges HTML-Dokument mit App-Branding zurueck.
 *
 * @param string $inhalt    HTML-Inhalt (ohne html/body tags)
 * @param string $betreff   Wird als Titel verwendet
 */
function mail_html_vorlage(string $inhalt, string $betreff = ''): string
{
    $basis_url = defined('BASIS_URL') ? BASIS_URL : '';
    $app_url   = ($_SERVER['HTTP_HOST'] ?? 'localhost') . $basis_url;
    $jahr      = date('Y');

    return <<<HTML
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{$betreff}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background-color: #f0f4f8;
    color: #1a1c1e;
    padding: 24px 16px;
    line-height: 1.6;
  }
  .container {
    max-width: 520px;
    margin: 0 auto;
    background: #ffffff;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 4px 24px rgba(0,0,0,0.10);
  }
  .header {
    background-color: #006AA7;
    color: #ffffff;
    padding: 28px 32px 24px;
    text-align: center;
  }
  .header .flagge { font-size: 40px; display: block; margin-bottom: 8px; }
  .header h1 { font-size: 20px; font-weight: 500; margin: 0; }
  .body { padding: 32px; }
  .body p { margin-bottom: 16px; font-size: 15px; color: #344a5e; }
  .body p:last-child { margin-bottom: 0; }
  .btn {
    display: inline-block;
    background-color: #006AA7;
    color: #ffffff !important;
    text-decoration: none;
    padding: 14px 28px;
    border-radius: 28px;
    font-size: 15px;
    font-weight: 600;
    margin: 8px 0 16px;
  }
  .hinweis {
    background-color: #e3f2fd;
    border-radius: 8px;
    padding: 12px 16px;
    font-size: 13px;
    color: #0d47a1;
    margin-top: 16px;
  }
  .footer {
    padding: 16px 32px;
    border-top: 1px solid #e0e0e0;
    text-align: center;
    font-size: 12px;
    color: #90a4ae;
  }
  .footer a { color: #006AA7; text-decoration: none; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <span class="flagge">&#x1F1F8;&#x1F1EA;</span>
    <h1>Vokabeltrainer &mdash; Schwedisch</h1>
  </div>
  <div class="body">
    {$inhalt}
  </div>
  <div class="footer">
    &copy; {$jahr} Vokabeltrainer &middot;
    <a href="https://{$app_url}">Zur App</a>
  </div>
</div>
</body>
</html>
HTML;
}
