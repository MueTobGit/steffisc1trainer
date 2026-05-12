<?php
/**
 * API: Training — Sitzung beenden
 *
 * POST /api/training/beenden.php
 * Body: { sitzung_id }
 *
 * Schliesst die Sitzung ab, aktualisiert Streak, XP, Sterne,
 * prueft Level-Aufstieg und Belohnungen.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';
require_once dirname(__DIR__, 2) . '/konfiguration/lern_algorithmus.php';
require_once dirname(__DIR__, 2) . '/konfiguration/hilfsfunktionen.php';

// --- Methode pruefen ---
methode_erzwingen('POST');

// --- Authentifizierung ---
$benutzer = benutzer_authentifizieren();

// --- Eingabe validieren ---
$body = json_body_lesen();
pflichtfelder_pruefen($body, ['sitzung_id']);

$sitzung_id = (int) $body['sitzung_id'];

$pdo = db_verbindung();

// --- Sitzung laden und pruefen ---
$stmt = $pdo->prepare("
    SELECT *
    FROM trainings_sitzungen
    WHERE id = ? AND benutzer_id = ?
");
$stmt->execute([$sitzung_id, $benutzer['id']]);
$sitzung = $stmt->fetch();

if (!$sitzung) {
    fehler_nicht_gefunden('Trainings-Sitzung nicht gefunden.');
}
if ($sitzung['beendet_am'] !== null) {
    fehler_ungueltige_eingabe('Diese Trainings-Sitzung ist bereits beendet.');
}

// --- Sitzung abschliessen ---
$stmt = $pdo->prepare("UPDATE trainings_sitzungen SET beendet_am = NOW() WHERE id = ?");
$stmt->execute([$sitzung_id]);

$anzahl_fragen = (int) $sitzung['anzahl_fragen'];
$anzahl_richtig = (int) $sitzung['anzahl_richtig'];
$xp_verdient = (int) $sitzung['xp_verdient'];
$genauigkeit = $anzahl_fragen > 0 ? (int) round(($anzahl_richtig / $anzahl_fragen) * 100) : 0;

// --- Statistik laden ---
$stmt = $pdo->prepare("SELECT * FROM benutzer_statistik WHERE benutzer_id = ?");
$stmt->execute([$benutzer['id']]);
$statistik = $stmt->fetch();

if (!$statistik) {
    $stmt = $pdo->prepare("INSERT INTO benutzer_statistik (benutzer_id) VALUES (?)");
    $stmt->execute([$benutzer['id']]);
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

// --- XP aktualisieren ---
$neues_xp = (int) $statistik['xp'] + $xp_verdient;

// Sterne berechnen
$sterne = sterne_berechnen($neues_xp);

// --- Vokabeln-Zaehler ---
// level_aufstieg_stufe (Standard 3): Mindest-Stufe fuer Level-Aufstieg + Beherrschungsquote (Ausnahme-Schwelle Lernweg)
// gekonnt_schwelle     (Standard 4): fuer "sicher gekonnt" = Belohnungen + benutzer_statistik
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
$fortschritt_zaehler = $stmt->fetch();
$gesamt_gelernt    = (int) $fortschritt_zaehler['auf_stufe4plus'];  // gekonnt_schwelle: Belohnungen + benutzer_statistik
$vokabeln_geuebt   = (int) $fortschritt_zaehler['gesamt_geuebt'];
$auf_stufe3plus    = (int) $fortschritt_zaehler['auf_stufe3plus'];  // lernpfad_schwelle: Level + Beherrschungsquote
$beherrschungsquote = beherrschungsquote_berechnen($auf_stufe3plus, $vokabeln_geuebt);

// --- Streak aktualisieren ---
$min_fragen = (int) konfig_wert('min_fragen_fuer_streak', '5');
$hat_geuebt = $anzahl_fragen >= $min_fragen;

$streak_werte = streak_aktualisieren($statistik, $hat_geuebt);

// --- Level-Konfiguration laden + Level berechnen ---
$level_konfiguration = level_konfiguration_laden($pdo);
$level_aufstieg = null;
$aktuelles_level = (int) $statistik['globales_level'];
$neues_level = level_berechnen($auf_stufe3plus, $level_konfiguration);

if ($neues_level > $aktuelles_level) {
    // Echter Aufstieg: Bonus-XP gewaehren
    $bonus_xp = LEVEL_AUFSTIEG_BONUS_XP;
    $neues_xp += $bonus_xp;
    $xp_verdient += $bonus_xp;

    // Sterne nochmal berechnen mit Bonus
    $sterne = sterne_berechnen($neues_xp);

    $level_aufstieg = [
        'von' => $aktuelles_level,
        'nach' => $neues_level,
        'bonus_xp' => $bonus_xp,
    ];
}
// Bei $neues_level < $aktuelles_level: still korrigieren, kein Bonus

// --- Statistik speichern ---
$stmt = $pdo->prepare("
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
");
$stmt->execute([
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

// --- Zusaetzliche Stats fuer Belohnungspruefung laden ---
$stmt = $pdo->prepare("SELECT COALESCE(SUM(richtig_gesamt), 0) FROM fortschritt WHERE benutzer_id = ?");
$stmt->execute([$benutzer['id']]);
$richtig_gesamt_stat = (int) $stmt->fetchColumn();

$stmt = $pdo->prepare("SELECT COUNT(*) FROM liga_teilnehmer WHERE benutzer_id = ?");
$stmt->execute([$benutzer['id']]);
$liga_teilnahmen = (int) $stmt->fetchColumn();

$stmt = $pdo->prepare("
    SELECT COUNT(*) FROM liga_teilnehmer lt
    JOIN ligen l ON l.id = lt.liga_id
    WHERE lt.benutzer_id = ? AND l.end_datum < CURDATE()
      AND lt.punkte = (SELECT MAX(lt2.punkte) FROM liga_teilnehmer lt2 WHERE lt2.liga_id = lt.liga_id)
");
$stmt->execute([$benutzer['id']]);
$liga_gewonnen = (int) $stmt->fetchColumn();

$stmt = $pdo->prepare("
    SELECT COUNT(*) FROM aktivitaeten
    WHERE benutzer_id = ? AND typ = 'training'
      AND JSON_EXTRACT(details_json, '$.genauigkeit') = 100
      AND JSON_EXTRACT(details_json, '$.fragen') > 0
");
$stmt->execute([$benutzer['id']]);
$perfekte_sitzungen = (int) $stmt->fetchColumn();

$stmt = $pdo->prepare("
    SELECT COUNT(*) FROM (
        SELECT vf.vokabel_id
        FROM vokabel_formen vf
        JOIN vokabeln v ON v.id = vf.vokabel_id AND v.aktiv = 1
        GROUP BY vf.vokabel_id
        HAVING COUNT(vf.id) >= 2
           AND vf.vokabel_id IN (
               SELECT f.vokabel_id FROM fortschritt f
               WHERE f.benutzer_id = ? AND f.stufe >= {$gekonnt_schwelle}
               GROUP BY f.vokabel_id
               HAVING COUNT(f.id) >= 2
           )
    ) AS gemeistert
");
$stmt->execute([$benutzer['id']]);
$alle_formen_gemeistert = (int) $stmt->fetchColumn();

// --- Belohnungen pruefen ---
$neue_belohnungen = _belohnungen_pruefen($pdo, $benutzer['id'], $benutzer['rolle'], [
    'xp' => $neues_xp,
    'streak_tage' => $streak_werte['streak_tage'],
    'globales_level' => $neues_level,
    'gesamt_vokabeln_gelernt' => $gesamt_gelernt,
    'gesamt_trainings' => (int) $statistik['gesamt_trainings'] + 1,
    'genauigkeit' => $genauigkeit,
    'anzahl_fragen' => $anzahl_fragen,
    'richtig_gesamt' => $richtig_gesamt_stat,
    'liga_teilnahmen' => $liga_teilnahmen,
    'liga_gewonnen' => $liga_gewonnen,
    'perfekte_sitzungen' => $perfekte_sitzungen,
    'alle_formen_gemeistert' => $alle_formen_gemeistert,
]);

// --- Aktivitaet loggen ---
$stmt = $pdo->prepare("
    INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung, details_json)
    VALUES (?, 'training', ?, ?)
");
$beschreibung = "Training abgeschlossen: {$anzahl_richtig}/{$anzahl_fragen} richtig, +{$xp_verdient} XP";
$details = json_encode([
    'sitzung_id' => $sitzung_id,
    'typ' => $sitzung['typ'],
    'fragen' => $anzahl_fragen,
    'richtig' => $anzahl_richtig,
    'xp' => $xp_verdient,
    'genauigkeit' => $genauigkeit,
], JSON_UNESCAPED_UNICODE);
$stmt->execute([$benutzer['id'], $beschreibung, $details]);

// Level-Aufstieg auch loggen
if ($level_aufstieg) {
    $stmt = $pdo->prepare("
        INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung, details_json)
        VALUES (?, 'level_aufstieg', ?, ?)
    ");
    $level_beschreibung = "Level-Aufstieg: {$level_aufstieg['von']} → {$level_aufstieg['nach']}";
    $level_details = json_encode($level_aufstieg, JSON_UNESCAPED_UNICODE);
    $stmt->execute([$benutzer['id'], $level_beschreibung, $level_details]);
}

// --- Liga-Punkte aktualisieren ---
$stmt = $pdo->prepare("
    SELECT lt.id
    FROM liga_teilnehmer lt
    JOIN ligen l ON l.id = lt.liga_id
    WHERE lt.benutzer_id = ?
      AND l.aktiv = 1
      AND l.start_datum <= CURDATE()
      AND l.end_datum >= CURDATE()
    LIMIT 1
");
$stmt->execute([$benutzer['id']]);
$liga_teilnahme = $stmt->fetch();

if ($liga_teilnahme) {
    $pdo->prepare("UPDATE liga_teilnehmer SET punkte = punkte + ? WHERE id = ?")
        ->execute([$xp_verdient, (int) $liga_teilnahme['id']]);
}

// --- Antwort ---
json_erfolg([
    'zusammenfassung' => [
        'anzahl_fragen' => $anzahl_fragen,
        'anzahl_richtig' => $anzahl_richtig,
        'genauigkeit' => $genauigkeit,
        'xp_verdient' => $xp_verdient,
        'xp_gesamt' => $neues_xp,
        'streak_tage' => $streak_werte['streak_tage'],
        'sterne' => $sterne,
        'beherrschungsquote' => $beherrschungsquote,
    ],
    'level_aufstieg' => $level_aufstieg,
    'neue_belohnungen' => $neue_belohnungen,
]);

// ==========================================================
// Belohnungs-Pruefung
// ==========================================================

/**
 * Belohnungen pruefen und freischalten
 */
function _belohnungen_pruefen(PDO $pdo, int $benutzer_id, string $globale_rolle, array $stats): array
{
    // Bereits freigeschaltete Belohnungen laden (nur IS NOT NULL)
    $stmt = $pdo->prepare("SELECT belohnung_id FROM benutzer_belohnungen WHERE benutzer_id = ? AND freigeschaltet_am IS NOT NULL");
    $stmt->execute([$benutzer_id]);
    $freigeschaltet = [];
    while ($zeile = $stmt->fetch()) {
        $freigeschaltet[] = (int) $zeile['belohnung_id'];
    }

    // Gruppen-Mitgliedschaften inkl. Rolle laden
    $stmt = $pdo->prepare("SELECT gruppen_id, rolle FROM gruppen_mitglieder WHERE benutzer_id = ?");
    $stmt->execute([$benutzer_id]);
    $gruppen_rollen = []; // [gruppen_id => rolle]
    while ($zeile = $stmt->fetch()) {
        $gruppen_rollen[(int) $zeile['gruppen_id']] = $zeile['rolle'];
    }

    // Alle aktiven Belohnungen laden
    $stmt = $pdo->query("SELECT * FROM belohnungen WHERE aktiv = 1 ORDER BY reihenfolge");
    $alle_belohnungen = $stmt->fetchAll();

    $neue = [];

    foreach ($alle_belohnungen as $belohnung) {
        $bid = (int) $belohnung['id'];

        // Bereits freigeschaltet? Ueberspringen
        if (in_array($bid, $freigeschaltet)) continue;

        // Gruppen-Belohnung pruefen
        if ($belohnung['gruppen_id'] !== null) {
            $gid          = (int) $belohnung['gruppen_id'];
            $gruppe_rolle = $gruppen_rollen[$gid] ?? null;

            // Nicht Mitglied der Gruppe → ueberspringen
            if ($gruppe_rolle === null) continue;

            // Leiter/Admin der Gruppe → kein Anspruch (sie motivieren die Gruppe)
            if (in_array($gruppe_rolle, ['admin', 'leiter'], true)) continue;

            // Globaler Admin als Mitglied → ebenfalls kein Anspruch
            if ($globale_rolle === 'admin') continue;
        }

        // Bedingung pruefen
        $bedingung = $belohnung['bedingung_json'] ? json_decode($belohnung['bedingung_json'], true) : null;
        if (!$bedingung) continue;

        // Snapshot fuer Gruppen-Belohnungen mit relativen Kriterien laden / anlegen
        $snapshot = null;
        if ($belohnung['gruppen_id'] !== null) {
            $stmt_snap = $pdo->prepare("SELECT freigeschaltet_am, snapshot_json FROM benutzer_belohnungen WHERE benutzer_id = ? AND belohnung_id = ?");
            $stmt_snap->execute([$benutzer_id, $bid]);
            $snap_row = $stmt_snap->fetch();

            if ($snap_row) {
                $snapshot = $snap_row['snapshot_json'] ? (json_decode($snap_row['snapshot_json'], true) ?: null) : null;
            } else {
                // Lazy-init Snapshot anlegen
                $snapshot = [
                    'streak_tage'             => $stats['streak_tage'],
                    'gesamt_vokabeln_gelernt' => $stats['gesamt_vokabeln_gelernt'],
                    'richtig_gesamt'          => $stats['richtig_gesamt'],
                ];
                $pdo->prepare("
                    INSERT IGNORE INTO benutzer_belohnungen (benutzer_id, belohnung_id, freigeschaltet_am, snapshot_json)
                    VALUES (?, ?, NULL, ?)
                ")->execute([$benutzer_id, $bid, json_encode($snapshot)]);
            }
        }

        $erfuellt = _bedingung_erfuellt($bedingung, $stats, $snapshot);

        if ($erfuellt) {
            // Belohnung freischalten
            $stmt2 = $pdo->prepare("
                INSERT INTO benutzer_belohnungen (benutzer_id, belohnung_id, freigeschaltet_am)
                VALUES (?, ?, NOW())
                ON DUPLICATE KEY UPDATE freigeschaltet_am = COALESCE(freigeschaltet_am, NOW())
            ");
            $stmt2->execute([$benutzer_id, $bid]);

            // XP-Bonus der Belohnung
            if ((int) $belohnung['xp_wert'] > 0) {
                $stmt2 = $pdo->prepare("
                    UPDATE benutzer_statistik SET xp = xp + ? WHERE benutzer_id = ?
                ");
                $stmt2->execute([(int) $belohnung['xp_wert'], $benutzer_id]);
            }

            // Aktivitaet loggen
            $stmt2 = $pdo->prepare("
                INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung)
                VALUES (?, 'belohnung', ?)
            ");
            $stmt2->execute([$benutzer_id, 'Belohnung freigeschaltet: ' . $belohnung['titel']]);

            $neue[] = [
                'titel' => $belohnung['titel'],
                'beschreibung' => $belohnung['beschreibung'],
                'bild_pfad' => $belohnung['bild_pfad'],
                'typ' => $belohnung['typ'],
            ];
        }
    }

    return $neue;
}

/**
 * Bedingung pruefen (mit optionalem Snapshot fuer relative Gruppen-Kriterien)
 */
function _bedingung_erfuellt(array $bedingung, array $stats, ?array $snapshot = null): bool
{
    if (isset($bedingung['typ'])) {
        return _einzelne_bedingung($bedingung, $stats);
    }

    // Gruppen-Belohnung-Format: relative oder absolute Kriterien
    if (isset($bedingung['min_streak']) || isset($bedingung['min_vokabeln']) || isset($bedingung['min_vokabeln_geuebt'])) {
        return _gruppen_bedingung_erfuellt($bedingung, $stats, $snapshot);
    }

    foreach ($bedingung as $b) {
        if (is_array($b) && isset($b['typ'])) {
            if (!_einzelne_bedingung($b, $stats)) {
                return false;
            }
        }
    }
    return true;
}

/**
 * Gruppen-Belohnung-Bedingung auswerten (berücksichtigt relative Kriterien via Snapshot)
 */
function _gruppen_bedingung_erfuellt(array $bedingung, array $stats, ?array $snapshot = null): bool
{
    $min_streak          = (int)  ($bedingung['min_streak']          ?? 0);
    $streak_relativ      = (bool) ($bedingung['streak_relativ']      ?? false);
    $min_vokabeln        = (int)  ($bedingung['min_vokabeln']        ?? 0);
    $vokabeln_relativ    = (bool) ($bedingung['vokabeln_relativ']    ?? false);
    $min_vokabeln_geuebt = (int)  ($bedingung['min_vokabeln_geuebt'] ?? 0);

    if ($min_streak === 0 && $min_vokabeln === 0 && $min_vokabeln_geuebt === 0) return false;

    if ($min_streak > 0) {
        $eff = $streak_relativ && $snapshot
            ? $stats['streak_tage'] - ($snapshot['streak_tage'] ?? 0)
            : $stats['streak_tage'];
        if ($eff < $min_streak) return false;
    }
    if ($min_vokabeln > 0) {
        $eff = $vokabeln_relativ && $snapshot
            ? $stats['gesamt_vokabeln_gelernt'] - ($snapshot['gesamt_vokabeln_gelernt'] ?? 0)
            : $stats['gesamt_vokabeln_gelernt'];
        if ($eff < $min_vokabeln) return false;
    }
    if ($min_vokabeln_geuebt > 0) {
        $eff = $snapshot
            ? $stats['richtig_gesamt'] - ($snapshot['richtig_gesamt'] ?? 0)
            : $stats['richtig_gesamt'];
        if ($eff < $min_vokabeln_geuebt) return false;
    }

    return true;
}

/**
 * Einzelne Bedingung auswerten
 */
function _einzelne_bedingung(array $bedingung, array $stats): bool
{
    $typ  = $bedingung['typ'] ?? '';
    $wert = (int) ($bedingung['wert'] ?? 0);

    return match ($typ) {
        'xp_minimum', 'xp'                            => $stats['xp'] >= $wert,
        'streak_minimum', 'streak'                     => $stats['streak_tage'] >= $wert,
        'level_minimum', 'level'                       => $stats['globales_level'] >= $wert,
        'vokabeln_gelernt_minimum', 'vokabeln_gelernt' => $stats['gesamt_vokabeln_gelernt'] >= $wert,
        'trainings_minimum', 'trainings'               => $stats['gesamt_trainings'] >= $wert,
        'richtig_gesamt'                               => ($stats['richtig_gesamt'] ?? 0) >= $wert,
        'liga_teilnahme'                               => ($stats['liga_teilnahmen'] ?? 0) >= $wert,
        'liga_gewonnen'                                => ($stats['liga_gewonnen'] ?? 0) >= $wert,
        'perfekte_sitzung'                             => $stats['genauigkeit'] === 100 && $stats['anzahl_fragen'] >= ($wert ?: 5),
        'alle_formen'                                  => ($stats['alle_formen_gemeistert'] ?? 0) >= $wert,
        default => false,
    };
}
