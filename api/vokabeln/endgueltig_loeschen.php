<?php
/**
 * API: Vokabeln — Endgültig löschen (Hard-Delete)
 *
 * DELETE /api/vokabeln/endgueltig_loeschen.php?id=X
 *
 * Löscht eine (bereits deaktivierte) Vokabel vollständig aus der Datenbank,
 * inklusive Formen, Sätze, themenfeld-Zuordnungen und Fortschrittsdaten.
 * Nur Admin.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

methode_erzwingen('DELETE');

$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

$id = get_param_int('id');
if ($id < 1) {
    fehler_ungueltige_eingabe('Vokabel-ID ist erforderlich.');
}

$pdo = db_verbindung();

// Vokabel prüfen (darf aktiv ODER inaktiv sein)
$stmt = $pdo->prepare('SELECT id, englisch, wortart FROM vokabeln WHERE id = ?');
$stmt->execute([$id]);
$vokabel = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$vokabel) {
    fehler_nicht_gefunden('Vokabel nicht gefunden.');
}

$pdo->beginTransaction();

try {
    // Abhängige Daten löschen (ON DELETE CASCADE macht das teils automatisch,
    // aber explizit für Klarheit und falls Constraints fehlen)
    $pdo->prepare('DELETE FROM themenfeld_vokabeln WHERE vokabel_id = ?')->execute([$id]);
    $pdo->prepare('DELETE FROM saetze WHERE vokabel_id = ?')->execute([$id]);

    // Lernfortschritt löschen (falls Tabelle existiert)
    try {
        $pdo->prepare('DELETE FROM benutzer_vokabel_fortschritt WHERE vokabel_id = ?')->execute([$id]);
    } catch (PDOException $e) { /* Tabelle nicht vorhanden — ignorieren */ }

    // Favoriten löschen (falls Tabelle existiert)
    try {
        $pdo->prepare('DELETE FROM favoriten WHERE vokabel_id = ?')->execute([$id]);
    } catch (PDOException $e) { /* Tabelle nicht vorhanden — ignorieren */ }

    // Synonymverknüpfungen löschen (falls Tabelle existiert)
    try {
        $pdo->prepare('DELETE FROM vokabel_synonyme WHERE vokabel_id = ? OR synonym_id = ?')
            ->execute([$id, $id]);
    } catch (PDOException $e) { /* Tabelle nicht vorhanden — ignorieren */ }

    // Vokabel selbst löschen
    $pdo->prepare('DELETE FROM vokabeln WHERE id = ?')->execute([$id]);

    $pdo->commit();

    json_erfolg([
        'id'        => $id,
        'englisch' => $vokabel['englisch'],
    ], "Vokabel \u{201E}{$vokabel['englisch']}\u{201C} endgültig gelöscht.");

} catch (Exception $e) {
    $pdo->rollBack();
    error_log('Hard-Delete Vokabel fehlgeschlagen: ' . $e->getMessage());
    fehler_server('Löschen fehlgeschlagen: ' . $e->getMessage());
}
