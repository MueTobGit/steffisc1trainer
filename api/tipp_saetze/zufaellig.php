<?php
/**
 * API: Tipp-Sätze — Zufälliger Satz für Nachtippen-Übung
 *
 * GET /api/tipp_saetze/zufaellig.php
 *   ?themenfeld_ids=1,2,3   (leer = alle Themenfelder)
 *   &include_ohne=1          (1 = Sätze ohne Themenfeld immer dabei, Standard: 1)
 *   &exclude_id=42           (zuletzt angezeigten Satz ausschließen)
 *
 * Pool-Logik:
 *   - themenfeld_ids leer   → alle aktiven Sätze
 *   - themenfeld_ids gesetzt → Sätze dieser Themenfelder + (wenn include_ohne=1) unzugeordnete
 *   - Sätze ohne Themenfeld  → immer im Pool wenn include_ohne=1
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

methode_erzwingen('GET');
benutzer_authentifizieren(); // Jeder angemeldete User darf üben

$tf_ids       = array_values(array_filter(
    array_map('intval', explode(',', $_GET['themenfeld_ids'] ?? '')),
    fn($x) => $x > 0
));
$include_ohne = ($_GET['include_ohne'] ?? '1') !== '0';
$exclude_id   = (int) ($_GET['exclude_id'] ?? 0);

$pdo = db_verbindung();

$bedingungen = ['ts.aktiv = 1'];
$params      = [];

if (!empty($tf_ids)) {
    $platzhalter = implode(',', array_fill(0, count($tf_ids), '?'));
    if ($include_ohne) {
        $bedingungen[] = "(ts.themenfeld_id IN ({$platzhalter}) OR ts.themenfeld_id IS NULL)";
    } else {
        $bedingungen[] = "ts.themenfeld_id IN ({$platzhalter})";
    }
    foreach ($tf_ids as $tid) $params[] = $tid;
} elseif (!$include_ohne) {
    // Kein TF-Filter, aber unzugeordnete ausschließen
    $bedingungen[] = 'ts.themenfeld_id IS NOT NULL';
}
// Sonst: alle aktiven Sätze

if ($exclude_id > 0) {
    $bedingungen[] = 'ts.id != ?';
    $params[]      = $exclude_id;
}

$where = 'WHERE ' . implode(' AND ', $bedingungen);

// Gesamtanzahl für Info-Zwecke
$stmt = $pdo->prepare("SELECT COUNT(*) FROM tipp_saetze ts {$where}");
$stmt->execute($params);
$pool_groesse = (int) $stmt->fetchColumn();

if ($pool_groesse === 0) {
    // Falls exclude_id den einzigen Satz ausschließt: nochmal ohne exclude
    if ($exclude_id > 0) {
        $bedingungen_ohne_ex = array_filter($bedingungen, fn($b) => !str_contains($b, 'ts.id !='));
        $params_ohne_ex      = array_slice($params, 0, count($params) - 1);
        $where_ohne_ex       = 'WHERE ' . implode(' AND ', $bedingungen_ohne_ex);
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM tipp_saetze ts {$where_ohne_ex}");
        $stmt->execute($params_ohne_ex);
        if ((int) $stmt->fetchColumn() > 0) {
            $where  = $where_ohne_ex;
            $params = $params_ohne_ex;
        } else {
            fehler_nicht_gefunden('Keine Sätze für diese Auswahl vorhanden.');
        }
    } else {
        fehler_nicht_gefunden('Keine Sätze für diese Auswahl vorhanden.');
    }
}

$stmt = $pdo->prepare("
    SELECT ts.id, ts.text, ts.themenfeld_id, tf.titel AS themenfeld_titel
    FROM tipp_saetze ts
    LEFT JOIN themenfelder tf ON tf.id = ts.themenfeld_id
    {$where}
    ORDER BY RAND()
    LIMIT 1
");
$stmt->execute($params);
$satz = $stmt->fetch();

if (!$satz) {
    fehler_nicht_gefunden('Kein Satz gefunden.');
}

$satz['id']           = (int) $satz['id'];
$satz['themenfeld_id'] = $satz['themenfeld_id'] !== null ? (int) $satz['themenfeld_id'] : null;

json_erfolg([
    'satz'          => $satz,
    'pool_groesse'  => $pool_groesse,
]);
