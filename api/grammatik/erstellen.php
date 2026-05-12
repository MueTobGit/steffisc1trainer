<?php
/**
 * API: Grammatik — Erstellen
 *
 * POST /api/grammatik/erstellen.php
 *
 * Body (JSON):
 *   { wortart, genus_gruppe, formen: string[], regel, regeltext, reihenfolge? }
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

$body = json_body_lesen();

$wortart      = trim($body['wortart']      ?? '');
$genus_gruppe = trim($body['genus_gruppe'] ?? '');
$formen       = $body['formen']            ?? [];
$regel        = trim($body['regel']        ?? '');
$regeltext    = trim($body['regeltext']    ?? '');
$reihenfolge  = isset($body['reihenfolge']) ? (int) $body['reihenfolge'] : 0;

if (!$wortart || !$genus_gruppe || empty($formen) || !$regel || !$regeltext) {
    fehler_ungueltige_eingabe('wortart, genus_gruppe, formen, regel und regeltext sind erforderlich.');
}

// formen bereinigen
$formen = array_values(array_unique(array_filter(array_map('trim', (array) $formen))));
if (empty($formen)) {
    fehler_ungueltige_eingabe('Mindestens eine Form muss ausgewählt sein.');
}

$pdo = db_verbindung();

// Duplikat-Prüfung: gibt es schon eine Regel für (wortart, genus_gruppe) + eine der gewählten Formen?
$platzh = implode(',', array_fill(0, count($formen), '?'));
$dup = $pdo->prepare("
    SELECT gr.id FROM grammatik_regeln gr
    JOIN grammatik_regel_formen grf ON grf.regel_id = gr.id
    WHERE gr.wortart = ? AND gr.genus_gruppe = ? AND grf.form_bezeichnung IN ({$platzh})
    LIMIT 1
");
$dup->execute(array_merge([$wortart, $genus_gruppe], $formen));
if ($dup->fetchColumn()) {
    fehler_ungueltige_eingabe('Für diese Wortart, Genus/Gruppe und mindestens eine der gewählten Formen existiert bereits eine Regel.');
}

$pdo->beginTransaction();
try {
    $stmt = $pdo->prepare("
        INSERT INTO grammatik_regeln (wortart, genus_gruppe, regel, regeltext, reihenfolge)
        VALUES (?, ?, ?, ?, ?)
    ");
    $stmt->execute([$wortart, $genus_gruppe, $regel, $regeltext, $reihenfolge]);
    $neue_id = (int) $pdo->lastInsertId();

    $f_stmt = $pdo->prepare("
        INSERT INTO grammatik_regel_formen (regel_id, form_bezeichnung) VALUES (?, ?)
    ");
    foreach ($formen as $fb) {
        $f_stmt->execute([$neue_id, $fb]);
    }
    $pdo->commit();
} catch (\Exception $e) {
    $pdo->rollBack();
    fehler_server('Fehler beim Erstellen der Grammatikregel: ' . $e->getMessage());
}

$neu = $pdo->prepare("
    SELECT id, wortart, genus_gruppe, regel, regeltext, reihenfolge, erstellt_am, aktualisiert_am
    FROM grammatik_regeln WHERE id = ?
");
$neu->execute([$neue_id]);
$neue_regel = $neu->fetch(PDO::FETCH_ASSOC);
$neue_regel['id']          = (int) $neue_regel['id'];
$neue_regel['reihenfolge'] = (int) $neue_regel['reihenfolge'];
$neue_regel['formen']      = $formen;

json_erfolg(['regel' => $neue_regel], 'Grammatikregel erfolgreich erstellt.');
