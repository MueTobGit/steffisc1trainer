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
// BASIS_URL_WERT kommt aus umgebung.php (z.B. '' fuer Root, '/vokabeltrainer' fuer XAMPP)
define('BASIS_URL', defined('BASIS_URL_WERT') ? BASIS_URL_WERT : '/vokabeltrainer');
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
define('ERLAUBTE_AUDIO_TYPEN', ['audio/mpeg', 'audio/wav', 'audio/ogg']);

// ---- Paginierung ----
define('STANDARD_PRO_SEITE', 20);
define('MAX_PRO_SEITE', 1000);

// ---- Lern-Algorithmus ----
define('MAX_STUFE', 6);
define('MIN_LEICHTIGKEITSFAKTOR', 1.6);     // Erhöht von 1.3 → Verhindert "Ease Hell"
define('MAX_LEICHTIGKEITSFAKTOR', 5.0);     // Verhindert unbegrenztes EF-Wachstum (+0.1/Runde bei Q=5)
define('START_LEICHTIGKEITSFAKTOR', 2.5);
define('MAX_INTERVALL_TAGE', 365);          // 1 Jahr — realistisches Maximum für Sprachenlernen
define('NEUE_VOKABELN_PRO_TAG', 10);
define('LAPSE_INTERVALL_FAKTOR', 0.25);     // Proportionales Recovery nach Fehler (25% des alten Intervalls)
define('PROBLEMVOKABEL_GEWICHT_BONUS', 1.5);// Gewichtsmultiplikator für Vokabeln mit > 50% Fehlerquote

// ---- Gamification ----
define('XP_PRO_STUFE', [0 => 5, 1 => 5, 2 => 10, 3 => 10, 4 => 15, 5 => 15, 6 => 20]);
define('MULTIPLIKATOR_PERFEKT', 1.5);
define('MULTIPLIKATOR_STREAK', 1.2);
define('MULTIPLIKATOR_ERSTES_MAL', 2.0);
define('SCHNELLUEBEN_XP_FAKTOR', 0.5);
define('LEVEL_AUFSTIEG_BONUS_XP', 100);

// ---- Absolut-Schwellen fuer Level-Aufstieg (Vokabeln auf Stufe 3+) ----
// Orientiert an Rivstart: A1=1000, A2=2200, B1=4000, B2=6500 Woerter
define('LEVEL_AUFSTIEG_SCHWELLEN', [
    1 => 0,     // Einsteiger: Startwert (A1-Inhalte)
    2 => 1000,  // Lernender:  1000+ Vokabeln auf Stufe 3+ (A2-Inhalte)
    3 => 2200,  // Fortgeschrittener: 2200+ (B1-Inhalte)
    4 => 4000,  // Experte: 4000+ (B2-Inhalte)
    5 => 6500,  // Meister: 6500+ (C1/C2-Inhalte)
]);

// ---- Sterne ----
define('XP_PRO_BRONZE', 500);
define('XP_PRO_SILBER', 2500);
define('XP_PRO_GOLD', 12500);

// ---- Level-System (Lern-Horizonte) ----
define('LEVEL_FORMEN', [
    1 => ['unbestimmt_singular', 'infinitiv', 'praesens', 'grundform'],
    2 => ['bestimmt_singular', 'supinum', 'neutrum_form'],
    3 => ['praeteritum', 'unbestimmt_plural', 'bestimmt_plural', 'komparativ'],
    4 => ['imperativ', 'superlativ', 'bestimmte_form', 'perfekt_partizip'],
    5 => [],  // Alle Formen (kumulativ)
]);

// ---- Wortart → Formen-Zuordnung ----
define('WORTART_FORMEN', [
    'Nomen' => ['unbestimmt_singular', 'bestimmt_singular', 'unbestimmt_plural', 'bestimmt_plural'],
    'Verb'  => ['infinitiv', 'praesens', 'praeteritum', 'supinum', 'imperativ', 'perfekt_partizip'],
    'Adjektiv' => ['grundform', 'komparativ', 'superlativ', 'bestimmte_form', 'neutrum_form'],
]);

// ---- Sprachstufen-Filter fuer Saetze (kumulativ, orientiert an Rivstart) ----
define('LEVEL_SPRACHNIVEAU', [
    1 => ['A1'],
    2 => ['A1', 'A2'],
    3 => ['A1', 'A2', 'B1'],
    4 => ['A1', 'A2', 'B1', 'B2'],
    5 => ['A1', 'A2', 'B1', 'B2', 'C1'],
]);

// C2 wird erst ab dieser Schwelle (Vokabeln auf Stufe 3+) freigeschaltet
define('C2_SCHWELLE', 10000);

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

// ---- KI / Gemini (primär) ----
define('GEMINI_API_KEY', 'GEMINI_API_KEY_ENTFERNT');
define('GEMINI_MODELL',  'gemini-2.5-flash');
define('GEMINI_API_URL', 'https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s');

// ---- KI / Claude (Fallback) ----
define('CLAUDE_API_KEY',     'CLAUDE_API_KEY_ENTFERNT');
define('CLAUDE_MODELL',      'claude-haiku-4-5');
define('CLAUDE_API_URL',     'https://api.anthropic.com/v1/messages');
define('CLAUDE_API_VERSION', '2023-06-01');
