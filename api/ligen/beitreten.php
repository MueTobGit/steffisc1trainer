<?php
/**
 * API: Ligen — Beitreten
 *
 * POST /api/ligen/beitreten.php
 *
 * Der aktuellen aktiven Liga beitreten.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

// --- Methode pruefen ---
methode_erzwingen('POST');

// --- Authentifizierung ---
$benutzer = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];

$pdo = db_verbindung();

// --- Aktive Liga finden ---
$stmt = $pdo->prepare("
    SELECT id, name FROM ligen
    WHERE aktiv = 1 AND start_datum <= CURDATE() AND end_datum >= CURDATE()
    ORDER BY id DESC
    LIMIT 1
");
$stmt->execute();
$liga = $stmt->fetch();

if (!$liga) {
    fehler_nicht_gefunden('Keine aktive Liga vorhanden.');
}

$liga_id = (int) $liga['id'];

// --- Beitreten (atomares INSERT IGNORE schuetzt vor Race Conditions bei Doppelklick/Retry) ---
// Setzt UNIQUE KEY uq_liga_benutzer (liga_id, benutzer_id) auf liga_teilnehmer voraus
// (Migration: ALTER TABLE liga_teilnehmer ADD UNIQUE KEY uq_liga_benutzer (liga_id, benutzer_id))
$stmt = $pdo->prepare("
    INSERT IGNORE INTO liga_teilnehmer (liga_id, benutzer_id, punkte)
    VALUES (?, ?, 0)
");
$stmt->execute([$liga_id, $benutzer_id]);

if ($stmt->rowCount() === 0) {
    // rowCount() = 0 bedeutet: UNIQUE-Konflikt → User ist bereits dabei
    fehler_doppelter_eintrag('Du nimmst bereits an dieser Liga teil.');
}

json_erfolg([
    'liga_id' => $liga_id,
    'liga_name' => $liga['name'],
], 'Liga beigetreten!');
