<?php
/**
 * API: Training — Interferenz prüfen
 *
 * GET /api/training/interferenz_pruefen.php
 *
 * Prüft ob der Benutzer heute schon eine Übung gestartet hat
 * und ob ein Interferenz-Hinweis angezeigt werden soll.
 *
 * Regel: Wenn fällige Vokabeln > Tageslimit_neue * 5, wird ein Hinweis empfohlen.
 *
 * Antwort: { faellige_anzahl, tages_limit, faktor, basis, interferenz_warnung, eine_stufe_niedriger }
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__, 2) . '/konfiguration/konstanten.php';

// --- Methode pruefen ---
methode_erzwingen('GET');

// --- Authentifizierung ---
$benutzer = benutzer_authentifizieren();
$pdo = db_verbindung();

// --- Basis-Werte laden ---
$basis = (int) konfig_wert('neue_vokabeln_pro_tag', '10');
$faktor = 100;

try {
    $stmt = $pdo->prepare("SELECT neue_vokabeln_faktor FROM benutzer WHERE id = ?");
    $stmt->execute([$benutzer['id']]);
    $val = $stmt->fetchColumn();
    if ($val !== false) $faktor = (int) $val;
} catch (\Throwable $e) {
    try {
        $stmt2 = $pdo->prepare("SELECT neue_vokabeln_bonus FROM benutzer WHERE id = ?");
        $stmt2->execute([$benutzer['id']]);
        $bonus = (int) ($stmt2->fetchColumn() ?: 0);
        $faktor = $bonus === 20 ? 300 : ($bonus === 10 ? 200 : 100);
    } catch (\Throwable $e2) {}
}

$tages_limit = max(1, (int) round($basis * $faktor / 100));

// --- Fällige Vokabeln zählen (DS-Richtung, heute oder früher fällig) ---
$stmt = $pdo->prepare("
    SELECT COUNT(DISTINCT vokabel_id)
    FROM fortschritt
    WHERE benutzer_id = ?
      AND richtung = 'DS'
      AND naechste_wiederholung <= CURDATE()
      AND stufe >= 1
");
$stmt->execute([$benutzer['id']]);
$faellige_anzahl = (int) $stmt->fetchColumn();

// --- Interferenz-Warnung? ---
$schwelle = $tages_limit * 5;
$interferenz_warnung = $faellige_anzahl > $schwelle;

// --- Eine Stufe niedriger berechnen ---
$faktor_stufen = [50, 100, 200, 300];
$aktueller_index = array_search($faktor, $faktor_stufen);
$eine_stufe_niedriger = null;
if ($aktueller_index !== false && $aktueller_index > 0) {
    $niedrigerer_faktor = $faktor_stufen[$aktueller_index - 1];
    $eine_stufe_niedriger = [
        'faktor' => $niedrigerer_faktor,
        'limit'  => max(1, (int) round($basis * $niedrigerer_faktor / 100)),
    ];
}

json_erfolg([
    'faellige_anzahl'      => $faellige_anzahl,
    'tages_limit'          => $tages_limit,
    'faktor'               => $faktor,
    'basis'                => $basis,
    'interferenz_warnung'  => $interferenz_warnung,
    'eine_stufe_niedriger' => $eine_stufe_niedriger,
]);
