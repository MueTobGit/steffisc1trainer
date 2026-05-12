<?php
/**
 * API: Belohnungen — Liste mit Freischalt-Status und Fortschritt
 *
 * GET /api/belohnungen/liste.php
 *
 * Liefert alle aktiven Belohnungen mit:
 * - Freischalt-Status und Datum fuer freigeschaltete
 * - Fortschritts-Anzeige (aktuell/ziel/prozent) fuer gesperrte
 * - Zusammenfassung (gesamt, freigeschaltet, prozent)
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

// --- 1. Alle aktiven Belohnungen laden (inkl. Gruppen-Info) ---
$stmt = $pdo->prepare("
    SELECT b.id, b.code, b.titel, b.beschreibung, b.typ, b.bild_pfad,
           b.bedingung_json, b.xp_wert, b.reihenfolge, b.gruppen_id, b.start_datum,
           g.name AS gruppen_name
    FROM belohnungen b
    LEFT JOIN gruppen g ON g.id = b.gruppen_id
    WHERE b.aktiv = 1
    ORDER BY b.reihenfolge ASC
");
$stmt->execute();
$alle_belohnungen = $stmt->fetchAll();

// --- 1b. Gruppen-Mitgliedschaften des Benutzers laden (inkl. Rolle) ---
$stmt = $pdo->prepare("SELECT gruppen_id, rolle FROM gruppen_mitglieder WHERE benutzer_id = ?");
$stmt->execute([$benutzer_id]);
$gruppen_rollen = []; // [gruppen_id => rolle]
foreach ($stmt->fetchAll() as $row) {
    $gruppen_rollen[(int) $row['gruppen_id']] = $row['rolle'];
}
$meine_gruppen = array_keys($gruppen_rollen);

// Nur Belohnungen ohne Gruppe oder aus eigenen Gruppen anzeigen
$belohnungen = array_values(array_filter($alle_belohnungen, function ($b) use ($meine_gruppen) {
    if ($b['gruppen_id'] === null) return true;
    return in_array((int) $b['gruppen_id'], $meine_gruppen);
}));

// --- 2. Freigeschaltete Belohnungen + Snapshots des Benutzers laden ---
$stmt = $pdo->prepare("
    SELECT belohnung_id, freigeschaltet_am, snapshot_json
    FROM benutzer_belohnungen
    WHERE benutzer_id = ?
");
$stmt->execute([$benutzer_id]);
$freigeschaltete = [];  // belohnung_id => freigeschaltet_am (nur wenn IS NOT NULL)
$snapshots       = [];  // belohnung_id => snapshot array
foreach ($stmt->fetchAll() as $fb) {
    $bid = (int) $fb['belohnung_id'];
    if ($fb['freigeschaltet_am'] !== null) {
        $freigeschaltete[$bid] = $fb['freigeschaltet_am'];
    }
    if ($fb['snapshot_json']) {
        $snapshots[$bid] = json_decode($fb['snapshot_json'], true) ?: null;
    }
}

// --- 3. Benutzer-Statistik fuer Fortschritt laden ---
$stmt = $pdo->prepare("SELECT * FROM benutzer_statistik WHERE benutzer_id = ?");
$stmt->execute([$benutzer_id]);
$statistik = $stmt->fetch();

// Gesamtzahl richtig beantworteter Antworten (richtig_gesamt aus fortschritt)
$stmt = $pdo->prepare("SELECT COALESCE(SUM(richtig_gesamt), 0) FROM fortschritt WHERE benutzer_id = ?");
$stmt->execute([$benutzer_id]);
$richtig_gesamt = (int) $stmt->fetchColumn();

// Anzahl der Liga-Teilnahmen (unterschiedliche Ligen)
$stmt = $pdo->prepare("SELECT COUNT(*) FROM liga_teilnehmer WHERE benutzer_id = ?");
$stmt->execute([$benutzer_id]);
$liga_teilnahmen = (int) $stmt->fetchColumn();

// Anzahl gewonnener Ligas (Rang 1 in abgeschlossenen Ligas)
$stmt = $pdo->prepare("
    SELECT COUNT(*)
    FROM liga_teilnehmer lt
    JOIN ligen l ON l.id = lt.liga_id
    WHERE lt.benutzer_id = ?
      AND l.end_datum < CURDATE()
      AND lt.punkte = (
          SELECT MAX(lt2.punkte) FROM liga_teilnehmer lt2 WHERE lt2.liga_id = lt.liga_id
      )
");
$stmt->execute([$benutzer_id]);
$liga_gewonnen = (int) $stmt->fetchColumn();

// Anzahl perfekter Sitzungen (Genauigkeit 100% mit mind. 1 Frage)
$stmt = $pdo->prepare("
    SELECT COUNT(*)
    FROM aktivitaeten
    WHERE benutzer_id = ? AND typ = 'training'
      AND JSON_EXTRACT(details_json, '$.genauigkeit') = 100
      AND JSON_EXTRACT(details_json, '$.fragen') > 0
");
$stmt->execute([$benutzer_id]);
$perfekte_sitzungen = (int) $stmt->fetchColumn();

// Anzahl Vokabeln bei denen ALLE Formen gemeistert sind
$gekonnt_schwelle = (int) konfig_wert('gekonnt_schwelle', '4');
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
$stmt->execute([$benutzer_id]);
$alle_formen_gemeistert = (int) $stmt->fetchColumn();

$stats = [
    'xp' => (int) ($statistik['xp'] ?? 0),
    'streak_tage' => (int) ($statistik['streak_tage'] ?? 0),
    'globales_level' => (int) ($statistik['globales_level'] ?? 1),
    'gesamt_vokabeln_gelernt' => (int) ($statistik['gesamt_vokabeln_gelernt'] ?? 0),
    'gesamt_trainings' => (int) ($statistik['gesamt_trainings'] ?? 0),
    'richtig_gesamt' => $richtig_gesamt,
    'liga_teilnahmen' => $liga_teilnahmen,
    'liga_gewonnen' => $liga_gewonnen,
    'perfekte_sitzungen' => $perfekte_sitzungen,
    'alle_formen_gemeistert' => $alle_formen_gemeistert,
];

// --- 4. Belohnungen aufbereiten ---
$ergebnis = [];

foreach ($belohnungen as $b) {
    $id = (int) $b['id'];
    $ist_freigeschaltet = isset($freigeschaltete[$id]);

    $eintrag = [
        'id' => $id,
        'code' => $b['code'],
        'titel' => $b['titel'],
        'beschreibung' => $b['beschreibung'],
        'typ' => $b['typ'],
        'bild_pfad' => $b['bild_pfad'],
        'xp_wert' => (int) $b['xp_wert'],
        'freigeschaltet' => $ist_freigeschaltet,
        'freigeschaltet_am' => $ist_freigeschaltet ? $freigeschaltete[$id] : null,
        'fortschritt' => null,
        'fortschritt_liste' => null,
        'gruppen_id' => $b['gruppen_id'] !== null ? (int) $b['gruppen_id'] : null,
        'gruppen_name' => $b['gruppen_name'] ?? null,
        'ist_leiter' => false,
        'kriterien' => null,
        'alle_erreicht' => false,
        'freigeschaltet_mitglieder' => 0,
        'gesamt_mitglieder' => 0,
        'start_datum' => $b['start_datum'],
        'noch_nicht_gestartet' => !empty($b['start_datum']) && $b['start_datum'] > date('Y-m-d'),
    ];

    // Leiter-Status pruefen
    if ($b['gruppen_id'] !== null) {
        $gid        = (int) $b['gruppen_id'];
        $gruppenrolle = $gruppen_rollen[$gid] ?? null;
        if ($gruppenrolle !== null && in_array($gruppenrolle, ['admin', 'leiter'], true)) {
            $eintrag['ist_leiter'] = true;
        }
        if ($benutzer['rolle'] === 'admin' && $gruppenrolle !== null) {
            $eintrag['ist_leiter'] = true;
        }
    }

    // Kriterien fuer echt-Belohnungen mitgeben
    if ($b['typ'] === 'echt' && $b['bedingung_json']) {
        $beding = json_decode($b['bedingung_json'], true) ?: [];
        $eintrag['kriterien'] = [
            'min_streak'          => (int)  ($beding['min_streak']          ?? 0),
            'streak_relativ'      => (bool) ($beding['streak_relativ']      ?? false),
            'min_vokabeln'        => (int)  ($beding['min_vokabeln']        ?? 0),
            'vokabeln_relativ'    => (bool) ($beding['vokabeln_relativ']    ?? false),
            'min_vokabeln_geuebt' => (int)  ($beding['min_vokabeln_geuebt'] ?? 0),
        ];
    }

    // --- Bidirektionale Belohnungspruefung ---
    // Nur fuer automatische Typen (nicht 'echt', nicht Leiter-Belohnungen)
    $ist_automatisch = $b['typ'] !== 'echt' && !$eintrag['ist_leiter'] && $b['bedingung_json'];

    if ($ist_automatisch) {
        $bedingung = json_decode($b['bedingung_json'], true);
        if ($bedingung) {
            $erfuellt = _bedingung_erfuellt($bedingung, $stats);

            if (!$ist_freigeschaltet && $erfuellt) {
                // Freischalten (kein Snapshot bei automatischen Belohnungen)
                $pdo->prepare("
                    INSERT INTO benutzer_belohnungen (benutzer_id, belohnung_id, freigeschaltet_am)
                    VALUES (?, ?, NOW())
                    ON DUPLICATE KEY UPDATE freigeschaltet_am = COALESCE(freigeschaltet_am, NOW())
                ")->execute([$benutzer_id, $id]);

                if ((int) $b['xp_wert'] > 0) {
                    $pdo->prepare("UPDATE benutzer_statistik SET xp = xp + ? WHERE benutzer_id = ?")
                        ->execute([(int) $b['xp_wert'], $benutzer_id]);
                }

                $eintrag['freigeschaltet'] = true;
                $eintrag['freigeschaltet_am'] = date('Y-m-d H:i:s');
                $ist_freigeschaltet = true;

            } elseif ($ist_freigeschaltet && !$erfuellt) {
                // Entziehen
                $pdo->prepare("DELETE FROM benutzer_belohnungen WHERE benutzer_id = ? AND belohnung_id = ?")
                    ->execute([$benutzer_id, $id]);

                if ((int) $b['xp_wert'] > 0) {
                    $pdo->prepare("UPDATE benutzer_statistik SET xp = GREATEST(0, xp - ?) WHERE benutzer_id = ?")
                        ->execute([(int) $b['xp_wert'], $benutzer_id]);
                }

                $eintrag['freigeschaltet'] = false;
                $eintrag['freigeschaltet_am'] = null;
                $ist_freigeschaltet = false;
            }

            // Fortschritt fuer gesperrte Belohnungen anzeigen
            if (!$ist_freigeschaltet) {
                if (isset($bedingung['min_streak']) || isset($bedingung['min_vokabeln']) || isset($bedingung['min_vokabeln_geuebt'])) {
                    $eintrag['fortschritt_liste'] = _gruppen_fortschritt_liste($bedingung, $stats, null);
                } else {
                    $eintrag['fortschritt'] = _fortschritt_berechnen($bedingung, $stats);
                }
            }
        }
    }

    // Fortschritt fuer echt-Belohnungen fuer Mitglieder (nicht Leiter, noch nicht freigeschaltet)
    if ($b['typ'] === 'echt' && !$eintrag['ist_leiter'] && !$ist_freigeschaltet && $b['bedingung_json']) {
        if ($eintrag['noch_nicht_gestartet']) {
            // Challenge hat noch nicht begonnen — kein Snapshot, kein Fortschritt
        } else {
            $beding = json_decode($b['bedingung_json'], true) ?: [];
            $snap   = $snapshots[$id] ?? null;

            if (!empty($beding)) {
                // Lazy-init Snapshot wenn noch kein Eintrag vorhanden
                if ($snap === null) {
                    $snap = [
                        'streak_tage'             => $stats['streak_tage'],
                        'gesamt_vokabeln_gelernt' => $stats['gesamt_vokabeln_gelernt'],
                        'richtig_gesamt'          => $stats['richtig_gesamt'],
                    ];
                    $pdo->prepare("
                        INSERT IGNORE INTO benutzer_belohnungen (benutzer_id, belohnung_id, freigeschaltet_am, snapshot_json)
                        VALUES (?, ?, NULL, ?)
                    ")->execute([$benutzer_id, $id, json_encode($snap)]);
                    $snapshots[$id] = $snap;
                }

                // Pruefe ob Bedingung jetzt schon erfuellt
                if (_gruppen_bedingung_erfuellt_mit_snap($beding, $stats, $snap)) {
                    $pdo->prepare("
                        INSERT INTO benutzer_belohnungen (benutzer_id, belohnung_id, freigeschaltet_am)
                        VALUES (?, ?, NOW())
                        ON DUPLICATE KEY UPDATE freigeschaltet_am = COALESCE(freigeschaltet_am, NOW())
                    ")->execute([$benutzer_id, $id]);
                    $eintrag['freigeschaltet'] = true;
                    $eintrag['freigeschaltet_am'] = date('Y-m-d H:i:s');
                    $ist_freigeschaltet = true;
                } else {
                    $eintrag['fortschritt_liste'] = _gruppen_fortschritt_liste($beding, $stats, $snap);
                }
            }
        }
    }

    $ergebnis[] = $eintrag;
}

// --- 4b. Serie-Filterung: Pro Kriterien-Typ nur nächste gesperrte anzeigen ---
$belohnungen_map = array_column($belohnungen, null, 'id');
$ergebnis = _serie_filtern($ergebnis, $belohnungen_map);

// --- 5. "Alle erreicht"-Status fuer echt-Belohnungen berechnen ---
$echt_ids = [];
foreach ($ergebnis as $e) {
    if ($e['typ'] === 'echt' && $e['gruppen_id'] !== null) {
        $echt_ids[] = $e['id'];
    }
}

$echt_stats_map = [];
if (!empty($echt_ids)) {
    $platzhalter = implode(',', array_fill(0, count($echt_ids), '?'));
    // Nur tatsaechlich freigeschaltete Rows zaehlen (freigeschaltet_am IS NOT NULL)
    $stmt = $pdo->prepare("
        SELECT b.id AS belohnung_id,
               COUNT(DISTINCT gm.benutzer_id) AS gesamt,
               COUNT(DISTINCT CASE WHEN bb.freigeschaltet_am IS NOT NULL THEN bb.benutzer_id END) AS freigeschaltet
        FROM belohnungen b
        JOIN gruppen_mitglieder gm ON gm.gruppen_id = b.gruppen_id
        LEFT JOIN benutzer_belohnungen bb
               ON bb.benutzer_id = gm.benutzer_id AND bb.belohnung_id = b.id
        WHERE b.id IN ($platzhalter)
        GROUP BY b.id
    ");
    $stmt->execute($echt_ids);
    foreach ($stmt->fetchAll() as $row) {
        $bid = (int) $row['belohnung_id'];
        $g   = (int) $row['gesamt'];
        $f   = (int) $row['freigeschaltet'];
        $echt_stats_map[$bid] = [
            'gesamt'       => $g,
            'freigeschaltet' => $f,
            'alle_erreicht'  => ($g > 0 && $f >= $g),
        ];
    }
    foreach ($ergebnis as &$e) {
        if ($e['typ'] === 'echt') {
            $s = $echt_stats_map[$e['id']] ?? null;
            $e['alle_erreicht']           = $s['alle_erreicht']  ?? false;
            $e['freigeschaltet_mitglieder'] = $s['freigeschaltet'] ?? 0;
            $e['gesamt_mitglieder']         = $s['gesamt']         ?? 0;
        }
    }
    unset($e);
}

// Leiter-Rewards zaehlen nicht in persoenliche Zusammenfassung
$zaelbare = array_filter($ergebnis, fn($e) => !$e['ist_leiter']);
$gesamt             = count($zaelbare);
$freigeschaltet_count = count(array_filter($zaelbare, fn($e) => $e['freigeschaltet']));
$prozent = $gesamt > 0 ? (int) round(($freigeschaltet_count / $gesamt) * 100) : 0;

// --- Antwort ---
json_erfolg([
    'belohnungen' => $ergebnis,
    'zusammenfassung' => [
        'gesamt' => $gesamt,
        'freigeschaltet' => $freigeschaltet_count,
        'prozent' => $prozent,
    ],
]);


// ============================================
// Hilfsfunktionen
// ============================================

/**
 * Fortschritt fuer eine gesperrte Belohnung berechnen.
 */
function _fortschritt_berechnen(array $bedingung, array $stats): ?array
{
    if (isset($bedingung['typ'])) {
        return _einzelner_fortschritt($bedingung, $stats);
    }

    if (isset($bedingung['und']) && is_array($bedingung['und'])) {
        $niedrigster = null;
        foreach ($bedingung['und'] as $teil) {
            $f = _einzelner_fortschritt($teil, $stats);
            if ($f !== null && ($niedrigster === null || $f['prozent'] < $niedrigster['prozent'])) {
                $niedrigster = $f;
            }
        }
        return $niedrigster;
    }

    return null;
}

/**
 * Fortschritt-Liste fuer Gruppen-Belohnung (berücksichtigt Snapshots für relative Kriterien).
 */
function _gruppen_fortschritt_liste(array $bedingung, array $stats, ?array $snap): array
{
    $items = [];

    $min_streak          = (int)  ($bedingung['min_streak']          ?? 0);
    $streak_relativ      = (bool) ($bedingung['streak_relativ']      ?? false);
    $min_vokabeln        = (int)  ($bedingung['min_vokabeln']        ?? 0);
    $vokabeln_relativ    = (bool) ($bedingung['vokabeln_relativ']    ?? false);
    $min_vokabeln_geuebt = (int)  ($bedingung['min_vokabeln_geuebt'] ?? 0);

    if ($min_streak > 0) {
        $eff = $streak_relativ && $snap
            ? $stats['streak_tage'] - ($snap['streak_tage'] ?? 0)
            : $stats['streak_tage'];
        $eff = max(0, $eff);
        $label = $streak_relativ ? 'Streak (seit Start)' : 'Streak';
        $items[] = [
            'label'   => $label,
            'einheit' => 'Tage',
            'aktuell' => min($eff, $min_streak),
            'ziel'    => $min_streak,
            'prozent' => min(100, (int) round(($eff / $min_streak) * 100)),
        ];
    }

    if ($min_vokabeln > 0) {
        $eff = $vokabeln_relativ && $snap
            ? $stats['gesamt_vokabeln_gelernt'] - ($snap['gesamt_vokabeln_gelernt'] ?? 0)
            : $stats['gesamt_vokabeln_gelernt'];
        $eff = max(0, $eff);
        $label = $vokabeln_relativ ? 'Vokabeln (seit Start)' : 'Vokabeln';
        $items[] = [
            'label'   => $label,
            'einheit' => '',
            'aktuell' => min($eff, $min_vokabeln),
            'ziel'    => $min_vokabeln,
            'prozent' => min(100, (int) round(($eff / $min_vokabeln) * 100)),
        ];
    }

    if ($min_vokabeln_geuebt > 0) {
        $eff = $snap
            ? $stats['richtig_gesamt'] - ($snap['richtig_gesamt'] ?? 0)
            : $stats['richtig_gesamt'];
        $eff = max(0, $eff);
        $items[] = [
            'label'   => 'Vokabeln geübt',
            'einheit' => '',
            'aktuell' => min($eff, $min_vokabeln_geuebt),
            'ziel'    => $min_vokabeln_geuebt,
            'prozent' => min(100, (int) round(($eff / $min_vokabeln_geuebt) * 100)),
        ];
    }

    return $items;
}

/**
 * Prueft ob Gruppen-Bedingung mit Snapshot-Daten erfuellt ist.
 */
function _gruppen_bedingung_erfuellt_mit_snap(array $bedingung, array $stats, ?array $snap): bool
{
    $min_streak          = (int)  ($bedingung['min_streak']          ?? 0);
    $streak_relativ      = (bool) ($bedingung['streak_relativ']      ?? false);
    $min_vokabeln        = (int)  ($bedingung['min_vokabeln']        ?? 0);
    $vokabeln_relativ    = (bool) ($bedingung['vokabeln_relativ']    ?? false);
    $min_vokabeln_geuebt = (int)  ($bedingung['min_vokabeln_geuebt'] ?? 0);

    if ($min_streak === 0 && $min_vokabeln === 0 && $min_vokabeln_geuebt === 0) return false;

    if ($min_streak > 0) {
        $eff = $streak_relativ && $snap
            ? $stats['streak_tage'] - ($snap['streak_tage'] ?? 0)
            : $stats['streak_tage'];
        if ($eff < $min_streak) return false;
    }
    if ($min_vokabeln > 0) {
        $eff = $vokabeln_relativ && $snap
            ? $stats['gesamt_vokabeln_gelernt'] - ($snap['gesamt_vokabeln_gelernt'] ?? 0)
            : $stats['gesamt_vokabeln_gelernt'];
        if ($eff < $min_vokabeln) return false;
    }
    if ($min_vokabeln_geuebt > 0) {
        $eff = $snap
            ? $stats['richtig_gesamt'] - ($snap['richtig_gesamt'] ?? 0)
            : $stats['richtig_gesamt'];
        if ($eff < $min_vokabeln_geuebt) return false;
    }

    return true;
}

/**
 * Fortschritt fuer eine einzelne Bedingung berechnen.
 */
function _einzelner_fortschritt(array $bedingung, array $stats): ?array
{
    $typ = $bedingung['typ'] ?? '';
    $ziel = (int) ($bedingung['wert'] ?? 0);

    if ($ziel <= 0) return null;

    $aktuell = match ($typ) {
        'xp_minimum', 'xp'                             => $stats['xp'],
        'streak_minimum', 'streak'                      => $stats['streak_tage'],
        'level_minimum', 'level'                        => $stats['globales_level'],
        'vokabeln_gelernt_minimum', 'vokabeln_gelernt'  => $stats['gesamt_vokabeln_gelernt'],
        'trainings_minimum', 'trainings'                => $stats['gesamt_trainings'],
        'richtig_gesamt'                                => $stats['richtig_gesamt'],
        'liga_teilnahme'                                => $stats['liga_teilnahmen'],
        'liga_gewonnen'                                 => $stats['liga_gewonnen'],
        'perfekte_sitzung'                              => $stats['perfekte_sitzungen'],
        'alle_formen'                                   => $stats['alle_formen_gemeistert'] ?? 0,
        default => 0,
    };

    $prozent = min(100, (int) round(($aktuell / $ziel) * 100));

    return [
        'aktuell' => min($aktuell, $ziel),
        'ziel' => $ziel,
        'prozent' => $prozent,
    ];
}

/**
 * Bedingung pruefen (nur fuer automatische Belohnungen ohne Snapshot-Logik).
 */
function _bedingung_erfuellt(array $bedingung, array $stats): bool
{
    if (isset($bedingung['typ'])) {
        return _einzelne_bedingung($bedingung, $stats);
    }

    // Gruppen-Format (wird hier nur fuer automatische verwendet, kein Snapshot noetig)
    if (isset($bedingung['min_streak']) || isset($bedingung['min_vokabeln']) || isset($bedingung['min_vokabeln_geuebt'])) {
        return _gruppen_bedingung_erfuellt_mit_snap($bedingung, $stats, null);
    }

    if (isset($bedingung['und']) && is_array($bedingung['und'])) {
        foreach ($bedingung['und'] as $teil) {
            if (!_einzelne_bedingung($teil, $stats)) return false;
        }
        return true;
    }

    foreach ($bedingung as $b) {
        if (is_array($b) && isset($b['typ'])) {
            if (!_einzelne_bedingung($b, $stats)) return false;
        }
    }
    return true;
}

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
        'richtig_gesamt'                               => $stats['richtig_gesamt'] >= $wert,
        'liga_teilnahme'                               => $stats['liga_teilnahmen'] >= $wert,
        'liga_gewonnen'                                => $stats['liga_gewonnen'] >= $wert,
        'perfekte_sitzung'                             => $stats['perfekte_sitzungen'] >= $wert,
        'alle_formen'                                  => ($stats['alle_formen_gemeistert'] ?? 0) >= $wert,
        default => false,
    };
}

/**
 * Versteckt in einer Serie alle gesperrten Belohnungen außer der nächsten.
 * Eine Serie = automatische Belohnungen mit gleichem bedingung_json.typ.
 * Sortierung innerhalb der Serie nach wert aufsteigend.
 * liga_rang wird bewusst ausgeschlossen (Rang 1 > Rang 3, keine lineare Serie).
 */
function _serie_filtern(array $ergebnis, array $belohnungen_map): array
{
    $serien_typen = [
        'streak', 'vokabeln_gelernt', 'richtig_gesamt', 'trainings',
        'perfekte_sitzung', 'liga_teilnahme', 'liga_gewonnen', 'level', 'xp',
    ];

    // Serien aufbauen: typ => [[id, wert, freigeschaltet], ...]
    $serien = [];
    foreach ($ergebnis as $e) {
        if ($e['typ'] === 'echt') continue;
        $raw = $belohnungen_map[$e['id']] ?? null;
        if (!$raw || !$raw['bedingung_json']) continue;
        $bed  = json_decode($raw['bedingung_json'], true);
        $typ  = $bed['typ'] ?? null;
        $wert = (int) ($bed['wert'] ?? 0);
        if (!$typ || !in_array($typ, $serien_typen, true) || $wert <= 0) continue;
        $serien[$typ][] = ['id' => $e['id'], 'wert' => $wert, 'freigeschaltet' => $e['freigeschaltet']];
    }

    // Pro Serie: alle gesperrten nach der ersten markieren
    $versteckte_ids = [];
    foreach ($serien as $eintraege) {
        if (count($eintraege) <= 1) continue;
        usort($eintraege, fn($a, $b) => $a['wert'] <=> $b['wert']);
        $erste_gesperrte_gesehen = false;
        foreach ($eintraege as $eintrag) {
            if ($eintrag['freigeschaltet']) continue;
            if (!$erste_gesperrte_gesehen) {
                $erste_gesperrte_gesehen = true;
            } else {
                $versteckte_ids[$eintrag['id']] = true;
            }
        }
    }

    if (empty($versteckte_ids)) return $ergebnis;
    return array_values(array_filter($ergebnis, fn($e) => !isset($versteckte_ids[$e['id']])));
}
