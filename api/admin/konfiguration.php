<?php
/**
 * API: Admin — Konfiguration
 *
 * GET  /api/admin/konfiguration.php — Alle Eintraege laden
 * POST /api/admin/konfiguration.php — Einzelnen Wert aktualisieren
 *
 * Nur fuer Admins.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

// --- Methode pruefen ---
methode_erzwingen(['GET', 'POST']);

// --- Authentifizierung + Autorisierung ---
$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

$pdo = db_verbindung();
$methode = $_SERVER['REQUEST_METHOD'];

if ($methode === 'GET') {
    // --- Alle Konfigurationen laden ---
    $stmt = $pdo->query("
        SELECT id, schluessel, wert, beschreibung, aktualisiert_am
        FROM app_konfiguration
        ORDER BY schluessel ASC
    ");
    $eintraege = $stmt->fetchAll();

    foreach ($eintraege as &$e) {
        $e['id'] = (int) $e['id'];
    }
    unset($e);

    json_erfolg($eintraege);

} else {
    // --- POST: Einzelnen Wert aktualisieren ---
    $daten = json_body_lesen();
    pflichtfelder_pruefen($daten, ['schluessel', 'wert']);

    $schluessel = trim($daten['schluessel']);
    $neuer_wert = trim($daten['wert']);

    laenge_validieren($schluessel, 'schluessel', 1, 64);
    laenge_validieren($neuer_wert, 'wert', 1, 255);

    // Schluessel muss existieren
    $stmt = $pdo->prepare("SELECT wert FROM app_konfiguration WHERE schluessel = ?");
    $stmt->execute([$schluessel]);
    $alter_wert = $stmt->fetchColumn();

    if ($alter_wert === false) {
        fehler_nicht_gefunden("Konfigurationsschluessel '{$schluessel}' nicht gefunden.");
    }

    // Update
    $stmt = $pdo->prepare("
        UPDATE app_konfiguration SET wert = ?, aktualisiert_am = NOW()
        WHERE schluessel = ?
    ");
    $stmt->execute([$neuer_wert, $schluessel]);

    // Aktivitaet loggen
    $stmt = $pdo->prepare("
        INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung, details_json)
        VALUES (?, 'admin_aktion', ?, ?)
    ");
    $details = json_encode([
        'schluessel' => $schluessel,
        'alter_wert' => $alter_wert,
        'neuer_wert' => $neuer_wert,
    ], JSON_UNESCAPED_UNICODE);
    $stmt->execute([$benutzer['id'], "Konfiguration geaendert: {$schluessel}", $details]);

    json_erfolg(null, 'Konfiguration aktualisiert.');
}
