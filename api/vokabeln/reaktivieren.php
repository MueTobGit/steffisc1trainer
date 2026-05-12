<?php
/**
 * API: Vokabeln — Reaktivieren (Soft-Delete rückgängig machen)
 *
 * POST /api/vokabeln/reaktivieren.php
 *
 * Setzt aktiv = 1 für eine zuvor deaktivierte Vokabel.
 * Nur Admin.
 *
 * Body (JSON):
 *   - id: int
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

methode_erzwingen('POST');

$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

$daten = json_body_lesen();
$id = isset($daten['id']) ? (int) $daten['id'] : 0;

if ($id < 1) {
    fehler_ungueltige_eingabe('Vokabel-ID ist erforderlich.');
}

$pdo = db_verbindung();

// Vokabel prüfen — muss existieren (egal ob aktiv oder inaktiv)
$stmt = $pdo->prepare('SELECT id, schwedisch, aktiv FROM vokabeln WHERE id = ?');
$stmt->execute([$id]);
$vokabel = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$vokabel) {
    fehler_nicht_gefunden('Vokabel nicht gefunden.');
}

if ((int) $vokabel['aktiv'] === 1) {
    // Bereits aktiv — kein Fehler, einfach Erfolg zurückgeben
    json_erfolg([
        'id'        => $id,
        'schwedisch' => $vokabel['schwedisch'],
    ], "Vokabel „{$vokabel['schwedisch']}\" ist bereits aktiv.");
}

// Reaktivieren
$stmt = $pdo->prepare('UPDATE vokabeln SET aktiv = 1 WHERE id = ?');
$stmt->execute([$id]);

json_erfolg([
    'id'        => $id,
    'schwedisch' => $vokabel['schwedisch'],
], "Vokabel „{$vokabel['schwedisch']}\" wieder eingeblendet.");
