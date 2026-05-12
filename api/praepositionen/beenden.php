<?php
/**
 * API: Präpositionen — Sitzung beenden
 *
 * POST /api/praepositionen/beenden.php
 * Body: { sitzung_id, anzahl_richtig, gesamt }
 *
 * Schließt die Präpositions-Sitzung ab, vergibt XP (2 pro richtige Antwort),
 * aktualisiert Streak, Level und prüft Belohnungen.
 * Identisches Muster wie schnellueben/beenden.php.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__, 2) . '/konfiguration/lern_algorithmus.php';
require_once dirname(__DIR__, 2) . '/konfiguration/hilfsfunktionen.php';

methode_erzwingen('POST');

$benutzer = benutzer_authentifizieren();
$body     = json_body_lesen();

$sitzung_id    = (int) ($body['sitzung_id'] ?? 0);
$anzahl_richtig = max(0, (int) ($body['anzahl_richtig'] ?? 0));
$gesamt        = max(0, (int) ($body['gesamt'] ?? 0));

if ($sitzung_id <= 0) {
    fehler_ungueltige_eingabe('sitzung_id fehlt.');
}

$pdo = db_verbindung();

// --- Sitzung laden und prüfen ---
$stmt = $pdo->prepare("SELECT * FROM trainings_sitzungen WHERE id = ? AND benutzer_id = ?");
$stmt->execute([$sitzung_id, $benutzer['id']]);
$sitzung = $stmt->fetch();

if (!$sitzung) {
    fehler_nicht_gefunden('Sitzung nicht gefunden.');
}
if ($sitzung['beendet_am'] !== null) {
    fehler_ungueltige_eingabe('Diese Sitzung ist bereits beendet.');
}

// XP: 2 pro richtiger Antwort (50 % des Standard-Schnellübens)
$xp_verdient = $anzahl_richtig * 2;
$genauigkeit = $gesamt > 0 ? (int) round(($anzahl_richtig / $gesamt) * 100) : 0;

// --- Sitzung abschließen ---
$pdo->prepare("
    UPDATE trainings_sitzungen
    SET beendet_am = NOW(), anzahl_fragen = ?, anzahl_richtig = ?, xp_verdient = ?
    WHERE id = ?
")->execute([$gesamt, $anzahl_richtig, $xp_verdient, $sitzung_id]);

// --- Statistik laden ---
$stmt = $pdo->prepare("SELECT * FROM benutzer_statistik WHERE benutzer_id = ?");
$stmt->execute([$benutzer['id']]);
$statistik = $stmt->fetch();

if (!$statistik) {
    $pdo->prepare("INSERT INTO benutzer_statistik (benutzer_id) VALUES (?)")->execute([$benutzer['id']]);
    $statistik = [
        'benutzer_id' => $benutzer['id'],
        'xp' => 0,
        'bronze_sterne' => 0,
        'silber_sterne' => 0,
        'gold_sterne' => 0,
        'streak_tage' => 0,
        'laengstes_streak' => 0,
        'globales_level' => 1,
        'letztes_training' => null,
        'gesamt_trainings' => 0,
        'gesamt_vokabeln_gelernt' => 0,
    ];
}

// --- XP & Sterne ---
$neues_xp = (int) $statistik['xp'] + $xp_verdient;
$sterne   = sterne_berechnen($neues_xp);

// --- Fortschritt-Zähler für Level ---
$lernpfad_schwelle = (int) konfig_wert('level_aufstieg_stufe', '3');
$gekonnt_schwelle  = (int) konfig_wert('gekonnt_schwelle', '4');

$stmt = $pdo->prepare("
    SELECT
        COUNT(DISTINCT vokabel_id) AS gesamt_geuebt,
        SUM(CASE WHEN stufe >= {$lernpfad_schwelle} THEN 1 ELSE 0 END) AS auf_stufe3plus,
        SUM(CASE WHEN stufe >= {$gekonnt_schwelle} THEN 1 ELSE 0 END) AS auf_stufe4plus
    FROM fortschritt
    WHERE benutzer_id = ?
");
$stmt->execute([$benutzer['id']]);
$fz             = $stmt->fetch();
$gesamt_gelernt  = (int) $fz['auf_stufe4plus'];
$vokabeln_geuebt = (int) $fz['gesamt_geuebt'];
$auf_stufe3plus  = (int) $fz['auf_stufe3plus'];
$beherrschungsquote = beherrschungsquote_berechnen($auf_stufe3plus, $vokabeln_geuebt);

// --- Streak ---
$min_fragen = (int) konfig_wert('min_fragen_fuer_streak', '5');
$hat_geuebt = $gesamt >= $min_fragen;
$streak_werte = streak_aktualisieren($statistik, $hat_geuebt);

// --- Level ---
$level_konfiguration = level_konfiguration_laden($pdo);
$aktuelles_level = (int) $statistik['globales_level'];
$neues_level     = level_berechnen($auf_stufe3plus, $level_konfiguration);
$level_aufstieg  = null;

if ($neues_level > $aktuelles_level) {
    $bonus_xp    = LEVEL_AUFSTIEG_BONUS_XP;
    $neues_xp   += $bonus_xp;
    $xp_verdient += $bonus_xp;
    $sterne       = sterne_berechnen($neues_xp);
    $level_aufstieg = [
        'von'      => $aktuelles_level,
        'nach'     => $neues_level,
        'bonus_xp' => $bonus_xp,
    ];
}

// --- Statistik speichern ---
$pdo->prepare("
    UPDATE benutzer_statistik
    SET xp = ?,
        bronze_sterne = ?,
        silber_sterne = ?,
        gold_sterne = ?,
        streak_tage = ?,
        laengstes_streak = ?,
        globales_level = ?,
        letztes_training = ?,
        gesamt_trainings = gesamt_trainings + 1,
        gesamt_vokabeln_gelernt = ?
    WHERE benutzer_id = ?
")->execute([
    $neues_xp,
    $sterne['bronze'],
    $sterne['silber'],
    $sterne['gold'],
    $streak_werte['streak_tage'],
    $streak_werte['laengstes_streak'],
    $neues_level,
    $streak_werte['letztes_training'],
    $gesamt_gelernt,
    $benutzer['id'],
]);

// --- Aktivität loggen ---
$pdo->prepare("
    INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung, details_json)
    VALUES (?, 'training', ?, ?)
")->execute([
    $benutzer['id'],
    "Präpositions-Training: {$anzahl_richtig}/{$gesamt} richtig, +{$xp_verdient} XP",
    json_encode([
        'sitzung_id' => $sitzung_id,
        'typ'        => 'praep',
        'fragen'     => $gesamt,
        'richtig'    => $anzahl_richtig,
        'xp'         => $xp_verdient,
        'genauigkeit'=> $genauigkeit,
    ], JSON_UNESCAPED_UNICODE),
]);

if ($level_aufstieg) {
    $pdo->prepare("
        INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung, details_json)
        VALUES (?, 'level_aufstieg', ?, ?)
    ")->execute([
        $benutzer['id'],
        "Level-Aufstieg: {$level_aufstieg['von']} → {$level_aufstieg['nach']}",
        json_encode($level_aufstieg, JSON_UNESCAPED_UNICODE),
    ]);
}

// --- Liga-Punkte ---
$stmt = $pdo->prepare("
    SELECT lt.id FROM liga_teilnehmer lt
    JOIN ligen l ON l.id = lt.liga_id
    WHERE lt.benutzer_id = ?
      AND l.aktiv = 1
      AND l.start_datum <= CURDATE()
      AND l.end_datum >= CURDATE()
    LIMIT 1
");
$stmt->execute([$benutzer['id']]);
$liga = $stmt->fetch();
if ($liga) {
    $pdo->prepare("UPDATE liga_teilnehmer SET punkte = punkte + ? WHERE id = ?")
        ->execute([$xp_verdient, (int) $liga['id']]);
}

// --- Antwort ---
json_erfolg([
    'zusammenfassung' => [
        'anzahl_fragen'    => $gesamt,
        'anzahl_richtig'   => $anzahl_richtig,
        'genauigkeit'      => $genauigkeit,
        'xp_verdient'      => $xp_verdient,
        'xp_gesamt'        => $neues_xp,
        'streak_tage'      => $streak_werte['streak_tage'],
        'sterne'           => $sterne,
        'beherrschungsquote' => $beherrschungsquote,
    ],
    'level_aufstieg' => $level_aufstieg,
]);
