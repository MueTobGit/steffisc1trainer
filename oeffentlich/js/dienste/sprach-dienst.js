/**
 * Sprach-Dienst — TTS/STT Abstraktion mit Fallback-Kette
 *
 * TTS Prioritaet:
 *   1. window.Android.ttsSpeak(text, lang) — Native Android WebView Bridge
 *   2. window.speechSynthesis — Web Speech API (Desktop Chrome, neuere WebViews)
 *   3. Stille (Feature nicht verfuegbar)
 *
 * STT Prioritaet:
 *   1. window.Android.startListening(lang) — Native Android WebView Bridge
 *   2. SpeechRecognition / webkitSpeechRecognition — Web Speech API
 *   3. Feature versteckt (nicht verfuegbar)
 *
 * Wiederverwendet in Phase 3 (Lernmodus), 4 (Training), 5 (Schnellueben).
 */

import { levenshtein } from '../hilfs-funktionen.js';

// ============================================
// Interner Zustand
// ============================================

/** @type {'android'|'web'|'nicht_verfuegbar'} */
let _tts_modus = 'nicht_verfuegbar';

/** @type {'android'|'web'|'nicht_verfuegbar'} */
let _stt_modus = 'nicht_verfuegbar';

let _initialisiert = false;

/** @type {SpeechSynthesisVoice|null} Bevorzugte schwedische Stimme */
let _sv_stimme = null;

/** @type {SpeechSynthesisVoice|null} Bevorzugte deutsche Stimme */
let _de_stimme = null;

// ============================================
// Initialisierung & Feature-Detection
// ============================================

/**
 * Sprach-Dienst initialisieren.
 * Erkennt verfuegbare TTS/STT-Mechanismen.
 * Sollte einmal beim Modul-Start aufgerufen werden.
 */
export function sprach_dienst_init() {
    if (_initialisiert) return;

    // --- TTS Detection ---
    if (window.Android && typeof window.Android.ttsSpeak === 'function') {
        _tts_modus = 'android';
    } else if ('speechSynthesis' in window) {
        _tts_modus = 'web';
        _stimmen_laden();
        // Chrome Bug: speechSynthesis.speak() erst nach erstem Nutzer-Interaktion
        // (oder nach speechSynthesis.getVoices()) stabil. Stimmen vorladen.
        if (window.speechSynthesis.getVoices().length === 0) {
            window.speechSynthesis.addEventListener('voiceschanged', () => {}, { once: true });
        }
    }

    // --- STT Detection ---
    // Auf Android-App: native Bridge bevorzugen
    if (window.Android && typeof window.Android.startListening === 'function') {
        _stt_modus = 'android';
    } else if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
        // Firefox: Web Speech API erfordert HTTPS + Nutzereinwilligung
        // Chrome: SpeechRecognition ist stabil via webkitSpeechRecognition
        _stt_modus = 'web';

        // Chrome Fix: SpeechRecognition-Klasse vorab instanziieren, damit
        // die Berechtigung nicht erst beim zweiten Klick korrekt greift.
        try {
            const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
            const _aufwaerm = new SpeechRecognitionClass();
            _aufwaerm.abort(); // sofort abbrechen — dient nur der Aktivierung
        } catch (_) { /* ignorieren */ }
    }

    _initialisiert = true;
}

/**
 * STT verfügbar und via HTTPS erreichbar?
 * Gibt auch Hinweis bei Firefox ohne HTTPS.
 */
export function stt_status_pruefen() {
    if (_stt_modus === 'android') return { verfuegbar: true, hinweis: null };
    if (_stt_modus === 'nicht_verfuegbar') {
        return { verfuegbar: false, hinweis: 'Spracherkennung wird in diesem Browser nicht unterstützt.' };
    }
    // Web-Browser: HTTPS prüfen
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        return {
            verfuegbar: false,
            hinweis: 'Spracherkennung erfordert eine HTTPS-Verbindung. Im Firefox auch über HTTPS nur mit expliziter Erlaubnis.',
        };
    }
    return { verfuegbar: true, hinweis: null };
}

/**
 * @returns {boolean} Ist TTS verfuegbar?
 */
export function tts_verfuegbar() {
    return _tts_modus !== 'nicht_verfuegbar';
}

/**
 * @returns {boolean} Ist STT verfuegbar?
 */
export function stt_verfuegbar() {
    return _stt_modus !== 'nicht_verfuegbar';
}

// ============================================
// TTS — Text vorlesen
// ============================================

/**
 * Text vorlesen (TTS).
 *
 * @param {string} text    Zu sprechender Text
 * @param {string} sprache Sprachcode ('sv-SE' oder 'de-DE')
 * @returns {Promise<void>}
 */
export function vorlesen(text, sprache = 'sv-SE') {
    if (!text || !text.trim()) {
        return Promise.resolve();
    }

    if (_tts_modus === 'android') {
        try {
            window.Android.ttsSpeak(text, sprache);
        } catch (e) {
            console.warn('Android TTS Fehler:', e);
        }
        return Promise.resolve();
    }

    if (_tts_modus === 'web') {
        return new Promise((resolve, reject) => {
            // Laufende Sprache abbrechen
            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = sprache;
            utterance.rate = 0.85; // Etwas langsamer zum Lernen

            // Bevorzugte Stimme waehlen
            const stimme = sprache.startsWith('sv') ? _sv_stimme : _de_stimme;
            if (stimme) {
                utterance.voice = stimme;
            }

            utterance.onend = () => resolve();
            utterance.onerror = (event) => {
                // 'interrupted' ist normal bei cancel()
                if (event.error === 'interrupted') {
                    resolve();
                } else {
                    console.warn('TTS Fehler:', event.error);
                    resolve(); // Nicht reject — stille Fallback
                }
            };

            window.speechSynthesis.speak(utterance);

            // Chrome Bug Workaround: speechSynthesis pausiert nach ~15s
            // Timeout als Sicherheitsnetz
            setTimeout(() => resolve(), 10000);
        });
    }

    // Nicht verfuegbar — stille Rueckkehr
    return Promise.resolve();
}

/**
 * Laufende Sprache stoppen.
 */
export function vorlesen_stoppen() {
    if (_tts_modus === 'android' && window.Android.ttsStop) {
        try {
            window.Android.ttsStop();
        } catch (e) { /* ignorieren */ }
    } else if (_tts_modus === 'web') {
        window.speechSynthesis.cancel();
    }
}

// ============================================
// STT — Spracherkennung
// ============================================

/**
 * Spracherkennung starten (STT).
 *
 * @param {string} sprache Sprachcode ('sv-SE')
 * @returns {Promise<string>} Erkannter Text
 */
export function erkennung_starten(sprache = 'sv-SE') {
    if (_stt_modus === 'android') {
        return new Promise((resolve, reject) => {
            // Android Bridge gibt Ergebnis via globalen Callback zurueck
            const timeout = setTimeout(() => {
                delete window._vt_stt_callback;
                reject(new Error('STT Timeout'));
            }, 15000);

            window._vt_stt_callback = (ergebnis) => {
                clearTimeout(timeout);
                delete window._vt_stt_callback;
                resolve(ergebnis || '');
            };

            window._vt_stt_fehler = (fehler) => {
                clearTimeout(timeout);
                delete window._vt_stt_callback;
                delete window._vt_stt_fehler;
                reject(new Error(fehler || 'STT Fehler'));
            };

            try {
                window.Android.startListening(sprache);
            } catch (e) {
                clearTimeout(timeout);
                delete window._vt_stt_callback;
                delete window._vt_stt_fehler;
                reject(e);
            }
        });
    }

    if (_stt_modus === 'web') {
        return new Promise((resolve, reject) => {
            const SpeechRecognition = window.SpeechRecognition
                                   || window.webkitSpeechRecognition;
            const recognition = new SpeechRecognition();

            recognition.lang = sprache;
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;
            recognition.continuous = false;

            recognition.onresult = (event) => {
                const text = event.results[0][0].transcript;
                resolve(text || '');
            };

            recognition.onerror = (event) => {
                if (event.error === 'no-speech') {
                    resolve('');
                } else {
                    reject(new Error(event.error || 'STT Fehler'));
                }
            };

            recognition.onend = () => {
                // Falls kein Ergebnis kam
            };

            try {
                recognition.start();
            } catch (e) {
                reject(e);
            }
        });
    }

    return Promise.reject(new Error('STT nicht verfuegbar'));
}

// ============================================
// Aussprache-Bewertung
// ============================================

/**
 * Aussprache bewerten via Levenshtein-Distanz mit dynamischer Toleranz.
 *
 * Kurze Wörter (≤ 5 Zeichen) erhalten absolute Distanz-Toleranz statt
 * prozentualer Schwellwerte, da 1 Buchstabe bei "jag" schon 33% ausmacht.
 *
 * Zusätzlicher Fallback: Sonderzeichen-normalisierter Vergleich (å/ä/ö → a/o),
 * falls die STT-Engine keine schwedischen Sonderzeichen liefert.
 *
 * @param {string} eingabe  Was der Nutzer gesagt hat
 * @param {string} erwartet Was erwartet wurde
 * @returns {{ prozent: number, bewertung: 'super'|'fast'|'nochmal' }}
 */
export function aussprache_bewerten(eingabe, erwartet) {
    const e = _normalisieren(eingabe);
    const z = _normalisieren(erwartet);

    if (z.length === 0) return { prozent: 0, bewertung: 'nochmal' };
    if (e.length === 0) return { prozent: 0, bewertung: 'nochmal' };

    // --- Exakter Treffer ---
    if (e === z) return { prozent: 100, bewertung: 'super' };

    const distanz = levenshtein(e, z);
    const maxLaenge = Math.max(e.length, z.length);

    // --- Dynamische Toleranz für kurze Wörter ---
    // Bei ≤ 5 Zeichen zählen absolute Edit-Distanzen, nicht Prozente.
    if (z.length <= 5) {
        if (distanz === 0) return { prozent: 100, bewertung: 'super' };
        if (distanz === 1) return { prozent: 85,  bewertung: 'super' };  // z.B. "jag"→"yag"
        if (distanz === 2) return { prozent: 65,  bewertung: 'fast'  };  // 1 kostenloser Fehler
        // Sonderzeichen-Fallback: å/ä/ö → a/o
        const eF = _sonderzeichen_normalisieren(e);
        const zF = _sonderzeichen_normalisieren(z);
        if (eF === zF) return { prozent: 80, bewertung: 'fast' };
        const distanzF = levenshtein(eF, zF);
        if (distanzF <= 1) return { prozent: 70, bewertung: 'fast' };
        return { prozent: Math.round((1 - distanz / maxLaenge) * 100), bewertung: 'nochmal' };
    }

    // --- Prozent-basiert für längere Wörter/Sätze ---
    // Erst Sonderzeichen-Fallback prüfen
    const eF = _sonderzeichen_normalisieren(e);
    const zF = _sonderzeichen_normalisieren(z);
    const distanzF = levenshtein(eF, zF);
    const prozentF = Math.round((1 - distanzF / maxLaenge) * 100);

    const prozent = Math.round((1 - distanz / maxLaenge) * 100);
    const besterProzent = Math.max(prozent, prozentF);

    let bewertung;
    if (besterProzent >= 90) {
        bewertung = 'super';
    } else if (besterProzent >= 65) {
        // Sonderzeichen-Match gilt nur als "fast"
        bewertung = prozent >= 90 ? 'super' : 'fast';
    } else {
        bewertung = 'nochmal';
    }

    return { prozent: besterProzent, bewertung };
}

// ============================================
// Private Helfer
// ============================================

/**
 * Text fuer Vergleich normalisieren.
 */
function _normalisieren(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        .trim()
        .replace(/[.!?,;:]+$/g, '') // Satzzeichen am Ende
        .replace(/\s+/g, ' ');      // Mehrfach-Leerzeichen
}

/**
 * Schwedische Sonderzeichen für STT-Fallback normalisieren.
 * Manche STT-Engines (Web Speech API) liefern å/ä/ö nicht zuverlässig.
 */
function _sonderzeichen_normalisieren(text) {
    return text
        .replace(/å/g, 'a')
        .replace(/ä/g, 'a')
        .replace(/ö/g, 'o')
        .replace(/é/g, 'e')
        .replace(/ü/g, 'u');
}

/**
 * Stimmen laden (Web Speech API).
 * Voices werden asynchron geladen — wir reagieren auf voiceschanged.
 */
function _stimmen_laden() {
    const _stimmen_zuweisen = () => {
        const stimmen = window.speechSynthesis.getVoices();

        // Schwedische Stimme suchen
        _sv_stimme = stimmen.find(s => s.lang === 'sv-SE')
                  || stimmen.find(s => s.lang.startsWith('sv'))
                  || null;

        // Deutsche Stimme suchen
        _de_stimme = stimmen.find(s => s.lang === 'de-DE')
                  || stimmen.find(s => s.lang.startsWith('de'))
                  || null;
    };

    // Stimmen koennen sofort oder spaeter verfuegbar sein
    _stimmen_zuweisen();

    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.addEventListener('voiceschanged', _stimmen_zuweisen, { once: true });
    }
}
