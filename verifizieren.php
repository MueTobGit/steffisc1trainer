<?php
/**
 * Magic Link Verifikation
 *
 * GET /verifizieren.php?token=...
 *
 * Eigenstaendige PHP-Seite (kein API-Endpoint, kein JSON).
 * Prueft den Magic-Link-Token, legt ggf. neuen Benutzer an,
 * und leitet in die App weiter.
 *
 * Ablauf:
 * 1. Token validieren
 * 2. Benutzer suchen oder neu anlegen (auto-generierter Benutzername)
 * 3. API-Auth-Token erstellen
 * 4. localStorage setzen (via eingebettetes JS) + Redirect zur App
 */

declare(strict_types=1);

// ---- Konfiguration laden ----
require_once __DIR__ . '/konfiguration/datenbank.php';
require_once __DIR__ . '/konfiguration/konstanten.php';
require_once __DIR__ . '/konfiguration/hilfsfunktionen.php';

// ---- Token aus URL lesen ----
$token_roh = isset($_GET['token']) ? trim((string) $_GET['token']) : '';

// Basis-URL fuer Redirect und Links
$basis_url = BASIS_URL;
$login_url = $basis_url . '/#/anmeldung';

// ---- Fehlerseite ausgeben ----
function fehler_seite(string $titel, string $nachricht, string $login_url): never
{
    $esc_titel    = htmlspecialchars($titel, ENT_QUOTES, 'UTF-8');
    $esc_nachricht = htmlspecialchars($nachricht, ENT_QUOTES, 'UTF-8');
    $esc_url      = htmlspecialchars($login_url, ENT_QUOTES, 'UTF-8');

    http_response_code(400);
    header('Content-Type: text/html; charset=utf-8');
    header('X-Robots-Tag: noindex');
    echo <<<HTML
    <!DOCTYPE html>
    <html lang="de">
    <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Anmeldung fehlgeschlagen — Vokabeltrainer</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
             background: #f0f4f8; display: flex; align-items: center;
             justify-content: center; min-height: 100vh; padding: 16px; }
      .box { background: #fff; border-radius: 16px; max-width: 420px; width: 100%;
             box-shadow: 0 4px 24px rgba(0,0,0,.1); overflow: hidden; }
      .kopf { background: #006AA7; color: #fff; padding: 28px 32px; text-align: center; }
      .kopf .icon { font-size: 40px; }
      .kopf h1 { font-size: 20px; font-weight: 500; margin-top: 8px; }
      .body { padding: 32px; text-align: center; }
      .body h2 { color: #c62828; font-size: 18px; margin-bottom: 12px; }
      .body p { color: #344a5e; font-size: 15px; line-height: 1.6; margin-bottom: 20px; }
      .btn { display: inline-block; background: #006AA7; color: #fff; text-decoration: none;
             padding: 12px 28px; border-radius: 28px; font-size: 15px; font-weight: 600; }
    </style>
    </head>
    <body>
    <div class="box">
      <div class="kopf">
        <div class="icon">&#x1F1F8;&#x1F1EA;</div>
        <h1>Vokabeltrainer</h1>
      </div>
      <div class="body">
        <h2>&#x26A0; {$esc_titel}</h2>
        <p>{$esc_nachricht}</p>
        <a href="{$esc_url}" class="btn">Zur Anmeldung</a>
      </div>
    </div>
    </body>
    </html>
    HTML;
    exit;
}

// ---- Token-Format pruefen ----
if ($token_roh === '' || !preg_match('/^[0-9a-f]{64}$/', $token_roh)) {
    fehler_seite(
        'Ungültiger Link',
        'Dieser Anmeldelink ist ungültig oder wurde beschädigt. Bitte fordere einen neuen Link an.',
        $login_url
    );
}

$pdo = db_verbindung();

// ---- Token in DB suchen ----
$stmt = $pdo->prepare("
    SELECT id, email, ablauf_am, genutzt
    FROM magic_link_tokens
    WHERE token = ?
    LIMIT 1
");
$stmt->execute([$token_roh]);
$token_eintrag = $stmt->fetch(\PDO::FETCH_ASSOC);

if (!$token_eintrag) {
    fehler_seite(
        'Link nicht gefunden',
        'Dieser Anmeldelink existiert nicht. Bitte fordere einen neuen Link an.',
        $login_url
    );
}

if ((bool) $token_eintrag['genutzt']) {
    fehler_seite(
        'Link bereits verwendet',
        'Dieser Anmeldelink wurde bereits benutzt. Bitte fordere einen neuen Link an.',
        $login_url
    );
}

if (new \DateTime() > new \DateTime($token_eintrag['ablauf_am'])) {
    fehler_seite(
        'Link abgelaufen',
        'Dieser Anmeldelink ist abgelaufen. Bitte fordere einen neuen Link an — sie sind 15 Minuten gültig.',
        $login_url
    );
}

$email = strtolower(trim($token_eintrag['email']));

// ---- Token als genutzt markieren (sofort, verhindert Race-Conditions) ----
$pdo->prepare("UPDATE magic_link_tokens SET genutzt = TRUE WHERE id = ?")
    ->execute([$token_eintrag['id']]);

// ---- Benutzer suchen ----
$stmt = $pdo->prepare("
    SELECT b.id, b.benutzername, b.vorname, b.nachname, b.rolle, b.aktiv,
           b.email_verifiziert, b.letzter_login
    FROM benutzer b
    WHERE LOWER(b.email) = ?
    LIMIT 1
");
$stmt->execute([$email]);
$benutzer = $stmt->fetch(\PDO::FETCH_ASSOC);

$ist_neu = false;

if (!$benutzer) {
    // ---- Neuen Benutzer anlegen ----
    $ist_neu      = true;
    $benutzername = _benutzernamen_generieren($email, $pdo);

    $stmt = $pdo->prepare("
        INSERT INTO benutzer (benutzername, passwort_hash, email, email_verifiziert, rolle, aktiv, letzter_login)
        VALUES (?, '', ?, TRUE, 'benutzer', TRUE, NOW())
    ");
    $stmt->execute([$benutzername, $email]);
    $benutzer_id = (int) $pdo->lastInsertId();

    // Statistik-Eintrag anlegen
    $pdo->prepare("INSERT IGNORE INTO benutzer_statistik (benutzer_id) VALUES (?)")
        ->execute([$benutzer_id]);

    $benutzer = [
        'id'                => $benutzer_id,
        'benutzername'      => $benutzername,
        'vorname'           => null,
        'nachname'          => null,
        'rolle'             => 'benutzer',
        'aktiv'             => true,
        'email_verifiziert' => true,
        'letzter_login'     => null,
    ];

} else {
    if (!(bool) $benutzer['aktiv']) {
        fehler_seite(
            'Konto gesperrt',
            'Dieses Konto ist deaktiviert. Bitte wende dich an den Administrator.',
            $login_url
        );
    }

    // E-Mail als verifiziert markieren (falls noch nicht geschehen)
    if (!(bool) $benutzer['email_verifiziert']) {
        $pdo->prepare("UPDATE benutzer SET email_verifiziert = TRUE WHERE id = ?")
            ->execute([$benutzer['id']]);
        $benutzer['email_verifiziert'] = true;
    }

    // Letzten Login aktualisieren
    $pdo->prepare("UPDATE benutzer SET letzter_login = NOW() WHERE id = ?")
        ->execute([$benutzer['id']]);
}

$benutzer_id = (int) $benutzer['id'];

// ---- API-Auth-Token erstellen ----
$api_token  = bin2hex(random_bytes(32)); // 64 Hex-Zeichen
$token_tage = (int) konfig_wert('token_gueltig_tage', '90');
$gueltig_bis = date('Y-m-d H:i:s', strtotime("+{$token_tage} days"));

$stmt = $pdo->prepare("
    INSERT INTO api_tokens (benutzer_id, token, geraet, aktiv, gueltig_bis)
    VALUES (?, ?, 'Magic-Link', TRUE, ?)
");
$stmt->execute([$benutzer_id, $api_token, $gueltig_bis]);

// ---- Aktivitaet loggen ----
try {
    $pdo->prepare("
        INSERT INTO aktivitaeten (benutzer_id, typ, beschreibung, details_json)
        VALUES (?, 'login', ?, ?)
    ")->execute([
        $benutzer_id,
        'Anmeldung via Magic Link',
        json_encode(['email' => $email, 'neu' => $ist_neu], JSON_UNESCAPED_UNICODE),
    ]);
} catch (\Throwable $e) {
    error_log('Aktivitaet loggen fehlgeschlagen: ' . $e->getMessage());
}

// ---- Weiterleitung in die App ----
$dashboard_url_js  = json_encode($basis_url . '/#/dashboard');
$api_token_json    = json_encode($api_token);   // nur Hex, kein XSS-Risiko
$ist_neu_json      = json_encode($ist_neu);
$ist_neu_param     = $ist_neu ? '1' : '0';

// Android-App erkennen: entweder WebView ("wv" im UA) oder normaler Android-Browser
$user_agent  = $_SERVER['HTTP_USER_AGENT'] ?? '';
$ist_android = stripos($user_agent, 'Android') !== false;
$ist_webview = $ist_android && (stripos($user_agent, 'wv') !== false
    || stripos($user_agent, '; wv)') !== false);

// Custom-Scheme-URL fuer die Android-App
$custom_url      = 'vokabeltrainer://token?vt_token=' . urlencode($api_token)
    . '&neu=' . $ist_neu_param;
$ist_android_json = json_encode($ist_android);  // true/false fuer JS
$custom_url_json  = json_encode($custom_url);   // nur sichere Zeichen

// Play-Store-URL aus DB-Konfiguration (Fallback auf generische Package-ID-URL)
$playstore_url_roh = konfig_wert('app_playstore_url', '') ?? '';
if ($playstore_url_roh === '') {
    $playstore_url_roh = 'https://play.google.com/store/apps/details?id=com.example.vokabeltrainerse';
}
$playstore_url_json = json_encode($playstore_url_roh);

http_response_code(200);
header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex');
header('Cache-Control: no-store, no-cache, must-revalidate');
echo <<<HTML
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Anmeldung — Vokabeltrainer</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: linear-gradient(135deg, #006AA7 0%, #004C7A 100%);
         display: flex; align-items: center; justify-content: center;
         min-height: 100vh; }
  .box { background: #fff; border-radius: 16px; padding: 40px 32px;
         max-width: 360px; width: 100%; text-align: center;
         box-shadow: 0 10px 40px rgba(0,0,0,.2); }
  .flagge { font-size: 48px; display: block; margin-bottom: 16px; }
  h1 { font-size: 20px; font-weight: 500; color: #1a1c1e; margin-bottom: 8px; }
  p  { font-size: 14px; color: #607d8b; margin-bottom: 8px; }
  .spinner {
    display: inline-block; width: 32px; height: 32px;
    border: 3px solid #e0e0e0; border-top-color: #006AA7;
    border-radius: 50%; animation: spin 0.8s linear infinite;
    margin: 20px auto 12px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .app-btn {
    display: block; margin-top: 12px; background: #006AA7; color: #fff;
    text-decoration: none; padding: 12px 28px; border-radius: 28px;
    font-size: 15px; font-weight: 600; cursor: pointer; border: none;
    width: 100%;
  }
  .app-btn.store { background: #01875f; }
  .browser-link {
    display: block; margin-top: 12px; font-size: 13px; color: #90a4ae;
    text-decoration: underline; cursor: pointer; background: none; border: none;
  }
</style>
</head>
<body>
<div class="box">
  <span class="flagge">&#x1F1F8;&#x1F1EA;</span>
  <h1>Anmeldung erfolgreich!</h1>
  <p id="status-text">Du wirst weitergeleitet&hellip;</p>
  <div class="spinner" id="spinner"></div>
  <div id="app-btn-bereich" style="display:none">
    <p>Wie m&ouml;chtest du fortfahren?</p>
    <a href="{$custom_url}" class="app-btn">&#x1F4F1; In App &ouml;ffnen</a>
    <a id="playstore-btn" href="{$playstore_url_roh}" class="app-btn store">&#x1F6D2; App installieren (Play&nbsp;Store)</a>
    <button class="browser-link" onclick="weiterImBrowser()">Im Browser fortfahren</button>
  </div>
</div>
<script>
(function() {
    var apiToken    = {$api_token_json};
    var istNeu      = {$ist_neu_json};
    var istAndroid  = {$ist_android_json};
    var customUrl   = {$custom_url_json};
    var dashUrl     = {$dashboard_url_js};
    var playstoreUrl = {$playstore_url_json};

    // Token SOFORT in localStorage speichern — unabhaengig von Geraet/Browser.
    // Dadurch ist er verfuegbar, sobald die SPA geladen wird, egal ob der
    // WebView direkt weiterleitet oder die native App zurueck navigiert.
    try {
        localStorage.setItem('vt_token', apiToken);
        if (istNeu) sessionStorage.setItem('vt_neu_registriert', '1');
    } catch (e) {}

    function weiterImBrowser() {
        // Token ist bereits gesetzt — nur noch zur SPA navigieren
        window.location.replace(dashUrl);
    }

    // Globale Funktion (fuer onclick im Button)
    window.weiterImBrowser = weiterImBrowser;

    // In-App-WebView erkennen: Android-Bridge gesetzt ODER "; wv)" im User-Agent
    // (Standard-Indikator fuer Android System WebView in eigenen Apps)
    var istInAppWebView = (typeof window.Android !== 'undefined')
        || /;\s*wv\)/.test(navigator.userAgent);

    if (istAndroid && !istInAppWebView) {
        // Android-Browser (Chrome etc.) — App moeglicherweise nicht geoeffnet.
        // Play-Store-Button befuellen und Custom-Scheme-Redirect versuchen.
        var psBtn = document.getElementById('playstore-btn');
        if (psBtn && playstoreUrl) psBtn.href = playstoreUrl;

        // Versuche App per Custom-Scheme zu oeffnen (token steht im URL-Parameter
        // fuer den Fall, dass App-WebView und Browser-localStorage getrennt sind)
        window.location.href = customUrl;

        // Nach 1,5 Sekunden: App nicht installiert oder Browser blieb offen?
        // Token ist bereits in localStorage — Auswahlbuttons zeigen.
        setTimeout(function() {
            document.getElementById('spinner').style.display = 'none';
            document.getElementById('status-text').textContent = 'Wie m\u00f6chtest du fortfahren?';
            document.getElementById('app-btn-bereich').style.display = 'block';
        }, 1500);

    } else {
        // Desktop, iOS, oder Android-App-WebView:
        // Token ist bereits in localStorage → direkt zur SPA weiterleiten.
        weiterImBrowser();
    }
})();
</script>
</body>
</html>
HTML;
exit;

// ---- Hilfsfunktion: Benutzernamen generieren ----
function _benutzernamen_generieren(string $email, \PDO $pdo): string
{
    // E-Mail-Prefix bereinigen (nur Buchstaben/Zahlen + Unterstrich)
    $lokal  = explode('@', $email)[0];
    $prefix = preg_replace('/[^a-z0-9]+/', '_', strtolower($lokal)) ?? 'benutzer';
    $prefix = trim($prefix, '_');
    $prefix = substr($prefix, 0, 20);
    if ($prefix === '') {
        $prefix = 'benutzer';
    }

    // Einzigartigen Namen suchen
    $stmt = $pdo->prepare("SELECT id FROM benutzer WHERE benutzername = ? LIMIT 1");
    $versuche = 0;
    do {
        $name = $prefix . '_' . rand(1000, 9999);
        $stmt->execute([$name]);
        $versuche++;
        if ($versuche > 20) {
            // Notfall: zufaelliger Name
            $name = 'nutzer_' . bin2hex(random_bytes(4));
            break;
        }
    } while ($stmt->fetch() !== false);

    return $name;
}
