<?php
/**
 * API: Training — Starten
 *
 * POST /api/training/starten.php
 * Body: { modus, richtung, themenfeld_ids, favoriten, anzahl }
 *
 * Erstellt eine neue Trainings-Sitzung und generiert Fragen.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';
require_once dirname(__DIR__, 2) . '/konfiguration/lern_algorithmus.php';
require_once dirname(__DIR__, 2) . '/konfiguration/hilfsfunktionen.php';

methode_erzwingen('POST');
$benutzer = benutzer_authentifizieren();

$body = json_body_lesen();

$modus = $body['modus'] ?? 'gemischt';
enum_validieren($modus, ['vokabel', 'satz', 'gemischt'], 'modus');

$richtung = $body['richtung'] ?? 'DE';
enum_validieren($richtung, ['DE', 'ED', 'beides'], 'richtung');

$themenfeld_ids = $body['themenfeld_ids'] ?? [];
if (!is_array($themenfeld_ids)) {
    fehler_ungueltige_eingabe('themenfeld_ids muss ein Array sein.');
}
$themenfeld_ids = array_values(array_filter(array_map('intval', $themenfeld_ids), fn($id) => $id > 0));

$favoriten   = !empty($body['favoriten']);
$nur_faellige = !empty($body['nur_faellige']);

$anzahl = (int) ($body['anzahl'] ?? 20);
if ($anzahl < 5 || $anzahl > 100) {
    fehler_ungueltige_eingabe('Anzahl muss zwischen 5 und 100 liegen.');
}

if (empty($themenfeld_ids) && !$favoriten && !$nur_faellige) {
    fehler_ungueltige_eingabe('Mindestens ein Themenfeld oder Favoriten muss ausgewaehlt sein.');
}

$pdo = db_verbindung();

// --- Benutzer-Statistik sicherstellen ---
$stmt = $pdo->prepare("SELECT 1 FROM benutzer_statistik WHERE benutzer_id = ?");
$stmt->execute([$benutzer['id']]);
if (!$stmt->fetch()) {
    $pdo->prepare("INSERT INTO benutzer_statistik (benutzer_id) VALUES (?)")->execute([$benutzer['id']]);
}

// --- Vokabeln sammeln ---
$vokabel_ids = [];

if (!empty($themenfeld_ids)) {
    $placeholders = implode(',', array_fill(0, count($themenfeld_ids), '?'));
    $stmt = $pdo->prepare("
        SELECT DISTINCT tv.vokabel_id
        FROM themenfeld_vokabeln tv
        JOIN vokabeln v ON v.id = tv.vokabel_id AND v.aktiv = 1
        WHERE tv.themenfeld_id IN ({$placeholders})
    ");
    $stmt->execute($themenfeld_ids);
    while ($zeile = $stmt->fetch()) {
        $vokabel_ids[] = (int) $zeile['vokabel_id'];
    }
}

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

$vokabel_ids = array_values(array_unique($vokabel_ids));

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
    $vokabel_ids = array_map('intval', array_column($stmt->fetchAll(), 'vokabel_id'));
}

// Fällige aus anderen Themenfeldern einmischen (max. 20% der Session)
$faellige_einmischen = (bool) ($body['faellige_einmischen'] ?? true);
if ($faellige_einmischen && !empty($vokabel_ids) && !$nur_faellige) {
    $max_faellige = max(1, (int) round($anzahl * 0.20));
    $bestehende_ph = implode(',', array_fill(0, count($vokabel_ids), '?'));
    $stmt = $pdo->prepare("
        SELECT DISTINCT f.vokabel_id
        FROM fortschritt f
        JOIN vokabeln v ON v.id = f.vokabel_id AND v.aktiv = 1
        WHERE f.benutzer_id = ?
          AND f.richtung = 'DE'
          AND f.naechste_wiederholung <= CURDATE()
          AND f.vokabel_id NOT IN ({$bestehende_ph})
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
$stmt = $pdo->prepare("
    SELECT v.id, v.englisch, v.deutsch, v.wortart, v.sprachniveau
    FROM vokabeln v
    WHERE v.id IN ({$placeholders}) AND v.aktiv = 1
");
$stmt->execute($vokabel_ids);
$vokabeln = $stmt->fetchAll();

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
$stmt->execute(array_merge([$benutzer['id']], $vokabel_ids));
$fortschritt_map = [];
foreach ($stmt->fetchAll() as $f) {
    $fortschritt_map[(int) $f['vokabel_id']][$f['richtung']] = $f;
}

// --- Synonyme laden ---
$stmt = $pdo->prepare("
    SELECT vokabel_id, synonym, sprache
    FROM synonyme
    WHERE vokabel_id IN ({$placeholders})
");
$stmt->execute($vokabel_ids);
$synonyme_map = [];
foreach ($stmt->fetchAll() as $s) {
    $vid = (int) $s['vokabel_id'];
    $synonyme_map[$vid][$s['sprache']][] = $s['synonym'];
}

// --- Saetze laden (wenn relevant) ---
$saetze_map = [];
if ($modus === 'satz' || $modus === 'gemischt') {
    $stmt = $pdo->prepare("
        SELECT id, vokabel_id, englisch_satz, deutsch_satz, sprachniveau
        FROM saetze
        WHERE vokabel_id IN ({$placeholders}) AND aktiv = 1
    ");
    $stmt->execute($vokabel_ids);
    foreach ($stmt->fetchAll() as $satz) {
        $vid = (int) $satz['vokabel_id'];
        $saetze_map[$vid][] = $satz;
    }
}

// --- Abfrage-Gewichte laden (Fallback: einheitliches Gewicht 5 wenn Tabelle fehlt) ---
$gewichte = [];
try {
    $stmt = $pdo->query("SELECT stufe, gewicht FROM abfrage_gewichte ORDER BY stufe");
    while ($zeile = $stmt->fetch()) {
        $gewichte[(int) $zeile['stufe']] = (float) $zeile['gewicht'];
    }
} catch (\Throwable $e) {
    error_log('abfrage_gewichte nicht verfuegbar: ' . $e->getMessage());
}

// --- neue_vokabeln_pro_tag bestimmen (0 = unbegrenzt) ---
$stmt = $pdo->prepare("SELECT neue_vokabeln_pro_tag FROM benutzer WHERE id = ?");
$stmt->execute([$benutzer['id']]);
$neue_vokabeln_pro_tag = (int) $stmt->fetchColumn();

// Heute bereits eingeführte neue Vokabeln zählen
try {
    $stmt = $pdo->prepare("
        SELECT COUNT(DISTINCT vokabel_id) FROM fortschritt
        WHERE benutzer_id = ? AND DATE(erstellt_am) = CURDATE()
    ");
    $stmt->execute([$benutzer['id']]);
    $heute_neue = (int) $stmt->fetchColumn();
} catch (\Throwable $e) {
    $stmt = $pdo->prepare("
        SELECT COUNT(DISTINCT vokabel_id) FROM fortschritt
        WHERE benutzer_id = ? AND DATE(aktualisiert_am) = CURDATE() AND wiederholungen <= 1
    ");
    $stmt->execute([$benutzer['id']]);
    $heute_neue = (int) $stmt->fetchColumn();
}

// Im nur-fällige-Modus keine neuen Vokabeln einführen
if ($nur_faellige) {
    $verbleibende_neue = 0;
} elseif ($neue_vokabeln_pro_tag === 0) {
    $verbleibende_neue = PHP_INT_MAX; // unbegrenzt
} else {
    $verbleibende_neue = max(0, $neue_vokabeln_pro_tag - $heute_neue);
}

// --- Richtungen bestimmen ---
$richtungen = $richtung === 'beides' ? ['DE', 'ED'] : [$richtung];

// --- Pools aufbauen ---
$pool_faellig  = [];
$pool_neu      = [];
$pool_aelteste = [];
$heute = date('Y-m-d');

foreach ($vokabel_ids as $vid) {
    foreach ($richtungen as $r) {
        $f = $fortschritt_map[$vid][$r] ?? null;

        if ($f === null) {
            $pool_neu[] = ['vokabel_id' => $vid, 'richtung' => $r, 'stufe' => 0, 'gewicht' => 0];
        } elseif ($f['naechste_wiederholung'] !== null && $f['naechste_wiederholung'] <= $heute) {
            $stufe = (int) $f['stufe'];
            $basis = $gewichte[$stufe] ?? 5;
            $richtig = (int) $f['richtig_gesamt'];
            $falsch  = (int) $f['falsch_gesamt'];
            $gesamt  = $richtig + $falsch;
            $gewicht = ($gesamt >= 5 && $falsch > $richtig)
                ? (float) ($basis * PROBLEMVOKABEL_GEWICHT_BONUS)
                : (float) $basis;
            $pool_faellig[] = ['vokabel_id' => $vid, 'richtung' => $r, 'stufe' => $stufe, 'gewicht' => $gewicht];
        } else {
            $stufe = (int) $f['stufe'];
            $pool_aelteste[] = ['vokabel_id' => $vid, 'richtung' => $r, 'stufe' => $stufe, 'gewicht' => $gewichte[$stufe] ?? 5];
        }
    }
}

function gewichtete_auswahl(array &$pool, int $anzahl): array
{
    $ausgewaehlt = [];
    $gewaehlt_keys = [];

    for ($i = 0; $i < $anzahl && !empty($pool); $i++) {
        $gesamt_gewicht = 0;
        foreach ($pool as $key => $item) {
            if (in_array($key, $gewaehlt_keys)) continue;
            $gesamt_gewicht += max(1, $item['gewicht']);
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

// --- Mindest-Slots für neue Vokabeln berechnen ---
$neue_mindest_slots  = 0;
$neue_zusatz_erlaubt = false;

if ($verbleibende_neue > 0 && !empty($pool_neu)) {
    // Nur neue einführen wenn globaler Rückstand nicht zu groß
    $stmt_faellig_global = $pdo->prepare("
        SELECT COUNT(DISTINCT vokabel_id) FROM fortschritt
        WHERE benutzer_id = ? AND naechste_wiederholung <= CURDATE()
    ");
    $stmt_faellig_global->execute([$benutzer['id']]);
    $globale_faellige = (int) $stmt_faellig_global->fetchColumn();

    $stmt_gelernt = $pdo->prepare("SELECT COUNT(DISTINCT vokabel_id) FROM fortschritt WHERE benutzer_id = ?");
    $stmt_gelernt->execute([$benutzer['id']]);
    $gelernte = (int) $stmt_gelernt->fetchColumn();
    $schwelle_neue = max(20, (int) floor($gelernte * 0.20));

    if ($globale_faellige < $schwelle_neue) {
        $neue_zusatz_erlaubt = true;
    }

    if ($neue_zusatz_erlaubt) {
        $neue_mindest_slots = max(2, min(5, (int) round($anzahl * 0.15)));
        $neue_mindest_slots = min($neue_mindest_slots, (int) min($verbleibende_neue, count($pool_neu)));
    }
}

if (!empty($pool_neu)) shuffle($pool_neu);

// --- Fragen zusammenstellen ---
$ausgewaehlt = gewichtete_auswahl($pool_faellig, $anzahl - $neue_mindest_slots);

if ($neue_mindest_slots > 0) {
    $ausgewaehlt = array_merge($ausgewaehlt, array_slice($pool_neu, 0, $neue_mindest_slots));
}

if ($neue_zusatz_erlaubt && count($ausgewaehlt) < $anzahl) {
    $noch_erlaubt = (int) min($verbleibende_neue, PHP_INT_MAX) - $neue_mindest_slots;
    $noch_noetig  = min($anzahl - count($ausgewaehlt), $noch_erlaubt);
    if ($noch_noetig > 0 && count($pool_neu) > $neue_mindest_slots) {
        $ausgewaehlt = array_merge($ausgewaehlt, array_slice($pool_neu, $neue_mindest_slots, $noch_noetig));
    }
}

if (count($ausgewaehlt) < $anzahl) {
    $ausgewaehlt = array_merge($ausgewaehlt, gewichtete_auswahl($pool_aelteste, $anzahl - count($ausgewaehlt)));
}

shuffle($ausgewaehlt);

if (empty($ausgewaehlt)) {
    fehler_ungueltige_eingabe('Keine Fragen konnten generiert werden. Bitte andere Auswahl treffen.');
}

// --- Trainings-Sitzung erstellen ---
$stmt = $pdo->prepare("INSERT INTO trainings_sitzungen (benutzer_id, typ) VALUES (?, ?)");
$stmt->execute([$benutzer['id'], $modus]);
$sitzung_id = (int) $pdo->lastInsertId();

// Gestartete Themenfelder tracken (nicht kritisch — Fehler werden ignoriert)
if (!empty($themenfeld_ids)) {
    try {
        $ph_tf = implode(',', array_fill(0, count($themenfeld_ids), '(?,?)'));
        $params_tf = [];
        foreach ($themenfeld_ids as $tid) {
            $params_tf[] = $benutzer['id'];
            $params_tf[] = $tid;
        }
        $pdo->prepare("
            INSERT IGNORE INTO benutzer_themenfelder_gestartet (benutzer_id, themenfeld_id)
            VALUES {$ph_tf}
        ")->execute($params_tf);
    } catch (\Throwable $e) {
        error_log('benutzer_themenfelder_gestartet: ' . $e->getMessage());
    }
}

// --- Fragen generieren ---
$fragen = [];

foreach ($ausgewaehlt as $index => $item) {
    $vid = $item['vokabel_id'];
    $r   = $item['richtung'];
    $vok = $vokabel_map[$vid] ?? null;
    if (!$vok) continue;

    $frage_typ = _frage_typ_bestimmen($modus, $vid, $saetze_map);
    $syn = $synonyme_map[$vid] ?? ['en' => [], 'de' => []];

    if ($frage_typ === 'satz') {
        $saetze = $saetze_map[$vid] ?? [];
        if (empty($saetze)) {
            $frage_typ = 'vokabel';
        } else {
            $satz = $saetze[array_rand($saetze)];
            $fragen[] = _satz_frage($vok, $satz, $vid, $index);
            continue;
        }
    }

    $fragen[] = _vokabel_frage($vok, $r, $vid, $index, $syn);
}

foreach ($fragen as $i => &$f) {
    $f['index'] = $i;
}
unset($f);

json_erfolg([
    'sitzung_id' => $sitzung_id,
    'fragen'     => $fragen,
    'gesamt'     => count($fragen),
]);

// ==========================================================

function _frage_typ_bestimmen(string $modus, int $vid, array $saetze_map): string
{
    if ($modus === 'vokabel') return 'vokabel';
    if ($modus === 'satz')    return !empty($saetze_map[$vid]) ? 'satz' : 'vokabel';

    // Gemischt: 30% Satz, 70% Vokabel
    $anteil_satz = max(0, min(100, (int) konfig_wert('gemischt_anteil_satz', '30')));
    if (mt_rand(1, 100) <= $anteil_satz && !empty($saetze_map[$vid])) {
        return 'satz';
    }
    return 'vokabel';
}

function _vokabel_frage(array $vok, string $richtung, int $vid, int $index, array $syn): array
{
    if ($richtung === 'DE') {
        // Deutsch → Englisch
        $frage_text = $vok['deutsch'];
        $erwartet   = klammerzusatz_entfernen($vok['englisch']);
        $synonyme   = $syn['en'] ?? [];
        $hinweis    = '';
    } else {
        // Englisch → Deutsch
        $frage_text = $vok['englisch'];
        $erwartet   = klammerzusatz_entfernen($vok['deutsch']);
        $synonyme   = $syn['de'] ?? [];
        $hinweis    = $vok['wortart'];
    }

    return [
        'index'          => $index,
        'typ'            => 'vokabel',
        'richtung'       => $richtung,
        'vokabel_id'     => $vid,
        'frage_text'     => $frage_text,
        'erwartet'       => $erwartet,
        'synonyme'       => $synonyme,
        'hinweis'        => $hinweis,
        'vokabel_wortart' => $vok['wortart'],
        'vokabel_niveau'  => $vok['sprachniveau'],
    ];
}

function _satz_frage(array $vok, array $satz, int $vid, int $index): array
{
    // Lücke bestimmen: Suche nach ___ im englischen Satz; erwartet = entsprechendes englisches Wort (Grundform)
    $erwartet = klammerzusatz_entfernen($vok['englisch']);

    return [
        'index'          => $index,
        'typ'            => 'satz',
        'richtung'       => 'DE',
        'vokabel_id'     => $vid,
        'frage_text'     => $satz['englisch_satz'],
        'kontext'        => $satz['deutsch_satz'],
        'stichwort'      => $vok['deutsch'],
        'erwartet'       => $erwartet,
        'synonyme'       => [],
        'hinweis'        => '',
        'vokabel_wortart' => $vok['wortart'],
        'vokabel_niveau'  => $vok['sprachniveau'],
    ];
}
