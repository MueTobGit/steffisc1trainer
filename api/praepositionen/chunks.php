<?php
/**
 * API: Präpositionen — Chunk-CRUD
 *
 * GET    /api/praepositionen/chunks.php        → Liste aller Chunks
 * GET    /api/praepositionen/chunks.php?id=X   → Einzelner Chunk
 * POST   /api/praepositionen/chunks.php        → Neu erstellen (Admin)
 * PUT    /api/praepositionen/chunks.php?id=X   → Aktualisieren (Admin)
 * DELETE /api/praepositionen/chunks.php?id=X   → Löschen (Admin)
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';

methode_erzwingen(['GET', 'POST', 'PUT', 'DELETE']);

$benutzer = benutzer_authentifizieren();
$methode  = $_SERVER['REQUEST_METHOD'];

// Schreiboperationen nur für Admins
if (in_array($methode, ['POST', 'PUT', 'DELETE'], true) && $benutzer['rolle'] !== 'admin') {
    fehler_nicht_berechtigt();
}

$pdo = db_verbindung();

// ---- GET ----
if ($methode === 'GET') {
    $id = get_param_int('id');

    if ($id > 0) {
        $stmt = $pdo->prepare("SELECT * FROM praep_chunks WHERE id = ?");
        $stmt->execute([$id]);
        $chunk = $stmt->fetch();
        if (!$chunk) {
            fehler_nicht_gefunden('Chunk nicht gefunden.');
        }
        $chunk['korrekte_alternativen'] = $chunk['korrekte_alternativen']
            ? json_decode($chunk['korrekte_alternativen'], true)
            : [];
        $chunk['aktiv'] = (bool) $chunk['aktiv'];
        json_erfolg($chunk);
    }

    // Liste mit optionalem Filter
    $nur_aktiv = get_param('aktiv', null);
    $schwierigkeit = get_param_int('schwierigkeitsgrad');

    $wo   = [];
    $bind = [];

    if ($nur_aktiv !== null) {
        $wo[]   = 'aktiv = ?';
        $bind[] = $nur_aktiv === '1' ? 1 : 0;
    }
    if ($schwierigkeit > 0) {
        $wo[]   = 'schwierigkeitsgrad = ?';
        $bind[] = $schwierigkeit;
    }

    $sql = 'SELECT * FROM praep_chunks' . ($wo ? ' WHERE ' . implode(' AND ', $wo) : '') . ' ORDER BY id';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($bind);
    $chunks = $stmt->fetchAll();

    foreach ($chunks as &$c) {
        $c['korrekte_alternativen'] = $c['korrekte_alternativen']
            ? json_decode($c['korrekte_alternativen'], true)
            : [];
        $c['aktiv'] = (bool) $c['aktiv'];
    }
    unset($c);

    json_erfolg(['chunks' => $chunks, 'gesamt' => count($chunks)]);
}

// ---- POST (erstellen) ----
if ($methode === 'POST') {
    $body = json_body_lesen();

    $schwedisch  = trim($body['schwedisch'] ?? '');
    $loesung     = trim($body['loesung'] ?? '');
    $uebersetzung = trim($body['deutsche_uebersetzung'] ?? '');
    $alternativen = $body['korrekte_alternativen'] ?? [];
    $schwierigkeit = (int) ($body['schwierigkeitsgrad'] ?? 1);
    $aktiv = isset($body['aktiv']) ? (int) (bool) $body['aktiv'] : 1;

    if ($schwedisch === '' || $loesung === '') {
        fehler_ungueltige_eingabe('schwedisch und loesung sind Pflichtfelder.');
    }
    if (!str_contains($schwedisch, '___')) {
        fehler_ungueltige_eingabe('schwedisch muss "___" als Lückenmarkierung enthalten.');
    }
    if ($schwierigkeit < 1 || $schwierigkeit > 3) {
        $schwierigkeit = 1;
    }

    $alternativen_json = !empty($alternativen) ? json_encode($alternativen, JSON_UNESCAPED_UNICODE) : null;

    $stmt = $pdo->prepare("
        INSERT INTO praep_chunks (schwedisch, loesung, korrekte_alternativen, deutsche_uebersetzung, schwierigkeitsgrad, aktiv)
        VALUES (?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([$schwedisch, $loesung, $alternativen_json, $uebersetzung ?: null, $schwierigkeit, $aktiv]);

    json_erfolg(['id' => (int) $pdo->lastInsertId()], 'Chunk erstellt.', 201);
}

// ---- PUT (aktualisieren) ----
if ($methode === 'PUT') {
    $id = get_param_int('id');
    if ($id <= 0) {
        fehler_ungueltige_eingabe('id fehlt.');
    }

    $body = json_body_lesen();

    $felder = [];
    $bind   = [];

    if (isset($body['schwedisch'])) {
        $v = trim($body['schwedisch']);
        if ($v !== '' && !str_contains($v, '___')) {
            fehler_ungueltige_eingabe('schwedisch muss "___" als Lückenmarkierung enthalten.');
        }
        $felder[] = 'schwedisch = ?';
        $bind[]   = $v;
    }
    if (isset($body['loesung'])) {
        $felder[] = 'loesung = ?';
        $bind[]   = trim($body['loesung']);
    }
    if (isset($body['deutsche_uebersetzung'])) {
        $felder[] = 'deutsche_uebersetzung = ?';
        $bind[]   = trim($body['deutsche_uebersetzung']) ?: null;
    }
    if (isset($body['korrekte_alternativen'])) {
        $felder[] = 'korrekte_alternativen = ?';
        $bind[]   = !empty($body['korrekte_alternativen'])
            ? json_encode($body['korrekte_alternativen'], JSON_UNESCAPED_UNICODE)
            : null;
    }
    if (isset($body['schwierigkeitsgrad'])) {
        $s = (int) $body['schwierigkeitsgrad'];
        $felder[] = 'schwierigkeitsgrad = ?';
        $bind[]   = max(1, min(3, $s));
    }
    if (isset($body['aktiv'])) {
        $felder[] = 'aktiv = ?';
        $bind[]   = (int) (bool) $body['aktiv'];
    }

    if (empty($felder)) {
        fehler_ungueltige_eingabe('Keine Felder zum Aktualisieren.');
    }

    $bind[] = $id;
    $pdo->prepare("UPDATE praep_chunks SET " . implode(', ', $felder) . " WHERE id = ?")
        ->execute($bind);

    json_erfolg(null, 'Chunk aktualisiert.');
}

// ---- DELETE ----
if ($methode === 'DELETE') {
    $id = get_param_int('id');
    if ($id <= 0) {
        fehler_ungueltige_eingabe('id fehlt.');
    }

    $pdo->prepare("DELETE FROM praep_chunks WHERE id = ?")->execute([$id]);

    json_erfolg(null, 'Chunk gelöscht.');
}
