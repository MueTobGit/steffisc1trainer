<?php
/**
 * API: Grammatik — Löschen
 *
 * DELETE /api/grammatik/loeschen.php?id=X
 *
 * Löscht eine Grammatikregel endgültig.
 * Nur für Admins.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';

methode_erzwingen('DELETE');

$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

$id = get_param_int('id');
if ($id < 1) {
    fehler_ungueltige_eingabe('Regel-ID ist erforderlich.');
}

$pdo = db_verbindung();

$vorhandene = $pdo->prepare("SELECT id FROM grammatik_regeln WHERE id = ?");
$vorhandene->execute([$id]);
if (!$vorhandene->fetchColumn()) {
    fehler_nicht_gefunden('Grammatikregel nicht gefunden.');
}

$pdo->prepare("DELETE FROM grammatik_regeln WHERE id = ?")->execute([$id]);

json_erfolg(['id' => $id, 'geloescht' => true], 'Grammatikregel erfolgreich gelöscht.');
