<?php
/**
 * API: Vokabeln — CSV-Import
 *
 * POST /api/vokabeln/importieren.php
 *
 * Importiert Vokabeln aus CSV (Semikolon-getrennt).
 * Mehrzeilig: typ-Spalte V=Vokabel, F=Form, S=Satz.
 * 3 Duplikat-Modi: ueberspringen, ueberschreiben, zusammenfuehren.
 * Zusaetzlich: per-Vokabel-Entscheidungen und Synonym-Erstellung.
 * Nur Admin.
 *
 * Body (JSON):
 *   - csv_inhalt: String (CSV-Inhalt)
 *   - duplikat_modus: 'ueberspringen'|'ueberschreiben'|'zusammenfuehren' (Standard: zusammenfuehren)
 *   - duplikat_entscheidungen: {"{englisch}|{wortart}": "behalten"|"ueberschreiben"|"zusammenfuehren"} (optional)
 *   - synonyme_erstellen: [{csv_englisch, csv_wortart, db_id}] (optional)
 *   - privat_wiederherstellen: true/false (optional, Standard: false)
 *       Disaster-Recovery-Modus: Liest ist_privat und besitzer_id (numerisch) aus CSV.
 *       Rueckwaertskompatibel: falls besitzer_id fehlt, wird besitzer (Benutzername) aufgeloest.
 *       Stellt private Vokabeln mit korrektem Besitzer wieder her.
 *       Nur wirksam wenn ist_privat=1 in der CSV-Zeile steht (oeffentliche werden normal importiert).
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/autorisierung.php';
require_once dirname(__DIR__) . '/_middleware/validierung.php';

// --- Methode pruefen ---
methode_erzwingen('POST');

// --- Authentifizierung + Autorisierung ---
$benutzer = benutzer_authentifizieren();
admin_erzwingen($benutzer);

// --- CSV-Inhalt lesen ---
$csv_inhalt = '';
$duplikat_modus = 'zusammenfuehren';
$duplikat_entscheidungen = [];
$synonyme_erstellen = [];
$privat_wiederherstellen = false;

$content_type = $_SERVER['CONTENT_TYPE'] ?? '';

if (str_contains($content_type, 'multipart/form-data')) {
    if (empty($_FILES['datei']) || $_FILES['datei']['error'] !== UPLOAD_ERR_OK) {
        fehler_ungueltige_eingabe('Keine Datei hochgeladen oder Upload-Fehler.');
    }
    $csv_inhalt = file_get_contents($_FILES['datei']['tmp_name']);
    $duplikat_modus = $_POST['duplikat_modus'] ?? 'zusammenfuehren';
    $privat_wiederherstellen = ($_POST['privat_wiederherstellen'] ?? '0') === '1';
} else {
    $daten = json_body_lesen();

    if (empty($daten['csv_inhalt'])) {
        fehler_ungueltige_eingabe('Feld "csv_inhalt" ist erforderlich.');
    }

    $csv_inhalt              = $daten['csv_inhalt'];
    $duplikat_modus          = $daten['duplikat_modus'] ?? 'zusammenfuehren';
    $duplikat_entscheidungen = is_array($daten['duplikat_entscheidungen'] ?? null)
                               ? $daten['duplikat_entscheidungen'] : [];
    $synonyme_erstellen      = is_array($daten['synonyme_erstellen'] ?? null)
                               ? $daten['synonyme_erstellen'] : [];
    $privat_wiederherstellen = !empty($daten['privat_wiederherstellen']);
}

// Duplikat-Modus validieren
$erlaubte_modi = ['ueberspringen', 'ueberschreiben', 'zusammenfuehren', 'behalten'];
if (!in_array($duplikat_modus, $erlaubte_modi, true)) {
    fehler_ungueltige_eingabe(
        "Ungueltiger duplikat_modus. Erlaubt: " . implode(', ', $erlaubte_modi)
    );
}

// --- CSV parsen ---
// BOM entfernen
$csv_inhalt = preg_replace('/^\xEF\xBB\xBF/', '', $csv_inhalt);

$zeilen = preg_split('/\r\n|\n|\r/', $csv_inhalt);
$zeilen = array_filter($zeilen, fn($z) => trim($z) !== '');
// Reindex nach array_filter
$zeilen = array_values($zeilen);

if (count($zeilen) < 2) {
    fehler_ungueltige_eingabe('CSV muss mindestens eine Kopfzeile und eine Datenzeile enthalten.');
}

// Kopfzeile parsen
$kopfzeile_roh = array_shift($zeilen);
$kopfzeile = str_getcsv($kopfzeile_roh, ';');
$kopfzeile = array_map('trim', $kopfzeile);
$kopfzeile = array_map('mb_strtolower', $kopfzeile);

// Pflicht: typ-Spalte
if (!in_array('typ', $kopfzeile, true)) {
    fehler_ungueltige_eingabe("Pflichtspalte 'typ' fehlt in der CSV-Kopfzeile. Gefundene Spalten: " . implode(', ', $kopfzeile));
}

// --- Zeilen verarbeiten und gruppieren ---
$pdo = db_verbindung();

$ergebnis = [
    'erstellt'          => 0,
    'aktualisiert'      => 0,
    'uebersprungen'     => 0,
    'formen_erstellt'   => 0,
    'saetze_erstellt'   => 0,
    'synonyme_erstellt' => 0,
    'fehler'            => [],
];

// Gruppierung: V-Zeilen mit zugehoerigen F/S-Zeilen
// F/S-Zeilen werden per englisch-Spalte der richtigen V-Zeile zugeordnet,
// so dass auch unsortierte CSVs (z.B. aus Excel) korrekt importiert werden.
$gruppen = [];
$aktuelle_gruppe_idx = -1;
$englisch_zu_idx = []; // englisch → letzter Gruppen-Index (fuer F/S-Zuordnung)

foreach ($zeilen as $zeilen_nr => $zeile) {
    $felder = str_getcsv($zeile, ';');
    $zeile_daten = [];

    foreach ($kopfzeile as $i => $name) {
        $zeile_daten[$name] = isset($felder[$i]) ? trim($felder[$i]) : '';
    }

    $typ = strtoupper($zeile_daten['typ'] ?? '');

    if ($typ === 'V') {
        $gruppen[] = [
            'v'      => $zeile_daten,
            'formen' => [],
            'saetze' => [],
            'zeile'  => $zeilen_nr + 2,
        ];
        $aktuelle_gruppe_idx = count($gruppen) - 1;
        // Index merken fuer spaetere F/S-Zuordnung per englisch
        $sv = mb_strtolower(trim($zeile_daten['englisch'] ?? ''));
        if ($sv !== '') {
            $englisch_zu_idx[$sv] = $aktuelle_gruppe_idx;
        }
    } elseif ($typ === 'F' || $typ === 'S') {
        // Ziel-Gruppe bestimmen: primaer per englisch-Spalte, Fallback = letzte V-Zeile
        $ziel_idx = $aktuelle_gruppe_idx;
        $fs_sv = mb_strtolower(trim($zeile_daten['englisch'] ?? ''));
        if ($fs_sv !== '' && isset($englisch_zu_idx[$fs_sv])) {
            $ziel_idx = $englisch_zu_idx[$fs_sv];
        }

        if ($ziel_idx >= 0) {
            if ($typ === 'F') {
                $gruppen[$ziel_idx]['formen'][] = $zeile_daten;
            } else {
                $gruppen[$ziel_idx]['saetze'][] = $zeile_daten;
            }
        } else {
            $ergebnis['fehler'][] = "Zeile " . ($zeilen_nr + 2) . ": {$typ}-Zeile ohne zugehoerige V-Zeile.";
        }
    } else {
        if (trim($typ) !== '') {
            $ergebnis['fehler'][] = "Zeile " . ($zeilen_nr + 2) . ": Unbekannter Typ '{$typ}'.";
        }
    }
}

if (empty($gruppen)) {
    fehler_ungueltige_eingabe('Keine V-Zeilen (Vokabeln) in der CSV gefunden.');
}

// --- Jede Gruppe verarbeiten ---
$pdo->beginTransaction();

$neue_vokabel_ids = []; // "englisch|wortart" => id

try {
    foreach ($gruppen as $gruppe) {
        $v     = $gruppe['v'];
        $zeile = $gruppe['zeile'];

        // Pflichtfelder der V-Zeile
        $englisch = $v['englisch'] ?? '';
        $deutsch    = $v['deutsch'] ?? '';
        $wortart    = $v['wortart'] ?? '';

        if ($englisch === '' || $deutsch === '' || $wortart === '') {
            $ergebnis['fehler'][] = "Zeile {$zeile}: englisch='{$englisch}', deutsch='{$deutsch}', wortart='{$wortart}' — Pflichtfeld(er) fehlt/fehlen.";
            continue;
        }

        // Wortart normalisieren
        $wortart = ucfirst(mb_strtolower($wortart));
        $erlaubte_wortarten = ['Nomen', 'Verb', 'Adjektiv', 'Adverb', 'Pronomen',
                               'Praeposition', 'Konjunktion', 'Interjektion', 'Phrase'];
        if (!in_array($wortart, $erlaubte_wortarten, true)) {
            $ergebnis['fehler'][] = "Zeile {$zeile}: Ungueltige Wortart '{$wortart}'.";
            continue;
        }

        $genus       = !empty($v['genus']) ? $v['genus'] : null;
        $verbgruppe  = !empty($v['verbgruppe']) ? $v['verbgruppe'] : null;
        $sprachniveau = !empty($v['sprachniveau']) ? strtoupper($v['sprachniveau']) : 'A1';
        $kategorie_name = $v['kategorie'] ?? '';
        $lektion_name   = $v['themenfeld'] ?? '';

        // Sprachniveau validieren
        if (!in_array($sprachniveau, ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'], true)) {
            $sprachniveau = 'A1';
        }

        // Kategorie aufloesen oder erstellen
        $kategorie_id = null;
        if ($kategorie_name !== '') {
            $kategorie_id = _kategorie_aufloesen($pdo, $kategorie_name);
        }

        // --- Disaster-Recovery: ist_privat + besitzer_id aus CSV lesen ---
        $csv_ist_privat = false;
        $csv_besitzer_id = null;
        if ($privat_wiederherstellen && isset($v['ist_privat']) && $v['ist_privat'] === '1') {
            $csv_ist_privat = true;

            // Neue Variante: besitzer_id numerisch direkt verwenden (aktuelles Export-Format)
            if (isset($v['besitzer_id']) && is_numeric(trim($v['besitzer_id'])) && (int) trim($v['besitzer_id']) > 0) {
                $bid = (int) trim($v['besitzer_id']);
                $stmt_b = $pdo->prepare('SELECT id FROM benutzer WHERE id = ? LIMIT 1');
                $stmt_b->execute([$bid]);
                if ($stmt_b->fetchColumn() !== false) {
                    $csv_besitzer_id = $bid;
                } else {
                    $ergebnis['fehler'][] = "Zeile {$zeile}: Besitzer-ID '{$bid}' nicht gefunden — Vokabel '{$englisch}' wird oeffentlich importiert.";
                    $csv_ist_privat = false;
                }
            } else {
                // Alte Variante (Rueckwaertskompatibilitaet): besitzer (Benutzername) aufloesen
                $besitzer_name = trim($v['besitzer'] ?? '');
                if ($besitzer_name !== '') {
                    $stmt_b = $pdo->prepare('SELECT id FROM benutzer WHERE benutzername = ? LIMIT 1');
                    $stmt_b->execute([$besitzer_name]);
                    $besitzer_id_raw = $stmt_b->fetchColumn();
                    if ($besitzer_id_raw !== false) {
                        $csv_besitzer_id = (int) $besitzer_id_raw;
                    } else {
                        $ergebnis['fehler'][] = "Zeile {$zeile}: Besitzer '{$besitzer_name}' nicht gefunden — Vokabel '{$englisch}' wird oeffentlich importiert.";
                        $csv_ist_privat = false;
                    }
                }
            }
        }

        // --- Duplikat pruefen ---
        // Bei privatem Wiederherstellen: Duplikat-Check auf Basis Besitzer (gleicher User, gleiche Vokabel)
        // Bei oeffentlichem Import: nur oeffentliche Vokabeln pruefen
        if ($csv_ist_privat && $csv_besitzer_id !== null) {
            $stmt = $pdo->prepare('SELECT id FROM vokabeln WHERE englisch = ? AND wortart = ? AND ist_privat = 1 AND besitzer_id = ? LIMIT 1');
            $stmt->execute([$englisch, $wortart, $csv_besitzer_id]);
        } else {
            $stmt = $pdo->prepare('SELECT id FROM vokabeln WHERE englisch = ? AND wortart = ? AND ist_privat = 0 LIMIT 1');
            $stmt->execute([$englisch, $wortart]);
        }
        $bestehende_id_raw = $stmt->fetchColumn();
        $ist_duplikat = ($bestehende_id_raw !== false);

        // Effektiver Modus fuer diese Vokabel bestimmen (wird spaeter fuer Formen gebraucht)
        $effektiver_modus = $duplikat_modus;
        $vokabel_id = null;
        $als_neu_einfuegen = false; // true = 'behalten': trotz Duplikat als eigenstaendige neue Vokabel einfuegen

        if ($ist_duplikat) {
            $bestehende_id = (int) $bestehende_id_raw;

            // Per-Vokabel-Entscheidung hat Vorrang
            $schluessel = $englisch . '|' . $wortart;
            $entscheidung = $duplikat_entscheidungen[$schluessel] ?? null;

            if ($entscheidung === 'behalten') {
                // Beide behalten: Duplikat ignorieren, neue eigenstaendige Vokabel einfuegen
                $als_neu_einfuegen = true;
            } elseif ($entscheidung === 'ueberspringen') {
                $effektiver_modus = 'ueberspringen';
            } elseif ($entscheidung === 'ueberschreiben') {
                $effektiver_modus = 'ueberschreiben';
            } elseif ($entscheidung === 'zusammenfuehren') {
                $effektiver_modus = 'zusammenfuehren';
            }
            // Wenn $entscheidung null → bleibt $duplikat_modus

            // Globaler Modus 'behalten': Vokabel als eigenstaendige neue Vokabel einfuegen
            if (!$als_neu_einfuegen && $effektiver_modus === 'behalten') {
                $als_neu_einfuegen = true;
            }

            if (!$als_neu_einfuegen) switch ($effektiver_modus) {
                case 'ueberspringen':
                    $ergebnis['uebersprungen']++;
                    continue 2; // Naechste Gruppe

                case 'ueberschreiben':
                    $pdo->prepare("
                        UPDATE vokabeln SET
                            deutsch = ?, sprachniveau = ?, kategorie_id = ?, aktiv = 1
                        WHERE id = ?
                    ")->execute([
                        $deutsch,
                        $sprachniveau,
                        $kategorie_id,
                        $bestehende_id,
                    ]);

                    $vokabel_id = $bestehende_id;
                    $ergebnis['aktualisiert']++;
                    break;

                case 'zusammenfuehren':
                default:
                    // Kategorie nur aktualisieren wenn bisher leer
                    if ($kategorie_id !== null) {
                        $stmt = $pdo->prepare('SELECT kategorie_id FROM vokabeln WHERE id = ?');
                        $stmt->execute([$bestehende_id]);
                        $bestehende_kat = $stmt->fetchColumn();
                        if ($bestehende_kat === null || $bestehende_kat === '' || (int)$bestehende_kat === 0) {
                            $pdo->prepare('UPDATE vokabeln SET kategorie_id = ? WHERE id = ?')
                                ->execute([$kategorie_id, $bestehende_id]);
                        }
                    }

                    // Schein-Duplikat: deutsche Bedeutung ergaenzen wenn abweichend
                    $stmt_d = $pdo->prepare('SELECT deutsch FROM vokabeln WHERE id = ?');
                    $stmt_d->execute([$bestehende_id]);
                    $aktuelle_deutsch = (string) $stmt_d->fetchColumn();
                    $csv_norm = mb_strtolower(trim($deutsch));
                    $akt_norm = mb_strtolower(trim($aktuelle_deutsch));
                    if ($csv_norm !== '' && $akt_norm !== $csv_norm
                        && !str_contains($akt_norm, $csv_norm)) {
                        $pdo->prepare('UPDATE vokabeln SET deutsch = ? WHERE id = ?')
                            ->execute([$aktuelle_deutsch . ' / ' . $deutsch, $bestehende_id]);
                    }

                    // Reaktivieren falls deaktiviert
                    $pdo->prepare('UPDATE vokabeln SET aktiv = 1 WHERE id = ?')
                        ->execute([$bestehende_id]);

                    $vokabel_id = $bestehende_id;
                    $ergebnis['aktualisiert']++;
                    break;
            }
        } // end if ($ist_duplikat)

        // 'behalten': trotz Duplikat als neue eigenstaendige Vokabel einfuegen
        // Fuer die Formen-/Satz-Verarbeitung unten wie neue Vokabel behandeln
        if ($als_neu_einfuegen) {
            $ist_duplikat = false;
        }

        if (!$ist_duplikat) {
            // Neue Vokabel erstellen
            // Normalfall: Admin-Import → oeffentlich (ist_privat=0, besitzer_id=NULL)
            // Disaster-Recovery: ist_privat=1, besitzer_id=aufgeloeste ID
            // 'behalten': eigenstaendige neue Vokabel trotz gleichem englisch/wortart
            $insert_ist_privat  = $csv_ist_privat ? 1 : 0;
            $insert_besitzer_id = $csv_ist_privat ? $csv_besitzer_id : null;

            $pdo->prepare("
                INSERT INTO vokabeln
                    (englisch, deutsch, wortart, sprachniveau,
                     kategorie_id, ist_privat, besitzer_id, erstellt_von)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ")->execute([
                $englisch,
                $deutsch,
                $wortart,
                $sprachniveau,
                $csv_ist_privat ? null : $kategorie_id,
                $insert_ist_privat,
                $insert_besitzer_id,
                $benutzer['id'],
            ]);
            $vokabel_id = (int) $pdo->lastInsertId();
            $ergebnis['erstellt']++;

            $neue_vokabel_ids[$englisch . '|' . $wortart] = $vokabel_id;
        }

        // --- Saetze verarbeiten ---
        if ($vokabel_id !== null) {
            foreach ($gruppe['saetze'] as $satz_daten) {
                $satz_sv         = mb_substr($satz_daten['satz_sv'] ?? '', 0, 1000);
                $satz_de         = mb_substr($satz_daten['satz_de'] ?? '', 0, 1000);
                $benoetigte_form = mb_substr($satz_daten['benoetigte_form'] ?? '', 0, 100);

                if ($satz_sv === '' || $satz_de === '' || $benoetigte_form === '') {
                    continue;
                }

                // Duplikat-Check
                $stmt = $pdo->prepare(
                    'SELECT COUNT(*) FROM saetze WHERE vokabel_id = ? AND englisch_satz = ?'
                );
                $stmt->execute([$vokabel_id, $satz_sv]);
                if ((int) $stmt->fetchColumn() > 0) {
                    continue;
                }

                $pdo->prepare("
                    INSERT INTO saetze (vokabel_id, englisch_satz, deutsch_satz, benoetigte_form,
                                        sprachniveau, erstellt_von)
                    VALUES (?, ?, ?, ?, ?, ?)
                ")->execute([
                    $vokabel_id,
                    $satz_sv,
                    $satz_de,
                    $benoetigte_form,
                    $sprachniveau,
                    $benutzer['id'],
                ]);
                $ergebnis['saetze_erstellt']++;
            }
        }

        // --- themenfeld zuordnen ---
        if ($lektion_name !== '' && $vokabel_id !== null) {
            $themenfeld_id = _lektion_aufloesen($pdo, $lektion_name, $kategorie_id, $benutzer['id']);
            if ($themenfeld_id !== null) {
                try {
                    $pdo->prepare("
                        INSERT INTO themenfeld_vokabeln (themenfeld_id, vokabel_id, reihenfolge)
                        VALUES (?, ?, 0)
                    ")->execute([$themenfeld_id, $vokabel_id]);
                } catch (PDOException $e) {
                    if (!str_contains($e->getMessage(), 'Duplicate') && $e->getCode() !== '23000') {
                        throw $e;
                    }
                }
            }
        }
    }

    // --- Synonyme verknuepfen ---
    if (!empty($synonyme_erstellen)) {
        $syn_check  = $pdo->prepare(
            "SELECT COUNT(*) FROM synonyme WHERE vokabel_id = ? AND synonym = ? AND sprache = 'en'"
        );
        $syn_insert = $pdo->prepare(
            "INSERT INTO synonyme (vokabel_id, synonym, sprache) VALUES (?, ?, 'en')"
        );

        foreach ($synonyme_erstellen as $syn_paar) {
            $csv_englisch = $syn_paar['csv_englisch'] ?? '';
            $csv_wortart    = ucfirst(mb_strtolower($syn_paar['csv_wortart'] ?? ''));
            $db_id          = isset($syn_paar['db_id']) ? (int) $syn_paar['db_id'] : 0;

            if ($csv_englisch === '' || $db_id < 1) continue;

            $schluessel  = $csv_englisch . '|' . $csv_wortart;
            $neue_vok_id = $neue_vokabel_ids[$schluessel] ?? null;

            if ($neue_vok_id === null) {
                $stmt = $pdo->prepare('SELECT id FROM vokabeln WHERE englisch = ? AND wortart = ? AND ist_privat = 0 LIMIT 1');
                $stmt->execute([$csv_englisch, $csv_wortart]);
                $neue_vok_id = $stmt->fetchColumn();
                $neue_vok_id = ($neue_vok_id !== false) ? (int) $neue_vok_id : null;
                if ($neue_vok_id === null) continue;
            }

            // englischen Text der bestehenden DB-Vokabel holen
            $stmt = $pdo->prepare('SELECT englisch FROM vokabeln WHERE id = ? LIMIT 1');
            $stmt->execute([$db_id]);
            $db_englisch = $stmt->fetchColumn();
            if ($db_englisch === false) continue;

            // Bidirektional in synonyme-Tabelle eintragen (gleiche Logik wie synonyme_verknuepfen.php)
            foreach ([[$neue_vok_id, $db_englisch], [$db_id, $csv_englisch]] as [$vid, $syn_text]) {
                $syn_check->execute([$vid, $syn_text]);
                if ((int) $syn_check->fetchColumn() === 0) {
                    $syn_insert->execute([$vid, $syn_text]);
                    $ergebnis['synonyme_erstellt']++;
                }
            }
        }
    }

    $pdo->commit();

    $modus_label = $privat_wiederherstellen ? 'Disaster-Recovery-Import' : 'Import';
    json_erfolg($ergebnis, sprintf(
        '%s abgeschlossen: %d erstellt, %d aktualisiert, %d uebersprungen, %d Formen, %d Saetze.',
        $modus_label,
        $ergebnis['erstellt'],
        $ergebnis['aktualisiert'],
        $ergebnis['uebersprungen'],
        $ergebnis['formen_erstellt'],
        $ergebnis['saetze_erstellt']
    ));

} catch (Exception $e) {
    $pdo->rollBack();
    error_log('CSV-Import fehlgeschlagen: ' . $e->getMessage());
    fehler_server('Import fehlgeschlagen: ' . $e->getMessage());
}

// ---- Helfer-Funktionen ----

function _kategorie_aufloesen(PDO $pdo, string $name): int
{
    $stmt = $pdo->prepare('SELECT id FROM kategorien WHERE name = ? AND aktiv = 1 LIMIT 1');
    $stmt->execute([$name]);
    $id = $stmt->fetchColumn();

    if ($id !== false) {
        return (int) $id;
    }

    $stmt = $pdo->prepare('INSERT INTO kategorien (name) VALUES (?)');
    $stmt->execute([$name]);
    return (int) $pdo->lastInsertId();
}

function _lektion_aufloesen(PDO $pdo, string $titel, ?int $kategorie_id, int $erstellt_von): ?int
{
    $sql    = 'SELECT id FROM themenfelder WHERE titel = ? AND aktiv = 1';
    $params = [$titel];

    if ($kategorie_id !== null) {
        $sql .= ' AND kategorie_id = ?';
        $params[] = $kategorie_id;
    }

    $sql .= ' LIMIT 1';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $id = $stmt->fetchColumn();

    if ($id !== false) {
        return (int) $id;
    }

    $stmt = $pdo->prepare('INSERT INTO themenfelder (titel, kategorie_id, erstellt_von) VALUES (?, ?, ?)');
    $stmt->execute([$titel, $kategorie_id, $erstellt_von]);
    return (int) $pdo->lastInsertId();
}

