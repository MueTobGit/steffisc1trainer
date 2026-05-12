<?php
/**
 * API: Vokabeln — Statistik
 *
 * GET /api/vokabeln/statistik.php
 *
 * Admin-Uebersicht: Zaehler pro Wortart, Niveau, Kategorie.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';

// --- Methode pruefen ---
methode_erzwingen('GET');

// --- Authentifizierung + Autorisierung ---
$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

$pdo = db_verbindung();

// --- Gesamt ---
$stmt = $pdo->query('SELECT COUNT(*) FROM vokabeln WHERE aktiv = 1');
$gesamt = (int) $stmt->fetchColumn();

$stmt = $pdo->query('SELECT COUNT(*) FROM vokabeln WHERE aktiv = 0');
$deaktiviert = (int) $stmt->fetchColumn();

// --- Pro Wortart ---
$stmt = $pdo->query("
    SELECT wortart, COUNT(*) AS anzahl
    FROM vokabeln
    WHERE aktiv = 1
    GROUP BY wortart
    ORDER BY anzahl DESC
");
$pro_wortart = $stmt->fetchAll();

foreach ($pro_wortart as &$w) {
    $w['anzahl'] = (int) $w['anzahl'];
}
unset($w);

// --- Pro Sprachniveau ---
$stmt = $pdo->query("
    SELECT sprachniveau, COUNT(*) AS anzahl
    FROM vokabeln
    WHERE aktiv = 1
    GROUP BY sprachniveau
    ORDER BY sprachniveau ASC
");
$pro_niveau = $stmt->fetchAll();

foreach ($pro_niveau as &$n) {
    $n['anzahl'] = (int) $n['anzahl'];
}
unset($n);

// --- Pro Kategorie (Top 15) ---
$stmt = $pdo->query("
    SELECT
        k.id,
        k.name,
        COUNT(v.id) AS anzahl
    FROM kategorien k
    LEFT JOIN vokabeln v ON v.kategorie_id = k.id AND v.aktiv = 1
    WHERE k.aktiv = 1
    GROUP BY k.id, k.name
    ORDER BY anzahl DESC
    LIMIT 15
");
$pro_kategorie = $stmt->fetchAll();

foreach ($pro_kategorie as &$k) {
    $k['id'] = (int) $k['id'];
    $k['anzahl'] = (int) $k['anzahl'];
}
unset($k);

// --- Formen-Statistik ---
$stmt = $pdo->query('SELECT COUNT(*) FROM vokabel_formen');
$formen_gesamt = (int) $stmt->fetchColumn();

$stmt = $pdo->query('SELECT COUNT(*) FROM synonyme');
$synonyme_gesamt = (int) $stmt->fetchColumn();

$stmt = $pdo->query('SELECT COUNT(*) FROM saetze WHERE aktiv = 1');
$saetze_gesamt = (int) $stmt->fetchColumn();

// --- Ohne Formen ---
$stmt = $pdo->query("
    SELECT COUNT(*) FROM vokabeln v
    WHERE v.aktiv = 1
    AND v.wortart IN ('Nomen', 'Verb', 'Adjektiv')
    AND NOT EXISTS (SELECT 1 FROM vokabel_formen vf WHERE vf.vokabel_id = v.id)
");
$ohne_formen = (int) $stmt->fetchColumn();

json_erfolg([
    'gesamt' => $gesamt,
    'deaktiviert' => $deaktiviert,
    'pro_wortart' => $pro_wortart,
    'pro_sprachniveau' => $pro_niveau,
    'pro_kategorie' => $pro_kategorie,
    'formen_gesamt' => $formen_gesamt,
    'synonyme_gesamt' => $synonyme_gesamt,
    'saetze_gesamt' => $saetze_gesamt,
    'ohne_formen' => $ohne_formen,
]);
