<?php
/**
 * API: Admin — Ligaliste
 *
 * GET /api/admin/ligen_liste.php
 *
 * Liefert alle Ligen paginiert (inkl. inaktive).
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

$seite     = max(1, (int) ($_GET['seite'] ?? 1));
$pro_seite = min(50, max(10, (int) ($_GET['pro_seite'] ?? 20)));
$offset    = ($seite - 1) * $pro_seite;

// Gesamt-Anzahl
$stmt = $pdo->query("SELECT COUNT(*) FROM ligen");
$gesamt = (int) $stmt->fetchColumn();

$stmt = $pdo->prepare("
    SELECT
        l.id, l.name, l.beschreibung, l.start_datum, l.end_datum, l.gruppen_id, l.aktiv,
        l.wiederholung, l.krone_typ, l.erstellt_am,
        g.name AS gruppen_name,
        (SELECT COUNT(*) FROM liga_teilnehmer lt WHERE lt.liga_id = l.id) AS teilnehmer_anzahl
    FROM ligen l
    LEFT JOIN gruppen g ON g.id = l.gruppen_id
    ORDER BY l.id DESC
    LIMIT ? OFFSET ?
");
$stmt->execute([$pro_seite, $offset]);
$eintraege = $stmt->fetchAll();

foreach ($eintraege as &$e) {
    $e['id']         = (int) $e['id'];
    $e['aktiv']      = (bool) $e['aktiv'];
    $e['gruppen_id'] = $e['gruppen_id'] ? (int) $e['gruppen_id'] : null;
    $e['teilnehmer_anzahl'] = (int) $e['teilnehmer_anzahl'];
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
