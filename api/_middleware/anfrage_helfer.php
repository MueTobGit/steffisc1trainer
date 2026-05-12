<?php
/**
 * API Anfrage-Helfer
 *
 * Liest und verarbeitet eingehende API-Anfragen.
 */

declare(strict_types=1);

/**
 * HTTP-Methode pruefen und erzwingen
 *
 * @param string|array $erlaubt Erlaubte Methode(n)
 */
function methode_erzwingen(string|array $erlaubt): void
{
    $methode = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if (is_string($erlaubt)) {
        $erlaubt = [$erlaubt];
    }

    // OPTIONS immer erlauben (CORS Preflight)
    // PHP setzt die CORS-Header als Fallback, falls mod_headers in .htaccess nicht greift
    if ($methode === 'OPTIONS') {
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization');
        header('Access-Control-Max-Age: 86400'); // 24h cachen
        http_response_code(200);
        exit;
    }

    if (!in_array($methode, $erlaubt, true)) {
        fehler_methode_nicht_erlaubt($erlaubt);
    }
}

/**
 * JSON-Body der Anfrage lesen
 *
 * @param bool $pflicht Muss ein Body vorhanden sein?
 * @return array Decodierter Body
 */
function json_body_lesen(bool $pflicht = true): array
{
    $roh = file_get_contents('php://input');

    if (empty($roh)) {
        if ($pflicht) {
            fehler_ungueltige_eingabe('Anfrage-Body ist leer.');
        }
        return [];
    }

    $daten = json_decode($roh, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        fehler_ungueltige_eingabe('Ungueltiges JSON-Format: ' . json_last_error_msg());
    }

    return $daten;
}

/**
 * GET-Parameter sicher lesen
 */
function get_param(string $name, mixed $standard = null): mixed
{
    return $_GET[$name] ?? $standard;
}

/**
 * GET-Parameter als Integer
 */
function get_param_int(string $name, int $standard = 0): int
{
    $wert = $_GET[$name] ?? null;
    return ($wert !== null && is_numeric($wert)) ? (int) $wert : $standard;
}

/**
 * Paginierungs-Parameter auslesen
 *
 * @return array [seite, pro_seite]
 */
function paginierung_parameter(): array
{
    $seite = max(1, get_param_int('seite', 1));
    $pro_seite = get_param_int('pro_seite', STANDARD_PRO_SEITE);
    $pro_seite = max(1, min($pro_seite, MAX_PRO_SEITE));

    return [$seite, $pro_seite];
}

/**
 * ID aus URL-Pfad extrahieren
 *
 * Erwartet z.B. /api/vokabeln/42 → 42
 */
function id_aus_pfad(): ?int
{
    $pfad = $_SERVER['PATH_INFO'] ?? '';
    $teile = array_filter(explode('/', $pfad));
    $letztes = end($teile);

    if ($letztes !== false && is_numeric($letztes)) {
        return (int) $letztes;
    }

    return null;
}

/**
 * Content-Type pruefen (muss JSON sein bei POST/PUT)
 */
function json_content_type_pruefen(): void
{
    $methode = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if (in_array($methode, ['POST', 'PUT'], true)) {
        $content_type = $_SERVER['CONTENT_TYPE'] ?? '';

        // Multipart fuer Datei-Uploads erlauben
        if (str_contains($content_type, 'multipart/form-data')) {
            return;
        }

        if (!str_contains($content_type, 'application/json')) {
            // Tolerant: akzeptieren, aber loggen
            error_log("Warnung: Content-Type ist nicht application/json: {$content_type}");
        }
    }
}
