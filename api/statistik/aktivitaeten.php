<?php
/**
 * API: Statistik — Aktivitaeten laden
 *
 * GET /api/statistik/aktivitaeten.php
 * Parameter: ?seite=1&pro_seite=20&typ=training (optional)
 *
 * Liefert paginierte Aktivitaeten-Liste.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__, 2) . '/konfiguration/hilfsfunktionen.php';

// --- Methode pruefen ---
methode_erzwingen('GET');

// --- Authentifizierung ---
$benutzer = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];

$pdo = db_verbindung();

// --- Parameter ---
[$seite, $pro_seite] = paginierung_parameter();
$typ_filter = get_param('typ');

// Typ validieren
$erlaubte_typen = ['training', 'login', 'admin_aktion'];
if ($typ_filter !== null && !in_array($typ_filter, $erlaubte_typen, true)) {
    $typ_filter = null;
}

// --- Gesamt zaehlen ---
$count_sql = "SELECT COUNT(*) FROM aktivitaeten WHERE benutzer_id = ?";
$count_params = [$benutzer_id];

if ($typ_filter !== null) {
    $count_sql .= " AND typ = ?";
    $count_params[] = $typ_filter;
}

$stmt = $pdo->prepare($count_sql);
$stmt->execute($count_params);
$gesamt = (int) $stmt->fetchColumn();

$pag = paginierung_berechnen($seite, $pro_seite, $gesamt);

// --- Aktivitaeten laden ---
$sql = "
    SELECT id, typ, beschreibung, details_json, erstellt_am
    FROM aktivitaeten
    WHERE benutzer_id = ?
";
$params = [$benutzer_id];

if ($typ_filter !== null) {
    $sql .= " AND typ = ?";
    $params[] = $typ_filter;
}

$sql .= " ORDER BY erstellt_am DESC LIMIT ? OFFSET ?";
$params[] = $pag['pro_seite'];
$params[] = $pag['offset'];

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$eintraege = $stmt->fetchAll();

// details_json parsen
foreach ($eintraege as &$e) {
    $e['id'] = (int) $e['id'];
    $e['details'] = $e['details_json'] ? json_decode($e['details_json'], true) : null;
    unset($e['details_json']);
}
unset($e);

// --- Paginierte Antwort ---
unset($pag['offset']);
json_paginiert($eintraege, $pag);
