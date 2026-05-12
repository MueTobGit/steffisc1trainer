<?php
/**
 * API: Saetze — Aktualisieren
 *
 * PUT /api/saetze/aktualisieren.php?id=X
 *
 * Satz aktualisieren (nur Admin).
 *
 * Body: Alle Felder optional.
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
    fehler_ungueltige_eingabe('Satz-ID ist erforderlich.');
}

// --- Satz laden ---
$satz = id_existiert($id, 'saetze', 'Satz');

// --- Body lesen ---
$daten = json_body_lesen();

$pdo = db_verbindung();

// --- Felder ---
$felder = [];
$params = [];

if (isset($daten['vokabel_id'])) {
    $vokabel_id = positive_ganzzahl_validieren($daten['vokabel_id'], 'vokabel_id');
    id_existiert($vokabel_id, 'vokabeln', 'Vokabel');
    $felder[] = 'vokabel_id = ?';
    $params[] = $vokabel_id;
}

if (isset($daten['englisch_satz'])) {
    $englisch_satz = trim($daten['englisch_satz']);
    if (!str_contains($englisch_satz, '___')) {
        fehler_ungueltige_eingabe(
            'Der englische Satz muss einen Platzhalter (___) fuer die Luecke enthalten.'
        );
    }
    $felder[] = 'englisch_satz = ?';
    $params[] = $englisch_satz;
}

if (isset($daten['deutsch_satz'])) {
    $felder[] = 'deutsch_satz = ?';
    $params[] = trim($daten['deutsch_satz']);
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
$sql = "UPDATE saetze SET " . implode(', ', $felder) . " WHERE id = ?";
$stmt = $pdo->prepare($sql);
$stmt->execute($params);

// Aktualisierten Satz laden
$stmt = $pdo->prepare('SELECT * FROM saetze WHERE id = ?');
$stmt->execute([$id]);
$aktualisiert = $stmt->fetch();

$aktualisiert['id'] = (int) $aktualisiert['id'];
$aktualisiert['vokabel_id'] = (int) $aktualisiert['vokabel_id'];
$aktualisiert['erstellt_von'] = $aktualisiert['erstellt_von'] !== null ? (int) $aktualisiert['erstellt_von'] : null;
$aktualisiert['aktiv'] = (bool) $aktualisiert['aktiv'];

json_erfolg($aktualisiert, 'Satz erfolgreich aktualisiert.');
