/**
 * Hörverstehen-Aufgaben Komponente
 *
 * Zwei Untertypen:
 *
 * hoer_mc  — 4 Wörter werden angezeigt, eines wird vorgelesen.
 *             Nutzer tippt das vorgelesene Wort an. Sequenziell: alle
 *             Wörter werden nacheinander abgearbeitet, pro Runde wird
 *             neu vorgelesen bis alle gefunden wurden.
 *
 * hoer_satz — Ein schwedischer Satz wird vorgelesen.
 *              Nutzer baut den Satz aus Chips in richtiger Reihenfolge
 *              (kein Kontext-Text, nur Audio-Cue + Chip-Pool).
 *
 * Genutzt von schnellueben.js.
 */

import { esc } from '../hilfs-funktionen.js';
import { vorlesen, tts_verfuegbar } from '../dienste/sprach-dienst.js';
import { t } from '../dienste/sprache.js';

// ============================================
// Öffentlicher Einstiegspunkt
// ============================================

/**
 * Hörverstehen-Aufgabe erstellen
 *
 * @param {object} aufgabe  Aufgaben-Daten vom Server
 * @param {object} optionen Callbacks: onAntwort(richtig), onWeiter()
 * @returns {HTMLElement}
 */
export function hoer_aufgabe_erstellen(aufgabe, optionen = {}) {
    if (aufgabe.untertyp === 'hoer_satz') {
        return _hoer_satz_erstellen(aufgabe, optionen);
    }
    // Default: hoer_mc
    return _hoer_mc_erstellen(aufgabe, optionen);
}

// ============================================
// Typ 1: Hör-MC
// ============================================

function _hoer_mc_erstellen(aufgabe, { onAntwort = () => {}, onWeiter = () => {} } = {}) {
    // aufgabe.woerter: Array von { schwedisch, deutsch, richtig: bool }
    // Wir spielen jedes Wort nacheinander durch.
    // Pro Runde: Vorlesen → Nutzer klickt → Feedback → nächste Runde

    // aufgabe.woerter kommt als reines String-Array vom Server → in Objekte umwandeln
    const alle_woerter = aufgabe.woerter.map(w =>
        typeof w === 'string' ? { text: w } : w
    );
    // Sequenz der zu erkennenden Wörter (nur die "gesuchten")
    const ziel_reihenfolge = aufgabe.ziel_reihenfolge; // [{text, sprache}]

    let _runde = 0;               // aktuell gesuchtes Wort (Index in ziel_reihenfolge)
    let _beantwortet = false;     // komplette Aufgabe abgeschlossen
    let _runde_gesperrt = false;  // kurz nach Tippen gesperrt (Feedback-Pause)
    let _richtige_gesamt = 0;

    // --- Container ---
    const container = document.createElement('div');
    container.className = 'hoer-aufgabe';

    // --- Kopf: Badge + Vorlesen-Button ---
    const kopf = document.createElement('div');
    kopf.className = 'hoer-aufgabe__kopf';

    const badge = document.createElement('span');
    badge.className = 'frage-badge frage-badge--hoer';
    badge.innerHTML = `<span class="material-symbols-outlined" style="font-size:13px;vertical-align:-2px">hearing</span> ${t('hoer.badge')}`;
    kopf.appendChild(badge);

    const ttsBtn = document.createElement('button');
    ttsBtn.type = 'button';
    ttsBtn.className = 'hoer-aufgabe__tts-btn';
    ttsBtn.innerHTML = `
        <span class="material-symbols-outlined">volume_up</span>
        <span class="hoer-aufgabe__tts-label">${t('hoer.nochmal_vorlesen')}</span>
    `;
    ttsBtn.addEventListener('click', () => _vorlesen_aktuell());
    kopf.appendChild(ttsBtn);

    container.appendChild(kopf);

    // --- Anweisung ---
    const anweisung = document.createElement('p');
    anweisung.className = 'hoer-aufgabe__anweisung';
    anweisung.textContent = t('hoer.anweisung_mc');
    container.appendChild(anweisung);

    // --- Fortschritt (Mini-Dots) ---
    const dots_container = document.createElement('div');
    dots_container.className = 'hoer-aufgabe__dots';
    for (let i = 0; i < ziel_reihenfolge.length; i++) {
        const dot = document.createElement('span');
        dot.className = 'hoer-aufgabe__dot';
        dot.dataset.index = i;
        dots_container.appendChild(dot);
    }
    container.appendChild(dots_container);

    // --- Optionen-Grid ---
    const optionen_grid = document.createElement('div');
    optionen_grid.className = 'hoer-aufgabe__optionen';
    container.appendChild(optionen_grid);

    // --- Aktionen (Weiter, XP) ---
    const aktionen = document.createElement('div');
    aktionen.className = 'hoer-aufgabe__aktionen versteckt';

    const xp_badge = document.createElement('span');
    xp_badge.className = 'xp-badge versteckt';
    xp_badge.textContent = '+3 XP';
    aktionen.appendChild(xp_badge);

    const weiter_btn = document.createElement('button');
    weiter_btn.type = 'button';
    weiter_btn.className = 'btn btn--gefuellt';
    weiter_btn.textContent = t('allgemein.weiter');
    weiter_btn.addEventListener('click', () => onWeiter());
    aktionen.appendChild(weiter_btn);
    container.appendChild(aktionen);

    // --- Initiale Runde starten ---
    _runde_rendern();
    // Kurz nach dem Rendern vorlesen
    setTimeout(() => _vorlesen_aktuell(), 400);

    // -----------------------------------------------

    function _vorlesen_aktuell() {
        if (_beantwortet) return;
        const ziel = ziel_reihenfolge[_runde];
        vorlesen(ziel.text, ziel.sprache || 'sv-SE');
    }

    function _runde_rendern() {
        optionen_grid.innerHTML = '';

        // Alle Wort-Buttons rendern
        alle_woerter.forEach((wort) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'hoer-aufgabe__option';
            btn.dataset.text = wort.text;
            btn.textContent = wort.text;

            btn.addEventListener('click', () => _option_geklickt(wort, btn));
            optionen_grid.appendChild(btn);
        });

        // Dots aktualisieren
        dots_container.querySelectorAll('.hoer-aufgabe__dot').forEach((dot, i) => {
            dot.className = 'hoer-aufgabe__dot';
            if (i < _runde) dot.classList.add('hoer-aufgabe__dot--richtig');
            else if (i === _runde) dot.classList.add('hoer-aufgabe__dot--aktiv');
        });
    }

    function _option_geklickt(wort, btn) {
        if (_beantwortet || _runde_gesperrt) return;
        _runde_gesperrt = true;

        const gesuchtes = ziel_reihenfolge[_runde].text;
        const richtig = wort.text === gesuchtes;

        // Alle Buttons sperren
        optionen_grid.querySelectorAll('.hoer-aufgabe__option').forEach(b => {
            b.disabled = true;
            if (b.dataset.text === gesuchtes) {
                b.classList.add('hoer-aufgabe__option--richtig');
            }
        });

        if (!richtig) {
            btn.classList.add('hoer-aufgabe__option--falsch');
        } else {
            _richtige_gesamt++;
        }

        // Dot markieren
        const dot = dots_container.querySelector(`.hoer-aufgabe__dot[data-index="${_runde}"]`);
        if (dot) {
            dot.classList.remove('hoer-aufgabe__dot--aktiv');
            dot.classList.add(richtig ? 'hoer-aufgabe__dot--richtig' : 'hoer-aufgabe__dot--falsch');
        }

        _runde++;

        if (_runde >= ziel_reihenfolge.length) {
            // Alle Runden durch — Aufgabe fertig
            _beantwortet = true;
            const alle_richtig = _richtige_gesamt === ziel_reihenfolge.length;
            if (alle_richtig) xp_badge.classList.remove('versteckt');
            aktionen.classList.remove('versteckt');
            onAntwort(alle_richtig);
        } else {
            // Nächste Runde nach kurzer Pause
            setTimeout(() => {
                // Buttons wieder aktivieren
                optionen_grid.querySelectorAll('.hoer-aufgabe__option').forEach(b => {
                    b.disabled = false;
                    b.className = 'hoer-aufgabe__option';
                });
                // Dot-Status bewahren (bereits gesetzt)
                dots_container.querySelectorAll('.hoer-aufgabe__dot').forEach((dot, i) => {
                    if (i < _runde) {
                        // bereits abgeschlossen — Klasse bleibt
                    } else if (i === _runde) {
                        dot.className = 'hoer-aufgabe__dot hoer-aufgabe__dot--aktiv';
                    }
                });
                _runde_gesperrt = false;
                _vorlesen_aktuell();
            }, 900);
        }
    }

    return container;
}

// ============================================
// Typ 2: Hör-Satz
// ============================================

function _hoer_satz_erstellen(aufgabe, { onAntwort = () => {}, onWeiter = () => {} } = {}) {
    // aufgabe.woerter: gemischte Wörter
    // aufgabe.loesung: korrekte Reihenfolge
    // aufgabe.tts_text: vollständiger Satz zum Vorlesen
    // aufgabe.tts_sprache: 'sv-SE'

    let _beantwortet = false;
    const _pool = [...aufgabe.woerter];
    const _antwort = [];
    const _loesung = aufgabe.loesung;

    // --- Container ---
    const container = document.createElement('div');
    container.className = 'hoer-aufgabe hoer-satz-aufgabe';

    // --- Kopf: Badge + TTS ---
    const kopf = document.createElement('div');
    kopf.className = 'hoer-aufgabe__kopf';

    const badge = document.createElement('span');
    badge.className = 'frage-badge frage-badge--hoer';
    badge.innerHTML = `<span class="material-symbols-outlined" style="font-size:13px;vertical-align:-2px">hearing</span> ${t('hoer.badge')}`;
    kopf.appendChild(badge);

    const ttsBtn = document.createElement('button');
    ttsBtn.type = 'button';
    ttsBtn.className = 'hoer-aufgabe__tts-btn';
    ttsBtn.innerHTML = `
        <span class="material-symbols-outlined">volume_up</span>
        <span class="hoer-aufgabe__tts-label">${t('hoer.nochmal_vorlesen')}</span>
    `;
    ttsBtn.addEventListener('click', () => vorlesen(aufgabe.tts_text, aufgabe.tts_sprache || 'sv-SE'));
    kopf.appendChild(ttsBtn);

    container.appendChild(kopf);

    // --- Anweisung ---
    const anweisung = document.createElement('p');
    anweisung.className = 'hoer-aufgabe__anweisung';
    anweisung.textContent = t('hoer.anweisung_satz');
    container.appendChild(anweisung);

    // --- Antwort-Bereich ---
    const antwort_bereich = document.createElement('div');
    antwort_bereich.className = 'satz-aufgabe__antwort-bereich';

    const platzhalter = document.createElement('span');
    platzhalter.className = 'satz-aufgabe__platzhalter';
    platzhalter.textContent = t('wort_sortieren.platzhalter');
    antwort_bereich.appendChild(platzhalter);
    container.appendChild(antwort_bereich);

    // --- Wörter-Pool ---
    const pool_bereich = document.createElement('div');
    pool_bereich.className = 'satz-aufgabe__woerter-pool';
    container.appendChild(pool_bereich);

    // --- Aktionen ---
    const aktionen = document.createElement('div');
    aktionen.className = 'satz-aufgabe__aktionen';

    const pruefen_btn = document.createElement('button');
    pruefen_btn.type = 'button';
    pruefen_btn.className = 'btn';
    pruefen_btn.textContent = t('allgemein.pruefen');
    pruefen_btn.disabled = true;
    pruefen_btn.addEventListener('click', () => _pruefen());
    aktionen.appendChild(pruefen_btn);
    container.appendChild(aktionen);

    // --- Lösung (versteckt) ---
    const loesung_bereich = document.createElement('div');
    loesung_bereich.className = 'satz-aufgabe__loesung versteckt';
    container.appendChild(loesung_bereich);

    // --- Weiter-Bereich ---
    const weiter_bereich = document.createElement('div');
    weiter_bereich.className = 'satz-aufgabe__weiter versteckt';

    const xp_badge = document.createElement('span');
    xp_badge.className = 'xp-badge versteckt';
    xp_badge.textContent = '+3 XP';
    weiter_bereich.appendChild(xp_badge);

    const weiter_btn = document.createElement('button');
    weiter_btn.type = 'button';
    weiter_btn.className = 'btn btn--gefuellt';
    weiter_btn.textContent = t('allgemein.weiter');
    weiter_btn.addEventListener('click', () => onWeiter());
    weiter_bereich.appendChild(weiter_btn);
    container.appendChild(weiter_bereich);

    // --- Init ---
    _pool_rendern();
    setTimeout(() => vorlesen(aufgabe.tts_text, aufgabe.tts_sprache || 'sv-SE'), 400);

    // -----------------------------------------------

    function _chip_erstellen(wort, index, quelle) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'satz-aufgabe__chip';
        chip.dataset.wort = wort;
        chip.dataset.originalIndex = index;
        chip.textContent = wort;
        chip.addEventListener('click', () => {
            if (_beantwortet) return;
            if (quelle === 'pool') _von_pool_zu_antwort(wort, index);
            else _von_antwort_zu_pool(wort, index);
        });
        return chip;
    }

    function _von_pool_zu_antwort(wort, poolIndex) {
        _pool.splice(poolIndex, 1);
        _antwort.push(wort);
        _pool_rendern();
        _antwort_rendern();
        _pruefen_btn_aktualisieren();
    }

    function _von_antwort_zu_pool(wort, antwortIndex) {
        _antwort.splice(antwortIndex, 1);
        _pool.push(wort);
        _pool_rendern();
        _antwort_rendern();
        _pruefen_btn_aktualisieren();
    }

    function _pool_rendern() {
        pool_bereich.innerHTML = '';
        _pool.forEach((wort, i) => pool_bereich.appendChild(_chip_erstellen(wort, i, 'pool')));
    }

    function _antwort_rendern() {
        antwort_bereich.innerHTML = '';
        if (_antwort.length === 0) {
            const ph = document.createElement('span');
            ph.className = 'satz-aufgabe__platzhalter';
            ph.textContent = t('wort_sortieren.platzhalter');
            antwort_bereich.appendChild(ph);
        } else {
            _antwort.forEach((wort, i) => {
                const chip = _chip_erstellen(wort, i, 'antwort');
                chip.classList.add('satz-aufgabe__chip--platziert');
                antwort_bereich.appendChild(chip);
            });
        }
    }

    function _pruefen_btn_aktualisieren() {
        pruefen_btn.disabled = _pool.length > 0;
    }

    function _pruefen() {
        if (_beantwortet || _pool.length > 0) return;
        _beantwortet = true;

        const richtig = _antwort.length === _loesung.length &&
            _antwort.every((wort, i) => wort === _loesung[i]);

        aktionen.classList.add('versteckt');
        antwort_bereich.querySelectorAll('.satz-aufgabe__chip').forEach(c => c.disabled = true);

        if (richtig) {
            antwort_bereich.classList.add('satz-aufgabe__antwort-bereich--richtig');
            xp_badge.classList.remove('versteckt');
        } else {
            antwort_bereich.classList.add('satz-aufgabe__antwort-bereich--falsch');
            loesung_bereich.classList.remove('versteckt');

            const label = document.createElement('span');
            label.className = 'satz-aufgabe__loesung-label';
            label.textContent = t('wort_sortieren.loesung_label');
            loesung_bereich.appendChild(label);

            const text = document.createElement('span');
            text.className = 'satz-aufgabe__loesung-text';
            text.textContent = _loesung.join(' ');
            loesung_bereich.appendChild(text);
        }

        // Deutsche Übersetzung nach dem Prüfen anzeigen (immer, nicht nur bei Fehler)
        if (aufgabe.deutsch_kontext) {
            const uebersetzung = document.createElement('p');
            uebersetzung.className = 'satz-aufgabe__uebersetzung';
            uebersetzung.textContent = aufgabe.deutsch_kontext;
            loesung_bereich.classList.remove('versteckt');
            loesung_bereich.appendChild(uebersetzung);
        }

        weiter_bereich.classList.remove('versteckt');
        onAntwort(richtig);
    }

    return container;
}
