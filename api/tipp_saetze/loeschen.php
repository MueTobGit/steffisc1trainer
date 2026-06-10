<?php
/**
 * API: Tipp-Sätze — Löschen (Admin, Soft-Delete)
 *
 * DELETE /api/tipp_saetze/loeschen.php?id=X
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

methode_erzwingen('DELETE');
$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

$id = get_param_int('id');
if ($id < 1) fehler_ungueltige_eingabe('ID ist erforderlich.');
id_existiert($id, 'tipp_saetze', 'Satz');

$pdo = db_verbindung();
$pdo->prepare('UPDATE tipp_saetze SET aktiv = 0 WHERE id = ?')->execute([$id]);

json_erfolg(null, 'Satz gelöscht.');
