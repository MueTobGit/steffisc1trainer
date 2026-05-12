<?php
/**
 * API: Benachrichtigungen — Tägliche Benachrichtigungskanäle
 *
 * GET /api/benachrichtigungen/kanaele.php
 *
 * Gibt alle täglichen App-Benachrichtigungen zurück (aktive und inaktive),
 * damit der Client korrekt aktivieren/deaktivieren kann.
 * Zugriff: jeder authentifizierte Benutzer (kein Admin erforderlich).
 *
 * Felder je Eintrag:
 *   schluessel  — Eindeutige ID (z.B. "uebungs_erinnerung", "streak_warnung")
 *   kanal       — Benachrichtigungskanal ("training", "streak", …)
 *   titel       — Benachrichtigungstitel
 *   text        — Benachrichtigungstext
 *   uhrzeit     — Uhrzeit im Format "HH:MM" (aus parameter_1)
 *   aktiv       — Ob der Kanal aktiv ist
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

methode_erzwingen('GET');

benutzer_authentifizieren(); // Login erforderlich, aber kein Admin

$pdo = db_verbindung();

$stmt = $pdo->prepare("
    SELECT schluessel, kanal, titel, text, parameter_1, aktiv
    FROM app_benachrichtigungen
    WHERE typ = 'taeglich'
    ORDER BY sortierung ASC, schluessel ASC
");
$stmt->execute();
$zeilen = $stmt->fetchAll();

$daten = array_map(static function (array $z): array {
    return [
        'schluessel' => $z['schluessel'],
        'kanal'      => $z['kanal'],
        'titel'      => $z['titel'],
        'text'       => $z['text'],
        'uhrzeit'    => $z['parameter_1'], // parameter_1 = Uhrzeit (HH:MM)
        'aktiv'      => (bool) $z['aktiv'],
    ];
}, $zeilen);

json_erfolg($daten);
