<?php
/**
 * API: Admin — Server-Einstellungen laden
 *
 * GET /api/admin/server_einstellungen_laden.php
 *
 * Liest die aktuellen Werte aus umgebung.php (DB + SMTP).
 * Passwortfelder werden NICHT im Klartext zurueckgegeben —
 * stattdessen wird "gesetzt" oder "" zurueckgegeben.
 *
 * Nur fuer Admins.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/antwort_helfer.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__, 2) . '/konfiguration/konstanten.php';

methode_erzwingen('GET');

$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

$umgebung_pfad = dirname(__DIR__, 2) . '/konfiguration/umgebung.php';

if (!file_exists($umgebung_pfad)) {
    fehler_server('umgebung.php nicht gefunden.');
}

// Datei-Inhalt lesen und define()-Werte extrahieren
$inhalt = file_get_contents($umgebung_pfad);

/**
 * Wert einer define()-Anweisung aus PHP-Datei extrahieren.
 * Unterstuetzt: string, int, bool (true/false), leerer String.
 */
function _define_wert_lesen(string $inhalt, string $schluessel): string
{
    // Regex: define('KEY', 'wert') oder define('KEY', 123) oder define('KEY', true)
    $pattern = "/define\(\s*['\"]" . preg_quote($schluessel, '/') . "['\"]\s*,\s*(.+?)\s*\)\s*;/";
    if (!preg_match($pattern, $inhalt, $treffer)) {
        return '';
    }

    $raw = trim($treffer[1]);

    // String in einfachen oder doppelten Anführungszeichen
    if (preg_match("/^['\"](.*)['\"]\$/", $raw, $m)) {
        return $m[1];
    }

    // Zahl
    if (is_numeric($raw)) {
        return $raw;
    }

    // Boolean
    if (strtolower($raw) === 'true')  return 'true';
    if (strtolower($raw) === 'false') return 'false';

    return $raw;
}

// Passwort-Felder: nur Hinweis ob gesetzt
function _passwort_hinweis(string $inhalt, string $schluessel): string
{
    $wert = _define_wert_lesen($inhalt, $schluessel);
    return $wert !== '' ? '__GESETZT__' : '';
}

json_erfolg([
    'db' => [
        'host'    => _define_wert_lesen($inhalt, 'DB_HOST'),
        'name'    => _define_wert_lesen($inhalt, 'DB_NAME'),
        'benutzer'=> _define_wert_lesen($inhalt, 'DB_USER'),
        'passwort'=> _passwort_hinweis($inhalt, 'DB_PASS'),
        'charset' => _define_wert_lesen($inhalt, 'DB_CHARSET') ?: 'utf8mb4',
    ],
    'smtp' => [
        'host'             => _define_wert_lesen($inhalt, 'SMTP_HOST'),
        'port'             => _define_wert_lesen($inhalt, 'SMTP_PORT') ?: '587',
        'verschluesselung' => _define_wert_lesen($inhalt, 'SMTP_VERSCHLUESSELUNG') ?: 'tls',
        'benutzer'         => _define_wert_lesen($inhalt, 'SMTP_USER'),
        'passwort'         => _passwort_hinweis($inhalt, 'SMTP_PASS'),
        'von'              => _define_wert_lesen($inhalt, 'SMTP_FROM'),
        'von_name'         => _define_wert_lesen($inhalt, 'SMTP_FROM_NAME') ?: 'Vokabeltrainer',
    ],
    'allgemein' => [
        'basis_url'   => _define_wert_lesen($inhalt, 'BASIS_URL_WERT'),
        'umgebung'    => _define_wert_lesen($inhalt, 'APP_UMGEBUNG'),
    ],
    'schreibbar' => is_writable($umgebung_pfad),
]);
