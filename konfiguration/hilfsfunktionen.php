<?php
/**
 * Geteilte Hilfsfunktionen
 *
 * Allgemeine Helfer fuer die gesamte Anwendung.
 */

declare(strict_types=1);

/**
 * Sicheres HTML-Escaping
 */
function esc(string $text): string
{
    return htmlspecialchars($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
}

/**
 * Sicheren zufaelligen Token erzeugen
 */
function token_erzeugen(int $laenge = TOKEN_LAENGE): string
{
    return bin2hex(random_bytes($laenge));
}

/**
 * Levenshtein-Distanz berechnen (UTF-8 sicher)
 *
 * @param string $s1 Eingabe
 * @param string $s2 Erwartung
 * @return int Distanz
 */
function levenshtein_utf8(string $s1, string $s2): int
{
    $s1_arr = mb_str_split(mb_strtolower($s1, 'UTF-8'));
    $s2_arr = mb_str_split(mb_strtolower($s2, 'UTF-8'));
    $len1 = count($s1_arr);
    $len2 = count($s2_arr);

    // Schneller Abbruch
    if ($len1 === 0) return $len2;
    if ($len2 === 0) return $len1;

    $matrix = [];
    for ($i = 0; $i <= $len1; $i++) {
        $matrix[$i][0] = $i;
    }
    for ($j = 0; $j <= $len2; $j++) {
        $matrix[0][$j] = $j;
    }

    for ($i = 1; $i <= $len1; $i++) {
        for ($j = 1; $j <= $len2; $j++) {
            $kosten = ($s1_arr[$i - 1] === $s2_arr[$j - 1]) ? 0 : 1;
            $matrix[$i][$j] = min(
                $matrix[$i - 1][$j] + 1,        // Loeschen
                $matrix[$i][$j - 1] + 1,        // Einfuegen
                $matrix[$i - 1][$j - 1] + $kosten // Ersetzen
            );
        }
    }

    return $matrix[$len1][$len2];
}

/**
 * Antwort-Qualitaet bewerten (0-5)
 *
 * @param string $eingabe Nutzer-Eingabe
 * @param string $erwartet Richtige Antwort
 * @param array $synonyme Erlaubte Synonyme
 * @param string $modus 'normal' oder 'strict'
 * @return int Qualitaet 0-5
 */
/**
 * Fuehrenden englischen Artikel entfernen (the, a, an) fuer Vergleichszwecke.
 *
 * "the car"  → "car"
 * "an apple" → "apple"
 * "a cat"    → "cat"
 * "antenna"  → "antenna"   (kein Match, kein Leerzeichen nach "an")
 * "a"        → "a"          (kein Folgetext)
 */
function artikel_entfernen(string $text): string
{
    $text = trim($text);
    if (preg_match('/^(?:the|an?)\s+(.+)$/iu', $text, $m)) {
        return trim($m[1]);
    }
    return $text;
}

/**
 * Klammerzusaetze entfernen: "(…)"-Bloecke inkl. fuehrender Leerzeichen.
 * "hon (är stor)" → "hon", "sie (ist groß)" → "sie"
 * Nur fuer Bewertung/TTS — Anzeige behaelt die Klammern.
 */
function klammerzusatz_entfernen(string $text): string
{
    $ergebnis = preg_replace('/\s*\([^)]*\)/', '', $text);
    return trim($ergebnis);
}

/**
 * Satzzeichen am Anfang und Ende entfernen (fuer Antwort-Vergleich)
 */
function satzzeichen_bereinigen(string $text): string
{
    // Fuehrende und abschliessende Satzzeichen + Leerzeichen entfernen
    return trim($text, " \t\n\r\0\x0B.,!?;:\"'–—…()[]{}");
}

/**
 * Satzzeichen vollstaendig entfernen und Whitespace normalisieren.
 * Fuer den Vergleich von Satz-Antworten, wo der Benutzer z.B.
 * "Jag det är jag" statt "Jag, det är jag." eingeben kann.
 */
function satzzeichen_normalisieren(string $text): string
{
    // Ellipsis (... und U+2026) durch Leerzeichen ersetzen, damit Woerter nicht
    // zusammenlaufen: "heter...på" → "heter på" statt "heterpå"
    $bereinigt = preg_replace('/\.{2,}|\x{2026}/u', ' ', $text);
    // Alle gaengigen Satzzeichen entfernen
    $bereinigt = preg_replace('/[.,!?;:\x{2013}\x{2014}"\'(){}\[\]]/u', '', $bereinigt);
    // Mehrfache Leerzeichen zusammenfassen
    $bereinigt = preg_replace('/\s+/', ' ', $bereinigt);
    return trim($bereinigt);
}

/**
 * Pruefen ob die Endung (letzte N Zeichen) uebereinstimmt.
 * Beide Strings muessen bereits lowercase sein.
 * Bei kurzen Woertern (kuerzer als N) wird das ganze Wort verglichen.
 */
function _endung_pruefen(string $eingabe, string $erwartet, int $n): bool
{
    $len_eingabe  = mb_strlen($eingabe, 'UTF-8');
    $len_erwartet = mb_strlen($erwartet, 'UTF-8');

    // Bei kurzen Woertern (kuerzer/gleich N): ganzes Wort muss exakt stimmen,
    // da bei z.B. "den" vs "det" ein Buchstabe den Unterschied macht
    // und Levenshtein-Toleranz hier nicht greifen darf.
    if ($len_erwartet <= $n) {
        return $eingabe === $erwartet;
    }

    $endung_erwartet = mb_substr($erwartet, -$n, $n, 'UTF-8');
    $endung_eingabe  = mb_substr($eingabe, -$n, $n, 'UTF-8');

    return $endung_eingabe === $endung_erwartet;
}

/**
 * Antwort-Qualitaet bewerten (0-5) — oeffentliche API mit Slash-OR-Unterstuetzung
 *
 * "/" in Eingabe ODER Erwartung wird als ODER interpretiert:
 *   "Anwalt/Anwältin" → beide Formen sind richtig.
 * Der Benutzer muss nur EINE der Alternativen eingeben.
 * Tippt er selbst z.B. "Anwalt/Anwältin", wird das beste Teil-Ergebnis gewertet.
 *
 * Synonyme werden ebenfalls auf Slash-Alternativen aufgeteilt.
 *
 * @param string $eingabe  Nutzer-Eingabe
 * @param string $erwartet Richtige Antwort (ggf. mit "/" fuer Alternativen)
 * @param array  $synonyme Erlaubte Synonyme (ggf. mit "/" fuer Alternativen)
 * @param string $modus    'normal' oder 'flexion'
 * @return int Qualitaet 0-5
 */
function antwort_bewerten(string $eingabe, string $erwartet, array $synonyme = [], string $modus = 'normal'): int
{
    // Slash-Alternativen aufteilen (leere Teile verwerfen)
    $teile_eingabe  = array_values(array_filter(array_map('trim', explode('/', $eingabe)),  fn($s) => $s !== ''));
    $teile_erwartet = array_values(array_filter(array_map('trim', explode('/', $erwartet)), fn($s) => $s !== ''));

    if (empty($teile_eingabe)) {
        return 0;
    }

    // Synonyme ebenfalls auf Slash-Alternativen aufteilen
    $synonyme_flach = [];
    foreach ($synonyme as $syn) {
        foreach (array_map('trim', explode('/', $syn)) as $teil) {
            if ($teil !== '') {
                $synonyme_flach[] = $teil;
            }
        }
    }

    // Beste Note ueber alle Kombinationen (eingabe_teil × erwartet_teil) ermitteln
    $beste_note = 0;
    foreach ($teile_eingabe as $e_eingabe) {
        foreach ($teile_erwartet as $e_erwartet) {
            $note = _antwort_bewerten_einzel($e_eingabe, $e_erwartet, $synonyme_flach, $modus);
            if ($note > $beste_note) {
                $beste_note = $note;
            }
            if ($beste_note === 5) {
                return 5; // Fruehzeitiger Abbruch
            }
        }
    }

    return $beste_note;
}

/**
 * Interne Bewertungs-Funktion fuer EINEN Eingabe-/Erwartungs-Vergleich (ohne Slash-Splitting).
 *
 * Modus 'normal':   Groß-/Kleinschreibung egal, Tippfehler toleriert
 * Modus 'flexion':  Keine Fehlertoleranz. Ausnahmen: Groß-/Kleinschreibung
 *                   und Satzzeichen/Leerzeichen am Rand.
 *
 * Bei allen Modi werden Satzzeichen am Rand ignoriert.
 * Im normalen Modus muessen die letzten 4 Zeichen exakt stimmen,
 * damit Tippfehler-Toleranz nicht falsche Endungen durchlaesst.
 *
 * @param string $eingabe  Nutzer-Eingabe (ein Teilwert, kein Slash mehr enthalten)
 * @param string $erwartet Richtige Antwort (ein Teilwert)
 * @param array  $synonyme Bereits aufgeteilte Synonym-Liste
 * @param string $modus    'normal' oder 'flexion'
 * @return int Qualitaet 0-5
 */
function _antwort_bewerten_einzel(string $eingabe, string $erwartet, array $synonyme = [], string $modus = 'normal'): int
{
    // Klammerzusaetze + Satzzeichen am Rand bei beiden Seiten entfernen
    $eingabe_clean  = satzzeichen_bereinigen(klammerzusatz_entfernen($eingabe));
    $erwartet_clean = satzzeichen_bereinigen(klammerzusatz_entfernen($erwartet));

    // Leere Eingabe
    if ($eingabe_clean === '') {
        return 0;
    }

    // Artikel-Varianten vorab berechnen (the/a/an am Anfang werden ignoriert)
    // Ermoeglicht: "the car" eingegeben als "car" → richtig; oder umgekehrt.
    $eingabe_no_art  = artikel_entfernen($eingabe_clean);
    $erwartet_no_art = artikel_entfernen($erwartet_clean);

    if ($modus === 'flexion') {
        // Flexion: nur Groß-/Kleinschreibung ignorieren, sonst exakt
        $eingabe_lc  = mb_strtolower($eingabe_clean, 'UTF-8');
        $erwartet_lc = mb_strtolower($erwartet_clean, 'UTF-8');

        if ($eingabe_lc === $erwartet_lc
            || mb_strtolower($eingabe_no_art, 'UTF-8') === mb_strtolower($erwartet_no_art, 'UTF-8')) {
            return 5;
        }
        // Satzzeichen-normalisiert (fuer Satz-Antworten wie "Jag det är jag" vs "Jag, det är jag.")
        $eingabe_fn  = mb_strtolower(satzzeichen_normalisieren($eingabe_clean), 'UTF-8');
        $erwartet_fn = mb_strtolower(satzzeichen_normalisieren($erwartet_clean), 'UTF-8');
        if ($eingabe_fn === $erwartet_fn
            || mb_strtolower(satzzeichen_normalisieren($eingabe_no_art), 'UTF-8')
               === mb_strtolower(satzzeichen_normalisieren($erwartet_no_art), 'UTF-8')) {
            return 5;
        }
        // Synonyme bei Flexion (ebenfalls exakt, nur Case-insensitiv)
        foreach ($synonyme as $synonym) {
            $syn_clean   = satzzeichen_bereinigen(klammerzusatz_entfernen($synonym));
            $syn_no_art  = artikel_entfernen($syn_clean);
            $syn_lc      = mb_strtolower($syn_clean, 'UTF-8');
            $syn_lc_na   = mb_strtolower($syn_no_art, 'UTF-8');
            if ($eingabe_lc === $syn_lc
                || mb_strtolower($eingabe_no_art, 'UTF-8') === $syn_lc_na) {
                return 3;
            }
            if ($eingabe_fn === mb_strtolower(satzzeichen_normalisieren($syn_clean), 'UTF-8')
                || mb_strtolower(satzzeichen_normalisieren($eingabe_no_art), 'UTF-8')
                   === mb_strtolower(satzzeichen_normalisieren($syn_no_art), 'UTF-8')) {
                return 3;
            }
        }
        return 1;
    }

    // Normaler Modus: Case-insensitiv
    $eingabe_lower  = mb_strtolower($eingabe_clean, 'UTF-8');
    $erwartet_lower = mb_strtolower($erwartet_clean, 'UTF-8');
    $eingabe_lower_na  = mb_strtolower($eingabe_no_art, 'UTF-8');
    $erwartet_lower_na = mb_strtolower($erwartet_no_art, 'UTF-8');

    if ($eingabe_lower === $erwartet_lower || $eingabe_lower_na === $erwartet_lower_na) {
        return 5;
    }

    // Satzzeichen-normalisierter Vergleich (z.B. "Jag det är jag" = "Jag, det är jag.")
    $eingabe_norm  = mb_strtolower(satzzeichen_normalisieren($eingabe_clean), 'UTF-8');
    $erwartet_norm = mb_strtolower(satzzeichen_normalisieren($erwartet_clean), 'UTF-8');
    $eingabe_norm_na  = mb_strtolower(satzzeichen_normalisieren($eingabe_no_art), 'UTF-8');
    $erwartet_norm_na = mb_strtolower(satzzeichen_normalisieren($erwartet_no_art), 'UTF-8');

    if ($eingabe_norm === $erwartet_norm || $eingabe_norm_na === $erwartet_norm_na) {
        return 5;
    }

    // Endungs-Schutz: die letzten 4 Zeichen muessen exakt stimmen (case-insensitiv),
    // damit Tippfehler-Toleranz nicht falsche Endungen durchlaesst (bilet vs bilen).
    // Wird auf BEIDEN Varianten geprueft (original + artikel-bereinigt).
    $endung_laenge = 4;
    $endung_stimmt_orig = _endung_pruefen($eingabe_lower, $erwartet_lower, $endung_laenge);
    $endung_stimmt_na   = _endung_pruefen($eingabe_lower_na, $erwartet_lower_na, $endung_laenge);

    // Tippfehler pruefen (Levenshtein <= 1) — original UND artikel-bereinigt
    $distanz_orig = levenshtein_utf8($eingabe_clean, $erwartet_clean);
    $distanz_na   = levenshtein_utf8($eingabe_no_art, $erwartet_no_art);
    if (($distanz_orig <= 1 && mb_strlen($erwartet_clean, 'UTF-8') > 2 && $endung_stimmt_orig)
        || ($distanz_na <= 1 && mb_strlen($erwartet_no_art, 'UTF-8') > 2 && $endung_stimmt_na)) {
        return 4;
    }

    // Synonyme pruefen
    foreach ($synonyme as $synonym) {
        $synonym_clean    = satzzeichen_bereinigen(klammerzusatz_entfernen($synonym));
        $synonym_no_art   = artikel_entfernen($synonym_clean);
        $synonym_lower    = mb_strtolower($synonym_clean, 'UTF-8');
        $synonym_lower_na = mb_strtolower($synonym_no_art, 'UTF-8');
        if ($eingabe_lower === $synonym_lower || $eingabe_lower_na === $synonym_lower_na) {
            return 3;
        }
        // Tippfehler bei Synonym — beide Varianten
        $syn_dist_orig = levenshtein_utf8($eingabe_clean, $synonym_clean);
        $syn_dist_na   = levenshtein_utf8($eingabe_no_art, $synonym_no_art);
        if (($syn_dist_orig <= 1 && mb_strlen($synonym_clean, 'UTF-8') > 2
             && _endung_pruefen($eingabe_lower, $synonym_lower, $endung_laenge))
            || ($syn_dist_na <= 1 && mb_strlen($synonym_no_art, 'UTF-8') > 2
                && _endung_pruefen($eingabe_lower_na, $synonym_lower_na, $endung_laenge))) {
            return 3;
        }
    }

    // Fast richtig (Levenshtein 2-3) — beide Varianten
    if (($distanz_orig <= 3 && mb_strlen($erwartet_clean, 'UTF-8') > 4 && $endung_stimmt_orig)
        || ($distanz_na <= 3 && mb_strlen($erwartet_no_art, 'UTF-8') > 4 && $endung_stimmt_na)) {
        return 2;
    }

    // Falsch
    return 1;
}

/**
 * Dateiname sanitisieren
 */
function dateiname_bereinigen(string $name): string
{
    // Nur sichere Zeichen erlauben
    $sicher = preg_replace('/[^a-zA-Z0-9_\-.]/', '_', $name);
    // Doppelte Unterstriche entfernen
    $sicher = preg_replace('/_+/', '_', $sicher);
    // Fuehrende Punkte entfernen (versteckte Dateien)
    $sicher = ltrim($sicher, '.');
    return $sicher ?: 'datei';
}

/**
 * MIME-Type pruefen
 */
function mime_typ_erlaubt(string $dateipfad, string $typ = 'bild'): bool
{
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($dateipfad);

    if ($typ === 'bild') {
        return in_array($mime, ERLAUBTE_BILD_TYPEN, true);
    }
    if ($typ === 'audio') {
        return in_array($mime, ERLAUBTE_AUDIO_TYPEN, true);
    }
    return false;
}

/**
 * Datum formatieren (deutsch)
 */
function datum_formatieren(?string $datum, string $format = 'd.m.Y H:i'): string
{
    if ($datum === null) return '-';
    $dt = new DateTime($datum);
    return $dt->format($format);
}

/**
 * Konfigurationswert aus DB laden (request-scoped Cache).
 *
 * Hinweis: Der Cache gilt nur fuer den laufenden Request. Falls ein Endpoint
 * einen Konfigwert aendert und denselben Key danach erneut liest, muss er
 * vorher `konfig_wert_invalidieren($schluessel)` aufrufen.
 *
 * @param bool $cache_leeren Internen Cache-Eintrag vor dem Lesen verwerfen
 */
function konfig_wert(string $schluessel, ?string $standard = null, bool $cache_leeren = false): ?string
{
    static $cache = [];

    if ($cache_leeren) {
        unset($cache[$schluessel]);
    }

    if (isset($cache[$schluessel])) {
        return $cache[$schluessel];
    }

    try {
        $pdo = db_verbindung();
        $stmt = $pdo->prepare('SELECT wert FROM app_konfiguration WHERE schluessel = ?');
        $stmt->execute([$schluessel]);
        $ergebnis = $stmt->fetchColumn();

        $wert = ($ergebnis !== false) ? $ergebnis : $standard;
        $cache[$schluessel] = $wert;
        return $wert;
    } catch (PDOException $e) {
        error_log('Konfiguration laden fehlgeschlagen: ' . $e->getMessage());
        return $standard;
    }
}

/**
 * Cache-Eintrag fuer einen Konfigurationswert loeschen.
 *
 * Aufrufen nach dem Schreiben eines Konfigwerts, wenn derselbe Schluessel
 * im selben Request nochmals gelesen werden muss.
 */
function konfig_wert_invalidieren(string $schluessel): void
{
    konfig_wert($schluessel, null, true);
}

/**
 * Paginierung berechnen
 */
function paginierung_berechnen(int $seite, int $pro_seite, int $gesamt): array
{
    $pro_seite = max(1, min($pro_seite, MAX_PRO_SEITE));
    $seite = max(1, $seite);
    $gesamt_seiten = max(1, (int) ceil($gesamt / $pro_seite));
    $seite = min($seite, $gesamt_seiten);
    $offset = ($seite - 1) * $pro_seite;

    return [
        'seite' => $seite,
        'pro_seite' => $pro_seite,
        'gesamt' => $gesamt,
        'gesamt_seiten' => $gesamt_seiten,
        'offset' => $offset,
        'hat_vorherige' => $seite > 1,
        'hat_naechste' => $seite < $gesamt_seiten,
    ];
}

/**
 * IP-Adresse des Clients ermitteln
 *
 * X-Forwarded-For wird bewusst NICHT ausgewertet: Der Header ist vom Client
 * frei setzbar und kann zur Umgehung von Rate-Limits missbraucht werden.
 * REMOTE_ADDR ist die einzige verlässliche Quelle.
 */
function client_ip(): string
{
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}
