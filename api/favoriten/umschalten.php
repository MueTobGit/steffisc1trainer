<?php
/**
 * API: Favoriten — Umschalten
 *
 * POST /api/favoriten/umschalten.php
 * Body: { "vokabel_id": 123 }
 *
 * Toggle: Existiert der Favorit → loeschen, sonst → anlegen.
 * Antwort: { "ist_favorit": true/false }
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

// --- Methode pruefen ---
methode_erzwingen('POST');

// --- Authentifizierung ---
$benutzer = benutzer_authentifizieren();

// --- Eingabe validieren ---
$body = json_body_lesen();
pflichtfelder_pruefen($body, ['vokabel_id']);

$vokabel_id = (int) $body['vokabel_id'];
if ($vokabel_id < 1) {
    fehler_ungueltige_eingabe('Vokabel-ID muss eine positive Ganzzahl sein.');
}

$pdo = db_verbindung();

// --- Vokabel existiert? (wirft intern fehler_nicht_gefunden bei unbekannter ID) ---
id_existiert($vokabel_id, 'vokabeln', 'Vokabel');

// --- Aktuellen Status pruefen ---
$stmt = $pdo->prepare("
    SELECT COUNT(*) FROM benutzer_favoriten
    WHERE benutzer_id = ? AND vokabel_id = ?
");
$stmt->execute([$benutzer['id'], $vokabel_id]);
$existiert = (int) $stmt->fetchColumn() > 0;

if ($existiert) {
    // --- Favorit entfernen ---
    $stmt = $pdo->prepare("
        DELETE FROM benutzer_favoriten
        WHERE benutzer_id = ? AND vokabel_id = ?
    ");
    $stmt->execute([$benutzer['id'], $vokabel_id]);
    $ist_favorit = false;
} else {
    // --- Favorit hinzufuegen ---
    $stmt = $pdo->prepare("
        INSERT INTO benutzer_favoriten (benutzer_id, vokabel_id)
        VALUES (?, ?)
    ");
    $stmt->execute([$benutzer['id'], $vokabel_id]);
    $ist_favorit = true;
}

json_erfolg(['ist_favorit' => $ist_favorit]);
