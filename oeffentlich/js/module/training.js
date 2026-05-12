/**
 * Training — Abfragemodus mit SM-2 Algorithmus
 *
 * 3 Bildschirme: Auswahl → Frage-Schleife → Zusammenfassung.
 * 3 Uebungstypen: Vokabel (60%), Satz (25%), Flexion (15%).
 * XP, Streak, Level-Aufstieg, Belohnungen.
 */

import { apiGet, apiPost } from '../api-client.js';
import { holen, setzen } from '../zustand.js';
import { navigieren } from '../router.js';
import { esc, levelLabel } from '../hilfs-funktionen.js';
import { benachrichtigen, erfolg, fehler as fehlerToast, apiFehlerAnzeigen } from '../benachrichtigungen.js';
import { lade_anzeige_rendern, lade_anzeige_entfernen } from '../komponenten/lade-anzeige.js';
import { leer_zustand_rendern } from '../komponenten/leer-zustand.js';
import { frage_anzeige_erstellen } from '../komponenten/frage-anzeige.js';
import { ergebnis_anzeige_erstellen } from '../komponenten/ergebnis-anzeige.js';
import { sprach_dienst_init } from '../dienste/sprach-dienst.js';
import { letztes_training_melden } from '../dienste/android-benachrichtigungen.js';
import { interferenz_pruefen } from '../komponenten/interferenz-dialog.js';
import { t } from '../dienste/sprache.js';

// ============================================
// Interner Zustand
// ============================================

let _ansicht = 'auswahl';         // 'auswahl' | 'training' | 'zusammenfassung'
let _sitzung_id = null;
let _fragen = [];
let _aktueller_index = 0;
let _ergebnisse = [];
let _falsche_fragen = [];
let _phase = 'normal';            // 'normal' | 'wiederholung'
let _frage_modus = 'eingabe';     // 'eingabe' | 'ergebnis' | 'nachtippen'
let _aktuelles_ergebnis = null;
let _zusammenfassung = null;
let _trotzdem_richtig_anzahl = 0; // Wie oft "Trotzdem richtig" in dieser Sitzung genutzt

let _einstellungen = {
    modus: 'gemischt',
    richtung: 'DS',
    lektion_ids: [],
    favoriten: false,
    nur_faellige: false,
    anzahl: 20,
    level: null,
    autovorlesen: true,  // Standardmäßig aktiv beim Training
    faellige_einmischen: true,  // Fällige Vokabeln aus anderen Lektionen
};

// Daten fuer Auswahl-Bildschirm
let _kategorien = [];
let _lektionen = [];
let _favoriten_anzahl = 0;
let _lernpfad_map = null; // null = inaktiv; Map<id, {freigeschaltet, stufe3_anteil}> wenn aktiv
let _aufgaben_ids = new Set(); // IDs der Aufgaben-Lektionen (immer zugänglich, auch wenn gesperrt)

// ============================================
// Modul-Exports
// ============================================

/**
 * Training-Modul rendern
 */
export async function rendern(params) {
    sprach_dienst_init();

    const inhalt = document.getElementById('inhalt');
    if (!inhalt) return;
    inhalt.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'training';
    inhalt.appendChild(wrapper);

    // Direktstart aus Lernpfad / Dashboard: Kapitel oder Favoriten direkt starten
    if (params?.lektion) {
        _einstellungen.lektion_ids = [parseInt(params.lektion, 10)];
        _einstellungen.favoriten = false;
        await _training_starten(wrapper);
        return;
    }
    if (params?.filter === 'favorit') {
        _einstellungen.lektion_ids = [];
        _einstellungen.favoriten = true;
        await _training_starten(wrapper);
        return;
    }
    if (params?.filter === 'faellig') {
        _einstellungen.lektion_ids = [];
        _einstellungen.favoriten = false;
        _einstellungen.nur_faellige = true;
        await _training_starten(wrapper);
        return;
    }

    if (_ansicht === 'auswahl') {
        await _auswahl_rendern(wrapper);
    } else if (_ansicht === 'training') {
        _training_rendern(wrapper);
    } else if (_ansicht === 'zusammenfassung') {
        _zusammenfassung_rendern(wrapper);
    }
}

/**
 * Aufraeuemen bei Modulwechsel
 */
export function aufraeumen() {
    _ansicht = 'auswahl';
    _sitzung_id = null;
    _fragen = [];
    _aktueller_index = 0;
    _ergebnisse = [];
    _falsche_fragen = [];
    _phase = 'normal';
    _frage_modus = 'eingabe';
    _aktuelles_ergebnis = null;
    _zusammenfassung = null;
    _trotzdem_richtig_anzahl = 0;
    _einstellungen = {
        modus: 'gemischt',
        richtung: 'DS',
        lektion_ids: [],
        favoriten: false,
        anzahl: 20,
        level: null,
        autovorlesen: true,
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
// Interner Auswahl-Zustand
// ============================================

/** @type {Set<string>} Aufgeklappte Gruppen-Keys */
let _aufgeklappte_gruppen = new Set();

const LS_KEY_GRUPPE = 'vt_training_letzte_gruppe';

// ============================================
// Bildschirm 1: Auswahl
// ============================================

async function _auswahl_rendern(wrapper) {
    // Statistik fuer globales Level (vor dem Laden lesen)
    const statistik = holen('statistik');
    const globales_level = statistik?.globales_level || 1;

    wrapper.innerHTML = `
        <div class="lernmodus">
            <div class="verwaltung__kopf">
                <h2 class="verwaltung__titel">${t('training.titel')}</h2>
            </div>
            <p class="lernmodus__beschreibung">
                ${t('training.beschreibung')}
            </p>

            <div class="training__optionen-block">
                <div class="training__option-gruppe" id="training-opt-modus">
                    <div class="training__option-label">${t('training.modus')}</div>
                    <div class="training__chips" data-name="modus">
                        <button type="button" class="training__chip ${_einstellungen.modus === 'gemischt' ? 'training__chip--aktiv' : ''}" data-wert="gemischt">
                            <span class="material-symbols-outlined">shuffle</span> ${t('training.modus_gemischt')}
                        </button>
                        <button type="button" class="training__chip ${_einstellungen.modus === 'vokabel' ? 'training__chip--aktiv' : ''}" data-wert="vokabel">
                            <span class="material-symbols-outlined">translate</span> ${t('training.modus_vokabeln')}
                        </button>
                        <button type="button" class="training__chip ${_einstellungen.modus === 'satz' ? 'training__chip--aktiv' : ''}" data-wert="satz">
                            <span class="material-symbols-outlined">chat_bubble</span> ${t('training.modus_saetze')}
                        </button>
                        <button type="button" class="training__chip ${_einstellungen.modus === 'flexion' ? 'training__chip--aktiv' : ''}" data-wert="flexion">
                            <span class="material-symbols-outlined">schema</span> ${t('training.modus_flexionen')}
                        </button>
                        <button type="button" class="training__chip ${_einstellungen.modus === 'grammatik' ? 'training__chip--aktiv' : ''}" data-wert="grammatik">
                            <span class="material-symbols-outlined">abc</span> ${t('training.modus_grammatik')}
                        </button>
                    </div>
                </div>

                <div class="training__option-gruppe" id="training-opt-richtung">
                    <div class="training__option-label">${t('training.richtung')}</div>
                    <div class="training__chips" data-name="richtung">
                        <button type="button" class="training__chip ${_einstellungen.richtung === 'DS' ? 'training__chip--aktiv' : ''}" data-wert="DS">
                            SV<span class="material-symbols-outlined">arrow_forward</span>DE
                        </button>
                        <button type="button" class="training__chip ${_einstellungen.richtung === 'SD' ? 'training__chip--aktiv' : ''}" data-wert="SD">
                            SV<span class="material-symbols-outlined">arrow_back</span>DE
                        </button>
                        <button type="button" class="training__chip ${_einstellungen.richtung === 'beides' ? 'training__chip--aktiv' : ''}" data-wert="beides">
                            SV<span class="material-symbols-outlined">swap_horiz</span>DE
                        </button>
                    </div>
                </div>

                <div class="training__option-gruppe" id="training-opt-level">
                    <div class="training__option-label">
                        ${t('training.schwierigkeitsgrad')} <strong id="training-level-wert">${_einstellungen.level ? _einstellungen.level + ' · ' + levelLabel(_einstellungen.level) : t('training.level_auto') + ' (' + globales_level + ')'}</strong>
                    </div>
                    <input type="range" class="training__slider" id="training-level-slider"
                        min="0" max="5" step="1" value="${_einstellungen.level || 0}">
                    <div class="training__slider-labels">
                        <span>${t('training.level_auto')}</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
                    </div>
                </div>

                <div class="training__option-gruppe" id="training-opt-anzahl">
                    <div class="training__option-label">
                        ${t('training.anzahl_fragen')} <strong id="training-anzahl-wert">${_einstellungen.anzahl}</strong>
                    </div>
                    <input type="range" class="training__slider" id="training-anzahl-slider"
                        min="5" max="50" step="5" value="${_einstellungen.anzahl}">
                    <div class="training__slider-labels">
                        <span>5</span><span>10</span><span>15</span><span>20</span><span>25</span>
                        <span>30</span><span>35</span><span>40</span><span>45</span><span>50</span>
                    </div>
                </div>

                <div class="training__option-gruppe training__option-gruppe--toggle">
                    <label class="training__toggle-label" id="training-opt-autovorlesen">
                        <span class="training__toggle-wrapper">
                            <input type="checkbox" class="training__toggle-input" id="training-autovorlesen"
                                ${_einstellungen.autovorlesen ? 'checked' : ''}>
                            <span class="training__toggle-track"></span>
                        </span>
                        <span class="training__toggle-text">
                            <span class="material-symbols-outlined training__toggle-icon">volume_up</span>
                            ${t('training.vorlesen')}
                        </span>
                        <span class="training__toggle-hinweis">${t('training.vorlesen_hinweis')}</span>
                    </label>
                </div>

                <div class="training__option-gruppe training__option-gruppe--toggle">
                    <label class="training__toggle-label" id="training-opt-faellige">
                        <span class="training__toggle-wrapper">
                            <input type="checkbox" class="training__toggle-input" id="training-faellige"
                                ${_einstellungen.faellige_einmischen ? 'checked' : ''}>
                            <span class="training__toggle-track"></span>
                        </span>
                        <span class="training__toggle-text">
                            <span class="material-symbols-outlined training__toggle-icon">event_repeat</span>
                            ${t('training.faellige_vokabeln')}
                        </span>
                        <span class="training__toggle-hinweis">${t('training.faellige_hinweis')}</span>
                    </label>
                </div>
            </div>

            <div class="training__kapitel">
                <h3 class="training__kapitel-titel">${t('training.lektionen_auswaehlen')}</h3>
                <div id="training-auswahl" class="lernmodus__auswahl">
                </div>
            </div>

            <div class="lernmodus__aktionen">
                <button class="btn btn--gefuellt" id="btn-training-starten" disabled>
                    <span class="material-symbols-outlined" style="font-size:20px">fitness_center</span>
                    ${t('training.starten')}
                </button>
            </div>
        </div>
    `;

    // Lade-Anzeige im Auswahl-Container
    lade_anzeige_rendern(wrapper.querySelector('#training-auswahl'));

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
        console.error('Training Daten laden fehlgeschlagen:', e);
    }

    // Lektionen-Auswahl rendern
    _lektionen_auswahl_rendern(wrapper.querySelector('#training-auswahl'));

    // --- Chip-Events ---
    wrapper.querySelectorAll('.training__chips').forEach(gruppe => {
        gruppe.querySelectorAll('.training__chip').forEach(chip => {
            chip.addEventListener('click', () => {
                gruppe.querySelectorAll('.training__chip').forEach(c => c.classList.remove('training__chip--aktiv'));
                chip.classList.add('training__chip--aktiv');
            });
        });
    });

    // --- Slider-Events ---
    const slider = wrapper.querySelector('#training-anzahl-slider');
    const anzahl_wert = wrapper.querySelector('#training-anzahl-wert');
    if (slider) {
        slider.addEventListener('input', () => {
            anzahl_wert.textContent = slider.value;
        });
    }

    const level_slider = wrapper.querySelector('#training-level-slider');
    const level_wert = wrapper.querySelector('#training-level-wert');
    if (level_slider) {
        level_slider.addEventListener('input', () => {
            const v = parseInt(level_slider.value);
            level_wert.textContent = v === 0
                ? `${t('training.level_auto')} (${globales_level})`
                : `${v} · ${levelLabel(v)}`;
        });
    }

    // --- Starten-Button ---
    wrapper.querySelector('#btn-training-starten')?.addEventListener('click', () => {
        _einstellungen_lesen(wrapper);
        _training_starten(wrapper);
    });
}

/**
 * Lektionen-Auswahl mit aufklappbaren Kategoriegruppen rendern
 * (analog Lernmodus, plus Kategorie-Checkbox)
 */
function _lektionen_auswahl_rendern(container) {
    if (!container) return;
    container.innerHTML = '';

    if (_lektionen.length === 0 && _favoriten_anzahl === 0) {
        leer_zustand_rendern(container, 'menu_book', t('training.keine_lektionen'),
            t('training.keine_lektionen_text'), t('training.zu_lektionen'), () => navigieren('/lektionen'));
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
                    <input type="checkbox" class="lernmodus__checkbox" id="training-favoriten"${fav_checked}>
                    <span class="material-symbols-outlined" style="color: var(--md-sys-color-secondary)">star</span>
                    <strong>${t('training.meine_favoriten')}</strong>
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
                        <span class="lernmodus__gruppe-titel">${t('training.meine_lektionen')}</span>
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

        // Alle Lektion-IDs dieser Kategorie (direkt + Kinder)
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
                        <span class="lernmodus__gruppe-titel">${t('training.ohne_kategorie')}</span>
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
                const lek_cb = gruppe_div?.querySelector(`.training__lektion-checkbox[data-lektion-id="${id}"]`);
                if (lek_cb && !lek_cb.disabled) lek_cb.checked = cb.checked;
            });
            _starten_button_aktualisieren(container.closest('.lernmodus') || document);
        });
    });

    // Lektion-Checkboxen
    container.querySelectorAll('.training__lektion-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
            // Kategorie-Checkbox-Status aktualisieren
            const gruppe_div = cb.closest('.lernmodus__gruppe');
            if (gruppe_div) {
                const kat_cb = gruppe_div.querySelector('.training__kat-checkbox');
                const alle_lek = gruppe_div.querySelectorAll('.training__lektion-checkbox');
                if (kat_cb && alle_lek.length > 0) {
                    kat_cb.checked = Array.from(alle_lek).every(c => c.checked);
                    kat_cb.indeterminate = !kat_cb.checked && Array.from(alle_lek).some(c => c.checked);
                }
            }
            _starten_button_aktualisieren(container.closest('.lernmodus') || document);
        });
    });

    // Favoriten
    container.querySelector('#training-favoriten')?.addEventListener('change', () => {
        _starten_button_aktualisieren(container.closest('.lernmodus') || document);
    });

    _starten_button_aktualisieren(container.closest('.lernmodus') || document);
}

function _lektion_checkbox_html(lektion) {
    const anzahl = lektion.vokabel_anzahl ?? lektion.vokabel_count ?? 0;

    // Lernpfad: Nur Lektionen sperren, die IN der Lernpfad-Map sind, dort als gesperrt gelten
    // und NICHT als Aufgabe zugewiesen sind. Aufgaben sind immer zugänglich.
    const lp = _lernpfad_map?.get(lektion.id);
    const gesperrt = !lektion.ist_privat && lp !== undefined && !lp.freigeschaltet && !_aufgaben_ids.has(lektion.id);

    const gewaehlt = !gesperrt && _einstellungen.lektion_ids.includes(lektion.id) ? ' checked' : '';
    const schlossHtml = gesperrt
        ? `<span class="material-symbols-outlined lernmodus__schloss-icon">lock</span>`
        : '';

    return `
        <label class="lernmodus__checkbox-label${gesperrt ? ' lernmodus__checkbox-label--gesperrt' : ''}"
               ${gesperrt ? `title="${t('training.lektion_gesperrt')}"` : ''}>
            <input type="checkbox" class="lernmodus__checkbox training__lektion-checkbox"
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
    const btn = kontext.querySelector('#btn-training-starten');
    if (!btn) return;
    const fav_cb = kontext.querySelector('#training-favoriten');
    const fav_gewaehlt = fav_cb?.checked || false;
    const lek_gewaehlt = Array.from(kontext.querySelectorAll('.training__lektion-checkbox')).some(cb => cb.checked);
    btn.disabled = !fav_gewaehlt && !lek_gewaehlt;
}

/**
 * Einstellungen aus DOM lesen
 */
function _einstellungen_lesen(wrapper) {
    // Chips
    wrapper.querySelectorAll('.training__chips').forEach(gruppe => {
        const aktiv = gruppe.querySelector('.training__chip--aktiv');
        if (!aktiv) return;
        const name = gruppe.dataset.name;
        const wert = aktiv.dataset.wert;
        if (name === 'modus') _einstellungen.modus = wert;
        if (name === 'richtung') _einstellungen.richtung = wert;
    });

    // Slider
    const slider = wrapper.querySelector('#training-anzahl-slider');
    if (slider) _einstellungen.anzahl = parseInt(slider.value) || 20;

    const level_slider = wrapper.querySelector('#training-level-slider');
    if (level_slider) {
        const v = parseInt(level_slider.value);
        _einstellungen.level = v === 0 ? null : v;
    }

    // Lektion-IDs (disabled = vom Lernpfad gesperrt, nie einschliessen)
    _einstellungen.lektion_ids = [];
    wrapper.querySelectorAll('.training__lektion-checkbox').forEach(cb => {
        if (cb.checked && !cb.disabled) {
            _einstellungen.lektion_ids.push(parseInt(cb.dataset.lektionId));
        }
    });

    // Favoriten
    const fav_cb = wrapper.querySelector('#training-favoriten');
    _einstellungen.favoriten = fav_cb?.checked || false;

    // Autovorlesen
    const av_cb = wrapper.querySelector('#training-autovorlesen');
    _einstellungen.autovorlesen = av_cb?.checked || false;

    // Fällige Vokabeln einmischen
    const fael_cb = wrapper.querySelector('#training-faellige');
    _einstellungen.faellige_einmischen = fael_cb?.checked ?? true;
}

// ============================================
// Training starten
// ============================================

async function _training_starten(wrapper) {
    // Interferenz-Check (einmal pro Tag)
    const interferenz = await interferenz_pruefen();

    lade_anzeige_rendern(wrapper);

    const startPayload = {
        modus: _einstellungen.modus,
        richtung: _einstellungen.richtung,
        lektion_ids: _einstellungen.lektion_ids,
        favoriten: _einstellungen.favoriten,
        nur_faellige: _einstellungen.nur_faellige,
        anzahl: _einstellungen.anzahl,
        level: _einstellungen.level,
        faellige_einmischen: _einstellungen.faellige_einmischen,
    };

    // Override vom Interferenz-Dialog anwenden
    if (interferenz.override !== null) {
        startPayload.neue_vokabeln_faktor_override = interferenz.override;
    }

    const ergebnis = await apiPost('training/starten.php', startPayload);

    lade_anzeige_entfernen(wrapper);

    if (!ergebnis.erfolg) {
        apiFehlerAnzeigen(ergebnis);
        return;
    }

    _sitzung_id = ergebnis.daten.sitzung_id;
    _fragen = ergebnis.daten.fragen;
    _aktueller_index = 0;
    _ergebnisse = [];
    _falsche_fragen = [];
    _phase = 'normal';
    _frage_modus = 'eingabe';
    _aktuelles_ergebnis = null;

    if (_fragen.length === 0) {
        fehlerToast(t('training.keine_fragen'));
        return;
    }

    _ansicht = 'training';
    rendern();
}

// ============================================
// Bildschirm 2: Frage-Schleife
// ============================================

function _training_rendern(wrapper) {
    wrapper.innerHTML = '';

    // Progress Bar
    const gesamt_fragen = _fragen.length;
    const fortschritt_wert = gesamt_fragen > 0 ? _aktueller_index / gesamt_fragen : 0;

    const progress = document.createElement('md-linear-progress');
    progress.className = 'training__fortschritt';
    progress.value = fortschritt_wert;
    wrapper.appendChild(progress);

    // Phase-Hinweis
    if (_phase === 'wiederholung') {
        const hinweis = document.createElement('div');
        hinweis.className = 'training__wiederholung-hinweis';
        hinweis.innerHTML = `
            <span class="material-symbols-outlined">replay</span>
            <span>${t('training.wiederholung_titel')}</span>
        `;
        wrapper.appendChild(hinweis);
    }

    // Aktuelle Frage
    if (_aktueller_index >= _fragen.length) {
        // Alle Fragen beantwortet
        _fragen_abgeschlossen(wrapper);
        return;
    }

    const frage = _fragen[_aktueller_index];

    // Grammatik-Fragen (Button-Auswahl) gesondert rendern
    const GRAMMATIK_BUTTON_TYPEN = ['gruppen_quiz', 'partikel_puzzle', 'starkes_verb'];
    if (GRAMMATIK_BUTTON_TYPEN.includes(frage.typ)) {
        _grammatik_frage_rendern(frage, wrapper);
        return;
    }

    const frage_element = frage_anzeige_erstellen(frage, {
        modus: _frage_modus,
        ergebnis: _aktuelles_ergebnis,
        gesamt: _fragen.length,
        autovorlesen: _einstellungen.autovorlesen,
        auto_tts_frage: false, // Nur nach Antwortprüfung vorlesen, nicht bei Fragenanzeige
        trotzdem_gesperrt: _trotzdem_richtig_anzahl >= _trotzdem_limit(),
        onAntwort: (eingabe) => _antwort_senden(eingabe, frage, wrapper),
        onTrotzdemRichtig: () => _trotzdem_richtig(frage, wrapper),
        onNachtippen: (eingabe) => { /* Validation in component */ },
        onWeiter: () => _naechste_frage(wrapper),
        onBeenden: () => _fragen_abgeschlossen(wrapper),
    });

    wrapper.appendChild(frage_element);
}

/**
 * Antwort an Server senden
 */
async function _antwort_senden(eingabe, frage, wrapper) {
    const ergebnis = await apiPost('training/antwort.php', {
        sitzung_id: _sitzung_id,
        vokabel_id: frage.vokabel_id,
        richtung: frage.richtung,
        eingabe: eingabe,
        erwartet: frage.erwartet,
        synonyme: frage.synonyme || [],
        typ: frage.typ,
        trotzdem_richtig: false,
    });

    if (!ergebnis.erfolg) {
        apiFehlerAnzeigen(ergebnis);
        return;
    }

    _aktuelles_ergebnis = ergebnis.daten;
    _ergebnisse.push(ergebnis.daten);

    // Ergebnis-Modus zeigen
    _frage_modus = 'ergebnis';
    _training_rendern(wrapper);
}

// ============================================
// Grammatik-Fragen (Button-Auswahl)
// ============================================

/**
 * Rendert eine Grammatikfrage mit Buttons (gruppen_quiz, partikel_puzzle, starkes_verb).
 * Auswertung client-seitig, danach Weiter-Button.
 */
function _grammatik_frage_rendern(frage, wrapper) {
    const el = document.createElement('div');
    el.className = 'grammatik-aufgabe';

    // Typ-Badge + Wortinfo
    let badge_text = '';
    let frage_titel = '';
    if (frage.typ === 'gruppen_quiz') {
        badge_text = t('training.grammatik_verbgruppe');
        frage_titel = t('training.grammatik_frage_verbgruppe');
    } else if (frage.typ === 'partikel_puzzle') {
        badge_text = t('training.grammatik_partikelverb');
        frage_titel = t('training.grammatik_frage_partikel');
    } else if (frage.typ === 'starkes_verb') {
        badge_text = t('training.grammatik_starkes_verb');
        frage_titel = t('training.grammatik_frage_vokalklasse');
    }

    el.innerHTML = `
        <div class="frage-anzeige__fortschritt">${t('frage.fortschritt', {nr: _aktueller_index + 1, gesamt: _fragen.length})}</div>
        <div class="grammatik-aufgabe__header">
            <span class="grammatik-aufgabe__badge">${badge_text}</span>
            ${frage.vokabel_niveau ? `<span class="grammatik-aufgabe__niveau">${frage.vokabel_niveau || ''}</span>` : ''}
        </div>
        <div class="grammatik-aufgabe__verb">${frage.infinitiv || frage.hauptverb || ''}</div>
        ${frage.deutsch ? `<div class="grammatik-aufgabe__deutsch">${frage.deutsch}</div>` : ''}
        ${frage.typ === 'partikel_puzzle' && frage.bedeutung_mit
            ? `<div class="grammatik-aufgabe__kontext">${frage.hauptverb} ___ = ${frage.bedeutung_mit}</div>`
            : ''}
        <div class="grammatik-aufgabe__frage">${frage_titel}</div>
        <div class="grammatik-aufgabe__buttons" id="grammatik-buttons"></div>
        <div class="grammatik-aufgabe__feedback" id="grammatik-feedback" style="display:none"></div>
        ${frage.grammatik_regel_id ? `<button type="button" class="grammatik-aufgabe__regel-link" id="grammatik-regel-btn">
            <span class="material-symbols-outlined">info</span> ${t('training.grammatikregel')}
        </button>` : ''}
        <button type="button" class="grammatik-aufgabe__weiter" id="grammatik-weiter" style="display:none">
            ${t('allgemein.weiter')} <span class="material-symbols-outlined">arrow_forward</span>
        </button>
    `;

    // Optionen-Buttons
    const buttons_container = el.querySelector('#grammatik-buttons');
    (frage.optionen || []).forEach(option => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'grammatik-btn';
        btn.textContent = option;
        btn.addEventListener('click', () => _grammatik_option_gewaehlt(option, frage, el, wrapper));
        buttons_container.appendChild(btn);
    });

    // Grammatikregel-Link
    const regel_btn = el.querySelector('#grammatik-regel-btn');
    if (regel_btn) {
        regel_btn.addEventListener('click', () => {
            // Existierendes Grammatik-Popup nutzen (analog zu frage-anzeige.js)
            document.dispatchEvent(new CustomEvent('grammatik_regel_popup', {
                detail: { regel_id: frage.grammatik_regel_id }
            }));
        });
    }

    wrapper.appendChild(el);
}

/**
 * Verarbeitet eine Grammatik-Button-Auswahl.
 */
async function _grammatik_option_gewaehlt(gewaehlte_option, frage, el, wrapper) {
    const richtig = gewaehlte_option === frage.erwartet;

    // Alle Buttons deaktivieren + färben
    el.querySelectorAll('.grammatik-btn').forEach(btn => {
        btn.disabled = true;
        if (btn.textContent === frage.erwartet) {
            btn.classList.add('grammatik-btn--richtig');
        } else if (btn.textContent === gewaehlte_option && !richtig) {
            btn.classList.add('grammatik-btn--falsch');
        }
    });

    // Bei starkes_verb: Formen einblenden
    if (frage.typ === 'starkes_verb' && frage.formen_loesung) {
        const feedback = el.querySelector('#grammatik-feedback');
        const formen = frage.formen_loesung;
        feedback.innerHTML = `
            <div class="grammatik-formen-tabelle">
                ${formen.infinitiv ? `<div class="grammatik-form"><span>${t('training.form_infinitiv')}</span><strong>${formen.infinitiv}</strong></div>` : ''}
                ${formen.praesens ? `<div class="grammatik-form"><span>${t('training.form_praesens')}</span><strong>${formen.praesens}</strong></div>` : ''}
                ${formen.praeteritum ? `<div class="grammatik-form"><span>${t('training.form_praeteritum')}</span><strong>${formen.praeteritum}</strong></div>` : ''}
                ${formen.supinum ? `<div class="grammatik-form"><span>${t('training.form_supinum')}</span><strong>${formen.supinum}</strong></div>` : ''}
            </div>
        `;
        feedback.style.display = 'block';
    } else if (!richtig) {
        // Bei Fehler: korrekte Antwort anzeigen
        const feedback = el.querySelector('#grammatik-feedback');
        feedback.innerHTML = `<span class="grammatik-feedback--falsch">✗ ${t('training.korrekt')} <strong>${frage.erwartet}</strong></span>`;
        feedback.style.display = 'block';
    }

    // Antwort an Server senden
    await _grammatik_antwort_senden(richtig, frage);

    // Weiter-Button anzeigen
    const weiter_btn = el.querySelector('#grammatik-weiter');
    weiter_btn.style.display = 'flex';
    weiter_btn.addEventListener('click', () => _naechste_frage(wrapper));
}

/**
 * Grammatik-Antwort an den Server senden.
 */
async function _grammatik_antwort_senden(richtig, frage) {
    const ergebnis = await apiPost('training/antwort.php', {
        sitzung_id: _sitzung_id,
        vokabel_id: frage.vokabel_id,
        typ: frage.typ,
        richtig: richtig,
    });

    if (ergebnis.erfolg) {
        _ergebnisse.push({ ...ergebnis.daten, richtig });
    }
}

/**
 * Erlaubte Anzahl "Trotzdem richtig"-Nutzungen fuer diese Sitzung berechnen.
 * Basis: konfigurierbarer Prozentsatz (Standard: 30%) der Gesamtfragen, mind. 1.
 */
function _trotzdem_limit() {
    const prozent = holen('konfiguration')?.trotzdem_richtig_limit ?? 30;
    return Math.max(1, Math.floor(_fragen.length * prozent / 100));
}

/**
 * "Trotzdem richtig" senden
 */
async function _trotzdem_richtig(frage, wrapper) {
    const ergebnis = await apiPost('training/antwort.php', {
        sitzung_id: _sitzung_id,
        vokabel_id: frage.vokabel_id,
        richtung: frage.richtung,
        eingabe: _aktuelles_ergebnis?.eingabe_bereinigt || '',
        erwartet: frage.erwartet,
        synonyme: frage.synonyme || [],
        typ: frage.typ,
        trotzdem_richtig: true,
    });

    if (!ergebnis.erfolg) {
        apiFehlerAnzeigen(ergebnis);
        return;
    }

    // Letztes Ergebnis ersetzen
    _ergebnisse[_ergebnisse.length - 1] = ergebnis.daten;
    _aktuelles_ergebnis = ergebnis.daten;

    _trotzdem_richtig_anzahl++;

    const limit = _trotzdem_limit();
    if (_trotzdem_richtig_anzahl === limit - 1) {
        // Vorletztes Mal: Warnung anzeigen
        benachrichtigen(t('training.trotzdem_warnung'), 'warnung');
    } else {
        erfolg(t('training.als_richtig'));
    }

    _frage_modus = 'ergebnis';
    _training_rendern(wrapper);
}

/**
 * Naechste Frage oder Nachtippen
 */
function _naechste_frage(wrapper) {
    const erg = _aktuelles_ergebnis;

    // Bei falscher Antwort: Nachtippen-Modus?
    if (erg && erg.nachtippen_noetig && _frage_modus === 'ergebnis') {
        _frage_modus = 'nachtippen';
        _training_rendern(wrapper);
        return;
    }

    // Falsche Frage behandeln
    if (erg && !erg.richtig) {
        const frage = _fragen[_aktueller_index];

        if (erg.sofort_wiederholen && !frage._ist_wiederholung && _phase === 'normal') {
            // Erste Niederlage in der Normalphase:
            // Vokabel 4 Positionen später im laufenden Queue einreihen (Spaced Retry).
            // Der Abstand von 4 Fragen sorgt für minimale Ablenkung, damit Spacing-Effekt greift.
            const ziel = Math.min(_aktueller_index + 4, _fragen.length);
            _fragen.splice(ziel, 0, { ...frage, _ist_wiederholung: true });
        } else {
            // Zweite Niederlage (Retry gescheitert) oder Wiederholungsphase:
            // → In End-Session-Queue übernehmen
            _falsche_fragen.push(frage);
        }
    }

    // Naechste Frage
    _aktueller_index++;
    _frage_modus = 'eingabe';
    _aktuelles_ergebnis = null;

    _training_rendern(wrapper);
}

/**
 * Alle Fragen beantwortet
 */
async function _fragen_abgeschlossen(wrapper) {
    // Wiederholungs-Phase?
    if (_phase === 'normal' && _falsche_fragen.length > 0) {
        _phase = 'wiederholung';
        _fragen = [..._falsche_fragen];
        _falsche_fragen = [];
        _aktueller_index = 0;
        _frage_modus = 'eingabe';
        _aktuelles_ergebnis = null;

        // Indizes aktualisieren
        _fragen.forEach((f, i) => f.index = i);

        benachrichtigen(t('training.wiederholung_nachricht'), 'info', 3000);
        _training_rendern(wrapper);
        return;
    }

    // Training beenden
    lade_anzeige_rendern(wrapper);

    const ergebnis = await apiPost('training/beenden.php', {
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
        leer_zustand_rendern(wrapper, 'error', t('fehler.titel'), t('training.keine_zusammenfassung'));
        return;
    }

    const anzeige = ergebnis_anzeige_erstellen(_zusammenfassung, {
        onNochmal: () => {
            _ansicht = 'auswahl';
            _aktueller_index = 0;
            _fragen = [];
            _ergebnisse = [];
            _falsche_fragen = [];
            _phase = 'normal';
            _frage_modus = 'eingabe';
            _aktuelles_ergebnis = null;
            _zusammenfassung = null;
            // Direkt nochmal starten mit gleichen Einstellungen
            const inhalt = document.getElementById('inhalt');
            if (inhalt) {
                inhalt.innerHTML = '';
                const w = document.createElement('div');
                w.className = 'training';
                inhalt.appendChild(w);
                _training_starten(w);
            }
        },
        onNochmalGemischt: () => {
            _einstellungen.modus = 'gemischt';
            _ansicht = 'auswahl';
            _aktueller_index = 0;
            _fragen = [];
            _ergebnisse = [];
            _falsche_fragen = [];
            _phase = 'normal';
            _frage_modus = 'eingabe';
            _aktuelles_ergebnis = null;
            _zusammenfassung = null;
            const inhalt = document.getElementById('inhalt');
            if (inhalt) {
                inhalt.innerHTML = '';
                const w = document.createElement('div');
                w.className = 'training';
                inhalt.appendChild(w);
                _training_starten(w);
            }
        },
        onZurueck: () => {
            _ansicht = 'auswahl';
            _sitzung_id = null;
            _fragen = [];
            _aktueller_index = 0;
            _ergebnisse = [];
            _falsche_fragen = [];
            _phase = 'normal';
            _frage_modus = 'eingabe';
            _aktuelles_ergebnis = null;
            _zusammenfassung = null;
            rendern();
        },
        onDashboard: () => {
            navigieren('/dashboard');
        },
    });

    wrapper.appendChild(anzeige);
}
