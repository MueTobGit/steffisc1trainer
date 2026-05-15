<?php
/**
 * API: Admin — Themenfeld-Zuordnungs-Matrix
 *
 * GET  /api/admin/zuordnungen_matrix.php
 *      ?suche=...&seite=1&pro_seite=50&themenfeld_ids=1,2,3&nur_ohne=0
 *      Liefert: themenfelder[], vokabeln[] (mit themenfeld_ids), gesamt, seite, seiten
 *
 * POST /api/admin/zuordnungen_matrix.php
 *      Body: { aenderungen: [{vokabel_id, themenfeld_id, zugeordnet}] }
 *      Liefert: { gespeichert: N }
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';

$benutzer = benutzer_authentifizieren();
nur_admin_erlaubt($benutzer);

$pdo = db_verbindung();

// ---- POST: Batch-Speichern ----
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $daten = json_body_lesen();
    $aenderungen = $daten['aenderungen'] ?? [];
    if (!is_array($aenderungen)) {
        fehler_ungueltige_eingabe('aenderungen muss ein Array sein.');
    }

    $gespeichert = 0;
    $stmt_ins = $pdo->prepare(
        'INSERT IGNORE INTO themenfeld_vokabeln (themenfeld_id, vokabel_id, reihenfolge) VALUES (?, ?, 0)'
    );
    $stmt_del = $pdo->prepare(
        'DELETE FROM themenfeld_vokabeln WHERE themenfeld_id = ? AND vokabel_id = ?'
    );

    foreach ($aenderungen as $a) {
        $vid = (int) ($a['vokabel_id'] ?? 0);
        $tid = (int) ($a['themenfeld_id'] ?? 0);
        $zugeordnet = (bool) ($a['zugeordnet'] ?? false);
        if ($vid < 1 || $tid < 1) continue;

        if ($zugeordnet) {
            $stmt_ins->execute([$tid, $vid]);
        } else {
            $stmt_del->execute([$tid, $vid]);
        }
        $gespeichert++;
    }

    json_erfolg(['gespeichert' => $gespeichert], "{$gespeichert} Zuordnung(en) gespeichert.");
}

// ---- GET: Matrix-Daten laden ----
methode_erzwingen('GET');

$suche      = trim($_GET['suche'] ?? '');
$seite      = max(1, (int) ($_GET['seite'] ?? 1));
$pro_seite  = min(100, max(10, (int) ($_GET['pro_seite'] ?? 50)));
$nur_ohne   = !empty($_GET['nur_ohne']);
$tf_filter  = array_filter(array_map('intval', explode(',', $_GET['themenfeld_ids'] ?? '')), fn($x) => $x > 0);

// --- Alle Themenfelder laden ---
$stmt_tf = $pdo->query(
    'SELECT id, titel, kategorie_id FROM themenfelder WHERE aktiv = 1 ORDER BY reihenfolge ASC, titel ASC'
);
$alle_themenfelder = $stmt_tf->fetchAll();
foreach ($alle_themenfelder as &$tf) {
    $tf['id'] = (int) $tf['id'];
    $tf['kategorie_id'] = $tf['kategorie_id'] !== null ? (int) $tf['kategorie_id'] : null;
}
unset($tf);

// --- Vokabeln mit Filterung zählen ---
$where_teile  = ['v.aktiv = 1', 'v.ist_privat = 0'];
$where_params = [];

if ($suche !== '') {
    $where_teile[] = '(v.englisch LIKE ? OR v.deutsch LIKE ?)';
    $muster = '%' . $suche . '%';
    $where_params[] = $muster;
    $where_params[] = $muster;
}

if ($nur_ohne) {
    $where_teile[] = 'NOT EXISTS (SELECT 1 FROM themenfeld_vokabeln tv WHERE tv.vokabel_id = v.id)';
}

$where_sql = 'WHERE ' . implode(' AND ', $where_teile);

$stmt_cnt = $pdo->prepare("SELECT COUNT(*) FROM vokabeln v {$where_sql}");
$stmt_cnt->execute($where_params);
$gesamt = (int) $stmt_cnt->fetchColumn();
$seiten = max(1, (int) ceil($gesamt / $pro_seite));
$seite  = min($seite, $seiten);
$offset = ($seite - 1) * $pro_seite;

// --- Vokabeln laden ---
$stmt_vok = $pdo->prepare(
    "SELECT v.id, v.englisch, v.deutsch, v.wortart, v.sprachniveau
     FROM vokabeln v
     {$where_sql}
     ORDER BY v.englisch ASC
     LIMIT {$pro_seite} OFFSET {$offset}"
);
$stmt_vok->execute($where_params);
$vokabeln_roh = $stmt_vok->fetchAll();

if (empty($vokabeln_roh)) {
    json_erfolg([
        'themenfelder'  => $alle_themenfelder,
        'vokabeln'      => [],
        'gesamt'        => $gesamt,
        'seite'         => $seite,
        'seiten'        => $seiten,
        'pro_seite'     => $pro_seite,
    ]);
}

// --- Bestehende Zuordnungen fuer aktuelle Seite laden ---
$vok_ids = array_column($vokabeln_roh, 'id');
$in_platzhalter = implode(',', array_fill(0, count($vok_ids), '?'));
$stmt_zuord = $pdo->prepare(
    "SELECT vokabel_id, themenfeld_id FROM themenfeld_vokabeln WHERE vokabel_id IN ({$in_platzhalter})"
);
$stmt_zuord->execute($vok_ids);

// themenfeld_ids je Vokabel aufbauen
$zuordnung_map = [];
foreach ($stmt_zuord->fetchAll() as $z) {
    $vid = (int) $z['vokabel_id'];
    $tid = (int) $z['themenfeld_id'];
    $zuordnung_map[$vid][] = $tid;
}

// Vokabeln zusammenbauen
$vokabeln = [];
foreach ($vokabeln_roh as $v) {
    $vid = (int) $v['id'];
    $vokabeln[] = [
        'id'           => $vid,
        'englisch'     => $v['englisch'],
        'deutsch'      => $v['deutsch'],
        'wortart'      => $v['wortart'],
        'sprachniveau' => $v['sprachniveau'],
        'themenfeld_ids' => $zuordnung_map[$vid] ?? [],
    ];
}

json_erfolg([
    'themenfelder'  => $alle_themenfelder,
    'vokabeln'      => $vokabeln,
    'gesamt'        => $gesamt,
    'seite'         => $seite,
    'seiten'        => $seiten,
    'pro_seite'     => $pro_seite,
]);
