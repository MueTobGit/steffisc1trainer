<?php
/**
 * API: Vokabeln — Suchen
 *
 * GET /api/vokabeln/suchen.php?q=SUCHBEGRIFF
 *
 * Volltextsuche in englisch + deutsch.
 * Min. 2 Zeichen. Max. 20 Ergebnisse (ohne Spezialfilter).
 * Bei ohne_themenfeld / themenfeld_id: bis zu MAX_PRO_SEITE Ergebnisse.
 * Fuer Autocomplete/Schnellsuche + Vokabel-Zuordnung.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

// --- Methode pruefen ---
methode_erzwingen('GET');

// --- Authentifizierung ---
$benutzer = benutzer_authentifizieren();

// --- Suchbegriff ---
$q = get_param('q', '');
$q = trim($q);

// Optionaler Filter: nur Vokabeln ohne Lektionszuordnung
$ohne_themenfeld          = get_param('ohne_themenfeld', '0') === '1';
$ausschluss_themenfeld_id = get_param_int('themenfeld_id', 0); // Vokabeln die NICHT in dieser themenfeld sind

// Mindestlänge nur erzwingen wenn kein Spezialfilter aktiv
$filter_aktiv = $ohne_themenfeld || $ausschluss_themenfeld_id > 0;
if (!$filter_aktiv && mb_strlen($q) < 2) {
    fehler_ungueltige_eingabe('Suchbegriff muss mindestens 2 Zeichen lang sein.');
}

$pdo = db_verbindung();

$bedingungen = ['v.aktiv = 1'];
$sql_params  = [];

// Text-Suche (optional, wenn q vorhanden)
if ($q !== '') {
    $such_param    = '%' . $q . '%';
    $exakt_param   = $q . '%';
    $bedingungen[] = '(v.englisch LIKE ? OR v.deutsch LIKE ?)';
    $sql_params[]  = $such_param;
    $sql_params[]  = $such_param;
} else {
    $exakt_param = '%'; // Fuer ORDER BY Fallback
}

// themenfeld-Filter
if ($ohne_themenfeld) {
    $bedingungen[] = 'NOT EXISTS (SELECT 1 FROM themenfeld_vokabeln lv WHERE lv.vokabel_id = v.id)';
} elseif ($ausschluss_themenfeld_id > 0) {
    $bedingungen[] = 'NOT EXISTS (SELECT 1 FROM themenfeld_vokabeln lv WHERE lv.vokabel_id = v.id AND lv.themenfeld_id = ?)';
    $sql_params[]  = $ausschluss_themenfeld_id;
}

$where = 'WHERE ' . implode(' AND ', $bedingungen);

$order_params = [$exakt_param . '%', $exakt_param . '%'];

$sql = "
    SELECT
        v.id,
        v.englisch,
        v.deutsch,
        v.wortart,
        v.sprachniveau,
        v.kategorie_id,
        k.name AS kategorie_name
    FROM vokabeln v
    LEFT JOIN kategorien k ON k.id = v.kategorie_id
    {$where}
    ORDER BY
        CASE
            WHEN v.englisch LIKE ? THEN 0
            WHEN v.deutsch LIKE ? THEN 1
            ELSE 2
        END,
        v.englisch ASC
    LIMIT " . ($filter_aktiv ? MAX_PRO_SEITE : 20) . "
";

$stmt = $pdo->prepare($sql);
$stmt->execute(array_merge($sql_params, $order_params));
$ergebnisse = $stmt->fetchAll();

foreach ($ergebnisse as &$v) {
    $v['id'] = (int) $v['id'];
    $v['kategorie_id'] = $v['kategorie_id'] !== null ? (int) $v['kategorie_id'] : null;
}
unset($v);

json_erfolg($ergebnisse);

