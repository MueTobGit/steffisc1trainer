<?php
/**
 * API: Training — Starten
 *
 * POST /api/training/starten.php
 * Body: { modus, richtung, lektion_ids, favoriten, anzahl, level }
 *
 * Erstellt eine neue Trainings-Sitzung und generiert Fragen.
 * Fragen werden im Speicher erzeugt und als JSON zurueckgegeben.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';
require_once dirname(__DIR__, 2) . '/konfiguration/lern_algorithmus.php';
require_once dirname(__DIR__, 2) . '/konfiguration/hilfsfunktionen.php';
require_once dirname(__DIR__, 2) . '/konfiguration/grammatik_helfer.php';

// --- Methode pruefen ---
methode_erzwingen('POST');

// --- Authentifizierung ---
$benutzer = benutzer_authentifizieren();

// --- Eingabe validieren ---
$body = json_body_lesen();

$modus = $body['modus'] ?? 'gemischt';
enum_validieren($modus, ['vokabel', 'satz', 'flexion', 'gemischt', 'grammatik'], 'modus');

$richtung = $body['richtung'] ?? 'DS';
enum_validieren($richtung, ['DS', 'SD', 'beides'], 'richtung');

$lektion_ids = $body['lektion_ids'] ?? [];
if (!is_array($lektion_ids)) {
    fehler_ungueltige_eingabe('lektion_ids muss ein Array sein.');
}
$lektion_ids = array_map('intval', $lektion_ids);
$lektion_ids = array_values(array_filter($lektion_ids, fn($id) => $id > 0));

$favoriten = !empty($body['favoriten']);
$nur_faellige = !empty($body['nur_faellige']);

$anzahl = (int) ($body['anzahl'] ?? 20);
if ($anzahl < 5 || $anzahl > 100) {
    fehler_ungueltige_eingabe('Anzahl muss zwischen 5 und 100 liegen.');
}

$level_override = isset($body['level']) ? (int) $body['level'] : null;
if ($level_override !== null && ($level_override < 1 || $level_override > 5)) {
    fehler_ungueltige_eingabe('Level muss zwischen 1 und 5 liegen.');
}

// Mindestens eine Quelle
if (empty($lektion_ids) && !$favoriten && !$nur_faellige) {
    fehler_ungueltige_eingabe('Mindestens eine Lektion oder Favoriten muss ausgewaehlt sein.');
}

$pdo = db_verbindung();

$aufgaben_lektion_ids = []; // Lektionen, die dem User als Aufgabe zugewiesen sind

// --- Lernpfad-Validierung: gesperrte Lektionen herausfiltern ---
// Gilt fuer alle Nicht-Admins. Private Lektionen und Aufgaben-Lektionen sind immer erlaubt.
if (!empty($lektion_ids) && ($benutzer['rolle'] ?? '') !== 'admin') {
    $benutzer_id_val = (int) $benutzer['id'];

    // Schwelle laden
    $stmtSchwelle = $pdo->prepare("SELECT wert FROM app_konfiguration WHERE schluessel = 'lernpfad_schwelle'");
    $stmtSchwelle->execute();
    $schwelleWert  = $stmtSchwelle->fetchColumn();
    $schwelle      = ($schwelleWert !== false && $schwelleWert !== '')
        ? max(1, min(100, (int) $schwelleWert)) / 100.0
        : 0.5;

    // Alle oeffentlichen Lektionen mit Kategorie laden (nach Kategorie+Titel sortiert = Pfad-Reihenfolge)
    $stmtLek = $pdo->query("
        SELECT l.id, l.kategorie_id, l.ist_privat, l.besitzer_id
        FROM lektionen l
        WHERE l.aktiv = 1 AND l.ist_privat = 0 AND l.kategorie_id IS NOT NULL
        ORDER BY l.kategorie_id ASC, l.titel ASC
    ");
    $alle_lektionen = $stmtLek->fetchAll();

    // Fortschritt (DS, Stufe >= 3) fuer alle Vokabeln des Users laden
    $stmtFP = $pdo->prepare("SELECT vokabel_id, stufe FROM fortschritt WHERE benutzer_id = ? AND richtung = 'DS'");
    $stmtFP->execute([$benutzer_id_val]);
    $fp_map = [];
    foreach ($stmtFP->fetchAll() as $r) { $fp_map[(int)$r['vokabel_id']] = (int)$r['stufe']; }

    // Vokabeln je Lektion laden (nur oeffentliche)
    $stmtVok = $pdo->query("
        SELECT lv.lektion_id, lv.vokabel_id FROM lektion_vokabeln lv
        JOIN lektionen l ON l.id = lv.lektion_id
        JOIN vokabeln v ON v.id = lv.vokabel_id
        WHERE l.ist_privat = 0 AND l.aktiv = 1 AND v.aktiv = 1
    ");
    $vok_je_lek = [];
    foreach ($stmtVok->fetchAll() as $r) { $vok_je_lek[(int)$r['lektion_id']][] = (int)$r['vokabel_id']; }

    // Freischaltstatus sequenziell berechnen
    $erlaubt    = [];
    $letzter    = []; // kategorie_id => ['freigeschaltet' => bool, 'stufe3_anteil' => float]
    $erste_kat  = [];
    foreach ($alle_lektionen as $l) {
        if (!isset($erste_kat[(int)$l['kategorie_id']])) { $erste_kat[(int)$l['kategorie_id']] = (int)$l['id']; }
    }
    foreach ($alle_lektionen as $l) {
        $lid = (int)$l['id']; $kid = (int)$l['kategorie_id'];
        $vids = $vok_je_lek[$lid] ?? [];
        $s3 = count($vids) > 0
            ? count(array_filter($vids, fn($v) => ($fp_map[$v] ?? 0) >= 3)) / count($vids)
            : 0.0;
        $ist_erste   = ($erste_kat[$kid] ?? null) === $lid;
        $letzt       = $letzter[$kid] ?? null;
        $freigesch   = $ist_erste || ($letzt && $letzt['freigeschaltet'] && $letzt['stufe3_anteil'] >= $schwelle);
        if ($freigesch) { $erlaubt[] = $lid; }
        $letzter[$kid] = ['freigeschaltet' => $freigesch, 'stufe3_anteil' => $s3];
    }

    // Oeffentliche Lektionen ohne Kategorie sind ausserhalb des Lernpfads — immer erlaubt.
    if (!empty($lektion_ids)) {
        $ph_unkat = implode(',', array_fill(0, count($lektion_ids), '?'));
        $stmtUnkat = $pdo->prepare("
            SELECT id FROM lektionen
            WHERE id IN ({$ph_unkat}) AND aktiv = 1 AND ist_privat = 0 AND kategorie_id IS NULL
        ");
        $stmtUnkat->execute($lektion_ids);
        foreach ($stmtUnkat->fetchAll() as $r) { $erlaubt[] = (int)$r['id']; }
    }

    // Private Lektionen des Users sind immer erlaubt
    if (!empty($lektion_ids)) {
        $ph_priv = implode(',', array_fill(0, count($lektion_ids), '?'));
        $stmtPriv = $pdo->prepare("
            SELECT id FROM lektionen WHERE id IN ({$ph_priv}) AND ist_privat = 1
              AND (besitzer_id = ? OR gruppen_id IN (
                SELECT gruppen_id FROM gruppen_mitglieder WHERE benutzer_id = ?
              ))
        ");
        $stmtPriv->execute(array_merge($lektion_ids, [$benutzer_id_val, $benutzer_id_val]));
        foreach ($stmtPriv->fetchAll() as $r) { $erlaubt[] = (int)$r['id']; }
    }

    // Aufgaben-Lektionen (Hausaufgaben) sind immer erlaubt, auch wenn im Lernpfad gesperrt.
    if (!empty($lektion_ids)) {
        try {
            $ph_aufg = implode(',', array_fill(0, count($lektion_ids), '?'));
            $stmtAufg = $pdo->prepare("
                SELECT lektion_id FROM benutzer_aufgaben
                WHERE benutzer_id = ? AND lektion_id IN ({$ph_aufg})
            ");
            $stmtAufg->execute(array_merge([$benutzer_id_val], $lektion_ids));
            foreach ($stmtAufg->fetchAll() as $r) {
                $erlaubt[] = (int)$r['lektion_id'];
                $aufgaben_lektion_ids[] = (int)$r['lektion_id'];
            }
        } catch (\Throwable $e) {
            // Tabelle existiert noch nicht (Migration ausstaendig) — ignorieren
        }
    }

    $lektion_ids = array_values(array_filter($lektion_ids, fn($id) => in_array($id, $erlaubt, true)));

    if (empty($lektion_ids) && !$favoriten && !$nur_faellige) {
        fehler_ungueltige_eingabe('Keine freigeschalteten Lektionen ausgewaehlt.');
    }
}

// --- Benutzer-Statistik laden ---
$stmt = $pdo->prepare("SELECT * FROM benutzer_statistik WHERE benutzer_id = ?");
$stmt->execute([$benutzer['id']]);
$statistik = $stmt->fetch();

if (!$statistik) {
    // Erstmalig: Statistik-Eintrag anlegen
    $stmt = $pdo->prepare("INSERT INTO benutzer_statistik (benutzer_id) VALUES (?)");
    $stmt->execute([$benutzer['id']]);
    $statistik = [
        'benutzer_id' => $benutzer['id'],
        'xp' => 0,
        'streak_tage' => 0,
        'globales_level' => 1,
        'letztes_training' => null,
        'gesamt_trainings' => 0,
    ];
}

$globales_level = $level_override ?? (int) $statistik['globales_level'];

// --- Level-Konfiguration laden (DB-Werte, Fallback auf Konstanten) ---
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

// --- Nur-fällige-Modus: alle globalen fälligen Vokabeln des Nutzers laden ---
if ($nur_faellige) {
    $stmt = $pdo->prepare("
        SELECT DISTINCT f.vokabel_id
        FROM fortschritt f
        JOIN vokabeln v ON v.id = f.vokabel_id AND v.aktiv = 1
        WHERE f.benutzer_id = ?
          AND f.naechste_wiederholung <= CURDATE()
        ORDER BY f.naechste_wiederholung ASC
    ");
    $stmt->execute([$benutzer['id']]);
    $vokabel_ids = array_column($stmt->fetchAll(), 'vokabel_id');
    $vokabel_ids = array_map('intval', $vokabel_ids);
}

// --- Fällige Vokabeln aus anderen Lektionen einmischen ---
$faellige_einmischen = (bool) ($body['faellige_einmischen'] ?? true);
if ($faellige_einmischen && !empty($vokabel_ids) && !$nur_faellige) {
    $anteil_faellig = max(0, min(50, (int) konfig_wert('faellige_vokabeln_anteil', '20')));
    $max_faellige = max(1, (int) round($anzahl * $anteil_faellig / 100));

    // Fällige Vokabeln des Users, die NICHT in der aktuellen Auswahl sind
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

if (empty($vokabel_ids)) {
    fehler_ungueltige_eingabe('Keine aktiven Vokabeln in der Auswahl gefunden.');
}

// --- Vokabel-Daten laden ---
$placeholders = implode(',', array_fill(0, count($vokabel_ids), '?'));
// verbklasse ist ein neues Feld (migration_grammatik). Defensiv: Fallback auf NULL
// wenn die Spalte auf dem Server noch fehlt (Migration noch nicht gelaufen).
try {
    $stmt = $pdo->prepare("
        SELECT v.id, v.schwedisch, v.deutsch, v.wortart, v.genus, v.verbgruppe, v.verbklasse, v.sprachniveau
        FROM vokabeln v
        WHERE v.id IN ({$placeholders}) AND v.aktiv = 1
    ");
    $stmt->execute($vokabel_ids);
} catch (\PDOException $e) {
    // verbklasse-Spalte fehlt noch (Migration ausständig) → ohne sie laden
    $stmt = $pdo->prepare("
        SELECT v.id, v.schwedisch, v.deutsch, v.wortart, v.genus, v.verbgruppe, NULL AS verbklasse, v.sprachniveau
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

// --- Fortschritt laden ---
$stmt = $pdo->prepare("
    SELECT vokabel_id, richtung, stufe, zustand, naechste_wiederholung, richtig_gesamt, falsch_gesamt
    FROM fortschritt
    WHERE benutzer_id = ? AND vokabel_id IN ({$placeholders})
");
$params = array_merge([$benutzer['id']], $vokabel_ids);
$stmt->execute($params);
$fortschritt_liste = $stmt->fetchAll();

// Fortschritt indexieren: [vokabel_id][richtung]
$fortschritt_map = [];
foreach ($fortschritt_liste as $f) {
    $vid = (int) $f['vokabel_id'];
    $r = $f['richtung'];
    $fortschritt_map[$vid][$r] = $f;
}

// --- Synonyme batch-laden ---
$stmt = $pdo->prepare("
    SELECT vokabel_id, synonym, sprache
    FROM synonyme
    WHERE vokabel_id IN ({$placeholders})
");
$stmt->execute($vokabel_ids);
$alle_synonyme = $stmt->fetchAll();

$synonyme_map = [];
foreach ($alle_synonyme as $s) {
    $vid = (int) $s['vokabel_id'];
    if (!isset($synonyme_map[$vid])) {
        $synonyme_map[$vid] = ['sv' => [], 'de' => []];
    }
    $synonyme_map[$vid][$s['sprache']][] = $s['synonym'];
}

// --- Saetze batch-laden (nur wenn Satz-Modus relevant) ---
$saetze_map = []; // [vokabel_id] => [satz, ...]
if ($modus === 'satz' || $modus === 'gemischt') {
    // Level-Filter fuer Saetze
    $erlaubte_niveaus = LEVEL_SPRACHNIVEAU[$globales_level] ?? ['A1'];

    // C2 dynamisch freischalten ab C2_SCHWELLE Vokabeln auf Stufe 3+
    if ($globales_level >= 5 && !in_array('C2', $erlaubte_niveaus)) {
        $stmt_c2 = $pdo->prepare("
            SELECT COUNT(DISTINCT vokabel_id) FROM fortschritt
            WHERE benutzer_id = ? AND richtung = 'DS' AND stufe >= 3
        ");
        $stmt_c2->execute([$benutzer['id']]);
        if ((int) $stmt_c2->fetchColumn() >= C2_SCHWELLE) {
            $erlaubte_niveaus[] = 'C2';
        }
    }

    $niveau_placeholders = implode(',', array_fill(0, count($erlaubte_niveaus), '?'));

    // Kumulative erlaubte Formen fuer dieses Level (Vorfilter; Feinfilter per Wortart folgt spaeter)
    $erlaubte_formen_batch = [];
    for ($l = 1; $l <= min($globales_level, 5); $l++) {
        $lk_formen = $level_konfiguration !== null ? ($level_konfiguration[$l]['formen'] ?? []) : (LEVEL_FORMEN[$l] ?? []);
        $erlaubte_formen_batch = array_merge($erlaubte_formen_batch, $lk_formen);
    }
    $erlaubte_formen_batch = array_values(array_unique($erlaubte_formen_batch));

    $satz_params = array_merge($vokabel_ids, $erlaubte_niveaus);

    if ($globales_level >= 5 || empty($erlaubte_formen_batch)) {
        // Level 5+: alle Formen erlaubt
        $stmt = $pdo->prepare("
            SELECT id, vokabel_id, schwedisch_satz, deutsch_satz, benoetigte_form, sprachniveau
            FROM saetze
            WHERE vokabel_id IN ({$placeholders})
              AND sprachniveau IN ({$niveau_placeholders})
              AND aktiv = 1
        ");
    } else {
        // Level 1-4: Saetze mit hoeheren Formen vorab ausfiltern (Saetze ohne benoetigte_form immer erlaubt)
        $form_placeholders = implode(',', array_fill(0, count($erlaubte_formen_batch), '?'));
        $stmt = $pdo->prepare("
            SELECT id, vokabel_id, schwedisch_satz, deutsch_satz, benoetigte_form, sprachniveau
            FROM saetze
            WHERE vokabel_id IN ({$placeholders})
              AND sprachniveau IN ({$niveau_placeholders})
              AND (benoetigte_form = '' OR benoetigte_form IS NULL
                   OR benoetigte_form IN ({$form_placeholders}))
              AND aktiv = 1
        ");
        $satz_params = array_merge($satz_params, $erlaubte_formen_batch);
    }
    $stmt->execute($satz_params);
    $alle_saetze = $stmt->fetchAll();

    foreach ($alle_saetze as $satz) {
        $vid = (int) $satz['vokabel_id'];
        if (!isset($saetze_map[$vid])) {
            $saetze_map[$vid] = [];
        }
        $saetze_map[$vid][] = $satz;
    }
}

// --- Formen batch-laden (fuer Flexion, Satz und starkes_verb) ---
$formen_map = []; // [vokabel_id] => [form, ...]
if ($modus === 'flexion' || $modus === 'gemischt' || $modus === 'satz' || $modus === 'grammatik') {
    $stmt = $pdo->prepare("
        SELECT vokabel_id, form_bezeichnung, form_wert
        FROM vokabel_formen
        WHERE vokabel_id IN ({$placeholders})
    ");
    $stmt->execute($vokabel_ids);
    $alle_formen = $stmt->fetchAll();

    foreach ($alle_formen as $form) {
        $vid = (int) $form['vokabel_id'];
        if (!isset($formen_map[$vid])) {
            $formen_map[$vid] = [];
        }
        $formen_map[$vid][] = $form;
    }
}

// --- Grammatik-Regeln als Nachschlage-Map laden ---
// [wortart][genus_gruppe][form_bezeichnung] => regel_id
$grammatik_map = [];
$g_stmt = $pdo->query('
    SELECT gr.id, gr.wortart, gr.genus_gruppe, grf.form_bezeichnung
    FROM grammatik_regeln gr
    JOIN grammatik_regel_formen grf ON grf.regel_id = gr.id
');
foreach ($g_stmt->fetchAll(PDO::FETCH_ASSOC) as $gr) {
    $grammatik_map[$gr['wortart']][$gr['genus_gruppe']][$gr['form_bezeichnung']] = (int) $gr['id'];
}

// Allgemein-Verb-Regel für gruppen_quiz Hilfe-Button (genus_gruppe='Kein Eintrag' = allgemein)
$allgemein_verb_regel_id = null;
try {
    $av_stmt = $pdo->query("
        SELECT id FROM grammatik_regeln
        WHERE wortart='Verb' AND genus_gruppe='Kein Eintrag'
        ORDER BY reihenfolge ASC LIMIT 1
    ");
    $av_row = $av_stmt->fetch(PDO::FETCH_ASSOC);
    if ($av_row) $allgemein_verb_regel_id = (int) $av_row['id'];
} catch (\Throwable $e) {
    // Tabelle existiert noch nicht — ignorieren
}

// --- Abfrage-Gewichte laden ---
$stmt = $pdo->query("SELECT stufe, gewicht FROM abfrage_gewichte ORDER BY stufe");
$gewichte = [];
while ($zeile = $stmt->fetch()) {
    $gewichte[(int) $zeile['stufe']] = (float) $zeile['gewicht'];
}

// ============================================================
// Grammatik-Modus: Separate Logik ohne SM-2
// ============================================================
if ($modus === 'grammatik') {
    // Formen-Map für starkes_verb: "vokabel_id|form" => form_wert
    $formen_map_flat = [];
    foreach ($formen_map as $vid => $formen_liste) {
        foreach ($formen_liste as $form) {
            $formen_map_flat["{$vid}|{$form['form_bezeichnung']}"] = $form['form_wert'];
        }
    }

    $grammatik_vok  = grammatik_vokabeln_laden($pdo, $benutzer['id'], $vokabel_ids);
    $verben_alle    = $grammatik_vok['verben_alle'];
    $partikelverben = $grammatik_vok['partikelverben'];
    $starke_verben  = $grammatik_vok['starke_verben'];
    $alle_partikel  = partikel_aus_pool_sammeln($partikelverben);

    shuffle($verben_alle);
    shuffle($partikelverben);
    shuffle($starke_verben);

    // Kandidaten-Pool aufbauen (nur die 3 Training-Grammatik-Typen)
    $grammatik_kandidaten = [];
    foreach ($verben_alle as $vok) {
        $grammatik_kandidaten[] = ['typ' => 'gruppen_quiz', 'vok' => $vok];
    }
    foreach ($partikelverben as $vok) {
        $grammatik_kandidaten[] = ['typ' => 'partikel_puzzle', 'vok' => $vok];
    }
    foreach ($starke_verben as $vok) {
        $grammatik_kandidaten[] = ['typ' => 'starkes_verb', 'vok' => $vok];
    }
    shuffle($grammatik_kandidaten);

    if (empty($grammatik_kandidaten)) {
        fehler_ungueltige_eingabe('Keine Grammatikfragen verfügbar. Bitte mehr Vokabeln lernen (Stufe ≥ 3).');
    }

    // Kandidaten wiederholen wenn Pool kleiner als Zielanzahl
    if (count($grammatik_kandidaten) < $anzahl) {
        $basis_pool = $grammatik_kandidaten;
        while (count($grammatik_kandidaten) < $anzahl) {
            shuffle($basis_pool);
            $grammatik_kandidaten = array_merge($grammatik_kandidaten, $basis_pool);
        }
        shuffle($grammatik_kandidaten);
    }

    // Trainings-Sitzung erstellen
    $stmt = $pdo->prepare("INSERT INTO trainings_sitzungen (benutzer_id, typ) VALUES (?, 'grammatik')");
    $stmt->execute([$benutzer['id']]);
    $sitzung_id = (int) $pdo->lastInsertId();

    // Gestartete Lektionen tracken
    if (!empty($lektion_ids)) {
        $placeholders_g = implode(',', array_fill(0, count($lektion_ids), '(?,?)'));
        $params_g = [];
        foreach ($lektion_ids as $lid) {
            $params_g[] = $benutzer['id'];
            $params_g[] = $lid;
        }
        $pdo->prepare("
            INSERT IGNORE INTO benutzer_lektionen_gestartet (benutzer_id, lektion_id)
            VALUES {$placeholders_g}
        ")->execute($params_g);
    }

    // Grammatik-Fragen aufbauen
    $fragen = [];
    foreach ($grammatik_kandidaten as $kandidat) {
        if (count($fragen) >= $anzahl) break;
        $a = null;
        switch ($kandidat['typ']) {
            case 'gruppen_quiz':
                $a = gruppen_quiz_erstellen($kandidat['vok'], count($fragen));
                // Allgemein-Verb-Regel als Hilfe-Link einbinden
                if ($a !== null && $allgemein_verb_regel_id !== null) {
                    $a['grammatik_regel_id'] = $allgemein_verb_regel_id;
                }
                break;
            case 'partikel_puzzle':
                $a = partikel_puzzle_erstellen($kandidat['vok'], $alle_partikel, count($fragen));
                break;
            case 'starkes_verb':
                $a = starkes_verb_erstellen($kandidat['vok'], $formen_map_flat, count($fragen), $globales_level, $level_konfiguration);
                break;
        }
        if ($a !== null) {
            $fragen[] = $a;
        }
    }

    if (empty($fragen)) {
        fehler_ungueltige_eingabe('Keine Grammatikfragen konnten generiert werden.');
    }

    json_erfolg([
        'sitzung_id' => $sitzung_id,
        'fragen'     => $fragen,
        'gesamt'     => count($fragen),
    ]);
}

// --- Fragen-Selektion (3 Pools) ---
$heute = date('Y-m-d');
$basis_neue = (int) konfig_wert('neue_vokabeln_pro_tag', '10');
$faktor = 100;

// Per-User Faktor laden (50=Entspannt, 100=Normal, 200=Intensiv, 300=Intensiv+)
try {
    $stmt_fak = $pdo->prepare("SELECT neue_vokabeln_faktor FROM benutzer WHERE id = ?");
    $stmt_fak->execute([$benutzer['id']]);
    $val = $stmt_fak->fetchColumn();
    if ($val !== false) $faktor = (int) $val;
} catch (\Throwable $e) {
    // Spalte existiert noch nicht — Fallback auf alte Bonus-Spalte
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

// Heute schon gelernte neue Vokabeln zaehlen
// Zaehle anhand erstellt_am (= wann der Fortschritts-Eintrag erstmalig angelegt wurde),
// damit spätere Antworten (Stufe/Wiederholungen ändern sich) den Zähler nicht verfälschen.
try {
    $stmt = $pdo->prepare("
        SELECT COUNT(DISTINCT vokabel_id) as anzahl
        FROM fortschritt
        WHERE benutzer_id = ? AND DATE(erstellt_am) = CURDATE()
    ");
    $stmt->execute([$benutzer['id']]);
    $heute_neue = (int) $stmt->fetchColumn();
} catch (\Throwable $e) {
    // Fallback falls erstellt_am-Spalte noch nicht existiert (Migration ausstehend)
    $stmt = $pdo->prepare("
        SELECT COUNT(DISTINCT vokabel_id) as anzahl
        FROM fortschritt
        WHERE benutzer_id = ? AND DATE(aktualisiert_am) = CURDATE() AND wiederholungen <= 1
    ");
    $stmt->execute([$benutzer['id']]);
    $heute_neue = (int) $stmt->fetchColumn();
}
// Im nur-fällige-Modus keine neuen Vokabeln einführen
$verbleibende_neue = $nur_faellige ? 0 : max(0, $max_neue - $heute_neue);

// Richtungen bestimmen
$richtungen = [];
if ($richtung === 'beides') {
    $richtungen = ['DS', 'SD'];
} else {
    $richtungen = [$richtung];
}

// Pools aufbauen
$pool_faellig = [];   // Pool A: Faellige Wiederholungen
$pool_neu = [];        // Pool B: Neue Vokabeln
$pool_aelteste = [];   // Pool C: Aelteste gelernte (Auffuellung)

foreach ($vokabel_ids as $vid) {
    foreach ($richtungen as $r) {
        $f = $fortschritt_map[$vid][$r] ?? null;

        if ($f === null) {
            // Kein Fortschritt = neue Vokabel
            $pool_neu[] = ['vokabel_id' => $vid, 'richtung' => $r, 'stufe' => 0, 'gewicht' => 0];
        } elseif ($f['naechste_wiederholung'] !== null && $f['naechste_wiederholung'] <= $heute) {
            // Faellig
            $stufe = (int) $f['stufe'];
            $basis_gewicht = $gewichte[$stufe] ?? 5;

            // Problemvokabel-Bonus: Vokabeln mit >50% Fehlerquote (mind. 5 Antworten)
            // werden bevorzugt in die Session aufgenommen.
            $richtig = (int) $f['richtig_gesamt'];
            $falsch  = (int) $f['falsch_gesamt'];
            $gesamt  = $richtig + $falsch;
            $ist_problemvokabel = ($gesamt >= 5 && $falsch > $richtig);
            $gewicht = $ist_problemvokabel
                ? (float) ($basis_gewicht * PROBLEMVOKABEL_GEWICHT_BONUS)
                : (float) $basis_gewicht;

            $pool_faellig[] = [
                'vokabel_id'       => $vid,
                'richtung'         => $r,
                'stufe'            => $stufe,
                'gewicht'          => $gewicht,
                'ist_problemvokabel' => $ist_problemvokabel,
            ];
        } else {
            // Bereits gelernt, noch nicht faellig — als Reserve
            $stufe = (int) $f['stufe'];
            $pool_aelteste[] = [
                'vokabel_id' => $vid,
                'richtung'   => $r,
                'stufe'      => $stufe,
                'gewicht'    => $gewichte[$stufe] ?? 5,
            ];
        }
    }
}

// Gewichtete Zufallsauswahl
function gewichtete_auswahl(array &$pool, int $anzahl): array
{
    $ausgewaehlt = [];
    $gewaehlt_keys = [];

    for ($i = 0; $i < $anzahl && !empty($pool); $i++) {
        $gesamt_gewicht = 0;
        foreach ($pool as $key => $item) {
            if (in_array($key, $gewaehlt_keys)) continue;
            $gesamt_gewicht += max(1, $item['gewicht']); // Min. 1 damit alles eine Chance hat
        }

        if ($gesamt_gewicht <= 0) break;

        $zufall = mt_rand(1, (int) $gesamt_gewicht);
        $kumulativ = 0;

        foreach ($pool as $key => $item) {
            if (in_array($key, $gewaehlt_keys)) continue;
            $kumulativ += max(1, $item['gewicht']);
            if ($zufall <= $kumulativ) {
                $ausgewaehlt[] = $item;
                $gewaehlt_keys[] = $key;
                break;
            }
        }
    }

    return $ausgewaehlt;
}

// ---------------------------------------------------------------
// Neue-Mindest-Slots berechnen (VOR Pool-A-Befüllung)
//
// Forschungsbasis (SRS/Kognitionswissenschaft):
//   - Working Memory fasst ~7±2 Items; optimale Einführungsrate: 3-5 neue pro Session
//   - Review-zu-Neu-Verhältnis: 80-90% Reviews, 10-20% neue (Anki/FSRS-Community-Konsens)
//   - 15% neue bei 20 Fragen = 3 → liegt im optimalen Fenster
//   - Cap bei 5: mehr als 5 neue/Session ist kognitiv kontraproduktiv (Interferenz)
//   - Formel: max(2, min(5, round(anzahl × 0.15)))
//
// Ohne garantierten Slot würde Pool A die Session bei vielen Fälligen komplett füllen
// und neue Vokabeln kämen nie dran — auch wenn Tageslimit noch frei wäre.
// ---------------------------------------------------------------
$neue_mindest_slots   = 0;
$neue_zusatz_erlaubt  = false;

if ($verbleibende_neue > 0 && !empty($pool_neu)) {
    if (!empty($aufgaben_lektion_ids)) {
        // Aufgaben-Lektionen: immer neue einführen, globale Fälligkeitsschwelle ignorieren
        $neue_zusatz_erlaubt = true;
    } else {
        // Normal: nur wenn globale Rückstandsmenge unter Schwelle
        $stmt_gelernt = $pdo->prepare("
            SELECT COUNT(DISTINCT vokabel_id) FROM fortschritt WHERE benutzer_id = ?
        ");
        $stmt_gelernt->execute([$benutzer['id']]);
        $gelernte_vokabeln = (int) $stmt_gelernt->fetchColumn();
        $schwelle_neue = max(20, (int) floor($gelernte_vokabeln * 0.20));

        $stmt_faellig_global = $pdo->prepare("
            SELECT COUNT(DISTINCT vokabel_id) FROM fortschritt
            WHERE benutzer_id = ?
              AND naechste_wiederholung <= CURDATE()
        ");
        $stmt_faellig_global->execute([$benutzer['id']]);
        $globale_faellige = (int) $stmt_faellig_global->fetchColumn();

        if ($globale_faellige < $schwelle_neue) {
            $neue_zusatz_erlaubt = true;
        }
    }

    if ($neue_zusatz_erlaubt) {
        // 15% der Session, min 2, max 5 — durch Tageslimit und verfügbare neue begrenzt
        $neue_mindest_slots = max(2, min(5, (int) round($anzahl * 0.15)));
        $neue_mindest_slots = min($neue_mindest_slots, $verbleibende_neue);
        $neue_mindest_slots = min($neue_mindest_slots, count($pool_neu));
    }
}

// Pool B einmalig mischen (wird für Mindest-Slots und Zusatz-Slots verwendet)
if (!empty($pool_neu)) {
    shuffle($pool_neu);
}

// Fragen zusammenstellen
$ausgewaehlt = [];

// 1) Fällige — aber Mindest-Slots für Neue freihalten
$ausgewaehlt = gewichtete_auswahl($pool_faellig, $anzahl - $neue_mindest_slots);

// 2a) Garantierte neue Vokabeln (reservierter Mindest-Slot)
if ($neue_mindest_slots > 0) {
    $ausgewaehlt = array_merge($ausgewaehlt, array_slice($pool_neu, 0, $neue_mindest_slots));
}

// 2b) Weitere neue — wenn noch Platz und Tageslimit erlaubt
if ($neue_zusatz_erlaubt && count($ausgewaehlt) < $anzahl) {
    $noch_erlaubt = $verbleibende_neue - $neue_mindest_slots;
    $noch_noetig  = min($anzahl - count($ausgewaehlt), $noch_erlaubt);
    if ($noch_noetig > 0 && count($pool_neu) > $neue_mindest_slots) {
        $ausgewaehlt = array_merge(
            $ausgewaehlt,
            array_slice($pool_neu, $neue_mindest_slots, $noch_noetig)
        );
    }
}

// 3) Älteste als Auffüllung
if (count($ausgewaehlt) < $anzahl) {
    $noch_noetig = $anzahl - count($ausgewaehlt);
    $ausgewaehlt = array_merge($ausgewaehlt, gewichtete_auswahl($pool_aelteste, $noch_noetig));
}

// Mischen
shuffle($ausgewaehlt);

if (empty($ausgewaehlt)) {
    fehler_ungueltige_eingabe('Keine Fragen konnten generiert werden. Bitte andere Auswahl treffen.');
}

// --- Trainings-Sitzung erstellen ---
$typ_mapping = [
    'vokabel'   => 'vokabel',
    'satz'      => 'satz',
    'flexion'   => 'flexion',
    'gemischt'  => 'gemischt',
    'grammatik' => 'grammatik',
];
$stmt = $pdo->prepare("
    INSERT INTO trainings_sitzungen (benutzer_id, typ)
    VALUES (?, ?)
");
$stmt->execute([$benutzer['id'], $typ_mapping[$modus]]);
$sitzung_id = (int) $pdo->lastInsertId();

// Gestartete Lektionen tracken (fuer korrekte "neue Vokabeln"-Zaehlung)
if (!empty($lektion_ids)) {
    $placeholders_l = implode(',', array_fill(0, count($lektion_ids), '(?,?)'));
    $params_l = [];
    foreach ($lektion_ids as $lid) {
        $params_l[] = $benutzer['id'];
        $params_l[] = $lid;
    }
    $pdo->prepare("
        INSERT IGNORE INTO benutzer_lektionen_gestartet (benutzer_id, lektion_id)
        VALUES {$placeholders_l}
    ")->execute($params_l);
}

// --- Fragen generieren ---
$fragen = [];
$form_labels = [
    'unbestimmt_singular' => 'Unbestimmter Singular',
    'bestimmt_singular'   => 'Bestimmter Singular',
    'unbestimmt_plural'   => 'Unbestimmter Plural',
    'bestimmt_plural'     => 'Bestimmter Plural',
    'infinitiv'           => 'Infinitiv',
    'praesens'            => 'Präsens',
    'praeteritum'         => 'Präteritum',
    'supinum'             => 'Supinum',
    'imperativ'           => 'Imperativ',
    'perfekt_partizip'    => 'Perfekt Partizip',
    'grundform'           => 'Grundform',
    'komparativ'          => 'Komparativ',
    'superlativ'          => 'Superlativ',
    'bestimmte_form'      => 'Bestimmte Form',
    'neutrum_form'        => 'Neutrum',
];

foreach ($ausgewaehlt as $index => $item) {
    $vid = $item['vokabel_id'];
    $r = $item['richtung'];
    $stufe = $item['stufe'];
    $vok = $vokabel_map[$vid] ?? null;

    if (!$vok) continue;

    // Frage-Typ bestimmen
    $frage_typ = _frage_typ_bestimmen($modus, $vid, $vok, $saetze_map, $formen_map, $globales_level, $stufe, $level_konfiguration);

    // Frage je nach Typ aufbauen
    $frage = _frage_aufbauen($frage_typ, $vok, $r, $vid, $stufe, $index,
        $synonyme_map, $saetze_map, $formen_map, $form_labels, $globales_level, $grammatik_map, $level_konfiguration);

    if ($frage !== null) {
        $fragen[] = $frage;
    }
}

// --- Grammatik-Injektion für Gemischt-Modus (10%) ---
if ($modus === 'gemischt') {
    $anteil_grammatik = max(0, min(50, (int) konfig_wert('gemischt_anteil_grammatik', '10')));
    $grammatik_anzahl = max(0, (int) round(count($fragen) * $anteil_grammatik / 100));

    if ($grammatik_anzahl > 0) {
        $formen_map_flat = [];
        foreach ($formen_map as $vid => $formen_liste) {
            foreach ($formen_liste as $form) {
                $formen_map_flat["{$vid}|{$form['form_bezeichnung']}"] = $form['form_wert'];
            }
        }

        $grammatik_vok   = grammatik_vokabeln_laden($pdo, $benutzer['id'], $vokabel_ids);
        $partikelverben  = $grammatik_vok['partikelverben'];
        $alle_partikel   = partikel_aus_pool_sammeln($partikelverben);

        $grammatik_kandidaten = [];
        foreach ($grammatik_vok['verben_alle'] as $vok) {
            $grammatik_kandidaten[] = ['typ' => 'gruppen_quiz', 'vok' => $vok];
        }
        foreach ($partikelverben as $vok) {
            $grammatik_kandidaten[] = ['typ' => 'partikel_puzzle', 'vok' => $vok];
        }
        foreach ($grammatik_vok['starke_verben'] as $vok) {
            $grammatik_kandidaten[] = ['typ' => 'starkes_verb', 'vok' => $vok];
        }
        shuffle($grammatik_kandidaten);

        $grammatik_fragen = [];
        foreach ($grammatik_kandidaten as $kandidat) {
            if (count($grammatik_fragen) >= $grammatik_anzahl) break;
            $a = null;
            switch ($kandidat['typ']) {
                case 'gruppen_quiz':
                    $a = gruppen_quiz_erstellen($kandidat['vok'], 0);
                    if ($a !== null && $allgemein_verb_regel_id !== null) {
                        $a['grammatik_regel_id'] = $allgemein_verb_regel_id;
                    }
                    break;
                case 'partikel_puzzle':
                    $a = partikel_puzzle_erstellen($kandidat['vok'], $alle_partikel, 0);
                    break;
                case 'starkes_verb':
                    $a = starkes_verb_erstellen($kandidat['vok'], $formen_map_flat, 0, $globales_level, $level_konfiguration);
                    break;
            }
            if ($a !== null) {
                $grammatik_fragen[] = $a;
            }
        }

        // Reguläre Fragen kürzen und Grammatikfragen einmischen
        $fragen = array_slice($fragen, 0, count($fragen) - count($grammatik_fragen));
        $fragen = array_merge($fragen, $grammatik_fragen);
        shuffle($fragen);
    }
}

// Indizes neu durchnummerieren
foreach ($fragen as $i => &$f) {
    $f['index'] = $i;
}
unset($f);

json_erfolg([
    'sitzung_id' => $sitzung_id,
    'fragen' => $fragen,
    'gesamt' => count($fragen),
]);

// ==========================================================
// Interne Helfer-Funktionen
// ==========================================================

/**
 * Frage-Typ bestimmen nach Modus und Verfuegbarkeit
 */
function _frage_typ_bestimmen(
    string $modus,
    int $vid,
    array $vok,
    array $saetze_map,
    array $formen_map,
    int $level,
    int $stufe,
    ?array $lk = null
): string {
    if ($modus === 'vokabel' || $modus === 'grammatik') return 'vokabel';
    if ($modus === 'satz') {
        return !empty($saetze_map[$vid]) ? 'satz' : 'vokabel';
    }
    if ($modus === 'flexion') {
        $verfuegbar = verfuegbare_formen($vok['wortart'], $level, $stufe, $lk);
        $vok_formen = $formen_map[$vid] ?? [];
        $passend = array_filter($vok_formen, fn($f) => in_array($f['form_bezeichnung'], $verfuegbar));
        return !empty($passend) ? 'flexion' : 'vokabel';
    }

    // Gemischt: Anteile konfigurierbar (Standard: 15% Flexion, 25% Satz, 60% Vokabel)
    $anteil_flexion = max(0, min(100, (int) konfig_wert('gemischt_anteil_flexion', '15')));
    $anteil_satz    = max(0, min(100, (int) konfig_wert('gemischt_anteil_satz', '25')));
    $schwelle_satz  = $anteil_flexion + $anteil_satz;
    $zufall = mt_rand(1, 100);

    if ($zufall <= $anteil_flexion) {
        // Flexion versuchen
        $verfuegbar = verfuegbare_formen($vok['wortart'], $level, $stufe, $lk);
        $vok_formen = $formen_map[$vid] ?? [];
        $passend = array_filter($vok_formen, fn($f) => in_array($f['form_bezeichnung'], $verfuegbar));
        if (!empty($passend)) return 'flexion';
    }

    if ($zufall <= $schwelle_satz) {
        // Satz versuchen
        if (!empty($saetze_map[$vid])) return 'satz';
    }

    // Fallback: Vokabel
    return 'vokabel';
}

/**
 * Frage-Objekt aufbauen
 */
function _frage_aufbauen(
    string $typ,
    array $vok,
    string $richtung,
    int $vid,
    int $stufe,
    int $index,
    array $synonyme_map,
    array $saetze_map,
    array $formen_map,
    array $form_labels,
    int $level,
    array $grammatik_map = [],
    ?array $lk = null
): ?array {
    $syn = $synonyme_map[$vid] ?? ['sv' => [], 'de' => []];

    if ($typ === 'vokabel') {
        return _vokabel_frage($vok, $richtung, $vid, $index, $syn, $grammatik_map);
    }

    if ($typ === 'satz') {
        $saetze = $saetze_map[$vid] ?? [];
        if (empty($saetze)) {
            return _vokabel_frage($vok, $richtung, $vid, $index, $syn, $grammatik_map);
        }
        // Nur Saetze mit level-erlaubter Form anzeigen
        $verfuegbar = verfuegbare_formen($vok['wortart'], $level, $stufe, $lk);
        $passend = array_values(array_filter($saetze, fn($s) =>
            empty($s['benoetigte_form']) || in_array($s['benoetigte_form'], $verfuegbar)
        ));
        if (empty($passend)) {
            return _vokabel_frage($vok, $richtung, $vid, $index, $syn, $grammatik_map);
        }
        $satz = $passend[array_rand($passend)];
        return _satz_frage($vok, $satz, $vid, $index, $formen_map, $form_labels, $grammatik_map);
    }

    if ($typ === 'flexion') {
        $vok_formen = $formen_map[$vid] ?? [];
        $verfuegbar = verfuegbare_formen($vok['wortart'], $level, $stufe, $lk);
        $passend = array_filter($vok_formen, fn($f) => in_array($f['form_bezeichnung'], $verfuegbar));

        if (empty($passend)) {
            return _vokabel_frage($vok, $richtung, $vid, $index, $syn, $grammatik_map);
        }

        $form = $passend[array_rand($passend)];
        return _flexion_frage($vok, $form, $vid, $index, $form_labels, $grammatik_map, $formen_map[$vid] ?? []);
    }

    return null;
}

/**
 * Vokabel-Frage erzeugen
 */
function _vokabel_frage(array $vok, string $richtung, int $vid, int $index, array $syn, array $grammatik_map = []): array
{
    if ($richtung === 'DS') {
        // Deutsch → Schwedisch
        $frage_text = $vok['deutsch'];
        $erwartet = klammerzusatz_entfernen($vok['schwedisch']);
        $synonyme = $syn['sv'];
        $tts_text = klammerzusatz_entfernen($vok['schwedisch']);
        $tts_sprache = 'sv-SE';
        $hinweis = '';
        if ($vok['wortart'] === 'Nomen' && $vok['genus']) {
            $hinweis = $vok['genus'] === 'en' ? 'en (utrum)' : 'ett (neutrum)';
        }
    } else {
        // Schwedisch → Deutsch
        $frage_text = $vok['schwedisch'];
        $erwartet = klammerzusatz_entfernen($vok['deutsch']);
        $synonyme = $syn['de'];
        $tts_text = klammerzusatz_entfernen($vok['schwedisch']);
        $tts_sprache = 'sv-SE';
        $hinweis = $vok['wortart'];
    }

    return [
        'index' => $index,
        'typ' => 'vokabel',
        'richtung' => $richtung,
        'vokabel_id' => $vid,
        'frage_text' => $frage_text,
        'erwartet' => $erwartet,
        'synonyme' => $synonyme,
        'hinweis' => $hinweis,
        'tts_text' => $tts_text,
        'tts_sprache' => $tts_sprache,
        'vokabel_wortart'    => $vok['wortart'],
        'vokabel_genus'      => $vok['genus'],
        'vokabel_verbgruppe' => $vok['verbgruppe'],
        'vokabel_niveau'     => $vok['sprachniveau'],
        'grammatik_regel_id' => _grammatik_regel_id_fuer_vokabel($vok, $grammatik_map),
    ];
}

/**
 * Satz-Luecken-Frage erzeugen
 */
function _satz_frage(array $vok, array $satz, int $vid, int $index, array $formen_map, array $form_labels = [], array $grammatik_map = []): array
{
    // benoetigte_form ist ein Form-Bezeichner (z.B. 'unbestimmt_singular').
    // Den echten Form-Wert aus der Formen-Tabelle holen.
    $form_bezeichnung = $satz['benoetigte_form'];
    $erwartet = null;

    $vok_formen = $formen_map[$vid] ?? [];
    foreach ($vok_formen as $form) {
        if ($form['form_bezeichnung'] === $form_bezeichnung) {
            $erwartet = $form['form_wert'];
            break;
        }
    }

    // Fallback: Grundform der Vokabel (schwedisch), falls Form nicht gefunden
    if ($erwartet === null) {
        $erwartet = $vok['schwedisch'];
    }

    // Stichwort: Deutsche Grundform + Formbezeichnung (wenn nicht Grundform)
    if ($form_bezeichnung && $form_bezeichnung !== 'grundform' && !empty($form_labels[$form_bezeichnung])) {
        $stichwort = $vok['deutsch'] . ' → ' . $form_labels[$form_bezeichnung];
    } else {
        $stichwort = $vok['deutsch'];
    }

    // Ganzen Satz fuer TTS (Luecke ersetzen)
    $ganzer_satz = str_replace('___', $erwartet, $satz['schwedisch_satz']);

    $grammatik_id_satz = $form_bezeichnung
        ? _grammatik_regel_id($vok, $form_bezeichnung, $grammatik_map)
        : null;

    return [
        'index' => $index,
        'typ' => 'satz',
        'richtung' => 'DS',
        'vokabel_id' => $vid,
        'frage_text' => $satz['schwedisch_satz'],
        'kontext' => $satz['deutsch_satz'],
        'stichwort' => $stichwort,
        'erwartet' => $erwartet,
        'synonyme' => [],
        'hinweis' => '',
        'tts_text' => $ganzer_satz,
        'tts_sprache' => 'sv-SE',
        'vokabel_wortart'    => $vok['wortart'],
        'vokabel_genus'      => $vok['genus'],
        'vokabel_verbgruppe' => $vok['verbgruppe'],
        'vokabel_niveau'     => $vok['sprachniveau'],
        'grammatik_regel_id' => $grammatik_id_satz,
    ];
}

/**
 * Flexions-Frage erzeugen
 */
function _flexion_frage(array $vok, array $form, int $vid, int $index, array $form_labels, array $grammatik_map = [], array $vok_formen = []): array
{
    $form_label = $form_labels[$form['form_bezeichnung']] ?? $form['form_bezeichnung'];
    $frage_text = $vok['schwedisch'] . ' → ' . $form_label . '?';

    return [
        'index' => $index,
        'typ' => 'flexion',
        'richtung' => 'DS',
        'vokabel_id' => $vid,
        'frage_text' => $frage_text,
        'erwartet' => $form['form_wert'],
        'synonyme' => [],
        'hinweis' => $vok['wortart'],
        'form_bezeichnung' => $form['form_bezeichnung'],
        'tts_text' => $form['form_wert'],
        'tts_sprache' => 'sv-SE',
        'vokabel_wortart'    => $vok['wortart'],
        'vokabel_genus'      => $vok['genus'],
        'vokabel_verbgruppe' => $vok['verbgruppe'],
        'vokabel_niveau'     => $vok['sprachniveau'],
        'grammatik_regel_id' => _grammatik_regel_id($vok, $form['form_bezeichnung'], $grammatik_map),
    ];
}


/**
 * Grammatikregel-ID fuer Vokabel-Fragen (kein spezifischer Form-Kontext).
 * Waehlt die "Einsteiger-Form" je Wortart: unbestimmt_singular / infinitiv / grundform.
 */
function _grammatik_regel_id_fuer_vokabel(array $vok, array $grammatik_map): ?int
{
    if (empty($grammatik_map)) return null;
    $wortart = $vok['wortart'];
    $basis = match($wortart) {
        'Nomen'    => 'unbestimmt_singular',
        'Verb'     => 'infinitiv',
        'Adjektiv' => 'grundform',
        default    => null,
    };
    if ($basis === null) return null;
    return _grammatik_regel_id($vok, $basis, $grammatik_map);
}

/**
 * Sucht die passende Grammatikregel-ID fuer eine Vokabel + form_bezeichnung.
 * Direkter Lookup in der Map [wortart][genus_gruppe][form_bezeichnung].
 */
function _grammatik_regel_id(array $vok, string $form_bezeichnung, array $grammatik_map): ?int
{
    if (empty($grammatik_map)) return null;

    $wortart = $vok['wortart'];

    if ($wortart === 'Nomen') {
        $genus = $vok['genus'] ?? '';
        if (!$genus) return null;
        // Zuerst exakte Form suchen, dann Fallback auf Plural-Regeln
        return $grammatik_map[$wortart][$genus][$form_bezeichnung]
            ?? $grammatik_map[$wortart]['en/ett'][$form_bezeichnung]
            ?? null;
    }

    if ($wortart === 'Verb') {
        if ($form_bezeichnung === 's_form') {
            return $grammatik_map[$wortart]['kein Eintrag'][$form_bezeichnung] ?? null;
        }
        $verbgruppe = $vok['verbgruppe'] ?? '';
        if (!$verbgruppe) return null;
        return $grammatik_map[$wortart]['Gr. ' . $verbgruppe][$form_bezeichnung] ?? null;
    }

    if ($wortart === 'Adjektiv') {
        return $grammatik_map[$wortart]['kein Eintrag'][$form_bezeichnung] ?? null;
    }

    return null;
}
