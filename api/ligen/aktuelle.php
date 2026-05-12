<?php
/**
 * API: Ligen — Aktuelle
 *
 * GET /api/ligen/aktuelle.php
 *
 * Aktuelle laufende Liga laden inkl. Teilnahme-Status des Benutzers.
 * Gibt null zurueck wenn keine Liga aktiv ist.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once __DIR__ . '/_ligen_helfer.php';

// --- Methode pruefen ---
methode_erzwingen('GET');

// --- Authentifizierung ---
$benutzer = benutzer_authentifizieren();
$benutzer_id = (int) $benutzer['id'];

$pdo = db_verbindung();

// --- Aktive Liga finden ---
$stmt = $pdo->prepare("
    SELECT id, name, beschreibung, start_datum, end_datum, wiederholung, krone_typ
    FROM ligen
    WHERE aktiv = 1 AND start_datum <= CURDATE() AND end_datum >= CURDATE()
    ORDER BY id DESC
    LIMIT 1
");
$stmt->execute();
$liga = $stmt->fetch();

// --- Auto-Wiederholung: abgelaufene Liga mit Wiederholung pruefen ---
if (!$liga) {
    $stmt = $pdo->prepare("
        SELECT id, name, beschreibung, start_datum, end_datum, wiederholung, krone_typ
        FROM ligen
        WHERE aktiv = 1
          AND wiederholung != 'nein'
          AND end_datum < CURDATE()
        ORDER BY end_datum DESC
        LIMIT 1
    ");
    $stmt->execute();
    $abgelaufene = $stmt->fetch();

    if ($abgelaufene) {
        // Naechsten Zeitraum berechnen
        $start = new DateTimeImmutable($abgelaufene['end_datum']);
        $start = $start->modify('+1 day');

        $intervall_map = [
            'woechentlich'     => 'P7D',
            'zweiwochentlich'  => 'P14D',
            'monatlich'        => 'P1M',
            'jaehrlich'        => 'P1Y',
        ];
        $intervall = $intervall_map[$abgelaufene['wiederholung']] ?? null;

        if ($intervall) {
            $dauer = new DateInterval(
                (new DateTimeImmutable($abgelaufene['start_datum']))->diff(
                    new DateTimeImmutable($abgelaufene['end_datum'])
                )->format('P%yY%mM%dDT%hH%iM%sS')
            );
            // Dauer der alten Liga berechnen
            $alte_start = new DateTimeImmutable($abgelaufene['start_datum']);
            $alte_end   = new DateTimeImmutable($abgelaufene['end_datum']);
            $tage_dauer = (int) $alte_start->diff($alte_end)->days;

            $neues_start = $start;
            $neues_end   = $neues_start->modify("+{$tage_dauer} days");

            // Nur anlegen wenn nicht bereits eine neuere Liga dieses Namens existiert
            $stmt2 = $pdo->prepare("
                SELECT id FROM ligen
                WHERE name = ? AND start_datum = ?
                LIMIT 1
            ");
            $stmt2->execute([$abgelaufene['name'], $neues_start->format('Y-m-d')]);

            if (!$stmt2->fetch()) {
                $stmt2 = $pdo->prepare("
                    INSERT INTO ligen (name, beschreibung, start_datum, end_datum, aktiv, wiederholung, krone_typ)
                    VALUES (?, ?, ?, ?, 1, ?, ?)
                ");
                $stmt2->execute([
                    $abgelaufene['name'],
                    $abgelaufene['beschreibung'],
                    $neues_start->format('Y-m-d'),
                    $neues_end->format('Y-m-d'),
                    $abgelaufene['wiederholung'],
                    $abgelaufene['krone_typ'] ?? 'standard',
                ]);

                // Kronen fuer abgelaufene Liga automatisch vergeben (try/catch fuer den
                // Fall dass die Migration noch nicht ausgefuehrt wurde)
                try {
                    liga_kronen_vergeben($pdo, (int) $abgelaufene['id']);
                } catch (\Throwable $e) {
                    // Tabelle existiert noch nicht — stillschweigend uebergehen
                }

                // Neu angelegte Liga laden
                $neue_id = (int) $pdo->lastInsertId();
                $stmt2 = $pdo->prepare("
                    SELECT id, name, beschreibung, start_datum, end_datum, wiederholung, krone_typ
                    FROM ligen WHERE id = ?
                ");
                $stmt2->execute([$neue_id]);
                $liga = $stmt2->fetch();
            }
        }
    }
}

if (!$liga) {
    json_erfolg([
        'liga' => null,
        'teilnahme' => null,
    ]);
}

$liga_id = (int) $liga['id'];

// --- Teilnehmer-Anzahl ---
$stmt = $pdo->prepare("SELECT COUNT(*) FROM liga_teilnehmer WHERE liga_id = ?");
$stmt->execute([$liga_id]);
$teilnehmer_anzahl = (int) $stmt->fetchColumn();

// --- Eigene Teilnahme ---
$stmt = $pdo->prepare("
    SELECT punkte, beigetreten_am FROM liga_teilnehmer
    WHERE liga_id = ? AND benutzer_id = ?
");
$stmt->execute([$liga_id, $benutzer_id]);
$teilnahme = $stmt->fetch();

$teilnahme_daten = null;
if ($teilnahme) {
    // Rang berechnen
    $stmt = $pdo->prepare("
        SELECT COUNT(*) + 1 FROM liga_teilnehmer
        WHERE liga_id = ? AND punkte > ?
    ");
    $stmt->execute([$liga_id, (int) $teilnahme['punkte']]);
    $rang = (int) $stmt->fetchColumn();

    $teilnahme_daten = [
        'punkte' => (int) $teilnahme['punkte'],
        'rang' => $rang,
        'beigetreten_am' => $teilnahme['beigetreten_am'],
    ];
}

json_erfolg([
    'liga' => [
        'id' => $liga_id,
        'name' => $liga['name'],
        'beschreibung' => $liga['beschreibung'],
        'start_datum' => $liga['start_datum'],
        'end_datum' => $liga['end_datum'],
        'wiederholung' => $liga['wiederholung'] ?? 'nein',
        'krone_typ' => $liga['krone_typ'] ?? 'standard',
        'teilnehmer_anzahl' => $teilnehmer_anzahl,
    ],
    'teilnahme' => $teilnahme_daten,
]);
