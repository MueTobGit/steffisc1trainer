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

// --- Benutzer-Daten mit erstellt_am + Avatar-URL ---
$stmt = $pdo->prepare("
    SELECT b.id, b.benutzername, b.vorname, b.nachname, b.email, b.spitzname,
           b.rolle, b.media_id, b.erstellt_am,
           m.dateipfad AS avatar_pfad
    FROM benutzer b
    LEFT JOIN medien m ON m.id = b.media_id
    WHERE b.id = ?
");
$stmt->execute([$benutzer_id]);
$profil = $stmt->fetch();

if (!$profil) {
    fehler_nicht_gefunden('Benutzer nicht gefunden.');
}

$profil['id']         = (int) $profil['id'];
$profil['media_id']   = $profil['media_id'] !== null ? (int) $profil['media_id'] : null;
$profil['avatar_url'] = $profil['avatar_pfad']
    ? OEFFENTLICH_URL . '/' . $profil['avatar_pfad']
    : null;
unset($profil['avatar_pfad']);

// Neue-Vokabeln-Faktor laden (50=Entspannt, 100=Normal, 200=Intensiv, 300=Intensiv+)
$profil['neue_vokabeln_faktor'] = 100;
try {
    $stmtNv = $pdo->prepare("SELECT neue_vokabeln_faktor FROM benutzer WHERE id = ?");
    $stmtNv->execute([$benutzer_id]);
    $val = $stmtNv->fetchColumn();
    if ($val !== false) {
        $profil['neue_vokabeln_faktor'] = (int) $val;
    }
} catch (\Throwable $e) {
    // Spalte existiert noch nicht — Fallback auf alte Spalte
    try {
        $stmtNv2 = $pdo->prepare("SELECT neue_vokabeln_bonus FROM benutzer WHERE id = ?");
        $stmtNv2->execute([$benutzer_id]);
        $bonus = (int) ($stmtNv2->fetchColumn() ?: 0);
        // Alte Werte mappen: 0→100, 10→200, 20→300
        $profil['neue_vokabeln_faktor'] = $bonus === 20 ? 300 : ($bonus === 10 ? 200 : 100);
    } catch (\Throwable $e2) {
        // Auch alte Spalte fehlt
    }
}

// --- Statistik ---
$stmt = $pdo->prepare("
    SELECT xp, globales_level, streak_tage, laengstes_streak,
           bronze_sterne, silber_sterne, gold_sterne,
           gesamt_trainings, gesamt_vokabeln_gelernt, letztes_training
    FROM benutzer_statistik WHERE benutzer_id = ?
");
$stmt->execute([$benutzer_id]);
$statistik = $stmt->fetch();

if (!$statistik) {
    $statistik = [
        'xp' => 0,
        'globales_level' => 1,
        'streak_tage' => 0,
        'laengstes_streak' => 0,
        'bronze_sterne' => 0,
        'silber_sterne' => 0,
        'gold_sterne' => 0,
        'gesamt_trainings' => 0,
        'gesamt_vokabeln_gelernt' => 0,
        'letztes_training' => null,
    ];
} else {
    $statistik['xp'] = (int) $statistik['xp'];
    $statistik['globales_level'] = (int) $statistik['globales_level'];
    $statistik['streak_tage'] = (int) $statistik['streak_tage'];
    $statistik['laengstes_streak'] = (int) $statistik['laengstes_streak'];
    $statistik['bronze_sterne'] = (int) $statistik['bronze_sterne'];
    $statistik['silber_sterne'] = (int) $statistik['silber_sterne'];
    $statistik['gold_sterne'] = (int) $statistik['gold_sterne'];
    $statistik['gesamt_trainings'] = (int) $statistik['gesamt_trainings'];
    $statistik['gesamt_vokabeln_gelernt'] = (int) $statistik['gesamt_vokabeln_gelernt'];
}

json_erfolg([
    'benutzer' => $profil,
    'statistik' => $statistik,
]);
