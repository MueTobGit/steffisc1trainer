<?php
/**
 * API: Vokabeln — Synonyme speichern
 *
 * POST /api/vokabeln/synonyme_speichern.php?id=X
 *
 * Ersetzt alle Synonyme einer Vokabel (DELETE + INSERT).
 * Admin:         beliebige Vokabel.
 * Normaler User: nur eigene private Vokabeln.
 *
 * Body:
 *   - synonyme: Array von {synonym, sprache} (sprache: 'sv' oder 'de')
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
$benutzer = benutzer_authentifizieren();

// --- ID ermitteln ---
$id = get_param_int('id');
if ($id < 1) {
    fehler_ungueltige_eingabe('Vokabel-ID ist erforderlich.');
}

// --- Vokabel laden ---
$vokabel = id_existiert($id, 'vokabeln', 'Vokabel');

// --- Berechtigung pruefen ---
sichtbarkeits_schreib_check($benutzer, $vokabel, 'Vokabel');

// --- Body lesen ---
$daten = json_body_lesen();

if (!isset($daten['synonyme']) || !is_array($daten['synonyme'])) {
    fehler_ungueltige_eingabe('Feld "synonyme" muss ein Array sein.');
}

$pdo = db_verbindung();

// Validierung
$validierte = [];
foreach ($daten['synonyme'] as $syn) {
    if (empty($syn['synonym']) || trim($syn['synonym']) === '') {
        continue;
    }

    $sprache = $syn['sprache'] ?? 'de';
    if (!in_array($sprache, ['sv', 'de'], true)) {
        $sprache = 'de';
    }

    laenge_validieren(trim($syn['synonym']), 'synonym', 1, 128);

    $validierte[] = [
        'synonym' => trim($syn['synonym']),
        'sprache' => $sprache,
    ];
}

// --- Transaktion ---
$pdo->beginTransaction();

try {
    // Alte loeschen
    $stmt = $pdo->prepare('DELETE FROM synonyme WHERE vokabel_id = ?');
    $stmt->execute([$id]);

    // Neue einfuegen
    if (!empty($validierte)) {
        $sql = "INSERT INTO synonyme (vokabel_id, synonym, sprache) VALUES (?, ?, ?)";
        $stmt = $pdo->prepare($sql);

        foreach ($validierte as $syn) {
            $stmt->execute([$id, $syn['synonym'], $syn['sprache']]);
        }
    }

    $pdo->commit();

    // Gespeicherte Synonyme laden
    $stmt = $pdo->prepare('SELECT id, synonym, sprache FROM synonyme WHERE vokabel_id = ? ORDER BY sprache, id');
    $stmt->execute([$id]);
    $synonyme = $stmt->fetchAll();

    foreach ($synonyme as &$s) {
        $s['id'] = (int) $s['id'];
    }
    unset($s);

    json_erfolg($synonyme, count($synonyme) . ' Synonym(e) gespeichert.');

} catch (PDOException $e) {
    $pdo->rollBack();
    error_log('Synonyme speichern fehlgeschlagen: ' . $e->getMessage());
    fehler_server('Synonyme konnten nicht gespeichert werden.');
}
