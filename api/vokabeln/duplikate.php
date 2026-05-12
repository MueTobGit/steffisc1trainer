<?php
/**
 * API: Vokabeln — Duplikate suchen & zusammenführen
 *
 * GET  /api/vokabeln/duplikate.php
 *      Findet alle öffentlichen Vokabeln mit gleichem schwedischen Begriff + Wortart.
 *      Gibt Gruppen zurück, jeweils mit SM-2-Lernstand-Statistiken pro Eintrag.
 *
 * POST /api/vokabeln/duplikate.php
 *      Body: { behalten_id: int, loeschen_id: int }
 *      Führt zwei Vokabeln zusammen:
 *        - Fortschritt (SM-2): bessere Stufe gewinnt, Gesamtzähler werden addiert
 *        - Grammatik-Formen: fehlende Formen werden übernommen
 *        - Sätze, Lektion-Zuordnungen, Favoriten, Synonyme: vollständig übertragen
 *        - Die Duplikat-Vokabel wird anschließend gelöscht (CASCADE)
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

    // Schritt 1: Gruppen-Keys ermitteln
    if ($mit_stamm) {
        // Stammvokabel-Suche: Klammerzusätze entfernen, dann auf Stamm gruppieren
        // REGEXP_REPLACE ist in MySQL 8.0+ und MariaDB 10.0+ verfuegbar
        $dupl_stmt = $pdo->query("
            SELECT
                TRIM(REGEXP_REPLACE(LOWER(schwedisch), ' ?\\\\([^)]*\\\\)', '')) AS sw_lower,
                wortart
            FROM vokabeln
            WHERE ist_privat = 0
            GROUP BY TRIM(REGEXP_REPLACE(LOWER(schwedisch), ' ?\\\\([^)]*\\\\)', '')), wortart
            HAVING COUNT(DISTINCT LOWER(schwedisch)) > 1
            ORDER BY sw_lower ASC
        ");
    } else {
        $dupl_stmt = $pdo->query("
            SELECT LOWER(schwedisch) AS sw_lower, wortart
            FROM vokabeln
            WHERE ist_privat = 0
            GROUP BY LOWER(schwedisch), wortart
            HAVING COUNT(*) > 1
            ORDER BY LOWER(schwedisch) ASC
        ");
    }
    $dupl_keys = $dupl_stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($dupl_keys)) {
        json_erfolg(['gruppen' => [], 'gesamt_gruppen' => 0]);
    }

    // Schritt 2: Für jede Gruppe die vollständigen Daten inkl. SM-2-Statistiken laden
    if ($mit_stamm) {
        // Stammvokabel-Modus: alle Vokabeln laden, deren Stamm übereinstimmt
        $detail_stmt = $pdo->prepare("
            SELECT
                v.id,
                v.schwedisch,
                v.deutsch,
                v.wortart,
                v.genus,
                v.verbgruppe,
                v.sprachniveau,
                v.aktiv,
                v.kategorie_id,
                k.name                        AS kategorie_name,
                v.erstellt_am,
                COUNT(DISTINCT f.benutzer_id) AS nutzer_mit_lernstand,
                COALESCE(MAX(f.stufe), 0)     AS max_stufe,
                COUNT(DISTINCT vf.id)         AS formen_anzahl,
                COUNT(DISTINCT s.id)          AS saetze_anzahl
            FROM vokabeln v
            LEFT JOIN kategorien     k  ON k.id         = v.kategorie_id
            LEFT JOIN fortschritt    f  ON f.vokabel_id  = v.id
            LEFT JOIN vokabel_formen vf ON vf.vokabel_id = v.id
            LEFT JOIN saetze         s  ON s.vokabel_id  = v.id
            WHERE TRIM(REGEXP_REPLACE(LOWER(v.schwedisch), ' ?\\\\([^)]*\\\\)', '')) = ?
              AND v.wortart = ?
              AND v.ist_privat = 0
            GROUP BY
                v.id, v.schwedisch, v.deutsch, v.wortart, v.genus, v.verbgruppe,
                v.sprachniveau, v.aktiv, v.kategorie_id, k.name, v.erstellt_am
            ORDER BY v.id ASC
        ");
    } else {
        $detail_stmt = $pdo->prepare("
            SELECT
                v.id,
                v.schwedisch,
                v.deutsch,
                v.wortart,
                v.genus,
                v.verbgruppe,
                v.sprachniveau,
                v.aktiv,
                v.kategorie_id,
                k.name                        AS kategorie_name,
                v.erstellt_am,
                COUNT(DISTINCT f.benutzer_id) AS nutzer_mit_lernstand,
                COALESCE(MAX(f.stufe), 0)     AS max_stufe,
                COUNT(DISTINCT vf.id)         AS formen_anzahl,
                COUNT(DISTINCT s.id)          AS saetze_anzahl
            FROM vokabeln v
            LEFT JOIN kategorien     k  ON k.id         = v.kategorie_id
            LEFT JOIN fortschritt    f  ON f.vokabel_id  = v.id
            LEFT JOIN vokabel_formen vf ON vf.vokabel_id = v.id
            LEFT JOIN saetze         s  ON s.vokabel_id  = v.id
            WHERE LOWER(v.schwedisch) = ? AND v.wortart = ? AND v.ist_privat = 0
            GROUP BY
                v.id, v.schwedisch, v.deutsch, v.wortart, v.genus, v.verbgruppe,
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
            $v['formen_anzahl']        = (int)  $v['formen_anzahl'];
            $v['saetze_anzahl']        = (int)  $v['saetze_anzahl'];
        }
        unset($v);

        $gruppen[] = [
            'schwedisch' => $vokabeln[0]['schwedisch'],
            'stamm'      => $key['sw_lower'],
            'wortart'    => $key['wortart'],
            'vokabeln'   => $vokabeln,
        ];
    }

    json_erfolg(['gruppen' => $gruppen, 'gesamt_gruppen' => count($gruppen)]);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — Zwei Vokabeln zusammenführen
// ─────────────────────────────────────────────────────────────────────────────
if ($methode === 'POST') {

    $body        = json_decode(file_get_contents('php://input'), true) ?? [];
    $behalten_id = isset($body['behalten_id']) ? (int) $body['behalten_id'] : 0;
    $loeschen_id = isset($body['loeschen_id']) ? (int) $body['loeschen_id'] : 0;

    if (!$behalten_id || !$loeschen_id || $behalten_id === $loeschen_id) {
        fehler_ungueltige_eingabe('Ungültige oder identische IDs angegeben.');
    }

    // Beide Vokabeln müssen existieren und öffentlich sein
    $pruefen = $pdo->prepare("SELECT id FROM vokabeln WHERE id = ? AND ist_privat = 0");

    $pruefen->execute([$behalten_id]);
    if (!$pruefen->fetchColumn()) {
        fehler_nicht_gefunden("behalten_id $behalten_id nicht gefunden oder privat.");
    }

    $pruefen->execute([$loeschen_id]);
    if (!$pruefen->fetchColumn()) {
        fehler_nicht_gefunden("loeschen_id $loeschen_id nicht gefunden oder privat.");
    }

    $stats = [
        'fortschritt_uebertragen'      => 0,
        'fortschritt_zusammengefuehrt' => 0,
        'formen_uebertragen'           => 0,
        'saetze_uebertragen'           => 0,
        'lektionen_uebertragen'        => 0,
    ];

    $pdo->beginTransaction();
    try {

        // ── 1. Fortschritt übertragen / zusammenführen ────────────────────────
        //
        // Strategie:
        //   - Kein Konflikt → loeschen_id-Eintrag auf behalten_id umschreiben
        //   - Konflikt (beide haben Fortschritt für selben Nutzer + Richtung):
        //       * Bessere Stufe gewinnt (bei Gleichstand: höherer Leichtigkeitsfaktor)
        //       * richtig_gesamt und falsch_gesamt werden addiert
        //       * punkte: Maximum aus beiden behalten
        //
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
                // Kein Konflikt — direkt auf behalten_id umschreiben
                $pdo->prepare("
                    UPDATE fortschritt SET vokabel_id = ?
                    WHERE vokabel_id = ? AND benutzer_id = ? AND richtung = ?
                ")->execute([$behalten_id, $loeschen_id, $del['benutzer_id'], $del['richtung']]);
                $stats['fortschritt_uebertragen']++;
            } else {
                // Konflikt: bessere Stufe/EF gewinnt, Zähler werden addiert
                $del_stufe  = (int)   $del['stufe'];
                $keep_stufe = (int)   $keep['stufe'];
                $del_ef     = (float) $del['leichtigkeitsfaktor'];
                $keep_ef    = (float) $keep['leichtigkeitsfaktor'];

                if ($del_stufe > $keep_stufe || ($del_stufe === $keep_stufe && $del_ef > $keep_ef)) {
                    // Lösch-Eintrag hat den besseren Fortschritt → SM-2-State übernehmen
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
                        $del_stufe,
                        $del['zustand'],
                        $del_ef,
                        (int) $del['wiederholungen'],
                        (int) $del['intervall_tage'],
                        $del['naechste_wiederholung'],
                        max((int) $del['punkte'], (int) $keep['punkte']),
                        (int) $del['richtig_gesamt'],
                        (int) $del['falsch_gesamt'],
                        $behalten_id, $del['benutzer_id'], $del['richtung'],
                    ]);
                } else {
                    // Behalte-Eintrag ist besser oder gleichwertig → nur Zähler addieren
                    $pdo->prepare("
                        UPDATE fortschritt SET
                            richtig_gesamt = richtig_gesamt + ?,
                            falsch_gesamt  = falsch_gesamt  + ?
                        WHERE vokabel_id = ? AND benutzer_id = ? AND richtung = ?
                    ")->execute([
                        (int) $del['richtig_gesamt'],
                        (int) $del['falsch_gesamt'],
                        $behalten_id, $del['benutzer_id'], $del['richtung'],
                    ]);
                }

                // Duplikat-Eintrag löschen (Unique-Constraint würde verhindern, zwei zu haben)
                $pdo->prepare("
                    DELETE FROM fortschritt
                    WHERE vokabel_id = ? AND benutzer_id = ? AND richtung = ?
                ")->execute([$loeschen_id, $del['benutzer_id'], $del['richtung']]);

                $stats['fortschritt_zusammengefuehrt']++;
            }
        }

        // ── 2. Grammatik-Formen übertragen (nur fehlende form_bezeichnung) ────
        $formen_stmt = $pdo->prepare("SELECT * FROM vokabel_formen WHERE vokabel_id = ?");
        $formen_stmt->execute([$loeschen_id]);
        foreach ($formen_stmt->fetchAll(PDO::FETCH_ASSOC) as $form) {
            $exists = $pdo->prepare("
                SELECT id FROM vokabel_formen WHERE vokabel_id = ? AND form_bezeichnung = ?
            ");
            $exists->execute([$behalten_id, $form['form_bezeichnung']]);
            if (!$exists->fetchColumn()) {
                $pdo->prepare("
                    INSERT INTO vokabel_formen (vokabel_id, form_bezeichnung, form_wert, reihenfolge)
                    VALUES (?, ?, ?, ?)
                ")->execute([
                    $behalten_id,
                    $form['form_bezeichnung'],
                    $form['form_wert'],
                    (int) $form['reihenfolge'],
                ]);
                $stats['formen_uebertragen']++;
            }
        }

        // ── 3. Beispielsätze übertragen ───────────────────────────────────────
        $res = $pdo->prepare("UPDATE saetze SET vokabel_id = ? WHERE vokabel_id = ?");
        $res->execute([$behalten_id, $loeschen_id]);
        $stats['saetze_uebertragen'] = $res->rowCount();

        // ── 4. Lektion-Zuordnungen (INSERT IGNORE vermeidet Duplikate) ─────────
        $lek_stmt = $pdo->prepare("
            SELECT lektion_id, reihenfolge FROM lektion_vokabeln WHERE vokabel_id = ?
        ");
        $lek_stmt->execute([$loeschen_id]);
        foreach ($lek_stmt->fetchAll(PDO::FETCH_ASSOC) as $lek) {
            $ins = $pdo->prepare("
                INSERT IGNORE INTO lektion_vokabeln (lektion_id, vokabel_id, reihenfolge)
                VALUES (?, ?, ?)
            ");
            $ins->execute([$lek['lektion_id'], $behalten_id, (int) $lek['reihenfolge']]);
            if ($ins->rowCount() > 0) $stats['lektionen_uebertragen']++;
        }

        // ── 5. Favoriten übertragen (try/catch: Tabelle ist optional) ──────────
        try {
            $pdo->prepare("
                INSERT IGNORE INTO benutzer_favoriten (benutzer_id, vokabel_id)
                SELECT benutzer_id, ? FROM benutzer_favoriten WHERE vokabel_id = ?
            ")->execute([$behalten_id, $loeschen_id]);
        } catch (\PDOException $e) { /* Tabelle existiert ggf. nicht */ }

        // ── 6. Text-Synonyme übertragen ───────────────────────────────────────
        try {
            $pdo->prepare("
                INSERT IGNORE INTO synonyme (vokabel_id, synonym, sprache)
                SELECT ?, synonym, sprache FROM synonyme WHERE vokabel_id = ?
            ")->execute([$behalten_id, $loeschen_id]);
        } catch (\PDOException $e) { /* optional */ }

        // ── 7. Strukturelle Synonyme (vokabel_synonyme) ───────────────────────
        try {
            // loeschen_id war Quelle → behalten_id wird Quelle (kein Selbstverweis)
            $pdo->prepare("
                INSERT IGNORE INTO vokabel_synonyme (vokabel_id, synonym_id)
                SELECT ?, synonym_id FROM vokabel_synonyme
                WHERE vokabel_id = ? AND synonym_id != ?
            ")->execute([$behalten_id, $loeschen_id, $behalten_id]);

            // loeschen_id war Ziel → behalten_id wird Ziel (kein Selbstverweis)
            $pdo->prepare("
                INSERT IGNORE INTO vokabel_synonyme (vokabel_id, synonym_id)
                SELECT vokabel_id, ? FROM vokabel_synonyme
                WHERE synonym_id = ? AND vokabel_id != ?
            ")->execute([$behalten_id, $loeschen_id, $behalten_id]);
        } catch (\PDOException $e) { /* optional */ }

        // ── 8. Duplikat löschen (FK-CASCADE entfernt verbleibende abhäng. Zeilen) ─
        $pdo->prepare("DELETE FROM vokabeln WHERE id = ?")->execute([$loeschen_id]);

        $pdo->commit();
        json_erfolg($stats, 'Vokabeln erfolgreich zusammengeführt.');

    } catch (\Exception $e) {
        $pdo->rollBack();
        fehler_server('Fehler beim Zusammenführen: ' . $e->getMessage());
    }
}
