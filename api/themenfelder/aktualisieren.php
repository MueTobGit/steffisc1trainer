<?php
/**
 * API: Lektionen — Aktualisieren
 *
 * PUT /api/lektionen/aktualisieren.php?id=X
 *
 * Lektion aktualisieren.
 * - Admin: alle Felder (titel, beschreibung, kategorie_id, reihenfolge, sprachniveau, aktiv)
 * - Besitzer (eigene private Lektion): titel, beschreibung, sprachniveau, aktiv
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

// --- Methode pruefen ---
methode_erzwingen('PUT');

// --- Authentifizierung ---
$benutzer    = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];
$ist_admin   = ist_admin($benutzer);

// --- ID ermitteln ---
$id = get_param_int('id');
if ($id < 1) {
    fehler_ungueltige_eingabe('Lektion-ID ist erforderlich.');
}

$pdo = db_verbindung();

// --- Lektion laden (fuer Berechtigungs-Check) ---
$stmt_lek = $pdo->prepare('SELECT id, ist_privat, besitzer_id FROM themenfelder WHERE id = ?');
$stmt_lek->execute([$id]);
$lektion = $stmt_lek->fetch();
if (!$lektion) {
    fehler_nicht_gefunden('Lektion nicht gefunden.');
}

// --- Autorisierung ---
if (!$ist_admin) {
    // Non-Admin darf nur eigene private Lektionen bearbeiten
    if (!(bool) $lektion['ist_privat'] || (int) $lektion['besitzer_id'] !== $benutzer_id) {
        fehler_verboten('Keine Berechtigung zum Bearbeiten dieser Lektion.');
    }
}

// --- Body lesen ---
$daten = json_body_lesen();

// --- Felder ---
$felder = [];
$params = [];

if (isset($daten['titel'])) {
    laenge_validieren($daten['titel'], 'titel', 1, 200);
    $felder[] = 'titel = ?';
    $params[] = trim($daten['titel']);
}

if (array_key_exists('beschreibung', $daten)) {
    $felder[] = 'beschreibung = ?';
    $params[] = !empty($daten['beschreibung']) ? trim($daten['beschreibung']) : null;
}

// Kategorie und Reihenfolge nur fuer Admin
if ($ist_admin) {
    if (array_key_exists('kategorie_id', $daten)) {
        $kategorie_id = null;
        if ($daten['kategorie_id'] !== null && $daten['kategorie_id'] !== '') {
            $kategorie_id = positive_ganzzahl_validieren($daten['kategorie_id'], 'kategorie_id');
            id_existiert($kategorie_id, 'kategorien', 'Kategorie');
        }
        $felder[] = 'kategorie_id = ?';
        $params[] = $kategorie_id;
    }

    if (isset($daten['reihenfolge'])) {
        $felder[] = 'reihenfolge = ?';
        $params[] = (int) $daten['reihenfolge'];
    }
}

if (isset($daten['sprachniveau'])) {
    sprachniveau_validieren($daten['sprachniveau']);
    $felder[] = 'sprachniveau = ?';
    $params[] = $daten['sprachniveau'];
}

if (isset($daten['aktiv'])) {
    $felder[] = 'aktiv = ?';
    $params[] = $daten['aktiv'] ? 1 : 0;
}

if (empty($felder)) {
    fehler_ungueltige_eingabe('Keine Felder zum Aktualisieren angegeben.');
}

// --- Update ---
$params[] = $id;
$sql = "UPDATE themenfelder SET " . implode(', ', $felder) . " WHERE id = ?";
$stmt = $pdo->prepare($sql);
$stmt->execute($params);

// Aktualisierte Lektion laden
$stmt = $pdo->prepare('SELECT * FROM themenfelder WHERE id = ?');
$stmt->execute([$id]);
$aktualisiert = $stmt->fetch();

$aktualisiert['id'] = (int) $aktualisiert['id'];
$aktualisiert['kategorie_id'] = $aktualisiert['kategorie_id'] !== null ? (int) $aktualisiert['kategorie_id'] : null;
$aktualisiert['reihenfolge'] = (int) $aktualisiert['reihenfolge'];
$aktualisiert['erstellt_von'] = $aktualisiert['erstellt_von'] !== null ? (int) $aktualisiert['erstellt_von'] : null;
$aktualisiert['aktiv'] = (bool) $aktualisiert['aktiv'];

json_erfolg($aktualisiert, 'Lektion erfolgreich aktualisiert.');
