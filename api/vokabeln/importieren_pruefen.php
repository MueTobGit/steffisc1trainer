<?php
/**
 * API: Vokabeln — CSV-Import Analyse (trocken, ohne Schreiben)
 *
 * POST /api/vokabeln/importieren_pruefen.php
 *
 * Parst das CSV und gibt zurueck:
 *   - duplikate: Vokabeln, die bereits in der DB existieren (schwedisch + wortart)
 *   - synonyme:  Vokabeln im CSV, deren deutsche Uebersetzung + Wortart bereits
 *                bei einem anderen schwedischen Wort vorhanden ist
 *   - neu:       Anzahl wirklich neuer Vokabeln
 *
 * Nur Admin. Schreibt NICHTS in die DB.
 *
 * Body (JSON):
 *   - csv_inhalt: String
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

methode_erzwingen('POST');

$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

$daten = json_body_lesen();
if (empty($daten['csv_inhalt'])) {
    fehler_ungueltige_eingabe('Feld "csv_inhalt" ist erforderlich.');
}

$csv_inhalt = $daten['csv_inhalt'];

// BOM entfernen
$csv_inhalt = preg_replace('/^\xEF\xBB\xBF/', '', $csv_inhalt);

$zeilen = preg_split('/\r\n|\n|\r/', $csv_inhalt);
$zeilen = array_filter($zeilen, fn($z) => trim($z) !== '');

if (count($zeilen) < 2) {
    fehler_ungueltige_eingabe('CSV muss mindestens eine Kopfzeile und eine Datenzeile enthalten.');
}

$kopfzeile = str_getcsv(array_shift($zeilen), ';');
$kopfzeile = array_map('trim', $kopfzeile);
$kopfzeile = array_map('mb_strtolower', $kopfzeile);

if (!in_array('typ', $kopfzeile, true)) {
    fehler_ungueltige_eingabe("Pflichtspalte 'typ' fehlt in der CSV-Kopfzeile.");
}

$spalten = array_flip($kopfzeile);

// CSV in V-Gruppen aufteilen (nur V-Zeilen relevant fuer Analyse)
$vokabeln_csv = []; // [{schwedisch, deutsch, wortart, ...}]

foreach ($zeilen as $zeile) {
    $felder = str_getcsv($zeile, ';');
    $zeile_daten = [];
    foreach ($kopfzeile as $i => $name) {
        $zeile_daten[$name] = isset($felder[$i]) ? trim($felder[$i]) : '';
    }

    $typ = strtoupper($zeile_daten['typ'] ?? '');
    if ($typ !== 'V') {
        continue;
    }

    $schwedisch = $zeile_daten['schwedisch'] ?? '';
    $deutsch    = $zeile_daten['deutsch'] ?? '';
    $wortart    = ucfirst(mb_strtolower($zeile_daten['wortart'] ?? ''));

    if ($schwedisch === '' || $deutsch === '' || $wortart === '') {
        continue;
    }

    $vokabeln_csv[] = [
        'schwedisch' => $schwedisch,
        'deutsch'    => $deutsch,
        'wortart'    => $wortart,
    ];
}

if (empty($vokabeln_csv)) {
    json_erfolg([
        'duplikate' => [],
        'synonyme'  => [],
        'neu'       => 0,
    ], 'Keine V-Zeilen gefunden.');
}

$pdo = db_verbindung();

$duplikate = [];
$synonyme  = [];
$neu       = 0;

foreach ($vokabeln_csv as $vok) {
    $schwedisch = $vok['schwedisch'];
    $deutsch    = $vok['deutsch'];
    $wortart    = $vok['wortart'];

    // 1. Duplikat-Check: schwedisch + wortart bereits als OEFFENTLICHE Vokabel vorhanden?
    // (Private Vokabeln einzelner User zählen nicht als Import-Duplikat)
    $stmt = $pdo->prepare(
        'SELECT id, schwedisch, deutsch, wortart FROM vokabeln WHERE schwedisch = ? AND wortart = ? AND ist_privat = 0 LIMIT 1'
    );
    $stmt->execute([$schwedisch, $wortart]);
    $bestehend = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($bestehend !== false) {
        // Schein-Duplikat: gleiche Stammvokabel, aber andere deutsche Bedeutung
        $csv_deutsch_norm = mb_strtolower(trim($deutsch));
        $db_deutsch_norm  = mb_strtolower(trim($bestehend['deutsch']));
        $schein_duplikat  = ($csv_deutsch_norm !== $db_deutsch_norm)
                            && !str_contains($db_deutsch_norm, $csv_deutsch_norm);

        $duplikate[] = [
            'csv_schwedisch'      => $schwedisch,
            'csv_deutsch'         => $deutsch,
            'csv_wortart'         => $wortart,
            'db_id'               => (int) $bestehend['id'],
            'db_schwedisch'       => $bestehend['schwedisch'],
            'db_deutsch'          => $bestehend['deutsch'],
            'schein_duplikat'     => $schein_duplikat,
        ];
        // Kein Synonym-Check noetig — ist schon das gleiche Wort
        continue;
    }

    // 2. Synonym-Check: gleiche deutsche Uebersetzung + gleiche Wortart, anderes schwedisches Wort?
    // (Nur oeffentliche Vokabeln — private zaehlen nicht als Synonym-Kandidaten)
    $stmt = $pdo->prepare(
        'SELECT id, schwedisch, deutsch, wortart FROM vokabeln
         WHERE deutsch = ? AND wortart = ? AND schwedisch != ? AND ist_privat = 0
         LIMIT 5'
    );
    $stmt->execute([$deutsch, $wortart, $schwedisch]);
    $synonym_kandidaten = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (!empty($synonym_kandidaten)) {
        foreach ($synonym_kandidaten as $syn) {
            $synonyme[] = [
                'csv_schwedisch'  => $schwedisch,
                'csv_deutsch'     => $deutsch,
                'csv_wortart'     => $wortart,
                'db_id'           => (int) $syn['id'],
                'db_schwedisch'   => $syn['schwedisch'],
                'db_deutsch'      => $syn['deutsch'],
                'db_wortart'      => $syn['wortart'],
            ];
        }
    } else {
        $neu++;
    }
}

json_erfolg([
    'duplikate' => $duplikate,
    'synonyme'  => $synonyme,
    'neu'       => $neu,
], sprintf(
    'Analyse: %d neu, %d Duplikat(e), %d potenzielle Synonyme.',
    $neu,
    count($duplikate),
    count($synonyme)
));
