<?php
/**
 * GET /api/auth/token_pruefen.php
 *
 * Token-Gueltigkeit pruefen und Benutzerdaten zurueckgeben.
 * Wird beim App-Start aufgerufen um zu pruefen ob der
 * gespeicherte Token noch gueltig ist.
 *
 * Header: Authorization: Bearer <token>
 * Response: { erfolg: true, daten: { benutzer: {...}, statistik: {...} } }
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/antwort_helfer.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__, 2) . '/konfiguration/lern_algorithmus.php';

// Nur GET erlaubt
methode_erzwingen('GET');

// Benutzer authentifizieren
$benutzer = benutzer_authentifizieren();

// Statistik laden
$pdo = db_verbindung();
$stmt = $pdo->prepare("SELECT * FROM benutzer_statistik WHERE benutzer_id = ?");
$stmt->execute([$benutzer['id']]);
$statistik = $stmt->fetch();

// Beherrschungsquote fuer Dashboard-Startzustand berechnen
$gekonnt_schwelle = (int) konfig_wert('gekonnt_schwelle', '4');
$bq_stmt = $pdo->prepare("
    SELECT
        COUNT(DISTINCT vokabel_id) AS geuebt,
        SUM(CASE WHEN stufe >= {$gekonnt_schwelle} THEN 1 ELSE 0 END) AS auf_stufe3plus
    FROM fortschritt
    WHERE benutzer_id = ?
");
$bq_stmt->execute([$benutzer['id']]);
$bq = $bq_stmt->fetch();
$bq_geuebt = (int) ($bq['geuebt'] ?? 0);
$bq_3plus  = (int) ($bq['auf_stufe3plus'] ?? 0);
$beherrschungsquote = $bq_geuebt > 0 ? (int) round($bq_3plus / $bq_geuebt * 100) : 0;

// Statistik aufbereiten
$stat_daten = null;
if ($statistik) {
    $stat_daten = [
        'xp' => (int) $statistik['xp'],
        'bronze_sterne' => (int) $statistik['bronze_sterne'],
        'silber_sterne' => (int) $statistik['silber_sterne'],
        'gold_sterne' => (int) $statistik['gold_sterne'],
        'streak_tage' => (int) $statistik['streak_tage'],
        'laengstes_streak' => (int) $statistik['laengstes_streak'],
        'globales_level' => (int) $statistik['globales_level'],
        'beherrschungsquote' => $beherrschungsquote,
        'letztes_training' => $statistik['letztes_training'],
        'gesamt_trainings' => (int) $statistik['gesamt_trainings'],
        'gesamt_vokabeln_gelernt' => (int) $statistik['gesamt_vokabeln_gelernt'],
    ];
}

// Avatar-URL ermitteln (falls media_id gesetzt)
$avatar_url = null;
if (!empty($benutzer['media_id'])) {
    $av_stmt = $pdo->prepare("SELECT dateipfad FROM medien WHERE id = ?");
    $av_stmt->execute([$benutzer['media_id']]);
    $av_pfad = $av_stmt->fetchColumn();
    if ($av_pfad) {
        $avatar_url = OEFFENTLICH_URL . '/' . $av_pfad;
    }
}

// Beste Krone des Benutzers ermitteln (try/catch falls Migration noch aussteht)
$beste_krone     = null;
$beste_krone_typ = 'standard';
$krone_anzahl    = 0;
try {
    $krone_stmt = $pdo->prepare("
        SELECT bk.rang, l.krone_typ
        FROM benutzer_kronen bk
        JOIN ligen l ON l.id = bk.liga_id
        WHERE bk.benutzer_id = ?
        ORDER BY bk.rang ASC, bk.vergeben_am DESC
        LIMIT 1
    ");
    $krone_stmt->execute([$benutzer['id']]);
    $krone_row = $krone_stmt->fetch(\PDO::FETCH_ASSOC);
    if ($krone_row) {
        $beste_krone     = (int) $krone_row['rang'];
        $beste_krone_typ = $krone_row['krone_typ'] ?? 'standard';
    }

    $krone_anzahl_stmt = $pdo->prepare("SELECT COUNT(*) FROM benutzer_kronen WHERE benutzer_id = ?");
    $krone_anzahl_stmt->execute([$benutzer['id']]);
    $krone_anzahl = (int) $krone_anzahl_stmt->fetchColumn();
} catch (\Throwable $e) {
    // Tabelle existiert noch nicht (Migration ausstehend)
}

// Benutzer-Daten ohne Token-ID
$benutzer_daten = [
    'id' => $benutzer['id'],
    'benutzername' => $benutzer['benutzername'],
    'vorname' => $benutzer['vorname'],
    'nachname' => $benutzer['nachname'],
    'email' => $benutzer['email'],
    'spitzname' => $benutzer['spitzname'],
    'rolle' => $benutzer['rolle'],
    'media_id' => $benutzer['media_id'],
    'avatar_url' => $avatar_url,
    'beste_krone'     => $beste_krone,
    'beste_krone_typ' => $beste_krone_typ,
    'krone_anzahl'    => $krone_anzahl,
];

// Konfiguration aus DB laden (mit PHP-Konstanten als Fallback)
$konfig_stmt = $pdo->query("
    SELECT schluessel, wert FROM app_konfiguration
    WHERE schluessel IN ('xp_pro_bronze','xp_pro_silber','xp_pro_gold','bewertung_modus','lernpfad_schwelle','standard_schrift','neue_vokabeln_pro_tag','trotzdem_richtig_limit')
");
$konfig_db = [];
foreach ($konfig_stmt->fetchAll() as $row) {
    $konfig_db[$row['schluessel']] = $row['wert'];
}

// Level-Konfiguration laden (fuer Frontend-Darstellung der Level-Namen und Formen)
$lk_daten = level_konfiguration_laden($pdo);
$level_konfiguration_arr = [];
for ($l = 1; $l <= 5; $l++) {
    $level_konfiguration_arr[] = [
        'level'         => $l,
        'name'          => $lk_daten[$l]['name']          ?? '',
        'schwelle'      => $lk_daten[$l]['schwelle']      ?? 0,
        'formen'        => $lk_daten[$l]['formen']        ?? [],
        'sprachniveaus' => $lk_daten[$l]['sprachniveaus'] ?? [],
    ];
}

// Maskottchen-Saisons laden (try/catch fuer den Fall dass Migration noch nicht ausgefuehrt)
$maskottchen_saisons = [];
try {
    $saisons_stmt = $pdo->query("
        SELECT von_monat, von_tag, bis_monat, bis_tag, bild, bild_dunkel, aktiv
        FROM maskottchen_saisons
        ORDER BY reihenfolge ASC, id ASC
    ");
    foreach ($saisons_stmt->fetchAll() as $row) {
        $maskottchen_saisons[] = [
            'von_monat' => (int)  $row['von_monat'],
            'von_tag'   => (int)  $row['von_tag'],
            'bis_monat' => (int)  $row['bis_monat'],
            'bis_tag'   => (int)  $row['bis_tag'],
            'bild'        => $row['bild'],
            'bild_dunkel' => $row['bild_dunkel'] ?: '',
            'aktiv'       => (bool) $row['aktiv'],
        ];
    }
} catch (\PDOException $e) {
    // Tabelle existiert noch nicht (Migration ausstehend) → leeres Array, Fallback im Frontend
    $maskottchen_saisons = [];
}

json_erfolg([
    'benutzer' => $benutzer_daten,
    'statistik' => $stat_daten,
    'konfiguration' => [
        'xp_bronze'           => isset($konfig_db['xp_pro_bronze'])  ? (int) $konfig_db['xp_pro_bronze']  : XP_PRO_BRONZE,
        'xp_silber'           => isset($konfig_db['xp_pro_silber'])  ? (int) $konfig_db['xp_pro_silber']  : XP_PRO_SILBER,
        'xp_gold'             => isset($konfig_db['xp_pro_gold'])    ? (int) $konfig_db['xp_pro_gold']    : XP_PRO_GOLD,
        'bewertung_modus'     => $konfig_db['bewertung_modus']   ?? 'normal',
        'lernpfad_schwelle'   => isset($konfig_db['lernpfad_schwelle']) ? (int) $konfig_db['lernpfad_schwelle'] : 50,
        'standard_schrift'    => $konfig_db['standard_schrift']  ?? 'klein',
        'neue_vokabeln_pro_tag'    => isset($konfig_db['neue_vokabeln_pro_tag']) ? (int) $konfig_db['neue_vokabeln_pro_tag'] : NEUE_VOKABELN_PRO_TAG,
        'trotzdem_richtig_limit'   => isset($konfig_db['trotzdem_richtig_limit']) ? (int) $konfig_db['trotzdem_richtig_limit'] : 30,
        'c2_schwelle'         => C2_SCHWELLE,
        'maskottchen_saisons' => $maskottchen_saisons,
        'level_konfiguration' => $level_konfiguration_arr,
    ],
], 'Token ist gueltig.');
