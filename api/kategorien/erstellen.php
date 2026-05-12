<?php
/**
 * API: Kategorien — Erstellen
 *
 * POST /api/kategorien/erstellen.php
 *
 * Neue Kategorie anlegen (nur Admin).
 * Oberkategorie (Lehrwerk): eltern_id = null
 * Unterkategorie (Kapitel): eltern_id = ID des Lehrwerks
 *
 * Body:
 *   - name (Pflicht)
 *   - beschreibung (optional)
 *   - eltern_id (optional, ID der Oberkategorie)
 *   - reihenfolge (optional, Standard: 0)
 *   - media_id (optional)
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

// --- Methode pruefen ---
methode_erzwingen('POST');

// --- Authentifizierung + Autorisierung ---
$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

// --- Body lesen ---
$daten = json_body_lesen();

// --- Validierung ---
pflichtfelder_pruefen($daten, ['name']);
laenge_validieren($daten['name'], 'name', 1, 100);

if (isset($daten['beschreibung']) && $daten['beschreibung'] !== '') {
    laenge_validieren($daten['beschreibung'], 'beschreibung', 1, 65535);
}

$pdo = db_verbindung();

// Eltern-Kategorie pruefen (falls angegeben)
$eltern_id = null;
if (!empty($daten['eltern_id'])) {
    $eltern_id = positive_ganzzahl_validieren($daten['eltern_id'], 'eltern_id');
    $eltern = id_existiert($eltern_id, 'kategorien', 'Eltern-Kategorie');

    if (!$eltern['aktiv']) {
        fehler_ungueltige_eingabe('Die Eltern-Kategorie ist deaktiviert.');
    }
}

$reihenfolge = isset($daten['reihenfolge']) ? (int) $daten['reihenfolge'] : 0;

// --- Erstellen ---
$stmt = $pdo->prepare("INSERT INTO kategorien (name, beschreibung, eltern_id, reihenfolge) VALUES (?, ?, ?, ?)");
$stmt->execute([
    trim($daten['name']),
    !empty($daten['beschreibung']) ? trim($daten['beschreibung']) : null,
    $eltern_id,
    $reihenfolge,
]);

$neue_id = (int) $pdo->lastInsertId();

// Erstellte Kategorie laden
$stmt = $pdo->prepare('SELECT * FROM kategorien WHERE id = ?');
$stmt->execute([$neue_id]);
$kategorie = $stmt->fetch();

$kategorie['id'] = (int) $kategorie['id'];
$kategorie['eltern_id'] = $kategorie['eltern_id'] !== null ? (int) $kategorie['eltern_id'] : null;
$kategorie['reihenfolge'] = (int) $kategorie['reihenfolge'];
$kategorie['aktiv'] = (bool) $kategorie['aktiv'];

json_erfolg($kategorie, 'Kategorie erfolgreich erstellt.', 201);
