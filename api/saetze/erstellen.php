<?php
/**
 * API: Saetze — Erstellen
 *
 * POST /api/saetze/erstellen.php
 *
 * Admin: oeffentlicher Satz (wie bisher).
 * Normaler User: privater Satz (ist_privat=1, besitzer_id=User).
 *   Nur zu einer eigenen privaten Vokabel moeglich (oder eigener Gruppe).
 * ___ Platzhalter-Check.
 *
 * Body:
 *   - vokabel_id (Pflicht)
 *   - schwedisch_satz (Pflicht, muss ___ enthalten)
 *   - deutsch_satz (Pflicht)
 *   - benoetigte_form (Pflicht)
 *   - sprachniveau (optional, Standard: A1)
 *   - media_id (optional)
 *   - gruppen_id (optional, User: Gruppe in der man Mitglied ist)
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';
require_once dirname(__DIR__) . '/_middleware/sichtbarkeit.php';

// --- Methode pruefen ---
methode_erzwingen('POST');

// --- Authentifizierung ---
$benutzer    = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];
$als_admin   = ist_admin($benutzer);

// --- Body lesen ---
$daten = json_body_lesen();

// --- Validierung ---
pflichtfelder_pruefen($daten, ['vokabel_id', 'schwedisch_satz', 'deutsch_satz', 'benoetigte_form']);

$vokabel_id = positive_ganzzahl_validieren($daten['vokabel_id'], 'vokabel_id');

$pdo = db_verbindung();

// Vokabel laden und Sichtbarkeit pruefen
$stmt = $pdo->prepare('SELECT * FROM vokabeln WHERE id = ?');
$stmt->execute([$vokabel_id]);
$vokabel = $stmt->fetch();
if (!$vokabel) {
    fehler_nicht_gefunden('Vokabel nicht gefunden.');
}

// User darf nur zu sichtbaren Vokabeln Saetze anlegen
if (!$als_admin) {
    $sichtbarkeit = sichtbarkeits_bedingung($pdo, $benutzer_id, 'v', false);
    // Einfacher Check: eigene Vokabel oder oeffentliche Vokabel
    $ist_eigene   = (bool) $vokabel['ist_privat'] && (int) $vokabel['besitzer_id'] === $benutzer_id;
    $ist_oeffentl = !(bool) $vokabel['ist_privat'];
    if (!$ist_eigene && !$ist_oeffentl) {
        // Ggf. Gruppen-Vokabel pruefen
        $gruppen_ids = eigene_gruppen_ids($pdo, $benutzer_id);
        $vok_gruppen_id = $vokabel['gruppen_id'] !== null ? (int) $vokabel['gruppen_id'] : null;
        if ($vok_gruppen_id === null || !in_array($vok_gruppen_id, $gruppen_ids, true)) {
            fehler_nicht_berechtigt('Du hast keinen Zugriff auf diese Vokabel.');
        }
    }
}

$schwedisch_satz = trim($daten['schwedisch_satz']);
$deutsch_satz    = trim($daten['deutsch_satz']);
$benoetigte_form = trim($daten['benoetigte_form']);

// Platzhalter-Check
if (!str_contains($schwedisch_satz, '___')) {
    fehler_ungueltige_eingabe(
        'Der schwedische Satz muss einen Platzhalter (___) fuer die Luecke enthalten.',
        ['feld' => 'schwedisch_satz']
    );
}

// Sprachniveau
$sprachniveau = $daten['sprachniveau'] ?? 'A1';
sprachniveau_validieren($sprachniveau);

// Media
$media_id = null;
if (!empty($daten['media_id'])) {
    $media_id = positive_ganzzahl_validieren($daten['media_id'], 'media_id');
    id_existiert($media_id, 'medien', 'Medium');
}

// --- Privat-Logik ---
$ist_privat  = !$als_admin;
$besitzer_id = $als_admin ? null : $benutzer_id;

// Gruppen-ID
$gruppen_id_neu = null;
if (!$als_admin && !empty($daten['gruppen_id'])) {
    $gid = (int) $daten['gruppen_id'];
    if ($gid > 0) {
        $stmt = $pdo->prepare('SELECT id FROM gruppen_mitglieder WHERE gruppen_id = ? AND benutzer_id = ?');
        $stmt->execute([$gid, $benutzer_id]);
        if ($stmt->fetch()) {
            $gruppen_id_neu = $gid;
        } else {
            fehler_ungueltige_eingabe('Du bist kein Mitglied dieser Gruppe.');
        }
    }
}

// --- Erstellen ---
$sql = "
    INSERT INTO saetze
        (vokabel_id, schwedisch_satz, deutsch_satz, benoetigte_form,
         sprachniveau, media_id, ist_privat, besitzer_id, gruppen_id, erstellt_von)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
";

$stmt = $pdo->prepare($sql);
$stmt->execute([
    $vokabel_id,
    $schwedisch_satz,
    $deutsch_satz,
    $benoetigte_form,
    $sprachniveau,
    $media_id,
    $ist_privat ? 1 : 0,
    $besitzer_id,
    $gruppen_id_neu,
    $benutzer_id,
]);

$neue_id = (int) $pdo->lastInsertId();

// Erstellten Satz laden
$stmt = $pdo->prepare('SELECT s.*, b.benutzername AS besitzer_name FROM saetze s LEFT JOIN benutzer b ON b.id = s.besitzer_id WHERE s.id = ?');
$stmt->execute([$neue_id]);
$satz = $stmt->fetch();

$satz['id']          = (int) $satz['id'];
$satz['vokabel_id']  = (int) $satz['vokabel_id'];
$satz['media_id']    = $satz['media_id'] !== null ? (int) $satz['media_id'] : null;
$satz['erstellt_von']= $satz['erstellt_von'] !== null ? (int) $satz['erstellt_von'] : null;
$satz['aktiv']       = (bool) $satz['aktiv'];
$satz['ist_privat']  = (bool) $satz['ist_privat'];
$satz['besitzer_id'] = $satz['besitzer_id'] !== null ? (int) $satz['besitzer_id'] : null;
$satz['gruppen_id']  = $satz['gruppen_id'] !== null ? (int) $satz['gruppen_id'] : null;

json_erfolg($satz, 'Satz erfolgreich erstellt.', 201);
