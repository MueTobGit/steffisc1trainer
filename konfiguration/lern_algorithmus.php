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

