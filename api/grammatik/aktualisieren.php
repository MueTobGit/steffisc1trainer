<?php
/**
 * API: Grammatik — Aktualisieren
 *
 * POST /api/grammatik/aktualisieren.php?id=X
 *
 * Body (JSON, alle Felder optional außer formen):
 *   { wortart?, genus_gruppe?, formen?: string[], regel?, regeltext?, reihenfolge? }
 *
 * Nur für Admins.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';

methode_erzwingen('POST');

$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

$id = get_param_int('id');
if ($id < 1) {
    fehler_ungueltige_eingabe('Regel-ID ist erforderlich.');
}

$pdo = db_verbindung();

// Existenz prüfen
$vorhandene = $pdo->prepare("SELECT * FROM grammatik_regeln WHERE id = ?");
$vorhandene->execute([$id]);
$alt = $vorhandene->fetch(PDO::FETCH_ASSOC);
if (!$alt) {
    fehler_nicht_gefunden('Grammatikregel nicht gefunden.');
}

// Aktuelle Formen laden
$f_alt = $pdo->prepare("SELECT form_bezeichnung FROM grammatik_regel_formen WHERE regel_id = ?");
$f_alt->execute([$id]);
$formen_alt = $f_alt->fetchAll(PDO::FETCH_COLUMN);

$body = json_body_lesen();

$wortart      = isset($body['wortart'])      ? trim($body['wortart'])      : $alt['wortart'];
$genus_gruppe = isset($body['genus_gruppe']) ? trim($body['genus_gruppe']) : $alt['genus_gruppe'];
$regel        = isset($body['regel'])        ? trim($body['regel'])        : $alt['regel'];
$regeltext    = isset($body['regeltext'])    ? trim($body['regeltext'])    : $alt['regeltext'];
$reihenfolge  = isset($body['reihenfolge'])  ? (int) $body['reihenfolge'] : (int) $alt['reihenfolge'];

// formen: wenn angegeben → überschreiben, sonst behalten
if (isset($body['formen'])) {
    $formen = array_values(array_unique(array_filter(array_map('trim', (array) $body['formen']))));
} else {
    $formen = $formen_alt;
}

if (!$wortart || !$genus_gruppe || empty($formen) || !$regel || !$regeltext) {
    fehler_ungueltige_eingabe('Pflichtfelder dürfen nicht leer sein und es muss mindestens eine Form gewählt sein.');
}

// Duplikat-Prüfung: (wortart, genus_gruppe, form_bezeichnung) nicht von anderer Regel belegt
$platzh = implode(',', array_fill(0, count($formen), '?'));
$dup = $pdo->prepare("
    SELECT gr.id FROM grammatik_regeln gr
    JOIN grammatik_regel_formen grf ON grf.regel_id = gr.id
    WHERE gr.wortart = ? AND gr.genus_gruppe = ? AND grf.form_bezeichnung IN ({$platzh})
      AND gr.id != ?
    LIMIT 1
");
$dup->execute(array_merge([$wortart, $genus_gruppe], $formen, [$id]));
if ($dup->fetchColumn()) {
    fehler_ungueltige_eingabe('Eine andere Regel belegt bereits diese Wortart, Genus/Gruppe und mindestens eine der gewählten Formen.');
}

$pdo->beginTransaction();
try {
    $pdo->prepare("
        UPDATE grammatik_regeln
        SET wortart = ?, genus_gruppe = ?, regel = ?, regeltext = ?, reihenfolge = ?
        WHERE id = ?
    ")->execute([$wortart, $genus_gruppe, $regel, $regeltext, $reihenfolge, $id]);

    // Formen-Sync: löschen + neu einfügen
    $pdo->prepare("DELETE FROM grammatik_regel_formen WHERE regel_id = ?")->execute([$id]);
    $f_stmt = $pdo->prepare("INSERT INTO grammatik_regel_formen (regel_id, form_bezeichnung) VALUES (?, ?)");
    foreach ($formen as $fb) {
        $f_stmt->execute([$id, $fb]);
    }
    $pdo->commit();
} catch (\Exception $e) {
    $pdo->rollBack();
    fehler_server('Fehler beim Aktualisieren der Grammatikregel: ' . $e->getMessage());
}

$aktuell = $pdo->prepare("
    SELECT id, wortart, genus_gruppe, regel, regeltext, reihenfolge, erstellt_am, aktualisiert_am
    FROM grammatik_regeln WHERE id = ?
");
$aktuell->execute([$id]);
$aktualisiert = $aktuell->fetch(PDO::FETCH_ASSOC);
$aktualisiert['id']          = (int) $aktualisiert['id'];
$aktualisiert['reihenfolge'] = (int) $aktualisiert['reihenfolge'];
$aktualisiert['formen']      = $formen;

json_erfolg(['regel' => $aktualisiert], 'Grammatikregel erfolgreich aktualisiert.');
