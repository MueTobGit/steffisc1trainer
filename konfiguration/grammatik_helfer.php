<?php
/**
 * Grammatik-Helfer
 *
 * Gemeinsame Funktionen für Grammatikfragen in Training und Schnell-Üben.
 * Wird von api/training/starten.php und api/schnellueben/starten.php eingebunden.
 */

declare(strict_types=1);

// Bekannte Partikel als Fallback, wenn zu wenige aus den Vokabeln gewonnen werden können
define('GRAMMATIK_PARTIKEL_FALLBACK', [
    'på', 'om', 'till', 'av', 'upp', 'ner', 'ut', 'in', 'bort', 'hem',
    'med', 'igen', 'ihop', 'fram', 'efter', 'an', 'undan', 'över',
]);

// Vokalklassen-Labels für Benutzeroberfläche
define('GRAMMATIK_VERBKLASSE_LABELS', [
    'iei'          => 'i–e–i',
    'iau'          => 'i–a–u',
    'uöu'          => 'u–ö–u',
    'yöu'          => 'y–ö–u',
    'sonderfall'   => 'Sonderfall',
    'oregelbunden' => 'Unregelmäßig',
]);

// Endungs-Mapping Verbgruppe → Präteritum-Endung
define('GRAMMATIK_ENDUNGEN', [
    '1'  => '-ade',
    '2a' => '-te',
    '2b' => '-de',
    '3'  => '-dde',
]);

// Endungs-Mapping Verbgruppe → Präsens-Endung (Level 1)
define('GRAMMATIK_PRAESENS_ENDUNGEN', [
    '1'  => '-ar',
    '2a' => '-er',
    '2b' => '-er',
    '3'  => '-r',
]);

// Endungs-Mapping Verbgruppe → Supinum-Endung (Level 2)
define('GRAMMATIK_SUPINUM_ENDUNGEN', [
    '1'  => '-at',
    '2a' => '-t',
    '2b' => '-t',
    '3'  => '-tt',
]);

// ============================================================
// Daten laden
// ============================================================

/**
 * Lädt Grammatik-fähige Vokabeln (stufe >= gekonnt_schwelle) für einen Benutzer.
 *
 * Gibt ein Array mit vier Teillisten zurück:
 *   'nomen'         — Nomen mit genus (für genus_block)
 *   'verben_gruppe' — Verben der Gruppen 1–3 mit verbgruppe (für endungs_matching + gruppen_quiz)
 *   'verben_alle'   — Alle Verben mit verbgruppe (für gruppen_quiz inkl. Gruppe 4)
 *   'partikelverben'— Verben mit Partikel im Schwedisch-Feld (für partikel_puzzle)
 *   'starke_verben' — Verben mit verbgruppe=4 und verbklasse gesetzt (für starkes_verb)
 *
 * @param PDO   $pdo
 * @param int   $benutzer_id
 * @param int[] $vokabel_ids  Alle Vokabel-IDs der Session (aus Lektionen/Favoriten)
 * @return array{nomen: array, verben_gruppe: array, verben_alle: array, partikelverben: array, starke_verben: array}
 */
function grammatik_vokabeln_laden(PDO $pdo, int $benutzer_id, array $vokabel_ids): array
{
    if (empty($vokabel_ids)) {
        return [
            'nomen'          => [],
            'verben_gruppe'  => [],
            'verben_alle'    => [],
            'partikelverben' => [],
            'starke_verben'  => [],
        ];
    }

    $placeholders = implode(',', array_fill(0, count($vokabel_ids), '?'));

    // Konfigurierbarer Schwellenwert: ab welcher Stufe eine Vokabel fuer Grammatikaufgaben freigeschaltet ist
    $gekonnt_schwelle = (int) konfig_wert('gekonnt_schwelle', '4');

    // Nomen mit Genus + stufe >= gekonnt_schwelle in mindestens einer Richtung
    $stmt = $pdo->prepare("
        SELECT DISTINCT v.id, v.schwedisch, v.deutsch, v.wortart, v.genus,
               v.verbgruppe, v.verbklasse, v.sprachniveau
        FROM vokabeln v
        JOIN fortschritt f ON f.vokabel_id = v.id AND f.benutzer_id = ?
        WHERE v.id IN ({$placeholders})
          AND v.aktiv = 1
          AND v.wortart = 'Nomen'
          AND v.genus IS NOT NULL
          AND f.stufe >= {$gekonnt_schwelle}
    ");
    $params = array_merge([$benutzer_id], $vokabel_ids);
    $stmt->execute($params);
    $nomen = $stmt->fetchAll();

    // Verben Gruppen 1–3 (für endungs_matching + gruppen_quiz)
    $stmt = $pdo->prepare("
        SELECT DISTINCT v.id, v.schwedisch, v.deutsch, v.wortart, v.genus,
               v.verbgruppe, v.verbklasse, v.sprachniveau
        FROM vokabeln v
        JOIN fortschritt f ON f.vokabel_id = v.id AND f.benutzer_id = ?
        WHERE v.id IN ({$placeholders})
          AND v.aktiv = 1
          AND v.wortart = 'Verb'
          AND v.verbgruppe IN ('1','2a','2b','3')
          AND f.stufe >= {$gekonnt_schwelle}
    ");
    $stmt->execute($params);
    $verben_gruppe = $stmt->fetchAll();

    // Alle Verben mit verbgruppe (inkl. Gruppe 4, für gruppen_quiz)
    $stmt = $pdo->prepare("
        SELECT DISTINCT v.id, v.schwedisch, v.deutsch, v.wortart, v.genus,
               v.verbgruppe, v.verbklasse, v.sprachniveau
        FROM vokabeln v
        JOIN fortschritt f ON f.vokabel_id = v.id AND f.benutzer_id = ?
        WHERE v.id IN ({$placeholders})
          AND v.aktiv = 1
          AND v.wortart = 'Verb'
          AND v.verbgruppe IS NOT NULL
          AND f.stufe >= {$gekonnt_schwelle}
    ");
    $stmt->execute($params);
    $verben_alle = $stmt->fetchAll();

    // Partikelverben (schwedisch enthält Leerzeichen)
    $stmt = $pdo->prepare("
        SELECT DISTINCT v.id, v.schwedisch, v.deutsch, v.wortart, v.genus,
               v.verbgruppe, v.verbklasse, v.sprachniveau
        FROM vokabeln v
        JOIN fortschritt f ON f.vokabel_id = v.id AND f.benutzer_id = ?
        WHERE v.id IN ({$placeholders})
          AND v.aktiv = 1
          AND v.wortart = 'Verb'
          AND v.schwedisch LIKE '% %'
          AND f.stufe >= {$gekonnt_schwelle}
    ");
    $stmt->execute($params);
    $partikelverben = $stmt->fetchAll();

    // Starke Verben (verbgruppe=4, verbklasse gesetzt)
    $stmt = $pdo->prepare("
        SELECT DISTINCT v.id, v.schwedisch, v.deutsch, v.wortart, v.genus,
               v.verbgruppe, v.verbklasse, v.sprachniveau
        FROM vokabeln v
        JOIN fortschritt f ON f.vokabel_id = v.id AND f.benutzer_id = ?
        WHERE v.id IN ({$placeholders})
          AND v.aktiv = 1
          AND v.wortart = 'Verb'
          AND v.verbgruppe = '4'
          AND v.verbklasse IS NOT NULL
          AND f.stufe >= {$gekonnt_schwelle}
    ");
    $stmt->execute($params);
    $starke_verben = $stmt->fetchAll();

    return [
        'nomen'          => $nomen,
        'verben_gruppe'  => $verben_gruppe,
        'verben_alle'    => $verben_alle,
        'partikelverben' => $partikelverben,
        'starke_verben'  => $starke_verben,
    ];
}

// ============================================================
// Aufgaben-Generator-Funktionen
// ============================================================

/**
 * Genus-Block: 4 Nomen anzeigen, User tippt alle einer Gattung an.
 *
 * @param array[] $nomen_pool  Nomen mit genus gesetzt
 * @param int     $index
 * @return array|null  null wenn < 4 Nomen verfügbar
 */
function genus_block_erstellen(array $nomen_pool, int $index): ?array
{
    if (count($nomen_pool) < 4) {
        return null;
    }

    // 4 zufällige Nomen wählen
    $pool = $nomen_pool;
    shuffle($pool);
    $gruppe = array_slice($pool, 0, 4);

    // Genus-Verteilung prüfen — wir brauchen mindestens 1 von jeder Seite
    $en_nomen  = array_values(array_filter($gruppe, fn($v) => $v['genus'] === 'en'));
    $ett_nomen = array_values(array_filter($gruppe, fn($v) => $v['genus'] === 'ett'));

    // Falls alle 4 gleicher Genus: anderen Genus aus Pool ergänzen
    if (empty($en_nomen) || empty($ett_nomen)) {
        // Restliche Pool für andere Seite suchen
        $andere_gruppe = $gruppe[0]['genus'] === 'en' ? 'ett' : 'en';
        $ersatz_pool   = array_values(array_filter($pool, fn($v) => $v['genus'] === $andere_gruppe));
        if (empty($ersatz_pool)) {
            return null; // Keine Mischung möglich
        }
        $gruppe[3]   = $ersatz_pool[0];
        $en_nomen    = array_values(array_filter($gruppe, fn($v) => $v['genus'] === 'en'));
        $ett_nomen   = array_values(array_filter($gruppe, fn($v) => $v['genus'] === 'ett'));
    }

    // Zufällig Ziel-Genus wählen (en oder ett)
    $ziel_genus  = mt_rand(0, 1) === 0 ? 'en' : 'ett';
    $richtige    = $ziel_genus === 'en' ? $en_nomen : $ett_nomen;
    $richtige_ids = array_column($richtige, 'id');

    // Wörter für Anzeige aufbereiten
    $woerter = array_map(fn($v) => [
        'vokabel_id' => (int) $v['id'],
        'text'       => $v['schwedisch'],
        'deutsch'    => $v['deutsch'],
        'genus'      => $v['genus'],
    ], $gruppe);

    // Mischen (damit richtige nicht immer vorne stehen)
    shuffle($woerter);

    return [
        'index'       => $index,
        'typ'         => 'genus_block',
        'woerter'     => $woerter,
        'ziel_genus'  => $ziel_genus,
        'richtige_ids' => array_map('intval', $richtige_ids),
    ];
}

/**
 * Endungs-Matching: Infinitiv anzeigen → Präteritum-Endung wählen.
 * Nur Gruppen 1, 2a, 2b, 3.
 *
 * @param array $vok  Vokabel mit verbgruppe IN ('1','2a','2b','3')
 * @param int   $index
 * @return array|null
 */
function endungs_matching_erstellen(array $vok, int $index, int $globales_level = 5, ?array $lk = null): ?array
{
    $gruppe = $vok['verbgruppe'];
    if (!isset(GRAMMATIK_ENDUNGEN[$gruppe])) {
        return null;
    }

    $infinitiv = $vok['schwedisch'];

    // Kumulativ freigeschaltete Formen bis zum aktuellen Level bestimmen
    $kumulativ_formen = [];
    for ($l = 1; $l <= $globales_level; $l++) {
        $formen_l = $lk !== null ? ($lk[$l]['formen'] ?? []) : (LEVEL_FORMEN[$l] ?? []);
        $kumulativ_formen = array_merge($kumulativ_formen, $formen_l);
    }

    // Abzufragende Form richtet sich nach den freigeschalteten Formen (nicht der Level-Nummer):
    // 'praeteritum' freigeschaltet → Präteritum (-ade, -te, -de, -dde)
    // 'supinum' freigeschaltet     → Supinum    (-at, -t, -tt)
    // sonst                        → Präsens    (-ar, -er, -r)
    if (in_array('praeteritum', $kumulativ_formen, true)) {
        $erwartet       = GRAMMATIK_ENDUNGEN[$gruppe];
        $optionen       = array_values(GRAMMATIK_ENDUNGEN);
        $zielform_label = 'Präteritum';
    } elseif (in_array('supinum', $kumulativ_formen, true)) {
        $erwartet       = GRAMMATIK_SUPINUM_ENDUNGEN[$gruppe];
        $optionen       = array_values(GRAMMATIK_SUPINUM_ENDUNGEN);
        $zielform_label = 'Supinum';
    } else {
        $erwartet       = GRAMMATIK_PRAESENS_ENDUNGEN[$gruppe];
        $optionen       = array_values(GRAMMATIK_PRAESENS_ENDUNGEN);
        $zielform_label = 'Präsens';
    }

    // Stamm berechnen: bei Gruppen 1/2a/2b das abschließende -a des Infinitivs abtrennen.
    // Bei Gruppe 3 (bo, tro, sy …) gibt es kein auslautendes -a → Stamm = Infinitiv.
    // Partikelverben: nur das Basisverb (vor dem ersten Leerzeichen) verwenden.
    $basis = (strpos($infinitiv, ' ') !== false)
        ? trim(explode(' ', $infinitiv)[0])
        : $infinitiv;
    if ($gruppe !== '3' && substr($basis, -1) === 'a') {
        $stamm = substr($basis, 0, -1); // z.B. "kombinera" → "kombiner"
    } else {
        $stamm = $basis;                // z.B. "bo" → "bo"
    }

    return [
        'index'              => $index,
        'typ'                => 'endungs_matching',
        'vokabel_id'         => (int) $vok['id'],
        'infinitiv'          => $infinitiv,
        'stamm'              => $stamm,
        'deutsch'            => $vok['deutsch'],
        'verbgruppe'         => $gruppe,
        'zielform_label'     => $zielform_label,
        'optionen'           => $optionen,
        'erwartet'           => $erwartet,
        'grammatik_regel_id' => null,
    ];
}

/**
 * Gruppen-Quiz: Verb anzeigen → Gruppe wählen (1, 2a, 2b, 3, 4).
 *
 * @param array $vok  Vokabel mit verbgruppe gesetzt
 * @param int   $index
 * @return array|null
 */
function gruppen_quiz_erstellen(array $vok, int $index): ?array
{
    if (empty($vok['verbgruppe'])) {
        return null;
    }

    return [
        'index'            => $index,
        'typ'              => 'gruppen_quiz',
        'vokabel_id'       => (int) $vok['id'],
        'infinitiv'        => $vok['schwedisch'],
        'deutsch'          => $vok['deutsch'],
        'optionen'         => ['1', '2a', '2b', '3', '4'],
        'erwartet'         => $vok['verbgruppe'],
        'grammatik_regel_id' => null,
    ];
}

/**
 * Partikel-Puzzle: Partikel aus Infinitiv extrahieren, User wählt richtigen Partikel.
 *
 * @param array   $vok           Vokabel mit Leerzeichen im schwedisch-Feld
 * @param array[] $alle_partikel Liste aller bekannten Partikel (string) für Distraktoren
 * @param int     $index
 * @return array|null
 */
function partikel_puzzle_erstellen(array $vok, array $alle_partikel, int $index): ?array
{
    $teile = partikel_extrahieren($vok['schwedisch']);
    if ($teile === null) {
        return null;
    }

    $hauptverb = $teile['hauptverb'];
    $partikel  = $teile['partikel'];

    // Distraktoren aus bekannten Partikeln (ohne richtigen Partikel)
    $distraktoren_pool = array_values(array_filter(
        $alle_partikel,
        fn($p) => mb_strtolower($p) !== mb_strtolower($partikel)
    ));

    // Mit Fallback-Partikeln auffüllen
    foreach (GRAMMATIK_PARTIKEL_FALLBACK as $fp) {
        if (mb_strtolower($fp) !== mb_strtolower($partikel)
            && !in_array($fp, $distraktoren_pool, true)) {
            $distraktoren_pool[] = $fp;
        }
    }

    if (count($distraktoren_pool) < 3) {
        return null;
    }

    shuffle($distraktoren_pool);
    $distraktoren = array_slice($distraktoren_pool, 0, 3);

    // Optionen mischen (richtiger Partikel + 3 Distraktoren)
    $optionen = array_merge([$partikel], $distraktoren);
    shuffle($optionen);

    // Bedeutungen aus deutsch-Feld: "begrüßen vs. besuchen" → zeigen wir das deutsch-Feld
    // des Partikelverbs + das deutsch-Feld des Grundverbs (falls vorhanden, sonst nur Partikelverb)
    return [
        'index'           => $index,
        'typ'             => 'partikel_puzzle',
        'vokabel_id'      => (int) $vok['id'],
        'hauptverb'       => $hauptverb,
        'bedeutung_mit'   => $vok['deutsch'],   // z.B. "besuchen" (hälsa på)
        'optionen'        => $optionen,
        'erwartet'        => $partikel,
        'grammatik_regel_id' => null,
    ];
}

/**
 * Starkes Verb: Infinitiv anzeigen → Vokalklasse wählen.
 *
 * @param array  $vok        Vokabel mit verbgruppe='4' und verbklasse gesetzt
 * @param array  $formen_map Schlüssel: "vokabel_id|form_bezeichnung" => form_wert
 * @param int    $index
 * @return array|null
 */
function starkes_verb_erstellen(array $vok, array $formen_map, int $index, int $globales_level = 5, ?array $lk = null): ?array
{
    if (empty($vok['verbklasse'])) {
        return null;
    }

    // Kumulativ freigeschaltete Formen bis zum aktuellen Level bestimmen
    $kumulativ_formen = [];
    for ($l = 1; $l <= $globales_level; $l++) {
        $formen_l = $lk !== null ? ($lk[$l]['formen'] ?? []) : (LEVEL_FORMEN[$l] ?? []);
        $kumulativ_formen = array_merge($kumulativ_formen, $formen_l);
    }

    // Starke Verben erst wenn Supinum freigeschaltet, damit das vollständige
    // Vokalklassen-Muster (z.B. i–e–i) sinnvoll gelernt werden kann.
    if (!in_array('supinum', $kumulativ_formen, true)) {
        return null;
    }

    $vid = (int) $vok['id'];

    // Formen aus der Map laden
    $praesens    = $formen_map["{$vid}|praesens"]    ?? null;
    $praeteritum = $formen_map["{$vid}|praeteritum"] ?? null;
    $supinum     = $formen_map["{$vid}|supinum"]     ?? null;

    // Wenigstens Präteritum sollte in der DB vorhanden sein
    if ($praeteritum === null) {
        return null;
    }

    $klasse   = $vok['verbklasse'];
    $labels   = GRAMMATIK_VERBKLASSE_LABELS;
    $optionen = array_values($labels); // alle 6 Labels

    $formen_loesung = array_filter([
        'infinitiv'   => $vok['schwedisch'],
        'praesens'    => $praesens,
        'praeteritum' => $praeteritum,
        'supinum'     => $supinum,
    ]);

    return [
        'index'              => $index,
        'typ'                => 'starkes_verb',
        'vokabel_id'         => $vid,
        'infinitiv'          => $vok['schwedisch'],
        'deutsch'            => $vok['deutsch'],
        'verbklasse'         => $klasse,
        'optionen'           => $optionen,
        'erwartet'           => $labels[$klasse],  // z.B. "i–e–i"
        'formen_loesung'     => $formen_loesung,
        'grammatik_regel_id' => null,
    ];
}

// ============================================================
// Hilfs-Funktionen
// ============================================================

/**
 * Extrahiert Hauptverb und Partikel aus einem Partikelverb.
 * Beispiel: "hälsa på" → ['hauptverb' => 'hälsa', 'partikel' => 'på']
 *
 * @param string $schwedisch
 * @return array{hauptverb: string, partikel: string}|null
 */
function partikel_extrahieren(string $schwedisch): ?array
{
    $teile = explode(' ', trim($schwedisch), 2);
    if (count($teile) !== 2 || empty($teile[1])) {
        return null;
    }
    return [
        'hauptverb' => trim($teile[0]),
        'partikel'  => trim($teile[1]),
    ];
}

/**
 * Sammelt alle bekannten Partikel aus einer Liste von Partikelverben.
 *
 * @param array[] $partikelverben
 * @return string[]
 */
function partikel_aus_pool_sammeln(array $partikelverben): array
{
    $partikel = [];
    foreach ($partikelverben as $vok) {
        $teile = partikel_extrahieren($vok['schwedisch']);
        if ($teile !== null && !in_array($teile['partikel'], $partikel, true)) {
            $partikel[] = $teile['partikel'];
        }
    }
    return $partikel;
}

// ============================================================
// Fortschritt tracken
// ============================================================

/**
 * Aktualisiert grammatik_fortschritt für eine beantwortete Grammatikfrage.
 *
 * @param PDO    $pdo
 * @param int    $benutzer_id
 * @param int    $vokabel_id
 * @param string $grammatik_typ  'genus_block'|'endungs_matching'|'gruppen_quiz'|'partikel_puzzle'|'starkes_verb'
 * @param bool   $richtig
 */
function grammatik_fortschritt_aktualisieren(
    PDO    $pdo,
    int    $benutzer_id,
    int    $vokabel_id,
    string $grammatik_typ,
    bool   $richtig
): void {
    // grammatik_fortschritt-Tabelle ggf. noch nicht vorhanden (Migration ausständig).
    // Fehler still ignorieren – XP wird trotzdem vergeben, nur Fortschritt fehlt temporär.
    try {
        $stmt = $pdo->prepare("
            INSERT INTO grammatik_fortschritt
                (benutzer_id, vokabel_id, grammatik_typ, richtig_gesamt, falsch_gesamt, letzte_antwort)
            VALUES
                (?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
                richtig_gesamt = richtig_gesamt + VALUES(richtig_gesamt),
                falsch_gesamt  = falsch_gesamt  + VALUES(falsch_gesamt),
                letzte_antwort = NOW()
        ");
        $stmt->execute([
            $benutzer_id,
            $vokabel_id,
            $grammatik_typ,
            $richtig ? 1 : 0,
            $richtig ? 0 : 1,
        ]);
    } catch (\PDOException $e) {
        // Tabelle fehlt noch – Migration nachholen: migration_grammatik_fix.sql
        error_log('grammatik_fortschritt nicht verfügbar: ' . $e->getMessage());
    }
}
