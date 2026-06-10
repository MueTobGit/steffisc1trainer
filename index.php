<?php
/**
 * index.php — SPA-Einstiegspunkt
 *
 * Sendet No-Cache-Header (damit Android WebView nie eine veraltete Version anzeigt)
 * und berechnet einen Versions-Hash aus den Änderungszeitstempeln aller JS/CSS-Dateien.
 * Der Hash wird als window.APP_VERSION injiziert und als ?v= an alle Asset-URLs gehängt.
 */

// ---- Kein Caching für das HTML-Dokument ----
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

// ---- Versions-Hash berechnen ----
// max(mtime) aller JS- und CSS-Dateien → base36-Hash (kurz + URL-sicher)
function _app_version_berechnen(string $basis): string {
    $muster = [
        $basis . '/oeffentlich/js/*.js',
        $basis . '/oeffentlich/js/module/*.js',
        $basis . '/oeffentlich/js/komponenten/*.js',
        $basis . '/oeffentlich/js/dienste/*.js',
        $basis . '/oeffentlich/css/*.css',
    ];
    $teile = [];
    foreach ($muster as $m) {
        foreach (glob($m) ?: [] as $datei) {
            $stat = @stat($datei);
            if ($stat) {
                $teile[] = $stat['mtime'] . ':' . $stat['size'];
            }
        }
    }
    if (empty($teile)) return '0';
    sort($teile);
    return substr(md5(implode('|', $teile)), 0, 8);
}

$v = _app_version_berechnen(__DIR__);
?><!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Steffis C1-Trainer — Englisch C1 Vokabeltraining">
    <meta name="theme-color" content="#012169">

    <title>Steffis C1-Trainer</title>

    <!-- Favicons -->
    <link rel="icon" type="image/svg+xml" href="oeffentlich/bilder/favicon.svg">
    <link rel="icon" type="image/png" href="oeffentlich/bilder/favicon.png">

    <!-- Lokale Schriften (DSGVO-konform, lange gecacht – ändern sich nie) -->
    <link rel="preload" href="oeffentlich/schriften/roboto-regular.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="oeffentlich/schriften/roboto-medium.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="oeffentlich/schriften/material-symbols-outlined.woff2" as="font" type="font/woff2" crossorigin>

    <!-- CSS (mit Versions-Hash → Cache-Buster bei Deployments) -->
    <link rel="stylesheet" href="oeffentlich/css/thema.css?v=<?= $v ?>">
    <link rel="stylesheet" href="oeffentlich/css/haupt.css?v=<?= $v ?>">
    <link rel="stylesheet" href="oeffentlich/css/anmeldung.css?v=<?= $v ?>">
    <link rel="stylesheet" href="oeffentlich/css/verwaltung.css?v=<?= $v ?>">
    <link rel="stylesheet" href="oeffentlich/css/lernmodus.css?v=<?= $v ?>">
    <link rel="stylesheet" href="oeffentlich/css/training.css?v=<?= $v ?>">
    <link rel="stylesheet" href="oeffentlich/css/schnellueben.css?v=<?= $v ?>">
    <link rel="stylesheet" href="oeffentlich/css/feinschliff.css?v=<?= $v ?>">
    <link rel="stylesheet" href="oeffentlich/css/nachtippen.css?v=<?= $v ?>">

    <!-- Material Web Bundle (wird spaeter hinzugefuegt) -->
    <!-- <script type="module" src="oeffentlich/js/material-web-bundle.js?v=<?= $v ?>"></script> -->

    <!-- Versions-Konstante für JavaScript (wird von app.js und router.js verwendet) -->
    <script>window.APP_VERSION = '<?= htmlspecialchars($v, ENT_QUOTES) ?>';</script>

    <!-- App (mit Versions-Hash im URL → WebView lädt immer die aktuelle Version) -->
    <script type="module" src="oeffentlich/js/app.js?v=<?= $v ?>"></script>
</head>
<body>
    <!-- Lade-Bildschirm -->
    <div id="lade-bildschirm" class="lade-bildschirm">
        <div class="lade-bildschirm__inhalt">
            <div class="lade-bildschirm__logo">
                <span class="lade-bildschirm__flagge">🇬🇧</span>
            </div>
            <h1 class="lade-bildschirm__titel">Steffis C1-Trainer</h1>
            <p class="lade-bildschirm__untertitel">Englisch C1</p>
            <div class="lade-bildschirm__fortschritt">
                <div class="lade-bildschirm__fortschritt-balken"></div>
            </div>
        </div>
    </div>

    <!-- Anmeldung (versteckt bis benoetigt) -->
    <div id="anmeldung-ansicht" class="anmeldung-ansicht versteckt">
        <!-- Wird von anmeldung.js befuellt -->
    </div>

    <!-- Haupt-App (versteckt bis authentifiziert) -->
    <div id="app-container" class="app-container versteckt">
        <!-- Seitenleiste (Desktop) -->
        <aside id="seitenleiste" class="seitenleiste">
            <!-- Wird von seitenleiste.js befuellt -->
        </aside>

        <!-- Hauptbereich -->
        <main class="hauptbereich">
            <!-- Kopfzeile -->
            <header id="kopfzeile" class="kopfzeile">
                <!-- Wird von kopfzeile.js befuellt -->
            </header>

            <!-- Inhalt (Module werden hier gerendert) -->
            <div id="inhalt" class="inhalt">
                <!-- Module laden ihren Inhalt hier -->
            </div>
        </main>

        <!-- Untere Leiste (Mobil) -->
        <nav id="unten-leiste" class="unten-leiste">
            <!-- Wird von unten-leiste.js befuellt -->
        </nav>
    </div>

    <!-- Benachrichtigungen / Snackbar -->
    <div id="benachrichtigungen" class="benachrichtigungen-container"></div>

    <!-- Impressum/Datenschutz (immer erreichbar) -->
    <div id="rechtliches-ansicht" class="rechtliches-ansicht versteckt">
        <!-- Wird bei Bedarf von impressum.js befuellt -->
    </div>

    <noscript>
        <div style="text-align:center; padding:2rem; font-family:sans-serif;">
            <h1>JavaScript erforderlich</h1>
            <p>Bitte aktiviere JavaScript, um den Vokabeltrainer zu nutzen.</p>
        </div>
    </noscript>
</body>
</html>
