/**
 * Wort-Sortieren (Satz bauen) Komponente
 *
 * Zeigt einen deutschen Kontext-Satz und gemischte Woerter als Chips.
 * Tippen verschiebt Chips zwischen Pool und Antwort-Bereich.
 * Android WebView-kompatibel (kein Drag & Drop).
 * Genutzt von schnellueben.js (Phase 5).
 *
 * @module komponenten/wort-sortieren
 */

import { esc } from '../hilfs-funktionen.js';
import { vorlesen, tts_verfuegbar } from '../dienste/sprach-dienst.js';
import { t } from '../dienste/sprache.js';

/**
 * Wort-Sortieren Aufgabe erstellen
 *
 * @param {object} aufgabe Aufgaben-Daten vom Server
 * @param {object} optionen Callbacks
 * @returns {HTMLElement}
 */
export function wort_sortieren_erstellen(aufgabe, optionen = {}) {
    const {
        onAntwort = () => {},
        onWeiter = () => {},
    } = optionen;

    // Interner Zustand
    let _beantwortet = false;
    const _pool = [...aufgabe.woerter];          // Verfuegbare Woerter (anfangs alle)
    const _antwort = [];                          // Vom Nutzer platzierte Woerter
    const _loesung = aufgabe.loesung;             // Korrekte Reihenfolge

    // --- Container ---
    const container = document.createElement('div');
    container.className = 'satz-aufgabe';

    // --- Kopf: Badge + TTS (TTS erst nach Pruefung sichtbar) ---
    const kopf = document.createElement('div');
    kopf.className = 'satz-aufgabe__kopf';

    const badge = document.createElement('span');
    badge.className = 'frage-badge frage-badge--satz';
    badge.textContent = t('wort_sortieren.badge');
    kopf.appendChild(badge);

    let ttsBtn = null;
    if (tts_verfuegbar() && aufgabe.tts_text) {
        ttsBtn = document.createElement('md-icon-button');
        ttsBtn.className = 'satz-aufgabe__tts versteckt';
        ttsBtn.innerHTML = '<span class="material-symbols-outlined">volume_up</span>';
        ttsBtn.addEventListener('click', () => {
            vorlesen(aufgabe.tts_text, aufgabe.tts_sprache || 'sv-SE');
        });
        kopf.appendChild(ttsBtn);
    }

    container.appendChild(kopf);

    // --- Kontext (Deutsche Uebersetzung) ---
    const kontext = document.createElement('div');
    kontext.className = 'satz-aufgabe__kontext';
    kontext.textContent = aufgabe.deutsch_kontext;
    container.appendChild(kontext);

    // --- Antwort-Bereich (Ziel-Zone) ---
    const antwortBereich = document.createElement('div');
    antwortBereich.className = 'satz-aufgabe__antwort-bereich';

    const platzhalter = document.createElement('span');
    platzhalter.className = 'satz-aufgabe__platzhalter';
    platzhalter.textContent = t('wort_sortieren.platzhalter');
    antwortBereich.appendChild(platzhalter);

    container.appendChild(antwortBereich);

    // --- Woerter-Pool (Quell-Chips) ---
    const poolBereich = document.createElement('div');
    poolBereich.className = 'satz-aufgabe__woerter-pool';

    container.appendChild(poolBereich);

    // --- Aktionen ---
    const aktionenBereich = document.createElement('div');
    aktionenBereich.className = 'satz-aufgabe__aktionen';

    const pruefenBtn = document.createElement('button');
    pruefenBtn.type = 'button';
    pruefenBtn.className = 'btn';
    pruefenBtn.textContent = t('allgemein.pruefen');
    pruefenBtn.disabled = true;
    pruefenBtn.addEventListener('click', () => _pruefen());
    aktionenBereich.appendChild(pruefenBtn);

    container.appendChild(aktionenBereich);

    // --- Loesung (versteckt bis falsch) ---
    const loesungBereich = document.createElement('div');
    loesungBereich.className = 'satz-aufgabe__loesung versteckt';
    container.appendChild(loesungBereich);

    // --- Weiter-Bereich (versteckt bis geprueft) ---
    const weiterBereich = document.createElement('div');
    weiterBereich.className = 'satz-aufgabe__weiter versteckt';

    const xpBadge = document.createElement('span');
    xpBadge.className = 'xp-badge versteckt';
    xpBadge.textContent = '+3 XP';
    weiterBereich.appendChild(xpBadge);

    const weiterBtn = document.createElement('button');
    weiterBtn.type = 'button';
    weiterBtn.className = 'btn btn--gefuellt';
    weiterBtn.textContent = t('allgemein.weiter');
    weiterBtn.addEventListener('click', () => {
        onWeiter();
    });
    weiterBereich.appendChild(weiterBtn);

    container.appendChild(weiterBereich);

    // --- Initiales Rendern ---
    _pool_rendern();

    // ============================================
    // Chip-Erstellung
    // ============================================

    /**
     * Chip-Element erstellen
     */
    function _chip_erstellen(wort, index, quelle) {
        const chip = document.createElement('button');
        chip.className = 'satz-aufgabe__chip';
        chip.type = 'button';
        chip.dataset.wort = wort;
        chip.dataset.originalIndex = index;
        chip.textContent = wort;

        chip.addEventListener('click', () => {
            if (_beantwortet) return;

            if (quelle === 'pool') {
                // Pool → Antwort
                _von_pool_zu_antwort(wort, index);
            } else {
                // Antwort → Pool
                _von_antwort_zu_pool(wort, index);
            }
        });

        return chip;
    }

    // ============================================
    // Verschieben: Pool ↔ Antwort
    // ============================================

    function _von_pool_zu_antwort(wort, poolIndex) {
        // Aus Pool entfernen
        _pool.splice(poolIndex, 1);

        // In Antwort hinzufuegen
        _antwort.push(wort);

        // Neu rendern
        _pool_rendern();
        _antwort_rendern();
        _pruefen_btn_aktualisieren();
    }

    function _von_antwort_zu_pool(wort, antwortIndex) {
        // Aus Antwort entfernen
        _antwort.splice(antwortIndex, 1);

        // Zurueck in Pool
        _pool.push(wort);

        // Neu rendern
        _pool_rendern();
        _antwort_rendern();
        _pruefen_btn_aktualisieren();
    }

    // ============================================
    // Rendern
    // ============================================

    function _pool_rendern() {
        poolBereich.innerHTML = '';

        _pool.forEach((wort, i) => {
            const chip = _chip_erstellen(wort, i, 'pool');
            poolBereich.appendChild(chip);
        });
    }

    function _antwort_rendern() {
        antwortBereich.innerHTML = '';

        if (_antwort.length === 0) {
            const ph = document.createElement('span');
            ph.className = 'satz-aufgabe__platzhalter';
            ph.textContent = t('wort_sortieren.platzhalter');
            antwortBereich.appendChild(ph);
        } else {
            _antwort.forEach((wort, i) => {
                const chip = _chip_erstellen(wort, i, 'antwort');
                chip.classList.add('satz-aufgabe__chip--platziert');
                antwortBereich.appendChild(chip);
            });
        }
    }

    function _pruefen_btn_aktualisieren() {
        // "Pruefen" nur aktiv wenn alle Woerter platziert
        pruefenBtn.disabled = _pool.length > 0;
    }

    // ============================================
    // Pruefung
    // ============================================

    function _pruefen() {
        if (_beantwortet) return;
        if (_pool.length > 0) return;

        _beantwortet = true;

        // Array-Vergleich (case-sensitive, Reihenfolge)
        const richtig = _antwort.length === _loesung.length &&
            _antwort.every((wort, i) => wort === _loesung[i]);

        // Pruefen-Button verstecken
        aktionenBereich.classList.add('versteckt');

        // Alle Chips nicht mehr klickbar
        antwortBereich.querySelectorAll('.satz-aufgabe__chip').forEach(chip => {
            chip.disabled = true;
        });

        // Feedback anzeigen
        if (richtig) {
            antwortBereich.classList.add('satz-aufgabe__antwort-bereich--richtig');
            xpBadge.classList.remove('versteckt');
        } else {
            antwortBereich.classList.add('satz-aufgabe__antwort-bereich--falsch');

            // Korrekte Loesung anzeigen
            loesungBereich.classList.remove('versteckt');

            const loesungLabel = document.createElement('span');
            loesungLabel.className = 'satz-aufgabe__loesung-label';
            loesungLabel.textContent = t('wort_sortieren.loesung_label');
            loesungBereich.appendChild(loesungLabel);

            const loesungText = document.createElement('span');
            loesungText.className = 'satz-aufgabe__loesung-text';
            loesungText.textContent = _loesung.join(' ');
            loesungBereich.appendChild(loesungText);
        }

        // TTS-Button einblenden (nach Pruefung)
        if (ttsBtn) {
            ttsBtn.classList.remove('versteckt');
        }

        // Weiter-Bereich einblenden
        weiterBereich.classList.remove('versteckt');

        onAntwort(richtig);
    }

    return container;
}
