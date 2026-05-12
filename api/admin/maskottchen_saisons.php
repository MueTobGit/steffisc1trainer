<?php
/**
 * API: Admin — Maskottchen-Saisons
 *
 * GET    /api/admin/maskottchen_saisons.php         — Alle Saisons laden
 * POST   /api/admin/maskottchen_saisons.php         — Saison anlegen (kein id) oder aktualisieren (id in Body)
 * DELETE /api/admin/maskottchen_saisons.php?id=X    — Saison loeschen
 *
 * Nur fuer Admins.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

methode_erzwingen(['GET', 'POST', 'DELETE']);

$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

$pdo     = db_verbindung();
$methode = $_SERVER['REQUEST_METHOD'];

// Verfügbare Bilder dynamisch aus oeffentlich/bilder/ laden.
// Ausgeschlossen: favicon-Dateien.
// Wird sowohl für GET (Rückgabe) als auch POST (Validierung) genutzt.
function _bilder_laden(): array
{
    $pfad    = dirname(__DIR__, 2) . '/oeffentlich/bilder/';
    $dateien = glob($pfad . '*.png') ?: [];
    $liste   = [];
    foreach ($dateien as $datei) {
        $name = basename($datei);
        if (str_starts_with($name, 'favicon')) continue;
        $liste[] = $name;
    }
    sort($liste);
    // Sicherheits-Fallback falls Verzeichnis nicht lesbar
    return $liste ?: ['maskottchen_standard.png', 'maskottchen_midsommar.png', 'maskottchen_nordlicht.png'];
}

if ($methode === 'GET') {

    $stmt = $pdo->query("
        SELECT id, name, von_monat, von_tag, bis_monat, bis_tag, bild, bild_dunkel, aktiv, reihenfolge
        FROM maskottchen_saisons
        ORDER BY reihenfolge ASC, id ASC
    ");
    $saisons = $stmt->fetchAll();

    foreach ($saisons as &$s) {
        $s['id']          = (int)  $s['id'];
        $s['von_monat']   = (int)  $s['von_monat'];
        $s['von_tag']     = (int)  $s['von_tag'];
        $s['bis_monat']   = (int)  $s['bis_monat'];
        $s['bis_tag']     = (int)  $s['bis_tag'];
        $s['aktiv']       = (bool) $s['aktiv'];
        $s['reihenfolge'] = (int)  $s['reihenfolge'];
    }
    unset($s);

    json_erfolg([
        'saisons'            => $saisons,
        'verfuegbare_bilder' => _bilder_laden(),
    ]);

} elseif ($methode === 'POST') {

    $daten = json_body_lesen();

    $id          = isset($daten['id']) ? (int) $daten['id'] : 0;
    $name        = trim($daten['name']        ?? '');
    $von_monat   = (int) ($daten['von_monat'] ?? 0);
    $von_tag     = (int) ($daten['von_tag']   ?? 0);
    $bis_monat   = (int) ($daten['bis_monat'] ?? 0);
    $bis_tag     = (int) ($daten['bis_tag']   ?? 0);
    $bild        = trim($daten['bild']        ?? 'maskottchen_standard.png');
    $bild_dunkel = trim($daten['bild_dunkel'] ?? '');
    $aktiv       = isset($daten['aktiv'])      ? (bool) $daten['aktiv'] : true;
    $reihenfolge = (int) ($daten['reihenfolge'] ?? 0);

    // Validierung
    if ($name === '') {
        fehler_ungueltige_eingabe('Name ist erforderlich.');
    }
    laenge_validieren($name, 'name', 1, 64);

    if ($von_monat < 1 || $von_monat > 12) {
        fehler_ungueltige_eingabe('von_monat muss zwischen 1 und 12 liegen.');
    }
    if ($von_tag < 1 || $von_tag > 31) {
        fehler_ungueltige_eingabe('von_tag muss zwischen 1 und 31 liegen.');
    }
    if ($bis_monat < 1 || $bis_monat > 12) {
        fehler_ungueltige_eingabe('bis_monat muss zwischen 1 und 12 liegen.');
    }
    if ($bis_tag < 1 || $bis_tag > 31) {
        fehler_ungueltige_eingabe('bis_tag muss zwischen 1 und 31 liegen.');
    }
    $verfuegbare = _bilder_laden();
    if (!in_array($bild, $verfuegbare, true)) {
        fehler_ungueltige_eingabe('Ungueltiger Bild-Dateiname.');
    }
    if ($bild_dunkel !== '' && !in_array($bild_dunkel, $verfuegbare, true)) {
        fehler_ungueltige_eingabe('Ungueltiger Dark-Mode-Bild-Dateiname.');
    }

    if ($id > 0) {
        // Update
        $stmt = $pdo->prepare("
            SELECT id FROM maskottchen_saisons WHERE id = ?
        ");
        $stmt->execute([$id]);
        if (!$stmt->fetchColumn()) {
            fehler_nicht_gefunden("Saison mit ID {$id} nicht gefunden.");
        }

        $pdo->prepare("
            UPDATE maskottchen_saisons
            SET name = ?, von_monat = ?, von_tag = ?, bis_monat = ?, bis_tag = ?,
                bild = ?, bild_dunkel = ?, aktiv = ?, reihenfolge = ?
            WHERE id = ?
        ")->execute([$name, $von_monat, $von_tag, $bis_monat, $bis_tag,
                     $bild, $bild_dunkel, $aktiv ? 1 : 0, $reihenfolge, $id]);

        json_erfolg(['id' => $id], 'Saison aktualisiert.');

    } else {
        // Insert
        $pdo->prepare("
            INSERT INTO maskottchen_saisons
                (name, von_monat, von_tag, bis_monat, bis_tag, bild, bild_dunkel, aktiv, reihenfolge)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ")->execute([$name, $von_monat, $von_tag, $bis_monat, $bis_tag,
                     $bild, $bild_dunkel, $aktiv ? 1 : 0, $reihenfolge]);

        $neue_id = (int) $pdo->lastInsertId();
        json_erfolg(['id' => $neue_id], 'Saison angelegt.');
    }

} else {
    // DELETE
    $id = get_param_int('id');
    if ($id < 1) {
        fehler_ungueltige_eingabe('ID ist erforderlich.');
    }

    $stmt = $pdo->prepare("SELECT id FROM maskottchen_saisons WHERE id = ?");
    $stmt->execute([$id]);
    if (!$stmt->fetchColumn()) {
        fehler_nicht_gefunden("Saison mit ID {$id} nicht gefunden.");
    }

    $pdo->prepare("DELETE FROM maskottchen_saisons WHERE id = ?")->execute([$id]);
    json_erfolg(['id' => $id], 'Saison gelöscht.');
}
