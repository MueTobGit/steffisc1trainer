<?php
/**
 * API: Lektionen — Details
 *
 * GET /api/lektionen/details.php?id=X
 *
 * Lektion mit zugeordneten Vokabeln laden.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

// --- Methode pruefen ---
methode_erzwingen('GET');

// --- Authentifizierung ---
$benutzer = benutzer_authentifizieren();

// --- ID ermitteln ---
$id = get_param_int('id');
if ($id < 1) {
    fehler_ungueltige_eingabe('Lektion-ID ist erforderlich.');
}

$pdo = db_verbindung();

// --- Lektion laden ---
$stmt = $pdo->prepare("
    SELECT
        l.*,
        k.name AS kategorie_name
    FROM lektionen l
    LEFT JOIN kategorien k ON k.id = l.kategorie_id
    WHERE l.id = ?
");
$stmt->execute([$id]);
$lektion = $stmt->fetch();

if (!$lektion) {
    fehler_nicht_gefunden('Lektion nicht gefunden.');
}

$lektion['id'] = (int) $lektion['id'];
$lektion['kategorie_id'] = $lektion['kategorie_id'] !== null ? (int) $lektion['kategorie_id'] : null;
$lektion['reihenfolge'] = (int) $lektion['reihenfolge'];
$lektion['erstellt_von'] = $lektion['erstellt_von'] !== null ? (int) $lektion['erstellt_von'] : null;
$lektion['aktiv'] = (bool) $lektion['aktiv'];

// --- Zugeordnete Vokabeln laden (inkl. Satz-Anzahl pro Vokabel) ---
$stmt = $pdo->prepare("
    SELECT
        v.id,
        v.schwedisch,
        v.deutsch,
        v.wortart,
        v.genus,
        v.verbgruppe,
        v.sprachniveau,
        lv.reihenfolge,
        COUNT(DISTINCT s.id) AS satz_anzahl
    FROM lektion_vokabeln lv
    JOIN vokabeln v ON v.id = lv.vokabel_id
    LEFT JOIN saetze s ON s.vokabel_id = v.id AND s.aktiv = 1
    WHERE lv.lektion_id = ? AND v.aktiv = 1
    GROUP BY v.id, lv.reihenfolge
    ORDER BY lv.reihenfolge ASC, v.schwedisch ASC
");
$stmt->execute([$id]);
$vokabeln = $stmt->fetchAll();

foreach ($vokabeln as &$v) {
    $v['id']          = (int) $v['id'];
    $v['reihenfolge'] = (int) $v['reihenfolge'];
    $v['satz_anzahl'] = (int) $v['satz_anzahl'];
}
unset($v);

// --- Optional: Formen batch-laden (fuer Lernmodus) ---
$mit_formen = get_param('mit_formen', '0') === '1';

if ($mit_formen && !empty($vokabeln)) {
    $vokabel_ids = array_column($vokabeln, 'id');
    $placeholders = implode(',', array_fill(0, count($vokabel_ids), '?'));

    $stmt = $pdo->prepare("
        SELECT vokabel_id, form_bezeichnung, form_wert, reihenfolge
        FROM vokabel_formen
        WHERE vokabel_id IN ({$placeholders})
        ORDER BY reihenfolge ASC, id ASC
    ");
    $stmt->execute($vokabel_ids);
    $alle_formen = $stmt->fetchAll();

    // Nach vokabel_id gruppieren
    $formen_map = [];
    foreach ($alle_formen as $f) {
        $vid = (int) $f['vokabel_id'];
        if (!isset($formen_map[$vid])) {
            $formen_map[$vid] = [];
        }
        $formen_map[$vid][] = [
            'form_bezeichnung' => $f['form_bezeichnung'],
            'form_wert'        => $f['form_wert'],
            'reihenfolge'      => (int) $f['reihenfolge'],
        ];
    }

    // Formen an Vokabeln anhaengen
    foreach ($vokabeln as &$v) {
        $v['formen'] = $formen_map[$v['id']] ?? [];
    }
    unset($v);
}

$lektion['vokabeln'] = $vokabeln;
$lektion['vokabel_anzahl'] = count($vokabeln);

json_erfolg($lektion);
