<?php
/**
 * API: Vokabeln — Synonym-Liste (dedupliziert)
 *
 * GET /api/vokabeln/synonym_liste.php
 *
 * Gibt alle sv-Synonym-Paare zurück.
 * Dedupliziert: bidirektionale Paare (A↔B) erscheinen nur einmal (kleinere ID zuerst).
 * Einseitige Einträge (Synonym-Text ohne zugehörige Vokabel) werden separat markiert.
 * Nur Admin.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';

methode_erzwingen('GET');

$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

$pdo = db_verbindung();

// Alle sv-Synonyme mit optionalem Join auf die Synonym-Vokabel
$sql = "
    SELECT
        v1.id          AS id_a,
        v1.englisch  AS englisch_a,
        v1.deutsch,
        v1.wortart,
        s.synonym      AS synonym_text,
        v2.id          AS id_b,
        v2.englisch  AS englisch_b
    FROM synonyme s
    JOIN  vokabeln v1
          ON  v1.id        = s.vokabel_id
          AND v1.aktiv     = 1
          AND v1.ist_privat = 0
    LEFT JOIN vokabeln v2
          ON  v2.englisch  = s.synonym
          AND v2.aktiv       = 1
          AND v2.ist_privat  = 0
    WHERE s.sprache = 'en'
    ORDER BY v1.id, s.synonym
";

$stmt = $pdo->prepare($sql);
$stmt->execute();
$alle = $stmt->fetchAll();

// Deduplizieren: bidirektionale Paare nur einmal (id_a < id_b)
$paare   = [];
$gesehen = [];

foreach ($alle as $row) {
    $id_a = (int) $row['id_a'];
    $id_b = $row['id_b'] !== null ? (int) $row['id_b'] : null;

    if ($id_b !== null) {
        $min = min($id_a, $id_b);
        $max = max($id_a, $id_b);
        $key = "{$min}|{$max}";

        if (isset($gesehen[$key])) {
            continue; // Dieses Paar wurde bereits erfasst
        }
        $gesehen[$key] = true;
    }

    $paare[] = [
        'id_a'          => $id_a,
        'englisch_a'  => $row['englisch_a'],
        'deutsch'       => $row['deutsch'],
        'wortart'       => $row['wortart'],
        'synonym_text'  => $row['synonym_text'],
        'id_b'          => $id_b,
        'englisch_b'  => $row['englisch_b'] ?? $row['synonym_text'],
        'bidirektional' => $id_b !== null,
    ];
}

json_erfolg($paare, count($paare) . ' Synonym-Paar(e) gefunden.');

