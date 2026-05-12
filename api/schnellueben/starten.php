<?php
/**
 * API: Schnellueben — Starten
 *
 * POST /api/schnellueben/starten.php
 * Body: { themenfeld_ids: [], favoriten: boolean, anzahl: 5-20, aufgaben_typen: [] }
 *
 * Kein SM-2, keine Fortschritts-Updates.
 *
 * Aufgabentypen:
 * - multiple_choice: 4 Optionen, 1 richtig, 3 Distraktoren
 * - zuordnung: 4-6 Paare verbinden (Tap-basiert)
 * - satz_bauen: Woerter in richtige Reihenfolge sortieren
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';
require_once dirname(__DIR__, 2) . '/konfiguration/hilfsfunktionen.php';

methode_erzwingen('POST');
$benutzer = benutzer_authentifizieren();

$body = json_body_lesen();

$themenfeld_ids = $body['themenfeld_ids'] ?? $body['lektion_ids'] ?? [];
if (!is_array($themenfeld_ids)) {
    fehler_ungueltige_eingabe('themenfeld_ids muss ein Array sein.');
}
$themenfeld_ids = array_values(array_filter(array_map('intval', $themenfeld_ids), fn($id) => $id > 0));

$favoriten = !empty($body['favoriten']);

$anzahl = (int) ($body['anzahl'] ?? 8);
if ($anzahl < 5 || $anzahl > 20) {
    fehler_ungueltige_eingabe('Anzahl muss zwischen 5 und 20 liegen.');
}

$erlaubte_typen = ['multiple_choice', 'zuordnung', 'satz_bauen'];

$aufgaben_typen = $body['aufgaben_typen'] ?? $erlaubte_typen;
if (!is_array($aufgaben_typen) || empty($aufgaben_typen)) {
    $aufgaben_typen = $erlaubte_typen;
}
$aufgaben_typen = array_values(array_intersect($aufgaben_typen, $erlaubte_typen));

if (empty($themenfeld_ids) && !$favoriten) {
    fehler_ungueltige_eingabe('Mindestens ein Themenfeld oder Favoriten muss ausgewaehlt sein.');
}

$pdo = db_verbindung();

// --- Vokabeln sammeln ---
$vokabel_ids = [];

if (!empty($themenfeld_ids)) {
    $ph = implode(',', array_fill(0, count($themenfeld_ids), '?'));
    $stmt = $pdo->prepare("
        SELECT DISTINCT tv.vokabel_id
        FROM themenfeld_vokabeln tv
        JOIN vokabeln v ON v.id = tv.vokabel_id AND v.aktiv = 1
        WHERE tv.themenfeld_id IN ({$ph})
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

// --- Neue-Vokabeln-Limit anwenden ---
$neue_vokabeln_pro_tag = (int) (function () use ($pdo, $benutzer) {
    $stmt = $pdo->prepare("SELECT neue_vokabeln_pro_tag FROM benutzer WHERE id = ?");
    $stmt->execute([$benutzer['id']]);
    return $stmt->fetchColumn() ?: 10;
})();

if ($neue_vokabeln_pro_tag > 0 && !empty($vokabel_ids)) {
    try {
        $stmt = $pdo->prepare("SELECT COUNT(DISTINCT vokabel_id) FROM fortschritt WHERE benutzer_id = ? AND DATE(erstellt_am) = CURDATE()");
        $stmt->execute([$benutzer['id']]);
        $heute_neue = (int) $stmt->fetchColumn();
    } catch (\Throwable $e) {
        $stmt = $pdo->prepare("SELECT COUNT(DISTINCT vokabel_id) FROM fortschritt WHERE benutzer_id = ? AND DATE(aktualisiert_am) = CURDATE() AND wiederholungen <= 1");
        $stmt->execute([$benutzer['id']]);
        $heute_neue = (int) $stmt->fetchColumn();
    }
    $verbleibende_neue = max(0, $neue_vokabeln_pro_tag - $heute_neue);

    $ph_v = implode(',', array_fill(0, count($vokabel_ids), '?'));
    $stmt = $pdo->prepare("SELECT DISTINCT vokabel_id FROM fortschritt WHERE benutzer_id = ? AND vokabel_id IN ({$ph_v})");
    $stmt->execute(array_merge([$benutzer['id']], $vokabel_ids));
    $gelernte_set = array_flip(array_column($stmt->fetchAll(), 'vokabel_id'));

    $bekannte = [];
    $neue = [];
    foreach ($vokabel_ids as $vid) {
        if (isset($gelernte_set[$vid])) $bekannte[] = $vid;
        else $neue[] = $vid;
    }
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
$ph = implode(',', array_fill(0, count($vokabel_ids), '?'));
$stmt = $pdo->prepare("
    SELECT v.id, v.englisch, v.deutsch, v.wortart, v.sprachniveau
    FROM vokabeln v
    WHERE v.id IN ({$ph}) AND v.aktiv = 1
");
$stmt->execute($vokabel_ids);
$vokabeln = $stmt->fetchAll();
$vokabel_map = [];
foreach ($vokabeln as $v) {
    $v['id'] = (int) $v['id'];
    $vokabel_map[$v['id']] = $v;
}

// --- Saetze laden (fuer satz_bauen) ---
$saetze_map = [];
if (in_array('satz_bauen', $aufgaben_typen)) {
    $stmt = $pdo->prepare("
        SELECT id, vokabel_id, englisch_satz, deutsch_satz
        FROM saetze
        WHERE vokabel_id IN ({$ph}) AND aktiv = 1
    ");
    $stmt->execute($vokabel_ids);
    foreach ($stmt->fetchAll() as $satz) {
        $vid = (int) $satz['vokabel_id'];
        $saetze_map[$vid][] = $satz;
    }
}

// --- Sitzung erstellen ---
$stmt = $pdo->prepare("INSERT INTO trainings_sitzungen (benutzer_id, typ) VALUES (?, 'schnell')");
$stmt->execute([$benutzer['id']]);
$sitzung_id = (int) $pdo->lastInsertId();

// --- Aufgaben generieren ---
$aufgaben = _aufgaben_generieren($vokabeln, $saetze_map, $anzahl, $aufgaben_typen);

json_erfolg([
    'sitzung_id' => $sitzung_id,
    'aufgaben'   => $aufgaben,
    'gesamt'     => count($aufgaben),
]);


// ============================================================

function _aufgaben_generieren(array $vokabeln, array $saetze_map, int $anzahl, array $typen): array
{
    $aufgaben = [];
    $index = 0;

    $gemischte = $vokabeln;
    shuffle($gemischte);
    $gesamt = count($gemischte);

    $hat_mc        = in_array('multiple_choice', $typen) && $gesamt >= 4;
    $hat_zuordnung = in_array('zuordnung', $typen) && $gesamt >= 4;

    // Satz-Kandidaten sammeln
    $satz_kands = [];
    if (in_array('satz_bauen', $typen)) {
        $satz_kands = _satz_kandidaten_sammeln($gemischte, $saetze_map);
    }
    $hat_satz = !empty($satz_kands);

    $aktive = [];
    if ($hat_mc)        $aktive[] = 'mc';
    if ($hat_zuordnung) $aktive[] = 'zuordnung';
    if ($hat_satz)      $aktive[] = 'satz';

    if (empty($aktive)) {
        // Fallback: MC ohne Mindest-Vokabeln (wird null zurückgeben, aber verhindert leeres Array)
        $aktive = ['mc'];
        $hat_mc = true;
    }

    // Slots gleichmäßig verteilen
    $cnt   = count($aktive);
    $basis = (int) floor($anzahl / $cnt);
    $rest  = $anzahl % $cnt;
    $slots = [];
    foreach ($aktive as $i => $t) {
        $slots[$t] = $basis + ($i < $rest ? 1 : 0);
    }

    $vok_pool = $gemischte;

    // --- Zuordnung ---
    $zuordnung_slots = $slots['zuordnung'] ?? 0;
    for ($z = 0; $z < $zuordnung_slots; $z++) {
        $paare_anzahl = min(count($vok_pool), mt_rand(4, 6));
        if ($paare_anzahl < 4) { $slots['mc'] = ($slots['mc'] ?? 0) + ($zuordnung_slots - $z); break; }
        $gruppe = array_splice($vok_pool, 0, $paare_anzahl);
        $aufgaben[] = _zuordnung_aufgabe($gruppe, $index++);
    }

    // --- Satz-Bauen ---
    $satz_slots = $slots['satz'] ?? 0;
    shuffle($satz_kands);
    $satz_zaehler = 0;
    foreach ($satz_kands as $k) {
        if ($satz_zaehler >= $satz_slots) break;
        $a = _satz_aufgabe($k['vokabel'], $k['satz'], $index);
        if ($a !== null) { $aufgaben[] = $a; $index++; $satz_zaehler++; }
    }
    $slots['mc'] = ($slots['mc'] ?? 0) + ($satz_slots - $satz_zaehler);

    // --- Multiple-Choice ---
    $mc_slots = $slots['mc'] ?? 0;
    if ($hat_mc && $gesamt >= 4) {
        $mc_pool = $gemischte;
        shuffle($mc_pool);
        $mc_zaehler = 0;
        foreach ($mc_pool as $vok) {
            if ($mc_zaehler >= $mc_slots) break;
            $a = _mc_aufgabe($vok, $gemischte, $index);
            if ($a !== null) { $aufgaben[] = $a; $index++; $mc_zaehler++; }
        }
    }

    shuffle($aufgaben);
    foreach ($aufgaben as $i => &$a) { $a['index'] = $i; }
    unset($a);

    return $aufgaben;
}

function _satz_kandidaten_sammeln(array $vokabeln, array $saetze_map): array
{
    $kandidaten = [];
    foreach ($vokabeln as $vok) {
        $vid = (int) $vok['id'];
        if (!empty($saetze_map[$vid])) {
            foreach ($saetze_map[$vid] as $satz) {
                if (!str_contains($satz['englisch_satz'], '___')) continue;
                $vollsatz = str_replace('___', klammerzusatz_entfernen($vok['englisch']), $satz['englisch_satz']);
                $woerter = explode(' ', trim($vollsatz));
                if (count($woerter) >= 3) {
                    $kandidaten[] = ['vokabel' => $vok, 'satz' => $satz];
                }
            }
        }
    }
    return $kandidaten;
}

function _mc_aufgabe(array $vok, array $alle_vokabeln, int $index): ?array
{
    // 50/50: Englisch anzeigen → Deutsch wählen, oder Deutsch anzeigen → Englisch wählen
    $richtung = mt_rand(0, 1) === 0 ? 'ED' : 'DE';

    if ($richtung === 'ED') {
        $frage_text      = $vok['englisch'];
        $richtige_antwort = $vok['deutsch'];
        $distraktor_feld  = 'deutsch';
    } else {
        $frage_text      = $vok['deutsch'];
        $richtige_antwort = $vok['englisch'];
        $distraktor_feld  = 'englisch';
    }

    $distraktoren = _distraktoren_finden($vok, $alle_vokabeln, $distraktor_feld, 3);
    if (count($distraktoren) < 3) return null;

    $optionen = [['id' => 0, 'text' => $richtige_antwort, 'richtig' => true]];
    foreach ($distraktoren as $i => $d) {
        $optionen[] = ['id' => $i + 1, 'text' => $d, 'richtig' => false];
    }
    shuffle($optionen);
    foreach ($optionen as $i => &$opt) { $opt['id'] = $i; }
    unset($opt);

    return [
        'index'      => $index,
        'typ'        => 'multiple_choice',
        'vokabel_id' => (int) $vok['id'],
        'richtung'   => $richtung,
        'frage_text' => $frage_text,
        'optionen'   => $optionen,
    ];
}

function _distraktoren_finden(array $vok, array $alle, string $feld, int $anzahl): array
{
    $ergebnis = [];
    $benutzt  = [mb_strtolower($vok[$feld])];

    $gleiche_wortart = array_filter($alle, fn($v) => (int)$v['id'] !== (int)$vok['id'] && $v['wortart'] === $vok['wortart']);
    shuffle($gleiche_wortart);
    foreach ($gleiche_wortart as $v) {
        if (count($ergebnis) >= $anzahl) break;
        $lower = mb_strtolower($v[$feld]);
        if (!in_array($lower, $benutzt)) { $ergebnis[] = $v[$feld]; $benutzt[] = $lower; }
    }

    if (count($ergebnis) < $anzahl) {
        $rest = array_filter($alle, fn($v) => (int)$v['id'] !== (int)$vok['id']);
        shuffle($rest);
        foreach ($rest as $v) {
            if (count($ergebnis) >= $anzahl) break;
            $lower = mb_strtolower($v[$feld]);
            if (!in_array($lower, $benutzt)) { $ergebnis[] = $v[$feld]; $benutzt[] = $lower; }
        }
    }
    return $ergebnis;
}

function _zuordnung_aufgabe(array $vok_gruppe, int $index): array
{
    $paare = [];
    foreach ($vok_gruppe as $i => $vok) {
        $paare[] = ['id' => $i, 'links' => $vok['englisch'], 'rechts' => $vok['deutsch'], 'vokabel_id' => (int) $vok['id']];
    }
    $rechts = array_column($paare, 'rechts');
    shuffle($rechts);
    return ['index' => $index, 'typ' => 'zuordnung', 'paare' => $paare, 'rechts_reihenfolge' => $rechts, 'gesamt_paare' => count($paare)];
}

function _satz_aufgabe(array $vok, array $satz, int $index): ?array
{
    $vollsatz = str_replace('___', klammerzusatz_entfernen($vok['englisch']), $satz['englisch_satz']);
    $woerter = explode(' ', trim($vollsatz));
    $woerter = array_map(fn($w) => trim($w, '.,!?;:–—«»"""\''), $woerter);
    $woerter = array_values(array_filter($woerter, fn($w) => $w !== ''));

    if (count($woerter) < 3) return null;

    $loesung  = $woerter;
    $gemischt = $woerter;
    $versuche = 0;
    do { shuffle($gemischt); $versuche++; } while ($gemischt === $loesung && $versuche < 10);
    if ($gemischt === $loesung) return null;

    return [
        'index'           => $index,
        'typ'             => 'satz_bauen',
        'vokabel_id'      => (int) $vok['id'],
        'deutsch_kontext' => $satz['deutsch_satz'],
        'woerter'         => $gemischt,
        'loesung'         => $loesung,
    ];
}
