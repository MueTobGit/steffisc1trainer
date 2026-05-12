<?php
/**
 * API: Gruppen — Gruppenavatar hochladen
 *
 * POST /api/gruppen/avatar_hochladen.php  (multipart/form-data)
 *
 * Felder:
 *   - gruppen_id (Pflicht)
 *   - avatar     (Datei, Pflicht) — JPEG/PNG/WEBP, max. 2 MB
 *
 * Nur Admin/Leiter der Gruppe darf den Avatar aendern.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';

methode_erzwingen('POST');

$benutzer    = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];

$gruppen_id = (int) ($_POST['gruppen_id'] ?? 0);
if ($gruppen_id < 1) {
    fehler_ungueltige_eingabe('gruppen_id ist erforderlich.');
}

if (!isset($_FILES['avatar']) || $_FILES['avatar']['error'] !== UPLOAD_ERR_OK) {
    fehler_ungueltige_eingabe('Bitte eine Bilddatei hochladen.');
}

$pdo = db_verbindung();

// Berechtigung pruefen
if (!ist_admin($benutzer) && !gruppen_rolle_pruefen($benutzer_id, $gruppen_id, ['admin', 'leiter'])) {
    fehler_nicht_berechtigt('Nur Admins und Leiter koennen den Gruppenavatar aendern.');
}

// Gruppe laden
$stmt = $pdo->prepare("SELECT id, media_id FROM gruppen WHERE id = ? AND aktiv = 1");
$stmt->execute([$gruppen_id]);
$gruppe = $stmt->fetch();
if (!$gruppe) {
    fehler_nicht_gefunden('Gruppe nicht gefunden.');
}

// Datei validieren
$datei     = $_FILES['avatar'];
$max_bytes = 2 * 1024 * 1024; // 2 MB

if ($datei['size'] > $max_bytes) {
    fehler_ungueltige_eingabe('Datei zu gross. Maximum: 2 MB.');
}

$mime = mime_content_type($datei['tmp_name']);
$erlaubte_mimes = ['image/jpeg', 'image/png', 'image/webp'];
if (!in_array($mime, $erlaubte_mimes, true)) {
    fehler_ungueltige_eingabe('Nur JPEG, PNG und WEBP sind erlaubt.');
}

$endung_map = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
$endung = $endung_map[$mime];

// Upload-Verzeichnis
$upload_dir = dirname(__DIR__, 2) . '/oeffentlich/uploads/gruppen/';
if (!is_dir($upload_dir)) {
    mkdir($upload_dir, 0755, true);
}

$dateiname  = 'gruppe_' . $gruppen_id . '_' . time() . '.' . $endung;
$ziel_pfad  = $upload_dir . $dateiname;
$url_pfad   = 'uploads/gruppen/' . $dateiname; // kein fuehrender Slash — konsistent mit anderen Uploads

if (!move_uploaded_file($datei['tmp_name'], $ziel_pfad)) {
    fehler_server('Datei konnte nicht gespeichert werden.');
}

// Medien-Eintrag erstellen
$stmt = $pdo->prepare("
    INSERT INTO medien (typ, dateipfad, alt_text, dateigroesse, erstellt_von)
    VALUES ('bild', ?, ?, ?, ?)
");
$stmt->execute([$url_pfad, 'Gruppenavatar', $datei['size'], $benutzer_id]);
$neue_media_id = (int) $pdo->lastInsertId();

// Gruppe aktualisieren
$pdo->prepare("UPDATE gruppen SET media_id = ? WHERE id = ?")->execute([$neue_media_id, $gruppen_id]);

// Altes Medium loeschen (optional: Datei entfernen)
$altes_media_id = (int) $gruppe['media_id'];
if ($altes_media_id > 0) {
    $stmt = $pdo->prepare("SELECT dateipfad FROM medien WHERE id = ?");
    $stmt->execute([$altes_media_id]);
    $altes = $stmt->fetch();
    if ($altes) {
        // ltrim: sicher gegen sowohl 'uploads/...' als auch '/uploads/...' in der DB
        $alter_pfad = OEFFENTLICH_PFAD . '/' . ltrim($altes['dateipfad'], '/');
        if (file_exists($alter_pfad)) {
            @unlink($alter_pfad);
        }
    }
    $pdo->prepare("DELETE FROM medien WHERE id = ?")->execute([$altes_media_id]);
}

json_erfolg(['avatar_url' => $url_pfad], 'Gruppenavatar erfolgreich gespeichert.');
