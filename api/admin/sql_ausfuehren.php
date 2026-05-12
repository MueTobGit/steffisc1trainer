<?php
/**
 * API: Admin — SQL ausführen
 *
 * POST /api/admin/sql_ausfuehren.php
 *
 * Body (JSON): { "sql": "SELECT ...; INSERT ...;" }
 *
 * Führt beliebige SQL-Statements aus. Nur für Admins.
 * Gibt pro Statement zurück: Typ (select/write), Ergebnis oder Fehlermeldung.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';

methode_erzwingen('POST');

$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

$body      = json_body_lesen();
$sql_input = trim($body['sql'] ?? '');

if ($sql_input === '') {
    fehler_ungueltige_eingabe('Kein SQL-Statement angegeben.');
}

$pdo = db_verbindung();

// Statements sauber aufteilen (respektiert Strings und Kommentare)
$statements = _sql_aufteilen($sql_input);

if (empty($statements)) {
    fehler_ungueltige_eingabe('Keine gültigen SQL-Statements gefunden.');
}

// Max. 200 Zeilen pro SELECT-Ergebnis zurückgeben
const MAX_ZEILEN = 200;

$ergebnisse      = [];
$gesamt_ok       = 0;
$gesamt_fehler   = 0;

foreach ($statements as $i => $statement) {
    $statement = trim($statement);
    if ($statement === '') continue;

    try {
        $stmt = $pdo->query($statement);

        $ist_select = (bool) preg_match('/^\s*(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN|CALL)\b/i', $statement);

        if ($ist_select) {
            $zeilen  = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $gesamt  = count($zeilen);
            $zeilen  = array_slice($zeilen, 0, MAX_ZEILEN); // Limit für Browser
            $gesamt_ok++;
            $ergebnisse[] = [
                'nr'          => $i + 1,
                'sql_kurz'    => mb_substr($statement, 0, 150),
                'erfolg'      => true,
                'typ'         => 'select',
                'zeilen'      => $zeilen,
                'anzahl'      => $gesamt,
                'abgeschnitten' => $gesamt > MAX_ZEILEN,
                'spalten'     => !empty($zeilen) ? array_keys($zeilen[0]) : [],
            ];
        } else {
            $betroffen = $stmt->rowCount();
            $gesamt_ok++;
            $ergebnisse[] = [
                'nr'        => $i + 1,
                'sql_kurz'  => mb_substr($statement, 0, 150),
                'erfolg'    => true,
                'typ'       => 'write',
                'betroffen' => $betroffen,
            ];
        }
    } catch (PDOException $e) {
        $gesamt_fehler++;
        $ergebnisse[] = [
            'nr'       => $i + 1,
            'sql_kurz' => mb_substr($statement, 0, 150),
            'erfolg'   => false,
            'fehler'   => $e->getMessage(),
        ];
    }
}

// --- Audit-Log: vollständige Statements für Nachvollziehbarkeit ---
$pdo_log = db_verbindung();
$log_details = array_map(static function (array $e): array {
    return [
        'nr'      => $e['nr'],
        'sql'     => $e['sql_kurz'],  // bereits auf 150 Zeichen gekürzt (kein Memory-Problem)
        'erfolg'  => $e['erfolg'],
        'typ'     => $e['typ'] ?? null,
        'fehler'  => $e['fehler'] ?? null,
    ];
}, $ergebnisse);

try {
    $pdo_log->prepare("
        INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung, details_json)
        VALUES (?, 'admin_aktion', 'SQL ausgeführt', ?)
    ")->execute([
        $benutzer['id'],
        json_encode([
            'statements_ok'     => $gesamt_ok,
            'statements_fehler' => $gesamt_fehler,
            'details'           => $log_details,
        ], JSON_UNESCAPED_UNICODE),
    ]);
} catch (\Throwable $e) {
    error_log('sql_ausfuehren: Audit-Log fehlgeschlagen: ' . $e->getMessage());
}

json_erfolg([
    'ergebnisse'        => $ergebnisse,
    'gesamt_ok'         => $gesamt_ok,
    'gesamt_fehler'     => $gesamt_fehler,
    'gesamt_statements' => count($ergebnisse),
]);

/**
 * SQL-Text in einzelne Statements aufteilen.
 * Respektiert einfache/doppelte Anführungszeichen, -- Zeilenkommentare, /* Blockkommentare.
 */
function _sql_aufteilen(string $sql): array
{
    $statements = [];
    $aktuell    = '';
    $in_single  = false;
    $in_double  = false;
    $len        = strlen($sql);
    $i          = 0;

    while ($i < $len) {
        $c = $sql[$i];

        // Einzeiliger Kommentar: -- bis Zeilenende
        if (!$in_single && !$in_double && $c === '-' && ($sql[$i + 1] ?? '') === '-') {
            while ($i < $len && $sql[$i] !== "\n") $i++;
            continue;
        }

        // Block-Kommentar: /* ... */
        if (!$in_single && !$in_double && $c === '/' && ($sql[$i + 1] ?? '') === '*') {
            $i += 2;
            while ($i < $len && !($sql[$i] === '*' && ($sql[$i + 1] ?? '') === '/')) $i++;
            $i += 2;
            continue;
        }

        // String-Grenzen
        if ($c === "'" && !$in_double) {
            $in_single = !$in_single;
        } elseif ($c === '"' && !$in_single) {
            $in_double = !$in_double;
        } elseif ($c === ';' && !$in_single && !$in_double) {
            $trimmed = trim($aktuell);
            if ($trimmed !== '') {
                $statements[] = $trimmed;
            }
            $aktuell = '';
            $i++;
            continue;
        }

        $aktuell .= $c;
        $i++;
    }

    $trimmed = trim($aktuell);
    if ($trimmed !== '') {
        $statements[] = $trimmed;
    }

    return $statements;
}
