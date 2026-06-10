<?php
/**
 * API: Tipp-Sätze — Liste (Admin)
 *
 * GET /api/tipp_saetze/liste.php
 *   ?seite=1&pro_seite=50&suche=...&themenfeld_id=0&sortierung=id&richtung=DESC
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

methode_erzwingen('GET');
$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

[$seite, $pro_seite] = paginierung_parameter();
$suche        = trim(get_param('suche', ''));
$themenfeld_id = get_param_int('themenfeld_id', 0);
$sortierung   = get_param('sortierung', 'id');
$richtung     = strtoupper(get_param('richtung', 'DESC')) === 'ASC' ? 'ASC' : 'DESC';

$pdo = db_verbindung();

$bedingungen = ['ts.aktiv = 1'];
$params      = [];

if ($suche !== '') {
    $bedingungen[] = 'ts.text LIKE ?';
    $params[]      = '%' . $suche . '%';
}

if ($themenfeld_id > 0) {
    $bedingungen[] = 'ts.themenfeld_id = ?';
    $params[]      = $themenfeld_id;
} elseif ($themenfeld_id === -1) {
    $bedingungen[] = 'ts.themenfeld_id IS NULL';
}

$where = 'WHERE ' . implode(' AND ', $bedingungen);

$sort_map = ['id' => 'ts.id', 'text' => 'ts.text', 'erstellt_am' => 'ts.erstellt_am'];
$sort_sql = $sort_map[$sortierung] ?? 'ts.id';

$stmt = $pdo->prepare("SELECT COUNT(*) FROM tipp_saetze ts {$where}");
$stmt->execute($params);
$gesamt = (int) $stmt->fetchColumn();
$paginierung = paginierung_berechnen($seite, $pro_seite, $gesamt);

$stmt = $pdo->prepare("
    SELECT ts.id, ts.text, ts.themenfeld_id, ts.erstellt_am,
           tf.titel AS themenfeld_titel
    FROM tipp_saetze ts
    LEFT JOIN themenfelder tf ON tf.id = ts.themenfeld_id
    {$where}
    ORDER BY {$sort_sql} {$richtung}
    LIMIT ? OFFSET ?
");
$params[] = $paginierung['pro_seite'];
$params[] = $paginierung['offset'];
$stmt->execute($params);
$saetze = $stmt->fetchAll();

foreach ($saetze as &$s) {
    $s['id']           = (int) $s['id'];
    $s['themenfeld_id'] = $s['themenfeld_id'] !== null ? (int) $s['themenfeld_id'] : null;
}
unset($s);

json_paginiert($saetze, $paginierung);
