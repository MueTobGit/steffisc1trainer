/**
 * Sprech-Aufgabe Komponente
 *
 * Zeigt ein schwedisches Wort oder einen Satz an.
 * Der Nutzer spricht es ins Mikrofon; die STT-Ausgabe wird bewertet.
 *
 * Besonderheiten:
 * - 1 kostenloser Nochmal-Versuch bei "nochmal"-Bewertung
 * - Dynamische Toleranz für kurze Wörter (via aussprache_bewerten())
 * - Sonderzeichen-Fallback (å/ä/ö → a/o) für unzuverlässige STT-Engines
 * - Android WebView kompatibel (bridge-basierte STT)
 *
 * @module komponenten/sprech-aufgabe
 */

import { vorlesen, erkennung_starten, aussprache_bewerten, tts_verfuegbar } from '../dienste/sprach-dienst.js';
import { esc } from '../hilfs-funktionen.js';
import { t } from '../dienste/sprache.js';

/**
 * Sprech-Aufgabe erstellen
 *
 * @param {object} aufgabe   Aufgaben-Daten vom Server
 *   { typ, ziel_text, tts_text, tts_sprache, deutsch_kontext }
 * @param {object} optionen  Callbacks
 *   { onAntwort(richtig: boolean), onWeiter() }
 * @returns {HTMLElement}
 */
export function sprech_aufgabe_erstellen(aufgabe, optionen = {}) {
    const {
        onAntwort = () => {},
        onWeiter  = () => {},
    } = optionen;

    const ist_satz = aufgabe.typ === 'sprechen_satz';

    // --- Zustand ---
    let _versuche    = 0;   // max 2
    let _beantwortet = false;

    // --- Container ---
    const container = document.createElement('div');
    container.className = 'sprech-aufgabe';

    // --- Kopf: Badge + TTS-Button ---
    const kopf = document.createElement('div');
    kopf.className = 'sprech-aufgabe__kopf';

    const badge = document.createElement('span');
    badge.className = 'frage-badge frage-badge--sprechen';
    badge.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px;vertical-align:-3px">mic</span> ${t('sprech.badge')}`;
    kopf.appendChild(badge);

    if (tts_verfuegbar() && aufgabe.tts_text) {
        const ttsBtn = document.createElement('button');
        ttsBtn.type = 'button';
        ttsBtn.className = 'sprech-aufgabe__tts-btn';
        ttsBtn.title = t('sprech.anhoeren');
        ttsBtn.innerHTML = `<span class="material-symbols-outlined">volume_up</span><span class="sprech-aufgabe__tts-label">${t('sprech.anhoeren')}</span>`;
        ttsBtn.addEventListener('click', () => {
            vorlesen(aufgabe.tts_text, aufgabe.tts_sprache || 'sv-SE');
        });
        kopf.appendChild(ttsBtn);
    }

    container.appendChild(kopf);

    // --- Ziel-Text (großes Wort/Satz) ---
    const ziel = document.createElement('div');
    ziel.className = ist_satz ? 'sprech-aufgabe__ziel sprech-aufgabe__ziel--satz' : 'sprech-aufgabe__ziel';
    ziel.textContent = aufgabe.ziel_text;
    container.appendChild(ziel);

    // --- Deutsche Übersetzung ---
    if (aufgabe.deutsch_kontext) {
        const kontext = document.createElement('div');
        kontext.className = 'sprech-aufgabe__kontext';
        kontext.textContent = aufgabe.deutsch_kontext;
        container.appendChild(kontext);
    }

    // --- Anweisung ---
    const anweisung = document.createElement('div');
    anweisung.className = 'sprech-aufgabe__anweisung';
    anweisung.textContent = ist_satz
        ? t('sprech.anweisung_satz')
        : t('sprech.anweisung_wort');
    container.appendChild(anweisung);

    // --- Mikrofon-Button ---
    const mikBtn = document.createElement('button');
    mikBtn.type = 'button';
    mikBtn.className = 'sprech-aufgabe__mikrofon-btn';
    mikBtn.setAttribute('aria-label', t('sprech.sprechen_starten'));
    mikBtn.innerHTML = '<span class="material-symbols-outlined">mic</span>';
    mikBtn.addEventListener('click', _aufnahme_starten);
    container.appendChild(mikBtn);

    // --- Status-Text (unter Mic-Button) ---
    const status = document.createElement('div');
    status.className = 'sprech-aufgabe__status';
    status.textContent = t('sprech.status_initial');
    container.appendChild(status);

    // --- Feedback-Bereich (versteckt bis Bewertung) ---
    const feedback = document.createElement('div');
    feedback.className = 'sprech-aufgabe__feedback versteckt';
    container.appendChild(feedback);

    // --- Aktionen (Nochmal + Weiter, versteckt bis Bewertung) ---
    const aktionen = document.createElement('div');
    aktionen.className = 'sprech-aufgabe__aktionen versteckt';

    const xpBadge = document.createElement('span');
    xpBadge.className = 'xp-badge versteckt';
    xpBadge.textContent = '+3 XP';
    aktionen.appendChild(xpBadge);

    const nochmalBtn = document.createElement('button');
    nochmalBtn.type = 'button';
    nochmalBtn.className = 'btn sprech-aufgabe__nochmal-btn versteckt';
    nochmalBtn.textContent = t('sprech.nochmal');
    nochmalBtn.addEventListener('click', _nochmal_sprechen);
    aktionen.appendChild(nochmalBtn);

    const weiterBtn = document.createElement('button');
    weiterBtn.type = 'button';
    weiterBtn.className = 'btn btn--gefuellt versteckt';
    weiterBtn.textContent = t('allgemein.weiter');
    weiterBtn.addEventListener('click', () => onWeiter());
    aktionen.appendChild(weiterBtn);

    container.appendChild(aktionen);

    // --- Vorlesen beim Start (kurze Verzögerung) ---
    if (tts_verfuegbar() && aufgabe.tts_text) {
        setTimeout(() => vorlesen(aufgabe.tts_text, aufgabe.tts_sprache || 'sv-SE'), 400);
    }

    // ============================================
    // Aufnahme-Logik
    // ============================================

    async function _aufnahme_starten() {
        if (_beantwortet) return;

        _zustand_setzen('aufnahme');
        status.textContent = t('sprech.status_aufnahme');
        mikBtn.removeEventListener('click', _aufnahme_starten);

        try {
            const erkannt = await erkennung_starten(aufgabe.tts_sprache || 'sv-SE');
            _zustand_setzen('verarbeitung');
            status.textContent = t('sprech.status_verarbeitung');

            await new Promise(r => setTimeout(r, 300)); // kurze UX-Pause

            _bewerten(erkannt);
        } catch (err) {
            console.warn('STT Fehler:', err);
            _zustand_setzen('bereit');
            status.textContent = t('sprech.fehler_mikrofon');
            mikBtn.addEventListener('click', _aufnahme_starten);
        }
    }

    function _nochmal_sprechen() {
        if (_beantwortet) return;
        nochmalBtn.classList.add('versteckt');
        feedback.classList.add('versteckt');
        feedback.className = 'sprech-aufgabe__feedback versteckt';
        feedback.innerHTML = '';
        aktionen.classList.add('versteckt');
        _zustand_setzen('bereit');
        status.textContent = t('sprech.status_initial');
        mikBtn.addEventListener('click', _aufnahme_starten);
    }

    function _bewerten(erkannt) {
        _versuche++;
        const ergebnis = aussprache_bewerten(erkannt || '', aufgabe.ziel_text);
        const { bewertung, prozent } = ergebnis;

        const ist_richtig = bewertung === 'super' || bewertung === 'fast';

        // --- Feedback anzeigen ---
        feedback.innerHTML = '';
        feedback.className = 'sprech-aufgabe__feedback';
        feedback.classList.add(`sprech-aufgabe__feedback--${bewertung}`);
        feedback.classList.remove('versteckt');

        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined sprech-aufgabe__feedback-icon';
        icon.textContent = bewertung === 'super' ? 'check_circle' : bewertung === 'fast' ? 'thumb_up' : 'replay';
        feedback.appendChild(icon);

        const texte = {
            super:   t('sprech.feedback_super'),
            fast:    t('sprech.feedback_fast'),
            nochmal: _versuche >= 2 ? t('sprech.feedback_nochmal') : t('sprech.feedback_nochmal2'),
        };
        const meldung = document.createElement('span');
        meldung.className = 'sprech-aufgabe__feedback-text';
        meldung.textContent = texte[bewertung];
        feedback.appendChild(meldung);

        if (erkannt) {
            const erkannt_el = document.createElement('div');
            erkannt_el.className = 'sprech-aufgabe__erkannt';
            erkannt_el.textContent = t('sprech.erkannt', {text: erkannt});
            feedback.appendChild(erkannt_el);
        }

        // --- Aktionen ---
        aktionen.classList.remove('versteckt');
        _zustand_setzen('fertig');

        if (ist_richtig || _versuche >= 2) {
            // Endgültig: Weiter anzeigen
            _beantwortet = true;
            weiterBtn.classList.remove('versteckt');
            nochmalBtn.classList.add('versteckt');

            if (ist_richtig) {
                xpBadge.classList.remove('versteckt');
            } else {
                // 2. Versuch fehlgeschlagen: korrekte Aussprache vorlesen
                if (tts_verfuegbar()) {
                    setTimeout(() => vorlesen(aufgabe.tts_text, aufgabe.tts_sprache || 'sv-SE'), 600);
                }
            }

            onAntwort(ist_richtig);
        } else {
            // 1. Versuch fehlgeschlagen: Nochmal-Button anbieten
            nochmalBtn.classList.remove('versteckt');
            weiterBtn.classList.add('versteckt');
        }
    }

    // ============================================
    // Zustands-Darstellung des Mic-Buttons
    // ============================================

    function _zustand_setzen(zustand) {
        mikBtn.className = 'sprech-aufgabe__mikrofon-btn';
        mikBtn.classList.add(`sprech-aufgabe__mikrofon-btn--${zustand}`);
        mikBtn.disabled = (zustand === 'aufnahme' || zustand === 'verarbeitung' || zustand === 'fertig');

        const icons = {
            bereit:       'mic',
            aufnahme:     'mic',
            verarbeitung: 'hourglass_top',
            fertig:       'mic_off',
        };
        mikBtn.innerHTML = `<span class="material-symbols-outlined">${icons[zustand] || 'mic'}</span>`;
    }

    return container;
}
