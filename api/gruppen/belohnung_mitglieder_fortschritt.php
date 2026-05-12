<?php
/**
 * API: Gruppen — Mitglieder-Fortschritt fuer eine echte Belohnung
 *
 * GET /api/gruppen/belohnung_mitglieder_fortschritt.php?belohnung_id=X
 *
 * Fuer alle Gruppenmitglieder sichtbar.
 * Leiter/Admins sehen vollen Fortschritt, normale Mitglieder nur Freischalt-Status.
 * Prueft automatisch ob Bedingungen erfuellt sind und schaltet ggf. frei.
 * Legt ggf. Snapshot-Row fuer neues Mitglied an (lazy init).
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

methode_erzwingen('GET');

$benutzer    = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];
$belohnung_id = (int) ($_GET['belohnung_id'] ?? 0);

if ($belohnung_id <= 0) {
    fehler_ungueltige_eingabe('belohnung_id fehlt.');
}

$pdo = db_verbindung();

// --- Belohnung laden ---
$stmt = $pdo->prepare("
    SELECT id, titel, gruppen_id, bedingung_json, typ, start_datum
    FROM belohnungen
    WHERE id = ? AND typ = 'echt' AND aktiv = 1
");
$stmt->execute([$belohnung_id]);
$belohnung = $stmt->fetch();

if (!$belohnung) {
    fehler_nicht_gefunden('Belohnung nicht gefunden.');
}

$gruppen_id = (int) $belohnung['gruppen_id'];

// --- Berechtigung pruefen: Muss Mitglied der Gruppe sein ---
$stmt = $pdo->prepare("
    SELECT rolle FROM gruppen_mitglieder
    WHERE gruppen_id = ? AND benutzer_id = ?
");
$stmt->execute([$gruppen_id, $benutzer_id]);
$mitglied = $stmt->fetch();

if (!$mitglied) {
    fehler_nicht_berechtigt('Nur Gruppenmitglieder koennen den Fortschritt einsehen.');
}

$ist_leiter_global = $benutzer['rolle'] === 'admin';
$ist_leiter_gruppe = in_array($mitglied['rolle'], ['admin', 'leiter'], true);
$ist_leiter = $ist_leiter_gruppe || $ist_leiter_global;

// --- Startdatum pruefen ---
$noch_nicht_gestartet = !empty($belohnung['start_datum']) && $belohnung['start_datum'] > date('Y-m-d');

// --- Bedingung extrahieren ---
$bedingung = $belohnung['bedingung_json'] ? (json_decode($belohnung['bedingung_json'], true) ?: []) : [];
$min_streak          = (int)  ($bedingung['min_streak']          ?? 0);
$streak_relativ      = (bool) ($bedingung['streak_relativ']      ?? false);
$min_vokabeln        = (int)  ($bedingung['min_vokabeln']        ?? 0);
$vokabeln_relativ    = (bool) ($bedingung['vokabeln_relativ']    ?? false);
$min_vokabeln_geuebt = (int)  ($bedingung['min_vokabeln_geuebt'] ?? 0);

// --- Alle normalen Mitglieder mit Stats + Snapshot laden ---
$stmt = $pdo->prepare("
    SELECT
        b.id          AS benutzer_id,
        b.benutzername,
        COALESCE(bs.streak_tage, 0)              AS streak_tage,
        COALESCE(bs.gesamt_vokabeln_gelernt, 0)  AS gesamt_vokabeln_gelernt,
        (SELECT COALESCE(SUM(f.richtig_gesamt), 0) FROM fortschritt f WHERE f.benutzer_id = b.id) AS richtig_gesamt,
        bb.freigeschaltet_am,
        bb.snapshot_json
    FROM gruppen_mitglieder gm
    JOIN benutzer b ON b.id = gm.benutzer_id
    LEFT JOIN benutzer_statistik bs ON bs.benutzer_id = b.id
    LEFT JOIN benutzer_belohnungen bb
          ON bb.benutzer_id = b.id AND bb.belohnung_id = ?
    WHERE gm.gruppen_id = ?
      AND gm.rolle = 'mitglied'
      AND b.rolle != 'admin'
    ORDER BY gm.beigetreten_am ASC
");
$stmt->execute([$belohnung_id, $gruppen_id]);
$roh = $stmt->fetchAll();

// --- Auto-Freischaltung pruefen und Fortschritt pro Mitglied berechnen ---
$mitglieder = [];

foreach ($roh as $m) {
    $streak    = (int) $m['streak_tage'];
    $vokabeln  = (int) $m['gesamt_vokabeln_gelernt'];
    $geuebt    = (int) $m['richtig_gesamt'];
    $bereits_freigeschaltet = $m['freigeschaltet_am'] !== null;

    // Noch nicht gestartet → kein Tracking, kein Fortschritt
    if ($noch_nicht_gestartet) {
        $mitglieder[] = [
            'benutzer_id'    => (int) $m['benutzer_id'],
            'benutzername'   => $m['benutzername'],
            'freigeschaltet' => false,
            'freigeschaltet_am' => null,
        ];
        continue;
    }

    // Snapshot laden oder lazy anlegen
    $snap = $m['snapshot_json'] ? (json_decode($m['snapshot_json'], true) ?: null) : null;
    if ($snap === null && $m['freigeschaltet_am'] === null) {
        // Noch kein Tracking-Row: jetzt anlegen (z.B. Mitglied nach Belohnungs-Erstellung beigetreten)
        $snap = [
            'streak_tage'             => $streak,
            'gesamt_vokabeln_gelernt' => $vokabeln,
            'richtig_gesamt'          => $geuebt,
        ];
        $ins = $pdo->prepare("
            INSERT IGNORE INTO benutzer_belohnungen (benutzer_id, belohnung_id, freigeschaltet_am, snapshot_json)
            VALUES (?, ?, NULL, ?)
        ");
        $ins->execute([(int) $m['benutzer_id'], $belohnung_id, json_encode($snap)]);
    }

    // Effektive Werte berechnen (absolut oder delta)
    $eff_streak   = $streak_relativ   && $snap ? $streak - ($snap['streak_tage'] ?? 0)             : $streak;
    $eff_vokabeln = $vokabeln_relativ && $snap ? $vokabeln - ($snap['gesamt_vokabeln_gelernt'] ?? 0) : $vokabeln;
    $eff_geuebt   = $snap             ? $geuebt - ($snap['richtig_gesamt'] ?? 0)                    : $geuebt;

    // Auto-Freischaltung pruefen
    if (!$bereits_freigeschaltet) {
        $erfuellt = true;
        if ($min_streak > 0 && $eff_streak < $min_streak)             $erfuellt = false;
        if ($min_vokabeln > 0 && $eff_vokabeln < $min_vokabeln)       $erfuellt = false;
        if ($min_vokabeln_geuebt > 0 && $eff_geuebt < $min_vokabeln_geuebt) $erfuellt = false;
        if ($min_streak === 0 && $min_vokabeln === 0 && $min_vokabeln_geuebt === 0) $erfuellt = false;

        if ($erfuellt) {
            $pdo->prepare("
                INSERT INTO benutzer_belohnungen (benutzer_id, belohnung_id, freigeschaltet_am)
                VALUES (?, ?, NOW())
                ON DUPLICATE KEY UPDATE freigeschaltet_am = COALESCE(freigeschaltet_am, NOW())
            ")->execute([(int) $m['benutzer_id'], $belohnung_id]);
            $bereits_freigeschaltet = true;
            $m['freigeschaltet_am'] = date('Y-m-d H:i:s');
        }
    }

    $eintrag = [
        'benutzer_id'       => (int) $m['benutzer_id'],
        'benutzername'      => $m['benutzername'],
        'freigeschaltet'    => $bereits_freigeschaltet,
        'freigeschaltet_am' => $m['freigeschaltet_am'],
    ];

    // Leiter sehen vollen Fortschritt
    if ($ist_leiter) {
        $fortschritt_liste = [];

        if ($min_streak > 0) {
            $label = $streak_relativ ? 'Streak (seit Start)' : 'Streak';
            $fortschritt_liste[] = [
                'label'   => $label,
                'einheit' => 'Tage',
                'aktuell' => max(0, min($eff_streak, $min_streak)),
                'ziel'    => $min_streak,
                'prozent' => $min_streak > 0 ? min(100, (int) round(($eff_streak / $min_streak) * 100)) : 0,
            ];
        }
        if ($min_vokabeln > 0) {
            $label = $vokabeln_relativ ? 'Vokabeln (seit Start)' : 'Vokabeln';
            $fortschritt_liste[] = [
                'label'   => $label,
                'einheit' => '',
                'aktuell' => max(0, min($eff_vokabeln, $min_vokabeln)),
                'ziel'    => $min_vokabeln,
                'prozent' => $min_vokabeln > 0 ? min(100, (int) round(($eff_vokabeln / $min_vokabeln) * 100)) : 0,
            ];
        }
        if ($min_vokabeln_geuebt > 0) {
            $fortschritt_liste[] = [
                'label'   => 'Vokabeln geübt',
                'einheit' => '',
                'aktuell' => max(0, min($eff_geuebt, $min_vokabeln_geuebt)),
                'ziel'    => $min_vokabeln_geuebt,
                'prozent' => min(100, (int) round(($eff_geuebt / $min_vokabeln_geuebt) * 100)),
            ];
        }

        $eintrag['fortschritt_liste'] = $fortschritt_liste;
    }

    $mitglieder[] = $eintrag;
}

json_erfolg([
    'mitglieder'          => $mitglieder,
    'start_datum'         => $belohnung['start_datum'],
    'noch_nicht_gestartet' => $noch_nicht_gestartet,
]);
