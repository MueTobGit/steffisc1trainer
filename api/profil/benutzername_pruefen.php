<?php
/**
 * API: Profil — Benutzername-Verfügbarkeit prüfen
 *
 * GET /api/profil/benutzername_pruefen.php?benutzername=<name>
 *
 * Prüft ob ein Benutzername bereits vergeben ist.
 * Erfordert Authentifizierung (eigener Name ist immer "verfügbar").
 *
 * Response: { erfolg: true, daten: { verfuegbar: bool } }
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

// --- Methode pruefen ---
methode_erzwingen('GET');

// --- Authentifizierung ---
$benutzer = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];

// --- Parameter lesen ---
$benutzername = trim($_GET['benutzername'] ?? '');

if ($benutzername === '') {
    fehler_ungueltige_eingabe('Benutzername fehlt.');
}

// Grundvalidierung
if (strlen($benutzername) < 3 || strlen($benutzername) > 32) {
    json_erfolg(['verfuegbar' => false, 'hinweis' => 'Benutzername muss 3–32 Zeichen lang sein.']);
    exit;
}

if (!preg_match('/^[a-zA-Z0-9_.-]+$/', $benutzername)) {
    json_erfolg(['verfuegbar' => false, 'hinweis' => 'Nur Buchstaben, Zahlen, _, - und . erlaubt.']);
    exit;
}

// --- Datenbank prüfen (eigener Name gilt als verfügbar) ---
$pdo = db_verbindung();
$stmt = $pdo->prepare("SELECT id FROM benutzer WHERE LOWER(benutzername) = LOWER(?) AND id != ?");
$stmt->execute([$benutzername, $benutzer_id]);
$gefunden = $stmt->fetch();

json_erfolg([
    'verfuegbar' => !$gefunden,
]);
