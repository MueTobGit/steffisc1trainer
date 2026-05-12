<?php
/**
 * API: Saetze — Liste
 *
 * GET /api/saetze/liste.php
 *
 * Paginierte Liste aller Beispielsaetze (oeffentliche + sichtbare private).
 *
 * Query-Parameter:
 *   - seite, pro_seite
 *   - vokabel_id: Filter nach Vokabel
 *   - kategorie_id: Filter nach Kategorie der Vokabel
 *   - lektion_id: Filter nach Lektion der Vokabel
 *   - sprachniveau: Filter
 *   - suche: In schwedisch_satz oder deutsch_satz suchen
 *   - sortierung: vokabel_schwedisch|vokabel_deutsch|sprachniveau|id (Standard: id DESC)
 *   - auch_private: 1 = Nur Admin; zeigt alle privaten Inhalte aller User
 *   - nur_privat: 1 = Nur Admin; zeigt ausschliesslich private Saetze
 *   - besitzer_id: Nur Admin + auch_private; filtert private Saetze nach Besitzer-ID
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

$vokabel_id   = get_param_int('vokabel_id', 0);
$kategorie_id = get_param_int('kategorie_id', 0);
$lektion_id   = get_param_int('lektion_id', 0);
$sprachniveau = get_param('sprachniveau');
$suche        = get_param('suche');
$sortierung   = get_param('sortierung', 'id');
$richtung     = get_param('richtung', 'DESC');
$auch_private       = get_param('auch_private', '0') === '1' && ist_admin($benutzer);
$nur_privat         = get_param('nur_privat', '0') === '1'; // auch Non-Admin darf eigene private filtern
$filter_besitzer_id = get_param_int('besitzer_id', 0);

$pdo = db_verbindung();

// --- Sichtbarkeits-Bedingung ---
$sichtbarkeit = sichtbarkeits_bedingung($pdo, $benutzer_id, 's', $auch_private);

// --- Bedingungen ---
$bedingungen  = ['s.aktiv = 1', $sichtbarkeit['sql']];
$params       = $sichtbarkeit['params'];
$join_lektion = '';

if ($vokabel_id > 0) {
    $bedingungen[] = 's.vokabel_id = ?';
    $params[]      = $vokabel_id;
}

if ($kategorie_id > 0) {
    $bedingungen[] = 'v.kategorie_id = ?';
    $params[]      = $kategorie_id;
}

if ($lektion_id > 0) {
    // Saetze-Vokabeln, die in der Lektion sind
    $join_lektion  = 'JOIN lektion_vokabeln lv ON lv.vokabel_id = s.vokabel_id AND lv.lektion_id = ?';
    array_unshift($params, $lektion_id);
}

if ($sprachniveau !== null && $sprachniveau !== '') {
    sprachniveau_validieren($sprachniveau);
    $bedingungen[] = 's.sprachniveau = ?';
    $params[]      = $sprachniveau;
}

if ($suche !== null && mb_strlen($suche) >= 2) {
    $bedingungen[] = '(s.schwedisch_satz LIKE ? OR s.deutsch_satz LIKE ? OR v.schwedisch LIKE ? OR v.deutsch LIKE ?)';
    $such_param    = '%' . $suche . '%';
    $params[]      = $such_param;
    $params[]      = $such_param;
    $params[]      = $such_param;
    $params[]      = $such_param;
}

// Filter: nur private Saetze (gilt fuer alle User; Non-Admins sehen dank
// sichtbarkeits_bedingung() ohnehin nur eigene private Inhalte)
if ($nur_privat) {
    $bedingungen[] = 's.ist_privat = 1';
}

// Admin-Filter: Saetze nach Besitzer filtern
if ($filter_besitzer_id > 0 && ist_admin($benutzer) && ($auch_private || $nur_privat)) {
    $bedingungen[] = 's.besitzer_id = ?';
    $params[]      = $filter_besitzer_id;
}

$where = 'WHERE ' . implode(' AND ', $bedingungen);

// --- Sortierung ---
$sortier_map = [
    'id'                => 's.id',
    'vokabel_schwedisch' => 'v.schwedisch',
    'vokabel_deutsch'   => 'v.deutsch',
    'sprachniveau'      => 's.sprachniveau',
];
if (!isset($sortier_map[$sortierung])) {
    $sortierung = 'id';
}
$sortier_sql = $sortier_map[$sortierung];
$richtung    = strtoupper($richtung) === 'ASC' ? 'ASC' : 'DESC';

// --- Gesamtanzahl ---
$count_sql = "
    SELECT COUNT(DISTINCT s.id)
    FROM saetze s
    JOIN vokabeln v ON v.id = s.vokabel_id
    {$join_lektion}
    {$where}
";
$stmt = $pdo->prepare($count_sql);
$stmt->execute($params);
$gesamt = (int) $stmt->fetchColumn();

$paginierung = paginierung_berechnen($seite, $pro_seite, $gesamt);

// --- Daten laden ---
$sql = "
    SELECT DISTINCT
        s.id,
        s.vokabel_id,
        s.schwedisch_satz,
        s.deutsch_satz,
        s.benoetigte_form,
        s.sprachniveau,
        s.media_id,
        s.aktiv,
        s.aktualisiert_am,
        s.ist_privat,
        s.besitzer_id,
        s.gruppen_id,
        v.schwedisch AS vokabel_schwedisch,
        v.deutsch    AS vokabel_deutsch,
        v.wortart    AS vokabel_wortart,
        b.benutzername AS besitzer_name
    FROM saetze s
    JOIN vokabeln v ON v.id = s.vokabel_id
    LEFT JOIN benutzer b ON b.id = s.besitzer_id
    {$join_lektion}
    {$where}
    ORDER BY s.ist_privat DESC, {$sortier_sql} {$richtung}
    LIMIT ? OFFSET ?
";

$params[] = $paginierung['pro_seite'];
$params[] = $paginierung['offset'];

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$saetze = $stmt->fetchAll();

foreach ($saetze as &$s) {
    $s['id']         = (int) $s['id'];
    $s['vokabel_id'] = (int) $s['vokabel_id'];
    $s['media_id']   = $s['media_id'] !== null ? (int) $s['media_id'] : null;
    $s['aktiv']      = (bool) $s['aktiv'];
    $s['ist_privat'] = (bool) $s['ist_privat'];
    $s['besitzer_id']= $s['besitzer_id'] !== null ? (int) $s['besitzer_id'] : null;
    $s['gruppen_id'] = $s['gruppen_id'] !== null ? (int) $s['gruppen_id'] : null;
}
unset($s);

json_paginiert($saetze, $paginierung);
