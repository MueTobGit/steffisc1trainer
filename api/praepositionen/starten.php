<?php
/**
 * API: Präpositionen — Session starten
 *
 * POST /api/praepositionen/starten.php
 * Body: { anzahl: 10, typen: ['praep_chunk', 'praep_kategorisierung'], schwierigkeitsgrad: null }
 *
 * Generiert eine gemischte Übungssession aus Lückensätzen und/oder
 * Kategorisierungsaufgaben. Jede Aufgabe erhält 4 Optionen
 * (1 korrekte Präposition + 3 zufällige Distraktoren).
 *
 * Gibt zurück: { sitzung_id, fragen: [...], gesamt }
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

methode_erzwingen('POST');

$benutzer = benutzer_authentifizieren();
$body     = json_body_lesen();

// --- Eingaben ---
$anzahl          = max(5, min(20, (int) ($body['anzahl'] ?? 10)));
$typen           = $body['typen'] ?? ['praep_chunk', 'praep_kategorisierung'];
$schwierigkeit   = isset($body['schwierigkeitsgrad']) && $body['schwierigkeitsgrad'] !== null
    ? (int) $body['schwierigkeitsgrad']
    : null;

$erlaubte_typen = ['praep_chunk', 'praep_kategorisierung'];
$typen = array_values(array_intersect((array) $typen, $erlaubte_typen));
if (empty($typen)) {
    $typen = $erlaubte_typen;
}

$pdo = db_verbindung();

// --- Distraktor-Pool ---
$alle_praepositionen = [
    'i', 'på', 'till', 'från', 'med', 'av', 'om', 'för', 'vid', 'mot', 'efter', 'utan',
    'över', 'under', 'bakom', 'framför', 'bredvid', 'mellan', 'hos', 'genom', 'utanför', 'längs',
    'ur', 'per', 'enligt', 'tills',
];

// --- Chunks laden ---
$chunks_pool = [];
if (in_array('praep_chunk', $typen, true)) {
    $sql  = "SELECT id, schwedisch, loesung, deutsche_uebersetzung FROM praep_chunks WHERE aktiv = 1";
    $bind = [];
    if ($schwierigkeit !== null) {
        $sql  .= " AND schwierigkeitsgrad = ?";
        $bind[] = $schwierigkeit;
    }
    $sql .= " ORDER BY RAND()";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($bind);
    $chunks_pool = $stmt->fetchAll();
}

// --- Kategorisierungsbegriffe laden ---
$kat_pool = [];
if (in_array('praep_kategorisierung', $typen, true)) {
    $sql = "
        SELECT b.id, b.schwedisch, b.deutsch, b.beispielsatz,
               k.praeposition AS loesung, k.merksatz, k.merksatz_uebersetzung
        FROM praep_kategorie_begriffe b
        JOIN praep_kategorien k ON k.id = b.kategorie_id
        WHERE b.aktiv = 1
        ORDER BY RAND()
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute();
    $kat_pool = $stmt->fetchAll();
}

// --- Aufgaben mischen ---
$fragen = [];

// Anteil je Typ
if (count($typen) === 2) {
    $anz_chunk = (int) round($anzahl * 0.5);
    $anz_kat   = $anzahl - $anz_chunk;
} elseif (in_array('praep_chunk', $typen, true)) {
    $anz_chunk = $anzahl;
    $anz_kat   = 0;
} else {
    $anz_chunk = 0;
    $anz_kat   = $anzahl;
}

// Chunks
foreach (array_slice($chunks_pool, 0, $anz_chunk) as $chunk) {
    $optionen = _optionen_generieren($chunk['loesung'], $alle_praepositionen);
    $fragen[] = [
        'typ'          => 'praep_chunk',
        'id'           => (int) $chunk['id'],
        'satz'         => $chunk['schwedisch'],
        'loesung'      => $chunk['loesung'],
        'optionen'     => $optionen,
        'uebersetzung' => $chunk['deutsche_uebersetzung'] ?? '',
    ];
}

// Kategorisierungsbegriffe
foreach (array_slice($kat_pool, 0, $anz_kat) as $eintrag) {
    $optionen = _optionen_generieren($eintrag['loesung'], $alle_praepositionen);
    $fragen[] = [
        'typ'                  => 'praep_kategorisierung',
        'id'                   => (int) $eintrag['id'],
        'schwedisch'           => $eintrag['schwedisch'],
        'deutsch'              => $eintrag['deutsch'] ?? '',
        'beispielsatz'         => $eintrag['beispielsatz'] ?? '',
        'loesung'              => $eintrag['loesung'],
        'optionen'             => $optionen,
        'merksatz'             => $eintrag['merksatz'] ?? '',
        'merksatz_uebersetzung'=> $eintrag['merksatz_uebersetzung'] ?? '',
    ];
}

// Fragen mischen (Chunks und Kat-Aufgaben durchmengen)
shuffle($fragen);

if (empty($fragen)) {
    fehler_ungueltige_eingabe('Keine Aufgaben verfügbar. Bitte zuerst Daten importieren.');
}

// --- Sitzung anlegen ---
$stmt = $pdo->prepare("
    INSERT INTO trainings_sitzungen (benutzer_id, anzahl_fragen, anzahl_richtig, xp_verdient, typ)
    VALUES (?, 0, 0, 0, 'schnell')
");
$stmt->execute([$benutzer['id']]);
$sitzung_id = (int) $pdo->lastInsertId();

// --- Antwort ---
json_erfolg([
    'sitzung_id' => $sitzung_id,
    'fragen'     => $fragen,
    'gesamt'     => count($fragen),
]);

// --- Hilfsfunktion: 4 Optionen generieren ---
function _optionen_generieren(string $loesung, array $alle): array
{
    $distraktoren = array_values(array_filter($alle, fn($p) => $p !== $loesung));
    shuffle($distraktoren);
    $distraktoren = array_slice($distraktoren, 0, 3);

    $optionen = array_merge([$loesung], $distraktoren);
    shuffle($optionen);

    return $optionen;
}
