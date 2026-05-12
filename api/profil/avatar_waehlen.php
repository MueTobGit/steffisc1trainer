<?php
/**
 * API: Profil — Avatar wählen (Preset)
 *
 * POST /api/profil/avatar_waehlen.php
 * Body JSON: { "dateiname": "bjorn.png" }
 *
 * Setzt den Avatar des Nutzers auf ein vordefiniertes System-Avatar.
 * Es wird ein Medien-Eintrag angelegt; alte hochgeladene Avatare werden
 * dabei vom Dateisystem entfernt, Preset-Einträge nur aus der DB.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

methode_erzwingen('POST');

$benutzer    = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];

// Erlaubte Preset-Dateinamen (exakte Whitelist)
const ERLAUBTE_AVATARE = [
    'astrid.png', 'bjorn.png', 'fredrica.png', 'freya.png',
    'gunnar.png', 'hilda.png', 'ivar.png',     'leif.png',
    'ragnar.png', 'sigrid.png',
];

$body      = json_body_lesen();
$dateiname = trim((string) ($body['dateiname'] ?? ''));

if (!in_array($dateiname, ERLAUBTE_AVATARE, true)) {
    fehler_ungueltige_eingabe('Ungültiger Avatar-Name.');
}

$relativer_pfad = 'bilder/avatare/' . $dateiname;
$pdo            = db_verbindung();

// Altes Avatar bereinigen
$alt_media_id = (int) ($benutzer['media_id'] ?? 0);
if ($alt_media_id > 0) {
    $alt_stmt = $pdo->prepare("SELECT dateipfad FROM medien WHERE id = ?");
    $alt_stmt->execute([$alt_media_id]);
    $alt_pfad = (string) ($alt_stmt->fetchColumn() ?: '');

    // Physische Datei nur löschen, wenn es ein hochgeladener Avatar war
    if (str_starts_with($alt_pfad, 'uploads/avatare/')) {
        $abs = UPLOAD_PFAD . '/' . ltrim(str_replace('uploads/', '', $alt_pfad), '/');
        if (file_exists($abs)) {
            @unlink($abs);
        }
    }

    $pdo->prepare("DELETE FROM medien WHERE id = ?")->execute([$alt_media_id]);
}

// Neuen Medien-Eintrag für Preset anlegen
$ins = $pdo->prepare("
    INSERT INTO medien (typ, dateipfad, alt_text, dateigroesse, erstellt_von)
    VALUES ('bild', ?, ?, 0, ?)
");
$ins->execute([$relativer_pfad, 'Avatar ' . pathinfo($dateiname, PATHINFO_FILENAME), $benutzer_id]);
$neue_media_id = (int) $pdo->lastInsertId();

// Benutzer aktualisieren
$pdo->prepare("UPDATE benutzer SET media_id = ? WHERE id = ?")
    ->execute([$neue_media_id, $benutzer_id]);

$avatar_url = OEFFENTLICH_URL . '/' . $relativer_pfad;

json_erfolg([
    'avatar_url' => $avatar_url,
    'media_id'   => $neue_media_id,
], 'Avatar gespeichert.');
