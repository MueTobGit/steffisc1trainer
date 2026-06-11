<?php
/**
 * API: Tipp-Sätze — Aktualisieren (Admin)
 *
 * PUT /api/tipp_saetze/aktualisieren.php?id=X
 * Body: { text?, themenfeld_id? }
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

methode_erzwingen('PUT');
$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

$id = get_param_int('id');
if ($id < 1) fehler_ungueltige_eingabe('ID ist erforderlich.');
id_existiert($id, 'tipp_saetze', 'Satz');

$daten  = json_body_lesen();
$felder = [];
$params = [];

if (isset($daten['text'])) {
    laenge_validieren($daten['text'], 'text', 2, 4000);
    $felder[] = 'text = ?';
    $params[] = trim($daten['text']);
}

if (array_key_exists('themenfeld_id', $daten)) {
    if ($daten['themenfeld_id'] === null || $daten['themenfeld_id'] === '') {
        $felder[] = 'themenfeld_id = NULL';
    } else {
        $tid = positive_ganzzahl_validieren($daten['themenfeld_id'], 'themenfeld_id');
        id_existiert($tid, 'themenfelder', 'Themenfeld');
        $felder[] = 'themenfeld_id = ?';
        $params[] = $tid;
    }
}

if (empty($felder)) fehler_ungueltige_eingabe('Keine Felder angegeben.');

$params[] = $id;
$pdo = db_verbindung();
$pdo->prepare('UPDATE tipp_saetze SET ' . implode(', ', $felder) . ' WHERE id = ?')
    ->execute($params);

$stmt = $pdo->prepare(
    'SELECT ts.*, tf.titel AS themenfeld_titel
     FROM tipp_saetze ts
     LEFT JOIN themenfelder tf ON tf.id = ts.themenfeld_id
     WHERE ts.id = ?'
);
$stmt->execute([$id]);
$satz = $stmt->fetch();
$satz['id']           = (int) $satz['id'];
$satz['themenfeld_id'] = $satz['themenfeld_id'] !== null ? (int) $satz['themenfeld_id'] : null;
$satz['aktiv']        = (bool) $satz['aktiv'];

json_erfolg($satz, 'Satz aktualisiert.');
