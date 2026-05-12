/**
 * Modul: Lernmodus — Karteikarten-basiertes Lernen
 *
 * Zwei Bildschirme:
 *   1. Kapitelauswahl — Lektionen + Favoriten per Checkbox waehlen
 *   2. Kartenliste — Scrollbare Liste von Vokabel-Karten mit Abdeck-/TTS-/STT-Funktion
 *
 * Kein SM-2, keine XP — rein passives Lernen.
 */

import { apiGet, apiPost } from '../api-client.js';
import { navigieren } from '../router.js';
import { esc } from '../hilfs-funktionen.js';
import { erfolg, apiFehlerAnzeigen } from '../benachrichtigungen.js';
import { lade_anzeige_rendern } from '../komponenten/lade-anzeige.js';
import { leer_zustand_rendern } from '../komponenten/leer-zustand.js';
import { vokabel_karte_erstellen } from '../komponenten/vokabel-karte.js';
const sprach_dienst_init = () => {};
const vorlesen_stoppen = () => {};
import { holen } from '../zustand.js';
import { t } from '../dienste/sprache.js';

// ============================================
// Interner Zustand
// ============================================

/** @type {'auswahl'|'lernen'} */
let _ansicht = 'auswahl';

/** @type {Set<number>} Ausgewaehlte Lektion-IDs */
let _ausgewaehlte_lektionen = new Set();

/** @type {boolean} Favoriten als virtuelle Lektion gewaehlt? */
let _favoriten_gewaehlt = false;

/** @type {'keine'|'sv'|'de'} Abdeck-Modus */
let _abdecken = 'keine';

/** @type {Set<number>} Einzeln aufgedeckte Vokabel-IDs */
let _aufgedeckte = new Set();

/** @type {boolean} Alle aufdecken aktiv? */
let _alle_aufgedeckt = false;

/** @type {Set<number>} Favoriten-IDs des Benutzers */
let _favoriten_ids = new Set();

/** @type {Array} Geladene Vokabeln */
let _vokabeln = [];

/** @type {string[]|null} Sichtbare Form-Bezeichnungen (Level-basiert) */
let _sichtbare_formen = null;

/** @type {Set<string>} Aufgeklappte Gruppen-Keys ('kat-<id>' oder 'ohne') */
let _aufgeklappte_gruppen = new Set();

const LS_KEY_GRUPPE = 'vt_lernmodus_letzte_gruppe';
const LS_KEY_SORTIERUNG = 'vt_lernmodus_sortierung';

/** @type {Map<number,{freigeschaltet:boolean,stufe3_anteil:number}>|null} null = Lernpfad inaktiv */
let _lernpfad_map = null;

/** @type {Set<number>} Lektion-IDs, die dem Benutzer als Aufgabe zugewiesen sind */
let _aufgaben_ids = new Set();

/** @type {number} Index der aktuell sichtbaren Karte */
let _aktueller_index = 0;

/** @type {IntersectionObserver|null} */
let _beobachter = null;

/** @type {Function|null} ResizeObserver-Cleanup */
let _resize_handler = null;

// ============================================
// Haupt-Export: rendern
// ============================================

/**
 * Modul rendern — Einstiegspunkt.
 */
export async function rendern(params) {
    // Sprach-Dienst initialisieren
    sprach_dienst_init();

    // Im Lernmodus immer alle Formen anzeigen (kein Level-Filter)
    _sichtbare_formen = null;

    // Direktstart aus Lernpfad / Dashboard: Kapitel direkt starten
    if (params?.lektion) {
        _ausgewaehlte_lektionen = new Set([parseInt(params.lektion, 10)]);
        await _lernen_starten();
        return;
    }

    // Kapitelauswahl anzeigen
    await _auswahl_anzeigen();
}

/**
 * Modul aufraeumen — bei Routenwechsel.
 */
export function aufraeumen() {
    vorlesen_stoppen();
    document.removeEventListener('keydown', _tastatur_navigation);
    if (_beobachter) { _beobachter.disconnect(); _beobachter = null; }
    if (_resize_handler) { window.removeEventListener('resize', _resize_handler); _resize_handler = null; }
    document.getElementById('inhalt')?.classList.remove('inhalt--lernmodus');
    document.body.style.overflow = '';
    _ansicht = 'auswahl';
    _ausgewaehlte_lektionen = new Set();
    _favoriten_gewaehlt = false;
    _abdecken = 'keine';
    _aufgedeckte = new Set();
    _alle_aufgedeckt = false;
    _favoriten_ids = new Set();
    _vokabeln = [];
    _sichtbare_formen = null;
    _aufgeklappte_gruppen = new Set();
    _lernpfad_map = null;
    _aufgaben_ids = new Set();
    _aktueller_index = 0;
}

// ============================================
// Bildschirm 1: Kapitelauswahl
// ============================================

async function _auswahl_anzeigen() {
    _ansicht = 'auswahl';
    // Lernmodus-Vollbild beenden
    if (_resize_handler) { window.removeEventListener('resize', _resize_handler); _resize_handler = null; }
    document.getElementById('inhalt')?.classList.remove('inhalt--lernmodus');
    document.body.style.overflow = '';
    _ausgewaehlte_lektionen.clear();
    _favoriten_gewaehlt = false;

    const container = document.getElementById('inhalt');
    const _sortierung_aktiv = (localStorage.getItem(LS_KEY_SORTIERUNG) ?? 'lernstand') === 'lernstand';
    container.innerHTML = `
        <div class="lernmodus">
            <div class="verwaltung__kopf">
                <h2 class="verwaltung__titel">${t('lernmodus.titel')}</h2>
            </div>
            <p class="lernmodus__beschreibung">
                ${t('lernmodus.beschreibung')}
            </p>
            <div class="training__option-gruppe training__option-gruppe--toggle" style="margin-bottom:20px">
                <label class="training__toggle-label">
                    <span class="training__toggle-wrapper">
                        <input type="checkbox" class="training__toggle-input" id="cb-sortierung-lernstand"
                            ${_sortierung_aktiv ? 'checked' : ''}>
                        <span class="training__toggle-track"></span>
                    </span>
                    <span class="training__toggle-text">
                        <span class="material-symbols-outlined training__toggle-icon">sort</span>
                        ${t('lernmodus.sortierung_lernstand')}
                    </span>
                    <span class="training__toggle-hinweis">${t('lernmodus.sortierung_lernstand_hinweis')}</span>
                </label>
            </div>
            <div id="lernmodus-auswahl" class="lernmodus__auswahl">
            </div>
            <div class="lernmodus__aktionen">
                <button class="btn btn--gefuellt" id="btn-lernen-starten" disabled>
                    <span class="material-symbols-outlined" style="font-size:20px">school</span>
                    ${t('lernmodus.starten')}
                </button>
            </div>
        </div>
    `;

    // Lade-Anzeige
    lade_anzeige_rendern(document.getElementById('lernmodus-auswahl'));

    // Daten parallel laden
    const benutzer = holen('benutzer');
    const apiPromises = [
        apiGet('kategorien/liste.php'),
        apiGet('lektionen/liste.php', { pro_seite: 200 }),
        apiGet('favoriten/laden.php'),
    ];
    apiPromises.push(apiGet('lektionen/lernpfad.php'));

    const [katErg, lektErg, favErg, lpErg] = await Promise.all(apiPromises);

    // Favoriten-IDs speichern
    if (favErg.erfolg) {
        _favoriten_ids = new Set(favErg.daten);
    }

    // Lernpfad-Map aufbauen (Freischalt-Status je Lektion)
    if (lpErg?.erfolg && Array.isArray(lpErg.daten?.lektionen)) {
        _lernpfad_map = new Map(lpErg.daten.lektionen.map(l => [l.id, l]));
        _aufgaben_ids = new Set((lpErg.daten.aufgegebene_lektionen || []).map(l => l.id));
    } else {
        _lernpfad_map = null;
        _aufgaben_ids = new Set();
    }

    const kategorien = katErg.erfolg ? katErg.daten : [];
    const lektionen = lektErg.erfolg ? (lektErg.daten.eintraege || lektErg.daten) : [];

    // Auswahl rendern
    _auswahl_rendern(kategorien, lektionen, _favoriten_ids.size);

    // Starten-Button
    document.getElementById('btn-lernen-starten')?.addEventListener('click', _lernen_starten);

    // Sortierung-Toggle (Checkbox, identisches Muster wie Training → vorlesen)
    document.getElementById('cb-sortierung-lernstand')?.addEventListener('change', (e) => {
        localStorage.setItem(LS_KEY_SORTIERUNG, e.target.checked ? 'lernstand' : 'zufall');
    });
}

function _auswahl_rendern(kategorien, lektionen, favoritenAnzahl) {
    const container = document.getElementById('lernmodus-auswahl');
    if (!container) return;

    // --- Leerer Zustand ---
    if (lektionen.length === 0 && favoritenAnzahl === 0) {
        container.innerHTML = '';
        leer_zustand_rendern(
            container,
            'menu_book',
            t('lernmodus.keine_lektionen'),
            t('lernmodus.keine_lektionen_text'),
            t('lernmodus.lektionen_verwalten'),
            () => navigieren('/lektionen')
        );
        return;
    }

    // --- Zuletzt geöffnete Gruppe aus localStorage lesen ---
    const letzte_gruppe = localStorage.getItem(LS_KEY_GRUPPE);
    if (letzte_gruppe && _aufgeklappte_gruppen.size === 0) {
        _aufgeklappte_gruppen.add(letzte_gruppe);
    }

    // --- Private Lektionen (eigene + Gruppen) separat herausfiltern ---
    const meine_privaten = lektionen.filter(l => l.ist_privat);
    const oeffentliche   = lektionen.filter(l => !l.ist_privat);

    // --- Nur öffentliche nach Kategorie gruppieren ---
    const lektion_nach_kat = new Map();
    for (const l of oeffentliche) {
        const kid = l.kategorie_id || 0;
        if (!lektion_nach_kat.has(kid)) lektion_nach_kat.set(kid, []);
        lektion_nach_kat.get(kid).push(l);
    }

    let html = '';

    // --- Favoriten (virtuelle Lektion, immer zuerst, nicht aufklappbar) ---
    if (favoritenAnzahl > 0) {
        html += `
            <div class="lernmodus__gruppe lernmodus__favoriten-gruppe">
                <label class="lernmodus__checkbox-label lernmodus__favoriten-label">
                    <input type="checkbox" class="lernmodus__checkbox" value="favoriten">
                    <span class="material-symbols-outlined" style="color: var(--md-sys-color-secondary)">star</span>
                    <strong>${t('lernmodus.meine_favoriten')}</strong>
                    <span class="lernmodus__anzahl">${t('lernmodus.vokabeln_anzahl', {anzahl: favoritenAnzahl})}</span>
                </label>
            </div>
            <hr class="lernmodus__trenner">
        `;
    }

    // --- Meine Lektionen (private Lektionen des Nutzers + Gruppen) ---
    if (meine_privaten.length > 0) {
        const gruppe_key = 'meine-lektionen';
        const ist_offen = _aufgeklappte_gruppen.has(gruppe_key);
        html += `
            <div class="lernmodus__gruppe lernmodus__gruppe--klappbar" data-gruppe="${gruppe_key}">
                <button type="button" class="lernmodus__gruppe-kopf" data-toggle="${gruppe_key}">
                    <span class="material-symbols-outlined" style="font-size:18px;color:var(--md-sys-color-primary)">lock_open</span>
                    <span class="lernmodus__gruppe-titel">${t('lernmodus.meine_lektionen')}</span>
                    <span class="lernmodus__anzahl">${t('lernmodus.lektionen_anzahl', {anzahl: meine_privaten.length})}</span>
                    <span class="material-symbols-outlined lernmodus__gruppe-pfeil ${ist_offen ? 'lernmodus__gruppe-pfeil--offen' : ''}">expand_more</span>
                </button>
                <div class="lernmodus__gruppe-inhalt ${ist_offen ? '' : 'versteckt'}">
        `;
        for (const l of meine_privaten) {
            html += _lektion_checkbox_html(l);
        }
        html += `</div></div><hr class="lernmodus__trenner">`;
    }

    // --- Hierarchisch rendern (aufklappbar) ---
    for (const lehrwerk of kategorien) {
        const direkt = lektion_nach_kat.get(lehrwerk.id) || [];
        const hat_kinder_lektionen = (lehrwerk.kinder || []).some(k =>
            (lektion_nach_kat.get(k.id) || []).length > 0
        );
        if (direkt.length === 0 && !hat_kinder_lektionen) continue;

        const gruppe_key = `kat-${lehrwerk.id}`;
        const ist_offen = _aufgeklappte_gruppen.has(gruppe_key);

        // Gesamtzahl Lektionen in dieser Gruppe
        let lektion_anzahl = direkt.length;
        for (const k of (lehrwerk.kinder || [])) {
            lektion_anzahl += (lektion_nach_kat.get(k.id) || []).length;
        }

        html += `
            <div class="lernmodus__gruppe lernmodus__gruppe--klappbar" data-gruppe="${esc(gruppe_key)}">
                <button type="button" class="lernmodus__gruppe-kopf" data-toggle="${esc(gruppe_key)}">
                    <span class="lernmodus__gruppe-titel">${esc(lehrwerk.name)}</span>
                    <span class="lernmodus__anzahl">${t('lernmodus.lektionen_anzahl', {anzahl: lektion_anzahl})}</span>
                    <span class="material-symbols-outlined lernmodus__gruppe-pfeil ${ist_offen ? 'lernmodus__gruppe-pfeil--offen' : ''}">expand_more</span>
                </button>
                <div class="lernmodus__gruppe-inhalt ${ist_offen ? '' : 'versteckt'}">
        `;

        for (const l of direkt) {
            html += _lektion_checkbox_html(l);
        }

        if (lehrwerk.kinder) {
            for (const kapitel of lehrwerk.kinder) {
                const kLektionen = lektion_nach_kat.get(kapitel.id) || [];
                if (kLektionen.length > 0) {
                    html += `<h4 class="lernmodus__untergruppe-titel">${esc(kapitel.name)}</h4>`;
                    for (const l of kLektionen) {
                        html += _lektion_checkbox_html(l);
                    }
                }
            }
        }

        html += `</div></div>`;
    }

    // --- Ohne-Kategorie Lektionen (aufklappbar) ---
    const ohne_kat = lektion_nach_kat.get(0) || [];
    if (ohne_kat.length > 0) {
        const gruppe_key = 'ohne';
        const ist_offen = _aufgeklappte_gruppen.has(gruppe_key);
        html += `
            <div class="lernmodus__gruppe lernmodus__gruppe--klappbar" data-gruppe="${gruppe_key}">
                <button type="button" class="lernmodus__gruppe-kopf" data-toggle="${gruppe_key}">
                    <span class="lernmodus__gruppe-titel">${t('lernmodus.ohne_kategorie')}</span>
                    <span class="lernmodus__anzahl">${t('lernmodus.lektionen_anzahl', {anzahl: ohne_kat.length})}</span>
                    <span class="material-symbols-outlined lernmodus__gruppe-pfeil ${ist_offen ? 'lernmodus__gruppe-pfeil--offen' : ''}">expand_more</span>
                </button>
                <div class="lernmodus__gruppe-inhalt ${ist_offen ? '' : 'versteckt'}">
        `;
        for (const l of ohne_kat) {
            html += _lektion_checkbox_html(l);
        }
        html += `</div></div>`;
    }

    container.innerHTML = html;

    // --- Aufklapp-Events ---
    container.querySelectorAll('[data-toggle]').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.toggle;
            const gruppe_div = container.querySelector(`.lernmodus__gruppe[data-gruppe="${key}"]`);
            const inhalt = gruppe_div?.querySelector('.lernmodus__gruppe-inhalt');
            const pfeil = btn.querySelector('.lernmodus__gruppe-pfeil');
            if (!inhalt) return;

            const ist_offen = !inhalt.classList.contains('versteckt');
            if (ist_offen) {
                inhalt.classList.add('versteckt');
                pfeil?.classList.remove('lernmodus__gruppe-pfeil--offen');
                _aufgeklappte_gruppen.delete(key);
            } else {
                inhalt.classList.remove('versteckt');
                pfeil?.classList.add('lernmodus__gruppe-pfeil--offen');
                _aufgeklappte_gruppen.add(key);
                localStorage.setItem(LS_KEY_GRUPPE, key);
            }
        });
    });

    // --- Checkbox-Events ---
    container.querySelectorAll('.lernmodus__checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.value === 'favoriten') {
                _favoriten_gewaehlt = cb.checked;
            } else {
                const id = parseInt(cb.value, 10);
                if (cb.checked) {
                    _ausgewaehlte_lektionen.add(id);
                } else {
                    _ausgewaehlte_lektionen.delete(id);
                }
            }
            _starten_button_aktualisieren();
        });
    });
}

function _lektion_checkbox_html(lektion) {
    const anzahl = lektion.vokabel_anzahl ?? lektion.vokabel_count ?? 0;

    // Nur Lektionen sperren, die IN der Lernpfad-Map sind UND dort als gesperrt gelten.
    // Unkategorisierte öffentliche und private Lektionen sind immer zugänglich.
    const lp = _lernpfad_map?.get(lektion.id);
    const gesperrt = !lektion.ist_privat && lp !== undefined && !lp.freigeschaltet && !_aufgaben_ids.has(lektion.id);

    const gewaehlt = !gesperrt && _ausgewaehlte_lektionen.has(lektion.id) ? ' checked' : '';
    const schlossHtml = gesperrt
        ? `<span class="material-symbols-outlined lernmodus__schloss-icon">lock</span>`
        : '';

    return `
        <label class="lernmodus__checkbox-label${gesperrt ? ' lernmodus__checkbox-label--gesperrt' : ''}"
               ${gesperrt ? `title="${t('lernmodus.lektion_gesperrt')}"` : ''}>
            <input type="checkbox" class="lernmodus__checkbox" value="${lektion.id}"${gewaehlt}${gesperrt ? ' disabled' : ''}>
            ${schlossHtml}
            <span>${esc(lektion.titel)}</span>
            <span class="lernmodus__anzahl">${t('lernmodus.vokabeln_anzahl', {anzahl: anzahl})}</span>
            ${lektion.sprachniveau
                ? `<span class="tag tag--${lektion.sprachniveau.toLowerCase()}">${esc(lektion.sprachniveau)}</span>`
                : ''}
        </label>
    `;
}

function _starten_button_aktualisieren() {
    const btn = document.getElementById('btn-lernen-starten');
    if (btn) {
        btn.disabled = !(_ausgewaehlte_lektionen.size > 0 || _favoriten_gewaehlt);
    }
}

// ============================================
// Bildschirm 2: Kartenliste
// ============================================

async function _lernen_starten() {
    _ansicht = 'lernen';
    _aufgedeckte.clear();
    _alle_aufgedeckt = false;
    _abdecken = 'keine';

    // Vollbild-Modus: #inhalt-Padding entfernen, Body-Scroll sperren
    const inhalt = document.getElementById('inhalt');
    inhalt.classList.add('inhalt--lernmodus');
    document.body.style.overflow = 'hidden';

    const container = inhalt;
    container.innerHTML = `
        <div class="lernmodus lernmodus--lernen">
            <div class="lernmodus__toolbar">
                <button class="btn btn--text" id="btn-zurueck">
                    <span class="material-symbols-outlined" style="font-size:20px">arrow_back</span>
                    ${t('lernmodus.zurueck')}
                </button>
                <div class="lernmodus__toolbar-mitte">
                    <span id="lernmodus-zaehler">${t('lernmodus.lade')}</span>
                </div>
                <div class="lernmodus__toolbar-rechts">
                    <select class="eingabe eingabe--klein" id="select-abdecken">
                        <option value="keine">${t('lernmodus.abdecken_keine')}</option>
                        <option value="de">${t('lernmodus.abdecken_de')}</option>
                        <option value="sv">${t('lernmodus.abdecken_sv')}</option>
                    </select>
                    <button class="btn btn--tonal btn--klein" id="btn-alle-aufdecken">
                        ${t('lernmodus.alle_aufdecken')}
                    </button>
                </div>
            </div>
            <div id="lernmodus-karten" class="lernmodus__karten-liste lernmodus__karten-liste--snap">
            </div>
        </div>
    `;

    // Lade-Anzeige
    lade_anzeige_rendern(document.getElementById('lernmodus-karten'));

    // Vokabeln laden
    _vokabeln = await _vokabeln_laden();

    // Karten rendern
    _karten_rendern();
    _zaehler_aktualisieren();

    // Höhe exakt nach dem Rendern berechnen und bei Resize aktualisieren
    requestAnimationFrame(_snap_hoehe_setzen);
    _resize_handler = () => requestAnimationFrame(_snap_hoehe_setzen);
    window.addEventListener('resize', _resize_handler);

    // Tastatur-Navigation
    document.addEventListener('keydown', _tastatur_navigation);

    // --- Event-Listener ---

    // Zurueck zur Auswahl
    document.getElementById('btn-zurueck')?.addEventListener('click', (e) => {
        e.preventDefault();
        vorlesen_stoppen();
        _auswahl_anzeigen();
    });

    // Abdeck-Modus wechseln — mousedown speichert vorherigen Wert,
    // so dass auch eine erneute Auswahl des gleichen Eintrags den Zustand zuruecksetzt.
    const selectAbdecken = document.getElementById('select-abdecken');
    if (selectAbdecken) {
        let _letzter_abdecken_wert = selectAbdecken.value;
        selectAbdecken.addEventListener('mousedown', () => {
            _letzter_abdecken_wert = selectAbdecken.value;
        });
        selectAbdecken.addEventListener('change', (e) => {
            _abdecken = e.target.value;
            _aufgedeckte.clear();
            _alle_aufgedeckt = false;
            _alle_aufdecken_button_aktualisieren();
            _karten_rendern();
        });
        // Zusaetzlicher Click-Handler: Wenn Wert identisch, trotzdem Reset ausloesen
        selectAbdecken.addEventListener('click', (e) => {
            if (selectAbdecken.value === _letzter_abdecken_wert && _abdecken !== 'keine') {
                _abdecken = selectAbdecken.value;
                _aufgedeckte.clear();
                _alle_aufgedeckt = false;
                _alle_aufdecken_button_aktualisieren();
                _karten_rendern();
            }
        });
    }

    // Alle aufdecken / verdecken
    document.getElementById('btn-alle-aufdecken')?.addEventListener('click', () => {
        _alle_aufgedeckt = !_alle_aufgedeckt;
        _alle_aufdecken_button_aktualisieren();
        _karten_rendern();
    });
}

/**
 * Vokabeln aus gewaehlten Lektionen + Favoriten laden.
 * Deduplizierung ueber geladene IDs.
 */
async function _vokabeln_laden() {
    const alle = [];
    const geladene_ids = new Set();

    // --- Favoriten laden ---
    if (_favoriten_gewaehlt) {
        const favErg = await apiGet('favoriten/laden.php', { details: '1', pro_seite: 500 });
        if (favErg.erfolg && favErg.daten.eintraege) {
            for (const v of favErg.daten.eintraege) {
                v.id = parseInt(v.id, 10);
                if (!geladene_ids.has(v.id)) {
                    alle.push(v);
                    geladene_ids.add(v.id);
                }
            }
        }
    }

    // --- Lektionen laden ---
    for (const lektionId of _ausgewaehlte_lektionen) {
        const erg = await apiGet('lektionen/details.php', {
            id: lektionId,
            mit_formen: '1'
        });

        if (erg.erfolg && erg.daten.vokabeln) {
            for (const v of erg.daten.vokabeln) {
                v.id = parseInt(v.id, 10);
                if (!geladene_ids.has(v.id)) {
                    alle.push(v);
                    geladene_ids.add(v.id);
                }
            }
        }
    }

    // Sortierung nach Lernstand oder Zufall
    const sortierung = localStorage.getItem(LS_KEY_SORTIERUNG) ?? 'lernstand';
    if (sortierung === 'lernstand') {
        // Innerhalb gleicher Stufe zufällig mischen, dann nach Stufe aufsteigend sortieren
        _mischen(alle);
        alle.sort((a, b) => {
            const stA = a.stufe ?? a.lernstand ?? 0;
            const stB = b.stufe ?? b.lernstand ?? 0;
            return stA - stB;
        });
    } else {
        _mischen(alle);
    }
    return alle;
}

/**
 * Alle Karten rendern.
 */
function _karten_rendern() {
    const container = document.getElementById('lernmodus-karten');
    if (!container) return;

    // Scroll-Position merken für Re-Renders (z.B. alle aufdecken)
    const scrollTop  = container.scrollTop;
    const scrollLeft = container.scrollLeft;

    container.innerHTML = '';

    if (_vokabeln.length === 0) {
        leer_zustand_rendern(
            container,
            'school',
            t('lernmodus.keine_vokabeln'),
            t('lernmodus.keine_vokabeln_text'),
            t('lernmodus.zurueck_auswahl'),
            () => _auswahl_anzeigen()
        );
        return;
    }

    const fragment = document.createDocumentFragment();

    for (const v of _vokabeln) {
        const aufgedeckt = _alle_aufgedeckt
            || _aufgedeckte.has(v.id)
            || _abdecken === 'keine';

        const karte = vokabel_karte_erstellen(v, {
            abdecken: _abdecken,
            aufgedeckt,
            ist_favorit: _favoriten_ids.has(v.id),
            sichtbare_formen: _sichtbare_formen,
            onFavoritUmschalten: _favorit_umschalten,
            onAufdecken: _karte_aufdecken,
        });

        const snap_item = document.createElement('div');
        snap_item.className = 'lernmodus__snap-item';
        snap_item.appendChild(karte);
        fragment.appendChild(snap_item);
    }

    container.appendChild(fragment);
    _beobachter_einrichten(container);

    // Nach Re-Render zur zuletzt aktiven Karte springen (ohne Animation)
    requestAnimationFrame(() => _zur_karte(_aktueller_index, true));
}

/**
 * Favorit umschalten (API-Call + UI-Update).
 */
async function _favorit_umschalten(vokabelId) {
    const erg = await apiPost('favoriten/umschalten.php', { vokabel_id: vokabelId });

    if (!erg.erfolg) {
        apiFehlerAnzeigen(erg);
        return;
    }

    // Lokalen Status aktualisieren
    if (erg.daten.ist_favorit) {
        _favoriten_ids.add(vokabelId);
    } else {
        _favoriten_ids.delete(vokabelId);
    }

    // Nur Icon in dieser Karte aktualisieren (kein vollstaendiges Re-Render)
    const karte = document.querySelector(`.vk-karte[data-id="${vokabelId}"]`);
    if (karte) {
        const favBtn = karte.querySelector('[data-aktion="favorit"]');
        if (favBtn) {
            const icon = favBtn.querySelector('.material-symbols-outlined');
            icon.textContent = erg.daten.ist_favorit ? 'star' : 'star_border';
            favBtn.classList.toggle('vk-karte__favorit--aktiv', erg.daten.ist_favorit);
            favBtn.title = erg.daten.ist_favorit ? t('lernmodus.favorit_entfernen') : t('lernmodus.favorit_hinzufuegen');
        }
    }
}

/**
 * Einzelne Karte aufdecken.
 */
function _karte_aufdecken(vokabelId) {
    _aufgedeckte.add(vokabelId);

    // Nur diese Karte neu rendern
    const alteKarte = document.querySelector(`.vk-karte[data-id="${vokabelId}"]`);
    if (alteKarte) {
        const v = _vokabeln.find(vok => vok.id === vokabelId);
        if (v) {
            const neueKarte = vokabel_karte_erstellen(v, {
                abdecken: _abdecken,
                aufgedeckt: true,
                ist_favorit: _favoriten_ids.has(v.id),
                sichtbare_formen: _sichtbare_formen,
                onFavoritUmschalten: _favorit_umschalten,
                onAufdecken: _karte_aufdecken,
            });
            alteKarte.replaceWith(neueKarte);
        }
    }
}

/**
 * "Alle aufdecken"-Button Text aktualisieren.
 */
function _alle_aufdecken_button_aktualisieren() {
    const btn = document.getElementById('btn-alle-aufdecken');
    if (btn) {
        btn.textContent = _alle_aufgedeckt ? t('lernmodus.alle_verdecken') : t('lernmodus.alle_aufdecken');
    }
}

/**
 * Fisher-Yates Shuffle — mischt ein Array in-place.
 */
function _mischen(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

/**
 * Zaehler in der Toolbar aktualisieren: "Karte X von Y".
 */
function _zaehler_aktualisieren() {
    const zaehler = document.getElementById('lernmodus-zaehler');
    if (zaehler && _vokabeln.length > 0) {
        zaehler.textContent = t('lernmodus.karte_von', {
            index: _aktueller_index + 1,
            gesamt: _vokabeln.length,
        });
    }
}

/**
 * IntersectionObserver einrichten — erkennt welche Karte gerade sichtbar ist.
 */
function _beobachter_einrichten(container) {
    if (_beobachter) _beobachter.disconnect();

    const items = container.querySelectorAll('.lernmodus__snap-item');
    if (items.length === 0) return;

    _beobachter = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                const idx = [...items].indexOf(entry.target);
                if (idx !== -1 && idx !== _aktueller_index) {
                    _aktueller_index = idx;
                    _zaehler_aktualisieren();
                }
            }
        });
    }, { root: container, threshold: 0.5 });

    items.forEach(item => _beobachter.observe(item));
}

/**
 * Misst die tatsächlich verfügbare Höhe (Viewport minus Kopfzeile minus Toolbar)
 * und setzt sie als inline-style + CSS-Variable auf dem Snap-Container.
 * Items nutzen daraufhin height:100% — kein magic-number-calc nötig.
 */
function _snap_hoehe_setzen() {
    const snapContainer = document.getElementById('lernmodus-karten');
    if (!snapContainer) return;
    const kopfzeile = document.querySelector('.kopfzeile');
    const toolbar   = document.querySelector('.lernmodus__toolbar');
    const kopfzeileH = kopfzeile ? kopfzeile.offsetHeight : 64;
    const toolbarH   = toolbar   ? toolbar.offsetHeight   : 0;
    const h = window.innerHeight - kopfzeileH - toolbarH;
    snapContainer.style.height = h + 'px';
}

/**
 * Scrollt zur Karte am angegebenen Index.
 * @param {number} index
 * @param {boolean} sofort - ohne Animation
 */
function _zur_karte(index, sofort = false) {
    const container = document.getElementById('lernmodus-karten');
    const items = container?.querySelectorAll('.lernmodus__snap-item');
    if (!items || index < 0 || index >= items.length) return;

    const item = items[index];
    const isMobile = window.matchMedia('(max-width: 768px)').matches;

    // container.scrollTo() statt scrollIntoView() — scrollt den Snap-Container selbst,
    // nicht das Fenster. Nur so funktionieren Pfeiltasten zuverlässig.
    container.scrollTo({
        left: isMobile ? item.offsetLeft : 0,
        top:  isMobile ? 0 : item.offsetTop,
        behavior: sofort ? 'instant' : 'smooth',
    });
}

/**
 * Tastatur-Navigation: Pfeiltasten scrollen zur nächsten/vorherigen Karte.
 */
function _tastatur_navigation(e) {
    if (_ansicht !== 'lernen') return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        _zur_karte(_aktueller_index + 1);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        _zur_karte(_aktueller_index - 1);
    }
}
