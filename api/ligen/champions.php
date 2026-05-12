<?php
/**
 * API: Ligen — Champions
 *
 * GET /api/ligen/champions.php?limit=5
 *
 * Gibt die letzten N abgeschlossenen Ligas mit ihren Kronen-Gewinnern zurueck.
 * Jede Liga zeigt die Top 3 (Gold, Silber, Lorbeerkranz).
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

methode_erzwingen('GET');

benutzer_authentifizieren(); // Login erforderlich, kein Admin noetig

$limit = min(20, max(1, get_param_int('limit', 5)));

$pdo = db_verbindung();

// Ligas mit mindestens einer Krone (also bereits abgeschlossen) laden
$stmt = $pdo->prepare("
    SELECT DISTINCT l.id, l.name, l.start_datum, l.end_datum, l.krone_typ,
        (SELECT COUNT(*) FROM liga_teilnehmer lt2 WHERE lt2.liga_id = l.id) AS teilnehmer_anzahl
    FROM ligen l
    INNER JOIN benutzer_kronen bk ON bk.liga_id = l.id
    WHERE l.end_datum < CURDATE()
    ORDER BY l.end_datum DESC
    LIMIT ?
");
$stmt->execute([$limit]);
$ligas = $stmt->fetchAll(\PDO::FETCH_ASSOC);

if (empty($ligas)) {
    json_erfolg(['ligas' => []]);
}

// Alle Kronen-Gewinner in einer einzigen Bulk-Query laden (statt N Queries in Schleife)
$liga_ids       = array_column($ligas, 'id');
$platzhalter    = implode(',', array_fill(0, count($liga_ids), '?'));
$kronen_bulk    = $pdo->prepare("
    SELECT bk.liga_id, bk.rang, bk.punkte, bk.vergeben_am,
           b.benutzername, b.spitzname, b.id AS benutzer_id
    FROM benutzer_kronen bk
    JOIN benutzer b ON b.id = bk.benutzer_id
    WHERE bk.liga_id IN ({$platzhalter})
    ORDER BY bk.liga_id ASC, bk.rang ASC
");
$kronen_bulk->execute($liga_ids);

// Kronen nach liga_id indizieren
$kronen_map = [];
foreach ($kronen_bulk->fetchAll(\PDO::FETCH_ASSOC) as $k) {
    $kronen_map[(int) $k['liga_id']][] = $k;
}

$ergebnis = [];
foreach ($ligas as $liga) {
    $liga_id = (int) $liga['id'];
    $kronen  = $kronen_map[$liga_id] ?? [];

    $ergebnis[] = [
        'liga_id'           => $liga_id,
        'liga_name'         => $liga['name'],
        'start_datum'       => $liga['start_datum'],
        'end_datum'         => $liga['end_datum'],
        'krone_typ'         => $liga['krone_typ'] ?? 'standard',
        'teilnehmer_anzahl' => (int) $liga['teilnehmer_anzahl'],
        'gewinner'          => array_map(static function (array $k): array {
            return [
                'rang'        => (int) $k['rang'],
                'punkte'      => (int) $k['punkte'],
                'vergeben_am' => $k['vergeben_am'],
                'benutzername'=> $k['benutzername'],
                'spitzname'   => $k['spitzname'],
                'benutzer_id' => (int) $k['benutzer_id'],
            ];
        }, $kronen),
    ];
}

json_erfolg(['ligas' => $ergebnis]);
