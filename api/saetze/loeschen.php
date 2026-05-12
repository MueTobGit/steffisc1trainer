<?php
/**
 * API: Saetze — Loeschen
 *
 * DELETE /api/saetze/loeschen.php?id=X
 *
 * Admin:         Soft-Delete (aktiv=false) fuer oeffentliche Saetze.
 *                Hard-Delete fuer private Saetze.
 * Normaler User: Hard-Delete nur fuer eigene private Saetze.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';
require_once dirname(__DIR__) . '/_middleware/sichtbarkeit.php';

// --- Methode pruefen ---
methode_erzwingen('DELETE');

// --- Authentifizierung ---
$benutzer    = benutzer_authentifizieren();
$als_admin   = ist_admin($benutzer);

// --- ID ermitteln ---
$id = get_param_int('id');
if ($id < 1) {
    fehler_ungueltige_eingabe('Satz-ID ist erforderlich.');
}

// --- Satz laden ---
$satz = id_existiert($id, 'saetze', 'Satz');

// --- Berechtigung pruefen ---
sichtbarkeits_schreib_check($benutzer, $satz, 'Satz');

$pdo = db_verbindung();

$ist_privat = (bool) $satz['ist_privat'];

if ($ist_privat) {
    // Private Saetze → immer Hard-Delete
    $pdo->prepare('DELETE FROM saetze WHERE id = ?')->execute([$id]);
    json_erfolg(['id' => $id, 'geloescht' => true], 'Satz gelöscht.');
} else {
    // Oeffentlicher Satz → Soft-Delete (nur Admin kommt hier hin)
    if (!(bool) $satz['aktiv']) {
        fehler_ungueltige_eingabe('Satz ist bereits deaktiviert.');
    }
    $pdo->prepare('UPDATE saetze SET aktiv = 0 WHERE id = ?')->execute([$id]);
    json_erfolg(['id' => $id], 'Satz erfolgreich deaktiviert.');
}
