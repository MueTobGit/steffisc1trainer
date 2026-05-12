<?php
/**
 * Ligen-Helfer-Funktionen
 *
 * Gemeinsame Funktionen fuer Kronen-Vergabe.
 * Wird von abschliessen.php und aktuelle.php eingebunden.
 */

declare(strict_types=1);

/**
 * Vergibt Kronen an die Top 3 einer abgelaufenen Liga. Idempotent.
 *
 * @return array  Liste der Gewinner [rang, benutzername, spitzname, punkte]
 */
function liga_kronen_vergeben(\PDO $pdo, int $liga_id): array
{
    // Bereits vergeben? Dann bestehende Liste zurueckgeben.
    $check = $pdo->prepare("SELECT COUNT(*) FROM benutzer_kronen WHERE liga_id = ?");
    $check->execute([$liga_id]);
    if ((int) $check->fetchColumn() > 0) {
        $ex = $pdo->prepare("
            SELECT bk.rang, bk.punkte, b.benutzername, b.spitzname
            FROM benutzer_kronen bk
            JOIN benutzer b ON b.id = bk.benutzer_id
            WHERE bk.liga_id = ?
            ORDER BY bk.rang ASC
        ");
        $ex->execute([$liga_id]);
        return $ex->fetchAll(\PDO::FETCH_ASSOC);
    }

    // Top 3 aus liga_teilnehmer (mindestens 1 Punkt noetig)
    $stmt = $pdo->prepare("
        SELECT lt.benutzer_id, lt.punkte, b.benutzername, b.spitzname
        FROM liga_teilnehmer lt
        JOIN benutzer b ON b.id = lt.benutzer_id
        WHERE lt.liga_id = ? AND lt.punkte > 0
        ORDER BY lt.punkte DESC, lt.beigetreten_am ASC
        LIMIT 3
    ");
    $stmt->execute([$liga_id]);
    $top3 = $stmt->fetchAll(\PDO::FETCH_ASSOC);

    if (empty($top3)) {
        return [];
    }

    $ins = $pdo->prepare("
        INSERT IGNORE INTO benutzer_kronen (benutzer_id, liga_id, rang, punkte)
        VALUES (?, ?, ?, ?)
    ");

    $gewinner = [];
    foreach ($top3 as $i => $eintrag) {
        $rang = $i + 1;
        $ins->execute([(int) $eintrag['benutzer_id'], $liga_id, $rang, (int) $eintrag['punkte']]);
        liga_belohnung_vergeben($pdo, (int) $eintrag['benutzer_id'], $rang);

        $gewinner[] = [
            'rang'         => $rang,
            'benutzername' => $eintrag['benutzername'],
            'spitzname'    => $eintrag['spitzname'],
            'punkte'       => (int) $eintrag['punkte'],
        ];
    }

    return $gewinner;
}

/**
 * Vergibt die liga_gold / liga_silber / liga_bronze Belohnung an einen Benutzer.
 */
function liga_belohnung_vergeben(\PDO $pdo, int $benutzer_id, int $rang): void
{
    static $code_map = [1 => 'liga_gold', 2 => 'liga_silber', 3 => 'liga_bronze'];
    $code = $code_map[$rang] ?? null;
    if (!$code) return;

    $b_stmt = $pdo->prepare("SELECT id FROM belohnungen WHERE code = ?");
    $b_stmt->execute([$code]);
    $belohnung_id = $b_stmt->fetchColumn();
    if (!$belohnung_id) return;

    $pdo->prepare("
        INSERT IGNORE INTO benutzer_belohnungen (benutzer_id, belohnung_id, freigeschaltet_am)
        VALUES (?, ?, NOW())
    ")->execute([$benutzer_id, (int) $belohnung_id]);
}
