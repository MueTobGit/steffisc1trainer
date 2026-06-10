<?php
/**
 * API: Tipp-Sätze — Erstellen (Admin)
 *
 * POST /api/tipp_saetze/erstellen.php
 * Body: { text, themenfeld_id? }
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
pflichtfelder_pruefen($daten, ['text']);
laenge_validieren($daten['text'], 'text', 2, 2000);

$text         = trim($daten['text']);
$themenfeld_id = null;

if (!empty($daten['themenfeld_id'])) {
    $themenfeld_id = positive_ganzzahl_validieren($daten['themenfeld_id'], 'themenfeld_id');
    id_existiert($themenfeld_id, 'themenfelder', 'Themenfeld');
}

$pdo = db_verbindung();

$stmt = $pdo->prepare(
    'INSERT INTO tipp_saetze (text, themenfeld_id, erstellt_von) VALUES (?, ?, ?)'
);
$stmt->execute([$text, $themenfeld_id, (int) $benutzer['id']]);
$id = (int) $pdo->lastInsertId();

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

json_erfolg($satz, 'Satz erstellt.', 201);
