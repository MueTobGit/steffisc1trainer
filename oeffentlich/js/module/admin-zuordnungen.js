/**
 * Admin — Themenfeld-Zuordnungs-Matrix
 *
 * Ermöglicht es, Vokabeln mehreren Themenfeldern gleichzeitig zuzuordnen.
 * Checkbox-Matrix: Zeilen = Vokabeln, Spalten = Themenfelder.
 */

import { apiGet, apiPost } from '../api-client.js';
import { esc } from '../hilfs-funktionen.js';
import { t } from '../dienste/sprache.js';
import { erfolg, fehler, apiFehlerAnzeigen } from '../benachrichtigungen.js';
import { lade_anzeige_rendern } from '../komponenten/lade-anzeige.js';

const API = 'admin/zuordnungen_matrix.php';

// State
let _themenfelder    = [];       // alle Themenfelder
let _vokabeln        = [];       // aktuelle Seite
let _gesamt          = 0;
let _seite           = 1;
let _seiten          = 1;
let _pro_seite       = 50;
let _suche           = '';
let _nur_ohne        = false;
let _tf_filter       = new Set(); // welche TF-Spalten angezeigt werden
let _aenderungen     = new Map(); // key='vid_tid' → boolean (zugeordnet)
let _speichern_laeuft = false;

export async function rendern(params = {}) {
    const container = document.getElementById('inhalt');
    if (!container) return;

    _aenderungen.clear();
    _seite = 1;
    _suche = '';
    _nur_ohne = false;

    lade_anzeige_rendern(container);

    const erg = await apiGet(API, { seite: 1, pro_seite: _pro_seite });
    if (!erg.erfolg) {
        apiFehlerAnzeigen(erg);
        return;
    }

    _themenfelder = erg.daten.themenfelder || [];
    _vokabeln     = erg.daten.vokabeln     || [];
    _gesamt       = erg.daten.gesamt       || 0;
    _seiten       = erg.daten.seiten       || 1;
    _seite        = erg.daten.seite        || 1;

    // Initial: alle Themenfelder anzeigen (bis max 10)
    _tf_filter = new Set(_themenfelder.slice(0, 10).map(tf => tf.id));

    _seite_rendern(container);
}

function _seite_rendern(container) {
    const hatAenderungen = _aenderungen.size > 0;

    container.innerHTML = `
        <div class="verwaltung">
            <div class="verwaltung__kopf">
                <h1 class="verwaltung__titel">
                    <span class="material-symbols-outlined" style="vertical-align:middle;margin-right:6px">table_chart</span>
                    ${t('admin_zuordnungen.titel')}
                </h1>
                <button class="btn btn--gefuellt" id="btn-speichern" ${hatAenderungen ? '' : 'disabled'}>
                    <span class="material-symbols-outlined" style="font-size:18px">save</span>
                    ${t('admin_zuordnungen.speichern')}
                    ${hatAenderungen ? `<span class="zuordnung-matrix__badge">${_aenderungen.size}</span>` : ''}
                </button>
            </div>

            <!-- Filter-Leiste -->
            <div class="filter-leiste" id="filter-leiste" style="flex-wrap:wrap;gap:10px;align-items:flex-start">
                <div style="display:flex;gap:8px;align-items:center;flex:1;min-width:200px">
                    <input class="eingabe eingabe--klein" type="search" id="suche-input"
                        placeholder="${t('admin_zuordnungen.suche_placeholder')}"
                        value="${esc(_suche)}" style="flex:1">
                    <label style="display:flex;align-items:center;gap:6px;white-space:nowrap;font-size:0.85em">
                        <input type="checkbox" id="chk-nur-ohne" ${_nur_ohne ? 'checked' : ''}>
                        ${t('admin_zuordnungen.nur_ohne')}
                    </label>
                </div>
                <div class="zuordnung-matrix__tf-filter" id="tf-filter-chips">
                    ${_tf_filter_html()}
                </div>
            </div>

            <!-- Matrix-Tabelle -->
            <div class="zuordnung-matrix-wrapper" id="matrix-wrapper">
                ${_matrix_html()}
            </div>

            <!-- Paginierung -->
            ${_paginierung_html()}
        </div>
    `;

    _events_binden(container);
}

function _tf_filter_html() {
    if (_themenfelder.length === 0) return '';
    return _themenfelder.map(tf => {
        const aktiv = _tf_filter.has(tf.id);
        return `<button type="button"
            class="zuordnung-matrix__tf-btn ${aktiv ? 'zuordnung-matrix__tf-btn--aktiv' : ''}"
            data-tf-toggle="${tf.id}">
            ${esc(tf.titel)}
        </button>`;
    }).join('');
}

function _matrix_html() {
    const sichtbare = _themenfelder.filter(tf => _tf_filter.has(tf.id));

    if (sichtbare.length === 0) {
        return `<p class="leer-zustand__beschreibung" style="padding:16px">${t('admin_zuordnungen.keine_spalten')}</p>`;
    }
    if (_vokabeln.length === 0) {
        return `<p class="leer-zustand__beschreibung" style="padding:16px">${t('admin_zuordnungen.keine_vokabeln')}</p>`;
    }

    // Kopfzeile
    let kopf = `<tr>
        <th class="zuordnung-matrix__vok-kopf">${t('admin_zuordnungen.vokabel')}</th>`;
    for (const tf of sichtbare) {
        kopf += `<th class="zuordnung-matrix__tf-kopf" title="${esc(tf.titel)}">
            <span>${esc(tf.titel)}</span>
        </th>`;
    }
    kopf += '</tr>';

    // Daten-Zeilen
    let zeilen = '';
    for (const vok of _vokabeln) {
        zeilen += `<tr>
            <td class="zuordnung-matrix__vok-zelle">
                <span class="zuordnung-matrix__englisch">${esc(vok.englisch)}</span>
                <span class="zuordnung-matrix__deutsch">${esc(vok.deutsch)}</span>
            </td>`;

        for (const tf of sichtbare) {
            const key = `${vok.id}_${tf.id}`;
            // Aktueller Stand: Änderung falls vorhanden, sonst DB-Wert
            let checked;
            if (_aenderungen.has(key)) {
                checked = _aenderungen.get(key);
            } else {
                checked = vok.themenfeld_ids.includes(tf.id);
            }
            const geaendert = _aenderungen.has(key);
            zeilen += `<td class="zuordnung-matrix__tf-zelle ${geaendert ? 'zuordnung-matrix__tf-zelle--geaendert' : ''}">
                <input type="checkbox" class="zuordnung-matrix__chk"
                    data-vid="${vok.id}" data-tid="${tf.id}"
                    ${checked ? 'checked' : ''}>
            </td>`;
        }
        zeilen += '</tr>';
    }

    return `<table class="zuordnung-matrix">
        <thead>${kopf}</thead>
        <tbody>${zeilen}</tbody>
    </table>`;
}

function _paginierung_html() {
    if (_seiten <= 1) return '';
    const von = (_seite - 1) * _pro_seite + 1;
    const bis = Math.min(_seite * _pro_seite, _gesamt);

    let seiten_html = '';
    // Kompakte Paginierung: immer max 7 Buttons
    const bereich = _paginierung_bereich(_seite, _seiten);
    for (const s of bereich) {
        if (s === '...') {
            seiten_html += `<span class="paginierung__trenner">…</span>`;
        } else {
            seiten_html += `<button class="btn btn--text paginierung__btn ${s === _seite ? 'paginierung__btn--aktiv' : ''}"
                data-seite="${s}">${s}</button>`;
        }
    }

    return `<div class="paginierung" style="margin-top:16px">
        <span class="paginierung__info">${von}–${bis} ${t('admin_zuordnungen.von')} ${_gesamt}</span>
        <div class="paginierung__seiten">
            <button class="btn btn--text paginierung__btn" data-seite="${_seite - 1}" ${_seite <= 1 ? 'disabled' : ''}>‹</button>
            ${seiten_html}
            <button class="btn btn--text paginierung__btn" data-seite="${_seite + 1}" ${_seite >= _seiten ? 'disabled' : ''}>›</button>
        </div>
    </div>`;
}

function _paginierung_bereich(aktuelle, gesamt) {
    if (gesamt <= 7) return Array.from({ length: gesamt }, (_, i) => i + 1);
    const seiten = [];
    seiten.push(1);
    if (aktuelle > 3) seiten.push('...');
    for (let s = Math.max(2, aktuelle - 1); s <= Math.min(gesamt - 1, aktuelle + 1); s++) {
        seiten.push(s);
    }
    if (aktuelle < gesamt - 2) seiten.push('...');
    seiten.push(gesamt);
    return seiten;
}

function _events_binden(container) {
    // Suche
    const suchInput = container.querySelector('#suche-input');
    let suchTimer;
    suchInput?.addEventListener('input', () => {
        clearTimeout(suchTimer);
        suchTimer = setTimeout(() => {
            _suche = suchInput.value.trim();
            _seite = 1;
            _laden_und_aktualisieren(container);
        }, 350);
    });

    // "Nur ohne Themenfeld"-Checkbox
    container.querySelector('#chk-nur-ohne')?.addEventListener('change', e => {
        _nur_ohne = e.target.checked;
        _seite = 1;
        _laden_und_aktualisieren(container);
    });

    // Themenfeld-Filter Buttons
    container.querySelectorAll('[data-tf-toggle]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tid = parseInt(btn.dataset.tfToggle, 10);
            if (_tf_filter.has(tid)) {
                _tf_filter.delete(tid);
            } else {
                _tf_filter.add(tid);
            }
            // Matrix-Wrapper neu rendern (kein API-Call nötig)
            const wrapper = container.querySelector('#matrix-wrapper');
            if (wrapper) wrapper.innerHTML = _matrix_html();
            _checkboxen_binden(container);
            // Filter-Chips aktualisieren
            const filterChips = container.querySelector('#tf-filter-chips');
            if (filterChips) filterChips.innerHTML = _tf_filter_html();
            _events_binden_filter(container);
        });
    });

    // Checkboxen
    _checkboxen_binden(container);

    // Paginierung
    container.querySelectorAll('[data-seite]').forEach(btn => {
        btn.addEventListener('click', () => {
            const s = parseInt(btn.dataset.seite, 10);
            if (s < 1 || s > _seiten || s === _seite) return;
            _seite = s;
            _laden_und_aktualisieren(container);
        });
    });

    // Speichern
    container.querySelector('#btn-speichern')?.addEventListener('click', () => _speichern(container));
}

function _events_binden_filter(container) {
    container.querySelectorAll('[data-tf-toggle]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tid = parseInt(btn.dataset.tfToggle, 10);
            if (_tf_filter.has(tid)) {
                _tf_filter.delete(tid);
            } else {
                _tf_filter.add(tid);
            }
            const wrapper = container.querySelector('#matrix-wrapper');
            if (wrapper) wrapper.innerHTML = _matrix_html();
            _checkboxen_binden(container);
            const filterChips = container.querySelector('#tf-filter-chips');
            if (filterChips) filterChips.innerHTML = _tf_filter_html();
            _events_binden_filter(container);
        });
    });
}

function _checkboxen_binden(container) {
    container.querySelectorAll('.zuordnung-matrix__chk').forEach(chk => {
        chk.addEventListener('change', () => {
            const vid = parseInt(chk.dataset.vid, 10);
            const tid = parseInt(chk.dataset.tid, 10);
            const key = `${vid}_${tid}`;

            // Ursprungswert aus _vokabeln
            const vok = _vokabeln.find(v => v.id === vid);
            const original = vok ? vok.themenfeld_ids.includes(tid) : false;

            if (chk.checked === original) {
                // Zurück zum Originalzustand → Änderung entfernen
                _aenderungen.delete(key);
            } else {
                _aenderungen.set(key, chk.checked);
            }

            // Zelle färben
            chk.closest('td')?.classList.toggle('zuordnung-matrix__tf-zelle--geaendert', _aenderungen.has(key));

            // Speichern-Button aktualisieren
            const btn = container.querySelector('#btn-speichern');
            if (btn) {
                btn.disabled = _aenderungen.size === 0;
                btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px">save</span>
                    ${t('admin_zuordnungen.speichern')}
                    ${_aenderungen.size > 0 ? `<span class="zuordnung-matrix__badge">${_aenderungen.size}</span>` : ''}`;
                btn.onclick = () => _speichern(container);
            }
        });
    });
}

async function _laden_und_aktualisieren(container) {
    const wrapper = container.querySelector('#matrix-wrapper');
    if (wrapper) wrapper.innerHTML = '<div class="lade-anzeige"><div class="lade-anzeige__spinner"></div></div>';

    const params = {
        seite:     _seite,
        pro_seite: _pro_seite,
        suche:     _suche,
        nur_ohne:  _nur_ohne ? 1 : 0,
    };

    const erg = await apiGet(API, params);
    if (!erg.erfolg) {
        apiFehlerAnzeigen(erg);
        return;
    }

    _vokabeln = erg.daten.vokabeln || [];
    _gesamt   = erg.daten.gesamt   || 0;
    _seiten   = erg.daten.seiten   || 1;
    _seite    = erg.daten.seite    || 1;

    if (wrapper) wrapper.innerHTML = _matrix_html();
    _checkboxen_binden(container);

    // Paginierung aktualisieren
    const pag = container.querySelector('.paginierung');
    const neuerPag = document.createElement('div');
    neuerPag.innerHTML = _paginierung_html();
    if (pag) {
        pag.replaceWith(neuerPag.firstElementChild || document.createTextNode(''));
    } else {
        const verwaltung = container.querySelector('.verwaltung');
        if (verwaltung && neuerPag.firstElementChild) verwaltung.appendChild(neuerPag.firstElementChild);
    }
    container.querySelectorAll('[data-seite]').forEach(btn => {
        btn.addEventListener('click', () => {
            const s = parseInt(btn.dataset.seite, 10);
            if (s < 1 || s > _seiten || s === _seite) return;
            _seite = s;
            _laden_und_aktualisieren(container);
        });
    });
}

async function _speichern(container) {
    if (_speichern_laeuft || _aenderungen.size === 0) return;
    _speichern_laeuft = true;

    const btn = container.querySelector('#btn-speichern');
    if (btn) { btn.disabled = true; btn.textContent = t('admin_zuordnungen.speichern_laeuft'); }

    const aenderungen_arr = [];
    for (const [key, zugeordnet] of _aenderungen) {
        const [vid, tid] = key.split('_').map(Number);
        aenderungen_arr.push({ vokabel_id: vid, themenfeld_id: tid, zugeordnet });
    }

    try {
        const erg = await apiPost(API, { aenderungen: aenderungen_arr });
        if (!erg.erfolg) {
            apiFehlerAnzeigen(erg);
        } else {
            // Lokalen State aktualisieren: themenfeld_ids in _vokabeln aktualisieren
            for (const [key, zugeordnet] of _aenderungen) {
                const [vid, tid] = key.split('_').map(Number);
                const vok = _vokabeln.find(v => v.id === vid);
                if (!vok) continue;
                if (zugeordnet && !vok.themenfeld_ids.includes(tid)) {
                    vok.themenfeld_ids.push(tid);
                } else if (!zugeordnet) {
                    vok.themenfeld_ids = vok.themenfeld_ids.filter(id => id !== tid);
                }
            }
            _aenderungen.clear();
            erfolg(erg.nachricht || t('admin_zuordnungen.gespeichert'));
            // Matrix neu rendern (Färbungen entfernen)
            const wrapper = container.querySelector('#matrix-wrapper');
            if (wrapper) wrapper.innerHTML = _matrix_html();
            _checkboxen_binden(container);
        }
    } catch (err) {
        fehler(t('admin_zuordnungen.speichern_fehler'));
        console.error(err);
    } finally {
        _speichern_laeuft = false;
        const btnNeu = container.querySelector('#btn-speichern');
        if (btnNeu) {
            btnNeu.disabled = _aenderungen.size === 0;
            btnNeu.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px">save</span>
                ${t('admin_zuordnungen.speichern')}
                ${_aenderungen.size > 0 ? `<span class="zuordnung-matrix__badge">${_aenderungen.size}</span>` : ''}`;
            btnNeu.onclick = () => _speichern(container);
        }
    }
}

export function aufraeumen() {
    _themenfelder    = [];
    _vokabeln        = [];
    _aenderungen.clear();
    _tf_filter.clear();
    _suche           = '';
    _nur_ohne        = false;
    _seite           = 1;
    _speichern_laeuft = false;
}
