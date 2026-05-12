<?php
/**
 * API: Vokabeln — Private Vokabeln zaehlen
 *
 * GET /api/vokabeln/privat_zaehlen.php
 *
 * Gibt die Anzahl eigener privater Vokabeln und das Limit zurueck.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/sichtbarkeit.php';

methode_erzwingen('GET');

$benutzer    = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];

$pdo = db_verbindung();

$stmt = $pdo->prepare('SELECT COUNT(*) FROM vokabeln WHERE besitzer_id = ? AND ist_privat = 1');
$stmt->execute([$benutzer_id]);
$anzahl = (int) $stmt->fetchColumn();

$limit = max_private_vokabeln($pdo);

json_erfolg([
    'anzahl' => $anzahl,
    'limit'  => $limit,
    'frei'   => max(0, $limit - $anzahl),
]);
