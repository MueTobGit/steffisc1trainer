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

const API        = 'tipp_saetze';
const PRO_SEITE  = 50;

let _seite        = 1;
let _suche        = '';
let _themenfeld_id = 0;   // 0 = alle, -1 = ohne
let _themenfelder = [];
let _bearbeiten_id = null; // null = neuer Satz

export async function rendern(params = {}) {
    const container = document.getElementById('inhalt');
    if (!container) return;

    _seite = 1;
    lade_anzeige_rendern(container);

    const tfErg = await apiGet('themenfelder/liste.php', { pro_seite: 500 });
    _themenfelder = tfErg.erfolg ? (tfErg.daten?.eintraege || []) : [];

    await _liste_laden(container);
}

async function _liste_laden(container) {
    const erg = await apiGet(`${API}/liste.php`, {
        seite:         _seite,
        pro_seite:     PRO_SEITE,
        suche:         _suche,
        themenfeld_id: _themenfeld_id,
        sortierung:    'erstellt_am',
        richtung:      'DESC',
    });
    if (!erg.erfolg) { apiFehlerAnzeigen(erg); return; }

    _seite_rendern(container, erg.daten?.eintraege || [], erg.daten?.paginierung);
}

function _seite_rendern(container, saetze, paginierung) {
    const tfOptionen = `
        <option value="0">${t('tipp_saetze.alle_themenfelder')}</option>
        <option value="-1">${t('tipp_saetze.ohne_themenfeld')}</option>
        ${_themenfelder.map(tf =>
            `<option value="${tf.id}" ${_themenfeld_id === tf.id ? 'selected' : ''}>${esc(tf.titel)}</option>`
        ).join('')}
    `;

    container.innerHTML = `
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

            <div class="filter-leiste" style="flex-wrap:wrap;gap:10px">
                <input class="eingabe eingabe--klein" type="search" id="suche-input"
                    placeholder="${t('tipp_saetze.suche_placeholder')}"
                    value="${esc(_suche)}" style="flex:1;min-width:180px">
                <select class="eingabe eingabe--klein" id="tf-filter" style="width:auto">
                    ${tfOptionen}
                </select>
            </div>

            ${saetze.length === 0 ? `
                <div class="leer-zustand" style="padding:48px 24px;text-align:center">
                    <span class="material-symbols-outlined leer-zustand__icon">edit_note</span>
                    <p class="leer-zustand__titel">${t('tipp_saetze.leer_titel')}</p>
                    <p class="leer-zustand__beschreibung">${t('tipp_saetze.leer_text')}</p>
                </div>
            ` : `
                <div class="verwaltung-tabelle-wrapper">
                    <table class="verwaltung-tabelle">
                        <thead>
                            <tr>
                                <th>${t('tipp_saetze.spalte_text')}</th>
                                <th>${t('tipp_saetze.spalte_themenfeld')}</th>
                                <th>${t('tipp_saetze.spalte_datum')}</th>
                                <th class="verwaltung-tabelle__aktionen-kopf"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${saetze.map(s => _zeile_html(s)).join('')}
                        </tbody>
                    </table>
                </div>
                ${paginierung ? paginierung_rendern(paginierung, _seite, 'data-seite') : ''}
            `}
        </div>

        <!-- Formular-Dialog -->
        <div class="bestaetigung-dialog__overlay bestaetigung-dialog__overlay--ausblenden" id="satz-dialog-overlay">
            <div class="bestaetigung-dialog" style="max-width:560px;width:100%">
                <h2 class="bestaetigung-dialog__titel" id="dialog-titel"></h2>
                <div style="margin-bottom:16px">
                    <label class="formular-label" for="dialog-text">${t('tipp_saetze.text_label')}</label>
                    <textarea class="eingabe" id="dialog-text" rows="4"
                        placeholder="${t('tipp_saetze.text_placeholder')}"
                        style="resize:vertical"></textarea>
                </div>
                <div style="margin-bottom:20px">
                    <label class="formular-label" for="dialog-themenfeld">${t('tipp_saetze.themenfeld_label')}</label>
                    <select class="eingabe" id="dialog-themenfeld">
                        <option value="">${t('tipp_saetze.kein_themenfeld')}</option>
                        ${_themenfelder.map(tf =>
                            `<option value="${tf.id}">${esc(tf.titel)}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="bestaetigung-dialog__aktionen">
                    <button class="btn btn--text" id="dialog-abbrechen">${t('allgemein.abbrechen')}</button>
                    <button class="btn btn--gefuellt" id="dialog-speichern">${t('allgemein.speichern')}</button>
                </div>
            </div>
        </div>
    `;

    // Filter-Events
    let suchTimer;
    container.querySelector('#suche-input')?.addEventListener('input', e => {
        clearTimeout(suchTimer);
        suchTimer = setTimeout(() => {
            _suche = e.target.value.trim();
            _seite = 1;
            _liste_laden(container);
        }, 350);
    });

    container.querySelector('#tf-filter')?.addEventListener('change', e => {
        _themenfeld_id = parseInt(e.target.value, 10);
        _seite = 1;
        _liste_laden(container);
    });

    // Paginierung
    container.querySelectorAll('[data-seite]').forEach(btn => {
        btn.addEventListener('click', () => {
            const s = parseInt(btn.dataset.seite, 10);
            if (s && s !== _seite) { _seite = s; _liste_laden(container); }
        });
    });

    // Neu-Button
    container.querySelector('#btn-neu')?.addEventListener('click', () => _dialog_oeffnen(container, null));

    // Zeilen-Aktionen
    container.querySelectorAll('[data-bearbeiten]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id   = parseInt(btn.dataset.bearbeiten, 10);
            const text = btn.dataset.text;
            const tfId = btn.dataset.tfId ? parseInt(btn.dataset.tfId, 10) : '';
            _dialog_oeffnen(container, { id, text, themenfeld_id: tfId });
        });
    });

    container.querySelectorAll('[data-loeschen]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id   = parseInt(btn.dataset.loeschen, 10);
            const text = btn.dataset.text;
            bestaetigung_anzeigen({
                titel: t('tipp_saetze.loeschen_titel'),
                text:  t('tipp_saetze.loeschen_text', { text: text.slice(0, 50) }),
                bestaetigen_text: t('allgemein.loeschen'),
                gefaehrlich: true,
                callback: async () => {
                    const erg = await apiDelete(`${API}/loeschen.php?id=${id}`);
                    if (erg.erfolg) {
                        erfolg(t('tipp_saetze.geloescht'));
                        _liste_laden(container);
                    } else {
                        apiFehlerAnzeigen(erg);
                    }
                },
            });
        });
    });

    // Dialog-Events
    _dialog_events_binden(container);
}

function _zeile_html(s) {
    const datumStr = s.erstellt_am
        ? new Date(s.erstellt_am).toLocaleDateString('de-DE')
        : '—';
    return `
        <tr>
            <td>
                <span class="ts-text-vorschau" title="${esc(s.text)}">${esc(s.text)}</span>
            </td>
            <td>
                ${s.themenfeld_titel
                    ? `<span class="badge">${esc(s.themenfeld_titel)}</span>`
                    : `<span style="color:var(--md-sys-color-outline);font-size:0.85em">${t('tipp_saetze.kein_themenfeld')}</span>`
                }
            </td>
            <td style="white-space:nowrap;font-size:0.85em;color:var(--md-sys-color-on-surface-variant)">${datumStr}</td>
            <td class="verwaltung-tabelle__aktionen">
                <button class="btn-icon" title="${t('allgemein.bearbeiten')}"
                    data-bearbeiten="${s.id}"
                    data-text="${esc(s.text)}"
                    data-tf-id="${s.themenfeld_id ?? ''}">
                    <span class="material-symbols-outlined">edit</span>
                </button>
                <button class="btn-icon btn-icon--gefaehrlich" title="${t('allgemein.loeschen')}"
                    data-loeschen="${s.id}"
                    data-text="${esc(s.text)}">
                    <span class="material-symbols-outlined">delete</span>
                </button>
            </td>
        </tr>
    `;
}

function _dialog_oeffnen(container, satz) {
    _bearbeiten_id = satz?.id ?? null;
    const overlay  = container.querySelector('#satz-dialog-overlay');
    const titel    = container.querySelector('#dialog-titel');
    const textEl   = container.querySelector('#dialog-text');
    const tfEl     = container.querySelector('#dialog-themenfeld');

    if (!overlay) return;
    titel.textContent = _bearbeiten_id
        ? t('tipp_saetze.bearbeiten_titel')
        : t('tipp_saetze.erstellen_titel');
    textEl.value      = satz?.text ?? '';
    tfEl.value        = satz?.themenfeld_id ?? '';

    overlay.classList.remove('bestaetigung-dialog__overlay--ausblenden');
    textEl.focus();
}

function _dialog_schliessen(container) {
    container.querySelector('#satz-dialog-overlay')
        ?.classList.add('bestaetigung-dialog__overlay--ausblenden');
    _bearbeiten_id = null;
}

function _dialog_events_binden(container) {
    container.querySelector('#dialog-abbrechen')
        ?.addEventListener('click', () => _dialog_schliessen(container));

    container.querySelector('#satz-dialog-overlay')
        ?.addEventListener('click', e => {
            if (e.target === e.currentTarget) _dialog_schliessen(container);
        });

    container.querySelector('#dialog-speichern')
        ?.addEventListener('click', () => _dialog_speichern(container));
}

async function _dialog_speichern(container) {
    const text  = container.querySelector('#dialog-text')?.value.trim();
    const tfVal = container.querySelector('#dialog-themenfeld')?.value;

    if (!text) {
        fehler(t('tipp_saetze.text_pflicht'));
        return;
    }

    const body = {
        text,
        themenfeld_id: tfVal ? parseInt(tfVal, 10) : null,
    };

    const btn = container.querySelector('#dialog-speichern');
    if (btn) btn.disabled = true;

    try {
        let erg;
        if (_bearbeiten_id) {
            erg = await apiPut(`${API}/aktualisieren.php?id=${_bearbeiten_id}`, body);
        } else {
            erg = await apiPost(`${API}/erstellen.php`, body);
        }

        if (!erg.erfolg) {
            apiFehlerAnzeigen(erg);
            return;
        }

        erfolg(_bearbeiten_id ? t('tipp_saetze.aktualisiert') : t('tipp_saetze.erstellt'));
        _dialog_schliessen(container);
        await _liste_laden(container);
    } finally {
        if (btn) btn.disabled = false;
    }
}

export function aufraeumen() {
    _seite         = 1;
    _suche         = '';
    _themenfeld_id = 0;
    _themenfelder  = [];
    _bearbeiten_id = null;
}
