<?php
/**
 * API: Training — Antwort bewerten
 *
 * POST /api/training/antwort.php
 * Body: { sitzung_id, vokabel_id, richtung, eingabe, erwartet, synonyme, typ, trotzdem_richtig }
 *
 * Bewertet eine einzelne Antwort, aktualisiert Fortschritt und XP.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';
require_once dirname(__DIR__, 2) . '/konfiguration/lern_algorithmus.php';
require_once dirname(__DIR__, 2) . '/konfiguration/hilfsfunktionen.php';
require_once dirname(__DIR__, 2) . '/konfiguration/grammatik_helfer.php';

// --- Methode pruefen ---
methode_erzwingen('POST');

// --- Authentifizierung ---
$benutzer = benutzer_authentifizieren();

// --- Eingabe validieren ---
$body = json_body_lesen();
pflichtfelder_pruefen($body, ['sitzung_id', 'vokabel_id']);

$sitzung_id = (int) $body['sitzung_id'];
$vokabel_id = (int) $body['vokabel_id'];
$typ        = $body['typ'] ?? 'vokabel';

// Grammatik-Typen: Button-Auswertung client-seitig, kein SM-2
$grammatik_button_typen = ['gruppen_quiz', 'partikel_puzzle', 'starkes_verb'];
$ist_grammatik_frage    = in_array($typ, $grammatik_button_typen, true);

if ($ist_grammatik_frage) {
    // Nur richtig: boolean nötig, kein richtung/erwartet
    $richtig_bool     = !empty($body['richtig']);
    $richtung_input   = 'DS'; // Dummy, nicht verwendet
    $eingabe          = '';
    $erwartet         = '';
    $synonyme         = [];
    $trotzdem_richtig = false;
} else {
    pflichtfelder_pruefen($body, ['richtung', 'erwartet']);
    $richtung_input   = $body['richtung'];
    $eingabe          = trim($body['eingabe'] ?? '');
    $erwartet         = trim($body['erwartet']);
    $synonyme         = $body['synonyme'] ?? [];
    $trotzdem_richtig = !empty($body['trotzdem_richtig']);
    $richtig_bool     = false; // wird aus qualitaet bestimmt

    enum_validieren($richtung_input, ['DS', 'SD'], 'richtung');
    if (!is_array($synonyme)) {
        $synonyme = [];
    }
}

$pdo = db_verbindung();

// --- Sitzung pruefen ---
$stmt = $pdo->prepare("
    SELECT id, benutzer_id, beendet_am
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

// --- XP-Streak laden (für beide Pfade) ---
$stmt = $pdo->prepare("SELECT streak_tage FROM benutzer_statistik WHERE benutzer_id = ?");
$stmt->execute([$benutzer['id']]);
$stat = $stmt->fetch();
$streak_aktiv = $stat && (int) $stat['streak_tage'] > 0;

// ============================================================
// Grammatik-Fragen: Button-Auswahl, kein SM-2
// ============================================================
if ($ist_grammatik_frage) {
    grammatik_fortschritt_aktualisieren($pdo, $benutzer['id'], $vokabel_id, $typ, $richtig_bool);

    // Flat-XP: Stufe-0-Äquivalent mit Streak-Multiplikator
    $xp = xp_berechnen(0, $richtig_bool ? 5 : 0, $streak_aktiv, false, false);

    $stmt = $pdo->prepare("
        UPDATE trainings_sitzungen
        SET anzahl_fragen  = anzahl_fragen + 1,
            anzahl_richtig = anzahl_richtig + ?,
            xp_verdient    = xp_verdient + ?
        WHERE id = ?
    ");
    $stmt->execute([$richtig_bool ? 1 : 0, $xp, $sitzung_id]);

    json_erfolg([
        'qualitaet'        => $richtig_bool ? 5 : 0,
        'richtig'          => $richtig_bool,
        'erwartet'         => '',
        'eingabe_bereinigt'=> '',
        'xp'               => $xp,
        'alte_stufe'       => 0,
        'neue_stufe'       => 0,
        'ist_tippfehler'   => false,
        'nachtippen_noetig'=> false,
    ]);
}

// ============================================================
// Reguläre Fragen: Text-Eingabe + SM-2
// ============================================================

// --- Antwort bewerten ---
// Flexion + Satz: keine Fehlertoleranz (nur Groß-/Kleinschreibung + Randzeichen erlaubt),
// damit Endungen wie Präteritum/Supinum exakt stimmen müssen.
if ($typ === 'flexion' || $typ === 'satz') {
    $bewertung_modus = 'flexion';
} else {
    $bewertung_modus = konfig_wert('bewertung_modus', 'normal');
}
$qualitaet = antwort_bewerten($eingabe, $erwartet, $synonyme, $bewertung_modus);

// "Trotzdem richtig" ueberschreibt auf Qualitaet 3
if ($trotzdem_richtig && $qualitaet < 3) {
    $qualitaet = 3;
}

$richtig = $qualitaet >= 3;
$ist_tippfehler = ($qualitaet === 4);

// --- Fortschritt laden oder erstellen ---
$stmt = $pdo->prepare("
    SELECT *
    FROM fortschritt
    WHERE benutzer_id = ? AND vokabel_id = ? AND richtung = ?
");
$stmt->execute([$benutzer['id'], $vokabel_id, $richtung_input]);
$fortschritt = $stmt->fetch();

$alte_stufe = 0;
$erstes_mal_richtig = false;

if (!$fortschritt) {
    // Neuen Fortschritts-Eintrag erstellen
    $stmt = $pdo->prepare("
        INSERT INTO fortschritt (benutzer_id, vokabel_id, richtung, stufe, zustand,
                                  leichtigkeitsfaktor, wiederholungen, intervall_tage,
                                  richtig_gesamt, falsch_gesamt)
        VALUES (?, ?, ?, 0, 'neu', ?, 0, 0, 0, 0)
    ");
    $stmt->execute([$benutzer['id'], $vokabel_id, $richtung_input, START_LEICHTIGKEITSFAKTOR]);

    $fortschritt = [
        'stufe' => 0,
        'zustand' => 'neu',
        'leichtigkeitsfaktor' => START_LEICHTIGKEITSFAKTOR,
        'wiederholungen' => 0,
        'intervall_tage' => 0,
        'richtig_gesamt' => 0,
        'falsch_gesamt' => 0,
    ];
    $alte_stufe = 0;
    $erstes_mal_richtig = $richtig; // Erste Antwort ueberhaupt
} else {
    $alte_stufe = (int) $fortschritt['stufe'];
    $erstes_mal_richtig = $richtig && (int) $fortschritt['richtig_gesamt'] === 0;
}

// --- SM-2 Fortschritt aktualisieren ---
$neue_werte = fortschritt_aktualisieren($fortschritt, $qualitaet);

// In DB speichern
$stmt = $pdo->prepare("
    UPDATE fortschritt
    SET stufe = ?,
        zustand = ?,
        leichtigkeitsfaktor = ?,
        wiederholungen = ?,
        intervall_tage = ?,
        naechste_wiederholung = ?,
        richtig_gesamt = ?,
        falsch_gesamt = ?,
        aktualisiert_am = NOW()
    WHERE benutzer_id = ? AND vokabel_id = ? AND richtung = ?
");
$stmt->execute([
    $neue_werte['stufe'],
    $neue_werte['zustand'],
    $neue_werte['leichtigkeitsfaktor'],
    $neue_werte['wiederholungen'],
    $neue_werte['intervall_tage'],
    $neue_werte['naechste_wiederholung'],
    $neue_werte['richtig_gesamt'],
    $neue_werte['falsch_gesamt'],
    $benutzer['id'],
    $vokabel_id,
    $richtung_input,
]);

// --- XP berechnen ---
$xp = xp_berechnen($alte_stufe, $qualitaet, $streak_aktiv, $erstes_mal_richtig, false);

// --- Sitzung updaten ---
$stmt = $pdo->prepare("
    UPDATE trainings_sitzungen
    SET anzahl_fragen = anzahl_fragen + 1,
        anzahl_richtig = anzahl_richtig + ?,
        xp_verdient = xp_verdient + ?
    WHERE id = ?
");
$stmt->execute([$richtig ? 1 : 0, $xp, $sitzung_id]);

// --- Antwort zurueckgeben ---
json_erfolg([
    'qualitaet'         => $qualitaet,
    'richtig'           => $richtig,
    'erwartet'          => klammerzusatz_entfernen($erwartet),
    'eingabe_bereinigt' => satzzeichen_bereinigen($eingabe),
    'xp'                => $xp,
    'alte_stufe'        => $alte_stufe,
    'neue_stufe'        => $neue_werte['stufe'],
    'ist_tippfehler'    => $ist_tippfehler,
    'nachtippen_noetig' => !$richtig && !$trotzdem_richtig,
    // Signalisiert dem Frontend: Vokabel soll zeitnah in der Session wiederholt werden
    'sofort_wiederholen' => !$richtig,
]);
