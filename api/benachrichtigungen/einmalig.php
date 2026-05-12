<?php
/**
 * API: Benachrichtigungen — Einmalige Nachrichten fuer authentifizierte Benutzer
 *
 * GET /api/benachrichtigungen/einmalig.php
 *
 * Gibt alle aktiven einmaligen App-Benachrichtigungen zurueck.
 * Zugriff: jeder authentifizierte Benutzer (kein Admin erforderlich).
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

methode_erzwingen('GET');

benutzer_authentifizieren(); // Login erforderlich, aber kein Admin

$pdo = db_verbindung();

$stmt = $pdo->prepare("
    SELECT schluessel, titel, text, parameter_1
    FROM app_benachrichtigungen
    WHERE typ = 'einmalig'
      AND aktiv = 1
    ORDER BY sortierung ASC, schluessel ASC
");
$stmt->execute();
$zeilen = $stmt->fetchAll();

$daten = array_map(static function (array $z): array {
    return [
        'schluessel'  => $z['schluessel'],
        'titel'       => $z['titel'],
        'text'        => $z['text'],
        'parameter_1' => $z['parameter_1'],
        'aktiv'       => true,
    ];
}, $zeilen);

json_erfolg($daten);
