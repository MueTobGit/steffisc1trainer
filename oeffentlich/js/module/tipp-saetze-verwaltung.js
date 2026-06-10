/**
 * Tipp-Sätze — Verwaltung (Admin)
 *
 * Sätze für den Nachtippen-Übungsmodus anlegen, bearbeiten, löschen.
 * Route: /saetze
 */

import { apiGet, apiPost, apiPut, apiDelete } from '../api-client.js';
import { esc } from '../hilfs-funktionen.js';
import { t } from '../dienste/sprache.js';
import { lade_anzeige_rendern } from '../komponenten/lade-anzeige.js';
import { bestaetigung_anzeigen } from '../komponenten/bestaetigung-dialog.js';
import { erfolg, fehler, apiFehlerAnzeigen } from '../benachrichtigungen.js';
import { paginierung_rendern } from '../komponenten/paginierung.js';

const API       = 'tipp_saetze';
const PRO_SEITE = 50;

let _container    = null;
let _seite        = 1;
let _suche        = '';
let _themenfeld_id = 0;
let _themenfelder = [];

export async function rendern(params = {}) {
    _container = document.getElementById('inhalt');
    if (!_container) return;

    _seite         = 1;
    _suche         = '';
    _themenfeld_id = 0;

    lade_anzeige_rendern(_container);

    const tfErg   = await apiGet('themenfelder/liste.php', { pro_seite: 500 });
    _themenfelder = tfErg.erfolg ? (tfErg.daten?.eintraege || []) : [];

    await _liste_laden();
}

// ---- Liste ----

async function _liste_laden() {
    const erg = await apiGet(`${API}/liste.php`, {
        seite:         _seite,
        pro_seite:     PRO_SEITE,
        suche:         _suche,
        themenfeld_id: _themenfeld_id,
        sortierung:    'erstellt_am',
        richtung:      'DESC',
    });
    if (!erg.erfolg) { apiFehlerAnzeigen(erg); return; }

    const saetze     = erg.daten?.eintraege || [];
    const paginierung = erg.daten?.paginierung;
    _liste_rendern(saetze, paginierung);
}

function _liste_rendern(saetze, paginierung) {
    const tfOptionen = `
        <option value="0"  ${_themenfeld_id === 0  ? 'selected' : ''}>${t('tipp_saetze.alle_themenfelder')}</option>
        <option value="-1" ${_themenfeld_id === -1 ? 'selected' : ''}>${t('tipp_saetze.ohne_themenfeld')}</option>
        ${_themenfelder.map(tf =>
            `<option value="${tf.id}" ${_themenfeld_id === tf.id ? 'selected' : ''}>${esc(tf.titel)}</option>`
        ).join('')}
    `;

    _container.innerHTML = `
        <div class="verwaltung">
            <div class="verwaltung__kopf">
                <h1 class="verwaltung__titel">
                    <span class="material-symbols-outlined" style="vertical-align:middle;margin-right:8px">edit_note</span>
                    ${t('tipp_saetze.titel')}
                </h1>
                <button class="btn btn--gefuellt" id="btn-neu">
                    <span class="material-symbols-outlined" style="font-size:18px">add</span>
                    ${t('tipp_saetze.neuer_satz')}
                </button>
            </div>

            <div class="filter-leiste" style="flex-wrap:wrap;gap:10px;margin-bottom:16px">
                <input class="eingabe eingabe--klein" type="search" id="suche-input"
                    placeholder="${t('tipp_saetze.suche_placeholder')}"
                    value="${esc(_suche)}" style="flex:1;min-width:180px">
                <select class="eingabe eingabe--klein" id="tf-filter" style="width:auto">
                    ${tfOptionen}
                </select>
            </div>

            ${saetze.length === 0
                ? `<div class="leer-zustand">
                        <span class="material-symbols-outlined leer-zustand__icon">edit_note</span>
                        <p class="leer-zustand__titel">${t('tipp_saetze.leer_titel')}</p>
                        <p class="leer-zustand__beschreibung">${t('tipp_saetze.leer_text')}</p>
                    </div>`
                : `<div class="verwaltung-tabelle-wrapper">
                        <table class="verwaltung-tabelle">
                            <thead>
                                <tr>
                                    <th>${t('tipp_saetze.spalte_text')}</th>
                                    <th>${t('tipp_saetze.spalte_themenfeld')}</th>
                                    <th>${t('tipp_saetze.spalte_datum')}</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                ${saetze.map(s => _zeile_html(s)).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div id="paginierung-bereich"></div>`
            }
        </div>
    `;

    // Paginierung
    const pagEl = _container.querySelector('#paginierung-bereich');
    if (pagEl && paginierung) {
        paginierung_rendern(pagEl, paginierung, (seite) => {
            _seite = seite;
            _liste_laden();
        });
    }

    _events_binden();
}

function _zeile_html(s) {
    const datum = s.erstellt_am
        ? new Date(s.erstellt_am).toLocaleDateString('de-DE')
        : '—';
    return `
        <tr>
            <td title="${esc(s.text)}">
                <span class="ts-text-vorschau">${esc(s.text)}</span>
            </td>
            <td>
                ${s.themenfeld_titel
                    ? `<span class="badge badge--klein">${esc(s.themenfeld_titel)}</span>`
                    : `<span style="color:var(--md-sys-color-outline);font-size:0.85em">${t('tipp_saetze.kein_themenfeld')}</span>`}
            </td>
            <td style="white-space:nowrap;font-size:0.85em;color:var(--md-sys-color-on-surface-variant)">${datum}</td>
            <td class="verwaltung-tabelle__aktionen">
                <button class="btn btn--text btn--klein"
                    data-bearbeiten="${s.id}"
                    data-text="${esc(s.text)}"
                    data-tf-id="${s.themenfeld_id ?? ''}">
                    <span class="material-symbols-outlined" style="font-size:16px">edit</span>
                    ${t('allgemein.bearbeiten')}
                </button>
                <button class="btn btn--text btn--klein" style="color:var(--md-sys-color-error)"
                    data-loeschen="${s.id}"
                    data-text="${esc(s.text.slice(0, 60))}">
                    <span class="material-symbols-outlined" style="font-size:16px">delete</span>
                    ${t('allgemein.loeschen')}
                </button>
            </td>
        </tr>
    `;
}

function _events_binden() {
    // Suche
    let timer;
    _container.querySelector('#suche-input')?.addEventListener('input', e => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            _suche = e.target.value.trim();
            _seite = 1;
            _liste_laden();
        }, 350);
    });

    // TF-Filter
    _container.querySelector('#tf-filter')?.addEventListener('change', e => {
        _themenfeld_id = parseInt(e.target.value, 10);
        _seite = 1;
        _liste_laden();
    });

    // Neu
    _container.querySelector('#btn-neu')?.addEventListener('click', () => _dialog_oeffnen());

    // Bearbeiten
    _container.querySelectorAll('[data-bearbeiten]').forEach(btn => {
        btn.addEventListener('click', () => _dialog_oeffnen({
            id:           parseInt(btn.dataset.bearbeiten, 10),
            text:         btn.dataset.text,
            themenfeld_id: btn.dataset.tfId ? parseInt(btn.dataset.tfId, 10) : '',
        }));
    });

    // Löschen
    _container.querySelectorAll('[data-loeschen]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id       = parseInt(btn.dataset.loeschen, 10);
            const textKurz = btn.dataset.text;
            const ok = await bestaetigung_anzeigen(
                t('tipp_saetze.loeschen_titel'),
                `${textKurz}…`,
                t('allgemein.loeschen'),
                t('allgemein.abbrechen'),
                true
            );
            if (!ok) return;
            const erg = await apiDelete(`${API}/loeschen.php?id=${id}`);
            if (erg.erfolg) {
                erfolg(t('tipp_saetze.geloescht'));
                _liste_laden();
            } else {
                apiFehlerAnzeigen(erg);
            }
        });
    });
}

// ---- Formular-Dialog (an body gehängt, wie bestaetigung-dialog.js) ----

function _dialog_oeffnen(satz = null) {
    const bearbeitenId = satz?.id ?? null;

    const overlay = document.createElement('div');
    overlay.className = 'bestaetigung-dialog__overlay';

    const tfOptionen = `
        <option value="">${t('tipp_saetze.kein_themenfeld')}</option>
        ${_themenfelder.map(tf =>
            `<option value="${tf.id}" ${satz?.themenfeld_id === tf.id ? 'selected' : ''}>${esc(tf.titel)}</option>`
        ).join('')}
    `;

    overlay.innerHTML = `
        <div class="bestaetigung-dialog__box" style="max-width:560px;width:100%">
            <h3 class="bestaetigung-dialog__titel">
                ${bearbeitenId ? t('tipp_saetze.bearbeiten_titel') : t('tipp_saetze.erstellen_titel')}
            </h3>

            <div class="formular-gruppe" style="margin-bottom:14px">
                <label class="formular-label" for="dlg-text">${t('tipp_saetze.text_label')}</label>
                <textarea class="eingabe" id="dlg-text" rows="4"
                    placeholder="${t('tipp_saetze.text_placeholder')}"
                    style="resize:vertical">${esc(satz?.text ?? '')}</textarea>
            </div>

            <div class="formular-gruppe" style="margin-bottom:20px">
                <label class="formular-label" for="dlg-themenfeld">${t('tipp_saetze.themenfeld_label')}</label>
                <select class="eingabe" id="dlg-themenfeld">${tfOptionen}</select>
            </div>

            <div class="bestaetigung-dialog__aktionen">
                <button class="btn btn--text" id="dlg-abbrechen">${t('allgemein.abbrechen')}</button>
                <button class="btn btn--gefuellt" id="dlg-speichern">${t('allgemein.speichern')}</button>
            </div>
        </div>
    `;

    function _schliessen() {
        overlay.classList.add('bestaetigung-dialog__overlay--ausblenden');
        setTimeout(() => overlay.remove(), 200);
    }

    overlay.addEventListener('click', e => { if (e.target === overlay) _schliessen(); });
    overlay.querySelector('#dlg-abbrechen').addEventListener('click', _schliessen);

    overlay.querySelector('#dlg-speichern').addEventListener('click', async () => {
        const text  = overlay.querySelector('#dlg-text')?.value.trim();
        const tfVal = overlay.querySelector('#dlg-themenfeld')?.value;

        if (!text) { fehler(t('tipp_saetze.text_pflicht')); return; }

        const btn = overlay.querySelector('#dlg-speichern');
        btn.disabled = true;
        btn.textContent = '…';

        const body = { text, themenfeld_id: tfVal ? parseInt(tfVal, 10) : null };

        try {
            const erg = bearbeitenId
                ? await apiPut(`${API}/aktualisieren.php?id=${bearbeitenId}`, body)
                : await apiPost(`${API}/erstellen.php`, body);

            if (!erg.erfolg) { apiFehlerAnzeigen(erg); return; }

            erfolg(bearbeitenId ? t('tipp_saetze.aktualisiert') : t('tipp_saetze.erstellt'));
            _schliessen();
            await _liste_laden();
        } finally {
            btn.disabled    = false;
            btn.textContent = t('allgemein.speichern');
        }
    });

    document.body.appendChild(overlay);
    overlay.querySelector('#dlg-text')?.focus();
}

export function aufraeumen() {
    _container     = null;
    _seite         = 1;
    _suche         = '';
    _themenfeld_id = 0;
    _themenfelder  = [];
}
