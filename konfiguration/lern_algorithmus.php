<?php
/**
 * Lern-Algorithmus (SM-2/Leitner Hybrid)
 *
 * Berechnet Fortschrittsupdates basierend auf der Antwort-Qualitaet.
 * Stufen 0-6, SM-2 Ease Factor, Leitner-Intervalle.
 */

declare(strict_types=1);

require_once __DIR__ . '/konstanten.php';

/**
 * Fortschritt nach Antwort aktualisieren
 *
 * @param array $fortschritt Aktueller Fortschritts-Datensatz
 * @param int $qualitaet Bewertung 0-5
 * @return array Aktualisierter Fortschritt
 */
function fortschritt_aktualisieren(array $fortschritt, int $qualitaet): array
{
    $stufe = (int) $fortschritt['stufe'];
    $ef = (float) $fortschritt['leichtigkeitsfaktor'];
    $wiederholungen = (int) $fortschritt['wiederholungen'];
    $intervall = (int) $fortschritt['intervall_tage'];
    $richtig_gesamt = (int) $fortschritt['richtig_gesamt'];
    $falsch_gesamt = (int) $fortschritt['falsch_gesamt'];

    // Post-Lapse-Erkennung: wiederholungen==0 aber intervall>0 bedeutet,
    // die Vokabel wurde nach einem Fehler proportional zurückgesetzt (nicht wirklich neu).
    $ist_post_lapse = ($wiederholungen === 0 && $intervall > 0);

    // SM-2 Ease Factor aktualisieren
    $ef = sm2_ease_factor($ef, $qualitaet);

    if ($qualitaet >= 3) {
        // ---- Richtige Antwort ----
        $richtig_gesamt++;
        $wiederholungen++;
        $stufe = min($stufe + 1, MAX_STUFE);

        // Intervall berechnen
        if ($wiederholungen <= 1) {
            $basis = STUFEN_INTERVALLE[$stufe] ?? 1;
            if ($ist_post_lapse) {
                // Post-Lapse: Proportionales Recovery — das gespeicherte Intervall
                // (= 25% des alten Intervalls) begrenzt den Basis-Sprung nach oben.
                // Verhindert, dass eine Vokabel nach einem Fehler sofort wieder
                // ein großes Intervall bekommt.
                $intervall = min($basis, $intervall);
                $intervall = max(1, $intervall);
            } else {
                // Echte Erstkorrektheit: Basis-Intervall der neuen Stufe
                $intervall = $basis;
            }
        } else {
            $intervall = max(1, (int) round($intervall * $ef));
        }

        // Intervall-Cap: verhindert INT-Overflow bei MySQL DATE_ADD
        // (2147483647 Tage overflowt das DATE-Feld → 0000-00-00 → Vokabel immer fällig)
        $intervall = min($intervall, MAX_INTERVALL_TAGE);

        // Fuzz-Faktor: ±8% Streuung bei Intervallen > 3 Tage
        // Verhindert "Review-Stürme" wenn viele Vokabeln gleichzeitig gelernt wurden
        if ($intervall > 3) {
            $fuzz = max(1, (int) round($intervall * 0.08));
            $intervall += random_int(-$fuzz, $fuzz);
            $intervall = min(MAX_INTERVALL_TAGE, max(1, $intervall));
        }

        // Zustand bestimmen
        $zustand = zustand_fuer_stufe($stufe);

    } else {
        // ---- Falsche Antwort ----
        $falsch_gesamt++;
        $wiederholungen = 0;

        // Abgestufte Regression (statt einheitlich -2):
        // Stufen 1-2: nur -1 (Anfänger nicht demotivieren, Abstand war gering)
        // Stufen 3-4: -2 (moderate Regression, Standard)
        // Stufen 5-6: -3 (starke Regression, echtes Vergessen nach langer Pause)
        $regression = ($stufe >= 5) ? 3 : (($stufe >= 3) ? 2 : 1);
        $stufe = max(1, $stufe - $regression);

        // Proportionales Lapse-Intervall (statt fixer 1 Tag):
        // 25% des aktuellen Intervalls, min. 1 Tag.
        // Das gespeicherte Intervall wird beim nächsten korrekten Durchgang als
        // Obergrenze für den Basis-Sprung genutzt (siehe $ist_post_lapse oben).
        $intervall = max(1, (int) round($intervall * LAPSE_INTERVALL_FAKTOR));

        $zustand = 'lernen';
    }

    // Naechste Wiederholung berechnen
    $naechste = new DateTime();
    $naechste->modify("+{$intervall} days");

    return [
        'stufe' => $stufe,
        'zustand' => $zustand,
        'leichtigkeitsfaktor' => round($ef, 4),
        'wiederholungen' => $wiederholungen,
        'intervall_tage' => $intervall,
        'naechste_wiederholung' => $naechste->format('Y-m-d'),
        'richtig_gesamt' => $richtig_gesamt,
        'falsch_gesamt' => $falsch_gesamt,
    ];
}

/**
 * SM-2 Ease Factor berechnen
 *
 * EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
 * Minimum: MIN_LEICHTIGKEITSFAKTOR (1.6)
 *
 * Qualität 3 (Synonym-Treffer) ist inhaltlich korrekt und bestraft den EF nicht —
 * verhindert das Abdriften in die "Ease Hell" bei konsequentem Synonym-Gebrauch.
 */
function sm2_ease_factor(float $ef, int $qualitaet): float
{
    // Qualität 3 = Synonym: EF bleibt unverändert (weder Bonus noch Malus)
    if ($qualitaet === 3) {
        return max(MIN_LEICHTIGKEITSFAKTOR, $ef);
    }

    $ef_neu = $ef + (0.1 - (5 - $qualitaet) * (0.08 + (5 - $qualitaet) * 0.02));
    return min(MAX_LEICHTIGKEITSFAKTOR, max(MIN_LEICHTIGKEITSFAKTOR, round($ef_neu, 4)));
}

/**
 * Zustand anhand der Stufe bestimmen
 */
function zustand_fuer_stufe(int $stufe): string
{
    if ($stufe === 0) return 'neu';
    if ($stufe <= 3) return 'lernen';
    if ($stufe <= 5) return 'wiederholung';
    return 'gelernt';  // Stufe 6
}

/**
 * XP fuer eine Antwort berechnen
 *
 * @param int $stufe Aktuelle Stufe der Vokabel
 * @param int $qualitaet Bewertung 0-5
 * @param bool $streak_aktiv Hat der Nutzer einen aktiven Streak?
 * @param bool $erstes_mal Wurde die Vokabel zum ersten Mal richtig beantwortet?
 * @param bool $schnellueben Ist es der Schnelluebemodus?
 * @return int Verdiente XP
 */
function xp_berechnen(int $stufe, int $qualitaet, bool $streak_aktiv = false, bool $erstes_mal = false, bool $schnellueben = false): int
{
    // Keine XP fuer falsche Antworten
    if ($qualitaet < 3) {
        return 0;
    }

    // Basis-XP nach Stufe
    $basis = XP_PRO_STUFE[$stufe] ?? 5;

    // Multiplikatoren (kumulativ)
    $multiplikator = 1.0;

    if (!$schnellueben) {
        if ($qualitaet === 5) {
            $multiplikator *= MULTIPLIKATOR_PERFEKT;
        }
        if ($streak_aktiv) {
            $multiplikator *= MULTIPLIKATOR_STREAK;
        }
        if ($erstes_mal) {
            $multiplikator *= MULTIPLIKATOR_ERSTES_MAL;
        }
    }

    $xp = (int) round($basis * $multiplikator);

    // Schnellueben: 50% XP, keine Multiplikatoren
    if ($schnellueben) {
        $xp = (int) round($basis * SCHNELLUEBEN_XP_FAKTOR);
    }

    return max(1, $xp);
}

/**
 * Sterne berechnen aus XP
 *
 * @param int $xp Gesamt-XP
 * @return array [bronze, silber, gold]
 */
function sterne_berechnen(int $xp): array
{
    return [
        'bronze' => (int) floor($xp / XP_PRO_BRONZE),
        'silber' => (int) floor($xp / XP_PRO_SILBER),
        'gold'   => (int) floor($xp / XP_PRO_GOLD),
    ];
}

/**
 * Level-Konfiguration aus der Datenbank laden.
 *
 * Gibt ein Array der Form [level => ['name', 'schwelle', 'formen', 'sprachniveaus']] zurueck.
 * Faellt auf die PHP-Konstanten (LEVEL_FORMEN, LEVEL_AUFSTIEG_SCHWELLEN, LEVEL_SPRACHNIVEAU)
 * zurueck, falls die Tabelle nicht existiert oder leer ist.
 *
 * @param PDO $pdo Datenbankverbindung
 * @return array Level-Konfiguration indiziert nach Level-Nummer
 */
function level_konfiguration_laden(PDO $pdo): array
{
    try {
        $stmt = $pdo->query("
            SELECT level, name, schwelle, formen, sprachniveaus
            FROM level_konfiguration
            ORDER BY level ASC
        ");
        $zeilen = $stmt->fetchAll();
    } catch (\PDOException $e) {
        $zeilen = [];
    }

    if (empty($zeilen)) {
        // Fallback: Konstanten aus konstanten.php verwenden
        $levelNamen = [1 => 'Einsteiger', 2 => 'Lernender', 3 => 'Fortgeschrittener', 4 => 'Experte', 5 => 'Meister'];
        $config = [];
        foreach (LEVEL_AUFSTIEG_SCHWELLEN as $l => $schwelle) {
            $config[$l] = [
                'name'          => $levelNamen[$l] ?? "Level {$l}",
                'schwelle'      => $schwelle,
                'formen'        => LEVEL_FORMEN[$l] ?? [],
                'sprachniveaus' => LEVEL_SPRACHNIVEAU[$l] ?? [],
            ];
        }
        return $config;
    }

    $config = [];
    foreach ($zeilen as $zeile) {
        $l = (int) $zeile['level'];
        $config[$l] = [
            'name'          => $zeile['name'],
            'schwelle'      => (int) $zeile['schwelle'],
            'formen'        => json_decode($zeile['formen'], true) ?? [],
            'sprachniveaus' => json_decode($zeile['sprachniveaus'], true) ?? [],
        ];
    }
    return $config;
}

/**
 * Korrektes Level anhand absoluter Schwellen berechnen.
 *
 * Bestimmt determinisch das richtige Level (1-5) aus der Anzahl
 * gemeisterter Vokabeln (Stufe >= 3). Kann sowohl aufsteigen als
 * auch korrigieren, wenn ein zu hoher Wert in der DB steht.
 *
 * @param int $vokabeln_auf_stufe3plus Vokabeln mit Stufe >= 3
 * @param array|null $lk Level-Konfiguration aus level_konfiguration_laden() oder null (Konstanten)
 * @return int Level 1-5
 */
function level_berechnen(int $vokabeln_auf_stufe3plus, ?array $lk = null): int
{
    $schwellen = $lk !== null
        ? array_map(fn($e) => $e['schwelle'], $lk)
        : LEVEL_AUFSTIEG_SCHWELLEN;

    $level = 1;
    foreach ($schwellen as $l => $schwelle) {
        if ($l > 1 && $vokabeln_auf_stufe3plus >= $schwelle) {
            $level = $l;
        }
    }
    return $level;
}

/**
 * Pruefen ob Level-Aufstieg moeglich (Kompatibilitaets-Wrapper)
 *
 * @param int $aktuelles_level Aktuelles globales Level (1-5)
 * @param int $gesamt_vokabeln Gesamtanzahl aktiver Vokabeln (ungenutzt)
 * @param int $vokabeln_auf_stufe3plus Vokabeln mit Stufe >= 3
 * @param array|null $lk Level-Konfiguration oder null
 * @return bool True wenn Aufstieg moeglich
 */
function level_aufstieg_moeglich(int $aktuelles_level, int $gesamt_vokabeln, int $vokabeln_auf_stufe3plus, ?array $lk = null): bool
{
    return level_berechnen($vokabeln_auf_stufe3plus, $lk) > $aktuelles_level;
}

/**
 * Beherrschungsquote berechnen
 *
 * Anteil der bereits geuebten Vokabeln (Stufe >= 1), die Stufe 3+ erreicht haben.
 * Nicht persistiert — wird on-the-fly berechnet.
 *
 * @param int $vokabeln_auf_stufe3plus Vokabeln mit Stufe >= 3
 * @param int $vokabeln_geuebt         Vokabeln mit Stufe >= 1 (bereits beruehrt)
 * @return int Prozentwert 0-100
 */
function beherrschungsquote_berechnen(int $vokabeln_auf_stufe3plus, int $vokabeln_geuebt): int
{
    if ($vokabeln_geuebt === 0) return 0;
    return (int) round(($vokabeln_auf_stufe3plus / $vokabeln_geuebt) * 100);
}

/**
 * Verfuegbare Formen fuer eine Vokabel bestimmen
 *
 * Beruecksichtigt: Globales Level (Obergrenze), Wortart, Vokabel-Stufe.
 *
 * @param string $wortart Wortart der Vokabel
 * @param int $globales_level Globales Level des Nutzers (1-5)
 * @param int $vokabel_stufe Aktuelle Stufe der Vokabel
 * @param array|null $lk Level-Konfiguration aus level_konfiguration_laden() oder null (Konstanten)
 * @return array Liste erlaubter form_bezeichnungen
 */
function verfuegbare_formen(string $wortart, int $globales_level, int $vokabel_stufe, ?array $lk = null): array
{
    // Nur Nomen, Verben, Adjektive haben Formen
    if (!isset(WORTART_FORMEN[$wortart])) {
        return [];
    }

    $wortart_formen = WORTART_FORMEN[$wortart];

    // Alle Formen die das globale Level erlaubt (kumulativ)
    $level_formen = [];
    for ($l = 1; $l <= min($globales_level, 5); $l++) {
        $formen_fuer_level = $lk !== null
            ? ($lk[$l]['formen'] ?? [])
            : (LEVEL_FORMEN[$l] ?? []);
        $level_formen = array_merge($level_formen, $formen_fuer_level);
    }

    // Schnittmenge: Wortart-Formen ∩ Level-Formen
    $erlaubt = array_intersect($wortart_formen, $level_formen);

    // Regressionsschutz: Wenn Vokabel-Stufe zu niedrig, nur Grundformen
    $rang_minimum = (int) konfig_wert('rang_minimum_komplexe_formen', '2');
    $rang_schwelle = (int) konfig_wert('rang_schwelle_formen_freischaltung', '3');

    $level1_formen = $lk !== null ? ($lk[1]['formen'] ?? []) : LEVEL_FORMEN[1];
    $level2_formen = $lk !== null ? ($lk[2]['formen'] ?? []) : LEVEL_FORMEN[2];

    if ($vokabel_stufe < $rang_minimum) {
        // Nur die Basis-Formen (Level 1)
        $erlaubt = array_intersect($erlaubt, $level1_formen);
    } elseif ($vokabel_stufe < $rang_schwelle) {
        // Bis Level 2 Formen
        $bis_level2 = array_merge($level1_formen, $level2_formen);
        $erlaubt = array_intersect($erlaubt, $bis_level2);
    }

    return array_values($erlaubt);
}

/**
 * Streak aktualisieren
 *
 * @param array $statistik Benutzer-Statistik
 * @param bool $hat_geuebt Hat der Nutzer heute geuebt?
 * @return array Aktualisierte Streak-Werte
 */
function streak_aktualisieren(array $statistik, bool $hat_geuebt): array
{
    $streak = (int) $statistik['streak_tage'];
    $laengstes = (int) $statistik['laengstes_streak'];
    $letztes_training = $statistik['letztes_training'];
    $abzug = (int) konfig_wert('streak_abzug_pro_tag', '1');

    $heute = new DateTime();
    $heute_str = $heute->format('Y-m-d');

    if ($hat_geuebt) {
        // Heute schon geuebt? Dann nichts aendern
        if ($letztes_training === $heute_str) {
            return [
                'streak_tage' => $streak,
                'laengstes_streak' => $laengstes,
                'letztes_training' => $heute_str,
            ];
        }

        // Gestern geuebt? Streak +1
        $gestern = (new DateTime())->modify('-1 day')->format('Y-m-d');
        if ($letztes_training === $gestern) {
            $streak += 1;
        } elseif ($letztes_training !== null) {
            // Tage ohne Uebung berechnen, Streak reduzieren
            $letzte = new DateTime($letztes_training);
            $diff = (int) $letzte->diff($heute)->days;
            $verpasst = $diff - 1; // Gestern zaehlt nicht als verpasst wenn heute geuebt
            $streak = max(0, $streak - ($verpasst * $abzug));
            $streak += 1; // Heute geuebt
        } else {
            // Erstes Training ueberhaupt
            $streak = 1;
        }

        $laengstes = max($laengstes, $streak);

        return [
            'streak_tage' => $streak,
            'laengstes_streak' => $laengstes,
            'letztes_training' => $heute_str,
        ];
    }

    // Nicht geuebt: Streak reduzieren (wird beim naechsten Training-Check aufgerufen)
    if ($letztes_training !== null && $letztes_training !== $heute_str) {
        $letzte = new DateTime($letztes_training);
        $diff = (int) $letzte->diff($heute)->days;
        $streak = max(0, $streak - ($diff * $abzug));
    }

    return [
        'streak_tage' => $streak,
        'laengstes_streak' => $laengstes,
        'letztes_training' => $letztes_training,
    ];
}
