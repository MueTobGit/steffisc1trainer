<?php
/**
 * Datenbank-Verbindung (PDO)
 *
 * Laedt Zugangsdaten aus umgebung.php.
 * Prepared Statements erzwungen (EMULATE_PREPARES = false).
 * Bei Konfigurationsfehlern: benutzerfreundliche Fehlerseite statt 500er.
 */

declare(strict_types=1);

// ---- Umgebungskonfiguration laden ----
$_umgebung_pfad = __DIR__ . '/umgebung.php';
if (!file_exists($_umgebung_pfad)) {
    _db_setup_fehler(
        'Konfigurationsdatei fehlt',
        'Die Datei <code>konfiguration/umgebung.php</code> wurde nicht gefunden.',
        'Bitte <code>umgebung.beispiel.php</code> als <code>umgebung.php</code> anlegen und Zugangsdaten eintragen — oder den Installations-Assistenten verwenden.'
    );
}
require_once $_umgebung_pfad;

/**
 * PDO-Instanz holen (Singleton)
 */
function db_verbindung(): PDO
{
    static $pdo = null;

    if ($pdo !== null) {
        return $pdo;
    }

    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=%s',
        DB_HOST,
        DB_NAME,
        DB_CHARSET
    );

    $optionen = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci",
    ];

    try {
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $optionen);
    } catch (PDOException $e) {
        error_log('Datenbankfehler: ' . $e->getMessage());

        $msg = $e->getMessage();
        if (str_contains($msg, 'Access denied')) {
            $detail = 'Benutzername oder Passwort in <code>umgebung.php</code> sind falsch.';
        } elseif (str_contains($msg, 'Unknown database')) {
            $detail = 'Die Datenbank <strong>' . htmlspecialchars(DB_NAME) . '</strong> existiert nicht. Bitte im Hoster-Panel anlegen.';
        } elseif (str_contains($msg, 'Connection refused') || str_contains($msg, "Can't connect")) {
            $detail = 'Keine Verbindung zu <strong>' . htmlspecialchars(DB_HOST) . '</strong> moeglich. Bitte DB_HOST in <code>umgebung.php</code> pruefen.';
        } else {
            $detail = 'Technische Details: <code>' . htmlspecialchars($msg) . '</code>';
        }

        _db_setup_fehler('Datenbankverbindung fehlgeschlagen', $detail);
    }

    return $pdo;
}

/**
 * Zeigt eine benutzerfreundliche Setup-Fehlerseite an.
 * Im API-Kontext: JSON-Antwort. Im Browser-Kontext: HTML mit Installer-Link.
 */
function _db_setup_fehler(string $titel, string $detail, string $hinweis = ''): never
{
    // API-Kontext: JSON-Antwort senden
    if (_ist_api_anfrage()) {
        http_response_code(503);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'erfolg' => false,
            'fehler' => [
                'code'      => 'SETUP_UNVOLLSTAENDIG',
                'nachricht' => strip_tags($titel . ': ' . $detail),
            ]
        ]);
        exit;
    }

    // Browser-Kontext: HTML-Hinweisseite ausgeben
    $installer_vorhanden = file_exists(__DIR__ . '/../install.php');
    $installer_url       = _basis_url() . '/install.php';

    http_response_code(503);
    header('Content-Type: text/html; charset=utf-8');

    echo '<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Vokabeltrainer — Setup erforderlich</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
       background:#f0f4f8;display:flex;align-items:center;justify-content:center;
       min-height:100vh;padding:1.5rem}
  .box{background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.1);
       max-width:480px;width:100%;overflow:hidden}
  .kopf{background:#006AA7;color:#fff;padding:1.5rem 2rem}
  .kopf .flagge{font-size:2rem;display:block;margin-bottom:.5rem}
  .kopf h1{font-size:1.2rem}
  .body{padding:2rem}
  h2{color:#c62828;font-size:1rem;margin-bottom:.75rem}
  p{font-size:.9rem;color:#344a5e;line-height:1.65;margin-bottom:.75rem}
  code{background:#f0f4f8;padding:.1rem .3rem;border-radius:3px;font-size:.85rem}
  .btn{display:inline-block;margin-top:1.25rem;padding:.7rem 1.5rem;
       background:#006AA7;color:#fff;border-radius:6px;text-decoration:none;
       font-size:.9rem;font-weight:600}
  .btn:hover{background:#005a8e}
  .hinweis{background:#e3f2fd;border-radius:6px;padding:.75rem 1rem;
            font-size:.83rem;color:#0d47a1;margin-top:1rem;line-height:1.6}
</style>
</head>
<body>
<div class="box">
  <div class="kopf">
    <span class="flagge">&#x1F1F8;&#x1F1EA;</span>
    <h1>Vokabeltrainer &mdash; Schwedisch-Deutsch</h1>
  </div>
  <div class="body">
    <h2>&#x2699; Setup erforderlich</h2>
    <p><strong>' . $titel . '</strong></p>
    <p>' . $detail . '</p>';

    if ($hinweis !== '') {
        echo '<p>' . $hinweis . '</p>';
    }

    if ($installer_vorhanden) {
        echo '<a href="' . htmlspecialchars($installer_url) . '" class="btn">
                &#x1F680; Installations-Assistenten &ouml;ffnen
              </a>
              <div class="hinweis">
                Der Assistent f&uuml;hrt durch die Datenbank-Konfiguration
                und richtet alle Tabellen automatisch ein.
              </div>';
    } else {
        echo '<div class="hinweis">
                Bitte <code>konfiguration/umgebung.php</code> anlegen
                (Vorlage: <code>umgebung.beispiel.php</code>) und
                Datenbankzugangsdaten aus dem Hoster-Panel eintragen.
              </div>';
    }

    echo '  </div>
</div>
</body>
</html>';
    exit;
}

/**
 * Erkennt ob die aktuelle Anfrage eine API-Anfrage ist.
 */
function _ist_api_anfrage(): bool
{
    $uri = $_SERVER['REQUEST_URI'] ?? '';
    if (str_contains($uri, '/api/')) {
        return true;
    }
    $accept = $_SERVER['HTTP_ACCEPT'] ?? '';
    return str_contains($accept, 'application/json');
}

/**
 * Basis-URL fuer Links ermitteln (ohne trailing slash).
 */
function _basis_url(): string
{
    if (defined('BASIS_URL')) {
        return BASIS_URL;
    }
    $protokoll = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host      = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $pfad      = rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
    return "{$protokoll}://{$host}{$pfad}";
}
