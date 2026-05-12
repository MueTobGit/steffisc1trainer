<?php
/**
 * API: Lektionen — Vokabeln zuordnen
 *
 * POST /api/lektionen/vokabeln_zuordnen.php?id=X
 *
 * Replace-Strategie: Alle bestehenden Zuordnungen loeschen
 * und durch neue ersetzen. Transaktion.
 * Admin: alle Vokabeln. Besitzer eigener privater Lektionen: nur eigene Vokabeln.
 *
 * Body:
 *   - vokabel_ids: Array von Vokabel-IDs
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

// --- Methode pruefen ---
methode_erzwingen('POST');

// --- Authentifizierung + Autorisierung ---
$benutzer    = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];
$ist_admin   = ist_admin($benutzer);

// --- ID ermitteln ---
$id = get_param_int('id');
if ($id < 1) {
    fehler_ungueltige_eingabe('Lektion-ID ist erforderlich.');
}

$pdo = db_verbindung();

// --- Lektion laden und Berechtigung pruefen ---
$stmt_lek = $pdo->prepare('SELECT id, ist_privat, besitzer_id FROM lektionen WHERE id = ? AND aktiv = 1');
$stmt_lek->execute([$id]);
$lektion_meta = $stmt_lek->fetch();
if (!$lektion_meta) {
    fehler_nicht_gefunden('Lektion nicht gefunden.');
}

if (!$ist_admin) {
    // Non-Admin darf nur eigene private Lektionen bearbeiten
    if (!(bool) $lektion_meta['ist_privat'] || (int) $lektion_meta['besitzer_id'] !== $benutzer_id) {
        fehler_verboten('Keine Berechtigung zum Zuordnen von Vokabeln zu dieser Lektion.');
    }
}

// --- Body lesen ---
$daten = json_body_lesen();

if (!isset($daten['vokabel_ids']) || !is_array($daten['vokabel_ids'])) {
    fehler_ungueltige_eingabe('Feld "vokabel_ids" muss ein Array von IDs sein.');
}

$vokabel_ids = $daten['vokabel_ids'];

// IDs validieren
$gueltige_ids = [];
foreach ($vokabel_ids as $vid) {
    if (is_numeric($vid) && (int) $vid > 0) {
        $gueltige_ids[] = (int) $vid;
    }
}

// Duplikate entfernen
$gueltige_ids = array_unique($gueltige_ids);

// --- Transaktion ---
$pdo->beginTransaction();

try {
    // Alle bestehenden Zuordnungen loeschen
    $stmt = $pdo->prepare('DELETE FROM lektion_vokabeln WHERE lektion_id = ?');
    $stmt->execute([$id]);

    // Neue Zuordnungen einfuegen
    $zugeordnet = 0;

    if (!empty($gueltige_ids)) {
        $sql = "INSERT INTO lektion_vokabeln (lektion_id, vokabel_id, reihenfolge) VALUES (?, ?, ?)";
        $stmt = $pdo->prepare($sql);

        foreach ($gueltige_ids as $reihenfolge => $vid) {
            // Pruefen ob Vokabel existiert (Non-Admin: nur eigene Vokabeln)
            if ($ist_admin) {
                $check = $pdo->prepare('SELECT id FROM vokabeln WHERE id = ? AND aktiv = 1');
                $check->execute([$vid]);
            } else {
                $check = $pdo->prepare('SELECT id FROM vokabeln WHERE id = ? AND aktiv = 1 AND besitzer_id = ?');
                $check->execute([$vid, $benutzer_id]);
            }

            if ($check->fetchColumn()) {
                $stmt->execute([$id, $vid, $reihenfolge]);
                $zugeordnet++;
            }
        }
    }

    $pdo->commit();

    json_erfolg([
        'lektion_id' => $id,
        'zugeordnet' => $zugeordnet,
        'angefragt' => count($gueltige_ids),
    ], "{$zugeordnet} Vokabel(n) zugeordnet.");

} catch (PDOException $e) {
    $pdo->rollBack();
    error_log('Vokabel-Zuordnung fehlgeschlagen: ' . $e->getMessage());
    fehler_server('Zuordnung konnte nicht gespeichert werden.');
}
