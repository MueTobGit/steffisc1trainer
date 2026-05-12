<?php
/**
 * API: Grammatik — Liste
 *
 * GET /api/grammatik/liste.php
 *
 * Gibt alle Grammatikregeln zurück, sortiert nach reihenfolge.
 * Jede Regel enthält ein `formen`-Array mit den zugehörigen form_bezeichnung-Werten.
 *
 * Query-Parameter (optional):
 *   - wortart: 'Nomen' | 'Verb' | 'Adjektiv'
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

methode_erzwingen('GET');

$benutzer = benutzer_authentifizieren();

$wortart = get_param('wortart');

$pdo = db_verbindung();

$bedingungen = [];
$params      = [];

if ($wortart !== null && $wortart !== '') {
    $bedingungen[] = 'gr.wortart = ?';
    $params[]      = $wortart;
}

$where = $bedingungen ? ('WHERE ' . implode(' AND ', $bedingungen)) : '';

$stmt = $pdo->prepare("
    SELECT gr.id, gr.wortart, gr.genus_gruppe, gr.regel, gr.regeltext, gr.reihenfolge,
           gr.erstellt_am, gr.aktualisiert_am
    FROM grammatik_regeln gr
    {$where}
    ORDER BY gr.reihenfolge ASC
");
$stmt->execute($params);
$regeln = $stmt->fetchAll(PDO::FETCH_ASSOC);

if ($regeln) {
    // Alle formen auf einmal laden
    $ids      = array_column($regeln, 'id');
    $platzh   = implode(',', array_fill(0, count($ids), '?'));
    $f_stmt   = $pdo->prepare("
        SELECT regel_id, form_bezeichnung
        FROM grammatik_regel_formen
        WHERE regel_id IN ({$platzh})
        ORDER BY form_bezeichnung ASC
    ");
    $f_stmt->execute($ids);
    $formen_map = [];
    foreach ($f_stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $formen_map[(int) $row['regel_id']][] = $row['form_bezeichnung'];
    }

    foreach ($regeln as &$r) {
        $r['id']          = (int) $r['id'];
        $r['reihenfolge'] = (int) $r['reihenfolge'];
        $r['formen']      = $formen_map[$r['id']] ?? [];
    }
    unset($r);
}

json_erfolg(['regeln' => $regeln, 'gesamt' => count($regeln)]);
