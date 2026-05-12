<?php
/**
 * API: Statistik — Benutzer-Statistik laden
 *
 * GET /api/statistik/benutzer.php
 *
 * Liefert detaillierte Statistiken: XP, Sterne, Streak, Level,
 * Stufen-Verteilung, Richtungs-Statistik, Trainings-Zusammenfassung,
 * und Stern-Fortschritt zum naechsten Stern.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__, 2) . '/konfiguration/konstanten.php';
require_once dirname(__DIR__, 2) . '/konfiguration/hilfsfunktionen.php';

// --- Methode pruefen ---
methode_erzwingen('GET');

// --- Authentifizierung ---
$benutzer = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];

$pdo = db_verbindung();

// --- 1. Benutzer-Statistik laden ---
$stmt = $pdo->prepare("SELECT * FROM benutzer_statistik WHERE benutzer_id = ?");
$stmt->execute([$benutzer_id]);
$statistik = $stmt->fetch();

if (!$statistik) {
    // Neuer Benutzer: Leere Statistik
    $statistik = [
        'xp' => 0,
        'bronze_sterne' => 0,
        'silber_sterne' => 0,
        'gold_sterne' => 0,
        'streak_tage' => 0,
        'laengstes_streak' => 0,
        'globales_level' => 1,
        'letztes_training' => null,
        'gesamt_trainings' => 0,
        'gesamt_vokabeln_gelernt' => 0,
    ];
}

// --- 2. Vokabeln pro Stufe zaehlen ---
$stmt = $pdo->prepare("
    SELECT stufe, COUNT(*) as anzahl
    FROM fortschritt
    WHERE benutzer_id = ?
    GROUP BY stufe
    ORDER BY stufe ASC
");
$stmt->execute([$benutzer_id]);
$stufen_roh = $stmt->fetchAll();

// Array mit 7 Eintraegen (Stufe 0-6)
$stufen = array_fill(0, 7, 0);
foreach ($stufen_roh as $s) {
    $idx = (int) $s['stufe'];
    if ($idx >= 0 && $idx <= 6) {
        $stufen[$idx] = (int) $s['anzahl'];
    }
}

// --- 3. Vokabeln pro Richtung zaehlen ---
$stmt = $pdo->prepare("
    SELECT richtung, COUNT(DISTINCT vokabel_id) as anzahl
    FROM fortschritt
    WHERE benutzer_id = ?
    GROUP BY richtung
");
$stmt->execute([$benutzer_id]);
$richtungen_roh = $stmt->fetchAll();

$richtungen = ['DS' => 0, 'SD' => 0];
foreach ($richtungen_roh as $r) {
    $key = $r['richtung'];
    if (isset($richtungen[$key])) {
        $richtungen[$key] = (int) $r['anzahl'];
    }
}

// --- 4. Trainings-Zusammenfassung ---
$stmt = $pdo->prepare("
    SELECT
        COUNT(*) as gesamt_sitzungen,
        COALESCE(SUM(anzahl_fragen), 0) as gesamt_fragen,
        COALESCE(SUM(anzahl_richtig), 0) as gesamt_richtig,
        COALESCE(SUM(xp_verdient), 0) as gesamt_xp_verdient
    FROM trainings_sitzungen
    WHERE benutzer_id = ? AND beendet_am IS NOT NULL
");
$stmt->execute([$benutzer_id]);
$trainings = $stmt->fetch();

$gesamt_fragen = (int) $trainings['gesamt_fragen'];
$gesamt_richtig = (int) $trainings['gesamt_richtig'];
$genauigkeit = $gesamt_fragen > 0 ? (int) round(($gesamt_richtig / $gesamt_fragen) * 100) : 0;

// --- 4b. Beherrschungsquote aus Stufen-Array berechnen ---
// Geuebt = Stufe 1-6, Gemeistert = Stufe 3-6
$vokabeln_geuebt     = array_sum(array_slice($stufen, 1)); // stufen[1] + ... + stufen[6]
$vokabeln_auf_3plus  = array_sum(array_slice($stufen, 3)); // stufen[3] + ... + stufen[6]
$beherrschungsquote  = $vokabeln_geuebt > 0
    ? (int) round($vokabeln_auf_3plus / $vokabeln_geuebt * 100)
    : 0;

// --- 5. Stern-Fortschritt berechnen ---
$xp = (int) $statistik['xp'];
$bronze = (int) $statistik['bronze_sterne'];
$silber = (int) $statistik['silber_sterne'];
$gold = (int) $statistik['gold_sterne'];

// Schwellen aus Konfiguration laden (mit PHP-Konstanten als Fallback)
$xp_pro_bronze = (int) konfig_wert('xp_pro_bronze', (string) XP_PRO_BRONZE);
$xp_pro_silber = (int) konfig_wert('xp_pro_silber', (string) XP_PRO_SILBER);
$xp_pro_gold   = (int) konfig_wert('xp_pro_gold',   (string) XP_PRO_GOLD);

$naechster_bronze = ($bronze + 1) * $xp_pro_bronze;
$naechster_silber = ($silber + 1) * $xp_pro_silber;
$naechster_gold   = ($gold   + 1) * $xp_pro_gold;

$bronze_prozent = $xp_pro_bronze > 0 ? min(100, (int) round(($xp % $xp_pro_bronze) / $xp_pro_bronze * 100)) : 0;
$silber_prozent = $xp_pro_silber > 0 ? min(100, (int) round(($xp % $xp_pro_silber) / $xp_pro_silber * 100)) : 0;
$gold_prozent   = $xp_pro_gold   > 0 ? min(100, (int) round(($xp % $xp_pro_gold)   / $xp_pro_gold   * 100)) : 0;

// Bei genau auf Schwelle: 100% (gerade erreicht)
if ($xp > 0 && $xp_pro_bronze > 0 && $xp % $xp_pro_bronze === 0) $bronze_prozent = 100;
if ($xp > 0 && $xp_pro_silber > 0 && $xp % $xp_pro_silber === 0) $silber_prozent = 100;
if ($xp > 0 && $xp_pro_gold   > 0 && $xp % $xp_pro_gold   === 0) $gold_prozent   = 100;

// --- 6. Dashboard-Vokabel-Schnellstats ---
// Konfigurierbare Schwellen laden
$gekonnt_schwelle    = (int) konfig_wert('gekonnt_schwelle', '4');
$wiederholt_schwelle = (int) konfig_wert('wiederholt_stufe_schwelle', '2');
$faellig_voraus      = (int) konfig_wert('faellig_voraus_tage', '0');
$faellig_datum       = $faellig_voraus > 0
    ? 'DATE_ADD(CURDATE(), INTERVAL ' . $faellig_voraus . ' DAY)'
    : 'CURDATE()';

// Gelernt (Stufe >= gekonnt_schwelle = sicher gelernt) + Wiederholt (alle Richtungen aggregiert per Vokabel)
$stmt = $pdo->prepare("
    SELECT
        COUNT(DISTINCT f.vokabel_id) AS vokabeln_gelernt,
        SUM(CASE WHEN f.stufe >= {$gekonnt_schwelle} THEN 1 ELSE 0 END) AS vokabeln_sicher_gelernt,
        SUM(CASE WHEN f.stufe >= ? THEN 1 ELSE 0 END) AS vokabeln_wiederholt
    FROM (
        SELECT vokabel_id, MAX(stufe) AS stufe
        FROM fortschritt
        WHERE benutzer_id = ?
        GROUP BY vokabel_id
    ) f
");
$stmt->execute([$wiederholt_schwelle, $benutzer_id]);
$vok_stats = $stmt->fetch();

// Faellig: nur DS-Richtung, nur aktive Vokabeln
// (Inaktive wuerden sonst einen hoeheren Wert als die Vokabelliste liefern)
$stmt_faellig = $pdo->prepare("
    SELECT COUNT(DISTINCT f.vokabel_id) AS vokabeln_faellig
    FROM fortschritt f
    JOIN vokabeln v ON v.id = f.vokabel_id AND v.aktiv = 1
    WHERE f.benutzer_id = ?
      AND f.richtung = 'DS'
      AND f.naechste_wiederholung <= {$faellig_datum}
");
$stmt_faellig->execute([$benutzer_id]);
$faellig_row = $stmt_faellig->fetch();

// Neu = Vokabeln aus Lektionen, die der Nutzer explizit trainiert hat
//       (benutzer_lektionen_gestartet), die aber noch nicht in fortschritt sind.
//       Keine Ableitung ueber lektion_vokabeln, da geteilte Vokabeln sonst
//       fremde Lektionen faelschlich als "gestartet" markieren wuerden.
$stmt_neu = $pdo->prepare("
    SELECT COUNT(DISTINCT lv.vokabel_id) AS vokabeln_neu
    FROM lektion_vokabeln lv
    JOIN lektionen l ON l.id = lv.lektion_id
    JOIN benutzer_lektionen_gestartet blg
        ON blg.lektion_id = lv.lektion_id AND blg.benutzer_id = ?
    WHERE lv.vokabel_id NOT IN (
        SELECT DISTINCT vokabel_id FROM fortschritt WHERE benutzer_id = ?
    )
");
$stmt_neu->execute([$benutzer_id, $benutzer_id]);
$neu_row = $stmt_neu->fetch();

$vokabeln_gelernt        = (int) ($vok_stats['vokabeln_gelernt']        ?? 0);
$vokabeln_sicher_gelernt = (int) ($vok_stats['vokabeln_sicher_gelernt'] ?? 0);
$vokabeln_wiederholt     = (int) ($vok_stats['vokabeln_wiederholt']     ?? 0);
$vokabeln_faellig    = (int) ($faellig_row['vokabeln_faellig']  ?? 0);
$vokabeln_neu        = (int) ($neu_row['vokabeln_neu']          ?? 0);

// --- Antwort ---
json_erfolg([
    'vokabeln_gelernt'        => $vokabeln_gelernt,
    'vokabeln_sicher_gelernt' => $vokabeln_sicher_gelernt,
    'vokabeln_wiederholt'     => $vokabeln_wiederholt,
    'vokabeln_faellig'    => $vokabeln_faellig,
    'vokabeln_neu'        => $vokabeln_neu,
    'statistik' => [
        'xp' => $xp,
        'bronze_sterne' => $bronze,
        'silber_sterne' => $silber,
        'gold_sterne' => $gold,
        'streak_tage' => (int) $statistik['streak_tage'],
        'laengstes_streak' => (int) $statistik['laengstes_streak'],
        'globales_level' => (int) $statistik['globales_level'],
        'beherrschungsquote' => $beherrschungsquote,
        'letztes_training' => $statistik['letztes_training'],
        'gesamt_trainings' => (int) $statistik['gesamt_trainings'],
        'gesamt_vokabeln_gelernt' => (int) $statistik['gesamt_vokabeln_gelernt'],
    ],
    'stufen' => $stufen,
    'richtungen' => $richtungen,
    'trainings' => [
        'gesamt_sitzungen' => (int) $trainings['gesamt_sitzungen'],
        'gesamt_fragen' => $gesamt_fragen,
        'gesamt_richtig' => $gesamt_richtig,
        'genauigkeit' => $genauigkeit,
        'gesamt_xp_verdient' => (int) $trainings['gesamt_xp_verdient'],
    ],
    'stern_fortschritt' => [
        'bronze_prozent' => $bronze_prozent,
        'naechster_bronze' => $naechster_bronze,
        'silber_prozent' => $silber_prozent,
        'naechster_silber' => $naechster_silber,
        'gold_prozent' => $gold_prozent,
        'naechster_gold' => $naechster_gold,
    ],
]);
