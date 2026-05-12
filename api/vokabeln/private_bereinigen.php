<?php
/**
 * API: Vokabeln — Private Vokabeln bereinigen
 *
 * Findet private Vokabeln, die eine oeffentliche Vokabel mit gleichem
 * schwedischen Wort und gleicher Wortart duplizieren (z.B. nach CSV-Import
 * mit Modus "Beide behalten"). Nur Admins.
 *
 * GET  /api/vokabeln/private_bereinigen.php
 *      Gibt alle solchen Duplikate zurueck, gruppiert nach Benutzer.
 *
 * DELETE /api/vokabeln/private_bereinigen.php
 *      Body: { ids: [1, 2, 3] }
 *      Loescht die angegebenen privaten Vokabeln (nur wenn ist_privat=1).
 *      Gibt Anzahl geloeschter Eintraege zurueck.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';

methode_erzwingen(['GET', 'DELETE']);

$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

$pdo     = db_verbindung();
$methode = $_SERVER['REQUEST_METHOD'];

// ─────────────────────────────────────────────────────────────────────────────
// GET — Private Duplikate finden
// ─────────────────────────────────────────────────────────────────────────────
if ($methode === 'GET') {

    // Private Vokabeln, fuer die eine oeffentliche Vokabel mit gleichem
    // schwedischen Wort + Wortart existiert
    $stmt = $pdo->query("
        SELECT
            priv.id,
            priv.schwedisch,
            priv.deutsch       AS priv_deutsch,
            priv.wortart,
            priv.sprachniveau,
            priv.erstellt_am,
            priv.besitzer_id,
            b.benutzername,
            pub.id             AS pub_id,
            pub.deutsch        AS pub_deutsch,
            COUNT(DISTINCT f.benutzer_id) AS nutzer_mit_lernstand
        FROM vokabeln priv
        JOIN vokabeln pub
            ON  LOWER(priv.schwedisch) = LOWER(pub.schwedisch)
            AND priv.wortart           = pub.wortart
            AND pub.ist_privat         = 0
        LEFT JOIN benutzer b ON b.id = priv.besitzer_id
        LEFT JOIN fortschritt f ON f.vokabel_id = priv.id
        WHERE priv.ist_privat = 1
        GROUP BY
            priv.id, priv.schwedisch, priv.deutsch, priv.wortart,
            priv.sprachniveau, priv.erstellt_am, priv.besitzer_id,
            b.benutzername, pub.id, pub.deutsch
        ORDER BY b.benutzername ASC, LOWER(priv.schwedisch) ASC
    ");

    $zeilen = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Nach Benutzer gruppieren
    $nach_benutzer = [];
    foreach ($zeilen as $z) {
        $uid = (int) $z['besitzer_id'];
        if (!isset($nach_benutzer[$uid])) {
            $nach_benutzer[$uid] = [
                'benutzer_id'   => $uid,
                'benutzername'  => $z['benutzername'] ?? 'Unbekannt',
                'vokabeln'      => [],
            ];
        }
        $nach_benutzer[$uid]['vokabeln'][] = [
            'id'                  => (int) $z['id'],
            'schwedisch'          => $z['schwedisch'],
            'priv_deutsch'        => $z['priv_deutsch'],
            'wortart'             => $z['wortart'],
            'sprachniveau'        => $z['sprachniveau'],
            'erstellt_am'         => $z['erstellt_am'],
            'pub_id'              => (int) $z['pub_id'],
            'pub_deutsch'         => $z['pub_deutsch'],
            'nutzer_mit_lernstand'=> (int) $z['nutzer_mit_lernstand'],
        ];
    }

    json_erfolg([
        'gruppen' => array_values($nach_benutzer),
        'gesamt'  => count($zeilen),
    ], sprintf(
        '%d private Duplikat-Vokabel(n) gefunden.',
        count($zeilen)
    ));
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE — Private Vokabeln loeschen
// ─────────────────────────────────────────────────────────────────────────────
if ($methode === 'DELETE') {

    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $ids  = is_array($body['ids'] ?? null) ? array_map('intval', $body['ids']) : [];

    if (empty($ids)) {
        fehler_ungueltige_eingabe('Keine IDs angegeben.');
    }

    // Nur echte private Vokabeln loeschen (Sicherheitscheck)
    $platzhalter = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $pdo->prepare("
        DELETE FROM vokabeln
        WHERE id IN ($platzhalter) AND ist_privat = 1
    ");
    $stmt->execute($ids);
    $geloescht = $stmt->rowCount();

    json_erfolg([
        'geloescht' => $geloescht,
    ], sprintf('%d private Vokabel(n) geloescht.', $geloescht));
}
