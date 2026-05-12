<?php
/**
 * API: Vokabeln — Loeschen
 *
 * DELETE /api/vokabeln/loeschen.php?id=X
 *
 * Admin:         Soft-Delete (aktiv=false) fuer oeffentliche Vokabeln.
 *                Hard-Delete fuer private Vokabeln (aller User).
 * Normaler User: Hard-Delete nur fuer eigene private Vokabeln.
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
$benutzer_id = (int) $benutzer['id'];
$als_admin   = ist_admin($benutzer);

// --- ID ermitteln ---
$id = get_param_int('id');
if ($id < 1) {
    fehler_ungueltige_eingabe('Vokabel-ID ist erforderlich.');
}

// --- Vokabel laden ---
$vokabel = id_existiert($id, 'vokabeln', 'Vokabel');

// --- Berechtigung pruefen ---
sichtbarkeits_schreib_check($benutzer, $vokabel, 'Vokabel');

$pdo = db_verbindung();

$ist_privat = (bool) $vokabel['ist_privat'];

if ($ist_privat) {
    // Private Vokabel → immer Hard-Delete (User oder Admin)
    $pdo->prepare('DELETE FROM vokabeln WHERE id = ?')->execute([$id]);
    json_erfolg([
        'id'         => $id,
        'schwedisch' => $vokabel['schwedisch'],
        'geloescht'  => true,
    ], "Vokabel \u{201E}{$vokabel['schwedisch']}\u{201C} gelöscht.");
} else {
    // Oeffentliche Vokabel → Soft-Delete (nur Admin kommt hier hin)
    if (!(bool) $vokabel['aktiv']) {
        fehler_ungueltige_eingabe('Vokabel ist bereits deaktiviert.');
    }
    $pdo->prepare('UPDATE vokabeln SET aktiv = 0 WHERE id = ?')->execute([$id]);
    json_erfolg([
        'id'         => $id,
        'schwedisch' => $vokabel['schwedisch'],
    ], "Vokabel \u{201E}{$vokabel['schwedisch']}\u{201C} deaktiviert.");
}
