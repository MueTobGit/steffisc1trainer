<?php
/**
 * API: Training — Interferenz prüfen
 *
 * GET /api/training/interferenz_pruefen.php
 *
 * Prüft ob der Benutzer heute schon eine Übung gestartet hat
 * und ob ein Interferenz-Hinweis angezeigt werden soll.
 *
 * Regel: Wenn fällige Vokabeln > neue_vokabeln_pro_tag * 5, wird ein Hinweis empfohlen.
 *
 * Antwort: { faellige_anzahl, tages_limit, interferenz_warnung }
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__, 2) . '/konfiguration/konstanten.php';

methode_erzwingen('GET');
$benutzer = benutzer_authentifizieren();
$pdo = db_verbindung();

// Tages-Limit aus Benutzer-Einstellung (0 = unbegrenzt)
$stmt = $pdo->prepare("SELECT neue_vokabeln_pro_tag FROM benutzer WHERE id = ?");
$stmt->execute([$benutzer['id']]);
$neue_vokabeln_pro_tag = (int) $stmt->fetchColumn();

$tages_limit = $neue_vokabeln_pro_tag === 0 ? PHP_INT_MAX : $neue_vokabeln_pro_tag;

// Fällige Vokabeln zählen (DE-Richtung, heute oder früher fällig)
$stmt = $pdo->prepare("
    SELECT COUNT(DISTINCT vokabel_id)
    FROM fortschritt
    WHERE benutzer_id = ?
      AND richtung = 'DE'
      AND naechste_wiederholung <= CURDATE()
      AND stufe >= 1
");
$stmt->execute([$benutzer['id']]);
$faellige_anzahl = (int) $stmt->fetchColumn();

$interferenz_warnung = $tages_limit !== PHP_INT_MAX && $faellige_anzahl > $tages_limit * 5;

json_erfolg([
    'faellige_anzahl'     => $faellige_anzahl,
    'tages_limit'         => $neue_vokabeln_pro_tag,
    'interferenz_warnung' => $interferenz_warnung,
]);
