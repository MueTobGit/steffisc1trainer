<?php
/**
 * API: Vokabeln — Synonyme trennen
 *
 * POST /api/vokabeln/synonyme_trennen.php
 *
 * Body (bidirektional — bevorzugte Variante):
 *   - vokabel_id_a: int   Vokabel A
 *   - vokabel_id_b: int   Vokabel B
 *
 * Body (einseitig — für verwaiste Einträge ohne zugehörige Vokabel):
 *   - vokabel_id_a: int
 *   - synonym_text: string
 *
 * Entfernt die sv-Synonym-Verknüpfung zwischen A und B.
 * Bei bekanntem id_b: bidirektionale Löschung (A→B und B→A).
 * Nur Admin.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';

methode_erzwingen('POST');

$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

$daten = json_body_lesen();

$id_a        = isset($daten['vokabel_id_a']) ? (int) $daten['vokabel_id_a'] : 0;
$id_b        = isset($daten['vokabel_id_b']) ? (int) $daten['vokabel_id_b'] : 0;
$synonym_text = isset($daten['synonym_text']) ? trim($daten['synonym_text']) : '';

if ($id_a < 1) {
    fehler_ungueltige_eingabe('vokabel_id_a ist erforderlich.');
}

if ($id_b < 1 && $synonym_text === '') {
    fehler_ungueltige_eingabe('Entweder vokabel_id_b oder synonym_text ist erforderlich.');
}

$pdo = db_verbindung();

// Wörter laden (für bidirektionale Löschung)
if ($id_b > 0) {
    $stmt = $pdo->prepare('SELECT id, schwedisch FROM vokabeln WHERE id IN (?, ?) AND aktiv = 1');
    $stmt->execute([$id_a, $id_b]);
} else {
    $stmt = $pdo->prepare('SELECT id, schwedisch FROM vokabeln WHERE id = ? AND aktiv = 1');
    $stmt->execute([$id_a]);
}
$vokabeln = $stmt->fetchAll();
$wort_map  = array_column($vokabeln, 'schwedisch', 'id');

if (!isset($wort_map[$id_a])) {
    fehler_ungueltige_eingabe('Vokabel A nicht gefunden.');
}

$pdo->beginTransaction();

try {
    $geloescht = 0;
    $del = $pdo->prepare("DELETE FROM synonyme WHERE vokabel_id = ? AND synonym = ? AND sprache = 'sv'");

    if ($id_b > 0 && isset($wort_map[$id_b])) {
        // Bidirektional: A→B und B→A
        $del->execute([$id_a, $wort_map[$id_b]]);
        $geloescht += $del->rowCount();

        $del->execute([$id_b, $wort_map[$id_a]]);
        $geloescht += $del->rowCount();
    } else {
        // Einseitig: nur A → synonym_text
        $text = $synonym_text !== '' ? $synonym_text : ($wort_map[$id_b] ?? '');
        if ($text === '') {
            fehler_ungueltige_eingabe('Synonym-Text konnte nicht ermittelt werden.');
        }
        $del->execute([$id_a, $text]);
        $geloescht += $del->rowCount();
    }

    $pdo->commit();

    json_erfolg(
        ['geloescht' => $geloescht],
        $geloescht > 0 ? 'Synonym-Verknüpfung aufgehoben.' : 'Keine passenden Einträge gefunden.'
    );

} catch (PDOException $e) {
    $pdo->rollBack();
    error_log('Synonyme trennen fehlgeschlagen: ' . $e->getMessage());
    fehler_server('Synonyme konnten nicht getrennt werden.');
}
