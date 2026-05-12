<?php
/**
 * API: Vokabeln — Synonyme bidirektional verknüpfen
 *
 * POST /api/vokabeln/synonyme_verknuepfen.php
 *
 * Body:
 *   - vokabel_ids: Array von Vokabel-IDs (min. 2, max. 20)
 *
 * Verknüpft alle angegebenen Vokabeln gegenseitig als englische Synonyme.
 * Bereits vorhandene Einträge werden übersprungen (keine Duplikate).
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

if (!isset($daten['vokabel_ids']) || !is_array($daten['vokabel_ids'])) {
    fehler_ungueltige_eingabe('Feld "vokabel_ids" muss ein Array sein.');
}

$ids = array_values(array_unique(array_map('intval', $daten['vokabel_ids'])));
$ids = array_values(array_filter($ids, fn($id) => $id > 0));

if (count($ids) < 2) {
    fehler_ungueltige_eingabe('Mindestens 2 Vokabeln müssen ausgewählt sein.');
}

if (count($ids) > 20) {
    fehler_ungueltige_eingabe('Maximal 20 Vokabeln können gleichzeitig verknüpft werden.');
}

$pdo = db_verbindung();

// --- Vokabeln laden und prüfen ---
$placeholders = implode(',', array_fill(0, count($ids), '?'));
$stmt = $pdo->prepare("
    SELECT id, englisch
    FROM vokabeln
    WHERE id IN ({$placeholders})
      AND aktiv = 1
      AND ist_privat = 0
");
$stmt->execute($ids);
$vokabeln = $stmt->fetchAll();

if (count($vokabeln) !== count($ids)) {
    fehler_ungueltige_eingabe('Eine oder mehrere Vokabeln wurden nicht gefunden oder sind privat/inaktiv.');
}

// Map: id -> englisch
$wort_map = [];
foreach ($vokabeln as $v) {
    $wort_map[(int) $v['id']] = $v['englisch'];
}

$pdo->beginTransaction();

try {
    $check = $pdo->prepare("
        SELECT COUNT(*) FROM synonyme
        WHERE vokabel_id = ? AND synonym = ? AND sprache = 'en'
    ");
    $insert = $pdo->prepare("
        INSERT INTO synonyme (vokabel_id, synonym, sprache) VALUES (?, ?, 'en')
    ");

    $neu_erstellt = 0;

    // Für jedes Paar: bidirektional verknüpfen
    foreach ($ids as $id_a) {
        foreach ($ids as $id_b) {
            if ($id_a === $id_b) continue;

            $wort_b = $wort_map[$id_b];

            $check->execute([$id_a, $wort_b]);
            if ((int) $check->fetchColumn() === 0) {
                $insert->execute([$id_a, $wort_b]);
                $neu_erstellt++;
            }
        }
    }

    $pdo->commit();

    json_erfolg(
        ['verknuepft' => $neu_erstellt],
        $neu_erstellt > 0
            ? "{$neu_erstellt} neue Synonym-Verknüpfung(en) erstellt."
            : 'Alle Synonyme waren bereits vollständig verknüpft.'
    );

} catch (PDOException $e) {
    $pdo->rollBack();
    error_log('Synonyme verknüpfen fehlgeschlagen: ' . $e->getMessage());
    fehler_server('Synonyme konnten nicht verknüpft werden.');
}

