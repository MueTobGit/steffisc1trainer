<?php
/**
 * API: Profil — Avatar hochladen
 *
 * POST /api/profil/avatar_hochladen.php
 *
 * Multipart-Upload. Speichert Profilbild in uploads/avatare/.
 * Jeder authentifizierte Nutzer kann seinen eigenen Avatar ändern.
 *
 * Formular-Felder:
 *   - datei (Pflicht, Bilddatei)
 *
 * Response:
 *   { avatar_url: '...', media_id: 123 }
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

methode_erzwingen('POST');

$benutzer    = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];

// Upload prüfen
if (empty($_FILES['datei']) || $_FILES['datei']['error'] !== UPLOAD_ERR_OK) {
    $codes = [
        UPLOAD_ERR_INI_SIZE  => 'Datei überschreitet die maximale Upload-Größe.',
        UPLOAD_ERR_FORM_SIZE => 'Datei überschreitet die Formular-Größe.',
        UPLOAD_ERR_PARTIAL   => 'Datei nur teilweise hochgeladen.',
        UPLOAD_ERR_NO_FILE   => 'Keine Datei hochgeladen.',
        UPLOAD_ERR_NO_TMP_DIR=> 'Temporärer Ordner fehlt.',
        UPLOAD_ERR_CANT_WRITE=> 'Datei konnte nicht geschrieben werden.',
    ];
    $code = $_FILES['datei']['error'] ?? UPLOAD_ERR_NO_FILE;
    fehler_ungueltige_eingabe($codes[$code] ?? 'Upload-Fehler.');
}

$datei = $_FILES['datei'];

// Größe prüfen (max 2 MB für Avatare)
$max_bytes = 2 * 1024 * 1024;
if ($datei['size'] > $max_bytes) {
    fehler_ungueltige_eingabe('Avatar-Bild ist zu groß. Maximum: 2 MB.');
}

// MIME-Type prüfen
if (!mime_typ_erlaubt($datei['tmp_name'], 'bild')) {
    fehler_ungueltige_eingabe('Nur Bilddateien erlaubt (JPEG, PNG, WebP, GIF).');
}

// Zielordner
$ziel_ordner = UPLOAD_PFAD . '/avatare';
if (!is_dir($ziel_ordner)) {
    mkdir($ziel_ordner, 0755, true);
}

// Extension aus MIME-Typ ableiten — NICHT aus dem Dateinamen (verhindert exploits wie exploit.php)
$mime_zu_endung = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp'];
$echter_mime     = (new finfo(FILEINFO_MIME_TYPE))->file($datei['tmp_name']);
$erweiterung     = $mime_zu_endung[$echter_mime] ?? 'jpg';
$dateiname       = 'avatar_' . $benutzer_id . '_' . bin2hex(random_bytes(4)) . '.' . $erweiterung;
$ziel_pfad   = $ziel_ordner . '/' . $dateiname;

if (!move_uploaded_file($datei['tmp_name'], $ziel_pfad)) {
    fehler_server('Datei konnte nicht gespeichert werden.');
}

$relativer_pfad = 'uploads/avatare/' . $dateiname;

$pdo = db_verbindung();

// Altes Avatar löschen (falls vorhanden)
$alt_media_id = (int) ($benutzer['media_id'] ?? 0);
if ($alt_media_id > 0) {
    $alt_stmt = $pdo->prepare("SELECT dateipfad FROM medien WHERE id = ?");
    $alt_stmt->execute([$alt_media_id]);
    $alt_pfad = $alt_stmt->fetchColumn();
    if ($alt_pfad) {
        $abs = OEFFENTLICH_PFAD . '/' . ltrim($alt_pfad, '/');
        // Nur löschen wenn im avatare-Ordner (keine allgemeinen Medien löschen)
        if (str_contains($alt_pfad, 'avatare/') && file_exists($abs)) {
            @unlink($abs);
        }
    }
    $pdo->prepare("DELETE FROM medien WHERE id = ?")->execute([$alt_media_id]);
}

// Neuen Medien-Eintrag anlegen
$ins = $pdo->prepare("
    INSERT INTO medien (typ, dateipfad, alt_text, dateigroesse, erstellt_von)
    VALUES ('bild', ?, 'Avatar', ?, ?)
");
$ins->execute([$relativer_pfad, $datei['size'], $benutzer_id]);
$neue_media_id = (int) $pdo->lastInsertId();

// Benutzer-Datensatz aktualisieren
$pdo->prepare("UPDATE benutzer SET media_id = ? WHERE id = ?")
    ->execute([$neue_media_id, $benutzer_id]);

$avatar_url = OEFFENTLICH_URL . '/' . $relativer_pfad;

json_erfolg([
    'avatar_url' => $avatar_url,
    'media_id'   => $neue_media_id,
], 'Avatar erfolgreich gespeichert.');
