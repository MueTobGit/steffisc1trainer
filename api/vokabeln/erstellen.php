<?php
/**
 * API: Vokabeln — Erstellen
 *
 * POST /api/vokabeln/erstellen.php
 *
 * Admin: oeffentliche Vokabel.
 * Normaler User: private Vokabel (ist_privat=1, besitzer_id=User).
 * Limit: max. 2000 private Vokabeln pro User (konfigurierbar).
 *
 * Body:
 *   - englisch       (Pflicht)
 *   - deutsch        (Pflicht)
 *   - wortart        (Pflicht)
 *   - sprachniveau   (optional, Standard: C1)
 *   - notizen        (optional)
 *   - kategorie_id   (optional, nur Admin)
 *   - synonyme       (optional, Array von {synonym, sprache:'en'|'de'})
 *   - themenfeld_id  (optional, Non-Admin: oeffentliches oder eigenes privates Themenfeld)
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';
require_once dirname(__DIR__) . '/_middleware/sichtbarkeit.php';

methode_erzwingen('POST');

$benutzer    = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];
$als_admin   = ist_admin($benutzer);

$daten = json_body_lesen();
pflichtfelder_pruefen($daten, ['englisch', 'deutsch', 'wortart']);
laenge_validieren($daten['englisch'], 'englisch', 1, 128);
laenge_validieren($daten['deutsch'],  'deutsch',  1, 256);
wortart_validieren($daten['wortart']);

$sprachniveau = $daten['sprachniveau'] ?? 'C1';
sprachniveau_validieren($sprachniveau);

$pdo = db_verbindung();

$ist_privat  = !$als_admin;
$besitzer_id = $als_admin ? null : $benutzer_id;

$kategorie_id = null;
if ($als_admin && !empty($daten['kategorie_id'])) {
    $kategorie_id = positive_ganzzahl_validieren($daten['kategorie_id'], 'kategorie_id');
    id_existiert($kategorie_id, 'kategorien', 'Kategorie');
}

// Limit fuer normale User
if (!$als_admin) {
    $limit = max_private_vokabeln($pdo);
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM vokabeln WHERE besitzer_id = ? AND ist_privat = 1');
    $stmt->execute([$benutzer_id]);
    if ((int) $stmt->fetchColumn() >= $limit) {
        fehler_ungueltige_eingabe("Du hast das Limit von {$limit} privaten Vokabeln erreicht.");
    }
}

// Duplikat-Pruefung
if ($als_admin) {
    $stmt = $pdo->prepare('SELECT id FROM vokabeln WHERE englisch = ? AND wortart = ? AND ist_privat = 0');
    $stmt->execute([trim($daten['englisch']), $daten['wortart']]);
} else {
    $stmt = $pdo->prepare('SELECT id FROM vokabeln WHERE englisch = ? AND wortart = ? AND besitzer_id = ? AND ist_privat = 1');
    $stmt->execute([trim($daten['englisch']), $daten['wortart'], $benutzer_id]);
}
if ($stmt->fetchColumn()) {
    fehler_doppelter_eintrag("Eine Vokabel '{$daten['englisch']}' mit Wortart '{$daten['wortart']}' existiert bereits.");
}

$themenfeld_id_neu = !empty($daten['themenfeld_id']) ? (int) $daten['themenfeld_id'] : 0;

$pdo->beginTransaction();
try {
    $stmt = $pdo->prepare("
        INSERT INTO vokabeln
            (englisch, deutsch, wortart, sprachniveau, notizen,
             kategorie_id, ist_privat, besitzer_id, erstellt_von)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([
        trim($daten['englisch']),
        trim($daten['deutsch']),
        $daten['wortart'],
        $sprachniveau,
        !empty($daten['notizen']) ? trim($daten['notizen']) : null,
        $kategorie_id,
        $ist_privat ? 1 : 0,
        $besitzer_id,
        $benutzer_id,
    ]);

    $vokabel_id = (int) $pdo->lastInsertId();

    // Themenfeld zuordnen (optional)
    if ($themenfeld_id_neu > 0) {
        if ($als_admin) {
            $stmt_tf = $pdo->prepare('SELECT id FROM themenfelder WHERE id = ? AND aktiv = 1');
            $stmt_tf->execute([$themenfeld_id_neu]);
        } else {
            $stmt_tf = $pdo->prepare('SELECT id FROM themenfelder WHERE id = ? AND aktiv = 1 AND (ist_privat = 0 OR (ist_privat = 1 AND besitzer_id = ?))');
            $stmt_tf->execute([$themenfeld_id_neu, $benutzer_id]);
        }
        if ($stmt_tf->fetchColumn()) {
            $pdo->prepare('INSERT IGNORE INTO themenfeld_vokabeln (themenfeld_id, vokabel_id, reihenfolge) VALUES (?, ?, 0)')
                ->execute([$themenfeld_id_neu, $vokabel_id]);
        }
    }

    // Synonyme (optional)
    if (!empty($daten['synonyme']) && is_array($daten['synonyme'])) {
        $syn_stmt = $pdo->prepare("INSERT INTO synonyme (vokabel_id, synonym, sprache) VALUES (?, ?, ?)");
        foreach ($daten['synonyme'] as $syn) {
            if (empty($syn['synonym'])) continue;
            $sprache = $syn['sprache'] ?? 'en';
            if (!in_array($sprache, ['en', 'de'], true)) $sprache = 'en';
            $syn_stmt->execute([$vokabel_id, trim($syn['synonym']), $sprache]);
        }
    }

    $pdo->commit();

    $stmt = $pdo->prepare('SELECT v.*, b.benutzername AS besitzer_name FROM vokabeln v LEFT JOIN benutzer b ON b.id = v.besitzer_id WHERE v.id = ?');
    $stmt->execute([$vokabel_id]);
    $vokabel = $stmt->fetch();

    $vokabel['id']           = (int) $vokabel['id'];
    $vokabel['kategorie_id'] = $vokabel['kategorie_id'] !== null ? (int) $vokabel['kategorie_id'] : null;
    $vokabel['erstellt_von'] = $vokabel['erstellt_von'] !== null ? (int) $vokabel['erstellt_von'] : null;
    $vokabel['besitzer_id']  = $vokabel['besitzer_id']  !== null ? (int) $vokabel['besitzer_id']  : null;
    $vokabel['aktiv']        = (bool) $vokabel['aktiv'];
    $vokabel['ist_privat']   = (bool) $vokabel['ist_privat'];

    json_erfolg($vokabel, 'Vokabel erfolgreich erstellt.', 201);

} catch (PDOException $e) {
    $pdo->rollBack();
    if ($e->getCode() === '23000') {
        fehler_doppelter_eintrag('Diese Vokabel existiert bereits.');
    }
    error_log('Vokabel erstellen fehlgeschlagen: ' . $e->getMessage());
    fehler_server('Vokabel konnte nicht erstellt werden.');
}
