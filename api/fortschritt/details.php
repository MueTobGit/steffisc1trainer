<?php
/**
 * API: Fortschritt — Details (paginiert)
 *
 * GET /api/fortschritt/details.php?seite=1&pro_seite=20
 * GET /api/fortschritt/details.php?zustand=lernen&richtung=DS&vokabel_id=123
 *
 * Einzelne Vokabel-Fortschritte mit Filtern.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

// --- Methode pruefen ---
methode_erzwingen('GET');

// --- Authentifizierung ---
$benutzer = benutzer_authentifizieren();

$pdo = db_verbindung();

// --- Filter ---
$zustand_filter = get_param('zustand');
$richtung_filter = get_param('richtung');
$vokabel_id_filter = get_param_int('vokabel_id', 0);
$stufe_filter = get_param('stufe');  // neu: exakter Stufen-Filter fuer Balken-Klick

// --- WHERE-Bedingungen aufbauen ---
$bedingungen = ['f.benutzer_id = ?'];
$params = [$benutzer['id']];

if ($zustand_filter && in_array($zustand_filter, ['neu', 'lernen', 'wiederholung', 'gelernt'], true)) {
    $bedingungen[] = 'f.zustand = ?';
    $params[] = $zustand_filter;
}

if ($richtung_filter && in_array($richtung_filter, ['DE', 'ED'], true)) {
    $bedingungen[] = 'f.richtung = ?';
    $params[] = $richtung_filter;
}

if ($vokabel_id_filter > 0) {
    $bedingungen[] = 'f.vokabel_id = ?';
    $params[] = $vokabel_id_filter;
}

if ($stufe_filter !== null && $stufe_filter !== '' && ctype_digit($stufe_filter) && (int)$stufe_filter >= 0 && (int)$stufe_filter <= 6) {
    $bedingungen[] = 'f.stufe = ?';
    $params[] = (int) $stufe_filter;
}

$where = implode(' AND ', $bedingungen);

// --- Gesamtzahl ---
$stmt = $pdo->prepare("SELECT COUNT(*) FROM fortschritt f WHERE {$where}");
$stmt->execute($params);
$gesamt = (int) $stmt->fetchColumn();

// --- Paginierung ---
[$seite, $pro_seite] = paginierung_parameter();
$paginierung = paginierung_berechnen($seite, $pro_seite, $gesamt);
$offset = ($seite - 1) * $pro_seite;

// --- Daten laden ---
$stmt = $pdo->prepare("
    SELECT
        f.id,
        f.vokabel_id,
        f.richtung,
        f.stufe,
        f.zustand,
        f.leichtigkeitsfaktor,
        f.wiederholungen,
        f.intervall_tage,
        f.naechste_wiederholung,
        f.richtig_gesamt,
        f.falsch_gesamt,
        f.aktualisiert_am,
        v.englisch,
        v.deutsch,
        v.wortart,
        v.sprachniveau,
        CASE WHEN bf.vokabel_id IS NOT NULL THEN 1 ELSE 0 END AS ist_favorit
    FROM fortschritt f
    JOIN vokabeln v ON v.id = f.vokabel_id
    LEFT JOIN benutzer_favoriten bf ON bf.vokabel_id = f.vokabel_id AND bf.benutzer_id = f.benutzer_id
    WHERE {$where}
    ORDER BY f.naechste_wiederholung ASC, f.aktualisiert_am DESC
    LIMIT ? OFFSET ?
");
$alle_params = array_merge($params, [$pro_seite, $offset]);
$stmt->execute($alle_params);
$eintraege = $stmt->fetchAll();

// --- Typ-Casting ---
foreach ($eintraege as &$e) {
    $e['id'] = (int) $e['id'];
    $e['vokabel_id'] = (int) $e['vokabel_id'];
    $e['stufe'] = (int) $e['stufe'];
    $e['leichtigkeitsfaktor'] = round((float) $e['leichtigkeitsfaktor'], 4);
    $e['wiederholungen'] = (int) $e['wiederholungen'];
    $e['intervall_tage'] = (int) $e['intervall_tage'];
    $e['richtig_gesamt'] = (int) $e['richtig_gesamt'];
    $e['falsch_gesamt'] = (int) $e['falsch_gesamt'];
    $e['ist_favorit'] = (bool) $e['ist_favorit'];
}
unset($e);

json_paginiert($eintraege, $paginierung);
