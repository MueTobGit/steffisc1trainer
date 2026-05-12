<?php
/**
 * API: Favoriten — Laden
 *
 * GET /api/favoriten/laden.php
 * GET /api/favoriten/laden.php?details=1&seite=1&pro_seite=20
 *
 * details=0 (Standard): Gibt nur Vokabel-IDs zurueck.
 * details=1: Gibt volle Vokabeln mit Formen zurueck (paginiert).
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

// --- Methode pruefen ---
methode_erzwingen('GET');

// --- Authentifizierung ---
$benutzer = benutzer_authentifizieren();

$pdo = db_verbindung();

// --- Modus: IDs oder Details ---
$details = get_param('details', '0') === '1';

if (!$details) {
    // ============================
    // Modus A: Nur IDs zurueckgeben
    // ============================
    $stmt = $pdo->prepare("
        SELECT bf.vokabel_id
        FROM benutzer_favoriten bf
        JOIN vokabeln v ON v.id = bf.vokabel_id AND v.aktiv = 1
        WHERE bf.benutzer_id = ?
        ORDER BY bf.erstellt_am DESC
    ");
    $stmt->execute([$benutzer['id']]);

    $ids = [];
    while ($zeile = $stmt->fetch()) {
        $ids[] = (int) $zeile['vokabel_id'];
    }

    json_erfolg($ids);
}

// ============================
// Modus B: Volle Vokabeln mit Formen (paginiert)
// ============================
[$seite, $pro_seite] = paginierung_parameter();

// --- Gesamtzahl ---
$stmt = $pdo->prepare("
    SELECT COUNT(*)
    FROM benutzer_favoriten bf
    JOIN vokabeln v ON v.id = bf.vokabel_id AND v.aktiv = 1
    WHERE bf.benutzer_id = ?
");
$stmt->execute([$benutzer['id']]);
$gesamt = (int) $stmt->fetchColumn();

$paginierung = paginierung_berechnen($seite, $pro_seite, $gesamt);

// --- Vokabeln laden ---
$offset = ($seite - 1) * $pro_seite;

$stmt = $pdo->prepare("
    SELECT
        v.id,
        v.englisch,
        v.deutsch,
        v.wortart,
        v.sprachniveau,
        v.notizen,
        v.kategorie_id,
        k.name AS kategorie_name
    FROM benutzer_favoriten bf
    JOIN vokabeln v ON v.id = bf.vokabel_id AND v.aktiv = 1
    LEFT JOIN kategorien k ON k.id = v.kategorie_id
    WHERE bf.benutzer_id = ?
    ORDER BY bf.erstellt_am DESC
    LIMIT ? OFFSET ?
");
$stmt->execute([$benutzer['id'], $pro_seite, $offset]);
$vokabeln = $stmt->fetchAll();

// --- Typ-Casting ---
foreach ($vokabeln as &$v) {
    $v['id'] = (int) $v['id'];
    $v['kategorie_id'] = $v['kategorie_id'] !== null ? (int) $v['kategorie_id'] : null;
}
unset($v);

json_paginiert($vokabeln, $paginierung);

