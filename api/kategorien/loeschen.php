<?php
/**
 * API: Kategorien — Loeschen
 *
 * DELETE /api/kategorien/loeschen.php?id=X
 *
 * Hard-Delete. Kinder-Kategorien werden ebenfalls geloescht.
 * Lektionen in diesen Kategorien werden ebenfalls hard-deleted
 * (lektion_vokabeln per CASCADE automatisch).
 *
 * FK-Kaskaden der DB (ON DELETE SET NULL):
 *   - vokabeln.kategorie_id → NULL
 *
 * Nur Admin.
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
if ($id < 1) {
    fehler_ungueltige_eingabe('Kategorie-ID ist erforderlich.');
}

$kategorie = id_existiert($id, 'kategorien', 'Kategorie');

$pdo = db_verbindung();

// Betroffene Vokabeln und Lektionen zählen (inkl. Kinder-Kategorien)
$kinder_ids  = _alle_kinder_ids($pdo, $id);
$alle_ids    = array_merge([$id], $kinder_ids);
$platzhalter = implode(',', array_fill(0, count($alle_ids), '?'));

$stmt = $pdo->prepare("SELECT COUNT(*) FROM vokabeln WHERE kategorie_id IN ({$platzhalter})");
$stmt->execute($alle_ids);
$vokabeln_betroffen = (int) $stmt->fetchColumn();

$stmt = $pdo->prepare("SELECT COUNT(*) FROM lektionen WHERE kategorie_id IN ({$platzhalter})");
$stmt->execute($alle_ids);
$lektionen_betroffen = (int) $stmt->fetchColumn();

// Hard-Delete — Lektionen zuerst loeschen (inkl. ihrer lektion_vokabeln per CASCADE),
// dann Kategorien (FK ON DELETE SET NULL setzt vokabeln.kategorie_id auf NULL)
$pdo->beginTransaction();
try {
    // Lektionen in allen betroffenen Kategorien loeschen (lektion_vokabeln per CASCADE)
    $pdo->prepare("DELETE FROM lektionen WHERE kategorie_id IN ({$platzhalter})")->execute($alle_ids);

    // Kinder-Kategorien zuerst (Blätter → Wurzel), damit FK eltern_id nicht stört
    foreach (array_reverse($kinder_ids) as $kid) {
        $pdo->prepare('DELETE FROM kategorien WHERE id = ?')->execute([$kid]);
    }
    $pdo->prepare('DELETE FROM kategorien WHERE id = ?')->execute([$id]);
    $pdo->commit();
} catch (Exception $e) {
    $pdo->rollBack();
    error_log('Kategorie loeschen fehlgeschlagen: ' . $e->getMessage());
    fehler_server('Kategorie konnte nicht gelöscht werden.');
}

$nachricht = "Kategorie „{$kategorie['name']}\" und " . count($kinder_ids) . ' Unterkategorie(n) gelöscht.';
if ($lektionen_betroffen > 0) {
    $nachricht .= " {$lektionen_betroffen} Lektion(en) wurden ebenfalls gelöscht.";
}
if ($vokabeln_betroffen > 0) {
    $nachricht .= " {$vokabeln_betroffen} Vokabel(n) sind jetzt keiner Kategorie mehr zugeordnet.";
}

json_erfolg([
    'id'                  => $id,
    'kinder_geloescht'    => count($kinder_ids),
    'vokabeln_betroffen'  => $vokabeln_betroffen,
    'lektionen_betroffen' => $lektionen_betroffen,
], $nachricht);

// --- Hilfsfunktion ---

function _alle_kinder_ids(PDO $pdo, int $eltern_id): array
{
    $stmt = $pdo->prepare('SELECT id FROM kategorien WHERE eltern_id = ?');
    $stmt->execute([$eltern_id]);
    $kinder = $stmt->fetchAll(PDO::FETCH_COLUMN);
    $ids = [];
    foreach ($kinder as $kid) {
        $ids[] = (int) $kid;
        $ids   = array_merge($ids, _alle_kinder_ids($pdo, (int) $kid));
    }
    return $ids;
}
