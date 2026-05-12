<?php
/**
 * API: Gruppen — QR/Link-Einladungs-Token erstellen
 *
 * POST /api/gruppen/qr_token.php
 *
 * Erstellt einen allgemeinen Einladungs-Token ohne E-Mail-Bindung.
 * Jeder der den Token kennt, kann der Gruppe beitreten (bis zum Ablauf).
 * Nur Admin/Leiter der Gruppe darf Tokens erstellen.
 *
 * Body:
 *   - gruppen_id (Pflicht)
 *   - gueltig_tage (optional, Standard: 7, Max: 30)
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

methode_erzwingen('POST');

$benutzer    = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];

$daten = json_body_lesen();
pflichtfelder_pruefen($daten, ['gruppen_id']);

$gruppen_id  = positive_ganzzahl_validieren($daten['gruppen_id'], 'gruppen_id');
$gueltig_tage = isset($daten['gueltig_tage']) ? max(1, min(30, (int) $daten['gueltig_tage'])) : 7;

$pdo = db_verbindung();

// --- Gruppe pruefen ---
$stmt = $pdo->prepare("SELECT * FROM gruppen WHERE id = ? AND aktiv = 1");
$stmt->execute([$gruppen_id]);
$gruppe = $stmt->fetch();

if (!$gruppe) {
    fehler_nicht_gefunden('Gruppe nicht gefunden.');
}

// --- Berechtigung pruefen ---
if (!ist_admin($benutzer) && !gruppen_rolle_pruefen($benutzer_id, $gruppen_id, ['admin', 'leiter'])) {
    fehler_nicht_berechtigt('Nur Admins und Leiter duerfen Einladungs-Tokens erstellen.');
}

// --- Max Mitglieder pruefen ---
$stmt = $pdo->prepare("SELECT COUNT(*) FROM gruppen_mitglieder WHERE gruppen_id = ?");
$stmt->execute([$gruppen_id]);
$aktuelle_anzahl = (int) $stmt->fetchColumn();

if ($aktuelle_anzahl >= (int) $gruppe['max_mitglieder']) {
    fehler_ungueltige_eingabe('Die Gruppe hat die maximale Mitgliederzahl bereits erreicht.');
}

// --- Bestehende offene Einladungen dieser Gruppe ablaufen lassen ---
$stmt = $pdo->prepare("
    UPDATE gruppen_einladungen SET status = 'abgelaufen'
    WHERE gruppen_id = ? AND status = 'offen'
");
$stmt->execute([$gruppen_id]);

// --- Kurzcode generieren (6 Zeichen, Großbuchstaben + Ziffern, ohne O/0/I/1/L) ---
$zeichensatz = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
do {
    $kurz_code = '';
    for ($i = 0; $i < 6; $i++) {
        $kurz_code .= $zeichensatz[random_int(0, strlen($zeichensatz) - 1)];
    }
    $check = $pdo->prepare("SELECT id FROM gruppen_einladungen WHERE kurz_code = ?");
    $check->execute([$kurz_code]);
} while ($check->fetch());

// --- Token generieren (email=NULL fuer QR-Einladungen, 60 Minuten gueltig) ---
$token       = bin2hex(random_bytes(32));
$gueltig_bis = date('Y-m-d H:i:s', strtotime('+60 minutes'));

$stmt = $pdo->prepare("
    INSERT INTO gruppen_einladungen (gruppen_id, eingeladen_von, email, token, kurz_code, gueltig_bis)
    VALUES (?, ?, NULL, ?, ?, ?)
");
$stmt->execute([$gruppen_id, $benutzer_id, $token, $kurz_code, $gueltig_bis]);

json_erfolg([
    'token'       => $token,
    'kurz_code'   => $kurz_code,
    'gueltig_bis' => $gueltig_bis,
    'gruppen_id'  => $gruppen_id,
    'gruppen_name'=> $gruppe['name'],
], 'Einladungs-Token erfolgreich erstellt.');
