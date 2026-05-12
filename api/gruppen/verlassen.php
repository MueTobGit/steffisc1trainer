<?php
/**
 * API: Gruppen — Verlassen
 *
 * POST /api/gruppen/verlassen.php
 *
 * Gruppe verlassen.
 * Einziger Admin kann nicht verlassen
 * (muss Rolle zuerst uebertragen oder Gruppe loeschen).
 * Einziger Leiter kann ebenfalls nicht verlassen, wenn keine weiteren
 * Admins/Leiter vorhanden.
 *
 * Body:
 *   - gruppen_id (Pflicht)
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

// --- Methode pruefen ---
methode_erzwingen('POST');

// --- Authentifizierung ---
$benutzer    = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];

// --- Body lesen ---
$daten = json_body_lesen();
pflichtfelder_pruefen($daten, ['gruppen_id']);

$gruppen_id = positive_ganzzahl_validieren($daten['gruppen_id'], 'gruppen_id');

$pdo = db_verbindung();

// --- Mitgliedschaft pruefen ---
$stmt = $pdo->prepare("
    SELECT rolle FROM gruppen_mitglieder
    WHERE gruppen_id = ? AND benutzer_id = ?
");
$stmt->execute([$gruppen_id, $benutzer_id]);
$mitglied = $stmt->fetch();

if (!$mitglied) {
    fehler_nicht_gefunden('Du bist kein Mitglied dieser Gruppe.');
}

// --- Letzter-Admin-Check ---
if ($mitglied['rolle'] === 'admin') {
    $stmt = $pdo->prepare("
        SELECT COUNT(*) FROM gruppen_mitglieder
        WHERE gruppen_id = ? AND rolle = 'admin' AND benutzer_id != ?
    ");
    $stmt->execute([$gruppen_id, $benutzer_id]);
    $andere_admins = (int) $stmt->fetchColumn();

    if ($andere_admins === 0) {
        fehler_ungueltige_eingabe(
            'Als einziger Admin kannst du die Gruppe nicht verlassen. Uebertrage die Admin-Rolle zuerst oder loesche die Gruppe.'
        );
    }
}

// --- Letzter-Leiter-Check (Leiter ohne anderen Leiter oder Admin) ---
if ($mitglied['rolle'] === 'leiter') {
    $stmt = $pdo->prepare("
        SELECT COUNT(*) FROM gruppen_mitglieder
        WHERE gruppen_id = ? AND rolle IN ('admin', 'leiter') AND benutzer_id != ?
    ");
    $stmt->execute([$gruppen_id, $benutzer_id]);
    $andere_leitende = (int) $stmt->fetchColumn();

    if ($andere_leitende === 0) {
        fehler_ungueltige_eingabe(
            'Als einziger Leiter kannst du die Gruppe nicht verlassen. Uebertrage die Leiter-Rolle zuerst.'
        );
    }
}

// --- Mitgliedschaft entfernen ---
$stmt = $pdo->prepare("
    DELETE FROM gruppen_mitglieder
    WHERE gruppen_id = ? AND benutzer_id = ?
");
$stmt->execute([$gruppen_id, $benutzer_id]);

json_erfolg(null, 'Gruppe verlassen.');
