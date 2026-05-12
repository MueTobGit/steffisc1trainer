<?php
/**
 * API Antwort-Helfer
 *
 * Standardisierte JSON-Antworten fuer alle API-Endpoints.
 */

declare(strict_types=1);

/**
 * Erfolgs-Antwort senden
 *
 * @param mixed $daten Daten-Payload
 * @param string $nachricht Optionale Erfolgsnachricht
 * @param int $status HTTP-Statuscode (Standard: 200)
 */
function json_erfolg(mixed $daten = null, string $nachricht = '', int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');

    $antwort = ['erfolg' => true];

    if ($daten !== null) {
        $antwort['daten'] = $daten;
    }

    if ($nachricht !== '') {
        $antwort['nachricht'] = $nachricht;
    }

    echo json_encode($antwort, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Fehler-Antwort senden
 *
 * @param string $code Fehler-Code (z.B. NICHT_AUTHENTIFIZIERT)
 * @param string $nachricht Fehlerbeschreibung
 * @param int $status HTTP-Statuscode
 * @param array $details Optionale Details
 */
function json_fehler(string $code, string $nachricht, int $status = 400, array $details = []): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');

    $antwort = [
        'erfolg' => false,
        'fehler' => [
            'code' => $code,
            'nachricht' => $nachricht,
        ]
    ];

    if (!empty($details)) {
        $antwort['fehler']['details'] = $details;
    }

    echo json_encode($antwort, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Paginierte Erfolgs-Antwort
 */
function json_paginiert(array $daten, array $paginierung, string $nachricht = ''): void
{
    json_erfolg([
        'eintraege' => $daten,
        'paginierung' => $paginierung,
    ], $nachricht);
}

// ---- Haeufige Fehler als Helfer ----

function fehler_nicht_authentifiziert(string $nachricht = 'Authentifizierung erforderlich.'): void
{
    json_fehler('NICHT_AUTHENTIFIZIERT', $nachricht, 401);
}

function fehler_token_abgelaufen(): void
{
    json_fehler('TOKEN_ABGELAUFEN', 'Das API-Token ist abgelaufen. Bitte erneut anmelden.', 401);
}

function fehler_nicht_berechtigt(string $nachricht = 'Keine Berechtigung fuer diese Aktion.'): void
{
    json_fehler('NICHT_BERECHTIGT', $nachricht, 403);
}

function fehler_nicht_gefunden(string $nachricht = 'Ressource nicht gefunden.'): void
{
    json_fehler('NICHT_GEFUNDEN', $nachricht, 404);
}

function fehler_doppelter_eintrag(string $nachricht = 'Ein Eintrag mit diesen Daten existiert bereits.'): void
{
    json_fehler('DOPPELTER_EINTRAG', $nachricht, 409);
}

function fehler_ungueltige_eingabe(string $nachricht, array $details = []): void
{
    json_fehler('UNGUELTIGE_EINGABE', $nachricht, 422, $details);
}

function fehler_methode_nicht_erlaubt(array $erlaubt = ['GET']): void
{
    header('Allow: ' . implode(', ', $erlaubt));
    json_fehler('METHODE_NICHT_ERLAUBT', 'HTTP-Methode nicht erlaubt.', 405);
}

function fehler_server(string $nachricht = 'Interner Serverfehler.'): void
{
    json_fehler('SERVERFEHLER', $nachricht, 500);
}

function fehler_rate_limit(): void
{
    json_fehler('RATE_LIMIT', 'Zu viele Anfragen. Bitte spaeter erneut versuchen.', 429);
}
