/**
 * Admin — Themenfeld-Zuordnungs-Matrix
 *
 * Checkbox-Matrix: Zeilen = Vokabeln, Spalten = Themenfelder.
 * Sortierung per Klick auf Kopfzeile, Seiten-Selektor, Dirty-Tracking.
 */

import { apiGet, apiPost } from '../api-client.js';
import { esc } from '../hilfs-funktionen.js';
import { t } from '../dienste/sprache.js';
import { erfolg, fehler, apiFehlerAnzeigen } from '../benachrichtigungen.js';
import { lade_anzeige_rendern } from '../komponenten/lade-anzeige.js';

const API = 'admin/zuordnungen_matrix.php';

// ---- State ----
let _themenfelder     = [];
let _vokabeln         = [];
let _gesamt           = 0;
let _seite            = 1;
let _seiten           = 1;
let _pro_seite        = 50;
let _suche            = '';
let _nur_ohne         = false;
let _tf_filter        = new Set();
let _aenderungen      = new Map();   // 'vid_tid' → bool
let _sort_spalte      = 'englisch';  // 'englisch' | 'deutsch' | 'tf'
let _sort_tf_id       = null;        // TF-ID wenn _sort_spalte === 'tf'
let _sort_richtung    = 'ASC';       // 'ASC' | 'DESC'
let _speichern_laeuft = false;

const PRO_SEITE_OPTIONEN = [10, 25, 50, 100, 200, 500, 0]; // 0 = alle

// ---- Einstieg ----

export async function rendern(params = {}) {
    const container = document.getElementById('inhalt');
    if (!container) return;

    _aenderungen.clear();
    _seite       = 1;
    _suche       = '';
    _nur_ohne    = false;
    _sort_spalte = 'englisch';
    _sort_richtung = 'ASC';

    lade_anzeige_rendern(container);

    const erg = await apiGet(API, _api_params());
    if (!erg.erfolg) { apiFehlerAnzeigen(erg); return; }

    _daten_uebernehmen(erg.daten);
    _tf_filter = new Set(_themenfelder.slice(0, 10).map(tf => tf.id));

    _seite_rendern(container);
}

// ---- Render ----

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
            <div class="filter-leiste" style="flex-wrap:wrap;gap:10px;align-items:flex-start;margin-bottom:12px">
                <div style="display:flex;gap:8px;align-items:center;flex:1;min-width:220px">
                    <input class="eingabe eingabe--klein" type="search" id="suche-input"
                        placeholder="${t('admin_zuordnungen.suche_placeholder')}"
                        value="${esc(_suche)}" style="flex:1">
                    <label style="display:flex;align-items:center;gap:6px;white-space:nowrap;font-size:0.85em;cursor:pointer">
                        <input type="checkbox" id="chk-nur-ohne" ${_nur_ohne ? 'checked' : ''}>
                        ${t('admin_zuordnungen.nur_ohne')}
                    </label>
                    <select class="eingabe eingabe--klein" id="sel-pro-seite" style="width:auto">
                        ${PRO_SEITE_OPTIONEN.map(n =>
                            `<option value="${n}" ${n === _pro_seite ? 'selected' : ''}>
                                ${n === 0 ? t('admin_zuordnungen.alle') : n + ' / ' + t('admin_zuordnungen.seite')}
                            </option>`
                        ).join('')}
                    </select>
                </div>
                <div class="zuordnung-matrix__tf-filter" id="tf-filter-chips">
                    ${_tf_filter_html()}
                </div>
            </div>

            <!-- Matrix -->
            <div class="zuordnung-matrix-wrapper" id="matrix-wrapper">
                ${_matrix_html()}
            </div>

            <!-- Paginierung -->
            ${_paginierung_html()}
        </div>
    `;

    _events_binden(container);
}

// ---- Teilweise Aktualisierungen ----

function _matrix_aktualisieren(container) {
    const wrapper = container.querySelector('#matrix-wrapper');
    if (wrapper) {
        wrapper.innerHTML = _matrix_html();
        _checkboxen_binden(container);
    }
}

function _paginierung_aktualisieren(container) {
    const alt = container.querySelector('.paginierung');
    const neu = document.createElement('div');
    neu.innerHTML = _paginierung_html();
    const el = neu.firstElementChild;
    if (alt && el) {
        alt.replaceWith(el);
    } else if (el) {
        container.querySelector('.verwaltung')?.appendChild(el);
    }
    _paginierung_events_binden(container);
}

function _speichern_btn_aktualisieren(container) {
    const btn = container.querySelector('#btn-speichern');
    if (!btn) return;
    btn.disabled = _aenderungen.size === 0;
    btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px">save</span>
        ${t('admin_zuordnungen.speichern')}
        ${_aenderungen.size > 0 ? `<span class="zuordnung-matrix__badge">${_aenderungen.size}</span>` : ''}`;
    btn.onclick = () => _speichern(container);
}

// ---- HTML-Generatoren ----

function _tf_filter_html() {
    return _themenfelder.map(tf => {
        const aktiv = _tf_filter.has(tf.id);
        return `<button type="button"
            class="zuordnung-matrix__tf-btn ${aktiv ? 'zuordnung-matrix__tf-btn--aktiv' : ''}"
            data-tf-toggle="${tf.id}" title="${esc(tf.titel)}">
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

    const pfeil = (spalte, tfId = null) => {
        const aktiv = spalte === 'tf' ? (_sort_spalte === 'tf' && _sort_tf_id === tfId) : _sort_spalte === spalte;
        if (!aktiv) return '<span class="zuordnung-matrix__sort-icon">↕</span>';
        return _sort_richtung === 'ASC'
            ? '<span class="zuordnung-matrix__sort-icon zuordnung-matrix__sort-icon--aktiv">↑</span>'
            : '<span class="zuordnung-matrix__sort-icon zuordnung-matrix__sort-icon--aktiv">↓</span>';
    };

    // Kopfzeile
    let kopf = `<tr>
        <th class="zuordnung-matrix__vok-kopf zuordnung-matrix__sortierbar" data-sort="englisch">
            ${t('admin_zuordnungen.spalte_englisch')} ${pfeil('englisch')}
        </th>
        <th class="zuordnung-matrix__vok-kopf zuordnung-matrix__sortierbar" data-sort="deutsch">
            ${t('admin_zuordnungen.spalte_deutsch')} ${pfeil('deutsch')}
        </th>`;
    for (const tf of sichtbare) {
        const tfAktiv = _sort_spalte === 'tf' && _sort_tf_id === tf.id;
        kopf += `<th class="zuordnung-matrix__tf-kopf zuordnung-matrix__sortierbar ${tfAktiv ? 'zuordnung-matrix__tf-kopf--aktiv' : ''}"
            data-sort-tf="${tf.id}" title="${esc(tf.titel)}">
            <span>${esc(tf.titel)}</span>${pfeil('tf', tf.id)}
        </th>`;
    }
    kopf += '</tr>';

    // Datenzeilen
    let zeilen = '';
    for (const vok of _vokabeln) {
        zeilen += `<tr>
            <td class="zuordnung-matrix__vok-zelle">
                <span class="zuordnung-matrix__englisch">${esc(vok.englisch)}</span>
            </td>
            <td class="zuordnung-matrix__vok-zelle">
                <span class="zuordnung-matrix__deutsch">${esc(vok.deutsch)}</span>
            </td>`;

        for (const tf of sichtbare) {
            const key = `${vok.id}_${tf.id}`;
            const checked = _aenderungen.has(key)
                ? _aenderungen.get(key)
                : vok.themenfeld_ids.includes(tf.id);
            const geaendert = _aenderungen.has(key);
            zeilen += `<td class="zuordnung-matrix__tf-zelle ${geaendert ? 'zuordnung-matrix__tf-zelle--geaendert' : ''}">
                <input type="checkbox" class="zuordnung-matrix__chk"
                    data-vid="${vok.id}" data-tid="${tf.id}" ${checked ? 'checked' : ''}>
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
    if (_pro_seite !== 0 && _seiten <= 1 && _gesamt <= _pro_seite) return '';

    const von  = _pro_seite === 0 ? 1 : (_seite - 1) * _pro_seite + 1;
    const bis  = _pro_seite === 0 ? _gesamt : Math.min(_seite * _pro_seite, _gesamt);

    let html = `<span class="paginierung__info">${von}–${bis} ${t('admin_zuordnungen.von')} ${_gesamt}</span>`;

    if (_pro_seite !== 0 && _seiten > 1) {
        html += `<button class="paginierung__btn" data-seite="${_seite - 1}" ${_seite <= 1 ? 'disabled' : ''}>‹</button>`;
        for (const s of _paginierung_bereich(_seite, _seiten)) {
            if (s === '...') {
                html += `<span class="paginierung__punkte">…</span>`;
            } else {
                html += `<button class="paginierung__btn ${s === _seite ? 'paginierung__seite--aktiv' : ''}" data-seite="${s}">${s}</button>`;
            }
        }
        html += `<button class="paginierung__btn" data-seite="${_seite + 1}" ${_seite >= _seiten ? 'disabled' : ''}>›</button>`;
    }

    return `<div class="paginierung" style="margin-top:16px;justify-content:flex-start;gap:4px">${html}</div>`;
}

function _paginierung_bereich(aktuelle, gesamt) {
    if (gesamt <= 7) return Array.from({ length: gesamt }, (_, i) => i + 1);
    const s = [];
    s.push(1);
    if (aktuelle > 3) s.push('...');
    for (let i = Math.max(2, aktuelle - 1); i <= Math.min(gesamt - 1, aktuelle + 1); i++) s.push(i);
    if (aktuelle < gesamt - 2) s.push('...');
    s.push(gesamt);
    return s;
}

// ---- Events ----

function _events_binden(container) {
    // Suche
    let suchTimer;
    container.querySelector('#suche-input')?.addEventListener('input', e => {
        clearTimeout(suchTimer);
        suchTimer = setTimeout(() => {
            _suche = e.target.value.trim();
            _seite = 1;
            _laden_und_aktualisieren(container);
        }, 350);
    });

    // Nur-ohne-Checkbox
    container.querySelector('#chk-nur-ohne')?.addEventListener('change', e => {
        _nur_ohne = e.target.checked;
        _seite = 1;
        _laden_und_aktualisieren(container);
    });

    // Pro-Seite-Selektor
    container.querySelector('#sel-pro-seite')?.addEventListener('change', e => {
        _pro_seite = parseInt(e.target.value, 10);
        _seite = 1;
        _laden_und_aktualisieren(container);
    });

    // TF-Filter Chips
    _tf_filter_events_binden(container);

    // Sortierbare Kopfzeilen
    _sort_events_binden(container);

    // Checkboxen
    _checkboxen_binden(container);

    // Paginierung
    _paginierung_events_binden(container);

    // Speichern
    container.querySelector('#btn-speichern')?.addEventListener('click', () => _speichern(container));
}

function _tf_filter_events_binden(container) {
    container.querySelectorAll('[data-tf-toggle]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tid = parseInt(btn.dataset.tfToggle, 10);
            _tf_filter.has(tid) ? _tf_filter.delete(tid) : _tf_filter.add(tid);
            // Filter-Chips neu rendern
            const chips = container.querySelector('#tf-filter-chips');
            if (chips) {
                chips.innerHTML = _tf_filter_html();
                _tf_filter_events_binden(container);
            }
            _matrix_aktualisieren(container);
            _sort_events_binden(container); // neue TF-Kopfzeilen brauchen neue Listener
        });
    });
}

function _sort_events_binden(container) {
    container.querySelectorAll('.zuordnung-matrix__sortierbar').forEach(th => {
        th.addEventListener('click', () => {
            if (th.dataset.sortTf) {
                const tid = parseInt(th.dataset.sortTf, 10);
                if (_sort_spalte === 'tf' && _sort_tf_id === tid) {
                    _sort_richtung = _sort_richtung === 'ASC' ? 'DESC' : 'ASC';
                } else {
                    _sort_spalte   = 'tf';
                    _sort_tf_id    = tid;
                    _sort_richtung = 'ASC';
                }
            } else {
                const spalte = th.dataset.sort;
                if (_sort_spalte === spalte) {
                    _sort_richtung = _sort_richtung === 'ASC' ? 'DESC' : 'ASC';
                } else {
                    _sort_spalte   = spalte;
                    _sort_tf_id    = null;
                    _sort_richtung = 'ASC';
                }
            }
            _seite = 1;
            _laden_und_aktualisieren(container);
        });
    });
}

function _checkboxen_binden(container) {
    container.querySelectorAll('.zuordnung-matrix__chk').forEach(chk => {
        chk.addEventListener('change', () => {
            const vid = parseInt(chk.dataset.vid, 10);
            const tid = parseInt(chk.dataset.tid, 10);
            const key = `${vid}_${tid}`;
            const vok = _vokabeln.find(v => v.id === vid);
            const original = vok ? vok.themenfeld_ids.includes(tid) : false;

            if (chk.checked === original) {
                _aenderungen.delete(key);
            } else {
                _aenderungen.set(key, chk.checked);
            }
            chk.closest('td')?.classList.toggle('zuordnung-matrix__tf-zelle--geaendert', _aenderungen.has(key));
            _speichern_btn_aktualisieren(container);
        });
    });
}

function _paginierung_events_binden(container) {
    container.querySelectorAll('[data-seite]').forEach(btn => {
        btn.addEventListener('click', () => {
            const s = parseInt(btn.dataset.seite, 10);
            if (!s || s < 1 || s > _seiten || s === _seite) return;
            _seite = s;
            _laden_und_aktualisieren(container);
        });
    });
}

// ---- Daten laden ----

function _api_params() {
    const p = {
        seite:         _pro_seite === 0 ? 1     : _seite,
        pro_seite:     _pro_seite === 0 ? 99999 : _pro_seite,
        suche:         _suche,
        nur_ohne:      _nur_ohne ? 1 : 0,
        sort_spalte:   _sort_spalte,
        sort_richtung: _sort_richtung,
    };
    if (_sort_spalte === 'tf' && _sort_tf_id) p.sort_tf_id = _sort_tf_id;
    return p;
}

function _daten_uebernehmen(daten) {
    _themenfelder = daten.themenfelder || [];
    _vokabeln     = daten.vokabeln     || [];
    _gesamt       = daten.gesamt       || 0;
    _seiten       = daten.seiten       || 1;
    _seite        = daten.seite        || 1;
}

async function _laden_und_aktualisieren(container) {
    const wrapper = container.querySelector('#matrix-wrapper');
    if (wrapper) wrapper.innerHTML = '<div class="lade-anzeige"><div class="lade-anzeige__spinner"></div></div>';

    const erg = await apiGet(API, _api_params());
    if (!erg.erfolg) { apiFehlerAnzeigen(erg); return; }

    _daten_uebernehmen(erg.daten);
    _matrix_aktualisieren(container);
    _sort_events_binden(container);
    _paginierung_aktualisieren(container);
}

// ---- Speichern ----

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
            // Lokalen State nachführen
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
            _matrix_aktualisieren(container);
            _sort_events_binden(container);
        }
    } catch (err) {
        fehler(t('admin_zuordnungen.speichern_fehler'));
        console.error(err);
    } finally {
        _speichern_laeuft = false;
        _speichern_btn_aktualisieren(container);
    }
}

// ---- Cleanup ----

export function aufraeumen() {
    _themenfelder     = [];
    _vokabeln         = [];
    _aenderungen.clear();
    _tf_filter.clear();
    _suche            = '';
    _nur_ohne         = false;
    _seite            = 1;
    _pro_seite        = 50;
    _sort_spalte      = 'englisch';
    _sort_tf_id       = null;
    _sort_richtung    = 'ASC';
    _speichern_laeuft = false;
}
