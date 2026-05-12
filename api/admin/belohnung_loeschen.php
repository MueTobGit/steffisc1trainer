<?php
/**
 * API: Admin — Belohnung löschen
 *
 * POST /api/admin/belohnung_loeschen.php
 *
 * Body: id
 * Hinweis: Belohnungen, die bereits vergeben wurden, können nicht gelöscht werden.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

methode_erzwingen('POST');

$benutzer = benutzer_authentifizieren();
if ($benutzer['rolle'] !== 'admin') {
    fehler_nicht_berechtigt('Nur Admins haben Zugriff.');
}

$body = json_body_lesen();
$id   = (int) ($body['id'] ?? 0);

if ($id <= 0) {
    fehler_ungueltige_eingabe('Belohnungs-ID fehlt.');
}

$pdo = db_verbindung();

$stmt = $pdo->prepare("SELECT id, code, titel FROM belohnungen WHERE id = ?");
$stmt->execute([$id]);
$belohnung = $stmt->fetch();

if (!$belohnung) {
    fehler_nicht_gefunden('Belohnung nicht gefunden.');
}

// Prüfen ob bereits vergeben (nur tatsaechliche Freischaltungen, nicht Tracking-Rows)
$stmt = $pdo->prepare("SELECT COUNT(*) FROM benutzer_belohnungen WHERE belohnung_id = ? AND freigeschaltet_am IS NOT NULL");
$stmt->execute([$id]);
$anzahl_vergaben = (int) $stmt->fetchColumn();

if ($anzahl_vergaben > 0) {
    // Statt löschen: deaktivieren
    fehler_ungueltige_eingabe(
        "Diese Belohnung wurde bereits $anzahl_vergaben Mal vergeben und kann nicht gelöscht werden. " .
        "Deaktiviere sie stattdessen."
    );
}

$stmt = $pdo->prepare("DELETE FROM belohnungen WHERE id = ?");
$stmt->execute([$id]);

// Admin-Aktion loggen
$stmt = $pdo->prepare("
    INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung, details_json)
    VALUES (?, 'admin_aktion', ?, ?)
");
$stmt->execute([
    $benutzer['id'],
    "Belohnung gelöscht: {$belohnung['code']}",
    json_encode(['belohnung_id' => $id, 'code' => $belohnung['code']]),
]);

json_erfolg(null, 'Belohnung gelöscht.');
