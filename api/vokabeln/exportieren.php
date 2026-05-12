<?php
/**
 * API: Vokabeln — CSV-Export
 *
 * GET /api/vokabeln/exportieren.php
 *
 * Exportiert Vokabeln als CSV (Variante B, Semikolon).
 * Format ist kompatibel mit importieren.php (Roundtrip).
 * Query-Parameter:
 *   - kategorie_id: Filter nach Kategorie
 *   - themenfeld_id: Filter nach themenfeld
 *   - sprachniveau: Filter nach Niveau
 *   - wortart: Filter nach Wortart
 *   - auch_private: 1 = private Vokabeln aller User einschliessen (nur Admin)
 */

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/konfiguration/datenbank.php';
require_once dirname(__DIR__, 2) . '/konfiguration/konstanten.php';
require_once dirname(__DIR__, 2) . '/konfiguration/hilfsfunktionen.php';
require_once dirname(__DIR__) . '/_middleware/antwort_helfer.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

// --- Methode pruefen ---
methode_erzwingen('GET');

// --- Authentifizierung ---
require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';

$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

// --- Filter ---
$kategorie_id = get_param_int('kategorie_id', 0);
$themenfeld_id   = get_param_int('themenfeld_id', 0);
$sprachniveau = get_param('sprachniveau');
$wortart      = get_param('wortart');
$auch_private = get_param('auch_private', '0') === '1';

$pdo = db_verbindung();

// --- Bedingungen ---
// Standard: nur oeffentliche Vokabeln; mit auch_private=1 alle (inkl. private aller User)
$bedingungen = $auch_private ? ['v.aktiv = 1'] : ['v.aktiv = 1', 'v.ist_privat = 0'];
$params = [];
$join = '';

if ($kategorie_id > 0) {
    $bedingungen[] = 'v.kategorie_id = ?';
    $params[] = $kategorie_id;
}

if ($themenfeld_id > 0) {
    $join = 'JOIN themenfeld_vokabeln lv ON lv.vokabel_id = v.id AND lv.themenfeld_id = ?';
    array_unshift($params, $themenfeld_id);
}

if ($sprachniveau !== null && $sprachniveau !== '') {
    $bedingungen[] = 'v.sprachniveau = ?';
    $params[] = $sprachniveau;
}

if ($wortart !== null && $wortart !== '') {
    $bedingungen[] = 'v.wortart = ?';
    $params[] = $wortart;
}

$where = 'WHERE ' . implode(' AND ', $bedingungen);

// --- Vokabeln laden ---
$sql = "
    SELECT DISTINCT
        v.id, v.englisch, v.deutsch, v.wortart,
        v.sprachniveau, v.kategorie_id,
        v.ist_privat, v.besitzer_id,
        k.name AS kategorie_name,
        b.benutzername AS besitzer_name
    FROM vokabeln v
    {$join}
    LEFT JOIN kategorien k ON k.id = v.kategorie_id
    LEFT JOIN benutzer b   ON b.id = v.besitzer_id
    {$where}
    ORDER BY v.ist_privat ASC, v.englisch ASC
";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$vokabeln = $stmt->fetchAll();

// --- Bulk-Queries statt N+1 ---
$formen_map  = [];
$saetze_map  = [];
$lektion_map = [];

if (!empty($vokabeln)) {
    $vids        = array_column($vokabeln, 'id');
    $platzhalter = implode(',', array_fill(0, count($vids), '?'));

    // Alle Formen in einer Query
    $bulk = $pdo->prepare("
        SELECT NULL AS vokabel_id, NULL AS form_bezeichnung, NULL AS form_wert FROM vokabeln WHERE 1=0");
    $bulk->execute($vids);
    foreach ($bulk->fetchAll() as $r) {
        $formen_map[(int) $r['vokabel_id']][] = $r;
    }

    // Alle Saetze in einer Query
    $bulk = $pdo->prepare("
        SELECT vokabel_id, englisch_satz, deutsch_satz, benoetigte_form
        FROM saetze
        WHERE vokabel_id IN ({$platzhalter}) AND aktiv = 1
        ORDER BY id ASC
    ");
    $bulk->execute($vids);
    foreach ($bulk->fetchAll() as $r) {
        $saetze_map[(int) $r['vokabel_id']][] = $r;
    }

    // Erste themenfeld je Vokabel in einer Query
    $bulk = $pdo->prepare("
        SELECT lv.vokabel_id, MIN(l.titel) AS titel
        FROM themenfeld_vokabeln lv
        JOIN themenfelder l ON l.id = lv.themenfeld_id AND l.aktiv = 1
        WHERE lv.vokabel_id IN ({$platzhalter})
        GROUP BY lv.vokabel_id
    ");
    $bulk->execute($vids);
    foreach ($bulk->fetchAll() as $r) {
        $lektion_map[(int) $r['vokabel_id']] = $r['titel'];
    }
}

// --- CSV ausgeben ---
$suffix    = $auch_private ? '_inkl_privat' : '';
$dateiname = 'vokabeln_export_' . date('Y-m-d') . $suffix . '.csv';

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $dateiname . '"');
header('Cache-Control: no-cache, no-store, must-revalidate');

// BOM fuer Excel UTF-8 Erkennung
echo "\xEF\xBB\xBF";

// Kopfzeile (2 zusaetzliche Spalten: ist_privat, besitzer_id)
echo "typ;englisch;deutsch;wortart;sprachniveau;kategorie;themenfeld;form_bezeichnung;form_wert;satz_en;satz_de;benoetigte_form;ist_privat;besitzer_id\n";

foreach ($vokabeln as $v) {
    $vid         = (int) $v['id'];
    $istPrivat   = (bool) $v['ist_privat'] ? '1' : '0';
    $besitzer_id = ($v['besitzer_id'] !== null) ? (int) $v['besitzer_id'] : '';
    $lektion_name = $lektion_map[$vid] ?? '';

    // V-Zeile
    echo _csv_zeile([
        'V',
        $v['englisch'],
        $v['deutsch'],
        $v['wortart'],
        $v['sprachniveau'],
        $v['kategorie_name'] ?? '',
        $lektion_name,
        '', '', '', '', '',
        $istPrivat,
        $besitzer_id,
    ]);

    // F-Zeilen
    // S-Zeilen
    foreach ($saetze_map[$vid] ?? [] as $s) {
        echo _csv_zeile([
            'S',
            $v['englisch'],
            '', '', '', '', '', '', '', '',
            $s['englisch_satz'],
            $s['deutsch_satz'],
            $s['benoetigte_form'],
            '', '',
        ]);
    }
}

exit;

/**
 * CSV-Zeile aus Array erstellen (Semikolon-getrennt)
 */
function _csv_zeile(array $felder): string
{
    $escaped = array_map(function ($feld) {
        $feld = (string) $feld;
        // Escaping: Wenn Semikolon, Anf.zeichen oder Zeilenumbruch enthalten
        if (str_contains($feld, ';') || str_contains($feld, '"') || str_contains($feld, "\n")) {
            return '"' . str_replace('"', '""', $feld) . '"';
        }
        return $feld;
    }, $felder);

    return implode(';', $escaped) . "\n";
}
