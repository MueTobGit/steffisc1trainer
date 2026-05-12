<?php
/**
 * API Validierung
 *
 * Zentrale Eingabe-Validierung fuer alle Endpoints.
 */

declare(strict_types=1);

/**
 * Pflichtfelder pruefen
 *
 * @param array $daten Eingabedaten
 * @param array $felder Liste der Pflichtfelder
 */
function pflichtfelder_pruefen(array $daten, array $felder): void
{
    $fehlend = [];
    foreach ($felder as $feld) {
        if (!isset($daten[$feld]) || (is_string($daten[$feld]) && trim($daten[$feld]) === '')) {
            $fehlend[] = $feld;
        }
    }

    if (!empty($fehlend)) {
        fehler_ungueltige_eingabe(
            'Pflichtfelder fehlen: ' . implode(', ', $fehlend),
            ['fehlende_felder' => $fehlend]
        );
    }
}

/**
 * String-Laenge validieren
 */
function laenge_validieren(string $wert, string $feldname, int $min = 1, int $max = 255): void
{
    $laenge = mb_strlen($wert, 'UTF-8');
    if ($laenge < $min || $laenge > $max) {
        fehler_ungueltige_eingabe(
            "Feld '{$feldname}' muss zwischen {$min} und {$max} Zeichen lang sein.",
            ['feld' => $feldname, 'aktuell' => $laenge, 'min' => $min, 'max' => $max]
        );
    }
}

/**
 * E-Mail validieren
 */
function email_validieren(string $email): void
{
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        fehler_ungueltige_eingabe('Ungueltige E-Mail-Adresse.', ['feld' => 'email']);
    }
}

/**
 * Benutzername validieren (alphanumerisch + Unterstrich, 3-64 Zeichen)
 */
function benutzername_validieren(string $name): void
{
    laenge_validieren($name, 'benutzername', 3, 64);

    if (!preg_match('/^[a-zA-Z0-9_]+$/', $name)) {
        fehler_ungueltige_eingabe(
            'Benutzername darf nur Buchstaben, Zahlen und Unterstriche enthalten.',
            ['feld' => 'benutzername']
        );
    }
}

/**
 * Passwort validieren (min. 8 Zeichen, 1 Gross, 1 Klein, 1 Zahl)
 */
function passwort_validieren(string $passwort): void
{
    if (mb_strlen($passwort) < 8) {
        fehler_ungueltige_eingabe(
            'Passwort muss mindestens 8 Zeichen lang sein.',
            ['feld' => 'passwort']
        );
    }

    if (!preg_match('/[A-Z]/', $passwort)) {
        fehler_ungueltige_eingabe(
            'Passwort muss mindestens einen Grossbuchstaben enthalten.',
            ['feld' => 'passwort']
        );
    }

    if (!preg_match('/[a-z]/', $passwort)) {
        fehler_ungueltige_eingabe(
            'Passwort muss mindestens einen Kleinbuchstaben enthalten.',
            ['feld' => 'passwort']
        );
    }

    if (!preg_match('/[0-9]/', $passwort)) {
        fehler_ungueltige_eingabe(
            'Passwort muss mindestens eine Zahl enthalten.',
            ['feld' => 'passwort']
        );
    }
}

/**
 * ENUM-Wert validieren
 *
 * @param string $wert Eingabewert
 * @param array $erlaubt Erlaubte Werte
 * @param string $feldname Feldname fuer Fehlermeldung
 */
function enum_validieren(string $wert, array $erlaubt, string $feldname): void
{
    if (!in_array($wert, $erlaubt, true)) {
        fehler_ungueltige_eingabe(
            "Ungueltiger Wert fuer '{$feldname}'. Erlaubt: " . implode(', ', $erlaubt),
            ['feld' => $feldname, 'erlaubt' => $erlaubt, 'erhalten' => $wert]
        );
    }
}

/**
 * Positive Ganzzahl validieren
 */
function positive_ganzzahl_validieren(mixed $wert, string $feldname): int
{
    if (!is_numeric($wert) || (int) $wert < 1) {
        fehler_ungueltige_eingabe(
            "Feld '{$feldname}' muss eine positive Ganzzahl sein.",
            ['feld' => $feldname]
        );
    }
    return (int) $wert;
}

/**
 * ID validieren (muss existieren)
 *
 * @param int $id Die zu pruefende ID
 * @param string $tabelle Tabellenname
 * @param string $bezeichnung Anzeigename fuer Fehlermeldung
 * @return array Der gefundene Datensatz
 */
function id_existiert(int $id, string $tabelle, string $bezeichnung = 'Eintrag'): array
{
    // Tabellennamen whitelist (SQL-Injection-Schutz)
    $erlaubte_tabellen = [
        'benutzer', 'vokabeln', 'saetze', 'kategorien', 'lektionen',
        'gruppen', 'ligen', 'belohnungen', 'medien', 'fortschritt',
        'trainings_sitzungen', 'vokabel_formen', 'synonyme',
    ];

    if (!in_array($tabelle, $erlaubte_tabellen, true)) {
        fehler_server("Ungueltige Tabellenreferenz: {$tabelle}");
    }

    $pdo = db_verbindung();
    $sql = "SELECT * FROM {$tabelle} WHERE id = ?";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$id]);
    $ergebnis = $stmt->fetch();

    if (!$ergebnis) {
        fehler_nicht_gefunden("{$bezeichnung} mit ID {$id} nicht gefunden.");
    }

    return $ergebnis;
}

/**
 * Wortart validieren
 */
function wortart_validieren(string $wortart): void
{
    $erlaubt = ['Nomen', 'Verb', 'Adjektiv', 'Adverb', 'Pronomen',
                'Praeposition', 'Konjunktion', 'Interjektion', 'Phrase'];
    enum_validieren($wortart, $erlaubt, 'wortart');
}

/**
 * Sprachniveau validieren
 */
function sprachniveau_validieren(string $niveau): void
{
    enum_validieren($niveau, ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'], 'sprachniveau');
}

/**
 * Genus validieren (nur bei Nomen)
 */
function genus_validieren(?string $genus, string $wortart): void
{
    if ($wortart === 'Nomen' && ($genus === null || !in_array($genus, ['en', 'ett'], true))) {
        fehler_ungueltige_eingabe(
            'Bei Nomen muss ein Genus (en/ett) angegeben werden.',
            ['feld' => 'genus']
        );
    }
}

/**
 * Verbgruppe validieren (nur bei Verben)
 */
function verbgruppe_validieren(?string $verbgruppe, string $wortart): void
{
    if ($wortart === 'Verb') {
        if ($verbgruppe === null || !in_array($verbgruppe, ['1', '2a', '2b', '3', '4', 'deponens'], true)) {
            fehler_ungueltige_eingabe(
                'Bei Verben muss eine Verbgruppe (1/2a/2b/3/4/deponens) angegeben werden.',
                ['feld' => 'verbgruppe']
            );
        }
    }
}

/**
 * Form-Bezeichnung validieren
 */
function form_bezeichnung_validieren(string $bezeichnung): void
{
    $erlaubt = [
        'unbestimmt_singular', 'bestimmt_singular', 'unbestimmt_plural', 'bestimmt_plural',
        'infinitiv', 'praesens', 'praeteritum', 'supinum', 'imperativ', 'perfekt_partizip',
        'grundform', 'komparativ', 'superlativ', 'bestimmte_form', 'neutrum_form',
    ];
    enum_validieren($bezeichnung, $erlaubt, 'form_bezeichnung');
}
