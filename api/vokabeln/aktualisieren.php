<?php
/**
 * API: Vokabeln — Aktualisieren
 *
 * PUT /api/vokabeln/aktualisieren.php?id=X
 *
 * Vokabel aktualisieren.
 * Admin:          beliebige Vokabel, alle Felder inkl. aktiv/kategorie_id.
 * Normaler User:  nur eigene private Vokabeln; aktiv/kategorie_id werden ignoriert.
 * UNIQUE-Check bei schwedisch/wortart-Aenderung.
 *
 * Body: Gleiche Felder wie erstellen, alle optional.
 *   Zusaetzlich fuer Non-Admin: lektion_id (eigene private Lektion zuordnen, 0 = keine)
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';
require_once dirname(__DIR__) . '/_middleware/sichtbarkeit.php';

// --- Methode pruefen ---
methode_erzwingen('PUT');

// --- Authentifizierung ---
$benutzer    = benutzer_authentifizieren();
$als_admin   = ist_admin($benutzer);
$benutzer_id = (int) $benutzer['id'];

// --- ID ermitteln ---
$id = get_param_int('id');
if ($id < 1) {
    fehler_ungueltige_eingabe('Vokabel-ID ist erforderlich.');
}

// --- Vokabel laden ---
$vokabel = id_existiert($id, 'vokabeln', 'Vokabel');

// --- Berechtigung pruefen ---
// Admin darf alles; normaler User nur eigene private Vokabeln.
sichtbarkeits_schreib_check($benutzer, $vokabel, 'Vokabel');

// --- Body lesen ---
$daten = json_body_lesen();

$pdo = db_verbindung();

// --- Felder aktualisieren ---
$felder = [];
$params = [];

// Schwedisch
$neues_schwedisch = $vokabel['schwedisch'];
if (isset($daten['schwedisch'])) {
    laenge_validieren($daten['schwedisch'], 'schwedisch', 1, 128);
    $neues_schwedisch = trim($daten['schwedisch']);
    $felder[] = 'schwedisch = ?';
    $params[] = $neues_schwedisch;
}

// Deutsch
if (isset($daten['deutsch'])) {
    laenge_validieren($daten['deutsch'], 'deutsch', 1, 256);
    $felder[] = 'deutsch = ?';
    $params[] = trim($daten['deutsch']);
}

// Wortart
$neue_wortart = $vokabel['wortart'];
if (isset($daten['wortart'])) {
    wortart_validieren($daten['wortart']);
    $neue_wortart = $daten['wortart'];
    $felder[] = 'wortart = ?';
    $params[] = $neue_wortart;
}

// Bei Aenderung von schwedisch oder wortart: UNIQUE pruefen
if ($neues_schwedisch !== $vokabel['schwedisch'] || $neue_wortart !== $vokabel['wortart']) {
    if ($als_admin) {
        // Admin: pruefen gegen oeffentliche aktive Vokabeln
        $stmt = $pdo->prepare('SELECT id FROM vokabeln WHERE schwedisch = ? AND wortart = ? AND id != ? AND aktiv = 1 AND ist_privat = 0');
        $stmt->execute([$neues_schwedisch, $neue_wortart, $id]);
    } else {
        // Non-Admin: pruefen gegen eigene private Vokabeln
        $stmt = $pdo->prepare('SELECT id FROM vokabeln WHERE schwedisch = ? AND wortart = ? AND id != ? AND ist_privat = 1 AND besitzer_id = ?');
        $stmt->execute([$neues_schwedisch, $neue_wortart, $id, $benutzer_id]);
    }
    if ($stmt->fetchColumn()) {
        fehler_doppelter_eintrag(
            "Eine Vokabel '{$neues_schwedisch}' mit Wortart '{$neue_wortart}' existiert bereits."
        );
    }
}

// Genus
if (array_key_exists('genus', $daten)) {
    $genus = $daten['genus'];
    genus_validieren($genus, $neue_wortart);
    $felder[] = 'genus = ?';
    $params[] = $neue_wortart === 'Nomen' ? $genus : null;
}

// Verbgruppe
if (array_key_exists('verbgruppe', $daten)) {
    $verbgruppe = $daten['verbgruppe'];
    verbgruppe_validieren($verbgruppe, $neue_wortart);
    $felder[] = 'verbgruppe = ?';
    $params[] = $neue_wortart === 'Verb' ? $verbgruppe : null;
}

// Sprachniveau
if (isset($daten['sprachniveau'])) {
    sprachniveau_validieren($daten['sprachniveau']);
    $felder[] = 'sprachniveau = ?';
    $params[] = $daten['sprachniveau'];
}

// Notizen
if (array_key_exists('notizen', $daten)) {
    $felder[] = 'notizen = ?';
    $params[] = !empty($daten['notizen']) ? trim($daten['notizen']) : null;
}

// Kategorie (nur Admin)
if ($als_admin && array_key_exists('kategorie_id', $daten)) {
    $kategorie_id = null;
    if ($daten['kategorie_id'] !== null && $daten['kategorie_id'] !== '') {
        $kategorie_id = positive_ganzzahl_validieren($daten['kategorie_id'], 'kategorie_id');
        id_existiert($kategorie_id, 'kategorien', 'Kategorie');
    }
    $felder[] = 'kategorie_id = ?';
    $params[] = $kategorie_id;
}

// Media
if (array_key_exists('media_id', $daten)) {
    $media_id = null;
    if ($daten['media_id'] !== null && $daten['media_id'] !== '') {
        $media_id = positive_ganzzahl_validieren($daten['media_id'], 'media_id');
        id_existiert($media_id, 'medien', 'Medium');
    }
    $felder[] = 'media_id = ?';
    $params[] = $media_id;
}

// Aktiv (nur Admin)
if ($als_admin && isset($daten['aktiv'])) {
    $felder[] = 'aktiv = ?';
    $params[] = $daten['aktiv'] ? 1 : 0;
}

// Nichts zu aktualisieren (lektion_id wird separat behandelt)?
// Fuer Non-Admins mit nur lektion_id-Aenderung kann $felder leer sein — das ist ok.
if (empty($felder) && !(!$als_admin && array_key_exists('lektion_id', $daten))) {
    fehler_ungueltige_eingabe('Keine Felder zum Aktualisieren angegeben.');
}

// --- Update ausfuehren ---
if (!empty($felder)) {
    $params[] = $id;
    $sql = "UPDATE vokabeln SET " . implode(', ', $felder) . " WHERE id = ?";

    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') {
            fehler_doppelter_eintrag('Diese Vokabel (schwedisch + wortart) existiert bereits.');
        }
        error_log('Vokabel aktualisieren fehlgeschlagen: ' . $e->getMessage());
        fehler_server('Vokabel konnte nicht aktualisiert werden.');
    }
}

// --- Lektion-Zuordnung (nur Non-Admin) ---
if (!$als_admin && array_key_exists('lektion_id', $daten)) {
    $pdo_lekt = db_verbindung();
    $lektion_id_neu = (int) $daten['lektion_id'];

    // Vokabel aus allen eigenen privaten Lektionen entfernen
    $pdo_lekt->prepare(
        'DELETE lv FROM lektion_vokabeln lv
         JOIN lektionen l ON l.id = lv.lektion_id
         WHERE lv.vokabel_id = ? AND l.besitzer_id = ? AND l.ist_privat = 1'
    )->execute([$id, $benutzer_id]);

    // Neue Zuordnung einfuegen (falls lektion_id > 0)
    if ($lektion_id_neu > 0) {
        $stmt_lek = $pdo_lekt->prepare(
            'SELECT id FROM lektionen WHERE id = ? AND ist_privat = 1 AND besitzer_id = ? AND aktiv = 1'
        );
        $stmt_lek->execute([$lektion_id_neu, $benutzer_id]);
        if ($stmt_lek->fetchColumn()) {
            $pdo_lekt->prepare(
                'INSERT IGNORE INTO lektion_vokabeln (lektion_id, vokabel_id, reihenfolge) VALUES (?, ?, 0)'
            )->execute([$lektion_id_neu, $id]);
        }
    }
}

// Aktualisierte Vokabel laden
$stmt = $pdo->prepare('SELECT * FROM vokabeln WHERE id = ?');
$stmt->execute([$id]);
$aktualisiert = $stmt->fetch();

$aktualisiert['id'] = (int) $aktualisiert['id'];
$aktualisiert['kategorie_id'] = $aktualisiert['kategorie_id'] !== null ? (int) $aktualisiert['kategorie_id'] : null;
$aktualisiert['media_id'] = $aktualisiert['media_id'] !== null ? (int) $aktualisiert['media_id'] : null;
$aktualisiert['erstellt_von'] = $aktualisiert['erstellt_von'] !== null ? (int) $aktualisiert['erstellt_von'] : null;
$aktualisiert['aktiv'] = (bool) $aktualisiert['aktiv'];

json_erfolg($aktualisiert, 'Vokabel erfolgreich aktualisiert.');
