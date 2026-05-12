<?php
/**
 * API: Grammatik — Verb-Familien (Gruppe 4)
 *
 * GET /api/grammatik/verb_familien.php
 *
 * Gibt Gruppe-4-Verben zurück, gruppiert nach verbklasse
 * ('iei','iau','uöu','yöu','aoa','kurz','sonderfall','oregelbunden').
 * Normale Nutzer: nur Vokabeln mit Fortschrittseintrag (gelernte Verben).
 * Admin: alle aktiven Gruppe-4-Verben ohne Fortschritts-Filter.
 *
 * Response:
 *   { familien: { iei: [...], iau: [...], ... }, gelernt_gesamt: n }
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

methode_erzwingen('GET');

$benutzer  = benutzer_authentifizieren();
$pdo       = db_verbindung();
$ist_admin = $benutzer['rolle'] === 'admin';

// Gruppe-4-Verben mit Konjugationsformen.
// Admin: alle aktiven Gr.-4-Verben (kein Fortschritts-Filter).
// Normale Nutzer: nur Verben mit Fortschrittseintrag.
$basis_select = "
    SELECT
        v.id,
        v.schwedisch,
        v.deutsch,
        COALESCE(v.verbklasse, 'sonderfall') AS verbklasse,
        MAX(CASE WHEN vf.form_bezeichnung = 'infinitiv'   THEN vf.form_wert END) AS infinitiv,
        MAX(CASE WHEN vf.form_bezeichnung = 'praesens'    THEN vf.form_wert END) AS praesens,
        MAX(CASE WHEN vf.form_bezeichnung = 'praeteritum' THEN vf.form_wert END) AS praeteritum,
        MAX(CASE WHEN vf.form_bezeichnung = 'supinum'     THEN vf.form_wert END) AS supinum
    FROM vokabeln v
    {join}
    LEFT JOIN vokabel_formen vf
        ON  vf.vokabel_id = v.id
        AND vf.form_bezeichnung IN ('infinitiv','praesens','praeteritum','supinum')
    WHERE v.wortart = 'Verb'
      AND v.verbgruppe = '4'
      AND v.aktiv = 1
    GROUP BY v.id, v.schwedisch, v.deutsch, v.verbklasse
    ORDER BY v.verbklasse ASC, v.schwedisch ASC
";

if ($ist_admin) {
    $sql = str_replace('{join}', '', $basis_select);
    $stmt = $pdo->prepare($sql);
    $stmt->execute([]);
} else {
    $sql = str_replace('{join}', 'INNER JOIN fortschritt f ON f.vokabel_id = v.id AND f.benutzer_id = ?', $basis_select);
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$benutzer['id']]);
}
$verben = $stmt->fetchAll(PDO::FETCH_ASSOC);

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

function bereinige_stamm(string $form): string
{
    $s = mb_strtolower(trim($form));
    // Partikelverb: nur erster Teil (vor erstem Leerzeichen)
    $leerzeichen = mb_strpos($s, ' ');
    if ($leerzeichen !== false) {
        $s = mb_substr($s, 0, $leerzeichen);
    }
    // Reflexiv: " sig" am Ende entfernen (nach Partikel-Strip irrelevant, aber sicherheitshalber)
    if (mb_substr($s, -4) === ' sig') {
        $s = mb_substr($s, 0, mb_strlen($s) - 4);
    }
    // Präfix-Strip (längste zuerst, Restwort >= 3 Zeichen)
    $praefixe = ['miss', 'und', 'van', 'för', 'be'];
    $geaendert = true;
    while ($geaendert) {
        $geaendert = false;
        foreach ($praefixe as $p) {
            if (mb_substr($s, 0, mb_strlen($p)) === $p && mb_strlen($s) - mb_strlen($p) >= 3) {
                $s = mb_substr($s, mb_strlen($p));
                $geaendert = true;
                break;
            }
        }
    }
    return $s;
}

function stammvokal(string $form, string $typ): string
{
    $vokale = ['å', 'ä', 'ö', 'a', 'e', 'i', 'o', 'u', 'y'];
    $s = bereinige_stamm($form);
    // Endung entfernen
    if ($typ === 'infinitiv') {
        if (mb_strlen($s) > 3 && mb_substr($s, -1) === 'a') {
            $s = mb_substr($s, 0, mb_strlen($s) - 1);
        }
    } elseif ($typ === 'supinum') {
        if (mb_substr($s, -2) === 'it' || mb_substr($s, -2) === 'tt') {
            $s = mb_substr($s, 0, mb_strlen($s) - 2);
        } elseif (mb_substr($s, -1) === 't' && mb_strlen($s) >= 2) {
            $s = mb_substr($s, 0, mb_strlen($s) - 1);
        }
    }
    // Ersten Vokal suchen
    $zeichen = mb_str_split($s);
    foreach ($zeichen as $z) {
        if (in_array($z, $vokale, true)) {
            // Normalisierung: å→a, ö→o (ä bleibt ä — eigenes Muster für Umlaut-Familie)
            if ($z === 'å') return 'a';
            if ($z === 'ö') return 'o';
            return $z;
        }
    }
    return '';
}

function konsonanten_skelett(string $form): string
{
    $s = bereinige_stamm($form);
    return preg_replace('/[åäöaeiouAÅÄÖEIOUY]/u', '', $s) ?? '';
}

// ── 4-Phasen-Algorithmus ──────────────────────────────────────────────────────

$familien_map_vokale = [
    'i-e-i' => 'iei',
    'i-a-u' => 'iau',
    'u-o-u' => 'uöu',
    'y-o-u' => 'yöu',
    // Umlaut-Familie: ta/slå/falla/hålla (a-o-a) und förlåta/låta/gråta (a-ä-a)
    'a-o-a' => 'aoa',
    'a-ä-a' => 'aoa',
];

// Phase 1+2: Muster für jedes Verb berechnen
$verb_muster = [];

foreach ($verben as $v) {
    // Admin-Override: oregelbunden bleibt immer
    if (($v['verbklasse'] ?? '') === 'oregelbunden') {
        $verb_muster[$v['id']] = 'oregelbunden';
        continue;
    }
    // Fehlende Formen → Fallback
    if (empty($v['praeteritum']) || empty($v['supinum'])) {
        $verb_muster[$v['id']] = $v['verbklasse'] ?? 'sonderfall';
        continue;
    }
    // Konsonanten-Wächter
    $inf_form = !empty($v['infinitiv']) ? $v['infinitiv'] : $v['schwedisch'];
    $sk_inf   = konsonanten_skelett($inf_form);
    $sk_prat  = konsonanten_skelett($v['praeteritum']);
    $distanz  = levenshtein($sk_inf, $sk_prat);
    $schwelle = max(2, (int) floor(mb_strlen($sk_inf) / 2));
    if ($distanz > $schwelle && mb_strlen($sk_inf) > 0) {
        $verb_muster[$v['id']] = 'oregelbunden';
        continue;
    }
    // Kurze Verben: Suffix-Check am Präteritum (-ick, -od, -åg)
    $prat_lower = mb_strtolower(trim($v['praeteritum']));
    if (mb_substr($prat_lower, -3) === 'ick' ||
        mb_substr($prat_lower, -2) === 'od'  ||
        mb_substr($prat_lower, -2) === 'åg') {
        $verb_muster[$v['id']] = 'kurz';
        continue;
    }
    // Vokal-Muster
    $v1 = stammvokal($inf_form,         'infinitiv');
    $v2 = stammvokal($v['praeteritum'], 'praeteritum');
    $v3 = stammvokal($v['supinum'],     'supinum');

    if ($v1 === '' || $v2 === '' || $v3 === '') {
        $verb_muster[$v['id']] = $v['verbklasse'] ?? 'sonderfall';
        continue;
    }
    $muster = "{$v1}-{$v2}-{$v3}";
    $verb_muster[$v['id']] = $familien_map_vokale[$muster] ?? "__muster__{$muster}";
}

// Phase 3: Unbekannte Einzelmuster → sonderfall
$muster_zaehler = array_count_values($verb_muster);
foreach ($verb_muster as $vid => $klasse) {
    if (str_starts_with($klasse, '__muster__')) {
        $verb_muster[$vid] = 'sonderfall';
    } elseif (!in_array($klasse, ['oregelbunden', 'iei', 'iau', 'uöu', 'yöu', 'aoa', 'kurz'], true)) {
        $verb_muster[$vid] = 'sonderfall';
    }
}

// Phase 4: Häufigkeits-Check — Klassen mit < 2 Verben → sonderfall
$klassen_zaehler = [];
foreach ($verb_muster as $klasse) {
    $klassen_zaehler[$klasse] = ($klassen_zaehler[$klasse] ?? 0) + 1;
}
foreach ($verb_muster as $vid => $klasse) {
    if ($klasse === 'oregelbunden') continue;
    if (($klassen_zaehler[$klasse] ?? 0) < 2) {
        $verb_muster[$vid] = 'sonderfall';
    }
}

// Gruppieren
$familien = [];
foreach ($verben as $v) {
    $klasse = $verb_muster[$v['id']] ?? 'sonderfall';
    if (!isset($familien[$klasse])) {
        $familien[$klasse] = [];
    }
    $familien[$klasse][] = [
        'id'          => (int) $v['id'],
        'schwedisch'  => $v['schwedisch'],
        'deutsch'     => $v['deutsch'],
        'infinitiv'   => $v['infinitiv'],
        'praesens'    => $v['praesens'],
        'praeteritum' => $v['praeteritum'],
        'supinum'     => $v['supinum'],
    ];
}

json_erfolg([
    'familien'       => $familien,
    'gelernt_gesamt' => count($verben),
]);
