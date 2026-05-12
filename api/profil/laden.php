<?php
/**
 * API: Profil — Laden
 *
 * GET /api/profil/laden.php
 *
 * Eigenes Profil mit Statistik laden.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

// --- Methode pruefen ---
methode_erzwingen('GET');

// --- Authentifizierung ---
$benutzer = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];

$pdo = db_verbindung();

// --- Benutzer-Daten ---
$stmt = $pdo->prepare("
    SELECT id, benutzername, vorname, nachname, email, spitzname,
           rolle, erstellt_am, neue_vokabeln_pro_tag
    FROM benutzer
    WHERE id = ?
");
$stmt->execute([$benutzer_id]);
$profil = $stmt->fetch();

if (!$profil) {
    fehler_nicht_gefunden('Benutzer nicht gefunden.');
}

$profil['id']                    = (int) $profil['id'];
$profil['neue_vokabeln_pro_tag'] = (int) $profil['neue_vokabeln_pro_tag'];

// --- Statistik ---
$stmt = $pdo->prepare("
    SELECT gesamt_trainings, gesamt_vokabeln_gelernt, letztes_training
    FROM benutzer_statistik WHERE benutzer_id = ?
");
$stmt->execute([$benutzer_id]);
$statistik = $stmt->fetch();

if (!$statistik) {
    $statistik = [
        'gesamt_trainings'        => 0,
        'gesamt_vokabeln_gelernt' => 0,
        'letztes_training'        => null,
    ];
} else {
    $statistik['gesamt_trainings']        = (int) $statistik['gesamt_trainings'];
    $statistik['gesamt_vokabeln_gelernt'] = (int) $statistik['gesamt_vokabeln_gelernt'];
}

json_erfolg([
    'benutzer'  => $profil,
    'statistik' => $statistik,
]);
