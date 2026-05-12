<?php
/**
 * API: Präpositionen — Kategorien & Begriffe CRUD
 *
 * GET    /api/praepositionen/kategorien.php               → Alle Kategorien mit Begriffen
 * POST   /api/praepositionen/kategorien.php               → Kategorie oder Begriff erstellen (Admin)
 *   Body für Kategorie: { typ: 'kategorie', name, praeposition, merksatz?, merksatz_uebersetzung?, reihenfolge? }
 *   Body für Begriff:   { typ: 'begriff', kategorie_id, schwedisch, deutsch?, beispielsatz? }
 * PUT    /api/praepositionen/kategorien.php?id=X&typ=kategorie|begriff → Aktualisieren (Admin)
 * DELETE /api/praepositionen/kategorien.php?id=X&typ=kategorie|begriff → Löschen (Admin)
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

methode_erzwingen(['GET', 'POST', 'PUT', 'DELETE']);

$benutzer = benutzer_authentifizieren();
$methode  = $_SERVER['REQUEST_METHOD'];

if (in_array($methode, ['POST', 'PUT', 'DELETE'], true) && $benutzer['rolle'] !== 'admin') {
    fehler_nicht_berechtigt();
}

$pdo = db_verbindung();

// ---- GET — Alle Kategorien mit Begriffen ----
if ($methode === 'GET') {
    $stmt = $pdo->query("SELECT * FROM praep_kategorien ORDER BY reihenfolge, id");
    $kategorien = $stmt->fetchAll();

    $stmt2 = $pdo->query("SELECT * FROM praep_kategorie_begriffe ORDER BY id");
    $alle_begriffe = $stmt2->fetchAll();

    // Begriffe den Kategorien zuordnen
    $begriffe_map = [];
    foreach ($alle_begriffe as $b) {
        $kid = (int) $b['kategorie_id'];
        if (!isset($begriffe_map[$kid])) {
            $begriffe_map[$kid] = [];
        }
        $b['aktiv'] = (bool) $b['aktiv'];
        $begriffe_map[$kid][] = $b;
    }

    foreach ($kategorien as &$kat) {
        $kat['begriffe'] = $begriffe_map[(int) $kat['id']] ?? [];
    }
    unset($kat);

    json_erfolg([
        'kategorien' => $kategorien,
        'gesamt_kategorien' => count($kategorien),
        'gesamt_begriffe' => count($alle_begriffe),
    ]);
}

// ---- POST (erstellen) ----
if ($methode === 'POST') {
    $body = json_body_lesen();
    $typ  = $body['typ'] ?? '';

    if ($typ === 'kategorie') {
        $name     = trim($body['name'] ?? '');
        $praep    = trim($body['praeposition'] ?? '');
        $merksatz = trim($body['merksatz'] ?? '');
        $merksatz_sv = trim($body['merksatz_uebersetzung'] ?? '');
        $reihenfolge = (int) ($body['reihenfolge'] ?? 0);

        if ($name === '' || $praep === '') {
            fehler_ungueltige_eingabe('name und praeposition sind Pflichtfelder.');
        }

        $stmt = $pdo->prepare("
            INSERT INTO praep_kategorien (name, praeposition, merksatz, merksatz_uebersetzung, reihenfolge)
            VALUES (?, ?, ?, ?, ?)
        ");
        $stmt->execute([$name, $praep, $merksatz ?: null, $merksatz_sv ?: null, $reihenfolge]);

        json_erfolg(['id' => (int) $pdo->lastInsertId()], 'Kategorie erstellt.', 201);
    }

    if ($typ === 'begriff') {
        $kat_id  = (int) ($body['kategorie_id'] ?? 0);
        $svensk  = trim($body['schwedisch'] ?? '');
        $deutsch = trim($body['deutsch'] ?? '');
        $beispiel = trim($body['beispielsatz'] ?? '');

        if ($kat_id <= 0 || $svensk === '') {
            fehler_ungueltige_eingabe('kategorie_id und schwedisch sind Pflichtfelder.');
        }

        // Kategorie muss existieren
        $check = $pdo->prepare("SELECT id FROM praep_kategorien WHERE id = ?");
        $check->execute([$kat_id]);
        if (!$check->fetch()) {
            fehler_nicht_gefunden('Kategorie nicht gefunden.');
        }

        $stmt = $pdo->prepare("
            INSERT INTO praep_kategorie_begriffe (kategorie_id, schwedisch, deutsch, beispielsatz)
            VALUES (?, ?, ?, ?)
        ");
        $stmt->execute([$kat_id, $svensk, $deutsch ?: null, $beispiel ?: null]);

        json_erfolg(['id' => (int) $pdo->lastInsertId()], 'Begriff erstellt.', 201);
    }

    fehler_ungueltige_eingabe('typ muss "kategorie" oder "begriff" sein.');
}

// ---- PUT (aktualisieren) ----
if ($methode === 'PUT') {
    $id  = get_param_int('id');
    $typ = get_param('typ', '');
    if ($id <= 0) {
        fehler_ungueltige_eingabe('id fehlt.');
    }

    $body = json_body_lesen();

    if ($typ === 'kategorie') {
        $felder = [];
        $bind   = [];

        if (isset($body['name'])) {
            $felder[] = 'name = ?';
            $bind[]   = trim($body['name']);
        }
        if (isset($body['praeposition'])) {
            $felder[] = 'praeposition = ?';
            $bind[]   = trim($body['praeposition']);
        }
        if (isset($body['merksatz'])) {
            $felder[] = 'merksatz = ?';
            $bind[]   = trim($body['merksatz']) ?: null;
        }
        if (isset($body['merksatz_uebersetzung'])) {
            $felder[] = 'merksatz_uebersetzung = ?';
            $bind[]   = trim($body['merksatz_uebersetzung']) ?: null;
        }
        if (isset($body['reihenfolge'])) {
            $felder[] = 'reihenfolge = ?';
            $bind[]   = (int) $body['reihenfolge'];
        }

        if (empty($felder)) {
            fehler_ungueltige_eingabe('Keine Felder zum Aktualisieren.');
        }

        $bind[] = $id;
        $pdo->prepare("UPDATE praep_kategorien SET " . implode(', ', $felder) . " WHERE id = ?")
            ->execute($bind);

        json_erfolg(null, 'Kategorie aktualisiert.');
    }

    if ($typ === 'begriff') {
        $felder = [];
        $bind   = [];

        if (isset($body['schwedisch'])) {
            $felder[] = 'schwedisch = ?';
            $bind[]   = trim($body['schwedisch']);
        }
        if (isset($body['deutsch'])) {
            $felder[] = 'deutsch = ?';
            $bind[]   = trim($body['deutsch']) ?: null;
        }
        if (isset($body['beispielsatz'])) {
            $felder[] = 'beispielsatz = ?';
            $bind[]   = trim($body['beispielsatz']) ?: null;
        }
        if (isset($body['aktiv'])) {
            $felder[] = 'aktiv = ?';
            $bind[]   = (int) (bool) $body['aktiv'];
        }

        if (empty($felder)) {
            fehler_ungueltige_eingabe('Keine Felder zum Aktualisieren.');
        }

        $bind[] = $id;
        $pdo->prepare("UPDATE praep_kategorie_begriffe SET " . implode(', ', $felder) . " WHERE id = ?")
            ->execute($bind);

        json_erfolg(null, 'Begriff aktualisiert.');
    }

    fehler_ungueltige_eingabe('typ muss "kategorie" oder "begriff" sein.');
}

// ---- DELETE ----
if ($methode === 'DELETE') {
    $id  = get_param_int('id');
    $typ = get_param('typ', '');
    if ($id <= 0) {
        fehler_ungueltige_eingabe('id fehlt.');
    }

    if ($typ === 'kategorie') {
        // CASCADE löscht Begriffe automatisch
        $pdo->prepare("DELETE FROM praep_kategorien WHERE id = ?")->execute([$id]);
        json_erfolg(null, 'Kategorie gelöscht.');
    }

    if ($typ === 'begriff') {
        $pdo->prepare("DELETE FROM praep_kategorie_begriffe WHERE id = ?")->execute([$id]);
        json_erfolg(null, 'Begriff gelöscht.');
    }

    fehler_ungueltige_eingabe('typ muss "kategorie" oder "begriff" sein.');
}
