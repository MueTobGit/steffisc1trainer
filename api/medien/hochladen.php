<?php
/**
 * API: Medien — Hochladen
 *
 * POST /api/medien/hochladen.php
 *
 * Multipart-Upload. MIME-Pruefung.
 * Speichert in uploads/bilder/ oder uploads/audio/.
 * Nur Admin.
 *
 * Formular-Felder:
 *   - datei (Pflicht, File-Upload)
 *   - typ: 'bild' oder 'audio' (Pflicht)
 *   - alt_text (optional)
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';

// --- Methode pruefen ---
methode_erzwingen('POST');

// --- Authentifizierung + Autorisierung ---
$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

// --- Upload pruefen ---
if (empty($_FILES['datei']) || $_FILES['datei']['error'] !== UPLOAD_ERR_OK) {
    $fehlercode = $_FILES['datei']['error'] ?? UPLOAD_ERR_NO_FILE;
    $fehlermeldungen = [
        UPLOAD_ERR_INI_SIZE => 'Datei ueberschreitet die maximale Upload-Groesse.',
        UPLOAD_ERR_FORM_SIZE => 'Datei ueberschreitet die erlaubte Formulargroesse.',
        UPLOAD_ERR_PARTIAL => 'Datei wurde nur teilweise hochgeladen.',
        UPLOAD_ERR_NO_FILE => 'Keine Datei hochgeladen.',
        UPLOAD_ERR_NO_TMP_DIR => 'Temporaerer Ordner fehlt.',
        UPLOAD_ERR_CANT_WRITE => 'Datei konnte nicht geschrieben werden.',
    ];
    fehler_ungueltige_eingabe($fehlermeldungen[$fehlercode] ?? 'Upload-Fehler.');
}

$datei = $_FILES['datei'];
$typ = $_POST['typ'] ?? '';
$alt_text = $_POST['alt_text'] ?? '';

// Typ validieren
if (!in_array($typ, ['bild', 'audio'], true)) {
    fehler_ungueltige_eingabe("Typ muss 'bild' oder 'audio' sein.");
}

// Groesse pruefen
if ($datei['size'] > MAX_UPLOAD_BYTES) {
    $max_mb = MAX_UPLOAD_BYTES / 1024 / 1024;
    fehler_ungueltige_eingabe("Datei ist zu gross. Maximum: {$max_mb} MB.");
}

// MIME-Type pruefen
if (!mime_typ_erlaubt($datei['tmp_name'], $typ)) {
    $erlaubt = $typ === 'bild' ? implode(', ', ERLAUBTE_BILD_TYPEN) : implode(', ', ERLAUBTE_AUDIO_TYPEN);
    fehler_ungueltige_eingabe("Dateityp nicht erlaubt. Erlaubt: {$erlaubt}");
}

// --- Zielverzeichnis ---
$unter_ordner = $typ === 'bild' ? 'bilder' : 'audio';
$ziel_ordner = UPLOAD_PFAD . '/' . $unter_ordner;

// Ordner erstellen falls noetig
if (!is_dir($ziel_ordner)) {
    mkdir($ziel_ordner, 0755, true);
}

// Extension aus MIME-Typ ableiten — NICHT aus dem Dateinamen (verhindert exploits wie exploit.php)
$mime_zu_endung = [
    'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp',
    'audio/mpeg' => 'mp3', 'audio/wav'  => 'wav', 'audio/ogg'  => 'ogg',
];
$echter_mime   = (new finfo(FILEINFO_MIME_TYPE))->file($datei['tmp_name']);
$erweiterung   = $mime_zu_endung[$echter_mime] ?? ($typ === 'audio' ? 'mp3' : 'jpg');
$original_name = pathinfo($datei['name'], PATHINFO_FILENAME);
$sicherer_name = dateiname_bereinigen($original_name);
$dateiname = $sicherer_name . '_' . bin2hex(random_bytes(4)) . '.' . $erweiterung;
$ziel_pfad = $ziel_ordner . '/' . $dateiname;

// Datei verschieben
if (!move_uploaded_file($datei['tmp_name'], $ziel_pfad)) {
    fehler_server('Datei konnte nicht gespeichert werden.');
}

// Relativer Pfad fuer DB
$relativer_pfad = "uploads/{$unter_ordner}/{$dateiname}";

// ENUM-Typ fuer DB
$db_typ = $typ === 'bild' ? 'bild' : 'audio';

$pdo = db_verbindung();

// --- DB-Eintrag ---
$sql = "
    INSERT INTO medien (typ, dateipfad, alt_text, dateigroesse, erstellt_von)
    VALUES (?, ?, ?, ?, ?)
";

$stmt = $pdo->prepare($sql);
$stmt->execute([
    $db_typ,
    $relativer_pfad,
    !empty($alt_text) ? trim($alt_text) : null,
    $datei['size'],
    $benutzer['id'],
]);

$media_id = (int) $pdo->lastInsertId();

json_erfolg([
    'id' => $media_id,
    'typ' => $db_typ,
    'dateipfad' => $relativer_pfad,
    'url' => OEFFENTLICH_URL . '/' . $relativer_pfad,
    'alt_text' => $alt_text ?: null,
    'dateigroesse' => $datei['size'],
], 'Datei erfolgreich hochgeladen.', 201);
