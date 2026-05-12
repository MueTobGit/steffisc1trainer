<?php
/**
 * GET /api/auth/token_pruefen.php
 *
 * Token-Gueltigkeit pruefen und Benutzerdaten zurueckgeben.
 * Wird beim App-Start aufgerufen um zu pruefen ob der
 * gespeicherte Token noch gueltig ist.
 *
 * Header: Authorization: Bearer <token>
 * Response: { erfolg: true, daten: { benutzer: {...}, statistik: {...}, konfiguration: {...} } }
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/antwort_helfer.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__, 2) . '/konfiguration/konstanten.php';
require_once dirname(__DIR__, 2) . '/konfiguration/hilfsfunktionen.php';

// Nur GET erlaubt
methode_erzwingen('GET');

// Benutzer authentifizieren
$benutzer = benutzer_authentifizieren();

$pdo = db_verbindung();

// Statistik laden
$stmt = $pdo->prepare("SELECT * FROM benutzer_statistik WHERE benutzer_id = ?");
$stmt->execute([$benutzer['id']]);
$statistik = $stmt->fetch();

// Fortschritts-Kurzinfo berechnen
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

$stat_daten = null;
if ($statistik) {
    $stat_daten = [
        'beherrschungsquote'      => $beherrschungsquote,
        'letztes_training'        => $statistik['letztes_training'],
        'gesamt_trainings'        => (int) $statistik['gesamt_trainings'],
        'gesamt_vokabeln_gelernt' => (int) $statistik['gesamt_vokabeln_gelernt'],
    ];
}

// Benutzer-Daten
$benutzer_daten = [
    'id'           => $benutzer['id'],
    'benutzername' => $benutzer['benutzername'],
    'vorname'      => $benutzer['vorname'],
    'nachname'     => $benutzer['nachname'],
    'email'        => $benutzer['email'],
    'spitzname'    => $benutzer['spitzname'],
    'rolle'        => $benutzer['rolle'],
];

// Konfiguration aus DB laden
$konfig_stmt = $pdo->query("
    SELECT schluessel, wert FROM app_konfiguration
    WHERE schluessel IN ('bewertung_modus','standard_schrift','trotzdem_richtig_limit')
");
$konfig_db = [];
foreach ($konfig_stmt->fetchAll() as $row) {
    $konfig_db[$row['schluessel']] = $row['wert'];
}

// neue_vokabeln_pro_tag aus Benutzertabelle (0 = unbegrenzt)
$nvpt_stmt = $pdo->prepare("SELECT neue_vokabeln_pro_tag FROM benutzer WHERE id = ?");
$nvpt_stmt->execute([$benutzer['id']]);
$neue_vokabeln_pro_tag = (int) $nvpt_stmt->fetchColumn();

json_erfolg([
    'benutzer'     => $benutzer_daten,
    'statistik'    => $stat_daten,
    'konfiguration' => [
        'bewertung_modus'        => $konfig_db['bewertung_modus']       ?? 'normal',
        'standard_schrift'       => $konfig_db['standard_schrift']      ?? 'klein',
        'trotzdem_richtig_limit' => isset($konfig_db['trotzdem_richtig_limit']) ? (int) $konfig_db['trotzdem_richtig_limit'] : 30,
        'neue_vokabeln_pro_tag'  => $neue_vokabeln_pro_tag,
    ],
], 'Token ist gueltig.');
