<?php
/**
 * API: KI — Synonym-Bewertung
 *
 * POST /api/ki/synonym_bewertung.php
 *
 * Strategie: Gemini (primär) → Claude (Fallback)
 *
 * Body:
 *   - woerter: string[]  Schwedische Wörter (min. 2)
 *   - deutsch: string    Deutsche Übersetzung
 *   - wortart: string    Wortart
 */

declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(0);
ob_start();

register_shutdown_function(static function () {
    $fehler = error_get_last();
    $fatale = E_ERROR | E_PARSE | E_CORE_ERROR | E_COMPILE_ERROR | E_USER_ERROR;
    if (!$fehler || !($fehler['type'] & $fatale)) {
        return;
    }
    while (ob_get_level() > 0) { ob_end_clean(); }
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode(['erfolg' => false, 'fehler' => ['code' => 'PHP_FEHLER', 'nachricht' => 'Interner PHP-Fehler.']]);
});

try {
    require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
    require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
    require_once dirname(__DIR__) . '/_middleware/autorisierung.php';

    ob_end_clean();

    methode_erzwingen('POST');
    $benutzer = benutzer_authentifizieren();
    admin_erzwingen($benutzer);

    $daten = json_body_lesen();

    // --- Eingabe validieren ---
    $woerter = array_values(array_filter(
        array_map('trim', (array) ($daten['woerter'] ?? [])),
        static function ($w) { return $w !== ''; }
    ));

    if (count($woerter) < 2) { fehler_ungueltige_eingabe('Mindestens 2 schwedische Wörter sind erforderlich.'); }
    if (count($woerter) > 10) { fehler_ungueltige_eingabe('Maximal 10 Wörter pro Anfrage.'); }

    $deutsch = trim($daten['deutsch'] ?? '');
    $wortart = trim($daten['wortart'] ?? '');

    // --- Prompt aufbauen ---
    $woerter_liste = implode('" und "', $woerter);
    $wortart_info  = $wortart ? " ({$wortart})" : '';

    $prompt  = "Erkläre kurz, ob die schwedischen Begriffe \"{$woerter_liste}\"{$wortart_info} echte Synonyme sind. ";
    $prompt .= "Strukturiere die Antwort exakt so:\n";
    $prompt .= "1. Satz: Ein klarer Ja/Nein-Satz als Einstieg (keine Einleitungsfloskel).\n";

    foreach ($woerter as $i => $wort) {
        $nr = $i + 2;
        $prompt .= "{$nr}. \"{$wort}\": Liste: Definition in einem/zwei Satz + ein idiomatisches Beispiel auf Schwedisch mit deutscher Übersetzung.\n";
    }

    $nr_fazit = count($woerter) + 2;
    $prompt .= "{$nr_fazit}. Satz: Ein abschließender Satz zur Austauschbarkeit im Alltag.\n";
    $prompt .= "Antworte prägnant, auf Deutsch, ohne Einleitungsfloskeln.";

    if ($deutsch !== '') {
        $prompt .= "\nZusatz: Die aktuelle deutsche Übersetzung lautet \"{$deutsch}\". ";
        $prompt .= "Ergänze am Ende einen Hinweis, ob diese Übersetzung beim Vokabellernen besser differenziert werden sollte.";
    }

    if (!function_exists('curl_init')) {
        fehler_server('cURL nicht verfügbar — php_curl in der php.ini aktivieren.');
    }

    $ist_lokal    = in_array($_SERVER['SERVER_NAME'] ?? '', ['localhost', '127.0.0.1', '::1'], true);
    $mit_fallback = (bool) ($daten['mit_fallback'] ?? true);

    // =========================================================
    // VERSUCH 1: Gemini (primär)
    // =========================================================
    $text   = null;
    $quelle = '';

    if (defined('GEMINI_API_KEY') && GEMINI_API_KEY !== '') {
        $gemini_url  = sprintf(
            GEMINI_API_URL,
            trim(GEMINI_MODELL),
            urlencode(trim(GEMINI_API_KEY))
        );
        $gemini_body = json_encode([
            'contents'         => [['parts' => [['text' => $prompt]]]],
            'generationConfig' => ['temperature' => 0.3, 'maxOutputTokens' => 1024],
        ]);

        $ch = curl_init($gemini_url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $gemini_body,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_SSL_VERIFYPEER => !$ist_lokal,
            CURLOPT_SSL_VERIFYHOST => $ist_lokal ? 0 : 2,
        ]);

        $roh         = curl_exec($ch);
        $curl_fehler = curl_error($ch);
        curl_close($ch);

        if ($roh !== false && $roh !== '' && $curl_fehler === '') {
            $decoded = json_decode($roh, true);
            if (is_array($decoded) && !isset($decoded['error'])) {
                $kandidat = $decoded['candidates'][0]['content']['parts'][0]['text'] ?? null;
                if ($kandidat !== null) {
                    $text   = $kandidat;
                    $quelle = 'gemini';
                }
            } else {
                $gemini_fehler_msg = $decoded['error']['message'] ?? 'Unbekannt';
                error_log("Gemini Fehler (Fallback zu Claude): {$gemini_fehler_msg}");
            }
        } else {
            error_log("Gemini cURL Fehler (Fallback zu Claude): {$curl_fehler}");
        }
    }

    // =========================================================
    // VERSUCH 2: Claude (Fallback — nur wenn aktiviert)
    // =========================================================
    if ($text === null && $mit_fallback) {
        if (!defined('CLAUDE_API_KEY') || CLAUDE_API_KEY === '') {
            fehler_server('Gemini nicht verfügbar und kein Claude-Fallback konfiguriert.');
        }

        $claude_body = json_encode([
            'model'      => trim(CLAUDE_MODELL),
            'max_tokens' => 1024,
            'messages'   => [['role' => 'user', 'content' => $prompt]],
        ]);

        $ch = curl_init(CLAUDE_API_URL);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $claude_body,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'x-api-key: '          . trim(CLAUDE_API_KEY),
                'anthropic-version: '  . CLAUDE_API_VERSION,
            ],
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_SSL_VERIFYPEER => !$ist_lokal,
            CURLOPT_SSL_VERIFYHOST => $ist_lokal ? 0 : 2,
        ]);

        $roh         = curl_exec($ch);
        $curl_fehler = curl_error($ch);
        curl_close($ch);

        if ($roh === false || $curl_fehler !== '') {
            error_log("Claude cURL Fehler: {$curl_fehler}");
            fehler_server('Weder Gemini noch Claude erreichbar: ' . ($curl_fehler ?: 'Unbekannter Fehler'));
        }

        $decoded = json_decode($roh, true);
        if (!is_array($decoded)) {
            fehler_server('Claude-Antwort konnte nicht geparst werden.');
        }
        if (isset($decoded['error'])) {
            $msg = $decoded['error']['message'] ?? 'Unbekannter Fehler';
            error_log("Claude API Fehler: {$msg}");
            fehler_server("Claude API Fehler: {$msg}");
        }

        $text   = $decoded['content'][0]['text'] ?? null;
        $quelle = 'claude';

        if ($text === null) {
            fehler_server('Claude hat keine verwertbare Antwort geliefert.');
        }
    } elseif ($text === null) {
        // Gemini fehlgeschlagen, Fallback deaktiviert
        fehler_server('Gemini nicht verfügbar. Claude-Fallback ist deaktiviert.');
    }

    // =========================================================
    // Ergebnis zurückgeben
    // =========================================================
    json_erfolg([
        'antwort' => $text,
        'woerter' => $woerter,
        'quelle'  => $quelle,   // 'gemini' oder 'claude' (für Debugging)
        'prompt'  => $prompt,
    ], 'KI-Bewertung erhalten.');

} catch (Throwable $e) {
    while (ob_get_level() > 0) { ob_end_clean(); }
    error_log('synonym_bewertung.php Ausnahme: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode(['erfolg' => false, 'fehler' => ['code' => 'AUSNAHME', 'nachricht' => 'Interner Fehler. Details im Server-Log.']]);
    exit;
}
