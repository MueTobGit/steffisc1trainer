/**
 * Schnellueben — Spielerisches Ueben ohne SM-2
 *
 * 3 Bildschirme: Auswahl → Spiel-Schleife → Zusammenfassung.
 * 3 Aufgabentypen: Multiple Choice, Zuordnung, Satz bauen.
 * Kein SM-2, 50% XP (3 XP pro richtige Antwort), zaehlt fuer Streak.
 * Android WebView-kompatibel (kein Drag & Drop, nur Tap-basiert).
 */

import { apiGet, apiPost } from '../api-client.js';
import { holen, setzen } from '../zustand.js';
import { navigieren } from '../router.js';
import { esc } from '../hilfs-funktionen.js';
import { benachrichtigen, erfolg, fehler as fehlerToast, apiFehlerAnzeigen } from '../benachrichtigungen.js';
import { lade_anzeige_rendern, lade_anzeige_entfernen } from '../komponenten/lade-anzeige.js';
import { leer_zustand_rendern } from '../komponenten/leer-zustand.js';
import { ergebnis_anzeige_erstellen } from '../komponenten/ergebnis-anzeige.js';
import { multiple_choice_erstellen } from '../komponenten/multiple-choice.js';
import { zuordnung_erstellen } from '../komponenten/zuordnung.js';
import { wort_sortieren_erstellen } from '../komponenten/wort-sortieren.js';
import { sprach_dienst_init, vorlesen_stoppen, stt_verfuegbar } from '../dienste/sprach-dienst.js';
import { letztes_training_melden } from '../dienste/android-benachrichtigungen.js';
import { t } from '../dienste/sprache.js';
import { hoer_aufgabe_erstellen } from '../komponenten/hoer-aufgabe.js';
import { sprech_aufgabe_erstellen } from '../komponenten/sprech-aufgabe.js';
import { interferenz_pruefen } from '../komponenten/interferenz-dialog.js';

// ============================================
// Interner Zustand
// ============================================

let _ansicht = 'auswahl';           // 'auswahl' | 'spiel' | 'zusammenfassung'
let _sitzung_id = null;
let _aufgaben = [];
let _aktueller_index = 0;
let _ergebnisse = [];                // { index, typ, richtig, xp }
let _zusammenfassung = null;

let _einstellungen = {
    lektion_ids: [],
    favoriten: false,
    anzahl: 8,
    aufgaben_typen: ['multiple_choice', 'zuordnung', 'satz_bauen', 'hoer_mc', 'hoer_satz', 'sprechen_vokabel', 'sprechen_satz', 'genus_block', 'endungs_matching', 'gruppen_quiz', 'partikel_puzzle', 'starkes_verb', 'praep_chunk', 'praep_kategorisierung'],
    autovorlesen: false,
    loesung_tippen: false,
    faellige_einmischen: true,
};

// Daten fuer Auswahl-Bildschirm
let _kategorien = [];
let _lektionen = [];
let _favoriten_anzahl = 0;
let _lernpfad_map = null; // null = inaktiv; Map<id, {freigeschaltet, stufe3_anteil}> wenn aktiv
let _aufgaben_ids = new Set(); // IDs der Aufgaben-Lektionen (immer zugänglich, auch wenn gesperrt)

/** @type {Set<string>} Aufgeklappte Gruppen-Keys */
let _aufgeklappte_gruppen = new Set();

const LS_KEY_GRUPPE = 'vt_schnellueben_letzte_gruppe';

// ============================================
// Modul-Exports
// ============================================

/**
 * Schnellueben-Modul rendern
 */
export async function rendern(params) {
    sprach_dienst_init();

    const inhalt = document.getElementById('inhalt');
    if (!inhalt) return;
    inhalt.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'schnellueben';
    inhalt.appendChild(wrapper);

    // Direktstart aus Lernpfad / Dashboard: Kapitel oder Favoriten direkt starten
    if (params?.lektion) {
        _einstellungen.lektion_ids = [parseInt(params.lektion, 10)];
        _einstellungen.favoriten = false;
        await _spiel_starten(wrapper);
        return;
    }
    if (params?.filter === 'favorit') {
        _einstellungen.lektion_ids = [];
        _einstellungen.favoriten = true;
        await _spiel_starten(wrapper);
        return;
    }

    if (_ansicht === 'auswahl') {
        await _auswahl_rendern(wrapper);
    } else if (_ansicht === 'spiel') {
        _spiel_rendern(wrapper);
    } else if (_ansicht === 'zusammenfassung') {
        _zusammenfassung_rendern(wrapper);
    }
}

/**
 * Aufraeumen bei Modulwechsel
 */
export function aufraeumen() {
    vorlesen_stoppen();
    _ansicht = 'auswahl';
    _sitzung_id = null;
    _aufgaben = [];
    _aktueller_index = 0;
    _ergebnisse = [];
    _zusammenfassung = null;
    _einstellungen = {
        lektion_ids: [],
        favoriten: false,
        anzahl: 8,
        aufgaben_typen: ['multiple_choice', 'zuordnung', 'satz_bauen', 'hoer_mc', 'hoer_satz', 'sprechen_vokabel', 'sprechen_satz', 'genus_block', 'endungs_matching', 'gruppen_quiz', 'partikel_puzzle', 'starkes_verb', 'praep_chunk', 'praep_kategorisierung'],
        autovorlesen: false,
        loesung_tippen: false,
        faellige_einmischen: true,
    };
    _kategorien = [];
    _lektionen = [];
    _favoriten_anzahl = 0;
    _lernpfad_map = null;
    _aufgaben_ids = new Set();
    _aufgeklappte_gruppen = new Set();
}

// ============================================
// Bildschirm 1: Auswahl
// ============================================

async function _auswahl_rendern(wrapper) {
    wrapper.innerHTML = `
        <div class="lernmodus">
            <div class="verwaltung__kopf">
                <h2 class="verwaltung__titel">${t('schnellueben.titel')}</h2>
            </div>
            <p class="lernmodus__beschreibung">
                ${t('schnellueben.beschreibung')}
            </p>

            <div class="training__optionen-block">
                <div class="training__option-gruppe" id="schnellueben-opt-aufgaben">
                    <div class="training__option-label">${t('schnellueben.aufgabentypen')}</div>
                    <div class="schnellueben__aufgaben-chips" id="schnellueben-aufgaben-chips">
                        <button type="button" class="training__chip ${_einstellungen.aufgaben_typen.includes('multiple_choice') ? 'training__chip--aktiv' : ''}" data-typ="multiple_choice">
                            <span class="material-symbols-outlined">quiz</span> ${t('schnellueben.multiple_choice')}
                        </button>
                        <button type="button" class="training__chip ${_einstellungen.aufgaben_typen.includes('zuordnung') ? 'training__chip--aktiv' : ''}" data-typ="zuordnung">
                            <span class="material-symbols-outlined">link</span> ${t('schnellueben.zuordnung')}
                        </button>
                        <button type="button" class="training__chip ${_einstellungen.aufgaben_typen.includes('satz_bauen') ? 'training__chip--aktiv' : ''}" data-typ="satz_bauen">
                            <span class="material-symbols-outlined">reorder</span> ${t('schnellueben.satz_bauen')}
                        </button>
                        <button type="button" class="training__chip ${_einstellungen.aufgaben_typen.includes('hoer_mc') || _einstellungen.aufgaben_typen.includes('hoer_satz') ? 'training__chip--aktiv' : ''}" data-typ="hoerverstaendnis">
                            <span class="material-symbols-outlined">hearing</span> ${t('schnellueben.hoerverstehen')}
                        </button>
                        <button type="button" class="training__chip ${_einstellungen.aufgaben_typen.includes('sprechen_vokabel') || _einstellungen.aufgaben_typen.includes('sprechen_satz') ? 'training__chip--aktiv' : ''}" data-typ="sprechen" id="schnellueben-chip-sprechen">
                            <span class="material-symbols-outlined">mic</span> ${t('schnellueben.sprechen')}
                        </button>
                        <div class="training__chip-trenner">${t('schnellueben.grammatik')}</div>
                        <button type="button" class="training__chip ${_einstellungen.aufgaben_typen.includes('genus_block') ? 'training__chip--aktiv' : ''}" data-typ="genus_block">
                            <span class="material-symbols-outlined">sort_by_alpha</span> ${t('schnellueben.genus_block')}
                        </button>
                        <button type="button" class="training__chip ${_einstellungen.aufgaben_typen.includes('endungs_matching') ? 'training__chip--aktiv' : ''}" data-typ="endungs_matching">
                            <span class="material-symbols-outlined">match_word</span> ${t('schnellueben.endungen')}
                        </button>
                        <button type="button" class="training__chip ${_einstellungen.aufgaben_typen.includes('gruppen_quiz') ? 'training__chip--aktiv' : ''}" data-typ="gruppen_quiz">
                            <span class="material-symbols-outlined">category</span> ${t('schnellueben.verbgruppe')}
                        </button>
                        <button type="button" class="training__chip ${_einstellungen.aufgaben_typen.includes('partikel_puzzle') ? 'training__chip--aktiv' : ''}" data-typ="partikel_puzzle">
                            <span class="material-symbols-outlined">join_inner</span> ${t('schnellueben.partikelverb')}
                        </button>
                        <button type="button" class="training__chip ${_einstellungen.aufgaben_typen.includes('starkes_verb') ? 'training__chip--aktiv' : ''}" data-typ="starkes_verb">
                            <span class="material-symbols-outlined">flash_on</span> ${t('schnellueben.starke_verben')}
                        </button>
                        <div class="training__chip-trenner">${t('schnellueben.praepositionen')}</div>
                        <button type="button" class="training__chip ${_einstellungen.aufgaben_typen.includes('praep_chunk') || _einstellungen.aufgaben_typen.includes('praep_kategorisierung') ? 'training__chip--aktiv' : ''}" data-typ="praepositionen">
                            <span class="material-symbols-outlined">location_on</span> ${t('schnellueben.praepositionen')}
                        </button>
                    </div>
                </div>

                <div class="training__option-gruppe" id="schnellueben-opt-anzahl">
                    <div class="training__option-label">
                        ${t('schnellueben.anzahl_aufgaben')} <strong id="schnellueben-anzahl-wert">${_einstellungen.anzahl}</strong>
                    </div>
                    <input type="range" class="training__slider" id="schnellueben-anzahl-slider"
                        min="5" max="20" step="1" value="${_einstellungen.anzahl}">
                    <div class="training__slider-labels">
                        <span>5</span><span>8</span><span>10</span><span>12</span><span>15</span><span>20</span>
                    </div>
                </div>

                <div class="training__option-gruppe training__option-gruppe--toggle">
                    <label class="training__toggle-label" id="schnellueben-opt-vorlesen">
                        <span class="training__toggle-wrapper">
                            <input type="checkbox" class="training__toggle-input" id="schnellueben-autovorlesen"
                                ${_einstellungen.autovorlesen ? 'checked' : ''}>
                            <span class="training__toggle-track"></span>
                        </span>
                        <span class="training__toggle-text">
                            <span class="material-symbols-outlined training__toggle-icon">volume_up</span>
                            ${t('training.vorlesen')}
                        </span>
                        <span class="training__toggle-hinweis">${t('schnellueben.vorlesen_hinweis')}</span>
                    </label>
                </div>

                <div class="training__option-gruppe training__option-gruppe--toggle">
                    <label class="training__toggle-label" id="schnellueben-opt-tippen">
                        <span class="training__toggle-wrapper">
                            <input type="checkbox" class="training__toggle-input" id="schnellueben-loesung-tippen"
                                ${_einstellungen.loesung_tippen ? 'checked' : ''}>
                            <span class="training__toggle-track"></span>
                        </span>
                        <span class="training__toggle-text">
                            <span class="material-symbols-outlined training__toggle-icon">keyboard</span>
                            ${t('schnellueben.loesung_tippen')}
                        </span>
                        <span class="training__toggle-hinweis">${t('schnellueben.loesung_tippen_hinweis')}</span>
                    </label>
                </div>

                <div class="training__option-gruppe training__option-gruppe--toggle">
                    <label class="training__toggle-label" id="schnellueben-opt-faellige">
                        <span class="training__toggle-wrapper">
                            <input type="checkbox" class="training__toggle-input" id="schnellueben-faellige"
                                ${_einstellungen.faellige_einmischen ? 'checked' : ''}>
                            <span class="training__toggle-track"></span>
                        </span>
                        <span class="training__toggle-text">
                            <span class="material-symbols-outlined training__toggle-icon">event_repeat</span>
                            ${t('schnellueben.faellige_vokabeln')}
                        </span>
                        <span class="training__toggle-hinweis">${t('schnellueben.faellige_hinweis')}</span>
                    </label>
                </div>
            </div>

            <div class="training__kapitel">
                <h3 class="training__kapitel-titel">${t('schnellueben.lektionen_auswaehlen')}</h3>
                <div id="schnellueben-auswahl" class="lernmodus__auswahl">
                </div>
            </div>

            <div class="lernmodus__aktionen">
                <button class="btn btn--gefuellt" id="btn-schnellueben-starten" disabled>
                    <span class="material-symbols-outlined" style="font-size:20px">bolt</span>
                    ${t('schnellueben.starten')}
                </button>
            </div>
        </div>
    `;

    // Lade-Anzeige im Auswahl-Container
    lade_anzeige_rendern(wrapper.querySelector('#schnellueben-auswahl'));

    // Daten parallel laden
    try {
        const benutzer = holen('benutzer');
        const apiPromises = [
            apiGet('kategorien/liste.php'),
            apiGet('lektionen/liste.php', { pro_seite: 100 }),
            apiGet('favoriten/laden.php'),
        ];
        apiPromises.push(apiGet('lektionen/lernpfad.php'));

        const [kat_erg, lek_erg, fav_erg, lp_erg] = await Promise.all(apiPromises);

        _kategorien = kat_erg.erfolg ? kat_erg.daten : [];
        _lektionen = lek_erg.erfolg ? (lek_erg.daten?.eintraege || lek_erg.daten || []) : [];
        _favoriten_anzahl = fav_erg.erfolg ? (Array.isArray(fav_erg.daten) ? fav_erg.daten.length : 0) : 0;

        // Lernpfad-Map aufbauen (Freischalt-Status je Lektion)
        if (lp_erg?.erfolg && Array.isArray(lp_erg.daten?.lektionen)) {
            _lernpfad_map = new Map(lp_erg.daten.lektionen.map(l => [l.id, l]));
            _aufgaben_ids = new Set((lp_erg.daten.aufgegebene_lektionen || []).map(l => l.id));
        } else {
            _lernpfad_map = null;
            _aufgaben_ids = new Set();
        }
    } catch (e) {
        console.error('Schnellueben Daten laden fehlgeschlagen:', e);
    }

    // Lektionen-Auswahl rendern
    _lektionen_auswahl_rendern(wrapper.querySelector('#schnellueben-auswahl'));

    // --- STT-Verfügbarkeit: Sprechen-Chip ggf. deaktivieren + Hinweis ---
    const sprechenChip = wrapper.querySelector('#schnellueben-chip-sprechen');
    if (sprechenChip && !stt_verfuegbar()) {
        sprechenChip.disabled = true;
        sprechenChip.classList.remove('training__chip--aktiv');
        sprechenChip.title = t('schnellueben.stt_nicht_verfuegbar');
        sprechenChip.style.opacity = '0.4';
        sprechenChip.style.cursor = 'not-allowed';

        // Hinweistext unter den Chips einfügen
        const chipsContainer = wrapper.querySelector('#schnellueben-aufgaben-chips');
        if (chipsContainer) {
            const hinweis = document.createElement('p');
            hinweis.className = 'schnellueben__stt-hinweis';
            hinweis.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:-2px">info</span> ' + t('schnellueben.stt_hinweis');
            chipsContainer.after(hinweis);
        }
    }

    // --- Aufgaben-Chips (Toggle-Verhalten, mind. 1 aktiv) ---
    wrapper.querySelectorAll('#schnellueben-aufgaben-chips .training__chip').forEach(chip => {
        chip.addEventListener('click', () => {
            if (chip.disabled) return;
            const aktive = wrapper.querySelectorAll('#schnellueben-aufgaben-chips .training__chip--aktiv');
            const ist_aktiv = chip.classList.contains('training__chip--aktiv');
            // Nur deaktivieren wenn mehr als 1 aktiv
            if (ist_aktiv && aktive.length <= 1) return;
            chip.classList.toggle('training__chip--aktiv');
        });
    });

    // --- Slider-Event ---
    const slider = wrapper.querySelector('#schnellueben-anzahl-slider');
    const anzahl_wert = wrapper.querySelector('#schnellueben-anzahl-wert');
    if (slider) {
        slider.addEventListener('input', () => {
            anzahl_wert.textContent = slider.value;
        });
    }

    // --- Starten-Button ---
    wrapper.querySelector('#btn-schnellueben-starten')?.addEventListener('click', () => {
        _einstellungen_lesen(wrapper);
        _spiel_starten(wrapper);
    });
}

/**
 * Lektionen-Auswahl mit aufklappbaren Kategoriegruppen rendern (Training-Stil)
 */
function _lektionen_auswahl_rendern(container) {
    if (!container) return;
    container.innerHTML = '';

    if (_lektionen.length === 0 && _favoriten_anzahl === 0) {
        leer_zustand_rendern(container, 'menu_book', t('schnellueben.keine_lektionen'),
            t('schnellueben.keine_lektionen_text'), t('schnellueben.zu_lektionen'), () => navigieren('/lektionen'));
        return;
    }

    // Letzte offene Gruppe aus localStorage
    const letzte_gruppe = localStorage.getItem(LS_KEY_GRUPPE);
    if (letzte_gruppe && _aufgeklappte_gruppen.size === 0) {
        _aufgeklappte_gruppen.add(letzte_gruppe);
    }

    // Private Lektionen (eigene + Gruppen) separat herausfiltern
    const meine_privaten = _lektionen.filter(l => l.ist_privat);
    const oeffentliche   = _lektionen.filter(l => !l.ist_privat);

    // Nur öffentliche nach Kategorie gruppieren
    const lektion_nach_kat = new Map();
    for (const l of oeffentliche) {
        const kid = l.kategorie_id || 0;
        if (!lektion_nach_kat.has(kid)) lektion_nach_kat.set(kid, []);
        lektion_nach_kat.get(kid).push(l);
    }

    let html = '';

    // Favoriten
    if (_favoriten_anzahl > 0) {
        const fav_checked = _einstellungen.favoriten ? ' checked' : '';
        html += `
            <div class="lernmodus__gruppe lernmodus__favoriten-gruppe">
                <label class="lernmodus__checkbox-label lernmodus__favoriten-label">
                    <input type="checkbox" class="lernmodus__checkbox" id="schnellueben-favoriten"${fav_checked}>
                    <span class="material-symbols-outlined" style="color: var(--md-sys-color-secondary)">star</span>
                    <strong>${t('schnellueben.meine_favoriten')}</strong>
                    <span class="lernmodus__anzahl">${t('lernmodus.vokabeln_anzahl', {anzahl: _favoriten_anzahl})}</span>
                </label>
            </div>
            <hr class="lernmodus__trenner">
        `;
    }

    // Meine Lektionen (private Lektionen des Nutzers + Gruppen-Lektionen)
    if (meine_privaten.length > 0) {
        const gruppe_key = 'meine-lektionen';
        const ist_offen = _aufgeklappte_gruppen.has(gruppe_key);
        const alle_kat_ids = meine_privaten.map(l => l.id);
        const alle_gewaehlt = alle_kat_ids.length > 0
            && alle_kat_ids.every(id => _einstellungen.lektion_ids.includes(id));

        html += `
            <div class="lernmodus__gruppe lernmodus__gruppe--klappbar" data-gruppe="${gruppe_key}">
                <div class="lernmodus__gruppe-kopf training__gruppe-kopf-zeile">
                    <label class="training__kat-checkbox-label" title="${t('training.alle_eigenen_title')}">
                        <input type="checkbox" class="lernmodus__checkbox training__kat-checkbox"
                            data-kat-ids="${alle_kat_ids.join(',')}"
                            ${alle_gewaehlt ? 'checked' : ''}>
                    </label>
                    <button type="button" class="lernmodus__gruppe-kopf-toggle" data-toggle="${gruppe_key}" style="flex:1;display:flex;align-items:center;gap:8px;background:none;border:none;cursor:pointer;padding:0;color:inherit;text-align:left;">
                        <span class="material-symbols-outlined" style="font-size:18px;color:var(--md-sys-color-primary)">lock_open</span>
                        <span class="lernmodus__gruppe-titel">${t('schnellueben.meine_lektionen')}</span>
                        <span class="lernmodus__anzahl">${t('lernmodus.lektionen_anzahl', {anzahl: meine_privaten.length})}</span>
                        <span class="material-symbols-outlined lernmodus__gruppe-pfeil ${ist_offen ? 'lernmodus__gruppe-pfeil--offen' : ''}">expand_more</span>
                    </button>
                </div>
                <div class="lernmodus__gruppe-inhalt ${ist_offen ? '' : 'versteckt'}">
        `;
        for (const l of meine_privaten) {
            html += _lektion_checkbox_html(l);
        }
        html += `</div></div><hr class="lernmodus__trenner">`;
    }

    // Kategorien hierarchisch (aufklappbar)
    for (const lehrwerk of _kategorien) {
        const direkt = lektion_nach_kat.get(lehrwerk.id) || [];
        const hat_kinder_lektionen = (lehrwerk.kinder || []).some(k =>
            (lektion_nach_kat.get(k.id) || []).length > 0
        );
        if (direkt.length === 0 && !hat_kinder_lektionen) continue;

        const gruppe_key = `kat-${lehrwerk.id}`;
        const ist_offen = _aufgeklappte_gruppen.has(gruppe_key);

        const alle_kat_lektion_ids = [
            ...direkt.map(l => l.id),
            ...(lehrwerk.kinder || []).flatMap(k => (lektion_nach_kat.get(k.id) || []).map(l => l.id)),
        ];
        const alle_gewaehlt = alle_kat_lektion_ids.length > 0
            && alle_kat_lektion_ids.every(id => _einstellungen.lektion_ids.includes(id));

        let lektion_anzahl = direkt.length;
        for (const k of (lehrwerk.kinder || [])) {
            lektion_anzahl += (lektion_nach_kat.get(k.id) || []).length;
        }

        html += `
            <div class="lernmodus__gruppe lernmodus__gruppe--klappbar" data-gruppe="${esc(gruppe_key)}">
                <div class="lernmodus__gruppe-kopf training__gruppe-kopf-zeile">
                    <label class="training__kat-checkbox-label" title="${t('training.alle_kategorie_title')}">
                        <input type="checkbox" class="lernmodus__checkbox training__kat-checkbox"
                            data-kat-ids="${alle_kat_lektion_ids.join(',')}"
                            ${alle_gewaehlt ? 'checked' : ''}>
                    </label>
                    <button type="button" class="lernmodus__gruppe-kopf-toggle" data-toggle="${esc(gruppe_key)}" style="flex:1;display:flex;align-items:center;gap:8px;background:none;border:none;cursor:pointer;padding:0;color:inherit;text-align:left;">
                        <span class="lernmodus__gruppe-titel">${esc(lehrwerk.name)}</span>
                        <span class="lernmodus__anzahl">${t('lernmodus.lektionen_anzahl', {anzahl: lektion_anzahl})}</span>
                        <span class="material-symbols-outlined lernmodus__gruppe-pfeil ${ist_offen ? 'lernmodus__gruppe-pfeil--offen' : ''}">expand_more</span>
                    </button>
                </div>
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

    // Ohne Kategorie
    const ohne_kat = lektion_nach_kat.get(0) || [];
    if (ohne_kat.length > 0) {
        const gruppe_key = 'ohne';
        const ist_offen = _aufgeklappte_gruppen.has(gruppe_key);
        const alle_kat_ids = ohne_kat.map(l => l.id);
        const alle_gewaehlt = alle_kat_ids.every(id => _einstellungen.lektion_ids.includes(id));

        html += `
            <div class="lernmodus__gruppe lernmodus__gruppe--klappbar" data-gruppe="${gruppe_key}">
                <div class="lernmodus__gruppe-kopf training__gruppe-kopf-zeile">
                    <label class="training__kat-checkbox-label" title="${t('training.alle_lektionen_title')}">
                        <input type="checkbox" class="lernmodus__checkbox training__kat-checkbox"
                            data-kat-ids="${alle_kat_ids.join(',')}"
                            ${alle_gewaehlt ? 'checked' : ''}>
                    </label>
                    <button type="button" class="lernmodus__gruppe-kopf-toggle" data-toggle="${gruppe_key}" style="flex:1;display:flex;align-items:center;gap:8px;background:none;border:none;cursor:pointer;padding:0;color:inherit;text-align:left;">
                        <span class="lernmodus__gruppe-titel">${t('schnellueben.ohne_kategorie')}</span>
                        <span class="lernmodus__anzahl">${t('lernmodus.lektionen_anzahl', {anzahl: ohne_kat.length})}</span>
                        <span class="material-symbols-outlined lernmodus__gruppe-pfeil ${ist_offen ? 'lernmodus__gruppe-pfeil--offen' : ''}">expand_more</span>
                    </button>
                </div>
                <div class="lernmodus__gruppe-inhalt ${ist_offen ? '' : 'versteckt'}">
        `;
        for (const l of ohne_kat) {
            html += _lektion_checkbox_html(l);
        }
        html += `</div></div>`;
    }

    container.innerHTML = html;

    // Aufklapp-Events
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

    // Kategorie-Checkbox (alle Lektionen der Gruppe)
    container.querySelectorAll('.training__kat-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
            const ids = cb.dataset.katIds.split(',').filter(Boolean).map(Number);
            const gruppe_div = cb.closest('.lernmodus__gruppe');
            ids.forEach(id => {
                const lek_cb = gruppe_div?.querySelector(`.schnellueben__lektion-checkbox[data-lektion-id="${id}"]`);
                if (lek_cb && !lek_cb.disabled) lek_cb.checked = cb.checked;
            });
            _starten_button_aktualisieren(container.closest('.lernmodus') || document);
        });
    });

    // Lektion-Checkboxen
    container.querySelectorAll('.schnellueben__lektion-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
            const gruppe_div = cb.closest('.lernmodus__gruppe');
            if (gruppe_div) {
                const kat_cb = gruppe_div.querySelector('.training__kat-checkbox');
                const alle_lek = gruppe_div.querySelectorAll('.schnellueben__lektion-checkbox');
                if (kat_cb && alle_lek.length > 0) {
                    kat_cb.checked = Array.from(alle_lek).every(c => c.checked);
                    kat_cb.indeterminate = !kat_cb.checked && Array.from(alle_lek).some(c => c.checked);
                }
            }
            _starten_button_aktualisieren(container.closest('.lernmodus') || document);
        });
    });

    // Favoriten
    container.querySelector('#schnellueben-favoriten')?.addEventListener('change', () => {
        _starten_button_aktualisieren(container.closest('.lernmodus') || document);
    });

    _starten_button_aktualisieren(container.closest('.lernmodus') || document);
}

function _lektion_checkbox_html(lektion) {
    const anzahl = lektion.vokabel_anzahl ?? lektion.vokabel_count ?? 0;

    // Nur Lektionen sperren, die IN der Lernpfad-Map sind UND dort als gesperrt gelten.
    // Unkategorisierte öffentliche und private Lektionen sind immer zugänglich.
    const lp = _lernpfad_map?.get(lektion.id);
    const gesperrt = !lektion.ist_privat && lp !== undefined && !lp.freigeschaltet;

    const gewaehlt = !gesperrt && _einstellungen.lektion_ids.includes(lektion.id) ? ' checked' : '';
    const schlossHtml = gesperrt
        ? `<span class="material-symbols-outlined lernmodus__schloss-icon">lock</span>`
        : '';

    return `
        <label class="lernmodus__checkbox-label${gesperrt ? ' lernmodus__checkbox-label--gesperrt' : ''}"
               ${gesperrt ? `title="${t('schnellueben.lektion_gesperrt')}"` : ''}>
            <input type="checkbox" class="lernmodus__checkbox schnellueben__lektion-checkbox"
                data-lektion-id="${lektion.id}"${gewaehlt}${gesperrt ? ' disabled' : ''}>
            ${schlossHtml}
            <span>${esc(lektion.titel || `Lektion ${lektion.id}`)}</span>
            <span class="lernmodus__anzahl">${t('lernmodus.vokabeln_anzahl', {anzahl: anzahl})}</span>
            ${lektion.sprachniveau
                ? `<span class="tag tag--${lektion.sprachniveau.toLowerCase()}">${esc(lektion.sprachniveau)}</span>`
                : ''}
        </label>
    `;
}

function _starten_button_aktualisieren(kontext) {
    const btn = kontext.querySelector('#btn-schnellueben-starten');
    if (!btn) return;
    const fav_cb = kontext.querySelector('#schnellueben-favoriten');
    const fav_gewaehlt = fav_cb?.checked || false;
    const lek_gewaehlt = Array.from(kontext.querySelectorAll('.schnellueben__lektion-checkbox')).some(cb => cb.checked);
    btn.disabled = !fav_gewaehlt && !lek_gewaehlt;
}

/**
 * Einstellungen aus DOM lesen
 */
function _einstellungen_lesen(wrapper) {
    // Slider Anzahl
    const slider = wrapper.querySelector('#schnellueben-anzahl-slider');
    if (slider) _einstellungen.anzahl = parseInt(slider.value) || 8;

    // Aufgaben-Typen (aktive Chips)
    _einstellungen.aufgaben_typen = [];
    wrapper.querySelectorAll('#schnellueben-aufgaben-chips .training__chip--aktiv').forEach(chip => {
        const typ = chip.dataset.typ;
        if (typ === 'hoerverstaendnis') {
            _einstellungen.aufgaben_typen.push('hoer_mc', 'hoer_satz');
        } else if (typ === 'sprechen') {
            _einstellungen.aufgaben_typen.push('sprechen_vokabel', 'sprechen_satz');
        } else if (typ === 'praepositionen') {
            _einstellungen.aufgaben_typen.push('praep_chunk', 'praep_kategorisierung');
        } else {
            _einstellungen.aufgaben_typen.push(typ);
        }
    });
    if (_einstellungen.aufgaben_typen.length === 0) {
        _einstellungen.aufgaben_typen = ['multiple_choice'];
    }

    // Lektion-IDs (disabled = vom Lernpfad gesperrt, nie einschliessen)
    _einstellungen.lektion_ids = [];
    wrapper.querySelectorAll('.schnellueben__lektion-checkbox').forEach(cb => {
        if (cb.checked && !cb.disabled) {
            _einstellungen.lektion_ids.push(parseInt(cb.dataset.lektionId));
        }
    });

    // Favoriten
    const fav_cb = wrapper.querySelector('#schnellueben-favoriten');
    _einstellungen.favoriten = fav_cb?.checked || false;

    // Vorlesen
    const av_cb = wrapper.querySelector('#schnellueben-autovorlesen');
    _einstellungen.autovorlesen = av_cb?.checked || false;

    // Lösung tippen
    const lt_cb = wrapper.querySelector('#schnellueben-loesung-tippen');
    _einstellungen.loesung_tippen = lt_cb?.checked || false;

    // Fällige Vokabeln einmischen
    const fael_cb = wrapper.querySelector('#schnellueben-faellige');
    _einstellungen.faellige_einmischen = fael_cb?.checked ?? true;
}

// ============================================
// Spiel starten
// ============================================

async function _spiel_starten(wrapper) {
    // Interferenz-Check (einmal pro Tag)
    const interferenz = await interferenz_pruefen();

    lade_anzeige_rendern(wrapper);

    const startPayload = {
        lektion_ids: _einstellungen.lektion_ids,
        favoriten: _einstellungen.favoriten,
        anzahl: _einstellungen.anzahl,
        aufgaben_typen: _einstellungen.aufgaben_typen,
        faellige_einmischen: _einstellungen.faellige_einmischen,
    };

    // Override vom Interferenz-Dialog anwenden
    if (interferenz.override !== null) {
        startPayload.neue_vokabeln_faktor_override = interferenz.override;
    }

    const ergebnis = await apiPost('schnellueben/starten.php', startPayload);

    lade_anzeige_entfernen(wrapper);

    if (!ergebnis.erfolg) {
        apiFehlerAnzeigen(ergebnis);
        return;
    }

    _sitzung_id = ergebnis.daten.sitzung_id;
    _aufgaben = ergebnis.daten.aufgaben;
    _aktueller_index = 0;
    _ergebnisse = [];

    if (_aufgaben.length === 0) {
        fehlerToast(t('schnellueben.keine_aufgaben'));
        return;
    }

    _ansicht = 'spiel';
    rendern();
}

// ============================================
// Bildschirm 2: Spiel-Schleife
// ============================================

function _spiel_rendern(wrapper) {
    wrapper.innerHTML = '';

    const gesamt = _aufgaben.length;

    // --- Fortschritt ---
    const fortschritt_bereich = document.createElement('div');
    fortschritt_bereich.className = 'schnellueben__fortschritt-bereich';

    const zaehler = document.createElement('span');
    zaehler.className = 'schnellueben__zaehler';
    zaehler.textContent = `${_aktueller_index + 1} / ${gesamt}`;
    fortschritt_bereich.appendChild(zaehler);

    const progress = document.createElement('md-linear-progress');
    progress.className = 'schnellueben__fortschritt';
    progress.value = gesamt > 0 ? _aktueller_index / gesamt : 0;
    fortschritt_bereich.appendChild(progress);

    const beenden_btn = document.createElement('button');
    beenden_btn.type = 'button';
    beenden_btn.className = 'schnellueben__beenden-btn';
    beenden_btn.setAttribute('aria-label', t('schnellueben.beenden'));
    beenden_btn.innerHTML = '<span class="material-symbols-outlined">close</span>';
    beenden_btn.addEventListener('click', () => {
        vorlesen_stoppen();
        _ansicht = 'auswahl';
        _aktueller_index = 0;
        _ergebnisse = [];
        _aufgaben = [];
        _sitzung_id = null;
        rendern({});
    });
    fortschritt_bereich.appendChild(beenden_btn);

    wrapper.appendChild(fortschritt_bereich);

    // --- Überschrift ---
    const ueberschrift = document.createElement('h2');
    ueberschrift.className = 'schnellueben__spiel-titel';
    ueberschrift.textContent = t('schnellueben.titel');
    wrapper.appendChild(ueberschrift);

    // --- Alle Aufgaben beantwortet? ---
    if (_aktueller_index >= _aufgaben.length) {
        _sitzung_beenden(wrapper);
        return;
    }

    // --- Aktuelle Aufgabe rendern ---
    const aufgabe = _aufgaben[_aktueller_index];
    const aufgaben_container = document.createElement('div');
    aufgaben_container.className = 'schnellueben__aufgabe';

    let element = null;

    switch (aufgabe.typ) {
        case 'multiple_choice':
            element = multiple_choice_erstellen(aufgabe, {
                onAntwort: (richtig) => _antwort_senden(aufgabe, richtig),
                onWeiter: () => _naechste_aufgabe(wrapper),
            });
            break;

        case 'zuordnung':
            element = zuordnung_erstellen(aufgabe, {
                onFertig: (alle_richtig) => _zuordnung_fertig(aufgabe, alle_richtig),
                onWeiter: () => _naechste_aufgabe(wrapper),
            });
            break;

        case 'satz_bauen':
            element = wort_sortieren_erstellen(aufgabe, {
                onAntwort: (richtig) => _antwort_senden(aufgabe, richtig),
                onWeiter: () => _naechste_aufgabe(wrapper),
            });
            break;

        case 'hoer_mc':
        case 'hoer_satz':
            element = hoer_aufgabe_erstellen(aufgabe, {
                onAntwort: (richtig) => _antwort_senden(aufgabe, richtig),
                onWeiter: () => _naechste_aufgabe(wrapper),
            });
            break;

        case 'sprechen_vokabel':
        case 'sprechen_satz':
            element = sprech_aufgabe_erstellen(aufgabe, {
                onAntwort: (richtig) => _antwort_senden(aufgabe, richtig),
                onWeiter: () => _naechste_aufgabe(wrapper),
            });
            break;

        case 'genus_block':
            element = _genus_block_rendern(aufgabe);
            break;

        case 'endungs_matching':
            element = _endungs_matching_rendern(aufgabe);
            break;

        case 'gruppen_quiz':
            element = _gruppen_quiz_rendern(aufgabe);
            break;

        case 'partikel_puzzle':
            element = _partikel_puzzle_rendern(aufgabe);
            break;

        case 'starkes_verb':
            element = _starkes_verb_rendern(aufgabe);
            break;

        case 'praep_chunk':
            element = _praep_chunk_rendern(aufgabe);
            break;

        case 'praep_kategorisierung':
            element = _praep_kategorisierung_rendern(aufgabe);
            break;

        default:
            console.warn('Unbekannter Aufgabentyp:', aufgabe.typ);
            // Fallback: naechste Aufgabe
            _aktueller_index++;
            _spiel_rendern(wrapper);
            return;
    }

    if (element) {
        aufgaben_container.appendChild(element);
    }

    wrapper.appendChild(aufgaben_container);
}

/**
 * Antwort an Server senden (MC + Satz bauen)
 */
async function _antwort_senden(aufgabe, richtig) {
    try {
        const ergebnis = await apiPost('schnellueben/antwort.php', {
            sitzung_id: _sitzung_id,
            aufgabe_index: aufgabe.index,
            typ: aufgabe.typ,
            richtig: richtig,
        });

        _ergebnisse.push({
            index: aufgabe.index,
            typ: aufgabe.typ,
            richtig: richtig,
            xp: ergebnis.erfolg ? (ergebnis.daten?.xp || 0) : 0,
        });
    } catch (e) {
        console.error('Antwort senden fehlgeschlagen:', e);
        _ergebnisse.push({
            index: aufgabe.index,
            typ: aufgabe.typ,
            richtig: richtig,
            xp: 0,
        });
    }
}

/**
 * Zuordnung fertig — alle Paare als einzelne Antworten senden
 */
async function _zuordnung_fertig(aufgabe, alle_richtig) {
    // Zuordnung: Jedes Paar zaehlt als eine Antwort
    const paare_anzahl = aufgabe.gesamt_paare || aufgabe.paare?.length || 4;

    try {
        // Alle Paare als richtige Antworten senden
        for (let i = 0; i < paare_anzahl; i++) {
            await apiPost('schnellueben/antwort.php', {
                sitzung_id: _sitzung_id,
                aufgabe_index: aufgabe.index,
                typ: 'zuordnung',
                richtig: true,  // Jedes verbundene Paar ist korrekt
            });
        }

        _ergebnisse.push({
            index: aufgabe.index,
            typ: 'zuordnung',
            richtig: alle_richtig,
            xp: paare_anzahl * 3,  // 3 XP pro Paar
        });
    } catch (e) {
        console.error('Zuordnung Antwort senden fehlgeschlagen:', e);
        _ergebnisse.push({
            index: aufgabe.index,
            typ: 'zuordnung',
            richtig: alle_richtig,
            xp: 0,
        });
    }
}

// ============================================
// Grammatik-Renderer (Schnell-Üben)
// ============================================

/**
 * Hilfsfunktion: Grammatik-Antwort für Schnell-Üben senden.
 * Sendet richtig/falsch + optional Grammatikfortschritt.
 */
async function _grammatik_antwort_schnell(aufgabe, richtig, vokabel_id = null, grammatik_typ = null) {
    try {
        const payload = {
            sitzung_id: _sitzung_id,
            aufgabe_index: aufgabe.index,
            typ: aufgabe.typ,
            richtig: richtig,
        };
        if (vokabel_id) payload.vokabel_id = vokabel_id;
        if (grammatik_typ) payload.grammatik_typ = grammatik_typ;

        const ergebnis = await apiPost('schnellueben/antwort.php', payload);
        return ergebnis.erfolg ? (ergebnis.daten?.xp || 0) : 0;
    } catch (e) {
        console.error('Grammatik-Antwort senden fehlgeschlagen:', e);
        return 0;
    }
}

/**
 * Genus-Block: 4 Nomen, User tippt alle en/ett-Wörter an, dann "Prüfen".
 */
function _genus_block_rendern(aufgabe) {
    const el = document.createElement('div');
    el.className = 'grammatik-aufgabe';

    const ziel = aufgabe.ziel_genus || 'en';

    el.innerHTML = `
        <div class="grammatik-aufgabe__header">
            <span class="grammatik-aufgabe__badge">${t('schnellueben.genus_block')}</span>
        </div>
        <div class="grammatik-aufgabe__frage">${t('schnellueben.genus_frage', {genus: esc(ziel)})}</div>
        <div class="grammatik-woerter-grid" id="genus-woerter-grid"></div>
        <div class="grammatik-aufgabe__feedback" id="genus-feedback" style="display:none"></div>
        <button type="button" class="btn btn--umrissen grammatik-aufgabe__pruefen" id="genus-pruefen">
            <span class="material-symbols-outlined">check_circle</span> ${t('allgemein.pruefen')}
        </button>
        <button type="button" class="grammatik-aufgabe__weiter" id="genus-weiter" style="display:none">
            ${t('allgemein.weiter')} <span class="material-symbols-outlined">arrow_forward</span>
        </button>
    `;

    // Wort-Karten rendern
    const grid = el.querySelector('#genus-woerter-grid');
    const getippte_ids = new Set();
    (aufgabe.woerter || []).forEach(wort => {
        const karte = document.createElement('button');
        karte.type = 'button';
        karte.className = 'grammatik-wort-karte';
        karte.dataset.vokabelId = wort.vokabel_id;
        karte.textContent = wort.text;
        karte.addEventListener('click', () => {
            if (karte.disabled) return;
            if (getippte_ids.has(wort.vokabel_id)) {
                getippte_ids.delete(wort.vokabel_id);
                karte.classList.remove('grammatik-wort-karte--markiert');
            } else {
                getippte_ids.add(wort.vokabel_id);
                karte.classList.add('grammatik-wort-karte--markiert');
            }
        });
        grid.appendChild(karte);
    });

    // Prüfen-Button
    el.querySelector('#genus-pruefen').addEventListener('click', async () => {
        el.querySelector('#genus-pruefen').disabled = true;
        grid.querySelectorAll('.grammatik-wort-karte').forEach(k => k.disabled = true);

        const richtige_ids = new Set(aufgabe.richtige_ids || []);
        let alle_richtig = true;
        let gesamt_xp = 0;

        for (const wort of (aufgabe.woerter || [])) {
            const karte = grid.querySelector(`[data-vokabel-id="${wort.vokabel_id}"]`);
            const markiert = getippte_ids.has(wort.vokabel_id);
            const ist_richtig_wort = richtige_ids.has(wort.vokabel_id);
            const wort_richtig = markiert === ist_richtig_wort;

            if (!wort_richtig) alle_richtig = false;

            if (karte) {
                karte.classList.remove('grammatik-wort-karte--markiert');
                if (ist_richtig_wort) {
                    karte.classList.add('grammatik-wort-karte--richtig');
                } else if (markiert) {
                    karte.classList.add('grammatik-wort-karte--falsch');
                }
            }

            const xp = await _grammatik_antwort_schnell(aufgabe, wort_richtig, wort.vokabel_id, 'genus_block');
            gesamt_xp += xp;
        }

        _ergebnisse.push({ index: aufgabe.index, typ: 'genus_block', richtig: alle_richtig, xp: gesamt_xp });

        // Ergebnis-Feedback anzeigen
        const feedback_el = el.querySelector('#genus-feedback');
        if (feedback_el) {
            if (alle_richtig) {
                feedback_el.innerHTML = `<span class="grammatik-feedback--richtig">✓ ${t('allgemein.richtig')}${gesamt_xp > 0 ? ` <strong>+${gesamt_xp} XP</strong>` : ''}</span>`;
            } else if (gesamt_xp > 0) {
                feedback_el.innerHTML = `<span class="grammatik-feedback--richtig"><strong>+${gesamt_xp} XP</strong> ${t('schnellueben.genus_teilweise')}</span>`;
            }
            feedback_el.style.display = 'block';
        }

        const weiter = el.querySelector('#genus-weiter');
        weiter.style.display = 'flex';
        weiter.addEventListener('click', () => {
            _aktueller_index++;
            _spiel_rendern(el.closest('.schnellueben'));
        });
    });

    return el;
}

/**
 * Endungs-Matching: Infinitiv → Präteritum-Endung wählen.
 */
function _endungs_matching_rendern(aufgabe) {
    const el = document.createElement('div');
    el.className = 'grammatik-aufgabe';

    el.innerHTML = `
        <div class="grammatik-aufgabe__header">
            <span class="grammatik-aufgabe__badge">${t('schnellueben.endung_badge')}</span>
        </div>
        <div class="grammatik-aufgabe__verb">${esc(aufgabe.stamm || aufgabe.infinitiv || '')}<span class="grammatik-aufgabe__stamm-strich">–</span></div>
        <div class="grammatik-aufgabe__deutsch">${esc(aufgabe.deutsch || '')}</div>
        <div class="grammatik-aufgabe__frage">${t('schnellueben.endung_frage', {form: esc(aufgabe.zielform_label || 'Präteritum')})}</div>
        <div class="grammatik-aufgabe__buttons" id="endungs-buttons"></div>
        <div class="grammatik-aufgabe__feedback" id="endungs-feedback" style="display:none"></div>
        ${aufgabe.grammatik_regel_id ? `<button type="button" class="grammatik-aufgabe__regel-link" id="endungs-regel-btn">
            <span class="material-symbols-outlined">info</span> ${t('training.grammatikregel')}
        </button>` : ''}
        <button type="button" class="grammatik-aufgabe__weiter" id="endungs-weiter" style="display:none">
            ${t('allgemein.weiter')} <span class="material-symbols-outlined">arrow_forward</span>
        </button>
    `;

    const buttons_div = el.querySelector('#endungs-buttons');
    (aufgabe.optionen || []).forEach(option => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'grammatik-btn';
        btn.textContent = option;
        btn.addEventListener('click', () => _schnell_option_gewaehlt(option, aufgabe, el, 'endungs-buttons', 'endungs-feedback', 'endungs-weiter'));
        buttons_div.appendChild(btn);
    });

    el.querySelector('#endungs-regel-btn')?.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('grammatik_regel_popup', { detail: { regel_id: aufgabe.grammatik_regel_id } }));
    });

    return el;
}

/**
 * Gruppen-Quiz: Infinitiv → Verbgruppe wählen.
 */
function _gruppen_quiz_rendern(aufgabe) {
    const el = document.createElement('div');
    el.className = 'grammatik-aufgabe';

    el.innerHTML = `
        <div class="grammatik-aufgabe__header">
            <span class="grammatik-aufgabe__badge">${t('schnellueben.verbgruppe')}</span>
        </div>
        <div class="grammatik-aufgabe__verb">${esc(aufgabe.infinitiv || '')}</div>
        <div class="grammatik-aufgabe__frage">${t('schnellueben.verbgruppe_frage')}</div>
        <div class="grammatik-aufgabe__buttons" id="gruppen-buttons"></div>
        <div class="grammatik-aufgabe__feedback" id="gruppen-feedback" style="display:none"></div>
        ${aufgabe.grammatik_regel_id ? `<button type="button" class="grammatik-aufgabe__regel-link" id="gruppen-regel-btn">
            <span class="material-symbols-outlined">info</span> ${t('training.grammatikregel')}
        </button>` : ''}
        <button type="button" class="grammatik-aufgabe__weiter" id="gruppen-weiter" style="display:none">
            ${t('allgemein.weiter')} <span class="material-symbols-outlined">arrow_forward</span>
        </button>
    `;

    const buttons_div = el.querySelector('#gruppen-buttons');
    (aufgabe.optionen || []).forEach(option => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'grammatik-btn';
        btn.textContent = option;
        btn.addEventListener('click', () => _schnell_option_gewaehlt(option, aufgabe, el, 'gruppen-buttons', 'gruppen-feedback', 'gruppen-weiter'));
        buttons_div.appendChild(btn);
    });

    el.querySelector('#gruppen-regel-btn')?.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('grammatik_regel_popup', { detail: { regel_id: aufgabe.grammatik_regel_id } }));
    });

    return el;
}

/**
 * Partikel-Puzzle: Hauptverb → Partikel wählen.
 */
function _partikel_puzzle_rendern(aufgabe) {
    const el = document.createElement('div');
    el.className = 'grammatik-aufgabe';

    el.innerHTML = `
        <div class="grammatik-aufgabe__header">
            <span class="grammatik-aufgabe__badge">${t('schnellueben.partikelverb')}</span>
        </div>
        <div class="grammatik-aufgabe__verb">${esc(aufgabe.hauptverb || '')} ___</div>
        ${aufgabe.bedeutung_mit ? `<div class="grammatik-aufgabe__kontext">= ${esc(aufgabe.bedeutung_mit)}</div>` : ''}
        <div class="grammatik-aufgabe__frage">${t('schnellueben.partikel_frage')}</div>
        <div class="grammatik-aufgabe__buttons" id="partikel-buttons"></div>
        <div class="grammatik-aufgabe__feedback" id="partikel-feedback" style="display:none"></div>
        <button type="button" class="grammatik-aufgabe__weiter" id="partikel-weiter" style="display:none">
            ${t('allgemein.weiter')} <span class="material-symbols-outlined">arrow_forward</span>
        </button>
    `;

    const buttons_div = el.querySelector('#partikel-buttons');
    (aufgabe.optionen || []).forEach(option => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'grammatik-btn';
        btn.textContent = option;
        btn.addEventListener('click', () => _schnell_option_gewaehlt(option, aufgabe, el, 'partikel-buttons', 'partikel-feedback', 'partikel-weiter'));
        buttons_div.appendChild(btn);
    });

    return el;
}

/**
 * Starkes Verb: Infinitiv → Vokalklasse wählen, danach alle 4 Formen anzeigen.
 */
function _starkes_verb_rendern(aufgabe) {
    const el = document.createElement('div');
    el.className = 'grammatik-aufgabe';

    el.innerHTML = `
        <div class="grammatik-aufgabe__header">
            <span class="grammatik-aufgabe__badge">${t('schnellueben.starke_verben')}</span>
        </div>
        <div class="grammatik-aufgabe__verb">${esc(aufgabe.infinitiv || '')}</div>
        <div class="grammatik-aufgabe__frage">${t('schnellueben.starkes_verb_frage')}</div>
        <div class="grammatik-aufgabe__buttons" id="starkes-buttons"></div>
        <div class="grammatik-aufgabe__feedback" id="starkes-feedback" style="display:none"></div>
        ${aufgabe.grammatik_regel_id ? `<button type="button" class="grammatik-aufgabe__regel-link" id="starkes-regel-btn">
            <span class="material-symbols-outlined">info</span> ${t('training.grammatikregel')}
        </button>` : ''}
        <button type="button" class="grammatik-aufgabe__weiter" id="starkes-weiter" style="display:none">
            ${t('allgemein.weiter')} <span class="material-symbols-outlined">arrow_forward</span>
        </button>
    `;

    const buttons_div = el.querySelector('#starkes-buttons');
    (aufgabe.optionen || []).forEach(option => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'grammatik-btn';
        btn.textContent = option;
        btn.addEventListener('click', async () => {
            const richtig = option === aufgabe.erwartet;

            // Alle Buttons deaktivieren + färben
            buttons_div.querySelectorAll('.grammatik-btn').forEach(b => {
                b.disabled = true;
                if (b.textContent === aufgabe.erwartet) b.classList.add('grammatik-btn--richtig');
                else if (b.textContent === option && !richtig) b.classList.add('grammatik-btn--falsch');
            });

            // Formen-Tabelle immer anzeigen + Richtig/Falsch-Meldung
            const feedback = el.querySelector('#starkes-feedback');
            const formen = aufgabe.formen_loesung || {};
            let feedback_html = '';
            if (richtig) {
                feedback_html += `<div class="grammatik-feedback--richtig" id="starkes-richtig-msg">✓ ${t('allgemein.richtig')}</div>`;
            } else {
                feedback_html += `<div class="grammatik-feedback--falsch">✗ ${t('training.korrekt')} <strong>${esc(aufgabe.erwartet)}</strong></div>`;
            }
            feedback_html += `
                <div class="grammatik-formen-tabelle">
                    ${formen.infinitiv ? `<div class="grammatik-form"><span>${t('training.form_infinitiv')}</span><strong>${esc(formen.infinitiv)}</strong></div>` : ''}
                    ${formen.praesens ? `<div class="grammatik-form"><span>${t('training.form_praesens')}</span><strong>${esc(formen.praesens)}</strong></div>` : ''}
                    ${formen.praeteritum ? `<div class="grammatik-form"><span>${t('training.form_praeteritum')}</span><strong>${esc(formen.praeteritum)}</strong></div>` : ''}
                    ${formen.supinum ? `<div class="grammatik-form"><span>${t('training.form_supinum')}</span><strong>${esc(formen.supinum)}</strong></div>` : ''}
                </div>
            `;
            feedback.innerHTML = feedback_html;
            feedback.style.display = 'block';

            const xp = await _grammatik_antwort_schnell(aufgabe, richtig, aufgabe.vokabel_id, 'starkes_verb');
            _ergebnisse.push({ index: aufgabe.index, typ: 'starkes_verb', richtig, xp });

            // XP in Richtig-Meldung nachsetzen
            if (richtig && xp > 0) {
                const msg = el.querySelector('#starkes-richtig-msg');
                if (msg) msg.textContent = `✓ ${t('allgemein.richtig')} +${xp} XP`;
            }

            const weiter = el.querySelector('#starkes-weiter');
            weiter.style.display = 'flex';
            weiter.addEventListener('click', () => {
                _aktueller_index++;
                _spiel_rendern(el.closest('.schnellueben'));
            });
        });
        buttons_div.appendChild(btn);
    });

    el.querySelector('#starkes-regel-btn')?.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('grammatik_regel_popup', { detail: { regel_id: aufgabe.grammatik_regel_id } }));
    });

    return el;
}

/**
 * Präp-Lückensatz: Schwedischen Satz mit ___ anzeigen, richtige Präposition antippen.
 */
function _praep_chunk_rendern(aufgabe) {
    const el = document.createElement('div');
    el.className = 'grammatik-aufgabe';

    const satz_html = esc(aufgabe.satz || '').replace('___', '<span class="praep-luecke">___</span>');

    el.innerHTML = `
        <div class="grammatik-aufgabe__header">
            <span class="grammatik-aufgabe__badge">${t('praepositionen.typ_chunk')}</span>
        </div>
        <div class="grammatik-aufgabe__satz praep-satz">${satz_html}</div>
        ${aufgabe.uebersetzung ? `<div class="grammatik-aufgabe__deutsch">${esc(aufgabe.uebersetzung)}</div>` : ''}
        <div class="grammatik-aufgabe__frage">${t('praepositionen.welche_praep')}</div>
        <div class="grammatik-aufgabe__buttons" id="praep-chunk-buttons"></div>
        <div class="grammatik-aufgabe__feedback" id="praep-chunk-feedback" style="display:none"></div>
        <button type="button" class="grammatik-aufgabe__weiter" id="praep-chunk-weiter" style="display:none">
            ${t('allgemein.weiter')} <span class="material-symbols-outlined">arrow_forward</span>
        </button>
    `;

    const buttons_div = el.querySelector('#praep-chunk-buttons');
    (aufgabe.optionen || []).forEach(option => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'grammatik-btn';
        btn.textContent = option;
        btn.addEventListener('click', async () => {
            const richtig = option === aufgabe.loesung;

            buttons_div.querySelectorAll('.grammatik-btn').forEach(b => {
                b.disabled = true;
                if (b.textContent === aufgabe.loesung) b.classList.add('grammatik-btn--richtig');
                else if (b.textContent === option && !richtig) b.classList.add('grammatik-btn--falsch');
            });

            const satz_el = el.querySelector('.praep-satz');
            if (satz_el) {
                satz_el.innerHTML = esc(aufgabe.satz || '').replace('___', `<strong class="praep-loesung">${esc(aufgabe.loesung)}</strong>`);
            }

            const feedback = el.querySelector('#praep-chunk-feedback');
            if (feedback) {
                feedback.innerHTML = richtig
                    ? `<span class="grammatik-feedback--richtig">✓ ${t('allgemein.richtig')}</span>`
                    : `<span class="grammatik-feedback--falsch">✗ ${t('training.korrekt')} <strong>${esc(aufgabe.loesung)}</strong></span>`;
                feedback.style.display = 'block';
            }

            const xp = await _grammatik_antwort_schnell(aufgabe, richtig);
            _ergebnisse.push({ index: aufgabe.index, typ: aufgabe.typ, richtig, xp });

            if (richtig && feedback && xp > 0) {
                feedback.innerHTML = `<span class="grammatik-feedback--richtig">✓ ${t('allgemein.richtig')} <strong>+${xp} XP</strong></span>`;
            }

            const weiter = el.querySelector('#praep-chunk-weiter');
            if (weiter) {
                weiter.style.display = 'flex';
                weiter.addEventListener('click', () => {
                    _aktueller_index++;
                    _spiel_rendern(el.closest('.schnellueben'));
                });
            }
        });
        buttons_div.appendChild(btn);
    });

    return el;
}

/**
 * Präp-Kategorisierung: Schwedisches Wort anzeigen, passende Präposition antippen.
 */
function _praep_kategorisierung_rendern(aufgabe) {
    const el = document.createElement('div');
    el.className = 'grammatik-aufgabe';

    el.innerHTML = `
        <div class="grammatik-aufgabe__header">
            <span class="grammatik-aufgabe__badge">${t('praepositionen.typ_kategorisierung')}</span>
        </div>
        <div class="grammatik-aufgabe__verb">${esc(aufgabe.schwedisch || '')}</div>
        ${aufgabe.deutsch ? `<div class="grammatik-aufgabe__deutsch">${esc(aufgabe.deutsch)}</div>` : ''}
        ${aufgabe.beispielsatz ? `<div class="grammatik-aufgabe__kontext">${esc(aufgabe.beispielsatz)}</div>` : ''}
        <div class="grammatik-aufgabe__frage">${t('praepositionen.welche_praep')}</div>
        <div class="grammatik-aufgabe__buttons" id="praep-kat-buttons"></div>
        <div class="grammatik-aufgabe__feedback" id="praep-kat-feedback" style="display:none"></div>
        <button type="button" class="grammatik-aufgabe__weiter" id="praep-kat-weiter" style="display:none">
            ${t('allgemein.weiter')} <span class="material-symbols-outlined">arrow_forward</span>
        </button>
    `;

    const buttons_div = el.querySelector('#praep-kat-buttons');
    (aufgabe.optionen || []).forEach(option => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'grammatik-btn';
        btn.textContent = option;
        btn.addEventListener('click', async () => {
            const richtig = option === aufgabe.loesung;

            buttons_div.querySelectorAll('.grammatik-btn').forEach(b => {
                b.disabled = true;
                if (b.textContent === aufgabe.loesung) b.classList.add('grammatik-btn--richtig');
                else if (b.textContent === option && !richtig) b.classList.add('grammatik-btn--falsch');
            });

            const feedback = el.querySelector('#praep-kat-feedback');
            if (feedback) {
                let html = richtig
                    ? `<span class="grammatik-feedback--richtig">✓ ${t('allgemein.richtig')}</span>`
                    : `<span class="grammatik-feedback--falsch">✗ ${t('training.korrekt')} <strong>${esc(aufgabe.loesung)}</strong></span>`;
                if (aufgabe.merksatz) {
                    html += `<div class="grammatik-aufgabe__merksatz">${esc(aufgabe.merksatz)}</div>`;
                }
                feedback.innerHTML = html;
                feedback.style.display = 'block';
            }

            const xp = await _grammatik_antwort_schnell(aufgabe, richtig);
            _ergebnisse.push({ index: aufgabe.index, typ: aufgabe.typ, richtig, xp });

            if (richtig && feedback && xp > 0) {
                const richtig_span = feedback.querySelector('.grammatik-feedback--richtig');
                if (richtig_span) richtig_span.textContent = `✓ ${t('allgemein.richtig')} +${xp} XP`;
            }

            const weiter = el.querySelector('#praep-kat-weiter');
            if (weiter) {
                weiter.style.display = 'flex';
                weiter.addEventListener('click', () => {
                    _aktueller_index++;
                    _spiel_rendern(el.closest('.schnellueben'));
                });
            }
        });
        buttons_div.appendChild(btn);
    });

    return el;
}

/**
 * Gemeinsamer Handler für einfache Grammatik-Option-Auswahl (endungs/gruppen/partikel).
 */
async function _schnell_option_gewaehlt(option, aufgabe, el, buttons_id, feedback_id, weiter_id) {
    const richtig = option === aufgabe.erwartet;

    // Alle Buttons deaktivieren + färben
    el.querySelector(`#${buttons_id}`)?.querySelectorAll('.grammatik-btn').forEach(btn => {
        btn.disabled = true;
        if (btn.textContent === aufgabe.erwartet) btn.classList.add('grammatik-btn--richtig');
        else if (btn.textContent === option && !richtig) btn.classList.add('grammatik-btn--falsch');
    });

    // Feedback vorab anzeigen (Falsch-Meldung sofort; Richtig wird nach XP-Rückgabe ergänzt)
    const feedback = el.querySelector(`#${feedback_id}`);
    if (feedback) {
        if (!richtig) {
            feedback.innerHTML = `<span class="grammatik-feedback--falsch">✗ ${t('training.korrekt')} <strong>${esc(aufgabe.erwartet)}</strong></span>`;
        } else {
            feedback.innerHTML = `<span class="grammatik-feedback--richtig">✓ ${t('allgemein.richtig')}</span>`;
        }
        feedback.style.display = 'block';
    }

    const xp = await _grammatik_antwort_schnell(aufgabe, richtig, aufgabe.vokabel_id, aufgabe.typ);
    _ergebnisse.push({ index: aufgabe.index, typ: aufgabe.typ, richtig, xp });

    // XP in Richtig-Meldung nachsetzen
    if (richtig && feedback && xp > 0) {
        feedback.innerHTML = `<span class="grammatik-feedback--richtig">✓ ${t('allgemein.richtig')} <strong>+${xp} XP</strong></span>`;
    }

    const weiter = el.querySelector(`#${weiter_id}`);
    if (weiter) {
        weiter.style.display = 'flex';
        weiter.addEventListener('click', () => {
            _aktueller_index++;
            _spiel_rendern(el.closest('.schnellueben'));
        });
    }
}

/**
 * Naechste Aufgabe
 */
function _naechste_aufgabe(wrapper) {
    _aktueller_index++;
    _spiel_rendern(wrapper);
}

// ============================================
// Sitzung beenden
// ============================================

async function _sitzung_beenden(wrapper) {
    lade_anzeige_rendern(wrapper);

    const ergebnis = await apiPost('schnellueben/beenden.php', {
        sitzung_id: _sitzung_id,
    });

    lade_anzeige_entfernen(wrapper);

    if (!ergebnis.erfolg) {
        apiFehlerAnzeigen(ergebnis);
        return;
    }

    _zusammenfassung = ergebnis.daten;

    // Statistik im Store aktualisieren
    const zf = ergebnis.daten.zusammenfassung;
    const aktuelle_statistik = holen('statistik') || {};
    setzen('statistik', {
        ...aktuelle_statistik,
        xp: zf.xp_gesamt,
        streak_tage: zf.streak_tage,
        bronze_sterne: zf.sterne?.bronze || aktuelle_statistik.bronze_sterne,
        silber_sterne: zf.sterne?.silber || aktuelle_statistik.silber_sterne,
        gold_sterne: zf.sterne?.gold || aktuelle_statistik.gold_sterne,
        globales_level: ergebnis.daten.level_aufstieg
            ? ergebnis.daten.level_aufstieg.nach
            : (aktuelle_statistik.globales_level || 1),
    });

    // Letztes Training an Android melden (für Benachrichtigungs-Unterdrückung)
    letztes_training_melden();

    _ansicht = 'zusammenfassung';
    rendern();
}

// ============================================
// Bildschirm 3: Zusammenfassung
// ============================================

function _zusammenfassung_rendern(wrapper) {
    wrapper.innerHTML = '';

    if (!_zusammenfassung) {
        leer_zustand_rendern(wrapper, 'error', t('fehler.titel'), t('schnellueben.keine_zusammenfassung'));
        return;
    }

    const anzeige = ergebnis_anzeige_erstellen(_zusammenfassung, {
        onNochmal: () => {
            // Direkt nochmal starten mit gleichen Einstellungen
            _ansicht = 'auswahl';
            _aufgaben = [];
            _aktueller_index = 0;
            _ergebnisse = [];
            _zusammenfassung = null;

            const inhalt = document.getElementById('inhalt');
            if (inhalt) {
                inhalt.innerHTML = '';
                const w = document.createElement('div');
                w.className = 'schnellueben';
                inhalt.appendChild(w);
                _spiel_starten(w);
            }
        },
        onNochmalGemischt: () => {
            _ansicht = 'auswahl';
            _aufgaben = [];
            _aktueller_index = 0;
            _ergebnisse = [];
            _zusammenfassung = null;

            const inhalt = document.getElementById('inhalt');
            if (inhalt) {
                inhalt.innerHTML = '';
                const w = document.createElement('div');
                w.className = 'schnellueben';
                inhalt.appendChild(w);
                _spiel_starten(w);
            }
        },
        onZurueck: () => {
            _ansicht = 'auswahl';
            _sitzung_id = null;
            _aufgaben = [];
            _aktueller_index = 0;
            _ergebnisse = [];
            _zusammenfassung = null;
            rendern();
        },
        onDashboard: () => {
            navigieren('/dashboard');
        },
    });

    wrapper.appendChild(anzeige);
}
