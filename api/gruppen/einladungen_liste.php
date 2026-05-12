<?php
/**
 * API: Gruppen — Einladungen auflisten
 *
 * GET /api/gruppen/einladungen_liste.php?gruppen_id=X
 *
 * Zeigt aktive (offene, noch gueltige) Einladungen einer Gruppe.
 * Nur Admin/Leiter der Gruppe duerfen das sehen.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

methode_erzwingen('GET');

$benutzer    = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];

$gruppen_id = (int) ($_GET['gruppen_id'] ?? 0);
if ($gruppen_id < 1) {
    fehler_ungueltige_eingabe('gruppen_id ist erforderlich.');
}

$pdo = db_verbindung();

// Berechtigung: nur Admin/Leiter
if (!ist_admin($benutzer) && !gruppen_rolle_pruefen($benutzer_id, $gruppen_id, ['admin', 'leiter'])) {
    fehler_nicht_berechtigt('Nur Admins und Leiter koennen Einladungen verwalten.');
}

// Abgelaufene Einladungen automatisch markieren
$pdo->prepare("
    UPDATE gruppen_einladungen SET status = 'abgelaufen'
    WHERE gruppen_id = ? AND status = 'offen' AND gueltig_bis <= NOW()
")->execute([$gruppen_id]);

// Aktive Einladungen laden
$stmt = $pdo->prepare("
    SELECT
        ge.id,
        ge.email,
        ge.kurz_code,
        ge.status,
        ge.erstellt_am,
        ge.gueltig_bis,
        b.benutzername AS eingeladen_von_name
    FROM gruppen_einladungen ge
    JOIN benutzer b ON b.id = ge.eingeladen_von
    WHERE ge.gruppen_id = ? AND ge.status = 'offen' AND ge.gueltig_bis > NOW()
    ORDER BY ge.erstellt_am DESC
");
$stmt->execute([$gruppen_id]);
$einladungen = $stmt->fetchAll();

foreach ($einladungen as &$e) {
    $e['id'] = (int) $e['id'];
}
unset($e);

json_erfolg(['einladungen' => $einladungen]);
