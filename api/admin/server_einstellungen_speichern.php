<?php
/**
 * API: Admin — Server-Einstellungen speichern
 *
 * POST /api/admin/server_einstellungen_speichern.php
 *
 * Schreibt DB- und SMTP-Einstellungen in umgebung.php.
 * Passwortfelder mit Wert "__GESETZT__" oder "__UNVERAENDERT__"
 * werden NICHT ueberschrieben (bestehender Wert bleibt).
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

methode_erzwingen('POST');

$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

$daten = json_body_lesen(true);

$umgebung_pfad = dirname(__DIR__, 2) . '/konfiguration/umgebung.php';

if (!file_exists($umgebung_pfad)) {
    ob_end_clean();
    fehler_server('umgebung.php nicht gefunden.');
}

if (!is_writable($umgebung_pfad)) {
    ob_end_clean();
    fehler_server('umgebung.php ist nicht schreibbar. Bitte Dateirechte pruefen.');
}

// Bestehende Datei lesen (fuer Passwort-Beibehaltung)
$alter_inhalt = file_get_contents($umgebung_pfad);

/**
 * Bestehenden define()-Wert aus Datei lesen.
 */
function _alten_wert_lesen(string $inhalt, string $schluessel): string
{
    $pattern = "/define\(\s*['\"]" . preg_quote($schluessel, '/') . "['\"]\s*,\s*(.+?)\s*\)\s*;/";
    if (!preg_match($pattern, $inhalt, $treffer)) return '';
    $raw = trim($treffer[1]);
    if (preg_match("/^['\"](.*)['\"]\$/", $raw, $m)) return $m[1];
    return is_numeric($raw) ? $raw : $raw;
}

/**
 * Wert aus POST-Daten holen, Passwort-Platzhalter behandeln.
 */
function _wert(array $daten, string $schluessel, string $alter_wert): string
{
    $neu = isset($daten[$schluessel]) ? (string) $daten[$schluessel] : '';
    // Wenn "__GESETZT__" oder "__UNVERAENDERT__" → alten Wert behalten
    if (in_array($neu, ['__GESETZT__', '__UNVERAENDERT__'], true)) {
        return $alter_wert;
    }
    return $neu;
}

// Alte Passwort-Werte lesen
$alter_db_pass   = _alten_wert_lesen($alter_inhalt, 'DB_PASS');
$alter_smtp_pass = _alten_wert_lesen($alter_inhalt, 'SMTP_PASS');

// Neue Werte zusammenbauen
$db    = $daten['db']    ?? [];
$smtp  = $daten['smtp']  ?? [];
$allg  = $daten['allgemein'] ?? [];

$db_host    = _wert($db, 'host',     _alten_wert_lesen($alter_inhalt, 'DB_HOST'));
$db_name    = _wert($db, 'name',     _alten_wert_lesen($alter_inhalt, 'DB_NAME'));
$db_user    = _wert($db, 'benutzer', _alten_wert_lesen($alter_inhalt, 'DB_USER'));
$db_pass    = _wert($db, 'passwort', $alter_db_pass);
$db_charset = _wert($db, 'charset',  'utf8mb4') ?: 'utf8mb4';

$smtp_host  = _wert($smtp, 'host',             _alten_wert_lesen($alter_inhalt, 'SMTP_HOST'));
$smtp_port  = (int) (_wert($smtp, 'port',      _alten_wert_lesen($alter_inhalt, 'SMTP_PORT')) ?: '587');
$smtp_enc   = _wert($smtp, 'verschluesselung', 'tls');
$smtp_user  = _wert($smtp, 'benutzer',         _alten_wert_lesen($alter_inhalt, 'SMTP_USER'));
$smtp_pass  = _wert($smtp, 'passwort',         $alter_smtp_pass);
$smtp_von   = _wert($smtp, 'von',              _alten_wert_lesen($alter_inhalt, 'SMTP_FROM'));
$smtp_name  = _wert($smtp, 'von_name',         'Vokabeltrainer') ?: 'Vokabeltrainer';

$basis_url  = _wert($allg, 'basis_url', _alten_wert_lesen($alter_inhalt, 'BASIS_URL_WERT'));
$umgebung   = _wert($allg, 'umgebung',  'production');
if (!in_array($umgebung, ['development', 'production'], true)) {
    $umgebung = 'production';
}

// Hilfsfunktion: PHP-String escapen fuer define()
function _php_string(string $wert): string
{
    return "'" . addslashes($wert) . "'";
}

// Neue umgebung.php generieren
$neuer_inhalt = <<<PHP
<?php
/**
 * Umgebungskonfiguration — NICHT ins Repository / nicht hochladen!
 *
 * Diese Datei enthaelt alle umgebungsspezifischen Einstellungen.
 * Lokal: XAMPP-Einstellungen
 * Produktion: Hoster-Zugangsdaten eintragen
 *
 * Vorlage: umgebung.beispiel.php
 * Zuletzt geaendert: {$_datum} (via Admin-Panel)
 */

// ---- Datenbankzugangsdaten ----
define('DB_HOST',    {$_db_host_s});
define('DB_NAME',    {$_db_name_s});
define('DB_USER',    {$_db_user_s});
define('DB_PASS',    {$_db_pass_s});
define('DB_CHARSET', {$_db_charset_s});

// ---- Basis-URL der App ----
// Lokal mit XAMPP:  '/vokabeltrainer'
// Root-Domain:      ''
// Unterordner:      '/app'
define('BASIS_URL_WERT', {$_basis_url_s});

// ---- E-Mail / SMTP (PHPMailer) ----
define('SMTP_HOST',             {$_smtp_host_s});
define('SMTP_PORT',             {$_smtp_port});
define('SMTP_VERSCHLUESSELUNG', {$_smtp_enc_s});
define('SMTP_USER',             {$_smtp_user_s});
define('SMTP_PASS',             {$_smtp_pass_s});
define('SMTP_FROM',             {$_smtp_von_s});
define('SMTP_FROM_NAME',        {$_smtp_name_s});

// ---- Umgebungstyp ----
define('APP_UMGEBUNG', {$_umgebung_s});

PHP;

// Template-Variablen einsetzen
$_datum       = date('Y-m-d H:i:s');
$_db_host_s   = _php_string($db_host);
$_db_name_s   = _php_string($db_name);
$_db_user_s   = _php_string($db_user);
$_db_pass_s   = _php_string($db_pass);
$_db_charset_s= _php_string($db_charset);
$_basis_url_s = _php_string($basis_url);
$_smtp_host_s = _php_string($smtp_host);
$_smtp_port   = $smtp_port;
$_smtp_enc_s  = _php_string($smtp_enc);
$_smtp_user_s = _php_string($smtp_user);
$_smtp_pass_s = _php_string($smtp_pass);
$_smtp_von_s  = _php_string($smtp_von);
$_smtp_name_s = _php_string($smtp_name);
$_umgebung_s  = _php_string($umgebung);

// Heredoc neu aufbauen mit tatsaechlichen Werten (da Heredoc ${} keine Expressions haette)
$neuer_inhalt = "<?php\n";
$neuer_inhalt .= "/**\n";
$neuer_inhalt .= " * Umgebungskonfiguration — NICHT ins Repository / nicht hochladen!\n";
$neuer_inhalt .= " * Zuletzt geaendert: {$_datum} (via Admin-Panel)\n";
$neuer_inhalt .= " */\n\n";
$neuer_inhalt .= "// ---- Datenbankzugangsdaten ----\n";
$neuer_inhalt .= "define('DB_HOST',    {$_db_host_s});\n";
$neuer_inhalt .= "define('DB_NAME',    {$_db_name_s});\n";
$neuer_inhalt .= "define('DB_USER',    {$_db_user_s});\n";
$neuer_inhalt .= "define('DB_PASS',    {$_db_pass_s});\n";
$neuer_inhalt .= "define('DB_CHARSET', {$_db_charset_s});\n\n";
$neuer_inhalt .= "// ---- Basis-URL der App ----\n";
$neuer_inhalt .= "// Lokal: '/vokabeltrainer'  |  Root-Domain: ''  |  Unterordner: '/app'\n";
$neuer_inhalt .= "define('BASIS_URL_WERT', {$_basis_url_s});\n\n";
$neuer_inhalt .= "// ---- E-Mail / SMTP (PHPMailer) ----\n";
$neuer_inhalt .= "define('SMTP_HOST',             {$_smtp_host_s});\n";
$neuer_inhalt .= "define('SMTP_PORT',             {$_smtp_port});\n";
$neuer_inhalt .= "define('SMTP_VERSCHLUESSELUNG', {$_smtp_enc_s});\n";
$neuer_inhalt .= "define('SMTP_USER',             {$_smtp_user_s});\n";
$neuer_inhalt .= "define('SMTP_PASS',             {$_smtp_pass_s});\n";
$neuer_inhalt .= "define('SMTP_FROM',             {$_smtp_von_s});\n";
$neuer_inhalt .= "define('SMTP_FROM_NAME',        {$_smtp_name_s});\n\n";
$neuer_inhalt .= "// ---- Umgebungstyp ----\n";
$neuer_inhalt .= "define('APP_UMGEBUNG', {$_umgebung_s});\n";

// Backup der alten Datei
$backup_pfad = $umgebung_pfad . '.bak';
@copy($umgebung_pfad, $backup_pfad);

// Neue Datei schreiben
$geschrieben = file_put_contents($umgebung_pfad, $neuer_inhalt, LOCK_EX);

if ($geschrieben === false) {
    ob_end_clean();
    fehler_server('umgebung.php konnte nicht geschrieben werden.');
}

// PHP-Opcache leeren damit Aenderungen sofort wirksam sind
if (function_exists('opcache_reset')) {
    opcache_reset();
}

ob_end_clean();

json_erfolg(
    ['bytes' => $geschrieben],
    'Server-Einstellungen gespeichert.'
);
