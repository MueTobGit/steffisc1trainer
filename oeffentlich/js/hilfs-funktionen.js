/**
 * Hilfs-Funktionen — Geteilte Frontend-Helfer
 */

import { holen } from './zustand.js';

/**
 * Debounce: Funktion erst nach Pause ausfuehren
 */
export function entprellen(fn, ms = 300) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
    };
}

/**
 * Throttle: Funktion maximal einmal pro Intervall
 */
export function drosseln(fn, ms = 300) {
    let letztesAufruf = 0;
    return function (...args) {
        const jetzt = Date.now();
        if (jetzt - letztesAufruf >= ms) {
            letztesAufruf = jetzt;
            return fn.apply(this, args);
        }
    };
}

/**
 * HTML-Escaping (XSS-Schutz)
 */
export function esc(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

/**
 * Datum formatieren (deutsch)
 */
export function datumFormatieren(datum, optionen = {}) {
    if (!datum) return '-';

    const d = new Date(datum);
    if (isNaN(d.getTime())) return '-';

    const standard = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        ...optionen,
    };

    return d.toLocaleDateString('de-DE', standard);
}

/**
 * Datum + Zeit formatieren
 */
export function datumZeitFormatieren(datum) {
    return datumFormatieren(datum, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/**
 * Relative Zeitangabe (z.B. "vor 5 Minuten")
 */
export function relativZeit(datum) {
    if (!datum) return '-';

    const d = new Date(datum);
    const jetzt = new Date();
    const diff = Math.floor((jetzt - d) / 1000);

    if (diff < 60) return 'gerade eben';
    if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min.`;
    if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`;
    if (diff < 604800) return `vor ${Math.floor(diff / 86400)} Tagen`;

    return datumFormatieren(datum);
}

/**
 * Zahl formatieren (deutsch, mit Tausender-Punkt)
 */
export function zahlFormatieren(zahl) {
    if (zahl === null || zahl === undefined) return '0';
    return Number(zahl).toLocaleString('de-DE');
}

/**
 * Prozent formatieren
 */
export function prozentFormatieren(zaehler, nenner, dezimalen = 0) {
    if (!nenner || nenner === 0) return '0%';
    const prozent = (zaehler / nenner) * 100;
    return `${prozent.toFixed(dezimalen)}%`;
}

/**
 * Levenshtein-Distanz (UTF-8-sicher)
 */
export function levenshtein(s1, s2) {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();
    const a1 = [...s1];
    const a2 = [...s2];
    const len1 = a1.length;
    const len2 = a2.length;

    if (len1 === 0) return len2;
    if (len2 === 0) return len1;

    const matrix = Array.from({ length: len1 + 1 }, () => new Array(len2 + 1).fill(0));

    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const kosten = a1[i - 1] === a2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + kosten
            );
        }
    }

    return matrix[len1][len2];
}

/**
 * Wortart-Label (leserlich)
 */
export function wortartLabel(wortart) {
    const labels = {
        'Nomen': 'Nomen',
        'Verb': 'Verb',
        'Adjektiv': 'Adjektiv',
        'Adverb': 'Adverb',
        'Pronomen': 'Pronomen',
        'Praeposition': 'Praeposition',
        'Konjunktion': 'Konjunktion',
        'Interjektion': 'Interjektion',
        'Phrase': 'Phrase',
    };
    return labels[wortart] || wortart;
}

/**
 * Genus-Label
 */
export function genusLabel(genus) {
    return genus === 'en' ? 'en (utrum)' : genus === 'ett' ? 'ett (neutrum)' : '';
}

/**
 * Stufe-Label
 */
export function stufeLabel(stufe) {
    const labels = ['Neu', 'Kennengelernt', 'Kurzzeit', 'Festigung', 'Langzeit', 'Sicher', 'Gemeistert'];
    return labels[stufe] || `Stufe ${stufe}`;
}

/**
 * Level-Label — liest aus DB-Konfiguration (zustand), Fallback auf Konstanten
 */
export function levelLabel(level) {
    const konfig = holen('konfiguration');
    if (konfig?.level_konfiguration) {
        const lk = konfig.level_konfiguration.find(l => l.level === level);
        if (lk?.name) return lk.name;
    }
    // Fallback (vor Login oder wenn Konfiguration noch nicht geladen)
    const labels = { 1: 'Einsteiger', 2: 'Lernender', 3: 'Fortgeschrittener', 4: 'Experte', 5: 'Meister' };
    return labels[level] || `Level ${level}`;
}

/**
 * Zustand-Farbe
 */
export function zustandFarbe(zustand) {
    const farben = {
        'neu': 'var(--md-sys-color-outline)',
        'lernen': 'var(--md-sys-color-primary)',
        'wiederholung': 'var(--md-sys-color-secondary)',
        'gelernt': 'var(--md-sys-color-tertiary)',
    };
    return farben[zustand] || 'var(--md-sys-color-outline)';
}

/**
 * DOM-Element erstellen (Komfortfunktion)
 */
export function el(tag, attribute = {}, kinder = []) {
    const element = document.createElement(tag);

    for (const [schluessel, wert] of Object.entries(attribute)) {
        if (schluessel === 'klasse' || schluessel === 'className') {
            element.className = wert;
        } else if (schluessel === 'text') {
            element.textContent = wert;
        } else if (schluessel === 'html') {
            element.innerHTML = wert;
        } else if (schluessel.startsWith('on')) {
            element.addEventListener(schluessel.slice(2).toLowerCase(), wert);
        } else if (schluessel === 'stil' || schluessel === 'style') {
            if (typeof wert === 'object') {
                Object.assign(element.style, wert);
            } else {
                element.setAttribute('style', wert);
            }
        } else if (schluessel === 'daten' || schluessel === 'dataset') {
            for (const [dk, dv] of Object.entries(wert)) {
                element.dataset[dk] = dv;
            }
        } else {
            element.setAttribute(schluessel, wert);
        }
    }

    for (const kind of kinder) {
        if (typeof kind === 'string') {
            element.appendChild(document.createTextNode(kind));
        } else if (kind instanceof Node) {
            element.appendChild(kind);
        }
    }

    return element;
}
