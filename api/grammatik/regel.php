<?php
/**
 * API: Grammatik — Regel suchen
 *
 * GET /api/grammatik/regel.php?wortart=&genus_gruppe=&form_bezeichnung=
 *
 * Gibt genau eine passende Grammatikregel zurück (inkl. formen-Array),
 * oder null wenn keine Übereinstimmung.
 *
 * Lookup erfolgt über die Junction-Tabelle grammatik_regel_formen.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

methode_erzwingen('GET');

$benutzer = benutzer_authentifizieren();

$wortart          = trim(get_param('wortart')          ?? '');
$genus_gruppe     = trim(get_param('genus_gruppe')     ?? '');
$form_bezeichnung = trim(get_param('form_bezeichnung') ?? '');

if (!$wortart || !$genus_gruppe || !$form_bezeichnung) {
    fehler_ungueltige_eingabe('wortart, genus_gruppe und form_bezeichnung sind erforderlich.');
}

$pdo = db_verbindung();

$stmt = $pdo->prepare("
    SELECT gr.id, gr.wortart, gr.genus_gruppe, gr.regel, gr.regeltext, gr.reihenfolge,
           gr.erstellt_am, gr.aktualisiert_am
    FROM grammatik_regeln gr
    JOIN grammatik_regel_formen grf ON grf.regel_id = gr.id
    WHERE gr.wortart = ? AND gr.genus_gruppe = ? AND grf.form_bezeichnung = ?
    LIMIT 1
");
$stmt->execute([$wortart, $genus_gruppe, $form_bezeichnung]);
$regel = $stmt->fetch(PDO::FETCH_ASSOC);

if ($regel) {
    $regel['id']          = (int) $regel['id'];
    $regel['reihenfolge'] = (int) $regel['reihenfolge'];

    // formen-Array laden
    $f_stmt = $pdo->prepare("
        SELECT form_bezeichnung FROM grammatik_regel_formen
        WHERE regel_id = ? ORDER BY form_bezeichnung ASC
    ");
    $f_stmt->execute([$regel['id']]);
    $regel['formen'] = $f_stmt->fetchAll(PDO::FETCH_COLUMN);
} else {
    $regel = null;
}

json_erfolg(['regel' => $regel]);
