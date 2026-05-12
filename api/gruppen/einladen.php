<?php
/**
 * API: Gruppen — Einladen
 *
 * POST /api/gruppen/einladen.php
 *
 * Benutzer per E-Mail in eine Gruppe einladen.
 * Nur Admin/Leiter duerfen einladen.
 *
 * Body:
 *   - gruppen_id (Pflicht)
 *   - email (Pflicht)
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

// --- Methode pruefen ---
methode_erzwingen('POST');

// --- Authentifizierung ---
$benutzer = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];

// --- Body lesen ---
$daten = json_body_lesen();
pflichtfelder_pruefen($daten, ['gruppen_id', 'email']);

$gruppen_id = positive_ganzzahl_validieren($daten['gruppen_id'], 'gruppen_id');
email_validieren(trim($daten['email']));
$email = strtolower(trim($daten['email']));

$pdo = db_verbindung();

// --- Gruppe pruefen ---
$stmt = $pdo->prepare("SELECT * FROM gruppen WHERE id = ? AND aktiv = 1");
$stmt->execute([$gruppen_id]);
$gruppe = $stmt->fetch();

if (!$gruppe) {
    fehler_nicht_gefunden('Gruppe nicht gefunden.');
}

// --- Berechtigung pruefen ---
if (!gruppen_rolle_pruefen($benutzer_id, $gruppen_id, ['admin', 'leiter'])) {
    fehler_nicht_berechtigt('Nur Admins und Leiter duerfen Mitglieder einladen.');
}

// --- Bereits Mitglied? ---
$stmt = $pdo->prepare("
    SELECT gm.id FROM gruppen_mitglieder gm
    JOIN benutzer b ON b.id = gm.benutzer_id
    WHERE gm.gruppen_id = ? AND LOWER(b.email) = ?
");
$stmt->execute([$gruppen_id, $email]);
if ($stmt->fetch()) {
    fehler_doppelter_eintrag('Diese Person ist bereits Mitglied der Gruppe.');
}

// --- Max Mitglieder pruefen ---
$stmt = $pdo->prepare("SELECT COUNT(*) FROM gruppen_mitglieder WHERE gruppen_id = ?");
$stmt->execute([$gruppen_id]);
$aktuelle_anzahl = (int) $stmt->fetchColumn();

if ($aktuelle_anzahl >= (int) $gruppe['max_mitglieder']) {
    fehler_ungueltige_eingabe('Die Gruppe hat die maximale Mitgliederzahl erreicht.');
}

// --- Bestehende offene Einladungen dieser Gruppe ablaufen lassen ---
$stmt = $pdo->prepare("
    UPDATE gruppen_einladungen SET status = 'abgelaufen'
    WHERE gruppen_id = ? AND status = 'offen'
");
$stmt->execute([$gruppen_id]);

// --- Token generieren + Einladung erstellen (60 Minuten gueltig) ---
$token = bin2hex(random_bytes(32));
$gueltig_bis = date('Y-m-d H:i:s', strtotime('+60 minutes'));

$stmt = $pdo->prepare("
    INSERT INTO gruppen_einladungen (gruppen_id, eingeladen_von, email, token, gueltig_bis)
    VALUES (?, ?, ?, ?, ?)
");
$stmt->execute([$gruppen_id, $benutzer_id, $email, $token, $gueltig_bis]);

json_erfolg([
    'token' => $token,
    'email' => $email,
    'gueltig_bis' => $gueltig_bis,
    'gruppen_name' => $gruppe['name'],
], 'Einladung erfolgreich erstellt.');
