<?php
/**
 * API Authentifizierung
 *
 * Bearer-Token-basierte Authentifizierung.
 * Prueft Token-Gueltigkeit und laedt Benutzerdaten.
 */

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/konfiguration/datenbank.php';
require_once dirname(__DIR__, 2) . '/konfiguration/konstanten.php';
require_once dirname(__DIR__, 2) . '/konfiguration/hilfsfunktionen.php';
require_once __DIR__ . '/antwort_helfer.php';

/**
 * Aktuellen Benutzer anhand des Bearer-Tokens authentifizieren
 *
 * @param bool $pflicht Muss authentifiziert sein? (Standard: ja)
 * @return array|null Benutzerdaten oder null
 */
function benutzer_authentifizieren(bool $pflicht = true): ?array
{
    $token = bearer_token_lesen();

    if ($token === null) {
        if ($pflicht) {
            fehler_nicht_authentifiziert('Kein Authorization-Header vorhanden.');
        }
        return null;
    }

    $pdo = db_verbindung();

    // Token + Benutzer laden
    $sql = "
        SELECT
            t.id AS token_id,
            t.gueltig_bis,
            t.aktiv AS token_aktiv,
            t.geraet AS token_geraet,
            b.id,
            b.benutzername,
            b.vorname,
            b.nachname,
            b.email,
            b.spitzname,
            b.rolle,
            b.aktiv,
            b.media_id,
            b.sprache
        FROM api_tokens t
        JOIN benutzer b ON b.id = t.benutzer_id
        WHERE t.token = ?
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$token]);
    $ergebnis = $stmt->fetch();

    if (!$ergebnis) {
        if ($pflicht) {
            fehler_nicht_authentifiziert('Ungueltiges Token.');
        }
        return null;
    }

    // Token aktiv?
    if (!$ergebnis['token_aktiv']) {
        if ($pflicht) {
            fehler_nicht_authentifiziert('Token wurde deaktiviert.');
        }
        return null;
    }

    // Passwort-Reset-Tokens duerfen nicht als API-Tokens genutzt werden
    if ($ergebnis['token_geraet'] === 'passwort_reset') {
        if ($pflicht) {
            fehler_nicht_authentifiziert('Ungueltiges Token.');
        }
        return null;
    }

    // Token abgelaufen?
    $gueltig_bis = new DateTime($ergebnis['gueltig_bis']);
    if ($gueltig_bis < new DateTime()) {
        if ($pflicht) {
            fehler_token_abgelaufen();
        }
        return null;
    }

    // Benutzer aktiv?
    if (!$ergebnis['aktiv']) {
        if ($pflicht) {
            fehler_nicht_berechtigt('Benutzerkonto ist deaktiviert.');
        }
        return null;
    }

    // Token-ID fuer spaetere Referenz
    $token_id = $ergebnis['token_id'];
    unset($ergebnis['token_id'], $ergebnis['gueltig_bis'], $ergebnis['token_aktiv'], $ergebnis['token_geraet']);

    // Benutzer-Array aufbereiten
    $ergebnis['token_id'] = $token_id;
    $ergebnis['id'] = (int) $ergebnis['id'];
    $ergebnis['aktiv'] = (bool) $ergebnis['aktiv'];
    $ergebnis['media_id'] = $ergebnis['media_id'] ? (int) $ergebnis['media_id'] : null;

    return $ergebnis;
}

/**
 * Bearer-Token aus dem Authorization-Header extrahieren
 *
 * Reihenfolge der Quellen:
 *  1. $_SERVER['HTTP_AUTHORIZATION']          — mod_php oder FPM mit RewriteRule-Fix
 *  2. $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] — Apache-interne Weiterleitungen
 *  3. apache_request_headers()                — Fallback fuer bestimmte Apache-Setups
 *
 * Bei PHP-FPM (dogado) wird der Authorization-Header von Apache normalerweise
 * NICHT an PHP weitergegeben. Die RewriteRule in api/.htaccess setzt ihn
 * explizit als Umgebungsvariable, wodurch er in $_SERVER['HTTP_AUTHORIZATION']
 * landet. Ohne diesen Fix schlaegt jede Token-Pruefung mit 401 fehl.
 */
function bearer_token_lesen(): ?string
{
    $header = $_SERVER['HTTP_AUTHORIZATION']
        ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
        ?? null;

    // Fallback: apache_request_headers() (nicht immer verfuegbar bei FPM)
    if ($header === null && function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        $header = $headers['Authorization'] ?? $headers['authorization'] ?? null;
    }

    if ($header === null) {
        return null;
    }

    // "Bearer <token>" extrahieren
    if (preg_match('/^Bearer\s+(.+)$/i', $header, $treffer)) {
        return trim($treffer[1]);
    }

    return null;
}
