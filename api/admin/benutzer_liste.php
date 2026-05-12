<?php
/**
 * API: Admin — Benutzer-Liste
 *
 * GET /api/admin/benutzer_liste.php
 *
 * Paginierte Liste aller Benutzer mit Statistik.
 * Nur fuer Admins.
 *
 * Query-Parameter:
 *   - seite, pro_seite
 *   - suche: Benutzername-Filter (min. 2 Zeichen)
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';

// --- Methode pruefen ---
methode_erzwingen('GET');

// --- Authentifizierung + Autorisierung ---
$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

// --- Parameter ---
[$seite, $pro_seite] = paginierung_parameter();
$suche = get_param('suche', '');

$pdo = db_verbindung();

// --- Bedingungen ---
$bedingungen = [];
$params = [];

if (mb_strlen($suche) >= 2) {
    $bedingungen[] = 'b.benutzername LIKE ?';
    $params[] = '%' . $suche . '%';
}

$where = '';
if (!empty($bedingungen)) {
    $where = 'WHERE ' . implode(' AND ', $bedingungen);
}

// --- Gesamtanzahl ---
$stmt = $pdo->prepare("SELECT COUNT(*) FROM benutzer b {$where}");
$stmt->execute($params);
$gesamt = (int) $stmt->fetchColumn();

$paginierung = paginierung_berechnen($seite, $pro_seite, $gesamt);

// --- Daten laden ---
$sql = "
    SELECT
        b.id, b.benutzername, b.vorname, b.nachname, b.email, b.spitzname,
        b.rolle, b.aktiv, b.letzter_login, b.erstellt_am,
        COALESCE(s.xp, 0) AS xp,
        COALESCE(s.globales_level, 1) AS globales_level,
        COALESCE(s.streak_tage, 0) AS streak_tage
    FROM benutzer b
    LEFT JOIN benutzer_statistik s ON s.benutzer_id = b.id
    {$where}
    ORDER BY b.id ASC
    LIMIT ? OFFSET ?
";

$params[] = $paginierung['pro_seite'];
$params[] = $paginierung['offset'];

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$eintraege = $stmt->fetchAll();

foreach ($eintraege as &$e) {
    $e['id'] = (int) $e['id'];
    $e['aktiv'] = (bool) $e['aktiv'];
    $e['xp'] = (int) $e['xp'];
    $e['globales_level'] = (int) $e['globales_level'];
    $e['streak_tage'] = (int) $e['streak_tage'];
}
unset($e);

json_paginiert($eintraege, $paginierung);
