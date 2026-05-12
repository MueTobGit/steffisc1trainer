<?php
/**
 * API: Themenfelder — Vokabeln zuordnen (m:n, additiv)
 *
 * POST /api/themenfelder/vokabeln_zuordnen.php?id=X
 *
 * Body:
 *   - hinzufuegen: Array von Vokabel-IDs
 *   - entfernen:   Array von Vokabel-IDs
 *
 * Oder (Kompatibilitäts-Modus): vokabel_ids → Replace-Strategie
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

methode_erzwingen('POST');

$benutzer    = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];
$ist_admin   = ist_admin($benutzer);

$id = get_param_int('id');
if ($id < 1) {
    fehler_ungueltige_eingabe('Themenfeld-ID ist erforderlich.');
}

$pdo = db_verbindung();

$stmt_tf = $pdo->prepare('SELECT id, ist_privat, besitzer_id FROM themenfelder WHERE id = ? AND aktiv = 1');
$stmt_tf->execute([$id]);
$themenfeld_meta = $stmt_tf->fetch();
if (!$themenfeld_meta) {
    fehler_nicht_gefunden('Themenfeld nicht gefunden.');
}

if (!$ist_admin) {
    if (!(bool) $themenfeld_meta['ist_privat'] || (int) $themenfeld_meta['besitzer_id'] !== $benutzer_id) {
        fehler_verboten('Keine Berechtigung zum Zuordnen von Vokabeln zu diesem Themenfeld.');
    }
}

$daten = json_body_lesen();

// Kompatibilitäts-Modus: vokabel_ids → Replace-Strategie
$replace_modus = isset($daten['vokabel_ids']) && is_array($daten['vokabel_ids']);
if ($replace_modus) {
    $daten['hinzufuegen'] = $daten['vokabel_ids'];
}

$ids_hinzufuegen = array_values(array_unique(array_filter(
    array_map('intval', (array) ($daten['hinzufuegen'] ?? [])),
    fn($v) => $v > 0
)));
$ids_entfernen = array_values(array_unique(array_filter(
    array_map('intval', (array) ($daten['entfernen'] ?? [])),
    fn($v) => $v > 0
)));

$pdo->beginTransaction();
try {
    if ($replace_modus) {
        $pdo->prepare('DELETE FROM themenfeld_vokabeln WHERE themenfeld_id = ?')->execute([$id]);
    }

    foreach ($ids_entfernen as $vid) {
        $pdo->prepare('DELETE FROM themenfeld_vokabeln WHERE themenfeld_id = ? AND vokabel_id = ?')
            ->execute([$id, $vid]);
    }

    $hinzugefuegt = 0;
    foreach ($ids_hinzufuegen as $vid) {
        if ($ist_admin) {
            $check = $pdo->prepare('SELECT id FROM vokabeln WHERE id = ? AND aktiv = 1');
            $check->execute([$vid]);
        } else {
            $check = $pdo->prepare('SELECT id FROM vokabeln WHERE id = ? AND aktiv = 1 AND besitzer_id = ?');
            $check->execute([$vid, $benutzer_id]);
        }
        if ($check->fetchColumn()) {
            $pdo->prepare('INSERT IGNORE INTO themenfeld_vokabeln (themenfeld_id, vokabel_id) VALUES (?, ?)')
                ->execute([$id, $vid]);
            $hinzugefuegt++;
        }
    }

    $pdo->commit();

    json_erfolg([
        'themenfeld_id' => $id,
        'hinzugefuegt'  => $hinzugefuegt,
        'entfernt'      => count($ids_entfernen),
    ], 'Vokabeln-Zuordnung aktualisiert.');

} catch (PDOException $e) {
    $pdo->rollBack();
    fehler_server('Zuordnung konnte nicht gespeichert werden.');
}
