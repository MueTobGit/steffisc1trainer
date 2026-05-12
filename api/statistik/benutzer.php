<?php
/**
 * API: Statistik — Benutzer-Statistik laden
 *
 * GET /api/statistik/benutzer.php
 *
 * Liefert: Stufen-Verteilung, Richtungs-Statistik, Trainings-Zusammenfassung,
 * Vokabel-Schnellstats (gelernt, wiederholt, faellig, neu).
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
    $statistik = [
        'letztes_training'        => null,
        'gesamt_trainings'        => 0,
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

$richtungen = ['DE' => 0, 'ED' => 0];
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
        COALESCE(SUM(anzahl_richtig), 0) as gesamt_richtig
    FROM trainings_sitzungen
    WHERE benutzer_id = ? AND beendet_am IS NOT NULL
");
$stmt->execute([$benutzer_id]);
$trainings = $stmt->fetch();

$gesamt_fragen  = (int) $trainings['gesamt_fragen'];
$gesamt_richtig = (int) $trainings['gesamt_richtig'];
$genauigkeit    = $gesamt_fragen > 0 ? (int) round(($gesamt_richtig / $gesamt_fragen) * 100) : 0;

// --- 4b. Beherrschungsquote ---
$vokabeln_geuebt    = array_sum(array_slice($stufen, 1));
$vokabeln_auf_3plus = array_sum(array_slice($stufen, 3));
$beherrschungsquote = $vokabeln_geuebt > 0
    ? (int) round($vokabeln_auf_3plus / $vokabeln_geuebt * 100)
    : 0;

// --- 5. Dashboard-Vokabel-Schnellstats ---
$gekonnt_schwelle    = (int) konfig_wert('gekonnt_schwelle', '4');
$wiederholt_schwelle = (int) konfig_wert('wiederholt_stufe_schwelle', '2');
$faellig_voraus      = (int) konfig_wert('faellig_voraus_tage', '0');
$faellig_datum       = $faellig_voraus > 0
    ? 'DATE_ADD(CURDATE(), INTERVAL ' . $faellig_voraus . ' DAY)'
    : 'CURDATE()';

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

// Faellig: nur DE-Richtung, nur aktive Vokabeln
$stmt_faellig = $pdo->prepare("
    SELECT COUNT(DISTINCT f.vokabel_id) AS vokabeln_faellig
    FROM fortschritt f
    JOIN vokabeln v ON v.id = f.vokabel_id AND v.aktiv = 1
    WHERE f.benutzer_id = ?
      AND f.richtung = 'DE'
      AND f.naechste_wiederholung <= {$faellig_datum}
");
$stmt_faellig->execute([$benutzer_id]);
$faellig_row = $stmt_faellig->fetch();

// Neu = Vokabeln aus Themenfeldern, die der Nutzer gestartet hat,
//       aber noch nicht in fortschritt sind.
$stmt_neu = $pdo->prepare("
    SELECT COUNT(DISTINCT tv.vokabel_id) AS vokabeln_neu
    FROM themenfeld_vokabeln tv
    JOIN themenfelder t ON t.id = tv.themenfeld_id
    JOIN benutzer_themenfelder_gestartet btg
        ON btg.themenfeld_id = tv.themenfeld_id AND btg.benutzer_id = ?
    WHERE tv.vokabel_id NOT IN (
        SELECT DISTINCT vokabel_id FROM fortschritt WHERE benutzer_id = ?
    )
");
$stmt_neu->execute([$benutzer_id, $benutzer_id]);
$neu_row = $stmt_neu->fetch();

$vokabeln_gelernt        = (int) ($vok_stats['vokabeln_gelernt']        ?? 0);
$vokabeln_sicher_gelernt = (int) ($vok_stats['vokabeln_sicher_gelernt'] ?? 0);
$vokabeln_wiederholt     = (int) ($vok_stats['vokabeln_wiederholt']     ?? 0);
$vokabeln_faellig        = (int) ($faellig_row['vokabeln_faellig']      ?? 0);
$vokabeln_neu            = (int) ($neu_row['vokabeln_neu']               ?? 0);

// --- Antwort ---
json_erfolg([
    'vokabeln_gelernt'        => $vokabeln_gelernt,
    'vokabeln_sicher_gelernt' => $vokabeln_sicher_gelernt,
    'vokabeln_wiederholt'     => $vokabeln_wiederholt,
    'vokabeln_faellig'        => $vokabeln_faellig,
    'vokabeln_neu'            => $vokabeln_neu,
    'statistik' => [
        'beherrschungsquote'      => $beherrschungsquote,
        'letztes_training'        => $statistik['letztes_training'],
        'gesamt_trainings'        => (int) $statistik['gesamt_trainings'],
        'gesamt_vokabeln_gelernt' => (int) $statistik['gesamt_vokabeln_gelernt'],
    ],
    'stufen'    => $stufen,
    'richtungen' => $richtungen,
    'trainings' => [
        'gesamt_sitzungen' => (int) $trainings['gesamt_sitzungen'],
        'gesamt_fragen'    => $gesamt_fragen,
        'gesamt_richtig'   => $gesamt_richtig,
        'genauigkeit'      => $genauigkeit,
    ],
]);
