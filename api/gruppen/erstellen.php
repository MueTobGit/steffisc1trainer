<?php
/**
 * API: Gruppen — Erstellen
 *
 * POST /api/gruppen/erstellen.php
 *
 * Neue Gruppe anlegen. Ersteller wird automatisch Admin-Mitglied.
 * Prueft Gruppen-Limit pro User (aus app_konfiguration: max_gruppen_pro_user).
 *
 * Body:
 *   - name (Pflicht, 3-128 Zeichen)
 *   - beschreibung (optional)
 *   - max_mitglieder (optional, 2-konfig_max, Standard: konfig_max)
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';
require_once dirname(__DIR__) . '/_middleware/sichtbarkeit.php';

// --- Methode pruefen ---
methode_erzwingen('POST');

// --- Authentifizierung ---
$benutzer    = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];

// --- Body lesen ---
$daten = json_body_lesen();

// --- Validierung ---
pflichtfelder_pruefen($daten, ['name']);
laenge_validieren(trim($daten['name']), 'name', 3, 128);

if (isset($daten['beschreibung']) && $daten['beschreibung'] !== '') {
    laenge_validieren($daten['beschreibung'], 'beschreibung', 1, 65535);
}

$pdo = db_verbindung();

// --- Gruppen-Limit pruefen ---
gruppen_limit_pruefen($pdo, $benutzer_id);

$konfig_max = max_mitglieder_pro_gruppe($pdo);
$max_mitglieder = $konfig_max;
if (isset($daten['max_mitglieder'])) {
    $max_mitglieder = (int) $daten['max_mitglieder'];
    if ($max_mitglieder < 2 || $max_mitglieder > $konfig_max) {
        fehler_ungueltige_eingabe("max_mitglieder muss zwischen 2 und {$konfig_max} liegen.");
    }
}

// --- Transaction: Gruppe + Mitgliedschaft ---
$pdo->beginTransaction();

try {
    $stmt = $pdo->prepare("
        INSERT INTO gruppen (name, beschreibung, max_mitglieder, erstellt_von)
        VALUES (?, ?, ?, ?)
    ");
    $stmt->execute([
        trim($daten['name']),
        !empty($daten['beschreibung']) ? trim($daten['beschreibung']) : null,
        $max_mitglieder,
        $benutzer_id,
    ]);

    $gruppen_id = (int) $pdo->lastInsertId();

    // Ersteller als Admin hinzufuegen
    $stmt = $pdo->prepare("
        INSERT INTO gruppen_mitglieder (gruppen_id, benutzer_id, rolle)
        VALUES (?, ?, 'admin')
    ");
    $stmt->execute([$gruppen_id, $benutzer_id]);

    $pdo->commit();
} catch (\Throwable $e) {
    $pdo->rollBack();
    fehler_server('Gruppe konnte nicht erstellt werden: ' . $e->getMessage());
}

// Erstellte Gruppe laden
$stmt = $pdo->prepare("SELECT * FROM gruppen WHERE id = ?");
$stmt->execute([$gruppen_id]);
$gruppe = $stmt->fetch();

$gruppe['id']             = (int) $gruppe['id'];
$gruppe['max_mitglieder'] = (int) $gruppe['max_mitglieder'];
$gruppe['erstellt_von']   = $gruppe['erstellt_von'] !== null ? (int) $gruppe['erstellt_von'] : null;
$gruppe['aktiv']          = (bool) $gruppe['aktiv'];

json_erfolg($gruppe, 'Gruppe erfolgreich erstellt.', 201);
