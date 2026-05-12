<?php
/**
 * Vokabeltrainer — Installations-Assistent
 *
 * Fuehrt folgende Schritte aus:
 *  1. Systemvoraussetzungen pruefen
 *  2. Datenbankzugangsdaten abfragen und umgebung.php schreiben
 *  3. Datenbank-Schema importieren
 *  4. Verbindung testen und Admin-Login bestaetigen
 *  5. Sich selbst loeschen
 *
 * SICHERHEIT: Diese Datei loescht sich nach erfolgreicher Installation selbst.
 * Falls sie noch erreichbar ist, wurde die Installation nicht abgeschlossen.
 */

declare(strict_types=1);

// Fehlerausgabe fuer den Installer aktivieren (wird spaeter deaktiviert)
ini_set('display_errors', '0');
error_reporting(E_ALL);

define('INSTALLER_VERSION', '1.0');
define('SCHEMA_DATEI', __DIR__ . '/datenbank_schema.sql');
define('UMGEBUNG_DATEI', __DIR__ . '/konfiguration/umgebung.php');
define('UMGEBUNG_BEISPIEL', __DIR__ . '/konfiguration/umgebung.beispiel.php');

// ============================================================
// Schritt-Logik
// ============================================================

$schritt = (int) ($_POST['schritt'] ?? $_GET['schritt'] ?? 1);
$fehler  = [];
$erfolg  = [];

// Schritt 2: Zugangsdaten pruefen + umgebung.php schreiben
if ($schritt === 2 && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $db_host    = trim($_POST['db_host']    ?? 'localhost');
    $db_name    = trim($_POST['db_name']    ?? '');
    $db_user    = trim($_POST['db_user']    ?? '');
    $db_pass    = $_POST['db_pass']         ?? '';
    $basis_url  = rtrim(trim($_POST['basis_url'] ?? ''), '/');

    if (empty($db_name)) $fehler[] = 'Datenbankname fehlt.';
    if (empty($db_user)) $fehler[] = 'Datenbankbenutzer fehlt.';

    if (empty($fehler)) {
        // Verbindung testen
        try {
            $dsn = "mysql:host={$db_host};charset=utf8mb4";
            $pdo = new PDO($dsn, $db_user, $db_pass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_TIMEOUT => 5,
            ]);

            // Pruefen ob Datenbank erreichbar ist
            $pdo->exec("USE `{$db_name}`");
            $erfolg[] = 'Datenbankverbindung erfolgreich.';

        } catch (PDOException $e) {
            $msg = $e->getMessage();
            // Haeufige Fehler verstaendlich uebersetzen
            if (str_contains($msg, 'Access denied')) {
                $fehler[] = 'Zugriff verweigert — Benutzername oder Passwort falsch.';
            } elseif (str_contains($msg, 'Unknown database')) {
                $fehler[] = "Datenbank '{$db_name}' existiert nicht. Bitte im Hoster-Panel zuerst anlegen.";
            } elseif (str_contains($msg, 'Connection refused') || str_contains($msg, "Can't connect")) {
                $fehler[] = "Keine Verbindung zu '{$db_host}' möglich. Host prüfen.";
            } else {
                $fehler[] = 'Datenbankfehler: ' . $msg;
            }
        }
    }

    if (empty($fehler)) {
        // umgebung.php schreiben
        $umgebung_inhalt = _umgebung_generieren($db_host, $db_name, $db_user, $db_pass, $basis_url);
        if (file_put_contents(UMGEBUNG_DATEI, $umgebung_inhalt) === false) {
            $fehler[] = 'umgebung.php konnte nicht geschrieben werden. Bitte Schreibrechte auf konfiguration/ prüfen.';
        } else {
            $erfolg[] = 'umgebung.php wurde erfolgreich erstellt.';
        }
    }

    if (empty($fehler)) {
        // Weiter zu Schritt 3
        $schritt = 3;
    } else {
        $schritt = 2; // Formular erneut anzeigen
    }
}

// Schritt 3: Schema importieren
if ($schritt === 3 && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $import_ergebnis = _schema_importieren();
    if ($import_ergebnis['erfolg']) {
        $erfolg = array_merge($erfolg, $import_ergebnis['meldungen']);
        $schritt = 4;
    } else {
        $fehler = array_merge($fehler, $import_ergebnis['meldungen']);
        $schritt = 3;
    }
}

// Schritt 4: Selbst loeschen
if ($schritt === 4 && isset($_POST['abschliessen'])) {
    $selbst_geloescht = @unlink(__FILE__);
    $schritt = 5;
}

// ============================================================
// HTML ausgeben
// ============================================================
?>
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vokabeltrainer — Installation</title>
    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #f0f4f8;
            color: #1a2332;
            min-height: 100vh;
            display: flex;
            align-items: flex-start;
            justify-content: center;
            padding: 2rem 1rem;
        }

        .card {
            background: #fff;
            border-radius: 12px;
            box-shadow: 0 4px 24px rgba(0,0,0,.1);
            width: 100%;
            max-width: 560px;
            overflow: hidden;
        }

        .card__kopf {
            background: #006AA7;
            color: #fff;
            padding: 1.5rem 2rem;
        }

        .card__flagge { font-size: 2rem; display: block; margin-bottom: .5rem; }
        .card__titel  { font-size: 1.4rem; font-weight: 700; }
        .card__unter  { font-size: .875rem; opacity: .85; margin-top: .25rem; }

        .schritte {
            display: flex;
            gap: 0;
            background: #e8f1f8;
            padding: .75rem 2rem;
            font-size: .8rem;
            color: #4a6278;
            overflow-x: auto;
        }

        .schritt {
            display: flex;
            align-items: center;
            gap: .4rem;
            white-space: nowrap;
        }

        .schritt + .schritt::before {
            content: '›';
            margin: 0 .5rem;
            color: #94afc4;
        }

        .schritt--aktiv  { color: #006AA7; font-weight: 700; }
        .schritt--fertig { color: #2e7d32; }

        .inhalt { padding: 2rem; }

        h2 { font-size: 1.15rem; margin-bottom: 1rem; color: #006AA7; }

        .anforderungen { list-style: none; margin-bottom: 1.5rem; }
        .anforderungen li {
            display: flex;
            align-items: center;
            gap: .6rem;
            padding: .4rem 0;
            font-size: .9rem;
            border-bottom: 1px solid #f0f4f8;
        }
        .ok   { color: #2e7d32; font-size: 1.1rem; }
        .warn { color: #f57c00; font-size: 1.1rem; }
        .fail { color: #c62828; font-size: 1.1rem; }

        .formular-gruppe { margin-bottom: 1.2rem; }
        label {
            display: block;
            font-size: .85rem;
            font-weight: 600;
            margin-bottom: .35rem;
            color: #344a5e;
        }
        label small { font-weight: 400; color: #6b8399; }
        input[type=text], input[type=password] {
            width: 100%;
            padding: .6rem .75rem;
            border: 1.5px solid #c8d8e8;
            border-radius: 6px;
            font-size: .95rem;
            transition: border-color .2s;
            background: #fafcfe;
        }
        input:focus { outline: none; border-color: #006AA7; background: #fff; }

        .hinweis {
            font-size: .82rem;
            color: #6b8399;
            margin-top: .4rem;
        }

        .btn {
            display: inline-block;
            padding: .7rem 1.6rem;
            border-radius: 6px;
            font-size: .95rem;
            font-weight: 600;
            cursor: pointer;
            border: none;
            transition: background .2s, transform .1s;
        }
        .btn:active { transform: scale(.98); }
        .btn--primaer  { background: #006AA7; color: #fff; }
        .btn--primaer:hover { background: #005a8e; }
        .btn--erfolg   { background: #2e7d32; color: #fff; }
        .btn--erfolg:hover { background: #256427; }
        .btn--gefahr   { background: #c62828; color: #fff; }
        .btn--gefahr:hover { background: #a81f1f; }

        .meldungen { margin-bottom: 1.5rem; }
        .meldung {
            display: flex;
            align-items: flex-start;
            gap: .5rem;
            padding: .6rem .85rem;
            border-radius: 6px;
            font-size: .88rem;
            margin-bottom: .5rem;
        }
        .meldung--fehler  { background: #fdecea; color: #b71c1c; }
        .meldung--erfolg  { background: #e8f5e9; color: #1b5e20; }
        .meldung--info    { background: #e3f2fd; color: #0d47a1; }

        .trennlinie { border: none; border-top: 1px solid #eef2f6; margin: 1.5rem 0; }

        .log {
            background: #1a2332;
            color: #a8c7e8;
            border-radius: 6px;
            padding: 1rem;
            font-family: 'Courier New', monospace;
            font-size: .8rem;
            max-height: 260px;
            overflow-y: auto;
            margin-bottom: 1.5rem;
            line-height: 1.6;
        }
        .log .ok-zeile   { color: #81c995; }
        .log .fail-zeile { color: #f28b82; }
        .log .info-zeile { color: #8ab4f8; }

        .erfolg-box {
            text-align: center;
            padding: 1rem 0;
        }
        .erfolg-box .icon { font-size: 3.5rem; display: block; margin-bottom: 1rem; }
        .erfolg-box h2   { color: #2e7d32; margin-bottom: .5rem; }
        .erfolg-box p    { color: #4a6278; font-size: .9rem; line-height: 1.6; margin-bottom: 1.5rem; }

        .info-box {
            background: #fff8e1;
            border: 1px solid #ffe082;
            border-radius: 6px;
            padding: .85rem 1rem;
            font-size: .85rem;
            color: #5d4037;
            margin-bottom: 1.5rem;
            line-height: 1.6;
        }
        .info-box strong { display: block; margin-bottom: .3rem; }
    </style>
</head>
<body>
<div class="card">

    <!-- Kopfzeile -->
    <div class="card__kopf">
        <span class="card__flagge">🇸🇪</span>
        <div class="card__titel">Vokabeltrainer — Installation</div>
        <div class="card__unter">Schwedisch-Deutsch · Version <?= INSTALLER_VERSION ?></div>
    </div>

    <!-- Fortschrittsleiste -->
    <div class="schritte">
        <?php
        $alle_schritte = ['Voraussetzungen', 'Datenbank', 'Schema', 'Abschluss'];
        foreach ($alle_schritte as $i => $name):
            $nr = $i + 1;
            $klasse = '';
            if ($nr < $schritt)  $klasse = 'schritt--fertig';
            if ($nr === $schritt) $klasse = 'schritt--aktiv';
        ?>
        <span class="schritt <?= $klasse ?>">
            <?= $nr < $schritt ? '✓ ' : "{$nr}. " ?><?= $name ?>
        </span>
        <?php endforeach; ?>
    </div>

    <!-- Inhalt -->
    <div class="inhalt">

        <?php // ── Fehlermeldungen ── ?>
        <?php if (!empty($fehler)): ?>
        <div class="meldungen">
            <?php foreach ($fehler as $f): ?>
            <div class="meldung meldung--fehler">⚠ <?= htmlspecialchars($f) ?></div>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>

        <?php // ── Erfolgsmeldungen ── ?>
        <?php if (!empty($erfolg) && $schritt !== 5): ?>
        <div class="meldungen">
            <?php foreach ($erfolg as $e): ?>
            <div class="meldung meldung--erfolg">✓ <?= htmlspecialchars($e) ?></div>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>

        <?php

        // ============================================================
        // SCHRITT 1 — Systemvoraussetzungen
        // ============================================================
        if ($schritt === 1):
            $checks = _voraussetzungen_pruefen();
            $blockierend = array_filter($checks, fn($c) => $c['typ'] === 'fail');
        ?>

        <h2>Systemvoraussetzungen</h2>
        <ul class="anforderungen">
        <?php foreach ($checks as $check): ?>
            <li>
                <span class="<?= $check['typ'] ?>">
                    <?= $check['typ'] === 'ok' ? '✓' : ($check['typ'] === 'warn' ? '⚡' : '✗') ?>
                </span>
                <?= htmlspecialchars($check['label']) ?>
                <?php if (!empty($check['info'])): ?>
                    <span class="hinweis">(<?= htmlspecialchars($check['info']) ?>)</span>
                <?php endif; ?>
            </li>
        <?php endforeach; ?>
        </ul>

        <?php if (empty($blockierend)): ?>
        <form method="post">
            <input type="hidden" name="schritt" value="2">
            <button type="submit" class="btn btn--primaer">Weiter zur Datenbank-Konfiguration →</button>
        </form>
        <?php else: ?>
        <div class="meldung meldung--fehler">
            ✗ Bitte die markierten Voraussetzungen erfüllen, bevor die Installation fortgesetzt werden kann.
        </div>
        <?php endif; ?>

        <?php

        // ============================================================
        // SCHRITT 2 — Datenbankzugangsdaten
        // ============================================================
        elseif ($schritt === 2):
            // Felder aus POST vorbelegen (bei Fehler nicht leer lassen)
            $f_host  = htmlspecialchars($_POST['db_host']   ?? 'localhost');
            $f_name  = htmlspecialchars($_POST['db_name']   ?? '');
            $f_user  = htmlspecialchars($_POST['db_user']   ?? '');
            $f_basis = htmlspecialchars($_POST['basis_url'] ?? '');
        ?>

        <h2>Datenbank-Konfiguration</h2>

        <div class="info-box">
            <strong>💡 Wo finde ich diese Daten?</strong>
            Alle Zugangsdaten stehen im Kunden-Panel deines Hosters (dogado)
            unter <em>Datenbanken</em>. Die Datenbank muss dort bereits angelegt sein.
        </div>

        <form method="post">
            <input type="hidden" name="schritt" value="2">

            <div class="formular-gruppe">
                <label for="db_host">Datenbank-Host <small>(meist localhost)</small></label>
                <input type="text" id="db_host" name="db_host" value="<?= $f_host ?>" required>
            </div>

            <div class="formular-gruppe">
                <label for="db_name">Datenbankname</label>
                <input type="text" id="db_name" name="db_name" value="<?= $f_name ?>"
                       placeholder="z.B. db12345_vokabeltrainer" required autocomplete="off">
            </div>

            <div class="formular-gruppe">
                <label for="db_user">Datenbankbenutzer</label>
                <input type="text" id="db_user" name="db_user" value="<?= $f_user ?>"
                       placeholder="z.B. db12345_user" required autocomplete="off">
            </div>

            <div class="formular-gruppe">
                <label for="db_pass">Datenbankpasswort</label>
                <input type="password" id="db_pass" name="db_pass"
                       placeholder="Passwort aus dem Hoster-Panel" autocomplete="new-password">
            </div>

            <hr class="trennlinie">

            <div class="formular-gruppe">
                <label for="basis_url">
                    Basis-URL der App
                    <small>(ohne trailing Slash)</small>
                </label>
                <input type="text" id="basis_url" name="basis_url" value="<?= $f_basis ?>"
                       placeholder="Leer lassen wenn App im Root-Verzeichnis">
                <div class="hinweis">
                    Root-Domain (https://meinedomain.de/) → leer lassen<br>
                    Unterordner (https://meinedomain.de/app/) → <code>/app</code> eintragen
                </div>
            </div>

            <button type="submit" class="btn btn--primaer">Verbindung testen &amp; speichern →</button>
        </form>

        <?php

        // ============================================================
        // SCHRITT 3 — Schema importieren
        // ============================================================
        elseif ($schritt === 3):
        ?>

        <h2>Datenbank-Schema importieren</h2>

        <p style="margin-bottom:1.2rem; font-size:.9rem; color:#4a6278; line-height:1.6">
            Jetzt werden alle 25 Tabellen und Seed-Daten in die Datenbank eingespielt.
            Bereits vorhandene Tabellen werden dabei überschrieben (DROP TABLE IF EXISTS).
        </p>

        <div class="info-box">
            <strong>⚠ Achtung bei vorhandenen Daten</strong>
            Falls die Datenbank bereits Daten enthält, werden diese durch den Import gelöscht.
            Bei einer Neu-Installation ist das der richtige Schritt.
        </div>

        <form method="post">
            <input type="hidden" name="schritt" value="3">
            <button type="submit" class="btn btn--primaer">Schema jetzt importieren →</button>
        </form>

        <?php

        // ============================================================
        // SCHRITT 4 — Abschluss & selbst loeschen
        // ============================================================
        elseif ($schritt === 4):
        ?>

        <h2>Installation abschließen</h2>

        <?php if (!empty($erfolg)): ?>
        <div class="log">
        <?php foreach ($erfolg as $zeile): ?>
            <div class="<?= str_starts_with($zeile, '✓') ? 'ok-zeile' : (str_starts_with($zeile, '✗') ? 'fail-zeile' : 'info-zeile') ?>">
                <?= htmlspecialchars($zeile) ?>
            </div>
        <?php endforeach; ?>
        </div>
        <?php endif; ?>

        <div class="info-box">
            <strong>🔐 Admin-Login</strong>
            Benutzername: <code>admin</code><br>
            Das Passwort entspricht dem aktuellen Hash in der Datenbank.
            Bitte <strong>sofort nach dem ersten Login</strong> unter Einstellungen ändern.
        </div>

        <p style="margin-bottom:1.2rem; font-size:.9rem; color:#4a6278; line-height:1.6">
            Die Installation ist abgeschlossen. Als letzten Schritt wird
            <strong>install.php jetzt von deinem Server gelöscht</strong> —
            aus Sicherheitsgründen sollte sie nicht dauerhaft erreichbar sein.
        </p>

        <form method="post">
            <input type="hidden" name="schritt" value="4">
            <input type="hidden" name="abschliessen" value="1">
            <button type="submit" class="btn btn--gefahr">Installation abschließen &amp; Datei löschen</button>
        </form>

        <?php

        // ============================================================
        // SCHRITT 5 — Fertig
        // ============================================================
        elseif ($schritt === 5):
            $app_url = _app_url_ermitteln();
        ?>

        <div class="erfolg-box">
            <span class="icon">🎉</span>
            <h2>Installation erfolgreich!</h2>
            <p>
                Der Vokabeltrainer ist einsatzbereit.<br>
                <?php if ($selbst_geloescht ?? false): ?>
                    <strong>install.php wurde erfolgreich gelöscht.</strong>
                <?php else: ?>
                    <span style="color:#c62828">install.php konnte nicht automatisch gelöscht werden —
                    bitte manuell per FTP löschen!</span>
                <?php endif; ?>
            </p>
            <a href="<?= htmlspecialchars($app_url) ?>" class="btn btn--erfolg">
                Zur App →
            </a>
        </div>

        <?php endif; ?>

    </div><!-- /.inhalt -->
</div><!-- /.card -->
</body>
</html>
<?php

// ============================================================
// Hilfsfunktionen
// ============================================================

function _voraussetzungen_pruefen(): array
{
    $checks = [];

    // PHP-Version
    $php_ok = version_compare(PHP_VERSION, '8.0.0', '>=');
    $checks[] = [
        'typ'   => $php_ok ? 'ok' : 'fail',
        'label' => 'PHP 8.0 oder neuer',
        'info'  => 'Installiert: ' . PHP_VERSION,
    ];

    // PDO MySQL
    $pdo_ok = extension_loaded('pdo_mysql');
    $checks[] = [
        'typ'   => $pdo_ok ? 'ok' : 'fail',
        'label' => 'PHP-Extension: pdo_mysql',
        'info'  => $pdo_ok ? '' : 'Muss in php.ini aktiviert werden',
    ];

    // JSON
    $checks[] = [
        'typ'   => extension_loaded('json') ? 'ok' : 'fail',
        'label' => 'PHP-Extension: json',
        'info'  => '',
    ];

    // Schreibrecht konfiguration/
    $konfig_pfad = __DIR__ . '/konfiguration';
    $schreib_ok  = is_writable($konfig_pfad);
    $checks[] = [
        'typ'   => $schreib_ok ? 'ok' : 'fail',
        'label' => 'Schreibrecht: konfiguration/',
        'info'  => $schreib_ok ? '' : 'chmod 755 konfiguration/ auf dem Server ausführen',
    ];

    // Schema-Datei vorhanden
    $schema_ok = file_exists(SCHEMA_DATEI);
    $checks[] = [
        'typ'   => $schema_ok ? 'ok' : 'fail',
        'label' => 'datenbank_schema.sql vorhanden',
        'info'  => $schema_ok ? '' : 'Datei fehlt im Wurzelverzeichnis',
    ];

    // umgebung.php schon vorhanden?
    if (file_exists(UMGEBUNG_DATEI)) {
        $checks[] = [
            'typ'   => 'warn',
            'label' => 'umgebung.php existiert bereits',
            'info'  => 'Wird im nächsten Schritt überschrieben',
        ];
    }

    // max_execution_time
    $max_time = (int) ini_get('max_execution_time');
    $checks[] = [
        'typ'   => ($max_time === 0 || $max_time >= 30) ? 'ok' : 'warn',
        'label' => 'max_execution_time ≥ 30s',
        'info'  => "Aktuell: {$max_time}s",
    ];

    return $checks;
}

function _umgebung_generieren(
    string $host,
    string $name,
    string $user,
    string $pass,
    string $basis_url
): string {
    // Passwort sicher escapen fuer PHP-String
    $pass_escaped = str_replace(["\\", "'"], ["\\\\", "\\'"], $pass);

    return "<?php\n"
        . "/**\n"
        . " * Umgebungskonfiguration\n"
        . " * Erstellt durch install.php am " . date('Y-m-d H:i:s') . "\n"
        . " * NICHT hochladen / nicht ins Repository!\n"
        . " */\n\n"
        . "define('DB_HOST',    '{$host}');\n"
        . "define('DB_NAME',    '{$name}');\n"
        . "define('DB_USER',    '{$user}');\n"
        . "define('DB_PASS',    '{$pass_escaped}');\n"
        . "define('DB_CHARSET', 'utf8mb4');\n\n"
        . "define('BASIS_URL_WERT', '{$basis_url}');\n\n"
        . "define('APP_UMGEBUNG', 'production');\n";
}

function _schema_importieren(): array
{
    $meldungen = [];

    if (!file_exists(UMGEBUNG_DATEI)) {
        return ['erfolg' => false, 'meldungen' => ['✗ umgebung.php nicht gefunden — Schritt 2 wiederholen.']];
    }

    require_once UMGEBUNG_DATEI;

    try {
        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', DB_HOST, DB_NAME);
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);
    } catch (PDOException $e) {
        return ['erfolg' => false, 'meldungen' => ['✗ Datenbankverbindung fehlgeschlagen: ' . $e->getMessage()]];
    }

    $sql_roh = file_get_contents(SCHEMA_DATEI);
    if ($sql_roh === false) {
        return ['erfolg' => false, 'meldungen' => ['✗ datenbank_schema.sql konnte nicht gelesen werden.']];
    }

    // Kommentare und auskommentierte CREATE DATABASE / USE-Zeilen entfernen
    $zeilen     = explode("\n", $sql_roh);
    $sql_sauber = [];
    foreach ($zeilen as $zeile) {
        $getrimmt = trim($zeile);
        // Auskommentierte Zeilen überspringen
        if (str_starts_with($getrimmt, '--')) continue;
        $sql_sauber[] = $zeile;
    }
    $sql = implode("\n", $sql_sauber);

    // In einzelne Statements aufteilen (DELIMITER-Grenze: Semikolon)
    // Einfacher Split — reicht fuer dieses Schema (keine Stored Procedures)
    $statements = array_filter(
        array_map('trim', explode(';', $sql)),
        fn($s) => $s !== ''
    );

    $gesamt  = count($statements);
    $ok      = 0;
    $fehl    = 0;

    $meldungen[] = "→ {$gesamt} SQL-Statements werden ausgeführt …";

    foreach ($statements as $stmt) {
        try {
            $pdo->exec($stmt);
            $ok++;
        } catch (PDOException $e) {
            $fehl++;
            $kurz = mb_substr($stmt, 0, 60);
            $meldungen[] = "✗ Fehler bei: {$kurz}… → " . $e->getMessage();
        }
    }

    $meldungen[] = "✓ {$ok} Statements erfolgreich ausgeführt" . ($fehl > 0 ? ", {$fehl} fehlgeschlagen." : '.');

    if ($fehl > 0) {
        return ['erfolg' => false, 'meldungen' => $meldungen];
    }

    $meldungen[] = '✓ Alle Tabellen und Seed-Daten wurden importiert.';
    $meldungen[] = '✓ Admin-Benutzer: Benutzername admin (Passwort bitte sofort ändern).';

    return ['erfolg' => true, 'meldungen' => $meldungen];
}

function _app_url_ermitteln(): string
{
    $protokoll = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host      = $_SERVER['HTTP_HOST'] ?? 'localhost';
    // install.php liegt im App-Root → einfach den Verzeichnis-Pfad nehmen
    $pfad = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/');
    return "{$protokoll}://{$host}{$pfad}/";
}
