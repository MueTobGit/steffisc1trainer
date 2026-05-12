<?php
/**
 * API: Schnellueben — Antwort
 *
 * POST /api/schnellueben/antwort.php
 * Body: { sitzung_id, aufgabe_index, typ, richtig }
 *
 * Zaehlt eine einzelne Antwort und berechnet XP.
 * KEIN SM-2, KEIN Fortschritts-Update.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';
require_once dirname(__DIR__, 2) . '/konfiguration/lern_algorithmus.php';
require_once dirname(__DIR__, 2) . '/konfiguration/grammatik_helfer.php';

// --- Methode pruefen ---
methode_erzwingen('POST');

// --- Authentifizierung ---
$benutzer = benutzer_authentifizieren();

// --- Eingabe validieren ---
$body = json_body_lesen();
pflichtfelder_pruefen($body, ['sitzung_id', 'aufgabe_index']);

$sitzung_id    = (int) $body['sitzung_id'];
$aufgabe_index = (int) $body['aufgabe_index'];
$richtig       = !empty($body['richtig']);
$typ           = $body['typ'] ?? 'multiple_choice';
$vokabel_id    = isset($body['vokabel_id']) ? (int) $body['vokabel_id'] : null;
$grammatik_typ = $body['grammatik_typ'] ?? null;

// Validierung Grammatik-Typ
$erlaubte_grammatik_typen = ['genus_block','endungs_matching','gruppen_quiz','partikel_puzzle','starkes_verb'];
if ($grammatik_typ !== null && !in_array($grammatik_typ, $erlaubte_grammatik_typen, true)) {
    $grammatik_typ = null;
}

$pdo = db_verbindung();

// --- Sitzung validieren ---
$stmt = $pdo->prepare("
    SELECT id, benutzer_id, typ, beendet_am
    FROM trainings_sitzungen
    WHERE id = ? AND benutzer_id = ?
");
$stmt->execute([$sitzung_id, $benutzer['id']]);
$sitzung = $stmt->fetch();

if (!$sitzung) {
    fehler_nicht_gefunden('Schnellueben-Sitzung nicht gefunden.');
}
if ($sitzung['typ'] !== 'schnell') {
    fehler_ungueltige_eingabe('Dies ist keine Schnellueben-Sitzung.');
}
if ($sitzung['beendet_am'] !== null) {
    fehler_ungueltige_eingabe('Diese Sitzung ist bereits beendet.');
}

// --- XP berechnen (50%, keine Multiplikatoren) ---
// xp_berechnen(stufe=0, qualitaet=5, streak=false, erstes_mal=false, schnellueben=true)
$xp = $richtig ? xp_berechnen(0, 5, false, false, true) : 0;

// --- Sitzungs-Zaehler aktualisieren ---
$stmt = $pdo->prepare("
    UPDATE trainings_sitzungen
    SET anzahl_fragen = anzahl_fragen + 1,
        anzahl_richtig = anzahl_richtig + ?,
        xp_verdient = xp_verdient + ?
    WHERE id = ?
");
$stmt->execute([$richtig ? 1 : 0, $xp, $sitzung_id]);

// --- Grammatik-Fortschritt tracken (falls Grammatikfrage mit vokabel_id) ---
if ($grammatik_typ !== null && $vokabel_id !== null && $vokabel_id > 0) {
    grammatik_fortschritt_aktualisieren($pdo, $benutzer['id'], $vokabel_id, $grammatik_typ, $richtig);
}

// --- Antwort ---
json_erfolg([
    'richtig' => $richtig,
    'xp'      => $xp,
]);
