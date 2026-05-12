<?php
/**
 * API: Rechtliche Texte laden (öffentlich)
 *
 * GET /api/rechtliches/laden.php
 *
 * Gibt Impressum, Datenschutz und Systeminformationen zurück.
 * Kein Login erforderlich (Pflichtseite).
 */

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/konfiguration/datenbank.php';
require_once dirname(__DIR__, 2) . '/konfiguration/konstanten.php';
require_once dirname(__DIR__, 2) . '/konfiguration/hilfsfunktionen.php';
require_once dirname(__DIR__) . '/_middleware/antwort_helfer.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

methode_erzwingen('GET');

$pdo = db_verbindung();

$schluessel  = ['impressum_text', 'datenschutz_text', 'betreiber_name', 'betreiber_email', 'system_titel'];
$platzhalter = implode(',', array_fill(0, count($schluessel), '?'));

try {
    $stmt = $pdo->prepare("SELECT schluessel, wert FROM app_texte WHERE schluessel IN ({$platzhalter})");
    $stmt->execute($schluessel);
    $zeilen = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
} catch (PDOException $e) {
    // Tabelle existiert noch nicht (alte Installation) → leere Defaults
    $zeilen = [];
}

$daten = [];
foreach ($schluessel as $key) {
    $daten[$key] = $zeilen[$key] ?? '';
}

json_erfolg($daten);
