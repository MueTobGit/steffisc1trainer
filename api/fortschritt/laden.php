<?php
/**
 * API: Fortschritt — Uebersicht laden
 *
 * GET /api/fortschritt/laden.php
 *
 * Gibt eine Zusammenfassung des Lernfortschritts zurueck:
 * Zaehler pro Zustand, pro Stufe, faellige Vokabeln heute.
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
$stufen = array_fill(0, 7, 0); // Index 0-6
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

// --- Statistik laden ---
$stmt = $pdo->prepare("SELECT * FROM benutzer_statistik WHERE benutzer_id = ?");
$stmt->execute([$benutzer['id']]);
$statistik = $stmt->fetch();

$globales_level = $statistik ? (int) $statistik['globales_level'] : 1;
$xp = $statistik ? (int) $statistik['xp'] : 0;
$streak_tage = $statistik ? (int) $statistik['streak_tage'] : 0;

// --- Sprachniveau-Fortschritt berechnen ---
// MAX(DS-Anzahl, SD-Anzahl) gemeisteter Vokabeln — kein Sprachniveau-Filter,
// kein aktiv-Filter (gelernte Vokabeln zaehlen auch wenn spaeter deaktiviert).
// Referenzwerte (Rivstart, kumulativ): A1=850, A2=1500, B1=3000, B2=5000
$gekonnt_schwelle = (int) konfig_wert('gekonnt_schwelle', '4');

// Mastered count: pro Richtung zaehlen, dann MAX nehmen
// Vokabeln die in MINDESTENS einer Richtung gemeistert sind, zaehlen.
$stmt = $pdo->prepare("
    SELECT f.richtung, COUNT(DISTINCT f.vokabel_id) AS anzahl
    FROM fortschritt f
    JOIN vokabeln v ON v.id = f.vokabel_id
    WHERE f.benutzer_id = ? AND f.stufe >= {$gekonnt_schwelle}
    GROUP BY f.richtung
");
$stmt->execute([$benutzer['id']]);
$richtung_counts = ['DS' => 0, 'SD' => 0];
foreach ($stmt->fetchAll() as $r) {
    $richtung_counts[$r['richtung']] = (int) $r['anzahl'];
}
$gesamt_gemeistert = max($richtung_counts['DS'], $richtung_counts['SD']);

// Mastered count auch pro Sprachniveau (fuer Stufen-Anzeige), ebenfalls ohne aktiv-Filter
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

// Gesamtanzahl aller Vokabeln pro Niveau in der Datenbank (aktive)
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

// Referenzwerte aus Admin-Konfiguration oder Standard (Rivstart, kumulativ)
$niveau_ziele = [
    'A1' => (int) konfig_wert('niveau_ziel_a1', '850'),
    'A2' => (int) konfig_wert('niveau_ziel_a2', '1500'),
    'B1' => (int) konfig_wert('niveau_ziel_b1', '3000'),
    'B2' => (int) konfig_wert('niveau_ziel_b2', '5000'),
];

// Aktuelles Sprachniveau bestimmen: hoechstes Niveau mit >= 80% Abdeckung (kumulativ).
// 'gemeistert' = globaler MAX(DS,SD)-Wert — alle gemeisterten Vokabeln zaehlen,
// egal auf welchem Sprachniveau sie sind. 'in_db' = kumulativ alle aktiven Vokabeln
// bis zum jeweiligen Niveau.
$sprachniveau_fortschritt = [];
$aktuelles_niveau = null;
$kumulativ_in_db = 0;
foreach (['A1', 'A2', 'B1', 'B2'] as $niv) {
    $kumulativ_in_db += $niveau_gesamt[$niv] ?? 0;
    $ziel    = $niveau_ziele[$niv];
    // Fuer das prozentuale Ziel den globalen MAX(DS,SD)-Wert verwenden
    $prozent = min(100, (int) round($gesamt_gemeistert / $ziel * 100));
    if ($prozent >= 80) {
        $aktuelles_niveau = $niv;
    }
    $sprachniveau_fortschritt[] = [
        'niveau'      => $niv,
        'gemeistert'  => $gesamt_gemeistert,
        'ziel'        => $ziel,
        'in_db'       => $kumulativ_in_db,
        'prozent'     => $prozent,
    ];
}

// Nur das aktuelle und naechste Niveau uebergeben (max. 2 Eintraege)
// - Kein Niveau abgeschlossen: zeige nur A1 (1 Eintrag, idx=-1 → ab 0, laenge 1)
// - Niveau N abgeschlossen: zeige N + naechstes (2 Eintraege)
$aktuelle_niveaus = ['A1', 'A2', 'B1', 'B2'];
if ($aktuelles_niveau === null) {
    // Noch kein Niveau abgeschlossen → nur A1 anzeigen
    $sprachniveau_fortschritt = array_slice($sprachniveau_fortschritt, 0, 1);
} else {
    $idx = array_search($aktuelles_niveau, $aktuelle_niveaus);
    $sprachniveau_fortschritt = array_slice($sprachniveau_fortschritt, $idx, 2);
}

// --- Beherrschungsquote berechnen (geuebt = Stufe >= 1) ---
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

// Level-Konfiguration laden (fuer Frontend-Darstellung)
$lk_daten = level_konfiguration_laden($pdo);
$level_konfiguration_arr = [];
for ($l = 1; $l <= 5; $l++) {
    $level_konfiguration_arr[] = [
        'level'         => $l,
        'name'          => $lk_daten[$l]['name']          ?? '',
        'schwelle'      => $lk_daten[$l]['schwelle']      ?? 0,
        'formen'        => $lk_daten[$l]['formen']        ?? [],
        'sprachniveaus' => $lk_daten[$l]['sprachniveaus'] ?? [],
    ];
}

json_erfolg([
    'uebersicht' => [
        'gesamt' => $gesamt,
        'neu' => $zustaende['neu'],
        'lernen' => $zustaende['lernen'],
        'wiederholung' => $zustaende['wiederholung'],
        'gelernt' => $zustaende['gelernt'],
        'faellig_heute' => $faellig_heute,
        'stufen' => $stufen,
    ],
    'globales_level' => $globales_level,
    'beherrschungsquote' => $beherrschungsquote,
    'sprachniveau_fortschritt' => $sprachniveau_fortschritt,
    'xp' => $xp,
    'streak_tage' => $streak_tage,
    'level_konfiguration' => $level_konfiguration_arr,
]);
