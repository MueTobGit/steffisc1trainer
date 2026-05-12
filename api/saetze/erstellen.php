<?php
/**
 * API: Saetze — Erstellen
 *
 * POST /api/saetze/erstellen.php
 *
 * Admin: oeffentlicher Satz.
 * Normaler User: privater Satz (ist_privat=1) zu eigener Vokabel.
 *
 * Body:
 *   - vokabel_id (Pflicht)
 *   - englisch_satz (Pflicht, muss ___ enthalten)
 *   - deutsch_satz (Pflicht)
 *   - sprachniveau (optional, Standard: B2)
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

methode_erzwingen('POST');

$benutzer    = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];
$als_admin   = ist_admin($benutzer);

$daten = json_body_lesen();
pflichtfelder_pruefen($daten, ['vokabel_id', 'englisch_satz', 'deutsch_satz']);

$vokabel_id = positive_ganzzahl_validieren($daten['vokabel_id'], 'vokabel_id');

$pdo = db_verbindung();

$stmt = $pdo->prepare('SELECT id, ist_privat, besitzer_id FROM vokabeln WHERE id = ?');
$stmt->execute([$vokabel_id]);
$vokabel = $stmt->fetch();
if (!$vokabel) {
    fehler_nicht_gefunden('Vokabel nicht gefunden.');
}

if (!$als_admin) {
    $ist_eigene   = (bool) $vokabel['ist_privat'] && (int) $vokabel['besitzer_id'] === $benutzer_id;
    $ist_oeffentl = !(bool) $vokabel['ist_privat'];
    if (!$ist_eigene && !$ist_oeffentl) {
        fehler_nicht_berechtigt('Du hast keinen Zugriff auf diese Vokabel.');
    }
}

$englisch_satz = trim($daten['englisch_satz']);
$deutsch_satz  = trim($daten['deutsch_satz']);

if (!str_contains($englisch_satz, '___')) {
    fehler_ungueltige_eingabe('Der englische Satz muss einen Platzhalter (___) enthalten.', ['feld' => 'englisch_satz']);
}

$sprachniveau = $daten['sprachniveau'] ?? 'B2';
sprachniveau_validieren($sprachniveau);

$ist_privat  = !$als_admin;
$besitzer_id = $als_admin ? null : $benutzer_id;

$stmt = $pdo->prepare("
    INSERT INTO saetze (vokabel_id, englisch_satz, deutsch_satz, sprachniveau, ist_privat, besitzer_id, erstellt_von)
    VALUES (?, ?, ?, ?, ?, ?, ?)
");
$stmt->execute([$vokabel_id, $englisch_satz, $deutsch_satz, $sprachniveau, $ist_privat ? 1 : 0, $besitzer_id, $benutzer_id]);

$neue_id = (int) $pdo->lastInsertId();
$stmt = $pdo->prepare('SELECT * FROM saetze WHERE id = ?');
$stmt->execute([$neue_id]);
$satz = $stmt->fetch();

$satz['id']         = (int) $satz['id'];
$satz['vokabel_id'] = (int) $satz['vokabel_id'];
$satz['aktiv']      = (bool) $satz['aktiv'];
$satz['ist_privat'] = (bool) $satz['ist_privat'];

json_erfolg($satz, 'Satz erfolgreich erstellt.', 201);
