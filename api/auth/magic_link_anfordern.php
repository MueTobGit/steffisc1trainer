<?php
/**
 * API: Auth — Magic Link anfordern
 *
 * POST /api/auth/magic_link_anfordern.php
 *
 * Sendet einen Einmal-Anmeldelink an die angegebene E-Mail-Adresse.
 * Funktioniert fuer Neu-Registrierung und bestehende Benutzer gleichermassen.
 * DSGVO: Gibt immer die gleiche Antwort zurueck (kein Hinweis ob E-Mail existiert).
 *
 * Body:
 *   - email   string (Pflicht)
 *   - hp_feld string (Honeypot, muss leer sein)
 */

declare(strict_types=1);

ob_start();

require_once dirname(__DIR__) . '/_middleware/antwort_helfer.php';
require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__, 2) . '/konfiguration/konstanten.php';
require_once dirname(__DIR__, 2) . '/konfiguration/hilfsfunktionen.php';
require_once dirname(__DIR__, 2) . '/konfiguration/mail.php';

set_error_handler(function (int $errno, string $errstr): bool {
    error_log("magic_link_anfordern [{$errno}]: {$errstr}");
    return true;
});

methode_erzwingen('POST');

$daten    = json_body_lesen(false);
$email    = isset($daten['email'])    ? trim((string) $daten['email'])    : '';
$hp_feld  = isset($daten['hp_feld']) ? trim((string) $daten['hp_feld']) : '';

// ---- Honeypot-Check: Bots fuellen verborgene Felder aus ----
if ($hp_feld !== '') {
    // Stille Erfolgsantwort — kein Fehler fuer Bot (Verwirrungstaktik)
    ob_end_clean();
    restore_error_handler();
    json_erfolg([], 'Falls die Adresse registriert ist, wurde ein Link versendet.');
}

// ---- E-Mail validieren ----
if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    ob_end_clean();
    restore_error_handler();
    fehler_ungueltige_eingabe('Bitte gib eine gueltige E-Mail-Adresse ein.');
}

$email = strtolower($email);

// ---- Rate-Limiting: 3 Anfragen pro 10 Minuten pro IP ----
if (!rate_limit_pruefen('magic_link', 3, 10)) {
    ob_end_clean();
    restore_error_handler();
    fehler_rate_limit(); // Korrekte Funktion aus antwort_helfer.php
}

$pdo = db_verbindung();

// ---- Benutzer suchen (nur als Kontext fuer personalisierte Mail) ----
$stmt = $pdo->prepare("SELECT id, vorname, benutzername FROM benutzer WHERE LOWER(email) = ? AND aktiv = TRUE");
$stmt->execute([$email]);
$benutzer = $stmt->fetch(\PDO::FETCH_ASSOC);
// Kein benutzer-Found = Neu-Registrierung, kein Fehler — Magic Link erstellt Konto beim Verifizieren

// ---- Token erzeugen + speichern ----
$token    = token_erzeugen(32); // ergibt 64 Hex-Zeichen
$gueltig  = (int) konfig_wert('magic_link_gueltig_minuten', '15');
$ablauf   = date('Y-m-d H:i:s', time() + $gueltig * 60);

try {
    // Alte Token deaktivieren
    $pdo->prepare("UPDATE magic_link_tokens SET genutzt = TRUE WHERE email = ? AND genutzt = FALSE")
        ->execute([$email]);

    // Neuen Token eintragen
    $pdo->prepare("INSERT INTO magic_link_tokens (email, token, ablauf_am) VALUES (?, ?, ?)")
        ->execute([$email, $token, $ablauf]);

} catch (\PDOException $e) {
    // Haeufigste Ursache: Tabelle existiert noch nicht (Migration nicht ausgefuehrt!)
    error_log("magic_link_anfordern: DB-Fehler (Schema aktuell?): " . $e->getMessage());
    ob_end_clean();
    restore_error_handler();
    // Neutraler Fehler — keine Info nach aussen
    json_fehler('SERVER_FEHLER', 'Technischer Fehler. Bitte Administrator kontaktieren.', 500);
}

// ---- Anmeldelink zusammenbauen ----
$protokoll   = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host        = $_SERVER['HTTP_HOST'] ?? 'localhost';
$anmelde_url = "{$protokoll}://{$host}" . BASIS_URL . "/verifizieren.php?token=" . urlencode($token);

// ---- E-Mail senden ----
$vorname = $benutzer ? esc((string) ($benutzer['vorname'] ?: $benutzer['benutzername'])) : 'Hej';
$inhalt  = "
    <p>Hej {$vorname}!</p>
    <p>Du hast einen Anmeldelink angefordert. Klicke auf den Button, um dich anzumelden:</p>
    <p style=\"text-align:center\">
        <a href=\"{$anmelde_url}\" class=\"btn\">&#x1F511; Jetzt anmelden</a>
    </p>
    <p>Oder kopiere diesen Link in deinen Browser:</p>
    <p style=\"word-break:break-all;font-size:12px;color:#607d8b\">{$anmelde_url}</p>
    <div class=\"hinweis\">
        &#x23F0; Dieser Link ist <strong>{$gueltig} Minuten</strong> gueltig und kann nur einmal verwendet werden.<br>
        Falls du keinen Link angefordert hast, ignoriere diese E-Mail einfach.
    </div>
";

$html     = mail_html_vorlage($inhalt, 'Dein Anmeldelink');
$gesendet = mail_senden($email, $benutzer ? ($benutzer['vorname'] ?: '') : '', 'Dein Anmeldelink — Vokabeltrainer', $html);

if (!$gesendet) {
    error_log("magic_link_anfordern: E-Mail-Versand fehlgeschlagen fuer {$email} (SMTP konfiguriert? SMTP_HOST gesetzt?)");
}

ob_end_clean();
restore_error_handler();

json_erfolg(
    ['ablauf_minuten' => $gueltig],
    'Falls die Adresse registriert ist, haben wir dir einen Anmeldelink gesendet.'
);
