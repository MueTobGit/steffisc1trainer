<?php
/**
 * API: Admin — Benutzer loeschen
 *
 * POST /api/admin/benutzer_loeschen.php
 *
 * Loescht einen Benutzer und alle zugehoerigen Daten (Statistik, Tokens, Fortschritt,
 * Trainings-Sitzungen, Aktivitaeten, Gruppen-Mitgliedschaften, Ligen-Teilnahmen).
 * Eigenes Konto kann nicht geloescht werden.
 *
 * Body:
 *   - benutzer_id (Pflicht)
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

// --- Methode pruefen ---
methode_erzwingen('POST');

// --- Authentifizierung + Autorisierung ---
$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

// --- Body lesen ---
$daten = json_body_lesen();
pflichtfelder_pruefen($daten, ['benutzer_id']);

$ziel_id = positive_ganzzahl_validieren($daten['benutzer_id'], 'benutzer_id');

// --- Eigenes Konto schuetzen ---
if ($ziel_id === (int) $benutzer['id']) {
    fehler_ungueltige_eingabe('Das eigene Konto kann nicht geloescht werden.');
}

$pdo = db_verbindung();

// --- Ziel-Benutzer pruefen ---
$stmt = $pdo->prepare("SELECT id, benutzername FROM benutzer WHERE id = ?");
$stmt->execute([$ziel_id]);
$ziel = $stmt->fetch();

if (!$ziel) {
    fehler_nicht_gefunden('Benutzer nicht gefunden.');
}

$benutzername = $ziel['benutzername'];

// --- Transaktion: Alle Daten des Benutzers loeschen ---
$pdo->beginTransaction();

try {
    // Gruppen-Mitgliedschaften
    $pdo->prepare("DELETE FROM gruppen_mitglieder WHERE benutzer_id = ?")->execute([$ziel_id]);

    // Gruppen, bei denen der Benutzer Leiter ist: Leiter auf NULL setzen
    $pdo->prepare("UPDATE gruppen SET ersteller_id = NULL WHERE ersteller_id = ?")->execute([$ziel_id]);

    // Ligen-Teilnahmen
    $pdo->prepare("DELETE FROM ligen_teilnahmen WHERE benutzer_id = ?")->execute([$ziel_id]);

    // Benutzer-Belohnungen
    $pdo->prepare("DELETE FROM benutzer_belohnungen WHERE benutzer_id = ?")->execute([$ziel_id]);

    // Favoriten
    $pdo->prepare("DELETE FROM favoriten WHERE benutzer_id = ?")->execute([$ziel_id]);

    // Fortschritt
    $pdo->prepare("DELETE FROM fortschritt WHERE benutzer_id = ?")->execute([$ziel_id]);

    // Trainings-Sitzungen (und zugehoerige Antworten ueber ON DELETE CASCADE)
    $pdo->prepare("DELETE FROM trainings_sitzungen WHERE benutzer_id = ?")->execute([$ziel_id]);

    // Aktivitaeten
    $pdo->prepare("DELETE FROM aktivitaeten WHERE benutzer_id = ?")->execute([$ziel_id]);

    // API-Tokens
    $pdo->prepare("DELETE FROM api_tokens WHERE benutzer_id = ?")->execute([$ziel_id]);

    // Statistik
    $pdo->prepare("DELETE FROM benutzer_statistik WHERE benutzer_id = ?")->execute([$ziel_id]);

    // Benutzer selbst loeschen
    $pdo->prepare("DELETE FROM benutzer WHERE id = ?")->execute([$ziel_id]);

    // Aktivitaet beim loeschenden Admin loggen
    $stmt = $pdo->prepare("
        INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung, details_json)
        VALUES (?, 'admin_aktion', ?, ?)
    ");
    $details = json_encode([
        'geloeschter_benutzer_id'   => $ziel_id,
        'geloeschter_benutzername'  => $benutzername,
    ], JSON_UNESCAPED_UNICODE);
    $stmt->execute([$benutzer['id'], "Benutzer geloescht: {$benutzername}", $details]);

    $pdo->commit();
} catch (\Throwable $e) {
    $pdo->rollBack();
    fehler_server('Benutzer konnte nicht geloescht werden: ' . $e->getMessage());
}

json_erfolg(null, "Benutzer '{$benutzername}' wurde geloescht.");
