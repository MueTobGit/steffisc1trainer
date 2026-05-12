<?php
/**
 * API: Vokabeln — Details
 *
 * GET /api/vokabeln/details.php?id=X
 *
 * Liefert eine Vokabel komplett inkl. Formen, Synonyme, Saetze.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

// --- Methode pruefen ---
methode_erzwingen('GET');

// --- Authentifizierung ---
$benutzer = benutzer_authentifizieren();

// --- ID ermitteln ---
$id = get_param_int('id');
if ($id < 1) {
    fehler_ungueltige_eingabe('Vokabel-ID ist erforderlich.');
}

$pdo = db_verbindung();

// --- Vokabel laden ---
$sql = "
    SELECT
        v.*,
        k.name AS kategorie_name
    FROM vokabeln v
    LEFT JOIN kategorien k ON k.id = v.kategorie_id
    WHERE v.id = ?
";
$stmt = $pdo->prepare($sql);
$stmt->execute([$id]);
$vokabel = $stmt->fetch();

if (!$vokabel) {
    fehler_nicht_gefunden('Vokabel nicht gefunden.');
}

// Typen casten
$vokabel['id'] = (int) $vokabel['id'];
$vokabel['kategorie_id'] = $vokabel['kategorie_id'] !== null ? (int) $vokabel['kategorie_id'] : null;
$vokabel['media_id'] = $vokabel['media_id'] !== null ? (int) $vokabel['media_id'] : null;
$vokabel['erstellt_von'] = $vokabel['erstellt_von'] !== null ? (int) $vokabel['erstellt_von'] : null;
$vokabel['besitzer_id'] = $vokabel['besitzer_id'] !== null ? (int) $vokabel['besitzer_id'] : null;
$vokabel['aktiv'] = (bool) $vokabel['aktiv'];
$vokabel['ist_privat'] = (bool) $vokabel['ist_privat'];

// --- Formen laden ---
$stmt = $pdo->prepare("
    SELECT id, form_bezeichnung, form_wert, reihenfolge, media_id
    FROM vokabel_formen
    WHERE vokabel_id = ?
    ORDER BY reihenfolge ASC, id ASC
");
$stmt->execute([$id]);
$formen = $stmt->fetchAll();

foreach ($formen as &$f) {
    $f['id'] = (int) $f['id'];
    $f['reihenfolge'] = (int) $f['reihenfolge'];
    $f['media_id'] = $f['media_id'] !== null ? (int) $f['media_id'] : null;
}
unset($f);

$vokabel['formen'] = $formen;

// --- Synonyme laden ---
$stmt = $pdo->prepare("
    SELECT id, synonym, sprache
    FROM synonyme
    WHERE vokabel_id = ?
    ORDER BY sprache ASC, id ASC
");
$stmt->execute([$id]);
$synonyme = $stmt->fetchAll();

foreach ($synonyme as &$s) {
    $s['id'] = (int) $s['id'];
}
unset($s);

$vokabel['synonyme'] = $synonyme;

// --- Saetze laden ---
$stmt = $pdo->prepare("
    SELECT id, schwedisch_satz, deutsch_satz, benoetigte_form, sprachniveau, media_id, aktiv
    FROM saetze
    WHERE vokabel_id = ? AND aktiv = 1
    ORDER BY id ASC
");
$stmt->execute([$id]);
$saetze = $stmt->fetchAll();

foreach ($saetze as &$satz) {
    $satz['id'] = (int) $satz['id'];
    $satz['media_id'] = $satz['media_id'] !== null ? (int) $satz['media_id'] : null;
    $satz['aktiv'] = (bool) $satz['aktiv'];
}
unset($satz);

$vokabel['saetze'] = $saetze;

// --- Fortschritt des Benutzers (optional) ---
$stmt = $pdo->prepare("
    SELECT richtung, stufe, zustand, punkte, richtig_gesamt, falsch_gesamt, naechste_wiederholung
    FROM fortschritt
    WHERE benutzer_id = ? AND vokabel_id = ?
");
$stmt->execute([$benutzer['id'], $id]);
$fortschritt = $stmt->fetchAll();

foreach ($fortschritt as &$fp) {
    $fp['stufe'] = (int) $fp['stufe'];
    $fp['punkte'] = (int) $fp['punkte'];
    $fp['richtig_gesamt'] = (int) $fp['richtig_gesamt'];
    $fp['falsch_gesamt'] = (int) $fp['falsch_gesamt'];
}
unset($fp);

$vokabel['fortschritt'] = $fortschritt;

// --- Favorit-Status ---
$stmt = $pdo->prepare("
    SELECT COUNT(*) FROM benutzer_favoriten
    WHERE benutzer_id = ? AND vokabel_id = ?
");
$stmt->execute([$benutzer['id'], $id]);
$vokabel['ist_favorit'] = (int) $stmt->fetchColumn() > 0;

// --- Lektionen ---
$stmt = $pdo->prepare("
    SELECT l.id, l.titel
    FROM lektion_vokabeln lv
    JOIN lektionen l ON l.id = lv.lektion_id
    WHERE lv.vokabel_id = ? AND l.aktiv = 1
    ORDER BY l.titel ASC
");
$stmt->execute([$id]);
$lektionen = $stmt->fetchAll();

foreach ($lektionen as &$lk) {
    $lk['id'] = (int) $lk['id'];
}
unset($lk);

$vokabel['lektionen'] = $lektionen;

json_erfolg($vokabel);
