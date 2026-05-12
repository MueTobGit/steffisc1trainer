<?php
/**
 * API: Lektionen — Liste
 *
 * GET /api/lektionen/liste.php
 *
 * Paginierte Liste aller Lektionen (oeffentliche + sichtbare private).
 * Private Lektionen erscheinen zuerst.
 *
 * Query-Parameter:
 *   - seite, pro_seite
 *   - kategorie_id: Filter nach Kategorie
 *   - nur_aktive: 1 (Standard) = nur aktive
 *   - auch_private: 1 = Nur Admin; zeigt alle privaten Inhalte aller User
 *   - nur_privat: 1 = nur private Lektionen des eigenen Benutzers
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';
require_once dirname(__DIR__) . '/_middleware/sichtbarkeit.php';

// --- Methode pruefen ---
methode_erzwingen('GET');

// --- Authentifizierung ---
$benutzer    = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];

// --- Parameter ---
[$seite, $pro_seite] = paginierung_parameter();

$kategorie_id = get_param_int('kategorie_id', 0);
$nur_aktive   = get_param('nur_aktive', '1') !== '0';
$auch_private = get_param('auch_private', '0') === '1' && ist_admin($benutzer);
$nur_privat   = get_param('nur_privat', '0') === '1';

$pdo = db_verbindung();

// --- Sichtbarkeits-Bedingung ---
$sichtbarkeit = sichtbarkeits_bedingung($pdo, $benutzer_id, 'l', $auch_private);

// --- Bedingungen ---
$bedingungen = [$sichtbarkeit['sql']];
$params      = $sichtbarkeit['params'];

if ($nur_aktive) {
    $bedingungen[] = 'l.aktiv = 1';
}

if ($kategorie_id > 0) {
    $bedingungen[] = 'l.kategorie_id = ?';
    $params[]      = $kategorie_id;
}

if ($nur_privat) {
    $bedingungen[] = 'l.ist_privat = 1';
}

$where = 'WHERE ' . implode(' AND ', $bedingungen);

// --- Gesamtanzahl ---
$count_sql = "SELECT COUNT(*) FROM themenfelder l LEFT JOIN benutzer b ON b.id = l.besitzer_id {$where}";
$stmt = $pdo->prepare($count_sql);
$stmt->execute($params);
$gesamt = (int) $stmt->fetchColumn();

$paginierung = paginierung_berechnen($seite, $pro_seite, $gesamt);

// --- Daten laden ---
$sql = "
    SELECT
        l.id,
        l.titel,
        l.beschreibung,
        l.kategorie_id,
        l.reihenfolge,
        l.sprachniveau,
        l.aktiv,
        l.erstellt_am,
        l.ist_privat,
        l.besitzer_id,
        k.name AS kategorie_name,
        b.benutzername AS besitzer_name,
        COUNT(DISTINCT lv.vokabel_id) AS vokabel_anzahl
    FROM themenfelder l
    LEFT JOIN kategorien k ON k.id = l.kategorie_id
    LEFT JOIN themenfeld_vokabeln lv ON lv.themenfeld_id = l.id
    LEFT JOIN benutzer b ON b.id = l.besitzer_id
    {$where}
    GROUP BY l.id
    ORDER BY l.ist_privat DESC, l.reihenfolge ASC, l.titel ASC
    LIMIT ? OFFSET ?
";

$params[] = $paginierung['pro_seite'];
$params[] = $paginierung['offset'];

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$lektionen = $stmt->fetchAll();

// --- Fortschritt pro Lektion laden (Stufe 4+, DS-Richtung) ---
$themenfeld_ids_geladen = array_map(fn($l) => (int) $l['id'], $lektionen);
$fortschritt_map = []; // lektion_id => ['stufe4_count' => int]
$gekonnt_schwelle = (int) konfig_wert('gekonnt_schwelle', '4');

if (!empty($themenfeld_ids_geladen)) {
    $ph = implode(',', array_fill(0, count($themenfeld_ids_geladen), '?'));
    $stmt_fort = $pdo->prepare("
        SELECT lv.themenfeld_id,
               COUNT(DISTINCT CASE WHEN f.stufe >= {$gekonnt_schwelle} AND f.richtung = 'DE' THEN f.vokabel_id END) AS stufe4_count
        FROM themenfeld_vokabeln lv
        LEFT JOIN fortschritt f ON f.vokabel_id = lv.vokabel_id AND f.benutzer_id = ?
        WHERE lv.themenfeld_id IN ({$ph})
        GROUP BY lv.themenfeld_id
    ");
    $stmt_fort->execute(array_merge([$benutzer_id], $themenfeld_ids_geladen));
    foreach ($stmt_fort->fetchAll() as $row) {
        $fortschritt_map[(int) $row['themenfeld_id']] = (int) $row['stufe4_count'];
    }
}

foreach ($lektionen as &$l) {
    $l['id']           = (int) $l['id'];
    $l['kategorie_id'] = $l['kategorie_id'] !== null ? (int) $l['kategorie_id'] : null;
    $l['reihenfolge']  = (int) $l['reihenfolge'];
    $l['aktiv']        = (bool) $l['aktiv'];
    $l['vokabel_anzahl'] = (int) $l['vokabel_anzahl'];
    $l['ist_privat']   = (bool) $l['ist_privat'];
    $l['besitzer_id']  = $l['besitzer_id'] !== null ? (int) $l['besitzer_id'] : null;
    $l['gruppen_id']   = null;

    // Fortschritt: Anteil Stufe 4+ (0.0 – 1.0)
    $vok_anz = $l['vokabel_anzahl'];
    $stufe4  = $fortschritt_map[$l['id']] ?? 0;
    $l['stufe4_anteil'] = $vok_anz > 0 ? round($stufe4 / $vok_anz, 3) : 0.0;
}
unset($l);

json_paginiert($lektionen, $paginierung);
