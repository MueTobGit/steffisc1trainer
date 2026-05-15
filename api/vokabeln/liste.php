<?php
/**
 * API: Vokabeln — Liste
 *
 * GET /api/vokabeln/liste.php
 *
 * Paginierte, filterbare Vokabelliste.
 *
 * Query-Parameter:
 *   - seite (Standard: 1)
 *   - pro_seite (Standard: 20, Max: 100)
 *   - wortart: Nomen, Verb, Adjektiv, ...
 *   - kategorie_id: Filter nach Kategorie
 *   - ohne_kategorie: 1 = nur Vokabeln ohne Kategorie
 *   - themenfeld_id: Filter nach themenfeld
 *   - sprachniveau: A1, A2, B1, B2, C1, C2
 *   - suche: Suchbegriff (min. 2 Zeichen, sucht in englisch+deutsch)
 *   - nur_aktive: 1 (Standard) = nur aktive, 0 = alle
 *   - sortierung: englisch|deutsch|wortart|sprachniveau|erstellt_am|kategorie_name|aktiv (Standard: englisch)
 *   - richtung: ASC|DESC (Standard: ASC)
 *   - auch_private: 1 = Nur Admin; zeigt alle privaten Inhalte aller User
 *   - nur_privat: 1 = Nur Admin; zeigt ausschliesslich private Vokabeln
 *   - besitzer_id: Nur Admin + auch_private; filtert private Vokabeln nach Besitzer-ID
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
$benutzer = benutzer_authentifizieren();

// --- Parameter ---
[$seite, $pro_seite] = paginierung_parameter();

$wortart = get_param('wortart');
$kategorie_id = get_param_int('kategorie_id', 0);
$ohne_kategorie = get_param('ohne_kategorie', '0') === '1'; // true = nur Vokabeln ohne Kategorie
$themenfeld_id   = get_param_int('themenfeld_id', 0);
$ohne_themenfeld = get_param('ohne_themenfeld', '0') === '1';
$sprachniveau = get_param('sprachniveau');
$suche = get_param('suche');
$nur_aktive = get_param('nur_aktive', '1') !== '0';
$sortierung = get_param('sortierung', 'englisch');
$richtung = get_param('richtung', 'ASC');
$auch_private  = get_param('auch_private', '0') === '1' && ist_admin($benutzer);
$nur_privat    = get_param('nur_privat', '0') === '1'; // auch Non-Admin darf eigene private filtern
$filter_besitzer_id = get_param_int('besitzer_id', 0);
// Sonder-Filter: faellig (Wiederholung faellig), neu (noch nicht gelernt), favorit (Favoriten-Liste)
$filter_modus = get_param('filter_modus'); // 'faellig' | 'neu' | 'favorit' | null

$pdo = db_verbindung();
$benutzer_id = (int) $benutzer['id'];

// --- Sichtbarkeits-Bedingung ---
$sichtbarkeit = sichtbarkeits_bedingung($pdo, $benutzer_id, 'v', $auch_private);

// --- Bedingungen aufbauen ---
$bedingungen = [$sichtbarkeit['sql']];
$params = $sichtbarkeit['params'];
$join = '';

if ($nur_aktive) {
    $bedingungen[] = 'v.aktiv = 1';
}

if ($wortart !== null && $wortart !== '') {
    wortart_validieren($wortart);
    $bedingungen[] = 'v.wortart = ?';
    $params[] = $wortart;
}

if ($ohne_kategorie) {
    $bedingungen[] = 'v.kategorie_id IS NULL';
} elseif ($kategorie_id > 0) {
    $bedingungen[] = 'v.kategorie_id = ?';
    $params[] = $kategorie_id;
}

if ($themenfeld_id > 0) {
    $join .= ' JOIN themenfeld_vokabeln lv ON lv.vokabel_id = v.id AND lv.themenfeld_id = ?';
    array_unshift($params, $themenfeld_id); // Vorne einfuegen wegen JOIN
} elseif ($ohne_themenfeld) {
    $bedingungen[] = 'v.id NOT IN (SELECT vokabel_id FROM themenfeld_vokabeln)';
} elseif ($filter_modus === 'faellig') {
    // Nur Vokabeln die in der DS-Richtung faellig sind (konsistent mit Dashboard-Chip).
    // Nur aktive Vokabeln (v.aktiv = 1 bereits in der Hauptquery gesetzt).
    $faellig_voraus = (int) konfig_wert('faellig_voraus_tage', '0');
    $faellig_datum  = $faellig_voraus > 0
        ? 'DATE_ADD(CURDATE(), INTERVAL ' . $faellig_voraus . ' DAY)'
        : 'CURDATE()';
    $join .= ' JOIN (SELECT vokabel_id FROM fortschritt'
           . " WHERE benutzer_id = ? AND richtung = 'DE'"
           . " AND naechste_wiederholung <= {$faellig_datum}) fp ON fp.vokabel_id = v.id";
    array_unshift($params, $benutzer_id);
} elseif ($filter_modus === 'neu') {
    // Nur Vokabeln die noch nie gelernt wurden (kein Eintrag in fortschritt),
    // aus Themenfeldern die der User explizit gestartet hat (benutzer_themenfelder_gestartet).
    // Konsistent mit der Dashboard-Zaehlung in statistik/benutzer.php.
    $join .= ' JOIN themenfeld_vokabeln lv_neu ON lv_neu.vokabel_id = v.id'
           . ' JOIN benutzer_themenfelder_gestartet blg_neu'
           . '   ON blg_neu.themenfeld_id = lv_neu.themenfeld_id AND blg_neu.benutzer_id = ?';
    $params[] = $benutzer_id;
    $bedingungen[] = 'v.id NOT IN (SELECT DISTINCT vokabel_id FROM fortschritt WHERE benutzer_id = ?)';
    $params[] = $benutzer_id;
} elseif ($filter_modus === 'favorit') {
    // Nur Vokabeln die der Benutzer als Favorit markiert hat
    $join .= ' JOIN benutzer_favoriten bf ON bf.vokabel_id = v.id AND bf.benutzer_id = ?';
    array_unshift($params, $benutzer_id);
}

if ($sprachniveau !== null && $sprachniveau !== '') {
    sprachniveau_validieren($sprachniveau);
    $bedingungen[] = 'v.sprachniveau = ?';
    $params[] = $sprachniveau;
}

if ($suche !== null && mb_strlen($suche) >= 2) {
    $bedingungen[] = '(v.englisch LIKE ? OR v.deutsch LIKE ?)';
    $such_param = '%' . $suche . '%';
    $params[] = $such_param;
    $params[] = $such_param;
}

// Filter: nur private Vokabeln (gilt fuer alle User; Non-Admins sehen dank
// sichtbarkeits_bedingung() ohnehin nur eigene private Inhalte)
if ($nur_privat) {
    $bedingungen[] = 'v.ist_privat = 1';
}

// Admin-Filter: Vokabeln nach Besitzer filtern (nur bei auch_private oder nur_privat)
if ($filter_besitzer_id > 0 && ist_admin($benutzer) && ($auch_private || $nur_privat)) {
    $bedingungen[] = 'v.besitzer_id = ?';
    $params[] = $filter_besitzer_id;
}

$where = '';
if (!empty($bedingungen)) {
    $where = 'WHERE ' . implode(' AND ', $bedingungen);
}

// --- Themenfeld-Anzeige ---
// Bei aktivem themenfeld_id-Filter: JOIN auf die gefilterte Lektion.
// Sonst: Subquery liefert den Titel des zuerst zugeordneten Themenfelds.
$themenfeld_join_extra = '';
$themenfeld_select     = "(SELECT tf2.titel FROM themenfeld_vokabeln tv2 JOIN themenfelder tf2 ON tf2.id = tv2.themenfeld_id WHERE tv2.vokabel_id = v.id AND tf2.aktiv = 1 ORDER BY tv2.id ASC LIMIT 1) AS themenfeld_titel";

if ($themenfeld_id > 0) {
    $themenfeld_join_extra = ' LEFT JOIN themenfelder tf_f ON tf_f.id = lv.themenfeld_id';
    $themenfeld_select     = 'tf_f.titel AS themenfeld_titel';
}

// --- Sortierung validieren ---
// Mapping: Parameter-Wert → SQL-Ausdruck
$sortier_map = [
    'englisch'    => 'v.englisch',
    'deutsch'       => 'v.deutsch',
    'wortart'       => 'v.wortart',
    'sprachniveau'  => 'v.sprachniveau',
    'erstellt_am'   => 'v.erstellt_am',
    'kategorie_name' => 'k.name',
    'aktiv'         => 'v.aktiv',
];
if (!isset($sortier_map[$sortierung])) {
    $sortierung = 'englisch';
}
$sortier_sql = $sortier_map[$sortierung];

$richtung = strtoupper($richtung) === 'DESC' ? 'DESC' : 'ASC';

// --- Gesamtanzahl ---
$count_sql = "SELECT COUNT(DISTINCT v.id) FROM vokabeln v {$join} LEFT JOIN kategorien k ON k.id = v.kategorie_id LEFT JOIN benutzer b ON b.id = v.besitzer_id {$where}";
$stmt = $pdo->prepare($count_sql);
$stmt->execute($params);
$gesamt = (int) $stmt->fetchColumn();

$paginierung = paginierung_berechnen($seite, $pro_seite, $gesamt);

// --- Daten laden ---
$sql = "
    SELECT DISTINCT
        v.id,
        v.englisch,
        v.deutsch,
        v.wortart,
        v.sprachniveau,
        v.notizen,
        v.kategorie_id,
        v.aktiv,
        v.erstellt_am,
        v.aktualisiert_am,
        v.ist_privat,
        v.besitzer_id,
        k.name AS kategorie_name,
        b.benutzername AS besitzer_name,
        {$themenfeld_select}
    FROM vokabeln v
    LEFT JOIN benutzer b ON b.id = v.besitzer_id
    {$join}{$themenfeld_join_extra}
    LEFT JOIN kategorien k ON k.id = v.kategorie_id
    {$where}
    ORDER BY v.ist_privat DESC, {$sortier_sql} {$richtung}, v.englisch ASC
    LIMIT ? OFFSET ?
";

$params[] = $paginierung['pro_seite'];
$params[] = $paginierung['offset'];

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$vokabeln = $stmt->fetchAll();

// Typen casten
foreach ($vokabeln as &$v) {
    $v['id']          = (int) $v['id'];
    $v['kategorie_id']= $v['kategorie_id'] !== null ? (int) $v['kategorie_id'] : null;    $v['aktiv']       = (bool) $v['aktiv'];
    $v['ist_privat']  = (bool) $v['ist_privat'];
    $v['besitzer_id'] = $v['besitzer_id'] !== null ? (int) $v['besitzer_id'] : null;}
unset($v);

json_paginiert($vokabeln, $paginierung);


