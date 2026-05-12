<?php
/**
 * Sichtbarkeits-Middleware
 *
 * Zentrale Hilfsfunktionen fuer die Sichtbarkeits-Logik privater Inhalte.
 *
 * Logik:
 *   ist_privat = 0                          → oeffentlich (fuer alle sichtbar)
 *   ist_privat = 1, gruppen_id = NULL       → nur fuer den Besitzer sichtbar
 *   ist_privat = 1, gruppen_id = X          → fuer alle Mitglieder von Gruppe X sichtbar
 *
 * Admin-Benutzer sehen standardmaessig alle oeffentlichen Inhalte; mit dem
 * Parameter auch_private=1 sehen sie zusaetzlich alle privaten Inhalte aller User.
 */

declare(strict_types=1);

/**
 * Gibt eine Liste aller Gruppen-IDs zurueck, in denen der Benutzer Mitglied ist.
 *
 * @param PDO $pdo
 * @param int $benutzer_id
 * @return int[]
 */
function eigene_gruppen_ids(PDO $pdo, int $benutzer_id): array
{
    $stmt = $pdo->prepare(
        'SELECT gruppen_id FROM gruppen_mitglieder WHERE benutzer_id = ?'
    );
    $stmt->execute([$benutzer_id]);
    return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

/**
 * Baut das SQL-WHERE-Fragment + Parameter-Array fuer die Sichtbarkeits-Bedingung.
 *
 * Einschluss-Logik:
 *   - Alle oeffentlichen Inhalte (ist_privat = 0)
 *   - Eigene private Inhalte (ist_privat = 1 AND besitzer_id = $benutzer_id)
 *   - Private Gruppen-Inhalte (ist_privat = 1 AND gruppen_id IN (...eigene Gruppen...))
 *
 * @param PDO    $pdo          DB-Verbindung (fuer Gruppen-Abfrage)
 * @param int    $benutzer_id  Aktuell eingeloggter Benutzer
 * @param string $alias        SQL-Tabellen-Alias (z.B. 'v' fuer vokabeln)
 * @param bool   $auch_private Admin-Modus: true = ALLE privaten Inhalte aller User sehen
 * @return array{sql: string, params: array}
 *              'sql'    → SQL-Fragment fuer WHERE (ohne fuehrendes "AND")
 *              'params' → Gebundene Parameter in der richtigen Reihenfolge
 */
function sichtbarkeits_bedingung(
    PDO    $pdo,
    int    $benutzer_id,
    string $alias        = 'v',
    bool   $auch_private = false
): array {
    // Admin mit auch_private=true sieht alles → keine Einschraenkung
    if ($auch_private) {
        return ['sql' => '1=1', 'params' => []];
    }

    // Alias-Whitelist: nur bekannte Tabellen mit ist_privat-Spalte (Schema-garantiert)
    $erlaubte_aliase = ['v', 'l', 's']; // vokabeln, lektionen, saetze
    if (!in_array($alias, $erlaubte_aliase, true)) {
        // Unbekannter Alias → kein Sichtbarkeits-Filter (sicherer Fallback)
        return ['sql' => '1=1', 'params' => []];
    }

    $gruppen_ids = eigene_gruppen_ids($pdo, $benutzer_id);

    if (empty($gruppen_ids)) {
        // Keine Gruppe: nur oeffentliche oder eigene private
        return [
            'sql'    => "({$alias}.ist_privat = 0 OR {$alias}.besitzer_id = ?)",
            'params' => [$benutzer_id],
        ];
    }

    // Mit Gruppen-Zugehoerigkeit
    $platzhalter = implode(',', array_fill(0, count($gruppen_ids), '?'));

    // Fuer Vokabeln: auch Vokabeln sichtbar machen, die in einer Gruppen-Lektion enthalten sind
    // (z.B. private Vokabeln des Admins, die er einer Gruppen-Lektion hinzugefuegt hat)
    $lektion_sub = '';
    $lektion_params = [];
    if ($alias === 'v') {
        $platzhalter2 = implode(',', array_fill(0, count($gruppen_ids), '?'));
        $lektion_sub  = " OR {$alias}.id IN (
            SELECT lv.vokabel_id FROM lektion_vokabeln lv
            JOIN lektionen l ON l.id = lv.lektion_id
            WHERE l.gruppen_id IN ({$platzhalter2}) AND l.aktiv = 1
        )";
        $lektion_params = $gruppen_ids;
    }

    return [
        'sql'    => "({$alias}.ist_privat = 0 OR {$alias}.besitzer_id = ? OR {$alias}.gruppen_id IN ({$platzhalter}){$lektion_sub})",
        'params' => array_merge([$benutzer_id], $gruppen_ids, $lektion_params),
    ];
}

/**
 * Prueft ob ein Benutzer einen privaten Inhalt bearbeiten/loeschen darf.
 *
 * Erlaubt:
 *   - Admin immer
 *   - Besitzer des Inhalts
 *
 * Gibt HTTP 403 + Fehlermeldung, wenn nicht berechtigt.
 *
 * @param array $benutzer    Authentifizierter Benutzer (aus benutzer_authentifizieren())
 * @param array $inhalt      DB-Zeile mit mindestens 'ist_privat' und 'besitzer_id'
 * @param string $bezeichnung Fuer Fehlermeldung, z.B. 'Vokabel'
 */
function sichtbarkeits_schreib_check(array $benutzer, array $inhalt, string $bezeichnung = 'Inhalt'): void
{
    if (ist_admin($benutzer)) {
        return;
    }

    $ist_privat   = (bool) ($inhalt['ist_privat'] ?? false);
    $besitzer_id  = isset($inhalt['besitzer_id']) ? (int) $inhalt['besitzer_id'] : null;
    $benutzer_id  = (int) $benutzer['id'];

    if ($ist_privat && $besitzer_id === $benutzer_id) {
        return; // Eigener Inhalt
    }

    if (!$ist_privat) {
        // Oeffentlicher Inhalt → nur Admin darf loeschen/bearbeiten
        fehler_nicht_berechtigt("{$bezeichnung} kann nur von Administratoren bearbeitet werden.");
    }

    fehler_nicht_berechtigt("Du hast keine Berechtigung, diesen privaten {$bezeichnung} zu bearbeiten.");
}

/**
 * Laedt den Konfigurationswert fuer max. private Vokabeln aus app_konfiguration.
 *
 * @param PDO $pdo
 * @return int
 */
function max_private_vokabeln(PDO $pdo): int
{
    $stmt = $pdo->prepare(
        "SELECT wert FROM app_konfiguration WHERE schluessel = 'max_private_vokabeln'"
    );
    $stmt->execute();
    $wert = $stmt->fetchColumn();
    return $wert !== false ? (int) $wert : 2000;
}

/**
 * Laedt den Konfigurationswert fuer max. Gruppen pro User aus app_konfiguration.
 *
 * @param PDO $pdo
 * @return int
 */
function max_gruppen_pro_user(PDO $pdo): int
{
    $stmt = $pdo->prepare(
        "SELECT wert FROM app_konfiguration WHERE schluessel = 'max_gruppen_pro_user'"
    );
    $stmt->execute();
    $wert = $stmt->fetchColumn();
    return $wert !== false ? (int) $wert : 2;
}

/**
 * Laedt den Konfigurationswert fuer max. Mitglieder pro Gruppe aus app_konfiguration.
 *
 * @param PDO $pdo
 * @return int
 */
function max_mitglieder_pro_gruppe(PDO $pdo): int
{
    $stmt = $pdo->prepare(
        "SELECT wert FROM app_konfiguration WHERE schluessel = 'max_mitglieder_pro_gruppe'"
    );
    $stmt->execute();
    $wert = $stmt->fetchColumn();
    return $wert !== false ? (int) $wert : 10;
}

/**
 * Prueft ob ein Benutzer das Gruppen-Limit erreicht hat.
 * Gibt HTTP 422 + Fehlermeldung, wenn Limit erreicht.
 *
 * @param PDO $pdo
 * @param int $benutzer_id
 */
function gruppen_limit_pruefen(PDO $pdo, int $benutzer_id): void
{
    $limit = max_gruppen_pro_user($pdo);
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) FROM gruppen_mitglieder WHERE benutzer_id = ?'
    );
    $stmt->execute([$benutzer_id]);
    $anzahl = (int) $stmt->fetchColumn();

    if ($anzahl >= $limit) {
        fehler_ungueltige_eingabe(
            "Du bist bereits in {$anzahl} Gruppe(n). Maximal {$limit} Gruppe(n) erlaubt."
        );
    }
}
