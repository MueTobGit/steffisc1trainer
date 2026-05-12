<?php
/**
 * API: Gruppen — Liste
 *
 * GET /api/gruppen/liste.php
 *
 * Paginierte Liste der Gruppen.
 *
 * Query-Parameter:
 *   - seite, pro_seite
 *   - bereich: 'meine' (Standard) = eigene Gruppen, 'alle' = verfuegbare
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

// --- Methode pruefen ---
methode_erzwingen('GET');

// --- Authentifizierung ---
$benutzer = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];

// --- Parameter ---
[$seite, $pro_seite] = paginierung_parameter();
$bereich = get_param('bereich', 'meine');

if (!in_array($bereich, ['meine', 'alle'], true)) {
    $bereich = 'meine';
}

$pdo = db_verbindung();

if ($bereich === 'meine') {
    // --- Meine Gruppen ---
    $count_sql = "
        SELECT COUNT(*)
        FROM gruppen g
        JOIN gruppen_mitglieder gm ON gm.gruppen_id = g.id
        WHERE gm.benutzer_id = ? AND g.aktiv = 1
    ";
    $stmt = $pdo->prepare($count_sql);
    $stmt->execute([$benutzer_id]);
    $gesamt = (int) $stmt->fetchColumn();

    $paginierung = paginierung_berechnen($seite, $pro_seite, $gesamt);

    $sql = "
        SELECT
            g.id, g.name, g.beschreibung, g.max_mitglieder, g.erstellt_am,
            gm.rolle AS meine_rolle,
            b.benutzername AS ersteller_name,
            m.dateipfad AS avatar_url,
            (SELECT COUNT(*) FROM gruppen_mitglieder gm2 WHERE gm2.gruppen_id = g.id) AS mitglieder_anzahl
        FROM gruppen g
        JOIN gruppen_mitglieder gm ON gm.gruppen_id = g.id AND gm.benutzer_id = ?
        LEFT JOIN benutzer b ON b.id = g.erstellt_von
        LEFT JOIN medien m ON m.id = g.media_id
        WHERE g.aktiv = 1
        ORDER BY g.name ASC
        LIMIT ? OFFSET ?
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$benutzer_id, $paginierung['pro_seite'], $paginierung['offset']]);

} else {
    // --- Verfuegbare Gruppen (nicht Mitglied) ---
    $count_sql = "
        SELECT COUNT(*)
        FROM gruppen g
        WHERE g.aktiv = 1
          AND g.id NOT IN (
              SELECT gruppen_id FROM gruppen_mitglieder WHERE benutzer_id = ?
          )
    ";
    $stmt = $pdo->prepare($count_sql);
    $stmt->execute([$benutzer_id]);
    $gesamt = (int) $stmt->fetchColumn();

    $paginierung = paginierung_berechnen($seite, $pro_seite, $gesamt);

    $sql = "
        SELECT
            g.id, g.name, g.beschreibung, g.max_mitglieder, g.erstellt_am,
            b.benutzername AS ersteller_name,
            m.dateipfad AS avatar_url,
            (SELECT COUNT(*) FROM gruppen_mitglieder gm2 WHERE gm2.gruppen_id = g.id) AS mitglieder_anzahl
        FROM gruppen g
        LEFT JOIN benutzer b ON b.id = g.erstellt_von
        LEFT JOIN medien m ON m.id = g.media_id
        WHERE g.aktiv = 1
          AND g.id NOT IN (
              SELECT gruppen_id FROM gruppen_mitglieder WHERE benutzer_id = ?
          )
        ORDER BY g.name ASC
        LIMIT ? OFFSET ?
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$benutzer_id, $paginierung['pro_seite'], $paginierung['offset']]);
}

$gruppen = $stmt->fetchAll();

foreach ($gruppen as &$g) {
    $g['id'] = (int) $g['id'];
    $g['max_mitglieder'] = (int) $g['max_mitglieder'];
    $g['mitglieder_anzahl'] = (int) $g['mitglieder_anzahl'];
    $g['avatar_url'] = $g['avatar_url'] ? OEFFENTLICH_URL . '/' . $g['avatar_url'] : null;
}
unset($g);

json_paginiert($gruppen, $paginierung);
