<?php
/**
 * API: Ligen — Rangliste
 *
 * GET /api/ligen/rangliste.php?liga_id=X
 *
 * Paginierte Rangliste einer Liga.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

// --- Methode pruefen ---
methode_erzwingen('GET');

// --- Authentifizierung ---
$benutzer = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];

// --- Parameter ---
$liga_id = get_param_int('liga_id', 0);
if ($liga_id < 1) {
    fehler_ungueltige_eingabe('liga_id ist erforderlich.');
}

[$seite, $pro_seite] = paginierung_parameter();

$pdo = db_verbindung();

// --- Liga pruefen ---
$stmt = $pdo->prepare("SELECT id FROM ligen WHERE id = ?");
$stmt->execute([$liga_id]);
if (!$stmt->fetch()) {
    fehler_nicht_gefunden('Liga nicht gefunden.');
}

// --- Gesamtanzahl ---
$stmt = $pdo->prepare("SELECT COUNT(*) FROM liga_teilnehmer WHERE liga_id = ?");
$stmt->execute([$liga_id]);
$gesamt = (int) $stmt->fetchColumn();

$paginierung = paginierung_berechnen($seite, $pro_seite, $gesamt);

// --- Rangliste laden ---
$stmt = $pdo->prepare("
    SELECT
        lt.punkte,
        lt.beigetreten_am,
        b.id AS benutzer_id,
        b.benutzername,
        b.spitzname,
        m.dateipfad AS avatar_url
    FROM liga_teilnehmer lt
    JOIN benutzer b ON b.id = lt.benutzer_id
    LEFT JOIN medien m ON m.id = b.media_id
    WHERE lt.liga_id = ?
    ORDER BY lt.punkte DESC, lt.beigetreten_am ASC
    LIMIT ? OFFSET ?
");
$stmt->execute([$liga_id, $paginierung['pro_seite'], $paginierung['offset']]);
$eintraege = $stmt->fetchAll();

// Rang und ist_ich berechnen
$offset = $paginierung['offset'];
foreach ($eintraege as $i => &$e) {
    $e['rang']        = $offset + $i + 1;
    $e['benutzer_id'] = (int) $e['benutzer_id'];
    $e['punkte']      = (int) $e['punkte'];
    $e['ist_ich']     = ($e['benutzer_id'] === $benutzer_id);
    $e['avatar_url']      = $e['avatar_url'] ? OEFFENTLICH_URL . '/' . $e['avatar_url'] : null;
    $e['beste_krone']     = null; // wird unten befuellt
    $e['beste_krone_typ'] = 'standard';
}
unset($e);

// Beste Krone pro Benutzer (nur einmal lesen — try/catch falls Migration fehlt)
try {
    if (!empty($eintraege)) {
        $ids        = array_column($eintraege, 'benutzer_id');
        $platzhalter = implode(',', array_fill(0, count($ids), '?'));
        $krone_stmt  = $pdo->prepare("
            SELECT bk.benutzer_id, bk.rang AS beste_krone, l.krone_typ
            FROM benutzer_kronen bk
            JOIN ligen l ON l.id = bk.liga_id
            WHERE bk.benutzer_id IN ({$platzhalter})
              AND bk.id = (
                  SELECT bk2.id FROM benutzer_kronen bk2
                  WHERE bk2.benutzer_id = bk.benutzer_id
                  ORDER BY bk2.rang ASC, bk2.vergeben_am DESC
                  LIMIT 1
              )
        ");
        $krone_stmt->execute($ids);
        $kronen_map = [];
        foreach ($krone_stmt->fetchAll() as $row) {
            $kronen_map[(int) $row['benutzer_id']] = [
                'rang'      => (int) $row['beste_krone'],
                'krone_typ' => $row['krone_typ'] ?? 'standard',
            ];
        }
        foreach ($eintraege as &$e) {
            $k = $kronen_map[$e['benutzer_id']] ?? null;
            $e['beste_krone']     = $k ? $k['rang']      : null;
            $e['beste_krone_typ'] = $k ? $k['krone_typ'] : 'standard';
        }
        unset($e);
    }
} catch (\Throwable $ex) {
    // Tabelle noch nicht vorhanden — beste_krone bleibt null
}

json_paginiert($eintraege, $paginierung);
