<?php
/**
 * API: Admin — Level-Konfiguration
 *
 * GET  /api/admin/level_konfiguration.php          — Alle 5 Level laden
 * POST /api/admin/level_konfiguration.php          — Einzelnes Level aktualisieren
 *      Body: { level, name?, schwelle?, formen?, sprachniveaus? }
 *
 * Nur fuer Admins.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';
require_once dirname(__DIR__, 2) . '/konfiguration/lern_algorithmus.php';

methode_erzwingen(['GET', 'POST']);

$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

$pdo     = db_verbindung();
$methode = $_SERVER['REQUEST_METHOD'];

// --- Alle moeglichen Formbezeichnungen (fuer Validierung) ---
const ALLE_FORMEN = [
    'unbestimmt_singular', 'bestimmt_singular', 'unbestimmt_plural', 'bestimmt_plural',
    'infinitiv', 'praesens', 'praeteritum', 'supinum', 'imperativ', 'perfekt_partizip',
    'grundform', 'komparativ', 'superlativ', 'bestimmte_form', 'neutrum_form',
];

const ALLE_SPRACHNIVEAUS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

// ============================================================
// GET — Alle Level laden
// ============================================================

if ($methode === 'GET') {
    $lk = level_konfiguration_laden($pdo);

    // Als geordnetes Array ausgeben
    $ergebnis = [];
    for ($l = 1; $l <= 5; $l++) {
        $ergebnis[] = [
            'level'         => $l,
            'name'          => $lk[$l]['name']          ?? '',
            'schwelle'      => $lk[$l]['schwelle']      ?? 0,
            'formen'        => $lk[$l]['formen']        ?? [],
            'sprachniveaus' => $lk[$l]['sprachniveaus'] ?? [],
        ];
    }

    json_erfolg($ergebnis);
}

// ============================================================
// POST — Level aktualisieren
// ============================================================

$daten = json_body_lesen();
pflichtfelder_pruefen($daten, ['level']);

$level_nr = (int) $daten['level'];
if ($level_nr < 1 || $level_nr > 5) {
    fehler_ungueltige_eingabe('Level muss zwischen 1 und 5 liegen.');
}

// Pruefen ob Zeile existiert
$stmt = $pdo->prepare("SELECT level FROM level_konfiguration WHERE level = ?");
$stmt->execute([$level_nr]);
if (!$stmt->fetch()) {
    fehler_nicht_gefunden("Level {$level_nr} nicht in der Datenbank. Bitte migration_level_konfiguration.sql ausfuehren.");
}

// --- Felder einzeln aktualisieren ---
$updates = [];
$params  = [];

if (isset($daten['name'])) {
    $name = trim($daten['name']);
    laenge_validieren($name, 'name', 1, 64);
    $updates[] = 'name = ?';
    $params[]  = $name;
}

if (isset($daten['schwelle'])) {
    $schwelle = (int) $daten['schwelle'];
    if ($schwelle < 0) {
        fehler_ungueltige_eingabe('Schwelle muss >= 0 sein.');
    }
    $updates[] = 'schwelle = ?';
    $params[]  = $schwelle;
}

if (isset($daten['formen'])) {
    if (!is_array($daten['formen'])) {
        fehler_ungueltige_eingabe('formen muss ein Array sein.');
    }
    $ungueltige = array_diff($daten['formen'], ALLE_FORMEN);
    if (!empty($ungueltige)) {
        fehler_ungueltige_eingabe('Unbekannte Formbezeichnungen: ' . implode(', ', $ungueltige));
    }
    $updates[] = 'formen = ?';
    $params[]  = json_encode(array_values($daten['formen']), JSON_UNESCAPED_UNICODE);
}

if (isset($daten['sprachniveaus'])) {
    if (!is_array($daten['sprachniveaus'])) {
        fehler_ungueltige_eingabe('sprachniveaus muss ein Array sein.');
    }
    $ungueltige = array_diff($daten['sprachniveaus'], ALLE_SPRACHNIVEAUS);
    if (!empty($ungueltige)) {
        fehler_ungueltige_eingabe('Unbekannte Sprachniveaus: ' . implode(', ', $ungueltige));
    }
    $updates[] = 'sprachniveaus = ?';
    $params[]  = json_encode(array_values($daten['sprachniveaus']), JSON_UNESCAPED_UNICODE);
}

if (empty($updates)) {
    fehler_ungueltige_eingabe('Kein gueltiges Feld zum Aktualisieren angegeben (name, schwelle, formen, sprachniveaus).');
}

$params[] = $level_nr;
$sql = 'UPDATE level_konfiguration SET ' . implode(', ', $updates) . ' WHERE level = ?';
$pdo->prepare($sql)->execute($params);

// Aktivitaet loggen
$stmt = $pdo->prepare("
    INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung, details_json)
    VALUES (?, 'admin_aktion', ?, ?)
");
$details = json_encode([
    'level'   => $level_nr,
    'felder'  => array_keys(array_filter([
        'name'          => isset($daten['name']),
        'schwelle'      => isset($daten['schwelle']),
        'formen'        => isset($daten['formen']),
        'sprachniveaus' => isset($daten['sprachniveaus']),
    ])),
], JSON_UNESCAPED_UNICODE);
$stmt->execute([$benutzer['id'], "Level-Konfiguration geaendert: Level {$level_nr}", $details]);

json_erfolg(null, "Level {$level_nr} aktualisiert.");
