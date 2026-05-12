<?php
/**
 * API: Kategorien — Liste
 *
 * GET /api/kategorien/liste.php
 *
 * Liefert hierarchische Liste aller Kategorien
 * (Lehrwerke → Kapitel). Inkl. Vokabel-Anzahl pro Kategorie.
 *
 * Query-Parameter:
 *   - eltern_id: nur Unterkategorien dieses Elternteils (optional)
 *   - nur_aktive: 1 (Standard) = nur aktive, 0 = alle
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

// --- Methode pruefen ---
methode_erzwingen('GET');

// --- Authentifizierung ---
$benutzer = benutzer_authentifizieren();

// --- Parameter ---
$eltern_id = get_param('eltern_id');
$nur_aktive = get_param('nur_aktive', '1') !== '0';

$pdo = db_verbindung();

// --- Basis-Query ---
$bedingungen = [];
$params = [];

if ($nur_aktive) {
    $bedingungen[] = 'k.aktiv = 1';
}

if ($eltern_id !== null) {
    if ($eltern_id === '0' || $eltern_id === 'null') {
        // Nur Oberkategorien (Lehrwerke)
        $bedingungen[] = 'k.eltern_id IS NULL';
    } else {
        $bedingungen[] = 'k.eltern_id = ?';
        $params[] = (int) $eltern_id;
    }
}

$where = '';
if (!empty($bedingungen)) {
    $where = 'WHERE ' . implode(' AND ', $bedingungen);
}

// Kategorien mit Vokabel-Anzahl laden
$sql = "
    SELECT
        k.id,
        k.name,
        k.beschreibung,
        k.eltern_id,
        k.reihenfolge,
        k.aktiv,
        k.erstellt_am,
        COUNT(DISTINCT v.id) AS vokabel_anzahl
    FROM kategorien k
    LEFT JOIN vokabeln v ON v.kategorie_id = k.id AND v.aktiv = 1
    {$where}
    GROUP BY k.id
    ORDER BY k.reihenfolge ASC, k.name ASC
";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$alle = $stmt->fetchAll();

// --- Hierarchie aufbauen ---
// Typen casten
foreach ($alle as &$kat) {
    $kat['id'] = (int) $kat['id'];
    $kat['eltern_id'] = $kat['eltern_id'] !== null ? (int) $kat['eltern_id'] : null;
    $kat['reihenfolge'] = (int) $kat['reihenfolge'];    $kat['aktiv'] = (bool) $kat['aktiv'];
    $kat['vokabel_anzahl'] = (int) $kat['vokabel_anzahl'];
}
unset($kat);

// Wenn kein eltern_id-Filter → hierarchisch aufbauen
if ($eltern_id === null) {
    $baum = _baum_aufbauen($alle);
    json_erfolg($baum);
} else {
    json_erfolg($alle);
}

/**
 * Flache Liste in Baumstruktur umwandeln
 */
function _baum_aufbauen(array $kategorien): array
{
    $nach_id = [];
    foreach ($kategorien as $kat) {
        $kat['kinder'] = [];
        $nach_id[$kat['id']] = $kat;
    }

    $baum = [];
    foreach ($nach_id as &$kat) {
        if ($kat['eltern_id'] !== null && isset($nach_id[$kat['eltern_id']])) {
            $nach_id[$kat['eltern_id']]['kinder'][] = &$kat;
        } else {
            $baum[] = &$kat;
        }
    }

    return $baum;
}

