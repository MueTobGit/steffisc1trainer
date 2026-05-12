<?php
/**
 * API: Admin — Level fuer alle Benutzer neu berechnen
 *
 * POST /api/admin/level_neu_berechnen.php
 *
 * Berechnet das globale Level aller Benutzer anhand der aktuellen
 * Schwellen in level_konfiguration neu und aktualisiert benutzer_statistik.
 *
 * Nur fuer Admins.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__, 2) . '/konfiguration/lern_algorithmus.php';

methode_erzwingen(['POST']);

$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

$pdo = db_verbindung();

// Level-Konfiguration laden
$lk = level_konfiguration_laden($pdo);

// Fuer jeden Benutzer: Vokabeln auf level_aufstieg_stufe+ zaehlen + Level berechnen
$lernpfad_schwelle = (int) konfig_wert('level_aufstieg_stufe', '3');
$stmt = $pdo->query("
    SELECT
        b.id AS benutzer_id,
        COALESCE(bs.globales_level, 1) AS altes_level,
        COALESCE(
            (SELECT COUNT(*) FROM fortschritt f WHERE f.benutzer_id = b.id AND f.stufe >= {$lernpfad_schwelle}),
            0
        ) AS auf_stufe3plus
    FROM benutzer b
    LEFT JOIN benutzer_statistik bs ON bs.benutzer_id = b.id
");

$alle = $stmt->fetchAll();

$aktualisiert = 0;
$geaendert    = 0;

$update_stmt = $pdo->prepare("
    UPDATE benutzer_statistik
    SET globales_level = ?
    WHERE benutzer_id = ?
");

foreach ($alle as $zeile) {
    $neues_level = level_berechnen((int) $zeile['auf_stufe3plus'], $lk);
    $altes_level = (int) $zeile['altes_level'];

    $update_stmt->execute([$neues_level, $zeile['benutzer_id']]);
    $aktualisiert++;

    if ($neues_level !== $altes_level) {
        $geaendert++;
    }
}

// Aktivitaet loggen
$log_stmt = $pdo->prepare("
    INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung, details_json)
    VALUES (?, 'admin_aktion', ?, ?)
");
$log_stmt->execute([
    $benutzer['id'],
    "Level fuer alle Benutzer neu berechnet",
    json_encode([
        'aktualisiert' => $aktualisiert,
        'geaendert'    => $geaendert,
    ], JSON_UNESCAPED_UNICODE),
]);

json_erfolg([
    'aktualisiert' => $aktualisiert,
    'geaendert'    => $geaendert,
], "Level fuer {$aktualisiert} Benutzer neu berechnet, {$geaendert} geaendert.");
