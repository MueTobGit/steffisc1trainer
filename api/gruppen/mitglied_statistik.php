<?php
/**
 * API: Gruppen — Mitglied-Statistik
 *
 * GET /api/gruppen/mitglied_statistik.php?gruppen_id=X&benutzer_id=Y
 *
 * Gibt vereinfachte Statistiken eines Gruppenmitglieds zurueck.
 * Nur Mitglieder derselben Gruppe duerfen die Stats sehen.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';

methode_erzwingen('GET');

$anfragender     = benutzer_authentifizieren();
$anfragender_id  = (int) $anfragender['id'];

$gruppen_id  = (int) ($_GET['gruppen_id']  ?? 0);
$ziel_id     = (int) ($_GET['benutzer_id'] ?? 0);

if ($gruppen_id < 1 || $ziel_id < 1) {
    fehler_ungueltige_eingabe('gruppen_id und benutzer_id sind erforderlich.');
}

$pdo = db_verbindung();

// Anfragender muss Mitglied der Gruppe sein
if (!ist_admin($anfragender) && !gruppen_rolle_pruefen($anfragender_id, $gruppen_id, ['admin', 'leiter', 'mitglied'])) {
    fehler_nicht_berechtigt('Du bist kein Mitglied dieser Gruppe.');
}

// Ziel-Benutzer muss ebenfalls Mitglied der Gruppe sein
if (!gruppen_rolle_pruefen($ziel_id, $gruppen_id, ['admin', 'leiter', 'mitglied'])) {
    fehler_nicht_gefunden('Dieses Mitglied gehoert nicht zur Gruppe.');
}

// --- Benutzer-Basisinfos ---
$stmt = $pdo->prepare("SELECT benutzername, spitzname FROM benutzer WHERE id = ? AND aktiv = 1");
$stmt->execute([$ziel_id]);
$ziel = $stmt->fetch();
if (!$ziel) {
    fehler_nicht_gefunden('Benutzer nicht gefunden.');
}

// --- Statistik ---
$stmt = $pdo->prepare("SELECT * FROM benutzer_statistik WHERE benutzer_id = ?");
$stmt->execute([$ziel_id]);
$stats = $stmt->fetch();

if (!$stats) {
    $stats = [
        'xp' => 0, 'bronze_sterne' => 0, 'silber_sterne' => 0, 'gold_sterne' => 0,
        'streak_tage' => 0, 'globales_level' => 1, 'letztes_training' => null,
        'gesamt_trainings' => 0, 'gesamt_vokabeln_gelernt' => 0,
    ];
}

// --- Genauigkeit + letztes Training aus Trainings-Sitzungen ---
$stmt = $pdo->prepare("
    SELECT
        COALESCE(SUM(anzahl_fragen), 0) AS gesamt_fragen,
        COALESCE(SUM(anzahl_richtig), 0) AS gesamt_richtig,
        MAX(beendet_am) AS letztes_training
    FROM trainings_sitzungen
    WHERE benutzer_id = ? AND beendet_am IS NOT NULL
");
$stmt->execute([$ziel_id]);
$trainings = $stmt->fetch();

$gesamt_fragen  = (int) $trainings['gesamt_fragen'];
$gesamt_richtig = (int) $trainings['gesamt_richtig'];
$genauigkeit    = $gesamt_fragen > 0
    ? (int) round(($gesamt_richtig / $gesamt_fragen) * 100)
    : 0;

// --- Gelernte Vokabeln ---
$stmt = $pdo->prepare("
    SELECT COUNT(DISTINCT vokabel_id) AS vokabeln_gelernt
    FROM fortschritt WHERE benutzer_id = ?
");
$stmt->execute([$ziel_id]);
$vok_row = $stmt->fetch();

// --- Aktuelle Liga-Teilnahme ---
$liga_info = null;
$stmt = $pdo->prepare("
    SELECT l.name AS liga_name, lt.punkte, lt.beigetreten_am
    FROM liga_teilnehmer lt
    JOIN ligen l ON l.id = lt.liga_id
    WHERE lt.benutzer_id = ?
      AND l.aktiv = 1
      AND l.start_datum <= CURDATE()
      AND l.end_datum   >= CURDATE()
    ORDER BY l.id DESC
    LIMIT 1
");
$stmt->execute([$ziel_id]);
$liga = $stmt->fetch();

if ($liga) {
    // Rang berechnen
    $stmt2 = $pdo->prepare("
        SELECT lt.liga_id FROM liga_teilnehmer lt
        JOIN ligen l ON l.id = lt.liga_id
        WHERE lt.benutzer_id = ?
          AND l.aktiv = 1 AND l.start_datum <= CURDATE() AND l.end_datum >= CURDATE()
        ORDER BY l.id DESC LIMIT 1
    ");
    $stmt2->execute([$ziel_id]);
    $liga_id_row = $stmt2->fetch();
    if ($liga_id_row) {
        $liga_id = (int) $liga_id_row['liga_id'];
        $stmt3 = $pdo->prepare("
            SELECT COUNT(*) + 1 FROM liga_teilnehmer
            WHERE liga_id = ? AND punkte > ?
        ");
        $stmt3->execute([$liga_id, (int) $liga['punkte']]);
        $rang = (int) $stmt3->fetchColumn();
        $liga_info = [
            'name'   => $liga['liga_name'],
            'punkte' => (int) $liga['punkte'],
            'rang'   => $rang,
        ];
    }
}

json_erfolg([
    'benutzername'       => $ziel['spitzname'] ?: $ziel['benutzername'],
    'xp'                 => (int) $stats['xp'],
    'globales_level'     => (int) $stats['globales_level'],
    'streak_tage'        => (int) $stats['streak_tage'],
    'bronze_sterne'      => (int) $stats['bronze_sterne'],
    'silber_sterne'      => (int) $stats['silber_sterne'],
    'gold_sterne'        => (int) $stats['gold_sterne'],
    'vokabeln_gelernt'   => (int) ($vok_row['vokabeln_gelernt'] ?? 0),
    'genauigkeit'        => $genauigkeit,
    'gesamt_trainings'   => (int) $stats['gesamt_trainings'],
    'letztes_training'   => $trainings['letztes_training'],
    'liga'               => $liga_info,
]);
