<?php
/**
 * API: Vokabeln — Synonym-Suche
 *
 * GET /api/vokabeln/synonym_suche.php?begriffe=reden,sprechen
 *
 * Sucht öffentliche Vokabeln anhand komma-getrennter deutscher Begriffe (LIKE-Suche).
 * Gibt auch bestehende Synonyme (sv) jeder gefundenen Vokabel zurück.
 * Nur Admin.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';

methode_erzwingen('GET');

$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

// --- Begriffe einlesen ---
$begriffe_raw = trim($_GET['begriffe'] ?? '');

if ($begriffe_raw === '') {
    fehler_ungueltige_eingabe('Mindestens ein Begriff ist erforderlich.');
}

$begriffe = array_values(array_filter(
    array_map('trim', explode(',', $begriffe_raw)),
    fn($b) => $b !== ''
));

if (empty($begriffe)) {
    fehler_ungueltige_eingabe('Mindestens ein Begriff ist erforderlich.');
}

if (count($begriffe) > 10) {
    fehler_ungueltige_eingabe('Maximal 10 Suchbegriffe erlaubt.');
}

$pdo = db_verbindung();

// --- SQL: Vokabeln suchen ---
$bedingungen = [];
$params = [];

foreach ($begriffe as $begriff) {
    $bedingungen[] = 'v.deutsch LIKE ?';
    $params[] = '%' . $begriff . '%';
}

$where = implode(' OR ', $bedingungen);

$sql = "
    SELECT v.id, v.englisch, v.deutsch, v.wortart, v.sprachniveau
    FROM vokabeln v
    WHERE ({$where})
      AND v.aktiv = 1
      AND v.ist_privat = 0
    ORDER BY v.wortart, v.englisch
    LIMIT 100
";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$vokabeln = $stmt->fetchAll();

// --- Synonyme für gefundene Vokabeln laden ---
if (!empty($vokabeln)) {
    $ids = array_column($vokabeln, 'id');
    $placeholders = implode(',', array_fill(0, count($ids), '?'));

    $stmt = $pdo->prepare("
        SELECT vokabel_id, synonym, sprache
        FROM synonyme
        WHERE vokabel_id IN ({$placeholders})
        ORDER BY sprache, synonym
    ");
    $stmt->execute($ids);
    $alle_synonyme = $stmt->fetchAll();

    // Index: vokabel_id -> [synonyme]
    $synonym_map = [];
    foreach ($alle_synonyme as $s) {
        $vid = (int) $s['vokabel_id'];
        $synonym_map[$vid][] = [
            'synonym' => $s['synonym'],
            'sprache' => $s['sprache'],
        ];
    }

    foreach ($vokabeln as &$v) {
        $v['id'] = (int) $v['id'];
        $v['synonyme'] = $synonym_map[$v['id']] ?? [];
    }
    unset($v);
}

json_erfolg($vokabeln, count($vokabeln) . ' Vokabel(n) gefunden.');
