<?php
/**
 * API: Vokabeln — Formen speichern
 *
 * POST /api/vokabeln/formen_speichern.php?id=X
 *
 * Ersetzt alle Formen einer Vokabel (DELETE + INSERT).
 * Validiert form_bezeichnung gegen Wortart.
 * Admin:         beliebige Vokabel.
 * Normaler User: nur eigene private Vokabeln.
 *
 * Body:
 *   - formen: Array von {form_bezeichnung, form_wert, media_id?}
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
$benutzer = benutzer_authentifizieren();

// --- ID ermitteln ---
$id = get_param_int('id');
if ($id < 1) {
    fehler_ungueltige_eingabe('Vokabel-ID ist erforderlich.');
}

// --- Vokabel laden ---
$vokabel = id_existiert($id, 'vokabeln', 'Vokabel');

// --- Berechtigung pruefen ---
sichtbarkeits_schreib_check($benutzer, $vokabel, 'Vokabel');

// --- Body lesen ---
$daten = json_body_lesen();

if (!isset($daten['formen']) || !is_array($daten['formen'])) {
    fehler_ungueltige_eingabe('Feld "formen" muss ein Array sein.');
}

$pdo = db_verbindung();

// Erlaubte Formen fuer diese Wortart
$erlaubte_formen = WORTART_FORMEN[$vokabel['wortart']] ?? [];

// Validierung aller Formen vorab
$validierte_formen = [];
$gesehene_bezeichnungen = [];

foreach ($daten['formen'] as $index => $form) {
    if (empty($form['form_bezeichnung']) || !isset($form['form_wert']) || trim($form['form_wert']) === '') {
        continue; // Leere Eintraege ueberspringen
    }

    $bezeichnung = $form['form_bezeichnung'];

    // Form-Bezeichnung validieren
    form_bezeichnung_validieren($bezeichnung);

    // Pruefen ob Form zur Wortart passt
    if (!empty($erlaubte_formen) && !in_array($bezeichnung, $erlaubte_formen, true)) {
        fehler_ungueltige_eingabe(
            "Form '{$bezeichnung}' passt nicht zur Wortart '{$vokabel['wortart']}'.",
            ['index' => $index, 'form_bezeichnung' => $bezeichnung]
        );
    }

    // Duplikat-Bezeichnung pruefen
    if (in_array($bezeichnung, $gesehene_bezeichnungen, true)) {
        fehler_ungueltige_eingabe(
            "Doppelte form_bezeichnung '{$bezeichnung}'.",
            ['index' => $index]
        );
    }
    $gesehene_bezeichnungen[] = $bezeichnung;

    $media_id = null;
    if (!empty($form['media_id'])) {
        $media_id = (int) $form['media_id'];
    }

    $validierte_formen[] = [
        'form_bezeichnung' => $bezeichnung,
        'form_wert' => trim($form['form_wert']),
        'media_id' => $media_id,
    ];
}

// --- Transaktion: Alte loeschen, neue einfuegen ---
$pdo->beginTransaction();

try {
    // Alle alten Formen entfernen
    $stmt = $pdo->prepare('DELETE FROM vokabel_formen WHERE vokabel_id = ?');
    $stmt->execute([$id]);

    // Neue Formen einfuegen
    if (!empty($validierte_formen)) {
        $sql = "
            INSERT INTO vokabel_formen (vokabel_id, form_bezeichnung, form_wert, reihenfolge, media_id)
            VALUES (?, ?, ?, ?, ?)
        ";
        $stmt = $pdo->prepare($sql);

        foreach ($validierte_formen as $reihenfolge => $form) {
            $stmt->execute([
                $id,
                $form['form_bezeichnung'],
                $form['form_wert'],
                $reihenfolge,
                $form['media_id'],
            ]);
        }
    }

    $pdo->commit();

    // Gespeicherte Formen laden
    $stmt = $pdo->prepare("
        SELECT id, form_bezeichnung, form_wert, reihenfolge, media_id
        FROM vokabel_formen
        WHERE vokabel_id = ?
        ORDER BY reihenfolge ASC
    ");
    $stmt->execute([$id]);
    $formen = $stmt->fetchAll();

    foreach ($formen as &$f) {
        $f['id'] = (int) $f['id'];
        $f['reihenfolge'] = (int) $f['reihenfolge'];
        $f['media_id'] = $f['media_id'] !== null ? (int) $f['media_id'] : null;
    }
    unset($f);

    json_erfolg($formen, count($formen) . ' Form(en) gespeichert.');

} catch (PDOException $e) {
    $pdo->rollBack();
    error_log('Formen speichern fehlgeschlagen: ' . $e->getMessage());
    fehler_server('Formen konnten nicht gespeichert werden.');
}
