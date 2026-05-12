<?php
/**
 * API: Fortschritt — Uebersicht laden
 *
 * GET /api/fortschritt/laden.php
 *
 * Gibt eine Zusammenfassung des Lernfortschritts zurueck:
 * Zaehler pro Zustand, pro Stufe, faellige Vokabeln heute,
 * Beherrschungsquote, Sprachniveau-Fortschritt.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__, 2) . '/konfiguration/lern_algorithmus.php';

// --- Methode pruefen ---
methode_erzwingen('GET');

// --- Authentifizierung ---
$benutzer = benutzer_authentifizieren();

$pdo = db_verbindung();

// --- Zaehler pro Zustand ---
$stmt = $pdo->prepare("
    SELECT zustand, COUNT(*) as anzahl
    FROM fortschritt
    WHERE benutzer_id = ?
    GROUP BY zustand
");
$stmt->execute([$benutzer['id']]);
$zustaende = ['neu' => 0, 'lernen' => 0, 'wiederholung' => 0, 'gelernt' => 0];
while ($zeile = $stmt->fetch()) {
    $zustaende[$zeile['zustand']] = (int) $zeile['anzahl'];
}
$gesamt = array_sum($zustaende);

// --- Zaehler pro Stufe (0-6) ---
$stmt = $pdo->prepare("
    SELECT stufe, COUNT(*) as anzahl
    FROM fortschritt
    WHERE benutzer_id = ?
    GROUP BY stufe
    ORDER BY stufe
");
$stmt->execute([$benutzer['id']]);
$stufen = array_fill(0, 7, 0);
while ($zeile = $stmt->fetch()) {
    $s = (int) $zeile['stufe'];
    if ($s >= 0 && $s <= 6) {
        $stufen[$s] = (int) $zeile['anzahl'];
    }
}

// --- Faellig heute ---
$stmt = $pdo->prepare("
    SELECT COUNT(*) as anzahl
    FROM fortschritt
    WHERE benutzer_id = ? AND naechste_wiederholung <= CURDATE()
");
$stmt->execute([$benutzer['id']]);
$faellig_heute = (int) $stmt->fetchColumn();

$gekonnt_schwelle = (int) konfig_wert('gekonnt_schwelle', '4');

// --- Gemeisterte Vokabeln pro Richtung ---
$stmt = $pdo->prepare("
    SELECT f.richtung, COUNT(DISTINCT f.vokabel_id) AS anzahl
    FROM fortschritt f
    JOIN vokabeln v ON v.id = f.vokabel_id
    WHERE f.benutzer_id = ? AND f.stufe >= {$gekonnt_schwelle}
    GROUP BY f.richtung
");
$stmt->execute([$benutzer['id']]);
$richtung_counts = ['DE' => 0, 'ED' => 0];
foreach ($stmt->fetchAll() as $r) {
    if (isset($richtung_counts[$r['richtung']])) {
        $richtung_counts[$r['richtung']] = (int) $r['anzahl'];
    }
}
$gesamt_gemeistert = max($richtung_counts['DE'], $richtung_counts['ED']);

// --- Sprachniveau-Fortschritt (B1–C1, C1-Trainer-Ziele) ---
$stmt = $pdo->prepare("
    SELECT v.sprachniveau, COUNT(DISTINCT f.vokabel_id) AS gemeistert
    FROM fortschritt f
    JOIN vokabeln v ON v.id = f.vokabel_id
    WHERE f.benutzer_id = ? AND f.stufe >= {$gekonnt_schwelle}
    GROUP BY v.sprachniveau
");
$stmt->execute([$benutzer['id']]);
$niveau_gemeistert = [];
foreach ($stmt->fetchAll() as $n) {
    $niveau_gemeistert[$n['sprachniveau']] = (int) $n['gemeistert'];
}

$stmt = $pdo->query("
    SELECT sprachniveau, COUNT(*) AS gesamt
    FROM vokabeln
    WHERE aktiv = 1
    GROUP BY sprachniveau
");
$niveau_gesamt = [];
foreach ($stmt->fetchAll() as $n) {
    $niveau_gesamt[$n['sprachniveau']] = (int) $n['gesamt'];
}

$sprachniveau_fortschritt = [];
foreach ($niveau_gesamt as $niv => $in_db) {
    if ($in_db === 0) continue;
    $gemeistert = $niveau_gemeistert[$niv] ?? 0;
    $prozent = $in_db > 0 ? min(100, (int) round($gemeistert / $in_db * 100)) : 0;
    $sprachniveau_fortschritt[] = [
        'niveau'     => $niv,
        'gemeistert' => $gemeistert,
        'ziel'       => $in_db,
        'in_db'      => $in_db,
        'prozent'    => $prozent,
    ];
}
usort($sprachniveau_fortschritt, fn($a, $b) => strcmp($a['niveau'], $b['niveau']));

// --- Beherrschungsquote ---
$stmt = $pdo->prepare("
    SELECT
        COUNT(DISTINCT vokabel_id) AS geuebt,
        SUM(CASE WHEN stufe >= {$gekonnt_schwelle} THEN 1 ELSE 0 END) AS auf_stufe3plus
    FROM fortschritt
    WHERE benutzer_id = ?
");
$stmt->execute([$benutzer['id']]);
$bq = $stmt->fetch();
$beherrschungsquote = ($bq['geuebt'] > 0)
    ? (int) round($bq['auf_stufe3plus'] / $bq['geuebt'] * 100)
    : 0;

json_erfolg([
    'uebersicht' => [
        'gesamt'        => $gesamt,
        'neu'           => $zustaende['neu'],
        'lernen'        => $zustaende['lernen'],
        'wiederholung'  => $zustaende['wiederholung'],
        'gelernt'       => $zustaende['gelernt'],
        'faellig_heute' => $faellig_heute,
        'stufen'        => $stufen,
    ],
    'beherrschungsquote'       => $beherrschungsquote,
    'sprachniveau_fortschritt' => $sprachniveau_fortschritt,
]);
