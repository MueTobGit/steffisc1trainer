<?php
/**
 * API: Training — Antwort bewerten
 *
 * POST /api/training/antwort.php
 * Body: { sitzung_id, vokabel_id, richtung, eingabe, erwartet, synonyme, typ, trotzdem_richtig }
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';
require_once dirname(__DIR__, 2) . '/konfiguration/lern_algorithmus.php';
require_once dirname(__DIR__, 2) . '/konfiguration/hilfsfunktionen.php';

methode_erzwingen('POST');
$benutzer = benutzer_authentifizieren();

$body = json_body_lesen();
pflichtfelder_pruefen($body, ['sitzung_id', 'vokabel_id', 'richtung', 'erwartet']);

$sitzung_id       = (int) $body['sitzung_id'];
$vokabel_id       = (int) $body['vokabel_id'];
$typ              = $body['typ'] ?? 'vokabel';
$richtung_input   = $body['richtung'];
$eingabe          = trim($body['eingabe'] ?? '');
$erwartet         = trim($body['erwartet']);
$synonyme         = $body['synonyme'] ?? [];
$trotzdem_richtig = !empty($body['trotzdem_richtig']);

enum_validieren($richtung_input, ['DE', 'ED'], 'richtung');
if (!is_array($synonyme)) $synonyme = [];

$pdo = db_verbindung();

// --- Sitzung pruefen ---
$stmt = $pdo->prepare("SELECT id, benutzer_id, beendet_am FROM trainings_sitzungen WHERE id = ? AND benutzer_id = ?");
$stmt->execute([$sitzung_id, $benutzer['id']]);
$sitzung = $stmt->fetch();

if (!$sitzung) {
    fehler_nicht_gefunden('Trainings-Sitzung nicht gefunden.');
}
if ($sitzung['beendet_am'] !== null) {
    fehler_ungueltige_eingabe('Diese Trainings-Sitzung ist bereits beendet.');
}

// --- Antwort bewerten ---
$bewertung_modus = ($typ === 'satz') ? 'flexion' : konfig_wert('bewertung_modus', 'normal');
$qualitaet = antwort_bewerten($eingabe, $erwartet, $synonyme, $bewertung_modus);

if ($trotzdem_richtig && $qualitaet < 3) {
    $qualitaet = 3;
}

$richtig        = $qualitaet >= 3;
$ist_tippfehler = ($qualitaet === 4);

// --- Fortschritt laden oder erstellen ---
$stmt = $pdo->prepare("
    SELECT * FROM fortschritt
    WHERE benutzer_id = ? AND vokabel_id = ? AND richtung = ?
");
$stmt->execute([$benutzer['id'], $vokabel_id, $richtung_input]);
$fortschritt = $stmt->fetch();

$alte_stufe = 0;

if (!$fortschritt) {
    $stmt = $pdo->prepare("
        INSERT INTO fortschritt (benutzer_id, vokabel_id, richtung, stufe, zustand,
                                  leichtigkeitsfaktor, wiederholungen, intervall_tage,
                                  richtig_gesamt, falsch_gesamt)
        VALUES (?, ?, ?, 0, 'neu', ?, 0, 0, 0, 0)
    ");
    $stmt->execute([$benutzer['id'], $vokabel_id, $richtung_input, START_LEICHTIGKEITSFAKTOR]);
    $fortschritt = [
        'stufe' => 0, 'zustand' => 'neu',
        'leichtigkeitsfaktor' => START_LEICHTIGKEITSFAKTOR,
        'wiederholungen' => 0, 'intervall_tage' => 0,
        'richtig_gesamt' => 0, 'falsch_gesamt' => 0,
    ];
} else {
    $alte_stufe = (int) $fortschritt['stufe'];
}

// --- SM-2 Fortschritt aktualisieren ---
$neue_werte = fortschritt_aktualisieren($fortschritt, $qualitaet);

$stmt = $pdo->prepare("
    UPDATE fortschritt
    SET stufe = ?, zustand = ?, leichtigkeitsfaktor = ?, wiederholungen = ?,
        intervall_tage = ?, naechste_wiederholung = ?,
        richtig_gesamt = ?, falsch_gesamt = ?, aktualisiert_am = NOW()
    WHERE benutzer_id = ? AND vokabel_id = ? AND richtung = ?
");
$stmt->execute([
    $neue_werte['stufe'], $neue_werte['zustand'], $neue_werte['leichtigkeitsfaktor'],
    $neue_werte['wiederholungen'], $neue_werte['intervall_tage'], $neue_werte['naechste_wiederholung'],
    $neue_werte['richtig_gesamt'], $neue_werte['falsch_gesamt'],
    $benutzer['id'], $vokabel_id, $richtung_input,
]);

// --- Sitzung updaten ---
$stmt = $pdo->prepare("
    UPDATE trainings_sitzungen
    SET anzahl_fragen  = anzahl_fragen + 1,
        anzahl_richtig = anzahl_richtig + ?
    WHERE id = ?
");
$stmt->execute([$richtig ? 1 : 0, $sitzung_id]);

json_erfolg([
    'qualitaet'          => $qualitaet,
    'richtig'            => $richtig,
    'erwartet'           => klammerzusatz_entfernen($erwartet),
    'eingabe_bereinigt'  => satzzeichen_bereinigen($eingabe),
    'alte_stufe'         => $alte_stufe,
    'neue_stufe'         => $neue_werte['stufe'],
    'ist_tippfehler'     => $ist_tippfehler,
    'nachtippen_noetig'  => !$richtig && !$trotzdem_richtig,
    'sofort_wiederholen' => !$richtig,
]);
