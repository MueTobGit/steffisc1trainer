<?php
/**
 * API: Admin — i18n Datei-Editor (file-basiert)
 *
 * Verwaltet modulare Sprachdateien in oeffentlich/sprachen/module/{namespace}.json
 * Format jeder Datei: { "de": { "key": "Text" }, "sv": { "key": "Text" } }
 *
 * GET    ?modul=X       — Modul-Daten laden (Keys + DE/SV-Texte)
 * GET    (ohne Param)   — Namespace-Liste mit Status (hat_datei, keys, fehlend)
 * POST   ?aktion=erstellen  — Neue Modul-JSON anlegen (befuellt aus lang_de/sv.json)
 * POST   ?aktion=speichern  — Modul-JSON speichern
 * POST   ?aktion=bauen      — Alle Module → lang_de.json + lang_sv.json mergen
 *
 * Nur fuer Admins.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';

methode_erzwingen(['GET', 'POST']);

$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

$methode = $_SERVER['REQUEST_METHOD'];
$aktion  = $_GET['aktion'] ?? '';
$modul   = trim($_GET['modul'] ?? '');

// --- Pfade ---
$sprachen_dir = dirname(__DIR__, 2) . '/oeffentlich/sprachen/';
$module_dir   = $sprachen_dir . 'module/';
$lang_de_pfad = $sprachen_dir . 'lang_de.json';
$lang_sv_pfad = $sprachen_dir . 'lang_sv.json';

// Sicherstellen dass module/ Verzeichnis existiert
if (!is_dir($module_dir)) {
    mkdir($module_dir, 0755, true);
}

// ============================================================
// Hilfsfunktionen
// ============================================================

function _modul_name_bereinigen(string $name): string {
    return preg_replace('/[^a-z0-9_]/', '', strtolower($name));
}

/** Liest alle Namespaces aus lang_de.json (Prefix vor dem ersten Punkt) */
function _namespaces_aus_json(string $pfad): array {
    if (!file_exists($pfad)) return [];
    $json = json_decode(file_get_contents($pfad), true) ?? [];
    $ns = [];
    foreach (array_keys($json) as $key) {
        $p = explode('.', $key, 2)[0];
        if ($p !== '') $ns[$p] = true;
    }
    return array_keys($ns);
}

/** Liest eine Modul-JSON-Datei oder gibt leere Struktur zurueck */
function _modul_datei_laden(string $module_dir, string $modul): array {
    $pfad = $module_dir . $modul . '.json';
    if (!file_exists($pfad)) return ['de' => [], 'sv' => []];
    $data = json_decode(file_get_contents($pfad), true);
    if (!is_array($data)) return ['de' => [], 'sv' => []];
    return [
        'de' => is_array($data['de'] ?? null) ? $data['de'] : [],
        'sv' => is_array($data['sv'] ?? null) ? $data['sv'] : [],
    ];
}

/** Schreibt eine Modul-JSON-Datei */
function _modul_datei_schreiben(string $module_dir, string $modul, array $de, array $sv): bool {
    $pfad   = $module_dir . $modul . '.json';
    $inhalt = json_encode(
        ['de' => $de, 'sv' => $sv],
        JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    return file_put_contents($pfad, $inhalt) !== false;
}

/** Extrahiert Keys eines Namespace aus einer grossen JSON-Datei */
function _keys_aus_grosser_json(string $pfad, string $namespace): array {
    if (!file_exists($pfad)) return [];
    $json   = json_decode(file_get_contents($pfad), true) ?? [];
    $prefix = $namespace . '.';
    $result = [];
    foreach ($json as $k => $v) {
        if (str_starts_with($k, $prefix)) {
            $result[substr($k, strlen($prefix))] = $v;
        }
    }
    return $result;
}

// ============================================================
// GET
// ============================================================

if ($methode === 'GET') {

    // --- Einzelnes Modul laden ---
    if ($modul !== '') {
        $modul = _modul_name_bereinigen($modul);
        if ($modul === '') {
            json_fehler('UNGUELTIGE_EINGABE', 'Ungültiger Modulname.', 400);
        }

        $hat_datei  = file_exists($module_dir . $modul . '.json');
        $datei_data = _modul_datei_laden($module_dir, $modul);

        // Referenz-Keys aus den grossen Dateien (fuer vollstaendige Anzeige aller Keys)
        $ref_de = _keys_aus_grosser_json($lang_de_pfad, $modul);
        $ref_sv = _keys_aus_grosser_json($lang_sv_pfad, $modul);

        // Ausgabe-Keys: Wenn Datei existiert, Datei-Inhalt nehmen.
        // Fehlende Keys (noch nicht in Datei) aus Referenz mit leerem Wert ergaenzen.
        $out_de = $hat_datei ? $datei_data['de'] : $ref_de;
        $out_sv = $hat_datei ? $datei_data['sv'] : $ref_sv;

        // Sicherstellen dass alle Referenz-Keys vorhanden sind (mit leerem Wert)
        foreach (array_keys($ref_de) as $k) {
            if (!array_key_exists($k, $out_de)) $out_de[$k] = '';
        }

        json_erfolg([
            'modul'     => $modul,
            'hat_datei' => $hat_datei,
            'de'        => $out_de,
            'sv'        => $out_sv,
        ]);
    }

    // --- Namespace-Liste ---
    $namespaces = _namespaces_aus_json($lang_de_pfad);
    sort($namespaces);

    $liste = [];
    foreach ($namespaces as $ns) {
        $hat_datei = file_exists($module_dir . $ns . '.json');

        if ($hat_datei) {
            $daten        = _modul_datei_laden($module_dir, $ns);
            $keys_gesamt  = count($daten['de']);
            $keys_fehlend = 0;
            foreach (array_keys($daten['de']) as $k) {
                if (trim($daten['sv'][$k] ?? '') === '') $keys_fehlend++;
            }
        } else {
            // Aus grosser JSON zaehlen
            $de_keys      = _keys_aus_grosser_json($lang_de_pfad, $ns);
            $sv_keys      = _keys_aus_grosser_json($lang_sv_pfad, $ns);
            $keys_gesamt  = count($de_keys);
            $keys_fehlend = 0;
            foreach (array_keys($de_keys) as $k) {
                if (trim($sv_keys[$k] ?? '') === '') $keys_fehlend++;
            }
        }

        $liste[] = [
            'modul'        => $ns,
            'hat_datei'    => $hat_datei,
            'keys_gesamt'  => $keys_gesamt,
            'keys_fehlend' => $keys_fehlend,
        ];
    }

    json_erfolg(['module' => $liste]);
}

// ============================================================
// POST
// ============================================================

if ($methode === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true) ?? [];

    // --- Erstellen: Neue Modul-JSON anlegen ---
    if ($aktion === 'erstellen') {
        $name = _modul_name_bereinigen($body['modul'] ?? '');
        if ($name === '') {
            json_fehler('UNGUELTIGE_EINGABE', 'Modulname fehlt.', 400);
        }

        $pfad = $module_dir . $name . '.json';
        if (file_exists($pfad)) {
            json_fehler('DOPPELTER_EINTRAG', 'Eine JSON-Datei fuer dieses Modul existiert bereits.', 409);
        }

        // Keys aus grossen Sprachdateien als Ausgangsbasis importieren
        $de_data = _keys_aus_grosser_json($lang_de_pfad, $name);
        $sv_data = _keys_aus_grosser_json($lang_sv_pfad, $name);

        if (empty($de_data)) {
            json_fehler('NICHT_GEFUNDEN', 'Keine Keys fuer diesen Namespace in lang_de.json gefunden.', 404);
        }

        if (!_modul_datei_schreiben($module_dir, $name, $de_data, $sv_data)) {
            json_fehler('SERVERFEHLER', 'Datei konnte nicht geschrieben werden.', 500);
        }

        json_erfolg([
            'modul'      => $name,
            'keys_de'    => count($de_data),
            'keys_sv'    => count($sv_data),
        ], 'Modul-JSON erstellt.');
    }

    // --- Speichern: Modul-JSON aktualisieren ---
    if ($aktion === 'speichern') {
        $name = _modul_name_bereinigen($body['modul'] ?? '');
        if ($name === '') {
            json_fehler('UNGUELTIGE_EINGABE', 'Modulname fehlt.', 400);
        }

        $de_roh = $body['de'] ?? [];
        $sv_roh = $body['sv'] ?? [];

        if (!is_array($de_roh) || !is_array($sv_roh)) {
            json_fehler('UNGUELTIGE_EINGABE', 'Ungueltige Datenstruktur.', 400);
        }

        // Keys und Werte bereinigen
        $de_clean = [];
        $sv_clean = [];
        foreach ($de_roh as $k => $v) {
            $k_sauber = preg_replace('/[^a-z0-9_]/', '', strtolower((string)$k));
            if ($k_sauber !== '') $de_clean[$k_sauber] = (string)$v;
        }
        foreach ($sv_roh as $k => $v) {
            $k_sauber = preg_replace('/[^a-z0-9_]/', '', strtolower((string)$k));
            if ($k_sauber !== '') $sv_clean[$k_sauber] = (string)$v;
        }

        if (!_modul_datei_schreiben($module_dir, $name, $de_clean, $sv_clean)) {
            json_fehler('SERVERFEHLER', 'Datei konnte nicht gespeichert werden.', 500);
        }

        $fehlend = 0;
        foreach (array_keys($de_clean) as $k) {
            if (trim($sv_clean[$k] ?? '') === '') $fehlend++;
        }

        json_erfolg([
            'modul'        => $name,
            'keys_gesamt'  => count($de_clean),
            'keys_fehlend' => $fehlend,
        ], 'Modul gespeichert.');
    }

    // --- Bauen: Alle Modul-JSONs → lang_de.json + lang_sv.json ---
    if ($aktion === 'bauen') {
        $dateien = glob($module_dir . '*.json') ?: [];
        sort($dateien);

        $merged_de = [];
        $merged_sv = [];

        foreach ($dateien as $datei) {
            $ns   = basename($datei, '.json');
            $data = json_decode(file_get_contents($datei), true);
            if (!is_array($data)) continue;

            foreach (($data['de'] ?? []) as $k => $v) {
                $merged_de[$ns . '.' . $k] = $v;
            }
            foreach (($data['sv'] ?? []) as $k => $v) {
                $merged_sv[$ns . '.' . $k] = $v;
            }
        }

        // Alphabetisch sortieren fuer saubere Git-History
        ksort($merged_de);
        ksort($merged_sv);

        $ok_de = file_put_contents(
            $lang_de_pfad,
            json_encode($merged_de, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
        );
        $ok_sv = file_put_contents(
            $lang_sv_pfad,
            json_encode($merged_sv, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
        );

        if ($ok_de === false || $ok_sv === false) {
            json_fehler('SERVERFEHLER', 'Fehler beim Schreiben der Sprachdateien.', 500);
        }

        json_erfolg([
            'keys_de'      => count($merged_de),
            'keys_sv'      => count($merged_sv),
            'module_count' => count($dateien),
        ], 'Sprachdateien gebaut (' . count($merged_de) . ' Keys aus ' . count($dateien) . ' Modulen).');
    }

    json_fehler('UNGUELTIGE_EINGABE', 'Unbekannte Aktion.', 400);
}
