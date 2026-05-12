<?php
/**
 * api/version.php — Versions-Endpunkt
 *
 * Gibt den aktuellen Versions-Hash der App zurück (max. mtime aller JS/CSS-Dateien).
 * Kein Auth erforderlich — enthält keine sensitiven Daten.
 * Wird von app.js beim Start gepollt, um Stale-Content in Android WebView zu erkennen.
 *
 * Antwort: { "version": "abc123", "ts": 1234567890 }
 */

header('Content-Type: application/json; charset=utf-8');
// Dieser Endpunkt selbst darf nie gecacht werden
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');

$basis = dirname(__DIR__);

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

sort($teile); // reproduzierbare Reihenfolge
$version = empty($teile) ? '0' : substr(md5(implode('|', $teile)), 0, 8);
$maxMtime = empty($teile) ? 0 : max(array_map(fn($t) => (int)explode(':', $t)[0], $teile));

echo json_encode([
    'version' => $version,
    'ts'      => $maxMtime,
], JSON_UNESCAPED_SLASHES);
