<?php
/**
 * API: Admin — Pool-Gewichte (Abfrage-Gewichte)
 *
 * GET  /api/admin/abfrage_gewichte.php  — Alle Stufen-Gewichte laden
 * POST /api/admin/abfrage_gewichte.php  — Gewicht einer Stufe aktualisieren
 *
 * Body (POST): { stufe: int 0-6, gewicht: float >= 0 }
 *
 * Nur fuer Admins.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

// --- Methode pruefen ---
methode_erzwingen(['GET', 'POST']);

// --- Authentifizierung + Autorisierung ---
$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

$pdo = db_verbindung();
$methode = $_SERVER['REQUEST_METHOD'];

if ($methode === 'GET') {
    // --- Alle 7 Stufen-Gewichte laden ---
    $stmt = $pdo->query("
        SELECT stufe, gewicht
        FROM abfrage_gewichte
        ORDER BY stufe ASC
    ");
    $gewichte = $stmt->fetchAll();

    foreach ($gewichte as &$g) {
        $g['stufe']   = (int)   $g['stufe'];
        $g['gewicht'] = (float) $g['gewicht'];
    }
    unset($g);

    json_erfolg($gewichte);

} else {
    // --- POST: Gewicht einer Stufe aktualisieren ---
    $daten = json_body_lesen();
    pflichtfelder_pruefen($daten, ['stufe', 'gewicht']);

    $stufe   = (int)   $daten['stufe'];
    $gewicht = (float) $daten['gewicht'];

    if ($stufe < 0 || $stufe > 6) {
        fehler_ungueltige_eingabe('Stufe muss zwischen 0 und 6 liegen.');
    }
    if ($gewicht < 0) {
        fehler_ungueltige_eingabe('Gewicht darf nicht negativ sein.');
    }

    // Pruefen ob Stufe existiert
    $stmt = $pdo->prepare("SELECT gewicht FROM abfrage_gewichte WHERE stufe = ?");
    $stmt->execute([$stufe]);
    $alter_wert = $stmt->fetchColumn();

    if ($alter_wert === false) {
        fehler_nicht_gefunden("Stufe {$stufe} nicht in abfrage_gewichte gefunden.");
    }

    // Update
    $stmt = $pdo->prepare("UPDATE abfrage_gewichte SET gewicht = ? WHERE stufe = ?");
    $stmt->execute([$gewicht, $stufe]);

    // Aktivitaet loggen
    $stmt = $pdo->prepare("
        INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung, details_json)
        VALUES (?, 'admin_aktion', ?, ?)
    ");
    $details = json_encode([
        'stufe'      => $stufe,
        'alter_wert' => (float) $alter_wert,
        'neuer_wert' => $gewicht,
    ], JSON_UNESCAPED_UNICODE);
    $stmt->execute([
        $benutzer['id'],
        "Pool-Gewicht geaendert: Stufe {$stufe}",
        $details,
    ]);

    json_erfolg(null, "Gewicht fuer Stufe {$stufe} aktualisiert.");
}
