/**
 * Multiple-Choice Komponente
 *
 * Zeigt eine Frage mit 4 Antwort-Optionen.
 * Tippen waehlt eine Option. Sofortiges Feedback (gruen/rot).
 * Genutzt von schnellueben.js (Phase 5).
 *
 * @module komponenten/multiple-choice
 */

import { esc } from '../hilfs-funktionen.js';
const vorlesen = () => {};
const tts_verfuegbar = () => false;
import { t } from '../dienste/sprache.js';

/**
 * Multiple-Choice Aufgabe erstellen
 *
 * @param {object} aufgabe Aufgaben-Daten vom Server
 * @param {object} optionen Callbacks
 * @returns {HTMLElement}
 */
export function multiple_choice_erstellen(aufgabe, optionen = {}) {
    const {
        onAntwort = () => {},
        onWeiter = () => {},
    } = optionen;

    let _beantwortet = false;

    // --- Container ---
    const container = document.createElement('div');
    container.className = 'mc-aufgabe';

    // --- Kopf: Badge + TTS ---
    const kopf = document.createElement('div');
    kopf.className = 'mc-aufgabe__kopf';

    const badge = document.createElement('span');
    badge.className = 'frage-badge frage-badge--mc';
    badge.textContent = t('mc.badge');
    kopf.appendChild(badge);

    if (tts_verfuegbar() && aufgabe.tts_text) {
        const ttsBtn = document.createElement('md-icon-button');
        ttsBtn.className = 'mc-aufgabe__tts';
        ttsBtn.innerHTML = '<span class="material-symbols-outlined">volume_up</span>';
        ttsBtn.addEventListener('click', () => {
            vorlesen(aufgabe.tts_text, aufgabe.tts_sprache || 'sv-SE');
        });
        kopf.appendChild(ttsBtn);
    }

    container.appendChild(kopf);

    // --- Frage ---
    const frage = document.createElement('div');
    frage.className = 'mc-aufgabe__frage';

    const frageText = document.createElement('span');
    frageText.className = 'mc-aufgabe__frage-text';
    frageText.textContent = aufgabe.frage_text;
    frage.appendChild(frageText);

    // Sprach-Hinweis
    if (aufgabe.frage_sprache) {
        const hinweis = document.createElement('span');
        hinweis.className = 'mc-aufgabe__frage-hinweis';
        hinweis.textContent = aufgabe.frage_sprache === 'sv' ? t('mc.richtung_sv_de') : t('mc.richtung_de_sv');
        frage.appendChild(hinweis);
    }

    container.appendChild(frage);

    // --- Optionen (2×2 Grid) ---
    const optionenContainer = document.createElement('div');
    optionenContainer.className = 'mc-aufgabe__optionen';

    const buttons = [];

    aufgabe.optionen.forEach((opt) => {
        const btn = document.createElement('button');
        btn.className = 'mc-aufgabe__option';
        btn.type = 'button';
        btn.dataset.id = opt.id;
        btn.dataset.richtig = opt.richtig ? '1' : '0';
        btn.textContent = opt.text;

        btn.addEventListener('click', () => {
            if (_beantwortet) return;
            _beantwortet = true;

            const richtig = opt.richtig;

            // Alle Buttons deaktivieren
            buttons.forEach(b => {
                b.disabled = true;
                b.classList.add('mc-aufgabe__option--deaktiviert');
            });

            // Feedback anzeigen
            if (richtig) {
                btn.classList.add('mc-aufgabe__option--richtig');
            } else {
                btn.classList.add('mc-aufgabe__option--falsch');
                // Richtige Antwort markieren
                const richtigeBtn = buttons.find(b => b.dataset.richtig === '1');
                if (richtigeBtn) {
                    richtigeBtn.classList.add('mc-aufgabe__option--richtig');
                }
            }

            // XP-Badge + Weiter-Aktionen anzeigen
            aktionenBereich.classList.remove('versteckt');

            // XP-Badge nur bei richtiger Antwort
            if (richtig) {
                xpBadge.classList.remove('versteckt');
            }

            onAntwort(richtig);
        });

        buttons.push(btn);
        optionenContainer.appendChild(btn);
    });

    container.appendChild(optionenContainer);

    // --- Aktionen (versteckt bis Antwort) ---
    const aktionenBereich = document.createElement('div');
    aktionenBereich.className = 'mc-aufgabe__aktionen versteckt';

    const xpBadge = document.createElement('span');
    xpBadge.className = 'xp-badge versteckt';
    xpBadge.textContent = '+3 XP';
    aktionenBereich.appendChild(xpBadge);

    const weiterBtn = document.createElement('button');
    weiterBtn.type = 'button';
    weiterBtn.className = 'btn btn--gefuellt';
    weiterBtn.textContent = t('allgemein.weiter');
    weiterBtn.addEventListener('click', () => {
        onWeiter();
    });
    aktionenBereich.appendChild(weiterBtn);

    container.appendChild(aktionenBereich);

    return container;
}
