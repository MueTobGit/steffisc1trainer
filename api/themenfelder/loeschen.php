<?php
/**
 * API: Themenfelder — Loeschen
 *
 * DELETE /api/Themenfelder/loeschen.php?id=X
 *
 * Hard-Delete.
 *   - Admin darf alle Themenfelder loeschen.
 *   - Normaler User darf nur eigene private Themenfelder loeschen.
 *
 * FK-Kaskaden der DB (ON DELETE CASCADE):
 *   - themenfeld_vokabeln (Zuordnungen) → automatisch entfernt
 *
 * Vokabeln selbst bleiben erhalten und behalten ihre Kategorie.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

methode_erzwingen('DELETE');

$benutzer    = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];
$ist_admin   = ist_admin($benutzer);

$id = get_param_int('id');
if ($id < 1) {
    fehler_ungueltige_eingabe('Lektion-ID ist erforderlich.');
}

$lektion = id_existiert($id, 'themenfelder', 'Lektion');

// Berechtigung pruefen: Admin darf alles; normaler User nur eigene private Themenfelder
if (!$ist_admin) {
    if (!(bool)$lektion['ist_privat'] || (int)$lektion['besitzer_id'] !== $benutzer_id) {
        fehler_verboten('Keine Berechtigung zum Loeschen dieser Lektion.');
    }
}

$pdo = db_verbindung();

// Anzahl zugeordneter Vokabeln zählen (informativ)
$stmt = $pdo->prepare('SELECT COUNT(*) FROM themenfeld_vokabeln WHERE themenfeld_id = ?');
$stmt->execute([$id]);
$vokabeln_anzahl = (int) $stmt->fetchColumn();

// Hard-Delete — themenfeld_vokabeln wird per CASCADE automatisch entfernt
$pdo->prepare('DELETE FROM themenfelder WHERE id = ?')->execute([$id]);

$nachricht = "Lektion „{$lektion['titel']}\" gelöscht.";
if ($vokabeln_anzahl > 0) {
    $nachricht .= " {$vokabeln_anzahl} Vokabel(n) sind weiterhin in der Datenbank vorhanden.";
}

json_erfolg([
    'id'                 => $id,
    'titel'              => $lektion['titel'],
    'vokabeln_betroffen' => $vokabeln_anzahl,
], $nachricht);

