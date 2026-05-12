/**
 * Sprache — i18n-Modul
 *
 * Lädt statische Sprachdateien (lang_de.json, lang_sv.json) und stellt
 * eine t()-Funktion bereit, die überall im Frontend verwendet werden kann.
 *
 * Zusätzlich werden alle DOM-Elemente mit [data-i18n] automatisch übersetzt.
 *
 * Verwendung:
 *   import { t, sprache_wechseln, sprache_anwenden } from './dienste/sprache.js';
 *   btn.textContent = t('training.btn_start');
 *
 * HTML:
 *   <button data-i18n="training.btn_start">Training starten</button>
 */

import { holen, setzen, abonnieren } from '../zustand.js';

// ---- Interner State ----

/** @type {Object<string, string>} Aktive Übersetzungen (flach: "bereich.key" → "Text") */
let _texte = {};

/** @type {string} Aktuell geladene Sprache */
let _aktive_sprache = 'de';

/** @type {boolean} Ob bereits geladen wurde */
let _geladen = false;

/** @type {Set<Function>} Callbacks die nach Sprachwechsel aufgerufen werden */
const _wechsel_callbacks = new Set();

// ---- Öffentliche API ----

/**
 * Text anhand eines Schlüssels übersetzen.
 *
 * @param {string} schluessel  Punkt-getrennter Key, z.B. "training.btn_start"
 * @param {Object<string, string>} [platzhalter]  Optionale Platzhalter: { name: "Max" }
 *        → im Text wird {{name}} durch "Max" ersetzt
 * @returns {string} Übersetzter Text oder der Schlüssel selbst als Fallback
 */
export function t(schluessel, platzhalter = null) {
    let text = _texte[schluessel];

    // Fallback: Schlüssel selbst zurückgeben (erleichtert Debugging)
    if (text === undefined) {
        if (_geladen && _aktive_sprache !== 'de') {
            console.warn(`[i18n] Fehlende Übersetzung: "${schluessel}" (${_aktive_sprache})`);
        }
        return schluessel;
    }

    // Platzhalter ersetzen: {{name}} → Wert
    if (platzhalter) {
        for (const [k, v] of Object.entries(platzhalter)) {
            text = text.replaceAll(`{{${k}}}`, String(v));
        }
    }

    return text;
}

/**
 * Aktuelle Sprache abfragen
 * @returns {string} 'de' oder 'sv'
 */
export function aktuelle_sprache() {
    return _aktive_sprache;
}

/**
 * Sprache laden (wird beim App-Start aufgerufen).
 * Liest die Sprache aus localStorage oder dem Benutzerprofil.
 *
 * @returns {Promise<void>}
 */
export async function sprache_init() {
    // Priorität: localStorage > Benutzerprofil > 'de'
    const gespeichert = localStorage.getItem('vt_sprache');
    const benutzer = holen('benutzer');
    const sprache = gespeichert || benutzer?.sprache || 'de';

    await _sprache_laden(sprache);

    // Bei Benutzerwechsel Sprache ggf. neu laden
    abonnieren('benutzer', async (neuer_benutzer) => {
        if (neuer_benutzer?.sprache && neuer_benutzer.sprache !== _aktive_sprache) {
            // Nur wechseln wenn kein expliziter localStorage-Override existiert
            if (!localStorage.getItem('vt_sprache')) {
                await _sprache_laden(neuer_benutzer.sprache);
                sprache_anwenden();
            }
        }
    });
}

/**
 * Sprache wechseln und alle sichtbaren Texte aktualisieren.
 *
 * @param {string} sprache  'de' oder 'sv'
 * @returns {Promise<void>}
 */
export async function sprache_wechseln(sprache) {
    if (sprache === _aktive_sprache) return;

    localStorage.setItem('vt_sprache', sprache);
    setzen('sprache', sprache);

    await _sprache_laden(sprache);
    sprache_anwenden();
}

/**
 * Alle [data-i18n] Elemente im DOM aktualisieren
 * und registrierte Callbacks aufrufen.
 */
export function sprache_anwenden() {
    // 1. Statische DOM-Elemente mit data-i18n aktualisieren
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const schluessel = el.dataset.i18n;
        const uebersetzt = _texte[schluessel];
        if (uebersetzt !== undefined) {
            // Prüfen ob ein bestimmtes Attribut gesetzt werden soll
            const attr = el.dataset.i18nAttr;
            if (attr) {
                el.setAttribute(attr, uebersetzt);
            } else {
                el.textContent = uebersetzt;
            }
        }
    });

    // 2. Platzhalter-Elemente: data-i18n-placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const schluessel = el.dataset.i18nPlaceholder;
        const uebersetzt = _texte[schluessel];
        if (uebersetzt !== undefined) {
            el.placeholder = uebersetzt;
        }
    });

    // 3. Title-Attribute: data-i18n-title
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const schluessel = el.dataset.i18nTitle;
        const uebersetzt = _texte[schluessel];
        if (uebersetzt !== undefined) {
            el.title = uebersetzt;
        }
    });

    // 4. Registrierte Callbacks benachrichtigen (für dynamisch gerenderte Module)
    for (const cb of _wechsel_callbacks) {
        try {
            cb(_aktive_sprache);
        } catch (err) {
            console.error('[i18n] Callback-Fehler:', err);
        }
    }
}

/**
 * Callback registrieren, der bei Sprachwechsel aufgerufen wird.
 * Nützlich für Module, die ihre Texte dynamisch per JS setzen.
 *
 * @param {Function} callback  fn(sprache: string)
 * @returns {Function} Abbestellen-Funktion
 */
export function bei_sprachwechsel(callback) {
    _wechsel_callbacks.add(callback);
    return () => _wechsel_callbacks.delete(callback);
}

// ---- Interne Funktionen ----

/**
 * Sprachdatei laden und _texte befüllen
 *
 * @param {string} sprache  'de' oder 'sv'
 */
async function _sprache_laden(sprache) {
    try {
        // Versions-Suffix für Cache-Busting
        const v = window.APP_VERSION ? `?v=${window.APP_VERSION}` : `?_=${Date.now()}`;
        const res = await fetch(`oeffentlich/sprachen/lang_${sprache}.json${v}`, {
            cache: 'no-cache',
        });

        if (!res.ok) {
            // Fallback auf Deutsch wenn Datei fehlt
            if (sprache !== 'de') {
                console.warn(`[i18n] Sprachdatei für "${sprache}" nicht gefunden — Fallback auf Deutsch.`);
                await _sprache_laden('de');
                return;
            }
            throw new Error(`HTTP ${res.status}`);
        }

        _texte = await res.json();
        _aktive_sprache = sprache;
        _geladen = true;

        setzen('sprache', sprache);

        console.log(`[i18n] Sprache geladen: ${sprache} (${Object.keys(_texte).length} Einträge)`);

    } catch (err) {
        console.error(`[i18n] Fehler beim Laden der Sprache "${sprache}":`, err);

        // Bei Fehler: leeres Objekt → t() gibt Schlüssel zurück
        if (sprache !== 'de') {
            _texte = {};
        }
    }
}
