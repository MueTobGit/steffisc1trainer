<?php
/**
 * API: Admin — Rechtliche Texte laden
 *
 * GET /api/admin/rechtliches_laden.php
 *
 * Lädt Impressum, Datenschutz und Systeminformationen aus app_texte.
 * Nur für Admins (zum Bearbeiten).
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';

methode_erzwingen('GET');

$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

$pdo = db_verbindung();

$schluessel = ['impressum_text', 'datenschutz_text', 'betreiber_name', 'betreiber_email', 'system_titel'];

$platzhalter = implode(',', array_fill(0, count($schluessel), '?'));
$stmt = $pdo->prepare("SELECT schluessel, wert FROM app_texte WHERE schluessel IN ({$platzhalter})");
$stmt->execute($schluessel);
$zeilen = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

$daten = [];
foreach ($schluessel as $key) {
    $daten[$key] = $zeilen[$key] ?? '';
}

json_erfolg($daten);
