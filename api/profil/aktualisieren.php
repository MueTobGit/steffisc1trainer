<?php
/**
 * API: Profil — Aktualisieren
 *
 * POST /api/profil/aktualisieren.php
 *
 * Eigenes Profil bearbeiten (vorname, nachname, email, spitzname, neue_vokabeln_pro_tag).
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

// --- Methode pruefen ---
methode_erzwingen('POST');

// --- Authentifizierung ---
$benutzer = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];

// --- Body lesen ---
$daten = json_body_lesen();

$pdo = db_verbindung();

// --- Felder validieren und sammeln ---
$felder = [];
$werte = [];

if (isset($daten['benutzername'])) {
    $benutzername = trim($daten['benutzername']);
    laenge_validieren($benutzername, 'benutzername', 3, 32);
    if (!preg_match('/^[a-zA-Z0-9_.-]+$/', $benutzername)) {
        fehler_ungueltige_eingabe('Benutzername darf nur Buchstaben, Zahlen, _, - und . enthalten.');
    }
    // Uniqueness prüfen
    $stmt = $pdo->prepare("SELECT id FROM benutzer WHERE LOWER(benutzername) = LOWER(?) AND id != ?");
    $stmt->execute([$benutzername, $benutzer_id]);
    if ($stmt->fetch()) {
        fehler_doppelter_eintrag('Dieser Benutzername ist bereits vergeben.');
    }
    $felder[] = 'benutzername = ?';
    $werte[] = $benutzername;
}

if (isset($daten['vorname'])) {
    $vorname = trim($daten['vorname']);
    if ($vorname !== '') laenge_validieren($vorname, 'vorname', 1, 64);
    $felder[] = 'vorname = ?';
    $werte[] = $vorname ?: null;
}

if (isset($daten['nachname'])) {
    $nachname = trim($daten['nachname']);
    if ($nachname !== '') laenge_validieren($nachname, 'nachname', 1, 64);
    $felder[] = 'nachname = ?';
    $werte[] = $nachname ?: null;
}

if (isset($daten['email'])) {
    $email = strtolower(trim($daten['email']));
    email_validieren($email);

    // Uniqueness pruefen
    $stmt = $pdo->prepare("SELECT id FROM benutzer WHERE LOWER(email) = ? AND id != ?");
    $stmt->execute([$email, $benutzer_id]);
    if ($stmt->fetch()) {
        fehler_doppelter_eintrag('Diese E-Mail-Adresse ist bereits vergeben.');
    }

    $felder[] = 'email = ?';
    $werte[] = $email;
}

if (isset($daten['spitzname'])) {
    $spitzname = trim($daten['spitzname']);
    if ($spitzname !== '') laenge_validieren($spitzname, 'spitzname', 1, 64);
    $felder[] = 'spitzname = ?';
    $werte[] = $spitzname ?: null;
}

// Neue Vokabeln pro Tag (0 = unbegrenzt)
if (isset($daten['neue_vokabeln_pro_tag'])) {
    $nvpt = (int) $daten['neue_vokabeln_pro_tag'];
    if ($nvpt < 0 || $nvpt > 1000) {
        fehler_ungueltige_eingabe('neue_vokabeln_pro_tag muss zwischen 0 und 1000 liegen (0 = unbegrenzt).');
    }
    $felder[] = 'neue_vokabeln_pro_tag = ?';
    $werte[]  = $nvpt;
}

if (empty($felder)) {
    fehler_ungueltige_eingabe('Keine Felder zum Aktualisieren angegeben.');
}

// --- Update ---
$werte[] = $benutzer_id;
$sql = "UPDATE benutzer SET " . implode(', ', $felder) . " WHERE id = ?";
$pdo->prepare($sql)->execute($werte);

json_erfolg([], 'Profil erfolgreich aktualisiert.');
