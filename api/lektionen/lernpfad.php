<?php
/**
 * API: Lektionen — Lernpfad
 *
 * GET /api/lektionen/lernpfad.php
 *
 * Gibt die fuer den Lernpfad freigeschalteten Lektionen zurueck.
 * Sichtbarkeitsregeln:
 *   1. Die erste Lektion jeder Kategorie (alphabetisch nach Lektion-Titel) ist immer freigeschaltet.
 *   2. Jede weitere Lektion einer Kategorie wird sequenziell freigeschaltet: Lektion N+1 oeffnet,
 *      sobald Lektion N >= lernpfad_schwelle% der Vokabeln auf Stufe >= 3 (DS-Richtung) erreicht hat.
 *      Schwelle ist in app_konfiguration (Schluessel: lernpfad_schwelle, Default: 50).
 *   3. Lektionen ohne Vokabeln gelten als nicht freigeschaltet (ausser sie sind die erste der Kategorie).
 *
 * Antwort: { lektionen: [{id, titel, kategorie_id, kategorie_name, vokabel_anzahl,
 *                         stufe3_anteil, erste_der_kategorie, freigeschaltet}],
 *            schwelle: <float>, konfiguriert_prozent: <int> }
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/sichtbarkeit.php';

methode_erzwingen('GET');

$benutzer    = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];

$pdo = db_verbindung();

// --- Lernpfad-Schwelle aus Konfiguration laden (Default: 50 = 50%) ---
$stmtKonfig = $pdo->prepare("SELECT wert FROM app_konfiguration WHERE schluessel = 'lernpfad_schwelle'");
$stmtKonfig->execute();
$schwelleWert = $stmtKonfig->fetchColumn();
$schwelle = ($schwelleWert !== false && $schwelleWert !== '')
    ? max(1, min(100, (int) $schwelleWert)) / 100.0
    : 0.5;

// --- Favoriten-Anzahl des Benutzers laden ---
$stmtFav = $pdo->prepare("SELECT COUNT(*) FROM benutzer_favoriten WHERE benutzer_id = ?");
$stmtFav->execute([$benutzer_id]);
$favoritenAnzahl = (int) $stmtFav->fetchColumn();

// --- Aufgegebene Lektionen laden (Hausaufgaben des Users) ---
$aufgegebeneLektionen = [];
try {
    $stmtAufg = $pdo->prepare("
        SELECT
            l.id,
            l.titel,
            l.kategorie_id,
            l.sprachniveau,
            l.beschreibung,
            k.name AS kategorie_name,
            COUNT(lv.vokabel_id) AS vokabel_anzahl
        FROM benutzer_aufgaben ba
        JOIN lektionen l ON l.id = ba.lektion_id
        LEFT JOIN kategorien k ON k.id = l.kategorie_id
        LEFT JOIN lektion_vokabeln lv ON lv.lektion_id = l.id
        WHERE ba.benutzer_id = ? AND l.aktiv = 1
        GROUP BY l.id, l.titel, l.kategorie_id, l.sprachniveau, l.beschreibung, k.name
        ORDER BY ba.erstellt_am ASC
    ");
    $stmtAufg->execute([$benutzer_id]);
    $aufgRows = $stmtAufg->fetchAll(PDO::FETCH_ASSOC);

    foreach ($aufgRows as $row) {
        $aufgegebeneLektionen[] = [
            'id'             => (int) $row['id'],
            'titel'          => $row['titel'],
            'kategorie_id'   => $row['kategorie_id'] ? (int) $row['kategorie_id'] : null,
            'kategorie_name' => $row['kategorie_name'],
            'sprachniveau'   => $row['sprachniveau'],
            'beschreibung'   => $row['beschreibung'],
            'vokabel_anzahl' => (int) $row['vokabel_anzahl'],
        ];
    }
} catch (\Throwable $e) {
    // Tabelle existiert noch nicht (Migration noch nicht ausgefuehrt)
}

// --- Eigene + Gruppen-Lektionen laden (private Lektionen die der User sehen darf) ---
$gruppen_ids = eigene_gruppen_ids($pdo, $benutzer_id);

$eigene_where  = 'l.ist_privat = 1 AND l.aktiv = 1 AND (l.besitzer_id = ?';
$eigene_params = [$benutzer_id];
if (!empty($gruppen_ids)) {
    $ph = implode(',', array_fill(0, count($gruppen_ids), '?'));

    // Bedingung 2: Lektionen, die explizit einer Gruppe zugeordnet sind (gruppen_id gesetzt)
    $eigene_where .= " OR l.gruppen_id IN ({$ph})";
    $eigene_params = array_merge($eigene_params, $gruppen_ids);

    // Bedingung 3: Private Lektionen des Gruppeneigentümers — für Mitglieder sichtbar,
    //              nicht jedoch für den Eigentümer selbst (der sieht sie bereits via Bedingung 1)
    $eigene_where .= " OR (l.besitzer_id != ? AND l.besitzer_id IN (SELECT besitzer_id FROM gruppen WHERE id IN ({$ph})))";
    $eigene_params = array_merge($eigene_params, [$benutzer_id], $gruppen_ids);
}
$eigene_where .= ')';

$stmtPrivat = $pdo->prepare("
    SELECT
        l.id,
        l.titel,
        l.beschreibung,
        l.sprachniveau,
        l.besitzer_id,
        COUNT(lv.vokabel_id) AS vokabel_anzahl
    FROM lektionen l
    LEFT JOIN lektion_vokabeln lv ON lv.lektion_id = l.id
    WHERE {$eigene_where}
    GROUP BY l.id, l.titel, l.beschreibung, l.sprachniveau, l.besitzer_id
    ORDER BY (l.besitzer_id = ?) DESC, l.titel ASC
");
$stmtPrivat->execute(array_merge($eigene_params, [$benutzer_id]));
$eigeneLektionen = $stmtPrivat->fetchAll(PDO::FETCH_ASSOC);

// Fortschritt fuer eigene/Gruppen-Lektionen berechnen (gekonnt_schwelle+, DS-Richtung)
$gekonnt_schwelle = (int) konfig_wert('gekonnt_schwelle', '4');
$eigene_ids = array_map(fn($l) => (int) $l['id'], $eigeneLektionen);
$eigene_fortschritt = []; // lektion_id => stufe4_count
if (!empty($eigene_ids)) {
    $ph = implode(',', array_fill(0, count($eigene_ids), '?'));
    $stmtEF = $pdo->prepare("
        SELECT lv.lektion_id,
               COUNT(DISTINCT CASE WHEN f.stufe >= {$gekonnt_schwelle} AND f.richtung = 'DS' THEN f.vokabel_id END) AS stufe4_count
        FROM lektion_vokabeln lv
        LEFT JOIN fortschritt f ON f.vokabel_id = lv.vokabel_id AND f.benutzer_id = ?
        WHERE lv.lektion_id IN ({$ph})
        GROUP BY lv.lektion_id
    ");
    $stmtEF->execute(array_merge([$benutzer_id], $eigene_ids));
    foreach ($stmtEF->fetchAll() as $row) {
        $eigene_fortschritt[(int) $row['lektion_id']] = (int) $row['stufe4_count'];
    }
}

// Typen normalisieren
$eigeneLektionen = array_map(function ($l) use ($benutzer_id, $eigene_fortschritt) {
    $vokAnz = (int) $l['vokabel_anzahl'];
    $stufe4 = $eigene_fortschritt[(int) $l['id']] ?? 0;
    return [
        'id'             => (int) $l['id'],
        'titel'          => $l['titel'],
        'beschreibung'   => $l['beschreibung'],
        'sprachniveau'   => $l['sprachniveau'],
        'vokabel_anzahl' => $vokAnz,
        'ist_eigene'     => ((int) $l['besitzer_id'] === $benutzer_id),
        'stufe4_anteil'  => $vokAnz > 0 ? round($stufe4 / $vokAnz, 3) : 0.0,
    ];
}, $eigeneLektionen);

// --- Alle aktiven Lektionen mit Kategorie laden (nur oeffentliche, keine privaten) ---
$stmt = $pdo->prepare("
    SELECT
        l.id,
        l.titel,
        l.kategorie_id,
        l.sprachniveau,
        l.beschreibung,
        k.name AS kategorie_name,
        k.eltern_id AS kategorie_eltern_id,
        COUNT(lv.vokabel_id) AS vokabel_anzahl
    FROM lektionen l
    LEFT JOIN kategorien k ON k.id = l.kategorie_id
    LEFT JOIN lektion_vokabeln lv ON lv.lektion_id = l.id
    WHERE l.aktiv = 1
      AND l.ist_privat = 0
      AND l.kategorie_id IS NOT NULL
    GROUP BY l.id, l.titel, l.kategorie_id, l.sprachniveau, l.beschreibung, k.name, k.eltern_id
    ORDER BY k.name ASC, l.titel ASC
");
$stmt->execute();
$lektionen = $stmt->fetchAll(PDO::FETCH_ASSOC);

if (empty($lektionen)) {
    json_erfolg([
        'lektionen'            => [],
        'schwelle'             => $schwelle,
        'konfiguriert_prozent' => (int) round($schwelle * 100),
        'favoriten_anzahl'     => $favoritenAnzahl,
        'eigene_lektionen'     => $eigeneLektionen,
        'aufgegebene_lektionen' => $aufgegebeneLektionen,
    ]);
    return;
}

// --- Erste Lektion je Kategorie bestimmen ---
$ersteLektionJeKategorie = []; // kategorie_id => lektion_id
foreach ($lektionen as $l) {
    $katId = (int) $l['kategorie_id'];
    if (!isset($ersteLektionJeKategorie[$katId])) {
        $ersteLektionJeKategorie[$katId] = (int) $l['id'];
    }
}

// --- Fortschritt fuer alle relevanten Vokabeln laden ---
// Wir laden den Fortschritt des Benutzers fuer ALLE Vokabeln auf einmal (effizienter als N Queries)
$stmt = $pdo->prepare("
    SELECT vokabel_id, stufe
    FROM fortschritt
    WHERE benutzer_id = ?
      AND richtung = 'DS'
");
$stmt->execute([$benutzer_id]);
$fortschritt_rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

// Map: vokabel_id => stufe
$fortschritt_map = [];
foreach ($fortschritt_rows as $row) {
    $fortschritt_map[(int) $row['vokabel_id']] = (int) $row['stufe'];
}

// --- Vokabeln je Lektion laden ---
$stmt = $pdo->prepare("
    SELECT lv.lektion_id, lv.vokabel_id
    FROM lektion_vokabeln lv
    JOIN lektionen l ON l.id = lv.lektion_id
    JOIN vokabeln v ON v.id = lv.vokabel_id
    WHERE l.aktiv = 1
      AND l.ist_privat = 0
      AND v.aktiv = 1
      AND v.ist_privat = 0
");
$stmt->execute();
$zuordnungen = $stmt->fetchAll(PDO::FETCH_ASSOC);

// Map: lektion_id => [vokabel_ids]
$vokabeln_je_lektion = [];
foreach ($zuordnungen as $z) {
    $lektionId  = (int) $z['lektion_id'];
    $vokabelId  = (int) $z['vokabel_id'];
    $vokabeln_je_lektion[$lektionId][] = $vokabelId;
}

// --- Stufe-3-Anteil je Lektion berechnen und sequenzielles Freischalten bestimmen ---
// Regel: Die erste Lektion jeder Kategorie ist immer freigeschaltet.
//        Jede weitere Lektion N+1 wird freigeschaltet, sobald Lektion N >= Schwelle erreicht hat.
// Die Lektionen sind bereits nach k.name ASC, l.titel ASC sortiert, d.h. innerhalb einer
// Kategorie kommen sie in der richtigen Reihenfolge an.
$ergebnis              = [];
$letzter_je_kategorie  = []; // kategorie_id => ['freigeschaltet' => bool, 'stufe3_anteil' => float]

foreach ($lektionen as $l) {
    $lektionId     = (int) $l['id'];
    $katId         = (int) $l['kategorie_id'];
    $vokabelIds    = $vokabeln_je_lektion[$lektionId] ?? [];
    $vokabelAnzahl = count($vokabelIds);

    $stufe3Anteil = 0.0;
    if ($vokabelAnzahl > 0) {
        $stufe3Count = 0;
        foreach ($vokabelIds as $vid) {
            if (($fortschritt_map[$vid] ?? 0) >= 3) {
                $stufe3Count++;
            }
        }
        $stufe3Anteil = $stufe3Count / $vokabelAnzahl;
    }

    $istErste = ($ersteLektionJeKategorie[$katId] ?? null) === $lektionId;
    if ($istErste) {
        $freigeschaltet = true;
    } else {
        // Freigeschaltet, wenn die VORHERIGE Lektion dieser Kategorie die Schwelle erfuellt hat
        $letzter        = $letzter_je_kategorie[$katId] ?? null;
        $freigeschaltet = $letzter !== null
            && $letzter['freigeschaltet']
            && $letzter['stufe3_anteil'] >= $schwelle;
    }

    $ergebnis[] = [
        'id'                  => $lektionId,
        'titel'               => $l['titel'],
        'kategorie_id'        => $katId,
        'kategorie_name'      => $l['kategorie_name'],
        'sprachniveau'        => $l['sprachniveau'],
        'beschreibung'        => $l['beschreibung'],
        'vokabel_anzahl'      => $vokabelAnzahl,
        'stufe3_anteil'       => round($stufe3Anteil, 3),
        'erste_der_kategorie' => $istErste,
        'freigeschaltet'      => $freigeschaltet,
    ];

    // Merken fuer das naechste Kapitel dieser Kategorie
    $letzter_je_kategorie[$katId] = [
        'freigeschaltet' => $freigeschaltet,
        'stufe3_anteil'  => $stufe3Anteil,
    ];
}

json_erfolg([
    'lektionen'             => $ergebnis,
    'schwelle'              => $schwelle,
    'konfiguriert_prozent'  => (int) round($schwelle * 100),
    'favoriten_anzahl'      => $favoritenAnzahl,
    'eigene_lektionen'      => $eigeneLektionen,
    'aufgegebene_lektionen' => $aufgegebeneLektionen,
]);
