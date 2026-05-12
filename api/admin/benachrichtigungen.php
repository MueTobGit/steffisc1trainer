<?php
/**
 * API: Admin — App-Benachrichtigungen
 *
 * GET    → Alle Einträge laden (optional ?typ=taeglich|einmalig|milestone)
 * POST   → Neuen Eintrag erstellen ODER bestehenden aktualisieren
 *          { aktion: 'erstellen'|'aktualisieren'|'loeschen'|'status', ... }
 *
 * Nur für Admins.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

methode_erzwingen(['GET', 'POST']);

$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

$pdo     = db_verbindung();
$methode = $_SERVER['REQUEST_METHOD'];

// ──────────────────────────────────────────────────────────
// GET: Alle Benachrichtigungen laden
// ──────────────────────────────────────────────────────────
if ($methode === 'GET') {
    $where  = '';
    $params = [];

    if (!empty($_GET['typ'])) {
        $erlaubt = ['taeglich', 'einmalig', 'milestone'];
        if (in_array($_GET['typ'], $erlaubt, true)) {
            $where    = 'WHERE typ = ?';
            $params[] = $_GET['typ'];
        }
    }

    $stmt = $pdo->prepare("
        SELECT id, schluessel, bezeichnung, typ, kanal,
               titel, text, parameter_1, parameter_2,
               aktiv, sortierung, beschreibung,
               aktualisiert_am
        FROM app_benachrichtigungen
        {$where}
        ORDER BY sortierung ASC, schluessel ASC
    ");
    $stmt->execute($params);
    $eintraege = $stmt->fetchAll();

    foreach ($eintraege as &$e) {
        $e['id']      = (int) $e['id'];
        $e['aktiv']   = (bool) $e['aktiv'];
        $e['sortierung'] = (int) $e['sortierung'];
    }
    unset($e);

    json_erfolg($eintraege);
    exit;
}

// ──────────────────────────────────────────────────────────
// POST: Aktion ausführen
// ──────────────────────────────────────────────────────────
$daten  = json_body_lesen();
$aktion = trim($daten['aktion'] ?? '');

switch ($aktion) {

    // ── Erstellen ──────────────────────────────────────────
    case 'erstellen':
        pflichtfelder_pruefen($daten, ['schluessel', 'bezeichnung', 'typ', 'kanal', 'titel', 'text']);

        $schluessel  = trim($daten['schluessel']);
        $bezeichnung = trim($daten['bezeichnung']);
        $typ         = trim($daten['typ']);
        $kanal       = trim($daten['kanal']);
        $titel       = trim($daten['titel']);
        $text        = trim($daten['text']);
        $param1      = isset($daten['parameter_1']) ? trim($daten['parameter_1']) : null;
        $param2      = isset($daten['parameter_2']) ? trim($daten['parameter_2']) : null;
        $beschreibung = isset($daten['beschreibung']) ? trim($daten['beschreibung']) : null;
        $sortierung  = isset($daten['sortierung'])  ? (int) $daten['sortierung']  : 0;
        $aktiv       = isset($daten['aktiv'])        ? (bool) $daten['aktiv']       : true;

        // Validierung
        laenge_validieren($schluessel,  'schluessel',  1, 64);
        laenge_validieren($bezeichnung, 'bezeichnung', 1, 128);
        laenge_validieren($titel,       'titel',       1, 128);
        laenge_validieren($text,        'text',        1, 512);

        _typ_pruefen($typ);
        _kanal_pruefen($kanal);

        // Schlüssel darf nicht bereits existieren
        $check = $pdo->prepare("SELECT id FROM app_benachrichtigungen WHERE schluessel = ?");
        $check->execute([$schluessel]);
        if ($check->fetchColumn()) {
            fehler_doppelter_eintrag("Schlüssel '{$schluessel}' existiert bereits.");
        }

        $stmt = $pdo->prepare("
            INSERT INTO app_benachrichtigungen
                (schluessel, bezeichnung, typ, kanal, titel, text,
                 parameter_1, parameter_2, aktiv, sortierung, beschreibung)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $schluessel, $bezeichnung, $typ, $kanal, $titel, $text,
            $param1 ?: null, $param2 ?: null,
            $aktiv ? 1 : 0, $sortierung, $beschreibung ?: null,
        ]);

        $neue_id = (int) $pdo->lastInsertId();
        _aktivitaet_loggen($pdo, $benutzer['id'],
            "Benachrichtigung erstellt: {$schluessel}",
            ['id' => $neue_id, 'schluessel' => $schluessel]);

        json_erfolg(['id' => $neue_id], 'Benachrichtigung erstellt.');
        break;

    // ── Aktualisieren ──────────────────────────────────────
    case 'aktualisieren':
        pflichtfelder_pruefen($daten, ['id']);

        $id          = (int) $daten['id'];
        $bezeichnung = isset($daten['bezeichnung']) ? trim($daten['bezeichnung']) : null;
        $typ         = isset($daten['typ'])         ? trim($daten['typ'])         : null;
        $kanal       = isset($daten['kanal'])       ? trim($daten['kanal'])       : null;
        $titel       = isset($daten['titel'])       ? trim($daten['titel'])       : null;
        $text        = isset($daten['text'])        ? trim($daten['text'])        : null;
        $param1      = array_key_exists('parameter_1', $daten) ? trim($daten['parameter_1']) : false;
        $param2      = array_key_exists('parameter_2', $daten) ? trim($daten['parameter_2']) : false;
        $beschreibung = array_key_exists('beschreibung', $daten) ? trim($daten['beschreibung']) : false;
        $sortierung  = isset($daten['sortierung'])  ? (int) $daten['sortierung']  : null;
        $aktiv       = isset($daten['aktiv'])        ? (bool) $daten['aktiv']       : null;

        if ($typ)   _typ_pruefen($typ);
        if ($kanal) _kanal_pruefen($kanal);

        // Felder dynamisch zusammenbauen
        $sets   = [];
        $values = [];

        if ($bezeichnung !== null) { $sets[] = 'bezeichnung = ?';  $values[] = $bezeichnung; }
        if ($typ         !== null) { $sets[] = 'typ = ?';          $values[] = $typ; }
        if ($kanal       !== null) { $sets[] = 'kanal = ?';        $values[] = $kanal; }
        if ($titel       !== null) { $sets[] = 'titel = ?';        $values[] = $titel; }
        if ($text        !== null) { $sets[] = 'text = ?';         $values[] = $text; }
        if ($param1      !== false){ $sets[] = 'parameter_1 = ?';  $values[] = $param1 ?: null; }
        if ($param2      !== false){ $sets[] = 'parameter_2 = ?';  $values[] = $param2 ?: null; }
        if ($beschreibung!== false){ $sets[] = 'beschreibung = ?'; $values[] = $beschreibung ?: null; }
        if ($sortierung  !== null) { $sets[] = 'sortierung = ?';   $values[] = $sortierung; }
        if ($aktiv       !== null) { $sets[] = 'aktiv = ?';        $values[] = $aktiv ? 1 : 0; }

        if (empty($sets)) {
            json_erfolg(null, 'Keine Änderungen.');
            break;
        }

        $values[] = $id;
        $stmt = $pdo->prepare("UPDATE app_benachrichtigungen SET " . implode(', ', $sets) . " WHERE id = ?");
        $stmt->execute($values);

        if ($stmt->rowCount() === 0) {
            fehler_nicht_gefunden("Benachrichtigung #{$id} nicht gefunden.");
        }

        _aktivitaet_loggen($pdo, $benutzer['id'],
            "Benachrichtigung aktualisiert: #{$id}", ['id' => $id]);

        json_erfolg(null, 'Benachrichtigung gespeichert.');
        break;

    // ── Löschen ────────────────────────────────────────────
    case 'loeschen':
        pflichtfelder_pruefen($daten, ['id']);
        $id = (int) $daten['id'];

        // Standard-Einträge (ohne Präfix) dürfen nicht gelöscht werden
        $row = $pdo->prepare("SELECT schluessel FROM app_benachrichtigungen WHERE id = ?");
        $row->execute([$id]);
        $schluessel = $row->fetchColumn();

        if ($schluessel === false) {
            fehler_nicht_gefunden("Benachrichtigung #{$id} nicht gefunden.");
        }

        $stmt = $pdo->prepare("DELETE FROM app_benachrichtigungen WHERE id = ?");
        $stmt->execute([$id]);

        _aktivitaet_loggen($pdo, $benutzer['id'],
            "Benachrichtigung gelöscht: {$schluessel}", ['id' => $id, 'schluessel' => $schluessel]);

        json_erfolg(null, 'Benachrichtigung gelöscht.');
        break;

    // ── Status umschalten ──────────────────────────────────
    case 'status':
        pflichtfelder_pruefen($daten, ['id', 'aktiv']);
        $id    = (int)  $daten['id'];
        $aktiv = (bool) $daten['aktiv'];

        $stmt = $pdo->prepare("UPDATE app_benachrichtigungen SET aktiv = ? WHERE id = ?");
        $stmt->execute([$aktiv ? 1 : 0, $id]);

        if ($stmt->rowCount() === 0) {
            fehler_nicht_gefunden("Benachrichtigung #{$id} nicht gefunden.");
        }

        json_erfolg(null, $aktiv ? 'Aktiviert.' : 'Deaktiviert.');
        break;

    default:
        http_response_code(400);
        json_fehler("Unbekannte Aktion: '{$aktion}'.");
        break;
}

// ──────────────────────────────────────────────────────────
// Hilfsfunktionen
// ──────────────────────────────────────────────────────────

function _typ_pruefen(string $typ): void {
    $erlaubt = ['taeglich', 'einmalig', 'milestone'];
    if (!in_array($typ, $erlaubt, true)) {
        http_response_code(422);
        json_fehler("Ungültiger Typ. Erlaubt: " . implode(', ', $erlaubt));
        exit;
    }
}

function _kanal_pruefen(string $kanal): void {
    $erlaubt = ['training', 'streak', 'einmalig', 'milestone'];
    if (!in_array($kanal, $erlaubt, true)) {
        http_response_code(422);
        json_fehler("Ungültiger Kanal. Erlaubt: " . implode(', ', $erlaubt));
        exit;
    }
}

function _aktivitaet_loggen(PDO $pdo, int $benutzer_id, string $beschreibung, array $details): void {
    $stmt = $pdo->prepare("
        INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung, details_json)
        VALUES (?, 'admin_aktion', ?, ?)
    ");
    $stmt->execute([
        $benutzer_id,
        $beschreibung,
        json_encode($details, JSON_UNESCAPED_UNICODE),
    ]);
}
