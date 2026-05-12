<?php
/**
 * API: Vokabeln — Automatische Synonym-Vorschläge
 *
 * GET /api/vokabeln/synonym_vorschlaege.php
 *
 * Findet Paare öffentlicher Vokabeln mit identischer deutscher Übersetzung
 * und gleicher Wortart, die noch nicht als sv-Synonyme verknüpft sind.
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

// Paare mit identischer deutscher Übersetzung + Wortart, noch nicht verknüpft
// Nur id_a < id_b, damit jedes Paar einmal auftaucht
$sql = "
    SELECT
        v1.id         AS id_a,
        v1.schwedisch AS schwedisch_a,
        v2.id         AS id_b,
        v2.schwedisch AS schwedisch_b,
        v1.deutsch,
        v1.wortart
    FROM vokabeln v1
    JOIN vokabeln v2
        ON  v2.deutsch    = v1.deutsch
        AND v2.wortart    = v1.wortart
        AND v2.id         > v1.id
        AND v2.aktiv      = 1
        AND v2.ist_privat = 0
    WHERE v1.aktiv      = 1
      AND v1.ist_privat = 0
      AND NOT EXISTS (
          SELECT 1 FROM synonyme
          WHERE vokabel_id = v1.id
            AND synonym    = v2.schwedisch
            AND sprache    = 'sv'
      )
    ORDER BY v1.deutsch, v1.schwedisch
    LIMIT 100
";

$stmt = $pdo->prepare($sql);
$stmt->execute();
$vorschlaege = $stmt->fetchAll();

foreach ($vorschlaege as &$v) {
    $v['id_a'] = (int) $v['id_a'];
    $v['id_b'] = (int) $v['id_b'];
}
unset($v);

json_erfolg($vorschlaege, count($vorschlaege) . ' Vorschlag/-schläge gefunden.');
