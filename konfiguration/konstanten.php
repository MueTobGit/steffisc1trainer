<?php
/**
 * Globale Konstanten
 *
 * Basis-URL, Pfade, Limits und Vorgabewerte.
 */

declare(strict_types=1);

// ---- Pfade ----
define('BASIS_PFAD', dirname(__DIR__));
define('KONFIG_PFAD', BASIS_PFAD . '/konfiguration');
define('API_PFAD', BASIS_PFAD . '/api');
define('OEFFENTLICH_PFAD', BASIS_PFAD . '/oeffentlich');
define('UPLOAD_PFAD', OEFFENTLICH_PFAD . '/uploads');
define('SCHRIFTEN_PFAD', OEFFENTLICH_PFAD . '/schriften');

// ---- URL ----
// BASIS_URL_WERT kommt aus umgebung.php (z.B. '' fuer Root, '/steffisc1trainer' fuer XAMPP)
define('BASIS_URL', defined('BASIS_URL_WERT') ? BASIS_URL_WERT : '/steffisc1trainer');
define('API_URL', BASIS_URL . '/api');
define('OEFFENTLICH_URL', BASIS_URL . '/oeffentlich');

// ---- Auth ----
define('TOKEN_LAENGE', 32);                    // 32 Bytes = 64 Hex-Zeichen
define('TOKEN_GUELTIG_TAGE', 90);
define('BCRYPT_KOSTEN', 12);
define('MAX_LOGIN_VERSUCHE', 5);
define('LOGIN_SPERRE_MINUTEN', 15);

// ---- Upload ----
define('MAX_UPLOAD_BYTES', 5 * 1024 * 1024);   // 5 MB
// SVG bewusst ausgeschlossen: kann <script>-Tags enthalten und ist in <object>/<iframe> ausführbar → XSS.
define('ERLAUBTE_BILD_TYPEN', ['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

// ---- Paginierung ----
define('STANDARD_PRO_SEITE', 20);
define('MAX_PRO_SEITE', 1000);

// ---- Lern-Algorithmus ----
define('MAX_STUFE', 6);
define('MIN_LEICHTIGKEITSFAKTOR', 1.6);     // Erhöht von 1.3 → Verhindert "Ease Hell"
define('MAX_LEICHTIGKEITSFAKTOR', 5.0);     // Verhindert unbegrenztes EF-Wachstum (+0.1/Runde bei Q=5)
define('START_LEICHTIGKEITSFAKTOR', 2.5);
define('MAX_INTERVALL_TAGE', 365);          // 1 Jahr — realistisches Maximum für Sprachenlernen
define('LAPSE_INTERVALL_FAKTOR', 0.25);     // Proportionales Recovery nach Fehler (25% des alten Intervalls)
define('PROBLEMVOKABEL_GEWICHT_BONUS', 1.5);// Gewichtsmultiplikator für Vokabeln mit > 50% Fehlerquote

// ---- Intervall-Tabelle (Leitner Basis) ----
define('STUFEN_INTERVALLE', [
    0 => 0,    // sofort
    1 => 1,    // 1 Tag
    2 => 3,    // 3 Tage
    3 => 7,    // 7 Tage
    4 => 14,   // 14 Tage
    5 => 30,   // 30 Tage
    6 => 90,   // 90 Tage
]);

