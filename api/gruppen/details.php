<?php
/**
 * API: Gruppen — Details
 *
 * GET /api/gruppen/details.php?id=X
 *
 * Einzelne Gruppe mit Mitgliederliste.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

// --- Methode pruefen ---
methode_erzwingen('GET');

// --- Authentifizierung ---
$benutzer = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];

// --- Parameter ---
$id = get_param_int('id', 0);
if ($id < 1) {
    fehler_ungueltige_eingabe('Gruppen-ID ist erforderlich.');
}

$pdo = db_verbindung();

// --- Gruppe laden (inkl. Avatar) ---
$stmt = $pdo->prepare("
    SELECT g.*, b.benutzername AS ersteller_name, m.dateipfad AS avatar_url
    FROM gruppen g
    LEFT JOIN benutzer b ON b.id = g.erstellt_von
    LEFT JOIN medien m ON m.id = g.media_id
    WHERE g.id = ? AND g.aktiv = 1
");
$stmt->execute([$id]);
$gruppe = $stmt->fetch();

if (!$gruppe) {
    fehler_nicht_gefunden('Gruppe nicht gefunden.');
}

// --- Mitglieder laden ---
$stmt = $pdo->prepare("
    SELECT
        gm.rolle,
        gm.beigetreten_am,
        b.id AS benutzer_id,
        b.benutzername,
        b.spitzname,
        m.dateipfad AS avatar_url
    FROM gruppen_mitglieder gm
    JOIN benutzer b ON b.id = gm.benutzer_id
    LEFT JOIN medien m ON m.id = b.media_id
    WHERE gm.gruppen_id = ?
    ORDER BY FIELD(gm.rolle, 'admin', 'leiter', 'mitglied'), gm.beigetreten_am ASC
");
$stmt->execute([$id]);
$mitglieder = $stmt->fetchAll();

foreach ($mitglieder as &$m) {
    $m['benutzer_id'] = (int) $m['benutzer_id'];
    $m['avatar_url']  = $m['avatar_url'] ? OEFFENTLICH_URL . '/' . $m['avatar_url'] : null;
}
unset($m);

// --- Eigene Rolle ---
$meine_rolle = null;
foreach ($mitglieder as $m) {
    if ($m['benutzer_id'] === $benutzer_id) {
        $meine_rolle = $m['rolle'];
        break;
    }
}

// --- Offene Einladungen (nur Admin/Leiter) ---
$offene_einladungen = 0;
if (in_array($meine_rolle, ['admin', 'leiter'], true)) {
    $stmt = $pdo->prepare("
        SELECT COUNT(*) FROM gruppen_einladungen
        WHERE gruppen_id = ? AND status = 'offen' AND gueltig_bis > NOW()
    ");
    $stmt->execute([$id]);
    $offene_einladungen = (int) $stmt->fetchColumn();
}

json_erfolg([
    'id' => (int) $gruppe['id'],
    'name' => $gruppe['name'],
    'beschreibung' => $gruppe['beschreibung'],
    'max_mitglieder' => (int) $gruppe['max_mitglieder'],
    'erstellt_am' => $gruppe['erstellt_am'],
    'ersteller_name' => $gruppe['ersteller_name'],
    'avatar_url' => $gruppe['avatar_url'] ? OEFFENTLICH_URL . '/' . $gruppe['avatar_url'] : null,
    'mitglieder' => $mitglieder,
    'mitglieder_anzahl' => count($mitglieder),
    'meine_rolle' => $meine_rolle,
    'offene_einladungen' => $offene_einladungen,
]);
