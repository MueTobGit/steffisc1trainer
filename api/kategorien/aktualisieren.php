<?php
/**
 * API: Kategorien — Aktualisieren
 *
 * PUT /api/kategorien/aktualisieren.php?id=X
 *
 * Kategorie aktualisieren (nur Admin).
 * Zirkulaer-Referenz-Schutz bei eltern_id-Aenderung.
 *
 * Body:
 *   - name (optional)
 *   - beschreibung (optional)
 *   - eltern_id (optional, null = Oberkategorie)
 *   - reihenfolge (optional)
 *   - media_id (optional)
 *   - aktiv (optional)
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

// --- Methode pruefen ---
methode_erzwingen('PUT');

// --- Authentifizierung + Autorisierung ---
$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

// --- ID ermitteln ---
$id = get_param_int('id');
if ($id < 1) {
    fehler_ungueltige_eingabe('Kategorie-ID ist erforderlich.');
}

// --- Kategorie laden ---
$kategorie = id_existiert($id, 'kategorien', 'Kategorie');

// --- Body lesen ---
$daten = json_body_lesen();

$pdo = db_verbindung();

// --- Felder aktualisieren ---
$felder = [];
$params = [];

// Name
if (isset($daten['name'])) {
    laenge_validieren($daten['name'], 'name', 1, 100);
    $felder[] = 'name = ?';
    $params[] = trim($daten['name']);
}

// Beschreibung
if (array_key_exists('beschreibung', $daten)) {
    if ($daten['beschreibung'] !== null && $daten['beschreibung'] !== '') {
        laenge_validieren($daten['beschreibung'], 'beschreibung', 1, 65535);
    }
    $felder[] = 'beschreibung = ?';
    $params[] = !empty($daten['beschreibung']) ? trim($daten['beschreibung']) : null;
}

// Eltern-ID (mit Zirkulaer-Referenz-Schutz)
if (array_key_exists('eltern_id', $daten)) {
    $neues_eltern_id = null;

    if ($daten['eltern_id'] !== null && $daten['eltern_id'] !== '') {
        $neues_eltern_id = positive_ganzzahl_validieren($daten['eltern_id'], 'eltern_id');

        // Nicht auf sich selbst verweisen
        if ($neues_eltern_id === $id) {
            fehler_ungueltige_eingabe('Eine Kategorie kann nicht ihr eigenes Elternteil sein.');
        }

        // Eltern-Kategorie muss existieren
        $eltern = id_existiert($neues_eltern_id, 'kategorien', 'Eltern-Kategorie');

        // Zirkulaer-Referenz pruefen: Neues Elternteil darf kein Kind sein
        if (_ist_nachkomme($pdo, $neues_eltern_id, $id)) {
            fehler_ungueltige_eingabe(
                'Zirkulaere Referenz: Die gewaehlte Eltern-Kategorie ist bereits eine Unterkategorie.'
            );
        }
    }

    $felder[] = 'eltern_id = ?';
    $params[] = $neues_eltern_id;
}

// Reihenfolge
if (isset($daten['reihenfolge'])) {
    $felder[] = 'reihenfolge = ?';
    $params[] = (int) $daten['reihenfolge'];
}

// Aktiv
if (isset($daten['aktiv'])) {
    $felder[] = 'aktiv = ?';
    $params[] = $daten['aktiv'] ? 1 : 0;
}

// Nichts zu aktualisieren?
if (empty($felder)) {
    fehler_ungueltige_eingabe('Keine Felder zum Aktualisieren angegeben.');
}

// --- Update ausfuehren ---
$params[] = $id;
$sql = "UPDATE kategorien SET " . implode(', ', $felder) . " WHERE id = ?";
$stmt = $pdo->prepare($sql);
$stmt->execute($params);

// Aktualisierte Kategorie laden
$stmt = $pdo->prepare('SELECT * FROM kategorien WHERE id = ?');
$stmt->execute([$id]);
$aktualisiert = $stmt->fetch();

$aktualisiert['id'] = (int) $aktualisiert['id'];
$aktualisiert['eltern_id'] = $aktualisiert['eltern_id'] !== null ? (int) $aktualisiert['eltern_id'] : null;
$aktualisiert['reihenfolge'] = (int) $aktualisiert['reihenfolge'];
$aktualisiert['aktiv'] = (bool) $aktualisiert['aktiv'];

json_erfolg($aktualisiert, 'Kategorie erfolgreich aktualisiert.');

/**
 * Pruefen ob eine Kategorie ein Nachkomme einer anderen ist
 *
 * @param PDO $pdo
 * @param int $kandidat_id Die zu pruefende Kategorie
 * @param int $vorfahr_id Die potenzielle Ober-Kategorie
 * @return bool True wenn kandidat ein Nachkomme von vorfahr ist
 */
function _ist_nachkomme(PDO $pdo, int $kandidat_id, int $vorfahr_id): bool
{
    // Iterativ nach oben klettern
    $aktuell = $kandidat_id;
    $besucht = [];

    while ($aktuell !== null) {
        if ($aktuell === $vorfahr_id) {
            return true;
        }

        // Endlosschleifen-Schutz
        if (in_array($aktuell, $besucht, true)) {
            return false;
        }
        $besucht[] = $aktuell;

        $stmt = $pdo->prepare('SELECT eltern_id FROM kategorien WHERE id = ?');
        $stmt->execute([$aktuell]);
        $ergebnis = $stmt->fetchColumn();

        $aktuell = $ergebnis !== false && $ergebnis !== null ? (int) $ergebnis : null;
    }

    return false;
}
