<?php
/**
 * API: Schnellueben — Starten
 *
 * POST /api/schnellueben/starten.php
 * Body: { lektion_ids: [], favoriten: boolean, anzahl: 5-10, aufgaben_typen: [] }
 *
 * Erstellt eine Schnellueben-Sitzung und generiert Aufgaben.
 * Kein SM-2, keine Fortschritts-Updates. 50% XP.
 *
 * Aufgabentypen:
 * - multiple_choice: 4 Optionen, 1 richtig, 3 Distraktoren
 * - zuordnung: 4-6 Paare verbinden (Tap-basiert)
 * - satz_bauen: Woerter in richtige Reihenfolge sortieren
 * - hoer_mc, hoer_satz, sprechen_vokabel, sprechen_satz
 * Grammatik-Typen (stufe >= gekonnt_schwelle erforderlich):
 * - genus_block: 4 Nomen → alle en/ett antippen
 * - endungs_matching: Infinitiv → Präteritum-Endung wählen (Gruppen 1–3)
 * - gruppen_quiz: Verb → Verbgruppe wählen
 * - partikel_puzzle: Hauptverb → richtigen Partikel wählen
 * - starkes_verb: Infinitiv → Vokalklasse wählen, Formen werden angezeigt
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';
require_once dirname(__DIR__, 2) . '/konfiguration/konstanten.php';
require_once dirname(__DIR__, 2) . '/konfiguration/lern_algorithmus.php';
require_once dirname(__DIR__, 2) . '/konfiguration/hilfsfunktionen.php';
require_once dirname(__DIR__, 2) . '/konfiguration/grammatik_helfer.php';

// --- Methode pruefen ---
methode_erzwingen('POST');

// --- Authentifizierung ---
$benutzer = benutzer_authentifizieren();

// --- Eingabe validieren ---
$body = json_body_lesen();

$lektion_ids = $body['lektion_ids'] ?? [];
if (!is_array($lektion_ids)) {
    fehler_ungueltige_eingabe('lektion_ids muss ein Array sein.');
}
$lektion_ids = array_map('intval', $lektion_ids);
$lektion_ids = array_values(array_filter($lektion_ids, fn($id) => $id > 0));

$favoriten = !empty($body['favoriten']);

$anzahl = (int) ($body['anzahl'] ?? 8);
if ($anzahl < 5 || $anzahl > 20) {
    fehler_ungueltige_eingabe('Anzahl muss zwischen 5 und 20 liegen.');
}

// Aufgaben-Typen (optional, Standard: alle Nicht-Grammatik-Typen)
$erlaubte_typen = [
    'multiple_choice', 'zuordnung', 'satz_bauen',
    'hoer_mc', 'hoer_satz', 'sprechen_vokabel', 'sprechen_satz',
    'genus_block', 'endungs_matching', 'gruppen_quiz', 'partikel_puzzle', 'starkes_verb',
    'praep_chunk', 'praep_kategorisierung',
];
$grammatik_typen = ['genus_block', 'endungs_matching', 'gruppen_quiz', 'partikel_puzzle', 'starkes_verb'];
$praep_typen     = ['praep_chunk', 'praep_kategorisierung'];

$aufgaben_typen = $body['aufgaben_typen'] ?? array_diff($erlaubte_typen, $grammatik_typen);
if (!is_array($aufgaben_typen) || empty($aufgaben_typen)) {
    $aufgaben_typen = array_diff($erlaubte_typen, $grammatik_typen);
}
$aufgaben_typen = array_values(array_intersect($aufgaben_typen, $erlaubte_typen));

// Mindestens eine Quelle
if (empty($lektion_ids) && !$favoriten) {
    fehler_ungueltige_eingabe('Mindestens eine Lektion oder Favoriten muss ausgewaehlt sein.');
}

$pdo = db_verbindung();

// --- Lernpfad-Validierung: gesperrte Lektionen herausfiltern ---
// Identisch zu training/starten.php: sequenzieller Lock fuer oeffentliche kategorisierte Lektionen.
// Private Lektionen, unkategorisierte oeffentliche und Aufgaben-Lektionen sind immer erlaubt.
if (!empty($lektion_ids) && ($benutzer['rolle'] ?? '') !== 'admin') {
    $benutzer_id_val = (int) $benutzer['id'];

    $stmtSchwelle = $pdo->prepare("SELECT wert FROM app_konfiguration WHERE schluessel = 'lernpfad_schwelle'");
    $stmtSchwelle->execute();
    $schwelleWert = $stmtSchwelle->fetchColumn();
    $schwelle = ($schwelleWert !== false && $schwelleWert !== '')
        ? max(1, min(100, (int) $schwelleWert)) / 100.0
        : 0.5;

    $stmtLek = $pdo->query("
        SELECT l.id, l.kategorie_id FROM lektionen l
        WHERE l.aktiv = 1 AND l.ist_privat = 0 AND l.kategorie_id IS NOT NULL
        ORDER BY l.kategorie_id ASC, l.titel ASC
    ");
    $alle_lektionen = $stmtLek->fetchAll();

    $stmtFP = $pdo->prepare("SELECT vokabel_id, stufe FROM fortschritt WHERE benutzer_id = ? AND richtung = 'DS'");
    $stmtFP->execute([$benutzer_id_val]);
    $fp_map = [];
    foreach ($stmtFP->fetchAll() as $r) { $fp_map[(int)$r['vokabel_id']] = (int)$r['stufe']; }

    $stmtVok = $pdo->query("
        SELECT lv.lektion_id, lv.vokabel_id FROM lektion_vokabeln lv
        JOIN lektionen l ON l.id = lv.lektion_id
        JOIN vokabeln v ON v.id = lv.vokabel_id
        WHERE l.ist_privat = 0 AND l.aktiv = 1 AND v.aktiv = 1
    ");
    $vok_je_lek = [];
    foreach ($stmtVok->fetchAll() as $r) { $vok_je_lek[(int)$r['lektion_id']][] = (int)$r['vokabel_id']; }

    $erlaubt = [];
    $letzter = [];
    $erste_kat = [];
    foreach ($alle_lektionen as $l) {
        if (!isset($erste_kat[(int)$l['kategorie_id']])) { $erste_kat[(int)$l['kategorie_id']] = (int)$l['id']; }
    }
    foreach ($alle_lektionen as $l) {
        $lid = (int)$l['id']; $kid = (int)$l['kategorie_id'];
        $vids = $vok_je_lek[$lid] ?? [];
        $s3 = count($vids) > 0
            ? count(array_filter($vids, fn($v) => ($fp_map[$v] ?? 0) >= 3)) / count($vids)
            : 0.0;
        $ist_erste = ($erste_kat[$kid] ?? null) === $lid;
        $letzt = $letzter[$kid] ?? null;
        $freigesch = $ist_erste || ($letzt && $letzt['freigeschaltet'] && $letzt['stufe3_anteil'] >= $schwelle);
        if ($freigesch) { $erlaubt[] = $lid; }
        $letzter[$kid] = ['freigeschaltet' => $freigesch, 'stufe3_anteil' => $s3];
    }

    // Oeffentliche unkategorisierte Lektionen: immer erlaubt
    $ph_unkat = implode(',', array_fill(0, count($lektion_ids), '?'));
    $stmtUnkat = $pdo->prepare("
        SELECT id FROM lektionen
        WHERE id IN ({$ph_unkat}) AND aktiv = 1 AND ist_privat = 0 AND kategorie_id IS NULL
    ");
    $stmtUnkat->execute($lektion_ids);
    foreach ($stmtUnkat->fetchAll() as $r) { $erlaubt[] = (int)$r['id']; }

    // Private Lektionen: immer erlaubt
    $stmtPriv = $pdo->prepare("
        SELECT id FROM lektionen WHERE id IN ({$ph_unkat}) AND ist_privat = 1
          AND (besitzer_id = ? OR gruppen_id IN (
            SELECT gruppen_id FROM gruppen_mitglieder WHERE benutzer_id = ?
          ))
    ");
    $stmtPriv->execute(array_merge($lektion_ids, [$benutzer_id_val, $benutzer_id_val]));
    foreach ($stmtPriv->fetchAll() as $r) { $erlaubt[] = (int)$r['id']; }

    // Aufgaben-Lektionen: immer erlaubt
    try {
        $stmtAufg = $pdo->prepare("
            SELECT lektion_id FROM benutzer_aufgaben
            WHERE benutzer_id = ? AND lektion_id IN ({$ph_unkat})
        ");
        $stmtAufg->execute(array_merge([$benutzer_id_val], $lektion_ids));
        foreach ($stmtAufg->fetchAll() as $r) { $erlaubt[] = (int)$r['lektion_id']; }
    } catch (\Throwable $e) {}

    $lektion_ids = array_values(array_filter($lektion_ids, fn($id) => in_array($id, $erlaubt, true)));

    if (empty($lektion_ids) && !$favoriten) {
        fehler_ungueltige_eingabe('Keine freigeschalteten Lektionen ausgewaehlt.');
    }
}

// --- Globales Level und Level-Konfiguration laden ---
$stmt_lv = $pdo->prepare("SELECT globales_level FROM benutzer_statistik WHERE benutzer_id = ?");
$stmt_lv->execute([$benutzer['id']]);
$row_lv = $stmt_lv->fetch();
$globales_level = $row_lv ? (int) $row_lv['globales_level'] : 1;
$level_konfiguration = level_konfiguration_laden($pdo);

// --- Vokabeln sammeln (aus Lektionen + Favoriten) ---
$vokabel_ids = [];

// Aus Lektionen
if (!empty($lektion_ids)) {
    $placeholders = implode(',', array_fill(0, count($lektion_ids), '?'));
    $stmt = $pdo->prepare("
        SELECT DISTINCT lv.vokabel_id
        FROM lektion_vokabeln lv
        JOIN vokabeln v ON v.id = lv.vokabel_id AND v.aktiv = 1
        WHERE lv.lektion_id IN ({$placeholders})
    ");
    $stmt->execute($lektion_ids);
    while ($zeile = $stmt->fetch()) {
        $vokabel_ids[] = (int) $zeile['vokabel_id'];
    }
}

// Aus Favoriten
if ($favoriten) {
    $stmt = $pdo->prepare("
        SELECT bf.vokabel_id
        FROM benutzer_favoriten bf
        JOIN vokabeln v ON v.id = bf.vokabel_id AND v.aktiv = 1
        WHERE bf.benutzer_id = ?
    ");
    $stmt->execute([$benutzer['id']]);
    while ($zeile = $stmt->fetch()) {
        $vokabel_ids[] = (int) $zeile['vokabel_id'];
    }
}

// Duplikate entfernen
$vokabel_ids = array_values(array_unique($vokabel_ids));

// --- Fällige Vokabeln aus anderen Lektionen einmischen ---
$faellige_einmischen = (bool) ($body['faellige_einmischen'] ?? true);
if ($faellige_einmischen && !empty($vokabel_ids)) {
    $anteil_faellig = max(0, min(50, (int) konfig_wert('faellige_vokabeln_anteil', '20')));
    $max_faellige = max(1, (int) round($anzahl * $anteil_faellig / 100));

    $bestehende_placeholders = implode(',', array_fill(0, count($vokabel_ids), '?'));
    $stmt = $pdo->prepare("
        SELECT DISTINCT f.vokabel_id
        FROM fortschritt f
        JOIN vokabeln v ON v.id = f.vokabel_id AND v.aktiv = 1
        WHERE f.benutzer_id = ?
          AND f.richtung = 'DS'
          AND f.naechste_wiederholung <= CURDATE()
          AND f.vokabel_id NOT IN ({$bestehende_placeholders})
        ORDER BY f.naechste_wiederholung ASC
        LIMIT ?
    ");
    $stmt->execute(array_merge([$benutzer['id']], $vokabel_ids, [$max_faellige]));
    while ($zeile = $stmt->fetch()) {
        $vokabel_ids[] = (int) $zeile['vokabel_id'];
    }
    $vokabel_ids = array_values(array_unique($vokabel_ids));
}

// --- Neue-Vokabeln-Limit anwenden ---
// Gleiche Regel wie Training: max X neue Vokabeln pro Tag (global + User-Bonus)
$basis_neue = (int) konfig_wert('neue_vokabeln_pro_tag', '10');
$faktor = 100;

// Per-User Faktor laden (50=Entspannt, 100=Normal, 200=Intensiv, 300=Intensiv+)
try {
    $stmt_fak = $pdo->prepare("SELECT neue_vokabeln_faktor FROM benutzer WHERE id = ?");
    $stmt_fak->execute([$benutzer['id']]);
    $val = $stmt_fak->fetchColumn();
    if ($val !== false) $faktor = (int) $val;
} catch (\Throwable $e) {
    try {
        $stmt_bonus = $pdo->prepare("SELECT neue_vokabeln_bonus FROM benutzer WHERE id = ?");
        $stmt_bonus->execute([$benutzer['id']]);
        $bonus = (int) ($stmt_bonus->fetchColumn() ?: 0);
        $faktor = $bonus === 20 ? 300 : ($bonus === 10 ? 200 : 100);
    } catch (\Throwable $e2) {}
}

// Temporaerer Override (z.B. vom Interferenz-Dialog)
if (isset($body['neue_vokabeln_faktor_override'])) {
    $override = (int) $body['neue_vokabeln_faktor_override'];
    if (in_array($override, [0, 50, 100, 200, 300], true)) {
        $faktor = $override;
    }
}

$max_neue = max(0, (int) round($basis_neue * $faktor / 100));

// Zaehle anhand erstellt_am (= wann der Fortschritts-Eintrag erstmalig angelegt wurde)
try {
    $stmt_heute = $pdo->prepare("
        SELECT COUNT(DISTINCT vokabel_id) as anzahl
        FROM fortschritt
        WHERE benutzer_id = ? AND DATE(erstellt_am) = CURDATE()
    ");
    $stmt_heute->execute([$benutzer['id']]);
    $heute_neue = (int) $stmt_heute->fetchColumn();
} catch (\Throwable $e) {
    // Fallback falls erstellt_am-Spalte noch nicht existiert
    $stmt_heute = $pdo->prepare("
        SELECT COUNT(DISTINCT vokabel_id) as anzahl
        FROM fortschritt
        WHERE benutzer_id = ? AND DATE(aktualisiert_am) = CURDATE() AND wiederholungen <= 1
    ");
    $stmt_heute->execute([$benutzer['id']]);
    $heute_neue = (int) $stmt_heute->fetchColumn();
}
$verbleibende_neue = max(0, $max_neue - $heute_neue);

// Vokabeln ohne Fortschritt identifizieren und ggf. kuerzen
if (!empty($vokabel_ids)) {
    $ph = implode(',', array_fill(0, count($vokabel_ids), '?'));
    $stmt_fort = $pdo->prepare("
        SELECT DISTINCT vokabel_id FROM fortschritt
        WHERE benutzer_id = ? AND vokabel_id IN ({$ph})
    ");
    $stmt_fort->execute(array_merge([$benutzer['id']], $vokabel_ids));
    $gelernte_ids = array_column($stmt_fort->fetchAll(), 'vokabel_id');
    $gelernte_set = array_flip($gelernte_ids);

    $bekannte = [];
    $neue = [];
    foreach ($vokabel_ids as $vid) {
        if (isset($gelernte_set[$vid])) {
            $bekannte[] = $vid;
        } else {
            $neue[] = $vid;
        }
    }

    // Neue Vokabeln auf verbleibendes Tageslimit kuerzen
    if (count($neue) > $verbleibende_neue) {
        shuffle($neue);
        $neue = array_slice($neue, 0, $verbleibende_neue);
    }

    $vokabel_ids = array_values(array_merge($bekannte, $neue));
}

if (count($vokabel_ids) < 2) {
    fehler_ungueltige_eingabe('Mindestens 2 aktive Vokabeln noetig fuer Schnellueben.');
}

// --- Vokabel-Daten laden ---
$placeholders = implode(',', array_fill(0, count($vokabel_ids), '?'));
// verbklasse ist ein neues Feld (migration_grammatik). Defensiv: Fallback auf NULL
// wenn die Spalte auf dem Server noch fehlt (Migration noch nicht gelaufen).
try {
    $stmt = $pdo->prepare("
        SELECT v.id, v.schwedisch, v.deutsch, v.wortart, v.genus, v.verbgruppe,
               v.verbklasse, v.sprachniveau, v.kategorie_id
        FROM vokabeln v
        WHERE v.id IN ({$placeholders}) AND v.aktiv = 1
    ");
    $stmt->execute($vokabel_ids);
} catch (\PDOException $e) {
    // verbklasse-Spalte fehlt noch (Migration ausständig) → ohne sie laden
    $stmt = $pdo->prepare("
        SELECT v.id, v.schwedisch, v.deutsch, v.wortart, v.genus, v.verbgruppe,
               NULL AS verbklasse, v.sprachniveau, v.kategorie_id
        FROM vokabeln v
        WHERE v.id IN ({$placeholders}) AND v.aktiv = 1
    ");
    $stmt->execute($vokabel_ids);
}
$vokabeln = $stmt->fetchAll();

// Indexieren nach ID
$vokabel_map = [];
foreach ($vokabeln as $v) {
    $v['id'] = (int) $v['id'];
    $vokabel_map[$v['id']] = $v;
}

// --- Saetze batch-laden (fuer Satz-Bauen) ---
$saetze_map = [];
$stmt = $pdo->prepare("
    SELECT id, vokabel_id, schwedisch_satz, deutsch_satz, benoetigte_form, sprachniveau
    FROM saetze
    WHERE vokabel_id IN ({$placeholders}) AND aktiv = 1
");
$stmt->execute($vokabel_ids);
$alle_saetze = $stmt->fetchAll();

foreach ($alle_saetze as $satz) {
    $vid = (int) $satz['vokabel_id'];
    if (!isset($saetze_map[$vid])) {
        $saetze_map[$vid] = [];
    }
    $saetze_map[$vid][] = $satz;
}

// --- Wortformen batch-laden (um benoetigte_form aufzuloesen) ---
// Schluessel: "vokabel_id|form_bezeichnung" => form_wert
$formen_map = [];
$stmt = $pdo->prepare("
    SELECT vokabel_id, form_bezeichnung, form_wert
    FROM vokabel_formen
    WHERE vokabel_id IN ({$placeholders})
");
$stmt->execute($vokabel_ids);
foreach ($stmt->fetchAll() as $form) {
    $key = ((int) $form['vokabel_id']) . '|' . $form['form_bezeichnung'];
    $formen_map[$key] = $form['form_wert'];
}

// --- Grammatik-Vokabeln laden (stufe >= gekonnt_schwelle, nur wenn Grammatik-Typen ausgewählt) ---
$grammatik_vokabeln = ['nomen' => [], 'verben_gruppe' => [], 'verben_alle' => [], 'partikelverben' => [], 'starke_verben' => []];
$hat_grammatik_typen = !empty(array_intersect($aufgaben_typen, $grammatik_typen));
if ($hat_grammatik_typen) {
    $grammatik_vokabeln = grammatik_vokabeln_laden($pdo, $benutzer['id'], $vokabel_ids);
}

// --- Präpositions-Daten laden (nur wenn Präp-Typen ausgewählt) ---
$alle_praepositionen_pool = [
    'i', 'på', 'till', 'från', 'med', 'av', 'om', 'för', 'vid', 'mot', 'efter', 'utan',
    'över', 'under', 'bakom', 'framför', 'bredvid', 'mellan', 'hos', 'genom', 'utanför', 'längs',
    'ur', 'per', 'enligt', 'tills',
];
$praep_chunks_pool = [];
$praep_kat_pool    = [];
$hat_praep_typen   = !empty(array_intersect($aufgaben_typen, $praep_typen));
if ($hat_praep_typen) {
    if (in_array('praep_chunk', $aufgaben_typen, true)) {
        $stmt = $pdo->query("SELECT id, schwedisch, loesung, deutsche_uebersetzung FROM praep_chunks WHERE aktiv = 1 ORDER BY RAND() LIMIT 20");
        $praep_chunks_pool = $stmt->fetchAll();
    }
    if (in_array('praep_kategorisierung', $aufgaben_typen, true)) {
        $stmt = $pdo->query("
            SELECT b.id, b.schwedisch, b.deutsch, b.beispielsatz,
                   k.praeposition AS loesung, k.merksatz, k.merksatz_uebersetzung
            FROM praep_kategorie_begriffe b
            JOIN praep_kategorien k ON k.id = b.kategorie_id
            WHERE b.aktiv = 1 ORDER BY RAND() LIMIT 20
        ");
        $praep_kat_pool = $stmt->fetchAll();
    }
}

// --- Sitzung erstellen ---
$stmt = $pdo->prepare("
    INSERT INTO trainings_sitzungen (benutzer_id, typ)
    VALUES (?, 'schnell')
");
$stmt->execute([$benutzer['id']]);
$sitzung_id = (int) $pdo->lastInsertId();

// --- Aufgaben generieren ---
$aufgaben = _aufgaben_generieren($vokabeln, $vokabel_map, $saetze_map, $formen_map, $anzahl, $aufgaben_typen, $grammatik_vokabeln, $globales_level, $level_konfiguration, $praep_chunks_pool, $praep_kat_pool, $alle_praepositionen_pool);

// --- Antwort ---
json_erfolg([
    'sitzung_id' => $sitzung_id,
    'aufgaben'   => $aufgaben,
    'gesamt'     => count($aufgaben),
]);


// ============================================================
// Hilfsfunktionen
// ============================================================

/**
 * Generiert gemischte Aufgaben nach erlaubten Typen
 */
function _aufgaben_generieren(
    array $vokabeln,
    array $vokabel_map,
    array $saetze_map,
    array $formen_map,
    int $anzahl,
    array $typen,
    array $grammatik_vokabeln = [],
    int $globales_level = 5,
    ?array $level_konfiguration = null,
    array $praep_chunks = [],
    array $praep_kat = [],
    array $praep_alle = []
): array {
    $aufgaben = [];
    $index = 0;

    // Vokabeln mischen
    $gemischte_vokabeln = $vokabeln;
    shuffle($gemischte_vokabeln);

    $gesamt_vokabeln = count($gemischte_vokabeln);

    // --- Machbarkeit prüfen ---
    $hat_mc              = in_array('multiple_choice', $typen);
    $hat_zuordnung       = in_array('zuordnung', $typen);
    $hat_satz            = in_array('satz_bauen', $typen);
    $hat_hoer_mc         = in_array('hoer_mc', $typen);
    $hat_hoer_satz       = in_array('hoer_satz', $typen);
    $hat_sprechen_vok    = in_array('sprechen_vokabel', $typen);
    $hat_sprechen_satz   = in_array('sprechen_satz', $typen);

    // Grammatik-Typen
    $hat_genus_block     = in_array('genus_block', $typen);
    $hat_endungs         = in_array('endungs_matching', $typen);
    $hat_gruppen_quiz    = in_array('gruppen_quiz', $typen);
    $hat_partikel        = in_array('partikel_puzzle', $typen);
    $hat_starkes_verb    = in_array('starkes_verb', $typen);

    $braucht_saetze = $hat_satz || $hat_hoer_satz || $hat_sprechen_satz;
    $satz_kandidaten = $braucht_saetze
                     ? _satz_kandidaten_sammeln($gemischte_vokabeln, $saetze_map, $formen_map, $globales_level, $level_konfiguration)
                     : [];

    $zuordnung_moeglich     = $hat_zuordnung     && $gesamt_vokabeln >= 4;
    $satz_moeglich          = $hat_satz          && count($satz_kandidaten) > 0;
    $hoer_mc_moeglich       = $hat_hoer_mc       && $gesamt_vokabeln >= 4;
    $hoer_satz_moeglich     = $hat_hoer_satz     && count($satz_kandidaten) > 0;
    $sprechen_vok_moeglich  = $hat_sprechen_vok  && $gesamt_vokabeln >= 1;
    $sprechen_satz_moeglich = $hat_sprechen_satz && count($satz_kandidaten) > 0;

    // Grammatik-Machbarkeit
    $genus_block_moeglich  = $hat_genus_block  && count($grammatik_vokabeln['nomen']) >= 4;
    $endungs_moeglich      = $hat_endungs      && count($grammatik_vokabeln['verben_gruppe']) >= 1;
    $gruppen_quiz_moeglich = $hat_gruppen_quiz && count($grammatik_vokabeln['verben_alle']) >= 1;
    $partikel_moeglich     = $hat_partikel     && count($grammatik_vokabeln['partikelverben']) >= 1;
    $starkes_verb_moeglich = $hat_starkes_verb && count($grammatik_vokabeln['starke_verben']) >= 1;

    // Präpositions-Machbarkeit
    $hat_praep_chunk    = in_array('praep_chunk', $typen);
    $hat_praep_kat      = in_array('praep_kategorisierung', $typen);
    $praep_chunk_moeglich = $hat_praep_chunk && count($praep_chunks) > 0;
    $praep_kat_moeglich   = $hat_praep_kat   && count($praep_kat) > 0;

    // --- Aufteilen: Regulär vs. Grammatik vs. Präposition ---
    // Grammatikfragen bekommen max. 10% der Slots (min. 1) wenn gemischt;
    // bei ausschließlich Grammatik-Typen alle Slots.
    $aktive_regulaer = [];
    if ($hat_mc)                 $aktive_regulaer[] = 'mc';
    if ($zuordnung_moeglich)     $aktive_regulaer[] = 'zuordnung';
    if ($satz_moeglich)          $aktive_regulaer[] = 'satz';
    if ($hoer_mc_moeglich)       $aktive_regulaer[] = 'hoer_mc';
    if ($hoer_satz_moeglich)     $aktive_regulaer[] = 'hoer_satz';
    if ($sprechen_vok_moeglich)  $aktive_regulaer[] = 'sprechen_vok';
    if ($sprechen_satz_moeglich) $aktive_regulaer[] = 'sprechen_satz';

    $aktive_grammatik = [];
    if ($genus_block_moeglich)   $aktive_grammatik[] = 'genus_block';
    if ($endungs_moeglich)       $aktive_grammatik[] = 'endungs';
    if ($gruppen_quiz_moeglich)  $aktive_grammatik[] = 'gruppen_quiz';
    if ($partikel_moeglich)      $aktive_grammatik[] = 'partikel';
    if ($starkes_verb_moeglich)  $aktive_grammatik[] = 'starkes_verb';

    $aktive_praep = [];
    if ($praep_chunk_moeglich)   $aktive_praep[] = 'praep_chunk';
    if ($praep_kat_moeglich)     $aktive_praep[] = 'praep_kat';

    // Fallback: mindestens MC
    if (empty($aktive_regulaer) && empty($aktive_grammatik) && empty($aktive_praep)) {
        $aktive_regulaer = ['mc'];
        $hat_mc = true;
    }

    // Slots aufteilen: Regulär / Grammatik / Präposition
    $praep_slots     = 0;
    $grammatik_slots = 0;
    $regulaer_slots  = 0;

    $hat_reg   = !empty($aktive_regulaer);
    $hat_gramm = !empty($aktive_grammatik);
    $hat_praep = !empty($aktive_praep);

    if ($hat_reg && $hat_gramm && $hat_praep) {
        $grammatik_slots = max(1, (int) round($anzahl * 0.10));
        $praep_slots     = max(1, (int) round($anzahl * 0.15));
        $regulaer_slots  = $anzahl - $grammatik_slots - $praep_slots;
    } elseif ($hat_reg && $hat_praep) {
        $praep_slots    = max(1, (int) round($anzahl * 0.20));
        $regulaer_slots = $anzahl - $praep_slots;
    } elseif ($hat_reg && $hat_gramm) {
        $grammatik_slots = max(1, (int) round($anzahl * 0.10));
        $regulaer_slots  = $anzahl - $grammatik_slots;
    } elseif ($hat_gramm && $hat_praep) {
        $grammatik_slots = (int) round($anzahl * 0.50);
        $praep_slots     = $anzahl - $grammatik_slots;
    } elseif ($hat_praep) {
        $praep_slots = $anzahl;
    } elseif ($hat_gramm) {
        $grammatik_slots = $anzahl;
    } else {
        $regulaer_slots = $anzahl;
    }

    // Anzahl pro regulärem Typ
    $mc_anzahl = $zuordnung_anzahl = $satz_anzahl = $hoer_mc_anzahl = 0;
    $hoer_satz_anzahl = $sprechen_vok_anzahl = $sprechen_satz_anzahl = 0;

    if (!empty($aktive_regulaer) && $regulaer_slots > 0) {
        $r_cnt  = count($aktive_regulaer);
        $r_basis = (int) floor($regulaer_slots / $r_cnt);
        $r_rest  = $regulaer_slots % $r_cnt;
        foreach ($aktive_regulaer as $i => $typ) {
            $n = $r_basis + ($i < $r_rest ? 1 : 0);
            switch ($typ) {
                case 'mc':            $mc_anzahl            = $n; break;
                case 'zuordnung':     $zuordnung_anzahl     = $n; break;
                case 'satz':          $satz_anzahl          = $n; break;
                case 'hoer_mc':       $hoer_mc_anzahl       = $n; break;
                case 'hoer_satz':     $hoer_satz_anzahl     = $n; break;
                case 'sprechen_vok':  $sprechen_vok_anzahl  = $n; break;
                case 'sprechen_satz': $sprechen_satz_anzahl = $n; break;
            }
        }
    }

    // Anzahl pro Grammatik-Typ
    $genus_block_anzahl = $endungs_anzahl = $gruppen_quiz_anzahl = 0;
    $partikel_anzahl = $starkes_verb_anzahl = 0;

    if (!empty($aktive_grammatik) && $grammatik_slots > 0) {
        $g_cnt  = count($aktive_grammatik);
        $g_basis = (int) floor($grammatik_slots / $g_cnt);
        $g_rest  = $grammatik_slots % $g_cnt;
        foreach ($aktive_grammatik as $i => $typ) {
            $n = $g_basis + ($i < $g_rest ? 1 : 0);
            switch ($typ) {
                case 'genus_block':  $genus_block_anzahl  = $n; break;
                case 'endungs':      $endungs_anzahl      = $n; break;
                case 'gruppen_quiz': $gruppen_quiz_anzahl = $n; break;
                case 'partikel':     $partikel_anzahl     = $n; break;
                case 'starkes_verb': $starkes_verb_anzahl = $n; break;
            }
        }
    }

    // Anzahl pro Präpositions-Typ
    $praep_chunk_anzahl = 0;
    $praep_kat_anzahl   = 0;

    if (!empty($aktive_praep) && $praep_slots > 0) {
        $p_cnt   = count($aktive_praep);
        $p_basis = (int) floor($praep_slots / $p_cnt);
        $p_rest  = $praep_slots % $p_cnt;
        foreach ($aktive_praep as $i => $typ) {
            $n = $p_basis + ($i < $p_rest ? 1 : 0);
            switch ($typ) {
                case 'praep_chunk': $praep_chunk_anzahl = $n; break;
                case 'praep_kat':   $praep_kat_anzahl   = $n; break;
            }
        }
    }

    $vok_pool = $gemischte_vokabeln;

    // --- 1) Zuordnung ---
    for ($z = 0; $z < $zuordnung_anzahl; $z++) {
        $paare_anzahl = min(count($vok_pool), mt_rand(4, 6));
        if ($paare_anzahl < 4) { $mc_anzahl += ($zuordnung_anzahl - $z); break; }
        $gruppe = array_splice($vok_pool, 0, $paare_anzahl);
        $aufgaben[] = _zuordnung_aufgabe($gruppe, $index++);
    }

    // --- 2) Satz-Bauen ---
    $satz_kands = $satz_kandidaten;
    shuffle($satz_kands);
    $satz_zaehler = 0;
    foreach ($satz_kands as $k) {
        if ($satz_zaehler >= $satz_anzahl) break;
        $a = _satz_aufgabe($k['vokabel'], $k['satz'], $index, $formen_map);
        if ($a !== null) { $aufgaben[] = $a; $index++; $satz_zaehler++; }
    }
    $mc_anzahl += ($satz_anzahl - $satz_zaehler);

    // --- 3) Hör-MC ---
    $hoer_mc_pool = $gemischte_vokabeln;
    shuffle($hoer_mc_pool);
    $hoer_mc_zaehler = 0;
    foreach ($hoer_mc_pool as $vok) {
        if ($hoer_mc_zaehler >= $hoer_mc_anzahl) break;
        if (count($gemischte_vokabeln) < 4) break;
        $a = _hoer_mc_aufgabe($vok, $gemischte_vokabeln, $index);
        if ($a !== null) { $aufgaben[] = $a; $index++; $hoer_mc_zaehler++; }
    }
    $mc_anzahl += ($hoer_mc_anzahl - $hoer_mc_zaehler);

    // --- 4) Hör-Satz ---
    $hoer_satz_kands = $satz_kandidaten;
    shuffle($hoer_satz_kands);
    $hoer_satz_zaehler = 0;
    foreach ($hoer_satz_kands as $k) {
        if ($hoer_satz_zaehler >= $hoer_satz_anzahl) break;
        $a = _hoer_satz_aufgabe($k['vokabel'], $k['satz'], $index, $formen_map);
        if ($a !== null) { $aufgaben[] = $a; $index++; $hoer_satz_zaehler++; }
    }
    $mc_anzahl += ($hoer_satz_anzahl - $hoer_satz_zaehler);

    // --- 5) Sprechen-Vokabel ---
    $sprechen_vok_pool = $gemischte_vokabeln;
    shuffle($sprechen_vok_pool);
    $sprechen_vok_zaehler = 0;
    foreach ($sprechen_vok_pool as $vok) {
        if ($sprechen_vok_zaehler >= $sprechen_vok_anzahl) break;
        $a = _sprechen_vokabel_aufgabe($vok, $index);
        if ($a !== null) { $aufgaben[] = $a; $index++; $sprechen_vok_zaehler++; }
    }
    $mc_anzahl += ($sprechen_vok_anzahl - $sprechen_vok_zaehler);

    // --- 6) Sprechen-Satz ---
    $sprechen_satz_kands = $satz_kandidaten;
    shuffle($sprechen_satz_kands);
    $sprechen_satz_zaehler = 0;
    foreach ($sprechen_satz_kands as $k) {
        if ($sprechen_satz_zaehler >= $sprechen_satz_anzahl) break;
        $a = _sprechen_satz_aufgabe($k['vokabel'], $k['satz'], $index, $formen_map);
        if ($a !== null) { $aufgaben[] = $a; $index++; $sprechen_satz_zaehler++; }
    }
    $mc_anzahl += ($sprechen_satz_anzahl - $sprechen_satz_zaehler);

    // --- 7) Multiple-Choice ---
    if ($hat_mc && $gesamt_vokabeln >= 4) {
        $mc_pool = $gemischte_vokabeln;
        shuffle($mc_pool);
        $mc_zaehler = 0;
        foreach ($mc_pool as $vok) {
            if ($mc_zaehler >= $mc_anzahl) break;
            $a = _mc_aufgabe($vok, $gemischte_vokabeln, $index);
            if ($a !== null) { $aufgaben[] = $a; $index++; $mc_zaehler++; }
        }
    }

    // --- 8) Genus-Block ---
    if ($genus_block_anzahl > 0) {
        $nomen_pool = $grammatik_vokabeln['nomen'];
        shuffle($nomen_pool);
        $genus_zaehler = 0;
        for ($g = 0; $g < $genus_block_anzahl; $g++) {
            $a = genus_block_erstellen($nomen_pool, $index);
            if ($a !== null) { $aufgaben[] = $a; $index++; $genus_zaehler++; }
            else { break; }
        }
        $mc_anzahl += ($genus_block_anzahl - $genus_zaehler);
    }

    // --- 9) Endungs-Matching ---
    if ($endungs_anzahl > 0) {
        $verben_pool = $grammatik_vokabeln['verben_gruppe'];
        shuffle($verben_pool);
        $endungs_zaehler = 0;
        foreach ($verben_pool as $vok) {
            if ($endungs_zaehler >= $endungs_anzahl) break;
            $a = endungs_matching_erstellen($vok, $index, $globales_level, $level_konfiguration);
            if ($a !== null) { $aufgaben[] = $a; $index++; $endungs_zaehler++; }
        }
        $mc_anzahl += ($endungs_anzahl - $endungs_zaehler);
    }

    // --- 10) Gruppen-Quiz ---
    if ($gruppen_quiz_anzahl > 0) {
        $verben_pool = $grammatik_vokabeln['verben_alle'];
        shuffle($verben_pool);
        $gruppen_zaehler = 0;
        foreach ($verben_pool as $vok) {
            if ($gruppen_zaehler >= $gruppen_quiz_anzahl) break;
            $a = gruppen_quiz_erstellen($vok, $index);
            if ($a !== null) { $aufgaben[] = $a; $index++; $gruppen_zaehler++; }
        }
        $mc_anzahl += ($gruppen_quiz_anzahl - $gruppen_zaehler);
    }

    // --- 11) Partikel-Puzzle ---
    if ($partikel_anzahl > 0) {
        $partikel_pool   = $grammatik_vokabeln['partikelverben'];
        $alle_partikel   = partikel_aus_pool_sammeln($partikel_pool);
        shuffle($partikel_pool);
        $partikel_zaehler = 0;
        foreach ($partikel_pool as $vok) {
            if ($partikel_zaehler >= $partikel_anzahl) break;
            $a = partikel_puzzle_erstellen($vok, $alle_partikel, $index);
            if ($a !== null) { $aufgaben[] = $a; $index++; $partikel_zaehler++; }
        }
        $mc_anzahl += ($partikel_anzahl - $partikel_zaehler);
    }

    // --- 12) Starkes Verb ---
    if ($starkes_verb_anzahl > 0) {
        $starke_pool = $grammatik_vokabeln['starke_verben'];
        shuffle($starke_pool);
        $starkes_zaehler = 0;
        foreach ($starke_pool as $vok) {
            if ($starkes_zaehler >= $starkes_verb_anzahl) break;
            $a = starkes_verb_erstellen($vok, $formen_map, $index, $globales_level, $level_konfiguration);
            if ($a !== null) { $aufgaben[] = $a; $index++; $starkes_zaehler++; }
        }
        $mc_anzahl += ($starkes_verb_anzahl - $starkes_zaehler);
    }

    // --- 13) Präp-Lückensatz ---
    if ($praep_chunk_anzahl > 0) {
        $chunk_pool = $praep_chunks;
        shuffle($chunk_pool);
        $praep_chunk_zaehler = 0;
        foreach ($chunk_pool as $chunk) {
            if ($praep_chunk_zaehler >= $praep_chunk_anzahl) break;
            $a = _praep_chunk_aufgabe($chunk, $praep_alle, $index);
            if ($a !== null) { $aufgaben[] = $a; $index++; $praep_chunk_zaehler++; }
        }
    }

    // --- 14) Präp-Kategorisierung ---
    if ($praep_kat_anzahl > 0) {
        $kat_pool_items = $praep_kat;
        shuffle($kat_pool_items);
        $praep_kat_zaehler = 0;
        foreach ($kat_pool_items as $eintrag) {
            if ($praep_kat_zaehler >= $praep_kat_anzahl) break;
            $a = _praep_kat_aufgabe($eintrag, $praep_alle, $index);
            if ($a !== null) { $aufgaben[] = $a; $index++; $praep_kat_zaehler++; }
        }
    }

    // Mischen & Index neu vergeben
    shuffle($aufgaben);
    foreach ($aufgaben as $i => &$a) { $a['index'] = $i; }
    unset($a);

    return $aufgaben;
}

/**
 * Loest benoetigte_form (Bezeichnung) in den tatsaechlichen Formwert auf.
 * Fallback: schwedisches Grundwort der Vokabel.
 */
function _form_wert_aufloesen(array $vok, string $benoetigte_form, array $formen_map): string
{
    $key = ((int) $vok['id']) . '|' . $benoetigte_form;
    return $formen_map[$key] ?? $vok['schwedisch'];
}

/**
 * Sammelt Vokabeln mit verfuegbaren Saetzen
 */
function _satz_kandidaten_sammeln(array $vokabeln, array $saetze_map, array $formen_map, int $globales_level = 5, ?array $lk = null): array
{
    // Kumulative Formen fuer dieses Level berechnen
    $level_formen = [];
    for ($l = 1; $l <= min($globales_level, 5); $l++) {
        $formen_fuer_level = $lk !== null ? ($lk[$l]['formen'] ?? []) : (LEVEL_FORMEN[$l] ?? []);
        $level_formen = array_merge($level_formen, $formen_fuer_level);
    }

    $kandidaten = [];
    foreach ($vokabeln as $vok) {
        $vid = (int) $vok['id'];
        if (!empty($saetze_map[$vid])) {
            foreach ($saetze_map[$vid] as $satz) {
                // Nur Saetze mit ___ Platzhalter, mindestens 3 Woertern und level-erlaubter Form
                if (!empty($satz['benoetigte_form']) && !in_array($satz['benoetigte_form'], $level_formen)) {
                    continue;
                }
                $form_wert = _form_wert_aufloesen($vok, $satz['benoetigte_form'], $formen_map);
                $vollsatz = str_replace('___', $form_wert, $satz['schwedisch_satz']);
                $woerter = explode(' ', trim($vollsatz));
                if (count($woerter) >= 3 && str_contains($satz['schwedisch_satz'], '___')) {
                    $kandidaten[] = [
                        'vokabel' => $vok,
                        'satz'    => $satz,
                    ];
                }
            }
        }
    }
    return $kandidaten;
}

/**
 * Multiple-Choice Aufgabe erstellen
 */
function _mc_aufgabe(array $vok, array $alle_vokabeln, int $index): ?array
{
    // 50/50 Chance: SD (Schwedisch zeigen → Deutsch waehlen) oder DS
    $richtung = mt_rand(0, 1) === 0 ? 'SD' : 'DS';

    if ($richtung === 'SD') {
        $frage_text = $vok['schwedisch'];
        $frage_sprache = 'sv';
        $richtige_antwort = $vok['deutsch'];
        $distraktor_feld = 'deutsch';
        $tts_sprache = 'sv-SE';
    } else {
        $frage_text = $vok['deutsch'];
        $frage_sprache = 'de';
        $richtige_antwort = $vok['schwedisch'];
        $distraktor_feld = 'schwedisch';
        $tts_sprache = 'sv-SE';
    }

    // Distraktoren finden
    $distraktoren = _distraktoren_finden($vok, $alle_vokabeln, $distraktor_feld, 3);

    if (count($distraktoren) < 3) {
        return null; // Nicht genug Distraktoren
    }

    // Optionen bauen
    $optionen = [
        ['id' => 0, 'text' => $richtige_antwort, 'richtig' => true],
    ];
    foreach ($distraktoren as $i => $d) {
        $optionen[] = ['id' => $i + 1, 'text' => $d, 'richtig' => false];
    }
    shuffle($optionen);

    // IDs neu zuweisen nach Mischen
    foreach ($optionen as $i => &$opt) {
        $opt['id'] = $i;
    }
    unset($opt);

    return [
        'index'        => $index,
        'typ'          => 'multiple_choice',
        'vokabel_id'   => (int) $vok['id'],
        'frage_text'   => $frage_text,
        'frage_sprache' => $frage_sprache,
        'optionen'     => $optionen,
        'tts_text'     => klammerzusatz_entfernen($vok['schwedisch']),
        'tts_sprache'  => $tts_sprache,
    ];
}

/**
 * 3 Distraktoren finden (gleiche Wortart bevorzugt)
 */
function _distraktoren_finden(array $vok, array $alle, string $feld, int $anzahl): array
{
    $ergebnis = [];
    $benutzt = [mb_strtolower($vok[$feld])];

    // Pool 1: gleiche Wortart
    $gleiche_wortart = array_filter($alle, fn($v) =>
        (int) $v['id'] !== (int) $vok['id'] && $v['wortart'] === $vok['wortart']
    );
    shuffle($gleiche_wortart);

    foreach ($gleiche_wortart as $v) {
        if (count($ergebnis) >= $anzahl) break;
        $lower = mb_strtolower($v[$feld]);
        if (!in_array($lower, $benutzt)) {
            $ergebnis[] = $v[$feld];
            $benutzt[] = $lower;
        }
    }

    // Pool 2: beliebige Vokabel (Fallback)
    if (count($ergebnis) < $anzahl) {
        $restliche = array_filter($alle, fn($v) =>
            (int) $v['id'] !== (int) $vok['id']
        );
        shuffle($restliche);

        foreach ($restliche as $v) {
            if (count($ergebnis) >= $anzahl) break;
            $lower = mb_strtolower($v[$feld]);
            if (!in_array($lower, $benutzt)) {
                $ergebnis[] = $v[$feld];
                $benutzt[] = $lower;
            }
        }
    }

    return $ergebnis;
}

/**
 * Zuordnung (Matching) Aufgabe erstellen
 */
function _zuordnung_aufgabe(array $vok_gruppe, int $index): array
{
    $paare = [];
    foreach ($vok_gruppe as $i => $vok) {
        $paare[] = [
            'id'         => $i,
            'links'      => $vok['schwedisch'],
            'rechts'     => $vok['deutsch'],
            'vokabel_id' => (int) $vok['id'],
        ];
    }

    // Rechte Seite separat mischen
    $rechts_reihenfolge = array_column($paare, 'rechts');
    shuffle($rechts_reihenfolge);

    return [
        'index'              => $index,
        'typ'                => 'zuordnung',
        'paare'              => $paare,
        'rechts_reihenfolge' => $rechts_reihenfolge,
        'gesamt_paare'       => count($paare),
    ];
}

/**
 * Satz-Bauen Aufgabe erstellen
 */
function _satz_aufgabe(array $vok, array $satz, int $index, array $formen_map = []): ?array
{
    // Vollstaendigen schwedischen Satz rekonstruieren
    $form_wert = _form_wert_aufloesen($vok, $satz['benoetigte_form'], $formen_map);
    $vollsatz = str_replace('___', $form_wert, $satz['schwedisch_satz']);

    // Satzzeichen aus Woertern entfernen — Nutzer soll Woerter, keine Interpunktion sortieren
    $woerter = explode(' ', trim($vollsatz));
    $woerter = array_map(fn($w) => trim($w, '.,!?;:–—«»"""\''), $woerter);
    $woerter = array_values(array_filter($woerter, fn($w) => $w !== ''));

    if (count($woerter) < 3) {
        return null;
    }

    $loesung = $woerter;

    // Woerter mischen (bis anders als Loesung, max 10 Versuche)
    $gemischt = $woerter;
    $versuche = 0;
    do {
        shuffle($gemischt);
        $versuche++;
    } while ($gemischt === $loesung && $versuche < 10);

    // Falls immer noch gleich (z.B. bei 1-2 Woertern), ueberspringen
    if ($gemischt === $loesung) {
        return null;
    }

    return [
        'index'          => $index,
        'typ'            => 'satz_bauen',
        'vokabel_id'     => (int) $vok['id'],
        'deutsch_kontext' => $satz['deutsch_satz'],
        'woerter'        => $gemischt,
        'loesung'        => $loesung,
        'tts_text'       => $vollsatz,
        'tts_sprache'    => 'sv-SE',
    ];
}

/**
 * Hör-MC Aufgabe: 4 Wörter anzeigen, eines vorlesen, richtiges antippen.
 * Sequenziell: alle 4 Wörter werden der Reihe nach vorgelesen.
 */
function _hoer_mc_aufgabe(array $vok, array $alle_vokabeln, int $index): ?array
{
    // 4 Vokabeln: die Ziel-Vokabel + 3 Distraktoren
    $distraktoren_voks = array_filter($alle_vokabeln, fn($v) => (int)$v['id'] !== (int)$vok['id']);
    shuffle($distraktoren_voks);
    $distraktoren_voks = array_slice(array_values($distraktoren_voks), 0, 3);

    if (count($distraktoren_voks) < 3) {
        return null;
    }

    // Alle 4 angezeigten Wörter (Schwedisch, da vorgelesen wird)
    $alle_viergruppe = array_merge([$vok], $distraktoren_voks);
    shuffle($alle_viergruppe);

    $woerter = array_map(fn($v) => klammerzusatz_entfernen($v['schwedisch']), $alle_viergruppe);

    // Sequenz: alle 4 Wörter werden einzeln vorgelesen,
    // Nutzer muss jeweils das richtige antippen
    $ziel_reihenfolge = array_map(fn($v) => [
        'text'    => klammerzusatz_entfernen($v['schwedisch']),
        'sprache' => 'sv-SE',
    ], $alle_viergruppe);

    // Reihenfolge des Vorlesens mischen
    shuffle($ziel_reihenfolge);

    return [
        'index'            => $index,
        'typ'              => 'hoer_mc',
        'untertyp'         => 'hoer_mc',
        'vokabel_id'       => (int) $vok['id'],
        'woerter'          => $woerter,           // angezeigte Wörter (alle 4)
        'ziel_reihenfolge' => $ziel_reihenfolge,  // Reihenfolge des Vorlesens
    ];
}

/**
 * Hör-Satz Aufgabe: Satz vorlesen, Wörter in richtiger Reihenfolge antippen.
 * Gleiche Logik wie satz_bauen, aber kein Kontext-Text sichtbar.
 */
function _hoer_satz_aufgabe(array $vok, array $satz, int $index, array $formen_map = []): ?array
{
    $form_wert = _form_wert_aufloesen($vok, $satz['benoetigte_form'], $formen_map);
    $vollsatz = str_replace('___', $form_wert, $satz['schwedisch_satz']);

    // Satzzeichen entfernen (gleiche Logik wie satz_bauen)
    $woerter = explode(' ', trim($vollsatz));
    $woerter = array_map(fn($w) => trim($w, '.,!?;:–—«»"""\''), $woerter);
    $woerter = array_values(array_filter($woerter, fn($w) => $w !== ''));

    if (count($woerter) < 3) {
        return null;
    }

    $loesung  = $woerter;

    $gemischt = $woerter;
    $versuche = 0;
    do {
        shuffle($gemischt);
        $versuche++;
    } while ($gemischt === $loesung && $versuche < 10);

    if ($gemischt === $loesung) {
        return null;
    }

    return [
        'index'           => $index,
        'typ'             => 'hoer_satz',
        'untertyp'        => 'hoer_satz',
        'vokabel_id'      => (int) $vok['id'],
        'woerter'         => $gemischt,
        'loesung'         => $loesung,
        'tts_text'        => $vollsatz,
        'tts_sprache'     => 'sv-SE',
        'deutsch_kontext' => $satz['deutsch_satz'],
    ];
}

/**
 * Sprechen-Vokabel Aufgabe: Wort anzeigen, Nutzer spricht es nach.
 * Wörter mit weniger als 3 Zeichen werden übersprungen — STT erkennt sie nicht zuverlässig.
 */
function _sprechen_vokabel_aufgabe(array $vok, int $index): ?array
{
    if (mb_strlen(trim(klammerzusatz_entfernen($vok['schwedisch'])), 'UTF-8') < 3) {
        return null;
    }

    return [
        'index'          => $index,
        'typ'            => 'sprechen_vokabel',
        'vokabel_id'     => (int) $vok['id'],
        'ziel_text'      => klammerzusatz_entfernen($vok['schwedisch']),
        'tts_text'       => klammerzusatz_entfernen($vok['schwedisch']),
        'tts_sprache'    => 'sv-SE',
        'deutsch_kontext' => $vok['deutsch'],
    ];
}

/**
 * Sprechen-Satz Aufgabe: Satz anzeigen + vorlesen, Nutzer spricht ihn nach.
 */
function _sprechen_satz_aufgabe(array $vok, array $satz, int $index, array $formen_map = []): ?array
{
    $form_wert = _form_wert_aufloesen($vok, $satz['benoetigte_form'], $formen_map);
    $vollsatz  = str_replace('___', $form_wert, $satz['schwedisch_satz']);

    return [
        'index'          => $index,
        'typ'            => 'sprechen_satz',
        'vokabel_id'     => (int) $vok['id'],
        'ziel_text'      => $vollsatz,
        'tts_text'       => $vollsatz,
        'tts_sprache'    => 'sv-SE',
        'deutsch_kontext' => $satz['deutsch_satz'],
    ];
}

/**
 * Generiert 4 Optionen (1 korrekte Präposition + 3 zufällige Distraktoren).
 */
function _praep_optionen_generieren(string $loesung, array $alle): array
{
    $distraktoren = array_values(array_filter($alle, fn($p) => $p !== $loesung));
    shuffle($distraktoren);
    $distraktoren = array_slice($distraktoren, 0, 3);
    $optionen = array_merge([$loesung], $distraktoren);
    shuffle($optionen);
    return $optionen;
}

/**
 * Präpositions-Lückensatz: Satz mit ___ anzeigen, Präposition wählen.
 */
function _praep_chunk_aufgabe(array $chunk, array $praep_alle, int $index): ?array
{
    $optionen = _praep_optionen_generieren($chunk['loesung'], $praep_alle);
    return [
        'index'        => $index,
        'typ'          => 'praep_chunk',
        'id'           => (int) $chunk['id'],
        'satz'         => $chunk['schwedisch'],
        'loesung'      => $chunk['loesung'],
        'optionen'     => $optionen,
        'uebersetzung' => $chunk['deutsche_uebersetzung'] ?? '',
    ];
}

/**
 * Präpositions-Kategorisierung: Schwedisches Wort anzeigen, passende Präposition wählen.
 */
function _praep_kat_aufgabe(array $eintrag, array $praep_alle, int $index): ?array
{
    $optionen = _praep_optionen_generieren($eintrag['loesung'], $praep_alle);
    return [
        'index'                 => $index,
        'typ'                   => 'praep_kategorisierung',
        'id'                    => (int) $eintrag['id'],
        'schwedisch'            => $eintrag['schwedisch'],
        'deutsch'               => $eintrag['deutsch'] ?? '',
        'beispielsatz'          => $eintrag['beispielsatz'] ?? '',
        'loesung'               => $eintrag['loesung'],
        'optionen'              => $optionen,
        'merksatz'              => $eintrag['merksatz'] ?? '',
        'merksatz_uebersetzung' => $eintrag['merksatz_uebersetzung'] ?? '',
    ];
}
