<?php
/**
 * API: Vokabeln — Duplikate suchen & zusammenführen
 *
 * GET  /api/vokabeln/duplikate.php
 *      ?mit_stamm=1  → Stammvokabel-Suche (Klammerzusätze entfernen)
 *      ?aehnlich=1   → Prefix-Ähnlichkeit (5 Zeichen EN oder DE)
 *      Gibt Gruppen zurück, jeweils mit SM-2-Lernstand-Statistiken pro Eintrag.
 *
 * POST /api/vokabeln/duplikate.php
 *      Body: { behalten_id: int, loeschen_id: int }
 *        oder { behalten_id: int, loeschen_ids: [int, ...] }
 *      Führt eine oder mehrere Vokabeln in behalten_id zusammen.
 *
 * Nur für Admins.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';

methode_erzwingen(['GET', 'POST']);

$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

$pdo     = db_verbindung();
$methode = $_SERVER['REQUEST_METHOD'];

// ─────────────────────────────────────────────────────────────────────────────
// GET — Duplikate finden
// ─────────────────────────────────────────────────────────────────────────────
if ($methode === 'GET') {

    $mit_stamm = !empty($_GET['mit_stamm']);
    $aehnlich  = !empty($_GET['aehnlich']);

    // ── Ähnlichkeits-Modus: Prefix-Matching in PHP ───────────────────────────
    if ($aehnlich) {
        $alle_stmt = $pdo->query("
            SELECT
                v.id,
                v.englisch,
                v.deutsch,
                v.wortart,
                v.sprachniveau,
                v.aktiv,
                v.kategorie_id,
                k.name                        AS kategorie_name,
                v.erstellt_am,
                COUNT(DISTINCT f.benutzer_id) AS nutzer_mit_lernstand,
                COALESCE(MAX(f.stufe), 0)     AS max_stufe,
                COUNT(DISTINCT s.id)          AS saetze_anzahl
            FROM vokabeln v
            LEFT JOIN kategorien  k ON k.id         = v.kategorie_id
            LEFT JOIN fortschritt f ON f.vokabel_id  = v.id
            LEFT JOIN saetze      s ON s.vokabel_id  = v.id
            WHERE v.ist_privat = 0
            GROUP BY
                v.id, v.englisch, v.deutsch, v.wortart,
                v.sprachniveau, v.aktiv, v.kategorie_id, k.name, v.erstellt_am
            ORDER BY v.englisch
        ");
        $alle = $alle_stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($alle as &$v) {
            $v['id']                   = (int)  $v['id'];
            $v['aktiv']                = (bool) $v['aktiv'];
            $v['kategorie_id']         = $v['kategorie_id'] !== null ? (int) $v['kategorie_id'] : null;
            $v['nutzer_mit_lernstand'] = (int)  $v['nutzer_mit_lernstand'];
            $v['max_stufe']            = (int)  $v['max_stufe'];
            $v['saetze_anzahl']        = (int)  $v['saetze_anzahl'];
        }
        unset($v);

        $en_gruppen = [];
        $de_gruppen = [];

        foreach ($alle as $v) {
            // Nur Buchstaben behalten, auf 5 Zeichen kürzen
            $en_norm = substr(strtolower((string) preg_replace('/[^a-zA-Z]/i', '', $v['englisch'])), 0, 5);
            $de_norm = mb_substr(mb_strtolower((string) preg_replace('/[^\p{L}]/u', '', $v['deutsch'])), 0, 5);

            if (mb_strlen($en_norm) >= 4) {
                $en_gruppen[$en_norm . '|' . $v['wortart']][] = $v;
            }
            if (mb_strlen($de_norm) >= 4) {
                $de_gruppen[$de_norm . '|' . $v['wortart']][] = $v;
            }
        }

        $gesehen = [];
        $gruppen = [];

        foreach ([$en_gruppen, $de_gruppen] as $prefix_map) {
            foreach ($prefix_map as $key => $voks) {
                if (count($voks) < 2) continue;
                // Exakte Duplikate (gleicher englisch-String) überspringen —
                // die sind im normalen Modus besser sichtbar
                $unique_en = array_unique(array_column($voks, 'englisch'));
                if (count($unique_en) === 1) continue;

                $ids = array_column($voks, 'id');
                sort($ids);
                $grp_key = implode(',', $ids);
                if (isset($gesehen[$grp_key])) continue;
                $gesehen[$grp_key] = true;

                $gruppen[] = [
                    'englisch' => $voks[0]['englisch'],
                    'stamm'    => $key,
                    'wortart'  => $voks[0]['wortart'],
                    'vokabeln' => $voks,
                ];
            }
        }

        json_erfolg(['gruppen' => $gruppen, 'gesamt_gruppen' => count($gruppen)]);
    }

    // ── Exakt- oder Stamm-Modus ───────────────────────────────────────────────

    if ($mit_stamm) {
        $dupl_stmt = $pdo->query("
            SELECT
                TRIM(REGEXP_REPLACE(LOWER(englisch), ' ?\\\\([^)]*\\\\)', '')) AS sw_lower,
                wortart
            FROM vokabeln
            WHERE ist_privat = 0
            GROUP BY TRIM(REGEXP_REPLACE(LOWER(englisch), ' ?\\\\([^)]*\\\\)', '')), wortart
            HAVING COUNT(DISTINCT LOWER(englisch)) > 1
            ORDER BY sw_lower ASC
        ");
    } else {
        $dupl_stmt = $pdo->query("
            SELECT LOWER(englisch) AS sw_lower, wortart
            FROM vokabeln
            WHERE ist_privat = 0
            GROUP BY LOWER(englisch), wortart
            HAVING COUNT(*) > 1
            ORDER BY LOWER(englisch) ASC
        ");
    }
    $dupl_keys = $dupl_stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($dupl_keys)) {
        json_erfolg(['gruppen' => [], 'gesamt_gruppen' => 0]);
    }

    if ($mit_stamm) {
        $detail_stmt = $pdo->prepare("
            SELECT
                v.id,
                v.englisch,
                v.deutsch,
                v.wortart,
                v.sprachniveau,
                v.aktiv,
                v.kategorie_id,
                k.name                        AS kategorie_name,
                v.erstellt_am,
                COUNT(DISTINCT f.benutzer_id) AS nutzer_mit_lernstand,
                COALESCE(MAX(f.stufe), 0)     AS max_stufe,
                COUNT(DISTINCT s.id)          AS saetze_anzahl
            FROM vokabeln v
            LEFT JOIN kategorien     k  ON k.id         = v.kategorie_id
            LEFT JOIN fortschritt    f  ON f.vokabel_id  = v.id
            LEFT JOIN saetze         s  ON s.vokabel_id  = v.id
            WHERE TRIM(REGEXP_REPLACE(LOWER(v.englisch), ' ?\\\\([^)]*\\\\)', '')) = ?
              AND v.wortart = ?
              AND v.ist_privat = 0
            GROUP BY
                v.id, v.englisch, v.deutsch, v.wortart,
                v.sprachniveau, v.aktiv, v.kategorie_id, k.name, v.erstellt_am
            ORDER BY v.id ASC
        ");
    } else {
        $detail_stmt = $pdo->prepare("
            SELECT
                v.id,
                v.englisch,
                v.deutsch,
                v.wortart,
                v.sprachniveau,
                v.aktiv,
                v.kategorie_id,
                k.name                        AS kategorie_name,
                v.erstellt_am,
                COUNT(DISTINCT f.benutzer_id) AS nutzer_mit_lernstand,
                COALESCE(MAX(f.stufe), 0)     AS max_stufe,
                COUNT(DISTINCT s.id)          AS saetze_anzahl
            FROM vokabeln v
            LEFT JOIN kategorien     k  ON k.id         = v.kategorie_id
            LEFT JOIN fortschritt    f  ON f.vokabel_id  = v.id
            LEFT JOIN saetze         s  ON s.vokabel_id  = v.id
            WHERE LOWER(v.englisch) = ? AND v.wortart = ? AND v.ist_privat = 0
            GROUP BY
                v.id, v.englisch, v.deutsch, v.wortart,
                v.sprachniveau, v.aktiv, v.kategorie_id, k.name, v.erstellt_am
            ORDER BY v.id ASC
        ");
    }

    $gruppen = [];
    foreach ($dupl_keys as $key) {
        $detail_stmt->execute([$key['sw_lower'], $key['wortart']]);
        $vokabeln = $detail_stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($vokabeln as &$v) {
            $v['id']                   = (int)  $v['id'];
            $v['aktiv']                = (bool) $v['aktiv'];
            $v['kategorie_id']         = $v['kategorie_id'] !== null ? (int) $v['kategorie_id'] : null;
            $v['nutzer_mit_lernstand'] = (int)  $v['nutzer_mit_lernstand'];
            $v['max_stufe']            = (int)  $v['max_stufe'];
            $v['saetze_anzahl']        = (int)  $v['saetze_anzahl'];
        }
        unset($v);

        $gruppen[] = [
            'englisch' => $vokabeln[0]['englisch'],
            'stamm'      => $key['sw_lower'],
            'wortart'    => $key['wortart'],
            'vokabeln'   => $vokabeln,
        ];
    }

    json_erfolg(['gruppen' => $gruppen, 'gesamt_gruppen' => count($gruppen)]);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — Vokabeln zusammenführen (einzeln oder mehrere in eine)
// ─────────────────────────────────────────────────────────────────────────────
if ($methode === 'POST') {

    $body        = json_decode(file_get_contents('php://input'), true) ?? [];
    $behalten_id = isset($body['behalten_id']) ? (int) $body['behalten_id'] : 0;

    // Unterstützt loeschen_ids (Array) oder loeschen_id (Einzelwert)
    if (!empty($body['loeschen_ids']) && is_array($body['loeschen_ids'])) {
        $loeschen_ids = array_values(array_unique(array_map('intval', $body['loeschen_ids'])));
        $loeschen_ids = array_values(array_filter($loeschen_ids, fn($id) => $id > 0 && $id !== $behalten_id));
    } else {
        $einzeln = isset($body['loeschen_id']) ? (int) $body['loeschen_id'] : 0;
        $loeschen_ids = ($einzeln > 0 && $einzeln !== $behalten_id) ? [$einzeln] : [];
    }

    if ($behalten_id < 1 || empty($loeschen_ids)) {
        fehler_ungueltige_eingabe('Ungültige oder identische IDs angegeben.');
    }

    // Alle IDs müssen existieren und öffentlich sein
    $pruefen = $pdo->prepare("SELECT id FROM vokabeln WHERE id = ? AND ist_privat = 0");

    $pruefen->execute([$behalten_id]);
    if (!$pruefen->fetchColumn()) {
        fehler_nicht_gefunden("behalten_id $behalten_id nicht gefunden oder privat.");
    }

    foreach ($loeschen_ids as $lid) {
        $pruefen->execute([$lid]);
        if (!$pruefen->fetchColumn()) {
            fehler_nicht_gefunden("loeschen_id $lid nicht gefunden oder privat.");
        }
    }

    $gesamt = [
        'fortschritt_uebertragen'      => 0,
        'fortschritt_zusammengefuehrt' => 0,
        'saetze_uebertragen'           => 0,
        'themenfelder_uebertragen'     => 0,
        'zusammengefuehrt_anzahl'      => 0,
    ];

    $pdo->beginTransaction();
    try {
        foreach ($loeschen_ids as $loeschen_id) {
            $s = _merge_paar($pdo, $behalten_id, $loeschen_id);
            $gesamt['fortschritt_uebertragen']      += $s['fortschritt_uebertragen'];
            $gesamt['fortschritt_zusammengefuehrt'] += $s['fortschritt_zusammengefuehrt'];
            $gesamt['saetze_uebertragen']           += $s['saetze_uebertragen'];
            $gesamt['themenfelder_uebertragen']     += $s['themenfelder_uebertragen'];
            $gesamt['zusammengefuehrt_anzahl']++;
        }
        $pdo->commit();
        json_erfolg($gesamt, 'Vokabeln erfolgreich zusammengeführt.');
    } catch (\Exception $e) {
        $pdo->rollBack();
        fehler_server('Fehler beim Zusammenführen: ' . $e->getMessage());
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hilfsfunktion: ein Paar zusammenführen (innerhalb einer Transaktion)
// ─────────────────────────────────────────────────────────────────────────────
function _merge_paar(\PDO $pdo, int $behalten_id, int $loeschen_id): array
{
    $stats = [
        'fortschritt_uebertragen'      => 0,
        'fortschritt_zusammengefuehrt' => 0,
        'saetze_uebertragen'           => 0,
        'themenfelder_uebertragen'     => 0,
    ];

    // ── 1. Fortschritt übertragen / zusammenführen ───────────────────────────
    $del_f = $pdo->prepare("SELECT * FROM fortschritt WHERE vokabel_id = ?");
    $del_f->execute([$loeschen_id]);
    $del_rows = $del_f->fetchAll(PDO::FETCH_ASSOC);

    foreach ($del_rows as $del) {
        $keep_stmt = $pdo->prepare("
            SELECT * FROM fortschritt
            WHERE vokabel_id = ? AND benutzer_id = ? AND richtung = ?
        ");
        $keep_stmt->execute([$behalten_id, $del['benutzer_id'], $del['richtung']]);
        $keep = $keep_stmt->fetch(PDO::FETCH_ASSOC);

        if (!$keep) {
            $pdo->prepare("
                UPDATE fortschritt SET vokabel_id = ?
                WHERE vokabel_id = ? AND benutzer_id = ? AND richtung = ?
            ")->execute([$behalten_id, $loeschen_id, $del['benutzer_id'], $del['richtung']]);
            $stats['fortschritt_uebertragen']++;
        } else {
            $del_stufe  = (int)   $del['stufe'];
            $keep_stufe = (int)   $keep['stufe'];
            $del_ef     = (float) $del['leichtigkeitsfaktor'];
            $keep_ef    = (float) $keep['leichtigkeitsfaktor'];

            if ($del_stufe > $keep_stufe || ($del_stufe === $keep_stufe && $del_ef > $keep_ef)) {
                $pdo->prepare("
                    UPDATE fortschritt SET
                        stufe                 = ?,
                        zustand               = ?,
                        leichtigkeitsfaktor   = ?,
                        wiederholungen        = ?,
                        intervall_tage        = ?,
                        naechste_wiederholung = ?,
                        punkte                = ?,
                        richtig_gesamt        = richtig_gesamt + ?,
                        falsch_gesamt         = falsch_gesamt  + ?
                    WHERE vokabel_id = ? AND benutzer_id = ? AND richtung = ?
                ")->execute([
                    $del_stufe, $del['zustand'], $del_ef,
                    (int) $del['wiederholungen'], (int) $del['intervall_tage'],
                    $del['naechste_wiederholung'],
                    max((int) $del['punkte'], (int) $keep['punkte']),
                    (int) $del['richtig_gesamt'], (int) $del['falsch_gesamt'],
                    $behalten_id, $del['benutzer_id'], $del['richtung'],
                ]);
            } else {
                $pdo->prepare("
                    UPDATE fortschritt SET
                        richtig_gesamt = richtig_gesamt + ?,
                        falsch_gesamt  = falsch_gesamt  + ?
                    WHERE vokabel_id = ? AND benutzer_id = ? AND richtung = ?
                ")->execute([
                    (int) $del['richtig_gesamt'], (int) $del['falsch_gesamt'],
                    $behalten_id, $del['benutzer_id'], $del['richtung'],
                ]);
            }

            $pdo->prepare("
                DELETE FROM fortschritt
                WHERE vokabel_id = ? AND benutzer_id = ? AND richtung = ?
            ")->execute([$loeschen_id, $del['benutzer_id'], $del['richtung']]);

            $stats['fortschritt_zusammengefuehrt']++;
        }
    }

    // ── 2. Beispielsätze übertragen ──────────────────────────────────────────
    $res = $pdo->prepare("UPDATE saetze SET vokabel_id = ? WHERE vokabel_id = ?");
    $res->execute([$behalten_id, $loeschen_id]);
    $stats['saetze_uebertragen'] = $res->rowCount();

    // ── 3. Themenfeld-Zuordnungen (INSERT IGNORE) ────────────────────────────
    $lek_stmt = $pdo->prepare("
        SELECT themenfeld_id, reihenfolge FROM themenfeld_vokabeln WHERE vokabel_id = ?
    ");
    $lek_stmt->execute([$loeschen_id]);
    foreach ($lek_stmt->fetchAll(PDO::FETCH_ASSOC) as $lek) {
        $ins = $pdo->prepare("
            INSERT IGNORE INTO themenfeld_vokabeln (themenfeld_id, vokabel_id, reihenfolge)
            VALUES (?, ?, ?)
        ");
        $ins->execute([$lek['themenfeld_id'], $behalten_id, (int) $lek['reihenfolge']]);
        if ($ins->rowCount() > 0) $stats['themenfelder_uebertragen']++;
    }

    // ── 4. Favoriten ─────────────────────────────────────────────────────────
    try {
        $pdo->prepare("
            INSERT IGNORE INTO benutzer_favoriten (benutzer_id, vokabel_id)
            SELECT benutzer_id, ? FROM benutzer_favoriten WHERE vokabel_id = ?
        ")->execute([$behalten_id, $loeschen_id]);
    } catch (\PDOException $e) {}

    // ── 5. Text-Synonyme ─────────────────────────────────────────────────────
    try {
        $pdo->prepare("
            INSERT IGNORE INTO synonyme (vokabel_id, synonym, sprache)
            SELECT ?, synonym, sprache FROM synonyme WHERE vokabel_id = ?
        ")->execute([$behalten_id, $loeschen_id]);
    } catch (\PDOException $e) {}

    // ── 6. Strukturelle Synonyme ─────────────────────────────────────────────
    try {
        $pdo->prepare("
            INSERT IGNORE INTO vokabel_synonyme (vokabel_id, synonym_id)
            SELECT ?, synonym_id FROM vokabel_synonyme
            WHERE vokabel_id = ? AND synonym_id != ?
        ")->execute([$behalten_id, $loeschen_id, $behalten_id]);

        $pdo->prepare("
            INSERT IGNORE INTO vokabel_synonyme (vokabel_id, synonym_id)
            SELECT vokabel_id, ? FROM vokabel_synonyme
            WHERE synonym_id = ? AND vokabel_id != ?
        ")->execute([$behalten_id, $loeschen_id, $behalten_id]);
    } catch (\PDOException $e) {}

    // ── 7. Duplikat löschen ──────────────────────────────────────────────────
    $pdo->prepare("DELETE FROM vokabeln WHERE id = ?")->execute([$loeschen_id]);

    return $stats;
}
