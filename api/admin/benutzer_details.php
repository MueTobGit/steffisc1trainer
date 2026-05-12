<?php
/**
 * API: Admin — Benutzer-Details laden
 *
 * GET /api/admin/benutzer_details.php?id=123
 *
 * Liefert alle Daten eines einzelnen Benutzers inkl. Statistik.
 * Nur fuer Admins.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

// --- Methode pruefen ---
methode_erzwingen('GET');

// --- Authentifizierung + Autorisierung ---
$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

// --- Parameter ---
$id = positive_ganzzahl_validieren($_GET['id'] ?? '', 'id');

$pdo = db_verbindung();

// --- Daten laden ---
$stmt = $pdo->prepare("
    SELECT
        b.id, b.benutzername, b.vorname, b.nachname, b.email, b.spitzname,
        b.rolle, b.aktiv, b.letzter_login, b.erstellt_am, b.neue_vokabeln_pro_tag,
        COALESCE(s.gesamt_trainings, 0)        AS gesamt_trainings,
        COALESCE(s.gesamt_vokabeln_gelernt, 0) AS gesamt_vokabeln_gelernt,
        s.letztes_training
    FROM benutzer b
    LEFT JOIN benutzer_statistik s ON s.benutzer_id = b.id
    WHERE b.id = ?
");
$stmt->execute([$id]);
$eintrag = $stmt->fetch();

if (!$eintrag) {
    fehler_nicht_gefunden('Benutzer nicht gefunden.');
}

$eintrag['id']                      = (int) $eintrag['id'];
$eintrag['aktiv']                   = (bool) $eintrag['aktiv'];
$eintrag['neue_vokabeln_pro_tag']   = (int) $eintrag['neue_vokabeln_pro_tag'];
$eintrag['gesamt_trainings']        = (int) $eintrag['gesamt_trainings'];
$eintrag['gesamt_vokabeln_gelernt'] = (int) $eintrag['gesamt_vokabeln_gelernt'];

json_erfolg($eintrag);
