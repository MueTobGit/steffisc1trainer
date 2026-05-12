<?php
/**
 * API: Admin — Belohnungsliste
 *
 * GET /api/admin/belohnungen_liste.php
 *
 * Liefert alle Belohnungen (inkl. inaktive) paginiert.
 * Query-Params: seite, pro_seite, typ (abzeichen|meilenstein|titel|echt)
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

methode_erzwingen('GET');

$benutzer = benutzer_authentifizieren();
if ($benutzer['rolle'] !== 'admin') {
    fehler_nicht_berechtigt('Nur Admins haben Zugriff.');
}

$pdo = db_verbindung();

$seite      = max(1, (int) ($_GET['seite'] ?? 1));
$pro_seite  = min(50, max(10, (int) ($_GET['pro_seite'] ?? 20)));
$typ_filter = $_GET['typ'] ?? '';
$offset     = ($seite - 1) * $pro_seite;

$erlaubte_typen = ['abzeichen', 'meilenstein', 'titel', 'echt'];
$where  = '';
$params = [];

if ($typ_filter && in_array($typ_filter, $erlaubte_typen, true)) {
    $where    = 'WHERE b.typ = ?';
    $params[] = $typ_filter;
}

// Gesamt-Anzahl
$stmt = $pdo->prepare("SELECT COUNT(*) FROM belohnungen b $where");
$stmt->execute($params);
$gesamt = (int) $stmt->fetchColumn();

// Eintraege
$params_seite   = $params;
$params_seite[] = $pro_seite;
$params_seite[] = $offset;

$stmt = $pdo->prepare("
    SELECT
        b.id, b.code, b.titel, b.beschreibung, b.typ,
        b.bild_pfad, b.gruppen_id, b.bedingung_json,
        b.xp_wert, b.reihenfolge, b.aktiv,
        g.name AS gruppen_name
    FROM belohnungen b
    LEFT JOIN gruppen g ON g.id = b.gruppen_id
    $where
    ORDER BY b.reihenfolge ASC, b.id ASC
    LIMIT ? OFFSET ?
");
$stmt->execute($params_seite);
$eintraege = $stmt->fetchAll();

// bedingung_json dekodieren
foreach ($eintraege as &$e) {
    $e['bedingung'] = $e['bedingung_json'] ? json_decode($e['bedingung_json'], true) : null;
    unset($e['bedingung_json']);
    $e['id']         = (int) $e['id'];
    $e['xp_wert']    = (int) $e['xp_wert'];
    $e['reihenfolge'] = (int) $e['reihenfolge'];
    $e['aktiv']      = (bool) $e['aktiv'];
    $e['gruppen_id'] = $e['gruppen_id'] ? (int) $e['gruppen_id'] : null;
}
unset($e);

$gesamt_seiten = (int) ceil($gesamt / $pro_seite);

json_erfolg([
    'eintraege' => $eintraege,
    'paginierung' => [
        'seite'         => $seite,
        'pro_seite'     => $pro_seite,
        'gesamt'        => $gesamt,
        'gesamt_seiten' => $gesamt_seiten,
    ],
]);
