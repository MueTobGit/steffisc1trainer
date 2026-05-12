<?php
/**
 * API: Lektionen — Erstellen
 *
 * POST /api/lektionen/erstellen.php
 *
 * Admin: oeffentliche Lektion (wie bisher, mit kategorie_id).
 * Normaler User: private Lektion (ist_privat=1, kategorie_id = eigene Benutzer-Kategorie).
 *   Optional mit gruppen_id: fuer eigene Gruppe sichtbar.
 *
 * Body:
 *   - titel (Pflicht)
 *   - beschreibung (optional)
 *   - kategorie_id (optional, nur Admin)
 *   - reihenfolge (optional, nur Admin)
 *   - sprachniveau (optional, Standard: A1)
 *   - gruppen_id (optional, User: Gruppe in der man Mitglied ist)
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
pflichtfelder_pruefen($daten, ['titel']);
laenge_validieren($daten['titel'], 'titel', 1, 200);

if (isset($daten['beschreibung']) && $daten['beschreibung'] !== '') {
    laenge_validieren($daten['beschreibung'], 'beschreibung', 1, 65535);
}

// Kategorie pruefen (nur Admin)
$kategorie_id = null;
if ($als_admin && !empty($daten['kategorie_id'])) {
    $kategorie_id = positive_ganzzahl_validieren($daten['kategorie_id'], 'kategorie_id');
    id_existiert($kategorie_id, 'kategorien', 'Kategorie');
}

// Sprachniveau
$sprachniveau = $daten['sprachniveau'] ?? 'A1';
sprachniveau_validieren($sprachniveau);

$reihenfolge = ($als_admin && isset($daten['reihenfolge'])) ? (int) $daten['reihenfolge'] : 0;

$pdo = db_verbindung();

// --- Privat-Logik ---
$ist_privat  = !$als_admin;
$besitzer_id = $als_admin ? null : $benutzer_id;

// Gruppen-ID: nur wenn User Mitglied ist
$gruppen_id_neu = null;
if (!$als_admin && !empty($daten['gruppen_id'])) {
    $gid = (int) $daten['gruppen_id'];
    if ($gid > 0) {
        $stmt = $pdo->prepare('SELECT id FROM gruppen_mitglieder WHERE gruppen_id = ? AND benutzer_id = ?');
        $stmt->execute([$gid, $benutzer_id]);
        if ($stmt->fetch()) {
            $gruppen_id_neu = $gid;
        } else {
            fehler_ungueltige_eingabe('Du bist kein Mitglied dieser Gruppe.');
        }
    }
}

// --- Kategorie fuer Non-Admin: nach Benutzernamen suchen oder erstellen ---
$kategorie_id_insert = $kategorie_id; // Admin: aus Request; Non-Admin: wird ueberschrieben
if (!$als_admin) {
    $benutzername = $benutzer['benutzername'];
    $stmt_kat = $pdo->prepare('SELECT id FROM kategorien WHERE name = ? LIMIT 1');
    $stmt_kat->execute([$benutzername]);
    $kat_id = $stmt_kat->fetchColumn();
    if ($kat_id === false) {
        // Kategorie fuer diesen User erstmalig anlegen
        $pdo->prepare('INSERT INTO kategorien (name, aktiv) VALUES (?, 1)')
            ->execute([$benutzername]);
        $kat_id = (int) $pdo->lastInsertId();
    }
    $kategorie_id_insert = (int) $kat_id;
}

// --- Erstellen ---
$sql = "
    INSERT INTO lektionen (titel, beschreibung, kategorie_id, reihenfolge, sprachniveau,
                           ist_privat, besitzer_id, gruppen_id, erstellt_von)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
";

$stmt = $pdo->prepare($sql);
$stmt->execute([
    trim($daten['titel']),
    !empty($daten['beschreibung']) ? trim($daten['beschreibung']) : null,
    $kategorie_id_insert,
    $reihenfolge,
    $sprachniveau,
    $ist_privat ? 1 : 0,
    $besitzer_id,
    $gruppen_id_neu,
    $benutzer_id,
]);

$neue_id = (int) $pdo->lastInsertId();

$stmt = $pdo->prepare('SELECT l.*, b.benutzername AS besitzer_name FROM lektionen l LEFT JOIN benutzer b ON b.id = l.besitzer_id WHERE l.id = ?');
$stmt->execute([$neue_id]);
$lektion = $stmt->fetch();

$lektion['id']           = (int) $lektion['id'];
$lektion['kategorie_id'] = $lektion['kategorie_id'] !== null ? (int) $lektion['kategorie_id'] : null;
$lektion['reihenfolge']  = (int) $lektion['reihenfolge'];
$lektion['erstellt_von'] = $lektion['erstellt_von'] !== null ? (int) $lektion['erstellt_von'] : null;
$lektion['aktiv']        = (bool) $lektion['aktiv'];
$lektion['ist_privat']   = (bool) $lektion['ist_privat'];
$lektion['besitzer_id']  = $lektion['besitzer_id'] !== null ? (int) $lektion['besitzer_id'] : null;
$lektion['gruppen_id']   = $lektion['gruppen_id'] !== null ? (int) $lektion['gruppen_id'] : null;

json_erfolg($lektion, 'Lektion erfolgreich erstellt.', 201);
