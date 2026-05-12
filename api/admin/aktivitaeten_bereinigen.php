<?php
/**
 * API: Admin — Aktivitaeten bereinigen
 *
 * POST /api/admin/aktivitaeten_bereinigen.php
 *
 * Loescht alte Aktivitaeten basierend auf konfiguriertem Aufbewahrungszeitraum.
 * Nur fuer Admins.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';

// --- Methode pruefen ---
methode_erzwingen('POST');

// --- Authentifizierung + Autorisierung ---
$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

$pdo = db_verbindung();

// --- Aufbewahrungszeitraum laden ---
$stmt = $pdo->prepare("SELECT wert FROM app_konfiguration WHERE schluessel = ?");
$stmt->execute(['aktivitaeten_aufbewahrung_tage']);
$tage_wert = $stmt->fetchColumn();
$tage = (int) ($tage_wert ?: 60);

if ($tage < 1) $tage = 60;

// --- Anzahl ermitteln ---
$stmt = $pdo->prepare("
    SELECT COUNT(*) FROM aktivitaeten
    WHERE erstellt_am < DATE_SUB(NOW(), INTERVAL ? DAY)
");
$stmt->execute([$tage]);
$anzahl = (int) $stmt->fetchColumn();

// --- Loeschen ---
$stmt = $pdo->prepare("
    DELETE FROM aktivitaeten
    WHERE erstellt_am < DATE_SUB(NOW(), INTERVAL ? DAY)
");
$stmt->execute([$tage]);

// --- Aktion loggen ---
$stmt = $pdo->prepare("
    INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung, details_json)
    VALUES (?, 'admin_aktion', ?, ?)
");
$details = json_encode([
    'geloescht' => $anzahl,
    'schwelle_tage' => $tage,
], JSON_UNESCAPED_UNICODE);
$stmt->execute([$benutzer['id'], "Aktivitaeten bereinigt: {$anzahl} geloescht", $details]);

json_erfolg([
    'geloescht' => $anzahl,
    'schwelle_tage' => $tage,
], "{$anzahl} Aktivitaeten geloescht.");
