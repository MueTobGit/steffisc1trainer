<?php
/**
 * API: Gruppen — Echte Belohnung erstellen
 *
 * POST /api/gruppen/belohnung_erstellen.php
 *
 * Nur Gruppenleiter oder Admin.
 * Body: gruppen_id, titel, beschreibung?, xp_wert?, reihenfolge?
 * Kriterien: min_streak, streak_relativ, min_vokabeln, vokabeln_relativ, min_vokabeln_geuebt
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

methode_erzwingen('POST');

$benutzer    = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];

$body        = json_body_lesen();
$gruppen_id  = (int) ($body['gruppen_id'] ?? 0);
$titel       = trim($body['titel'] ?? '');
$beschreibung = trim($body['beschreibung'] ?? '');
$reihenfolge = max(0, (int) ($body['reihenfolge'] ?? 0));

// Kriterien: absolut oder relativ (delta seit Erstellung)
$min_streak          = max(0, (int) ($body['min_streak']          ?? 0));
$streak_relativ      = !empty($body['streak_relativ']);
$min_vokabeln        = max(0, (int) ($body['min_vokabeln']        ?? 0));
$vokabeln_relativ    = !empty($body['vokabeln_relativ']);
$min_vokabeln_geuebt = max(0, (int) ($body['min_vokabeln_geuebt'] ?? 0)); // immer relativ
$start_datum = !empty($body['start_datum']) ? trim($body['start_datum']) : null;
if ($start_datum !== null && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $start_datum)) {
    fehler_ungueltige_eingabe('start_datum muss im Format YYYY-MM-DD sein.');
}

if ($gruppen_id <= 0) {
    fehler_ungueltige_eingabe('gruppen_id fehlt.');
}
if (!$titel) {
    fehler_ungueltige_eingabe('Titel ist ein Pflichtfeld.');
}
if ($min_streak === 0 && $min_vokabeln === 0 && $min_vokabeln_geuebt === 0) {
    fehler_ungueltige_eingabe('Mindestens ein Kriterium (Streak, Vokabeln oder Vokabeln geuebt) muss groesser als 0 sein.');
}

$pdo = db_verbindung();

// Gruppe prüfen
$stmt = $pdo->prepare("SELECT id FROM gruppen WHERE id = ? AND aktiv = 1");
$stmt->execute([$gruppen_id]);
if (!$stmt->fetch()) {
    fehler_nicht_gefunden('Gruppe nicht gefunden.');
}

// Berechtigung: Leiter/Admin
$stmt = $pdo->prepare("
    SELECT rolle FROM gruppen_mitglieder
    WHERE gruppen_id = ? AND benutzer_id = ?
");
$stmt->execute([$gruppen_id, $benutzer_id]);
$mitglied = $stmt->fetch();

$ist_leiter = $mitglied && in_array($mitglied['rolle'], ['admin', 'leiter'], true);
if (!$ist_leiter && $benutzer['rolle'] !== 'admin') {
    fehler_nicht_berechtigt('Nur Gruppenleiter können Belohnungen verwalten.');
}

// Eindeutigen Code erzeugen
$code = 'gruppe_' . $gruppen_id . '_' . time() . '_' . rand(100, 999);

// Kriterien als JSON speichern
$bedingung = [
    'min_streak'          => $min_streak,
    'streak_relativ'      => $streak_relativ,
    'min_vokabeln'        => $min_vokabeln,
    'vokabeln_relativ'    => $vokabeln_relativ,
    'min_vokabeln_geuebt' => $min_vokabeln_geuebt,
];

$stmt = $pdo->prepare("
    INSERT INTO belohnungen (code, titel, beschreibung, typ, gruppen_id, bedingung_json, xp_wert, reihenfolge, aktiv, start_datum)
    VALUES (?, ?, ?, 'echt', ?, ?, 0, ?, 1, ?)
");
$stmt->execute([
    $code,
    $titel,
    $beschreibung ?: null,
    $gruppen_id,
    json_encode($bedingung),
    $reihenfolge,
    $start_datum,
]);

$neue_id = (int) $pdo->lastInsertId();

// Snapshot-Rows nur anlegen wenn Challenge bereits gestartet ist.
// Bei zukünftigem start_datum werden Snapshots lazy beim ersten Aufruf gezogen.
$heute = date('Y-m-d');
if ($start_datum === null || $start_datum <= $heute) {
    $stmt = $pdo->prepare("
        SELECT
            b.id AS benutzer_id,
            COALESCE(bs.streak_tage, 0)             AS streak_tage,
            COALESCE(bs.gesamt_vokabeln_gelernt, 0) AS gesamt_vokabeln_gelernt,
            (SELECT COALESCE(SUM(f.richtig_gesamt), 0) FROM fortschritt f WHERE f.benutzer_id = b.id) AS richtig_gesamt
        FROM gruppen_mitglieder gm
        JOIN benutzer b ON b.id = gm.benutzer_id
        LEFT JOIN benutzer_statistik bs ON bs.benutzer_id = b.id
        WHERE gm.gruppen_id = ?
          AND gm.rolle = 'mitglied'
          AND b.rolle != 'admin'
    ");
    $stmt->execute([$gruppen_id]);
    $mitglieder = $stmt->fetchAll();

    $ins = $pdo->prepare("
        INSERT IGNORE INTO benutzer_belohnungen (benutzer_id, belohnung_id, freigeschaltet_am, snapshot_json)
        VALUES (?, ?, NULL, ?)
    ");
    foreach ($mitglieder as $m) {
        $snapshot = json_encode([
            'streak_tage'             => (int) $m['streak_tage'],
            'gesamt_vokabeln_gelernt' => (int) $m['gesamt_vokabeln_gelernt'],
            'richtig_gesamt'          => (int) $m['richtig_gesamt'],
        ]);
        $ins->execute([(int) $m['benutzer_id'], $neue_id, $snapshot]);
    }
}

json_erfolg(['id' => $neue_id, 'code' => $code], 'Belohnung erstellt.');
