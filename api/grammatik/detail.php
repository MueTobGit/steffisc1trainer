<?php
/**
 * API: Grammatik — Detail
 *
 * GET /api/grammatik/detail.php?id=X
 *
 * Gibt eine einzelne Grammatikregel inkl. formen-Array zurück.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

methode_erzwingen('GET');

$benutzer = benutzer_authentifizieren();

$id = get_param_int('id');
if ($id < 1) {
    fehler_ungueltige_eingabe('Regel-ID ist erforderlich.');
}

$pdo = db_verbindung();

$stmt = $pdo->prepare("
    SELECT id, wortart, genus_gruppe, regel, regeltext, reihenfolge, erstellt_am, aktualisiert_am
    FROM grammatik_regeln
    WHERE id = ?
");
$stmt->execute([$id]);
$regel = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$regel) {
    fehler_nicht_gefunden('Grammatikregel nicht gefunden.');
}

$regel['id']          = (int) $regel['id'];
$regel['reihenfolge'] = (int) $regel['reihenfolge'];

$f_stmt = $pdo->prepare("
    SELECT form_bezeichnung FROM grammatik_regel_formen
    WHERE regel_id = ? ORDER BY form_bezeichnung ASC
");
$f_stmt->execute([$id]);
$regel['formen'] = $f_stmt->fetchAll(PDO::FETCH_COLUMN);

json_erfolg(['regel' => $regel]);
