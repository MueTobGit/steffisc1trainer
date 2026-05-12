<?php
/**
 * API: Vokabeln — Erstellen
 *
 * POST /api/vokabeln/erstellen.php
 *
 * Neue Vokabel anlegen.
 * Admin: oeffentliche Vokabel (wie bisher).
 * Normaler User: private Vokabel (ist_privat=1, besitzer_id=User).
 *   Optional mit gruppen_id: fuer eigene Gruppe sichtbar.
 * Limit: max. 2000 private Vokabeln pro User.
 *
 * Body:
 *   - schwedisch (Pflicht)
 *   - deutsch (Pflicht)
 *   - wortart (Pflicht)
 *   - genus (Pflicht bei Nomen: en/ett)
 *   - verbgruppe (Pflicht bei Verb: 1/2a/2b/3/4)
 *   - sprachniveau (optional, Standard: A1)
 *   - notizen (optional)
 *   - kategorie_id (optional, nur Admin)
 *   - media_id (optional)
 *   - gruppen_id (optional, User: Gruppe in der man Mitglied ist)
 *   - formen (optional, Array von {form_bezeichnung, form_wert})
 *   - synonyme (optional, Array von {synonym, sprache})
 *   - lektion_id (optional, nur Non-Admin: eigene private Lektion der Vokabel zuordnen)
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
$benutzer    = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];
$als_admin   = ist_admin($benutzer);

// --- Body lesen ---
$daten = json_body_lesen();

// --- Validierung ---
pflichtfelder_pruefen($daten, ['schwedisch', 'deutsch', 'wortart']);
laenge_validieren($daten['schwedisch'], 'schwedisch', 1, 128);
laenge_validieren($daten['deutsch'], 'deutsch', 1, 256);
wortart_validieren($daten['wortart']);

// Wortart-spezifisch
$genus     = $daten['genus'] ?? null;
$verbgruppe = $daten['verbgruppe'] ?? null;

genus_validieren($genus, $daten['wortart']);
verbgruppe_validieren($verbgruppe, $daten['wortart']);

// Sprachniveau
$sprachniveau = $daten['sprachniveau'] ?? 'A1';
sprachniveau_validieren($sprachniveau);

$pdo = db_verbindung();

// --- Privat-Logik ---
$ist_privat  = !$als_admin; // User erstellt immer private Vokabeln
$besitzer_id = $als_admin ? null : $benutzer_id;

// Gruppen-ID: nur wenn User Mitglied ist
$gruppen_id_neu = null;
if (!empty($daten['gruppen_id'])) {
    $gid = (int) $daten['gruppen_id'];
    if ($gid > 0) {
        // Pruefen ob User Mitglied in dieser Gruppe ist
        $stmt = $pdo->prepare('SELECT id FROM gruppen_mitglieder WHERE gruppen_id = ? AND benutzer_id = ?');
        $stmt->execute([$gid, $benutzer_id]);
        if ($stmt->fetch()) {
            $gruppen_id_neu = $gid;
        } else {
            fehler_ungueltige_eingabe('Du bist kein Mitglied dieser Gruppe.');
        }
    }
}

// Kategorie pruefen (nur Admin darf zuweisen)
$kategorie_id = null;
if ($als_admin && !empty($daten['kategorie_id'])) {
    $kategorie_id = positive_ganzzahl_validieren($daten['kategorie_id'], 'kategorie_id');
    id_existiert($kategorie_id, 'kategorien', 'Kategorie');
}

// Media pruefen
$media_id = null;
if (!empty($daten['media_id'])) {
    $media_id = positive_ganzzahl_validieren($daten['media_id'], 'media_id');
    id_existiert($media_id, 'medien', 'Medium');
}

// --- Limit-Pruefung fuer normale User ---
if (!$als_admin) {
    $limit = max_private_vokabeln($pdo);
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM vokabeln WHERE besitzer_id = ? AND ist_privat = 1');
    $stmt->execute([$benutzer_id]);
    $anzahl = (int) $stmt->fetchColumn();
    if ($anzahl >= $limit) {
        fehler_ungueltige_eingabe(
            "Du hast das Limit von {$limit} privaten Vokabeln erreicht."
        );
    }
}

// --- Duplikat-Pruefung ---
// Oeffentliche Vokabeln: schwedisch + wortart muss unique sein
// Private Vokabeln: schwedisch + wortart + besitzer_id muss unique sein
if ($als_admin) {
    $stmt = $pdo->prepare(
        'SELECT id FROM vokabeln WHERE schwedisch = ? AND wortart = ? AND ist_privat = 0'
    );
    $stmt->execute([trim($daten['schwedisch']), $daten['wortart']]);
} else {
    $stmt = $pdo->prepare(
        'SELECT id FROM vokabeln WHERE schwedisch = ? AND wortart = ? AND besitzer_id = ? AND ist_privat = 1'
    );
    $stmt->execute([trim($daten['schwedisch']), $daten['wortart'], $benutzer_id]);
}
if ($stmt->fetchColumn()) {
    fehler_doppelter_eintrag(
        "Eine Vokabel '{$daten['schwedisch']}' mit Wortart '{$daten['wortart']}' existiert bereits."
    );
}

// --- Lektion-ID (nur Non-Admin) ---
$lektion_id_neu = 0;
if (!$als_admin && !empty($daten['lektion_id'])) {
    $lektion_id_neu = (int) $daten['lektion_id'];
}

// --- Transaktion starten ---
$pdo->beginTransaction();

try {
    // Vokabel erstellen
    $sql = "
        INSERT INTO vokabeln
            (schwedisch, deutsch, wortart, genus, verbgruppe, sprachniveau, notizen,
             kategorie_id, media_id, ist_privat, besitzer_id, gruppen_id, erstellt_von)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        trim($daten['schwedisch']),
        trim($daten['deutsch']),
        $daten['wortart'],
        $daten['wortart'] === 'Nomen' ? $genus : null,
        $daten['wortart'] === 'Verb'  ? $verbgruppe : null,
        $sprachniveau,
        !empty($daten['notizen']) ? trim($daten['notizen']) : null,
        $kategorie_id,
        $media_id,
        $ist_privat ? 1 : 0,
        $besitzer_id,
        $gruppen_id_neu,
        $benutzer_id,
    ]);

    $vokabel_id = (int) $pdo->lastInsertId();

    // --- Lektion zuordnen (Non-Admin, optional) ---
    if (!$als_admin && $lektion_id_neu > 0) {
        $stmt_lek = $pdo->prepare(
            'SELECT id FROM lektionen WHERE id = ? AND ist_privat = 1 AND besitzer_id = ? AND aktiv = 1'
        );
        $stmt_lek->execute([$lektion_id_neu, $benutzer_id]);
        if ($stmt_lek->fetchColumn()) {
            $pdo->prepare(
                'INSERT IGNORE INTO lektion_vokabeln (lektion_id, vokabel_id, reihenfolge) VALUES (?, ?, 0)'
            )->execute([$lektion_id_neu, $vokabel_id]);
        }
    }

    // --- Formen einfuegen (optional) ---
    if (!empty($daten['formen']) && is_array($daten['formen'])) {
        $erlaubte_formen = WORTART_FORMEN[$daten['wortart']] ?? [];

        $form_sql = "
            INSERT INTO vokabel_formen (vokabel_id, form_bezeichnung, form_wert, reihenfolge)
            VALUES (?, ?, ?, ?)
        ";
        $form_stmt = $pdo->prepare($form_sql);

        $reihenfolge = 0;
        foreach ($daten['formen'] as $form) {
            if (empty($form['form_bezeichnung']) || empty($form['form_wert'])) {
                continue;
            }

            form_bezeichnung_validieren($form['form_bezeichnung']);

            // Pruefen ob Form zu Wortart passt
            if (!empty($erlaubte_formen) && !in_array($form['form_bezeichnung'], $erlaubte_formen, true)) {
                continue; // Still ignorieren
            }

            $form_stmt->execute([
                $vokabel_id,
                $form['form_bezeichnung'],
                trim($form['form_wert']),
                $reihenfolge++,
            ]);
        }
    }

    // --- Synonyme einfuegen (optional) ---
    if (!empty($daten['synonyme']) && is_array($daten['synonyme'])) {
        $syn_sql  = "INSERT INTO synonyme (vokabel_id, synonym, sprache) VALUES (?, ?, ?)";
        $syn_stmt = $pdo->prepare($syn_sql);

        foreach ($daten['synonyme'] as $syn) {
            if (empty($syn['synonym'])) continue;

            $sprache = $syn['sprache'] ?? 'de';
            if (!in_array($sprache, ['sv', 'de'], true)) {
                $sprache = 'de';
            }

            $syn_stmt->execute([
                $vokabel_id,
                trim($syn['synonym']),
                $sprache,
            ]);
        }
    }

    $pdo->commit();

    // Erstellte Vokabel komplett laden
    $stmt = $pdo->prepare('SELECT v.*, b.benutzername AS besitzer_name FROM vokabeln v LEFT JOIN benutzer b ON b.id = v.besitzer_id WHERE v.id = ?');
    $stmt->execute([$vokabel_id]);
    $vokabel = $stmt->fetch();

    $vokabel['id']          = (int) $vokabel['id'];
    $vokabel['kategorie_id']= $vokabel['kategorie_id'] !== null ? (int) $vokabel['kategorie_id'] : null;
    $vokabel['media_id']    = $vokabel['media_id'] !== null ? (int) $vokabel['media_id'] : null;
    $vokabel['erstellt_von']= $vokabel['erstellt_von'] !== null ? (int) $vokabel['erstellt_von'] : null;
    $vokabel['besitzer_id'] = $vokabel['besitzer_id'] !== null ? (int) $vokabel['besitzer_id'] : null;
    $vokabel['gruppen_id']  = $vokabel['gruppen_id'] !== null ? (int) $vokabel['gruppen_id'] : null;
    $vokabel['aktiv']       = (bool) $vokabel['aktiv'];
    $vokabel['ist_privat']  = (bool) $vokabel['ist_privat'];

    json_erfolg($vokabel, 'Vokabel erfolgreich erstellt.', 201);

} catch (PDOException $e) {
    $pdo->rollBack();
    error_log('Vokabel erstellen fehlgeschlagen: ' . $e->getMessage());
    fehler_server('Vokabel konnte nicht erstellt werden.');
}
