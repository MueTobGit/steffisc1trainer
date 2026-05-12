<?php
/**
 * API: Admin — Rechtliche Texte speichern
 *
 * POST /api/admin/rechtliches_speichern.php
 *
 * Body (JSON): beliebige Kombination aus:
 *   { impressum_text, datenschutz_text, betreiber_name, betreiber_email, system_titel }
 *
 * Speichert Werte via UPSERT in app_texte.
 * Nur für Admins.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';

methode_erzwingen('POST');

$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

$body = json_body_lesen();

$erlaubte_schluessel = ['impressum_text', 'datenschutz_text', 'betreiber_name', 'betreiber_email', 'system_titel'];
$zu_speichern = [];

foreach ($erlaubte_schluessel as $key) {
    if (array_key_exists($key, $body)) {
        $zu_speichern[$key] = (string) $body[$key];
    }
}

if (empty($zu_speichern)) {
    fehler_ungueltige_eingabe('Keine gültigen Felder zum Speichern angegeben.');
}

$pdo = db_verbindung();

try {
    $stmt = $pdo->prepare(
        'INSERT INTO app_texte (schluessel, wert) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE wert = VALUES(wert), aktualisiert_am = CURRENT_TIMESTAMP'
    );

    foreach ($zu_speichern as $key => $wert) {
        $stmt->execute([$key, $wert]);
    }
} catch (\PDOException $e) {
    fehler_server('Datenbankfehler: ' . $e->getMessage());
}

json_erfolg(['gespeichert' => array_keys($zu_speichern)]);
