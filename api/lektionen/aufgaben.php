<?php
/**
 * API: Lektionen — Aufgaben (Hausaufgaben / Voraus-Lernen)
 *
 * GET    /api/lektionen/aufgaben.php          — Liste eigener Aufgaben
 * POST   /api/lektionen/aufgaben.php          — Aufgabe hinzufügen { lektion_id }
 * DELETE /api/lektionen/aufgaben.php          — Aufgabe entfernen  { lektion_id }
 *
 * Aufgaben erlauben das Üben gesperrter Lektionen (z.B. Lehrerin-Hausaufgabe).
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

$benutzer    = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];
$methode     = $_SERVER['REQUEST_METHOD'];

$pdo = db_verbindung();

// ---------------------------------------------------------------
// GET — Liste der eigenen Aufgaben
// ---------------------------------------------------------------
if ($methode === 'GET') {
    $stmt = $pdo->prepare("
        SELECT
            ba.lektion_id AS id,
            l.titel,
            l.kategorie_id,
            k.name AS kategorie_name,
            l.sprachniveau,
            COUNT(lv.vokabel_id) AS vokabel_anzahl,
            ba.erstellt_am
        FROM benutzer_aufgaben ba
        JOIN lektionen l ON l.id = ba.lektion_id
        LEFT JOIN kategorien k ON k.id = l.kategorie_id
        LEFT JOIN lektion_vokabeln lv ON lv.lektion_id = l.id
        WHERE ba.benutzer_id = ? AND l.aktiv = 1
        GROUP BY ba.lektion_id, l.titel, l.kategorie_id, k.name, l.sprachniveau, ba.erstellt_am
        ORDER BY ba.erstellt_am ASC
    ");
    $stmt->execute([$benutzer_id]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $aufgaben = array_map(fn($r) => [
        'id'             => (int) $r['id'],
        'titel'          => $r['titel'],
        'kategorie_id'   => $r['kategorie_id'] ? (int) $r['kategorie_id'] : null,
        'kategorie_name' => $r['kategorie_name'],
        'sprachniveau'   => $r['sprachniveau'],
        'vokabel_anzahl' => (int) $r['vokabel_anzahl'],
        'erstellt_am'    => $r['erstellt_am'],
    ], $rows);

    json_erfolg(['aufgaben' => $aufgaben]);
}

// ---------------------------------------------------------------
// POST — Aufgabe hinzufügen
// ---------------------------------------------------------------
if ($methode === 'POST') {
    $daten      = json_body_lesen();
    $lektion_id = isset($daten['lektion_id']) ? (int) $daten['lektion_id'] : 0;

    if ($lektion_id <= 0) {
        fehler_ungueltige_eingabe('lektion_id fehlt oder ungültig.');
    }

    // Lektion muss existieren und aktiv sein
    $stmtCheck = $pdo->prepare("SELECT id, titel FROM lektionen WHERE id = ? AND aktiv = 1");
    $stmtCheck->execute([$lektion_id]);
    $lektion = $stmtCheck->fetch(PDO::FETCH_ASSOC);
    if (!$lektion) {
        fehler_nicht_gefunden('Lektion nicht gefunden.');
    }

    // Einfügen (IGNORE bei Duplikat — idempotent)
    $stmt = $pdo->prepare("
        INSERT IGNORE INTO benutzer_aufgaben (benutzer_id, lektion_id)
        VALUES (?, ?)
    ");
    $stmt->execute([$benutzer_id, $lektion_id]);

    json_erfolg([
        'lektion_id' => $lektion_id,
        'titel'      => $lektion['titel'],
    ], 'Aufgabe hinzugefügt.', 201);
}

// ---------------------------------------------------------------
// DELETE — Aufgabe entfernen
// ---------------------------------------------------------------
if ($methode === 'DELETE') {
    $daten      = json_body_lesen();
    $lektion_id = isset($daten['lektion_id']) ? (int) $daten['lektion_id'] : 0;

    if ($lektion_id <= 0) {
        fehler_ungueltige_eingabe('lektion_id fehlt oder ungültig.');
    }

    $stmt = $pdo->prepare("
        DELETE FROM benutzer_aufgaben WHERE benutzer_id = ? AND lektion_id = ?
    ");
    $stmt->execute([$benutzer_id, $lektion_id]);

    json_erfolg(['lektion_id' => $lektion_id], 'Aufgabe entfernt.');
}

fehler_methode_nicht_erlaubt();
