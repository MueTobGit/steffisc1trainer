/**
 * Admin-Panel — Benutzerverwaltung, Belohnungen, Ligen, Konfiguration, Wartung
 *
 * Tabs:
 * 1. Benutzer:      Paginierte Liste, Suche, Erstellen, Bearbeiten (inkl. Statistik), Löschen, Passwort
 * 2. Belohnungen:   CRUD für Badges/Meilensteine/Titel
 * 3. Ligen:         CRUD für Turniere
 * 4. Konfiguration: app_konfiguration Werte editieren (inkl. Stern-XP)
 * 5. Wartung:       Aktivitäten bereinigen, Datenbank-Backup
 * 6. SQL:           Direkter SQL-Editor + Datei-Upload
 * 7. Rechtliches:   Impressum, Datenschutz, Systeminformationen bearbeiten
 */

import { apiGet, apiPost, apiPaginiert, apiDelete } from '../api-client.js';
import { holen } from '../zustand.js';
import { esc, zahlFormatieren, relativZeit, entprellen } from '../hilfs-funktionen.js';
import { navigieren } from '../router.js';
import { t } from '../dienste/sprache.js';
import { lade_anzeige_rendern, lade_anzeige_entfernen } from '../komponenten/lade-anzeige.js';
import { leer_zustand_rendern } from '../komponenten/leer-zustand.js';
import { paginierung_rendern } from '../komponenten/paginierung.js';
import { bestaetigung_anzeigen } from '../komponenten/bestaetigung-dialog.js';
import { erfolg, fehler as fehlerMsg, apiFehlerAnzeigen } from '../benachrichtigungen.js';
const krone_svg_html = () => '';
const KRONE_TYPEN = [];

// ============================================
// Hilfsfunktionen
// ============================================

/**
 * Datei per fetch() herunterladen — Token im Authorization-Header, nicht in der URL.
 */
async function _datei_herunterladen(url, dateiname) {
    const token = holen('token') || '';
    const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
    if (!res.ok) return;
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = dateiname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objUrl);
}

// ============================================
// Modul-Zustand
// ============================================

let _wrapper      = null;
let _aktiver_tab  = 'benutzer';

// Benutzer-Tab
let _benutzer_seite = 1;
let _benutzer_suche = '';


// ============================================
// Modul-Exports
// ============================================

export async function rendern() {
    const container = document.getElementById('inhalt');
    if (!container) return;

    container.innerHTML = '';

    _wrapper = document.createElement('div');
    _wrapper.className = 'admin-panel';
    container.appendChild(_wrapper);

    _wrapper.innerHTML = `
        <div class="admin-panel__kopf" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
            <h2>${t('admin.titel')}</h2>
        </div>
        <div class="admin-panel__tabs">
            <button class="admin-panel__tab admin-panel__tab--aktiv" data-tab="benutzer" title="${t('admin.tab_benutzer')}">
                <span class="material-symbols-outlined">people</span>
                <span>${t('admin.tab_benutzer')}</span>
            </button>
            <button class="admin-panel__tab" data-tab="konfiguration" title="${t('admin.tab_konfiguration')}">
                <span class="material-symbols-outlined">tune</span>
                <span>${t('admin.tab_konfiguration')}</span>
            </button>
            <button class="admin-panel__tab" data-tab="wartung" title="${t('admin.tab_wartung')}">
                <span class="material-symbols-outlined">build</span>
                <span>${t('admin.tab_wartung')}</span>
            </button>
            <button class="admin-panel__tab" data-tab="sql" title="${t('admin.tab_sql')}">
                <span class="material-symbols-outlined">terminal</span>
                <span>${t('admin.tab_sql')}</span>
            </button>
            <button class="admin-panel__tab" data-tab="rechtliches" title="${t('admin.tab_rechtliches')}">
                <span class="material-symbols-outlined">gavel</span>
                <span>${t('admin.tab_rechtliches')}</span>
            </button>
            <button class="admin-panel__tab" data-tab="server" title="${t('admin.tab_server')}">
                <span class="material-symbols-outlined">dns</span>
                <span>${t('admin.tab_server')}</span>
            </button>
            <button class="admin-panel__tab" data-tab="i18n-dateien" title="${t('admin.tab_i18n_dateien')}">
                <span class="material-symbols-outlined">folder_open</span>
                <span>${t('admin.tab_i18n_dateien')}</span>
            </button>
        </div>
        <div id="admin-inhalt"></div>
    `;

    _wrapper.querySelectorAll('.admin-panel__tab').forEach(tab => {
        tab.addEventListener('click', () => {
            _wrapper.querySelectorAll('.admin-panel__tab').forEach(el => el.classList.remove('admin-panel__tab--aktiv'));
            tab.classList.add('admin-panel__tab--aktiv');
            _aktiver_tab = tab.dataset.tab;
            _tab_rendern();
        });
    });

    _tab_rendern();
}

export function aufraeumen() {
    _wrapper        = null;
    _aktiver_tab    = 'benutzer';
    _benutzer_seite = 1;
    _benutzer_suche = '';
    _i18nd_module    = [];
    _i18nd_modul     = '';
    _i18nd_daten     = null;
    _i18nd_geaendert = false;
    _i18nd_suche     = '';
    _i18nd_filter    = 'alle';
}

// ============================================
// Tab-Dispatcher
// ============================================

function _tab_rendern() {
    const inhalt = _wrapper.querySelector('#admin-inhalt');
    inhalt.innerHTML = '';

    switch (_aktiver_tab) {
        case 'benutzer':      _benutzer_tab(inhalt); break;
        case 'konfiguration': _konfiguration_tab(inhalt); break;
        case 'wartung':       _wartung_tab(inhalt); break;
        case 'sql':           _sql_tab(inhalt); break;
        case 'rechtliches':   _rechtliches_tab(inhalt); break;
        case 'server':        _server_tab(inhalt); break;
        case 'i18n-dateien':  _i18n_dateien_tab(inhalt); break;
    }
}

// ============================================================
// Tab 1: Benutzer
// ============================================================

function _benutzer_tab(container) {
    container.innerHTML = `
        <div class="filter-leiste" style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <input class="eingabe" type="text" id="admin-benutzer-suche"
                   placeholder="${t('admin.benutzer_suche_placeholder')}" value="${esc(_benutzer_suche)}"
                   style="max-width:280px"
                   autocomplete="off" name="benutzer-filter-suche">
            <button class="btn btn--gefuellt btn--klein" id="btn-benutzer-neu">
                <span class="material-symbols-outlined">person_add</span> ${t('admin.neuer_benutzer')}
            </button>
        </div>
        <div id="admin-benutzer-tabelle"></div>
        <div id="admin-benutzer-paginierung" style="margin-top:16px"></div>
    `;

    const suchInput = container.querySelector('#admin-benutzer-suche');
    const suchen = entprellen(() => {
        _benutzer_suche = suchInput.value.trim();
        _benutzer_seite = 1;
        _benutzer_laden(container);
    }, 300);
    suchInput.addEventListener('input', suchen);

    container.querySelector('#btn-benutzer-neu').addEventListener('click', () => {
        _benutzer_erstellen_formular(container);
    });

    _benutzer_laden(container);
}

async function _benutzer_laden(container) {
    const tabelle      = container.querySelector('#admin-benutzer-tabelle');
    const pagContainer = container.querySelector('#admin-benutzer-paginierung');

    lade_anzeige_rendern(tabelle);
    pagContainer.innerHTML = '';

    const params   = { suche: _benutzer_suche || undefined };
    const ergebnis = await apiPaginiert('admin/benutzer_liste.php', _benutzer_seite, params);

    lade_anzeige_entfernen(tabelle);

    if (!ergebnis.erfolg) {
        leer_zustand_rendern(tabelle, 'error', t('allgemein.fehler'), t('admin.fehler_benutzer_laden'));
        return;
    }

    const eintraege   = ergebnis.daten?.eintraege || [];
    const paginierung = ergebnis.daten?.paginierung;

    if (eintraege.length === 0) {
        leer_zustand_rendern(tabelle, 'people', t('admin.keine_benutzer'), t('admin.keine_benutzer_text'));
        return;
    }

    _benutzer_tabelle_rendern(tabelle, eintraege);

    if (paginierung && paginierung.gesamt_seiten > 1) {
        paginierung_rendern(pagContainer, paginierung, s => {
            _benutzer_seite = s;
            _benutzer_laden(container);
        });
    }
}

function _benutzer_tabelle_rendern(container, eintraege) {
    const eigeneId = holen('benutzer')?.id;

    let html = `
        <div class="verwaltung-tabelle-wrapper">
            <table class="verwaltung-tabelle">
                <thead>
                    <tr>
                        <th>${t('admin.tab_benutzer')}</th>
                        <th>${t('admin.th_rolle')}</th>
                        <th class="verwaltung-tabelle__mobil-versteckt">${t('admin.th_letzter_login')}</th>
                        <th>${t('admin.th_status')}</th>
                        <th>${t('admin.th_aktionen')}</th>
                    </tr>
                </thead>
                <tbody>
    `;

    for (const e of eintraege) {
        const name         = [e.vorname, e.nachname].filter(Boolean).join(' ');
        const statusKlasse = e.aktiv ? 'tag--erfolg' : 'tag--fehler';
        const statusText   = e.aktiv ? t('admin.status_aktiv') : t('admin.status_deaktiviert');
        const login        = e.letzter_login ? relativZeit(e.letzter_login) : t('admin.login_nie');

        html += `
            <tr data-benutzer-id="${e.id}" id="benutzer-zeile-${e.id}">
                <td>
                    <strong>${esc(e.benutzername)}</strong>
                    ${name ? `<br><small style="color:var(--md-sys-color-on-surface-variant)">${esc(name)}</small>` : ''}
                    ${e.email ? `<br><small style="color:var(--md-sys-color-on-surface-variant)">${esc(e.email)}</small>` : ''}
                </td>
                <td><span class="tag tag--${e.rolle}">${esc(e.rolle === 'admin' ? t('admin.rolle_admin') : t('admin.rolle_benutzer'))}</span></td>
                <td class="verwaltung-tabelle__mobil-versteckt">${login}</td>
                <td><span class="tag ${statusKlasse}">${statusText}</span></td>
                <td style="white-space:nowrap">
                    <button class="btn-icon" data-aktion="bearbeiten" data-id="${e.id}" title="${t('allgemein.bearbeiten')}">
                        <span class="material-symbols-outlined">edit</span>
                    </button>
                    <button class="btn-icon" data-aktion="passwort" data-id="${e.id}" title="${t('admin.passwort_setzen')}">
                        <span class="material-symbols-outlined">lock_reset</span>
                    </button>
                    ${e.id !== eigeneId ? `
                    <button class="btn-icon" data-aktion="loeschen" data-id="${e.id}" data-name="${esc(e.benutzername)}"
                            title="${t('allgemein.loeschen')}" style="color:var(--md-sys-color-error)">
                        <span class="material-symbols-outlined">delete</span>
                    </button>` : ''}
                </td>
            </tr>
        `;
    }

    html += '</tbody></table></div>';
    container.innerHTML = html;

    container.querySelectorAll('[data-aktion="bearbeiten"]').forEach(btn => {
        const id       = parseInt(btn.dataset.id);
        const benutzer = eintraege.find(e => e.id === id);
        if (benutzer) btn.addEventListener('click', () => _benutzer_bearbeiten_dialog(container, benutzer));
    });

    container.querySelectorAll('[data-aktion="passwort"]').forEach(btn => {
        const id       = parseInt(btn.dataset.id);
        const benutzer = eintraege.find(e => e.id === id);
        if (benutzer) btn.addEventListener('click', () => _benutzer_passwort_dialog(container, benutzer));
    });

    container.querySelectorAll('[data-aktion="loeschen"]').forEach(btn => {
        const id   = parseInt(btn.dataset.id);
        const name = btn.dataset.name;
        btn.addEventListener('click', () => _benutzer_loeschen(id, name, container));
    });
}

// --- Benutzer erstellen (Formular) ---

function _benutzer_erstellen_formular(container) {
    const formId = 'admin-benutzer-neu-form';
    const alt    = container.querySelector('#' + formId);
    if (alt) alt.remove();

    const div = document.createElement('div');
    div.id    = formId;
    div.className = 'karte';
    div.style.cssText = 'padding:20px;margin-bottom:16px';

    div.innerHTML = `
        <h3 style="margin:0 0 16px">${t('admin.neuen_benutzer_anlegen')}</h3>
        <div style="display:grid;gap:12px;grid-template-columns:1fr 1fr">
            <div class="formular-gruppe" style="margin:0">
                <label class="formular-label">${t('admin.label_benutzername')} *</label>
                <input class="eingabe" id="bnu-benutzername" type="text" placeholder="max_mustermann">
            </div>
            <div class="formular-gruppe" style="margin:0">
                <label class="formular-label">${t('admin.label_email')} *</label>
                <input class="eingabe" id="bnu-email" type="email" placeholder="max@beispiel.de">
            </div>
            <div class="formular-gruppe" style="margin:0;grid-column:1/-1">
                <label class="formular-label">${t('admin.label_passwort')} * <small style="color:var(--md-sys-color-on-surface-variant)">(${t('admin.passwort_hinweis')})</small></label>
                <input class="eingabe" id="bnu-passwort" type="password" placeholder="••••••••">
            </div>
            <div class="formular-gruppe" style="margin:0">
                <label class="formular-label">${t('admin.label_vorname')}</label>
                <input class="eingabe" id="bnu-vorname" type="text">
            </div>
            <div class="formular-gruppe" style="margin:0">
                <label class="formular-label">${t('admin.label_nachname')}</label>
                <input class="eingabe" id="bnu-nachname" type="text">
            </div>
            <div class="formular-gruppe" style="margin:0">
                <label class="formular-label">${t('admin.label_spitzname')}</label>
                <input class="eingabe" id="bnu-spitzname" type="text">
            </div>
            <div class="formular-gruppe" style="margin:0">
                <label class="formular-label">${t('admin.th_rolle')}</label>
                <select class="eingabe" id="bnu-rolle">
                    <option value="benutzer" selected>${t('admin.rolle_benutzer')}</option>
                    <option value="admin">${t('admin.rolle_admin')}</option>
                </select>
            </div>
            <div class="formular-gruppe" style="margin:0">
                <label class="formular-label">${t('admin.th_status')}</label>
                <select class="eingabe" id="bnu-aktiv">
                    <option value="1" selected>${t('admin.status_aktiv')}</option>
                    <option value="0">${t('admin.status_deaktiviert')}</option>
                </select>
            </div>

        </div>
        <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
            <button class="btn btn--text" id="bnu-abbrechen">${t('allgemein.abbrechen')}</button>
            <button class="btn btn--gefuellt" id="bnu-speichern">
                <span class="material-symbols-outlined">person_add</span> ${t('admin.erstellen')}
            </button>
        </div>
    `;

    const tabelle = container.querySelector('#admin-benutzer-tabelle');
    tabelle ? tabelle.before(div) : container.prepend(div);

    div.querySelector('#bnu-abbrechen').addEventListener('click', () => div.remove());

    div.querySelector('#bnu-speichern').addEventListener('click', async () => {
        const body = {
            benutzername:   div.querySelector('#bnu-benutzername').value.trim(),
            email:          div.querySelector('#bnu-email').value.trim(),
            passwort:       div.querySelector('#bnu-passwort').value,
            rolle:          div.querySelector('#bnu-rolle').value,
            aktiv:          div.querySelector('#bnu-aktiv').value === '1',
            vorname:        div.querySelector('#bnu-vorname').value.trim(),
            nachname:       div.querySelector('#bnu-nachname').value.trim(),
            spitzname:      div.querySelector('#bnu-spitzname').value.trim(),
        };

        if (!body.benutzername) { fehlerMsg(t('admin.benutzername_pflicht')); return; }
        if (!body.email)        { fehlerMsg(t('admin.email_pflicht')); return; }
        if (!body.passwort)     { fehlerMsg(t('admin.passwort_pflicht')); return; }

        const ergebnis = await apiPost('admin/benutzer_erstellen.php', body);
        if (ergebnis.erfolg) {
            erfolg(t('admin.benutzer_erstellt'));
            div.remove();
            _benutzer_laden(container);
        } else {
            apiFehlerAnzeigen(ergebnis);
        }
    });
}

// --- Benutzer bearbeiten ---

async function _benutzer_bearbeiten_dialog(container, benutzer) {
    const res = await apiGet(`admin/benutzer_details.php?id=${benutzer.id}`);
    if (!res.erfolg) { apiFehlerAnzeigen(res); return; }
    const b = res.daten;

    const eigeneId  = holen('benutzer')?.id;
    const istSelbst = b.id === eigeneId;

    const zeile = container.querySelector(`#benutzer-zeile-${b.id}`);
    if (!zeile) return;

    zeile.innerHTML = `
        <td colspan="5" style="padding:16px">
            <div style="display:grid;gap:12px;grid-template-columns:1fr 1fr 1fr">
                <div style="grid-column:1/-1">
                    <strong>${t('admin.bearbeite', {name: esc(b.benutzername)})}</strong>
                </div>

                <div class="formular-gruppe" style="margin:0">
                    <label class="formular-label" style="font-size:11px">${t('admin.label_email')}</label>
                    <input class="eingabe" id="bedit-email-${b.id}" type="email" value="${esc(b.email || '')}">
                </div>
                <div class="formular-gruppe" style="margin:0">
                    <label class="formular-label" style="font-size:11px">${t('admin.label_vorname')}</label>
                    <input class="eingabe" id="bedit-vorname-${b.id}" type="text" value="${esc(b.vorname || '')}">
                </div>
                <div class="formular-gruppe" style="margin:0">
                    <label class="formular-label" style="font-size:11px">${t('admin.label_nachname')}</label>
                    <input class="eingabe" id="bedit-nachname-${b.id}" type="text" value="${esc(b.nachname || '')}">
                </div>
                <div class="formular-gruppe" style="margin:0">
                    <label class="formular-label" style="font-size:11px">${t('admin.label_spitzname')}</label>
                    <input class="eingabe" id="bedit-spitzname-${b.id}" type="text" value="${esc(b.spitzname || '')}">
                </div>
                <div class="formular-gruppe" style="margin:0">
                    <label class="formular-label" style="font-size:11px">${t('admin.th_rolle')}</label>
                    <select class="eingabe" id="bedit-rolle-${b.id}" ${istSelbst ? 'disabled' : ''}>
                        <option value="benutzer" ${b.rolle === 'benutzer' ? 'selected' : ''}>${t('admin.rolle_benutzer')}</option>
                        <option value="admin"    ${b.rolle === 'admin'    ? 'selected' : ''}>${t('admin.rolle_admin')}</option>
                    </select>
                </div>
                <div class="formular-gruppe" style="margin:0">
                    <label class="formular-label" style="font-size:11px">${t('admin.th_status')}</label>
                    <select class="eingabe" id="bedit-aktiv-${b.id}">
                        <option value="1" ${b.aktiv ? 'selected' : ''}>${t('admin.status_aktiv')}</option>
                        <option value="0" ${!b.aktiv ? 'selected' : ''}>${t('admin.status_deaktiviert')}</option>
                    </select>
                </div>

            </div>
            <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
                <button class="btn btn--text btn--klein" id="bedit-abbrechen-${b.id}">${t('allgemein.abbrechen')}</button>
                <button class="btn btn--gefuellt btn--klein" id="bedit-speichern-${b.id}">${t('allgemein.speichern')}</button>
            </div>
        </td>
    `;

    zeile.querySelector(`#bedit-abbrechen-${b.id}`).addEventListener('click', () => {
        _benutzer_laden(container.closest('#admin-inhalt') || container);
    });

    zeile.querySelector(`#bedit-speichern-${b.id}`).addEventListener('click', async () => {
        const w = id => zeile.querySelector(`#${id}`);

        const bodyRolle = { benutzer_id: b.id };
        if (!istSelbst) bodyRolle.rolle = w(`bedit-rolle-${b.id}`).value;
        bodyRolle.aktiv = w(`bedit-aktiv-${b.id}`).value === '1';

        const bodyStats = {
            benutzer_id: b.id,
            email:       w(`bedit-email-${b.id}`).value.trim(),
            vorname:     w(`bedit-vorname-${b.id}`).value.trim(),
            nachname:    w(`bedit-nachname-${b.id}`).value.trim(),
            spitzname:   w(`bedit-spitzname-${b.id}`).value.trim(),
        };

        const [r1, r2] = await Promise.all([
            apiPost('admin/benutzer_aktualisieren.php', bodyRolle),
            apiPost('admin/benutzer_statistik_setzen.php', bodyStats),
        ]);

        if (r1.erfolg && r2.erfolg) {
            erfolg(t('admin.benutzer_gespeichert'));
            _benutzer_laden(container.closest('#admin-inhalt') || container);
        } else {
            if (!r1.erfolg) apiFehlerAnzeigen(r1);
            if (!r2.erfolg) apiFehlerAnzeigen(r2);
        }
    });
}

// --- Passwort setzen ---

function _benutzer_passwort_dialog(container, benutzer) {
    const pwZeileId = `pw-zeile-${benutzer.id}`;
    const alt       = container.querySelector('#' + pwZeileId);
    if (alt) { alt.remove(); return; }

    const zeile = container.querySelector(`#benutzer-zeile-${benutzer.id}`);
    if (!zeile) return;

    const tr = document.createElement('tr');
    tr.id    = pwZeileId;
    const td = document.createElement('td');
    td.colSpan = 5;
    td.style.cssText = 'padding:0';

    td.innerHTML = `
        <div style="background:var(--md-sys-color-surface-container);padding:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
            <div class="formular-gruppe" style="margin:0;flex:1;min-width:220px">
                <label class="formular-label" style="font-size:11px">${t('admin.neues_passwort_fuer', {name: esc(benutzer.benutzername)})}</label>
                <input class="eingabe" id="pw-neu-${benutzer.id}" type="password" placeholder="${t('admin.neues_passwort_placeholder')}" autocomplete="new-password">
                <small style="color:var(--md-sys-color-on-surface-variant)">${t('admin.passwort_hinweis')}</small>
            </div>
            <div style="display:flex;gap:8px">
                <button class="btn btn--text btn--klein" id="pw-abbrechen-${benutzer.id}">${t('allgemein.abbrechen')}</button>
                <button class="btn btn--gefuellt btn--klein" id="pw-setzen-${benutzer.id}">
                    <span class="material-symbols-outlined" style="font-size:16px">lock_reset</span>
                    ${t('admin.setzen')}
                </button>
            </div>
        </div>
    `;

    tr.appendChild(td);
    zeile.insertAdjacentElement('afterend', tr);

    tr.querySelector(`#pw-abbrechen-${benutzer.id}`).addEventListener('click', () => tr.remove());

    tr.querySelector(`#pw-setzen-${benutzer.id}`).addEventListener('click', async () => {
        const passwort = tr.querySelector(`#pw-neu-${benutzer.id}`).value;
        if (!passwort) { fehlerMsg(t('admin.passwort_leer')); return; }

        const bestaetigt = await bestaetigung_anzeigen(
            t('admin.passwort_setzen'),
            t('admin.passwort_setzen_text', {name: benutzer.benutzername}),
            t('admin.passwort_setzen'), t('allgemein.abbrechen'), true
        );
        if (!bestaetigt) return;

        const res = await apiPost('admin/benutzer_passwort.php', { benutzer_id: benutzer.id, passwort });
        if (res.erfolg) {
            erfolg(t('admin.passwort_gesetzt'));
            tr.remove();
        } else {
            apiFehlerAnzeigen(res);
        }
    });
}

// --- Benutzer loeschen ---

async function _benutzer_loeschen(id, name, container) {
    const bestaetigt = await bestaetigung_anzeigen(
        t('admin.benutzer_loeschen'),
        t('admin.benutzer_loeschen_text', {name}),
        t('admin.endgueltig_loeschen'), t('allgemein.abbrechen'), true
    );
    if (!bestaetigt) return;

    const res = await apiPost('admin/benutzer_loeschen.php', { benutzer_id: id });
    if (res.erfolg) {
        erfolg(t('admin.benutzer_geloescht', {name}));
        _benutzer_laden(container);
    } else {
        apiFehlerAnzeigen(res);
    }
}

function _belohnungen_tab(container) { container.innerHTML = ''; } // entfernt
function _ligen_tab(container)      { container.innerHTML = ''; } // entfernt

// ============================================================
// Tab 4: Konfiguration
// ============================================================

// Schluessel-Gruppen fuer strukturierte Darstellung (Reihenfolge = Anzeigereihenfolge)
const _KONFIG_GRUPPEN = {
    // 1. Training & Uebungsmodi — am wichtigsten, zuerst
    'admin.konfig_training': [
        'neue_vokabeln_pro_tag', 'faellige_vokabeln_anteil', 'max_faellige_fuer_neue', 'faellig_voraus_tage',
        'trotzdem_richtig_limit', 'gemischt_anteil_flexion', 'gemischt_anteil_satz',
    ],
    // 2. Lernparameter & SRS
    'admin.konfig_wiederholung': [
        'gekonnt_schwelle', 'level_aufstieg_stufe', 'level_aufstieg_prozent',
        'lernpfad_schwelle', 'rang_schwelle_formen_freischaltung',
        'rang_minimum_komplexe_formen', 'max_neue_formen_pro_sitzung',
        'wiederholt_stufe_schwelle', 'min_fragen_fuer_streak',
    ],
    // 3. Inhalte & Community-Limits
    'admin.konfig_inhalte':    ['max_private_vokabeln', 'max_gruppen_pro_user', 'max_mitglieder_pro_gruppe'],
    // 5. System & Infrastruktur
    'admin.konfig_system':     ['token_gueltig_tage', 'magic_link_gueltig_minuten', 'max_upload_mb', 'aktivitaeten_aufbewahrung_tage'],
    // 6. Backup
    'admin.konfig_backup':     ['backup_max_anzahl', 'backup_auto_intervall'],
    // 7. Mobile App
    'admin.konfig_mobile':     ['app_playstore_url'],
};

// Schluessel, die im UI versteckt bleiben (intern oder in eigener Sektion)
const _KONFIG_INTERN = ['backup_letztes_auto', 'bewertung_modus', 'standard_richtung', 'standard_schrift'];

// Fallback-Liste wenn die API keine Bilder zurückgibt (sollte selten eintreten)
const _MASKOTTCHEN_BILDER_FALLBACK = [
    'maskottchen_standard.png',
    'maskottchen_midsommar.png',
    'maskottchen_nordlicht.png',
];

// Info-Texte fuer bestimmte Gruppen (erscheinen unter dem Gruppen-Kopf)
const _KONFIG_GRUPPEN_INFO = {
    'admin.konfig_training':    'admin.konfig_info_training',
    'admin.konfig_wiederholung':'admin.konfig_info_wiederholung',
    'admin.konfig_inhalte':     'admin.konfig_info_inhalte',
    'admin.konfig_system':      'admin.konfig_info_system',
    'admin.konfig_backup':      'admin.konfig_info_backup',
    'admin.konfig_mobile':      'admin.konfig_info_mobile',
};

async function _konfiguration_tab(container) {
    container.innerHTML = '<div id="admin-konfig-liste"></div>';
    const liste = container.querySelector('#admin-konfig-liste');

    lade_anzeige_rendern(liste);

    const ergebnis = await apiGet('admin/konfiguration.php');
    lade_anzeige_entfernen(liste);

    if (!ergebnis.erfolg) {
        leer_zustand_rendern(liste, 'error', t('allgemein.fehler'), t('admin.fehler_konfig_laden'));
        return;
    }

    const eintraege = ergebnis.daten || [];

    if (eintraege.length === 0) {
        leer_zustand_rendern(liste, 'tune', t('admin.keine_konfiguration'), t('admin.keine_konfiguration_text'));
        return;
    }

    const map = Object.fromEntries(eintraege.map(e => [e.schluessel, e]));
    const zugeordnet = new Set();
    let html = '';

    for (const [gruppe, keys] of Object.entries(_KONFIG_GRUPPEN)) {
        const sichtbar = keys.filter(k => map[k] && !_KONFIG_INTERN.includes(k));
        if (sichtbar.length === 0) continue;

        html += `<div class="karte" style="padding:0;overflow:hidden;margin-bottom:16px">
            <div style="padding:12px 16px;background:var(--md-sys-color-surface-container);font-weight:600;font-size:13px;border-bottom:1px solid var(--md-sys-color-outline-variant)">${esc(t(gruppe))}</div>`;
        if (_KONFIG_GRUPPEN_INFO[gruppe]) {
            html += `<div style="padding:10px 16px;font-size:12px;color:var(--md-sys-color-on-surface-variant);background:var(--md-sys-color-surface-container-low);border-bottom:1px solid var(--md-sys-color-outline-variant)">${esc(t(_KONFIG_GRUPPEN_INFO[gruppe]))}</div>`;
        }
        for (const k of sichtbar) {
            html += _konfig_eintrag_html(map[k]);
            zugeordnet.add(k);
        }
        html += '</div>';
    }

    // Nicht zugeordnete + nicht interne Schluessel
    const sonstige = eintraege.filter(e => !zugeordnet.has(e.schluessel) && !_KONFIG_INTERN.includes(e.schluessel));
    if (sonstige.length > 0) {
        html += `<div class="karte" style="padding:0;overflow:hidden;margin-bottom:16px">
            <div style="padding:12px 16px;background:var(--md-sys-color-surface-container);font-weight:600;font-size:13px;border-bottom:1px solid var(--md-sys-color-outline-variant)">${t('admin.konfig_sonstiges')}</div>`;
        for (const e of sonstige) html += _konfig_eintrag_html(e);
        html += '</div>';
    }

    liste.innerHTML = html;

    liste.querySelectorAll('[data-konfig-speichern]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const schluessel = btn.dataset.konfigSpeichern;
            const input      = liste.querySelector(`input[data-schluessel="${schluessel}"]`);
            const wert       = input.value.trim();

            if (wert === '') { fehlerMsg(t('admin.wert_leer')); return; }

            const ergebnis = await apiPost('admin/konfiguration.php', { schluessel, wert });
            if (ergebnis.erfolg) {
                erfolg(t('admin.konfig_gespeichert'));
                input.dataset.original = wert;
                input.style.borderColor = 'var(--md-sys-color-primary)';
                setTimeout(() => input.style.borderColor = '', 1500);
            } else {
                apiFehlerAnzeigen(ergebnis);
            }
        });
    });

    // --- Pool-Gewichte (abfrage_gewichte-Tabelle) ---
    await _pool_gewichte_sektion_rendern(container);

    // --- Maskottchen-Saisons ---
    const maskottchen_sektion = document.createElement('div');
    maskottchen_sektion.style.marginTop = '24px';
    container.querySelector('#admin-konfig-liste').appendChild(maskottchen_sektion);
    await _maskottchen_sektion_rendern(maskottchen_sektion);

}

// ============================================================
// Maskottchen-Saisons — Editor-Sektion
// ============================================================

/**
 * Liest alle Felder einer Saison-Zeile aus dem DOM.
 * @param {HTMLElement} row  - <tr> oder Wrapper mit data-feld-Attributen
 * @param {number|string} rowId  - ID-Wert der data-row-Attribute
 */
function _maskottchen_zeile_lesen(row, rowId) {
    const get = (feld) => row.querySelector(`[data-feld="${feld}"][data-row="${rowId}"]`);
    return {
        name:        get('name')?.value?.trim() || '',
        von_monat:   parseInt(get('von_monat')?.value,   10) || 1,
        von_tag:     parseInt(get('von_tag')?.value,     10) || 1,
        bis_monat:   parseInt(get('bis_monat')?.value,   10) || 1,
        bis_tag:     parseInt(get('bis_tag')?.value,     10) || 1,
        bild:        get('bild')?.value        || 'maskottchen_standard.png',
        bild_dunkel: get('bild_dunkel')?.value || '',
        aktiv:       get('aktiv')?.checked     ?? true,
        reihenfolge: parseInt(get('reihenfolge')?.value, 10) || 0,
    };
}

async function _maskottchen_sektion_rendern(container) {
    lade_anzeige_rendern(container);
    const erg = await apiGet('admin/maskottchen_saisons.php');
    lade_anzeige_entfernen(container);

    if (!erg.erfolg) {
        container.innerHTML = `
            <div class="karte" style="padding:16px;margin-bottom:16px;color:var(--md-sys-color-error)">
                ${t('admin.maskottchen_fehler')}
                ${t('admin.maskottchen_migration_hinweis')}
            </div>`;
        return;
    }

    const saisons           = erg.daten?.saisons            || [];
    const verfuegbareBilder = (erg.daten?.verfuegbare_bilder?.length > 0)
        ? erg.daten.verfuegbare_bilder
        : _MASKOTTCHEN_BILDER_FALLBACK;

    const MONATE  = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

    // Aktuelles Maskottchen für heute berechnen (Client-seitig, zur Vorschau)
    const heute  = new Date();
    const heuteM = heute.getMonth() + 1;
    const heuteT = heute.getDate();
    const heuteDatum = `${String(heuteT).padStart(2,'0')}.${String(heuteM).padStart(2,'0')}.${heute.getFullYear()}`;
    let aktuell_bild = 'maskottchen_standard.png';
    let aktuell_bild_dunkel = '';
    for (const s of saisons) {
        if (!s.aktiv) continue;
        const vm = s.von_monat, vd = s.von_tag, bm = s.bis_monat, bd = s.bis_tag;
        const trifft = (vm > bm)
            ? ((heuteM > vm || (heuteM === vm && heuteT >= vd)) || (heuteM < bm || (heuteM === bm && heuteT <= bd)))
            : ((heuteM > vm || (heuteM === vm && heuteT >= vd)) && (heuteM < bm || (heuteM === bm && heuteT <= bd)));
        if (trifft) { aktuell_bild = s.bild; aktuell_bild_dunkel = s.bild_dunkel || ''; break; }
    }
    const basis   = window.location.pathname.replace(/\/index\.php$/, '').replace(/\/$/, '');
    const bildUrl = `${basis}/oeffentlich/bilder/${aktuell_bild}`;
    const bildDunkelUrl = aktuell_bild_dunkel ? `${basis}/oeffentlich/bilder/${aktuell_bild_dunkel}` : '';

    // Menschenlesbare Labels für Dateinamen erzeugen
    function bildLabel(datei) {
        if (datei === 'maskottchen_standard.png') return t('admin.msk_standard_fallback');
        const basis = datei.replace(/\.png$/i, '').replace(/^maskottchen_/, '');
        return basis.charAt(0).toUpperCase() + basis.slice(1);
    }

    // Hilfsfunktionen für wiederverwendbare Eingabe-Controls
    function monatSelect(feld, val, rowId) {
        return `<select data-feld="${feld}" data-row="${rowId}" style="width:75px;font-size:12px" class="eingabe">` +
            MONATE.map((mn, i) =>
                `<option value="${i + 1}"${val === (i + 1) ? ' selected' : ''}>${mn}</option>`
            ).join('') + `</select>`;
    }
    function tagInput(feld, val, rowId) {
        return `<input type="number" data-feld="${feld}" data-row="${rowId}" min="1" max="31" value="${val}"
                       style="width:75px;font-size:12px;text-align:center" class="eingabe">`;
    }
    function bildSelect(feld, val, rowId) {
        return `<select data-feld="${feld}" data-row="${rowId}" style="width:210px;font-size:12px" class="eingabe">` +
            verfuegbareBilder.map(datei =>
                `<option value="${datei}"${datei === val ? ' selected' : ''}>${esc(datei)}</option>`
            ).join('') + `</select>`;
    }
    function bildDunkelSelect(val, rowId) {
        return `<select data-feld="bild_dunkel" data-row="${rowId}" style="width:210px;font-size:12px" class="eingabe">` +
            `<option value=""${!val ? ' selected' : ''}>${t('admin.msk_wie_light')}</option>` +
            verfuegbareBilder.map(datei =>
                `<option value="${datei}"${datei === val ? ' selected' : ''}>${esc(datei)}</option>`
            ).join('') + `</select>`;
    }

    // Zeilen für vorhandene Saisons
    const rowsHtml = saisons.map(s => `
        <tr data-id="${s.id}" style="border-bottom:1px solid var(--md-sys-color-outline-variant)">
            <td style="padding:6px 8px">
                <input type="text" data-feld="name" data-row="${s.id}" value="${esc(s.name)}"
                       class="eingabe" style="width:96px;font-size:12px">
            </td>
            <td style="padding:6px 8px;white-space:nowrap">
                ${monatSelect('von_monat', s.von_monat, s.id)}
                &thinsp;${tagInput('von_tag', s.von_tag, s.id)}
            </td>
            <td style="padding:6px 8px;white-space:nowrap">
                ${monatSelect('bis_monat', s.bis_monat, s.id)}
                &thinsp;${tagInput('bis_tag', s.bis_tag, s.id)}
            </td>
            <td style="padding:6px 8px">${bildSelect('bild', s.bild, s.id)}</td>
            <td style="padding:6px 8px">${bildDunkelSelect(s.bild_dunkel, s.id)}</td>
            <td style="padding:6px 8px;text-align:center">
                <input type="checkbox" data-feld="aktiv" data-row="${s.id}" ${s.aktiv ? 'checked' : ''}>
            </td>
            <td style="padding:6px 8px;text-align:center">
                <input type="number" data-feld="reihenfolge" data-row="${s.id}" min="0" value="${s.reihenfolge}"
                       style="width:65px;font-size:12px;text-align:center" class="eingabe">
            </td>
            <td style="padding:6px 4px;white-space:nowrap">
                <button class="btn-icon" data-msk-speichern="${s.id}" title="Speichern">
                    <span class="material-symbols-outlined">save</span>
                </button>
                <button class="btn-icon btn-icon--gefaehrlich" data-msk-loeschen="${s.id}" title="Löschen">
                    <span class="material-symbols-outlined">delete</span>
                </button>
            </td>
        </tr>
    `).join('');

    container.innerHTML = `
        <div class="karte" style="padding:0;overflow:hidden;margin-bottom:16px">
            <div style="padding:12px 16px;background:var(--md-sys-color-surface-container);
                        font-weight:600;font-size:13px;
                        border-bottom:1px solid var(--md-sys-color-outline-variant);
                        display:flex;align-items:center;gap:10px">
                <span class="material-symbols-outlined" style="font-size:18px">calendar_month</span>
                ${t('admin.maskottchen_titel')}
            </div>
            <div style="padding:10px 16px;font-size:12px;
                        color:var(--md-sys-color-on-surface-variant);
                        background:var(--md-sys-color-surface-container-low);
                        border-bottom:1px solid var(--md-sys-color-outline-variant);
                        display:flex;align-items:center;gap:12px">
                <div style="display:flex;gap:6px;flex-shrink:0">
                    <div style="text-align:center">
                        <img src="${bildUrl}" alt="Light"
                             style="width:44px;height:44px;object-fit:contain;border-radius:8px;background:#f5f5f5">
                        <div style="font-size:10px;margin-top:2px">Light</div>
                    </div>
                    <div style="text-align:center">
                        <img src="${bildDunkelUrl || bildUrl}" alt="Dark"
                             style="width:44px;height:44px;object-fit:contain;border-radius:8px;background:#1e1e1e">
                        <div style="font-size:10px;margin-top:2px">Dark</div>
                    </div>
                </div>
                <span>
                    ${t('admin.maskottchen_heute', {datum: heuteDatum, bild: aktuell_bild})}${aktuell_bild_dunkel ? `, Dark = <strong>${esc(aktuell_bild_dunkel)}</strong>` : ` (Dark = ${t('admin.msk_wie_light')})`}
                    &nbsp;·&nbsp;
                    ${t('admin.maskottchen_reihenfolge_info')}
                </span>
            </div>
            <div style="padding:12px 16px;overflow-x:auto">
                <table style="width:100%;border-collapse:collapse;font-size:13px" id="msk-tabelle">
                    <thead>
                        <tr style="border-bottom:2px solid var(--md-sys-color-outline-variant)">
                            <th style="text-align:left;padding:6px 8px">${t('admin.th_name')}</th>
                            <th style="text-align:left;padding:6px 8px">${t('admin.th_von')}</th>
                            <th style="text-align:left;padding:6px 8px">${t('admin.th_bis')}</th>
                            <th style="text-align:left;padding:6px 8px">${t('admin.th_bild_light')}</th>
                            <th style="text-align:left;padding:6px 8px">${t('admin.th_bild_dark')}</th>
                            <th style="text-align:center;padding:6px 8px" title="Aktiv">
                                <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle">visibility</span>
                            </th>
                            <th style="text-align:center;padding:6px 8px" title="Reihenfolge (niedrig = zuerst geprüft)">
                                <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle">swap_vert</span>
                            </th>
                            <th style="padding:6px 8px"></th>
                        </tr>
                    </thead>
                    <tbody id="msk-tbody">
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>
            <div style="padding:8px 16px;border-top:1px solid var(--md-sys-color-outline-variant)">
                <button class="btn btn--text btn--klein" id="btn-msk-neu">
                    <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle">add</span>
                    ${t('admin.neue_saison')}
                </button>
            </div>
        </div>
    `;

    // Speichern — bestehende Zeile
    container.querySelectorAll('[data-msk-speichern]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id  = parseInt(btn.dataset.mskSpeichern, 10);
            const row = container.querySelector(`tr[data-id="${id}"]`);
            if (!row) return;
            const daten = _maskottchen_zeile_lesen(row, id);
            const res   = await apiPost('admin/maskottchen_saisons.php', { id, ...daten });
            if (res.erfolg) {
                erfolg(t('admin.saison_gespeichert'));
                await _maskottchen_sektion_rendern(container);
            } else {
                apiFehlerAnzeigen(res);
            }
        });
    });

    // Löschen
    container.querySelectorAll('[data-msk-loeschen]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = parseInt(btn.dataset.mskLoeschen, 10);
            const ok = await bestaetigung_anzeigen(
                t('admin.saison_loeschen'),
                t('admin.saison_loeschen_text'),
                t('allgemein.loeschen'), t('allgemein.abbrechen'), true
            );
            if (!ok) return;
            const res = await apiDelete(`admin/maskottchen_saisons.php?id=${id}`);
            if (res.erfolg) {
                erfolg(t('admin.saison_geloescht'));
                await _maskottchen_sektion_rendern(container);
            } else {
                apiFehlerAnzeigen(res);
            }
        });
    });

    // Neue Saison — Eingabezeile anhängen
    container.querySelector('#btn-msk-neu')?.addEventListener('click', () => {
        // Doppelklick verhindern
        if (container.querySelector('tr[data-id="neu"]')) return;

        const tbody = container.querySelector('#msk-tbody');
        const zeile = document.createElement('tr');
        zeile.dataset.id = 'neu';
        zeile.style.borderBottom = '1px solid var(--md-sys-color-outline-variant)';
        zeile.innerHTML = `
            <td style="padding:6px 8px">
                <input type="text" data-feld="name" data-row="neu" placeholder="${t('admin.saisonname_placeholder')}"
                       class="eingabe" style="width:96px;font-size:12px">
            </td>
            <td style="padding:6px 8px;white-space:nowrap">
                ${monatSelect('von_monat', 1, 'neu')}
                &thinsp;${tagInput('von_tag', 1, 'neu')}
            </td>
            <td style="padding:6px 8px;white-space:nowrap">
                ${monatSelect('bis_monat', 1, 'neu')}
                &thinsp;${tagInput('bis_tag', 31, 'neu')}
            </td>
            <td style="padding:6px 8px">${bildSelect('bild', 'maskottchen_standard.png', 'neu')}</td>
            <td style="padding:6px 8px">${bildDunkelSelect('', 'neu')}</td>
            <td style="padding:6px 8px;text-align:center">
                <input type="checkbox" data-feld="aktiv" data-row="neu" checked>
            </td>
            <td style="padding:6px 8px;text-align:center">
                <input type="number" data-feld="reihenfolge" data-row="neu" min="0" value="0"
                       style="width:52px;font-size:12px;text-align:center" class="eingabe">
            </td>
            <td style="padding:6px 4px;white-space:nowrap">
                <button class="btn-icon" id="btn-msk-neu-speichern" title="Hinzufügen">
                    <span class="material-symbols-outlined">add_circle</span>
                </button>
                <button class="btn-icon" id="btn-msk-neu-abbrechen" title="Abbrechen">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </td>
        `;
        tbody.appendChild(zeile);

        zeile.querySelector('#btn-msk-neu-abbrechen')?.addEventListener('click', () => zeile.remove());

        zeile.querySelector('#btn-msk-neu-speichern')?.addEventListener('click', async () => {
            const daten = _maskottchen_zeile_lesen(zeile, 'neu');
            if (!daten.name) { fehlerMsg(t('admin.name_erforderlich')); return; }
            const res = await apiPost('admin/maskottchen_saisons.php', daten);
            if (res.erfolg) {
                erfolg(t('admin.saison_angelegt'));
                await _maskottchen_sektion_rendern(container);
            } else {
                apiFehlerAnzeigen(res);
            }
        });
    });
}

function _STUFEN_LABELS() {
    return {
        0: t('admin.stufe_0'),
        1: t('admin.stufe_1'),
        2: t('admin.stufe_2'),
        3: t('admin.stufe_3'),
        4: t('admin.stufe_4'),
        5: t('admin.stufe_5'),
        6: t('admin.stufe_6'),
    };
}

async function _pool_gewichte_sektion_rendern(container) {
    const liste = container.querySelector('#admin-konfig-liste');
    if (!liste) return;

    // Platzhalter anhaengen
    const sektion = document.createElement('div');
    sektion.id = 'pool-gewichte-sektion';
    liste.appendChild(sektion);

    lade_anzeige_rendern(sektion);

    const ergebnis = await apiGet('admin/abfrage_gewichte.php');
    lade_anzeige_entfernen(sektion);

    if (!ergebnis.erfolg) {
        sektion.innerHTML = `<p style="color:var(--md-sys-color-error);padding:8px">${t('admin.pool_fehler')}</p>`;
        return;
    }

    const gewichte = ergebnis.daten || [];

    let reihen = '';
    for (const g of gewichte) {
        const label = _STUFEN_LABELS()[g.stufe] ?? `${t('admin.stufe_prefix')} ${g.stufe}`;
        reihen += `
            <div class="admin-panel__konfig-eintrag">
                <div class="admin-panel__konfig-info">
                    <span class="admin-panel__konfig-schluessel">${esc(label)}</span>
                </div>
                <div class="admin-panel__konfig-wert">
                    <input class="eingabe" type="number" min="0" step="0.1"
                           value="${esc(String(g.gewicht))}"
                           data-stufe="${g.stufe}" data-original="${esc(String(g.gewicht))}"
                           style="width:90px">
                    <button class="btn-icon" data-gewicht-speichern="${g.stufe}" title="Speichern">
                        <span class="material-symbols-outlined">save</span>
                    </button>
                </div>
            </div>`;
    }

    sektion.innerHTML = `
        <div class="karte" style="padding:0;overflow:hidden;margin-bottom:16px">
            <div style="padding:12px 16px;background:var(--md-sys-color-surface-container);font-weight:600;font-size:13px;border-bottom:1px solid var(--md-sys-color-outline-variant)">
                ${t('admin.pool_gewichte_titel')}
            </div>
            <p style="padding:10px 16px 4px;margin:0;font-size:13px;color:var(--md-sys-color-on-surface-variant)">
                ${t('admin.pool_gewichte_info')}
            </p>
            ${reihen}
        </div>`;

    sektion.querySelectorAll('[data-gewicht-speichern]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const stufe  = parseInt(btn.dataset.gewichtSpeichern, 10);
            const input  = sektion.querySelector(`input[data-stufe="${stufe}"]`);
            const gewicht = parseFloat(input.value);

            if (isNaN(gewicht) || gewicht < 0) { fehlerMsg(t('admin.gewicht_ungueltig')); return; }

            const erg = await apiPost('admin/abfrage_gewichte.php', { stufe, gewicht });
            if (erg.erfolg) {
                erfolg(t('admin.gewicht_gespeichert', {stufe: _STUFEN_LABELS()[stufe] ?? `${t('admin.stufe_prefix')} ${stufe}`}));
                input.dataset.original = String(gewicht);
                input.style.borderColor = 'var(--md-sys-color-primary)';
                setTimeout(() => input.style.borderColor = '', 1500);
            } else {
                apiFehlerAnzeigen(erg);
            }
        });
    });
}

function _konfig_eintrag_html(e) {
    return `
        <div class="admin-panel__konfig-eintrag">
            <div class="admin-panel__konfig-info">
                <span class="admin-panel__konfig-schluessel">${esc(e.schluessel)}</span>
                ${e.beschreibung ? `<span class="admin-panel__konfig-beschreibung">${esc(e.beschreibung)}</span>` : ''}
            </div>
            <div class="admin-panel__konfig-wert">
                <input class="eingabe" type="text" value="${esc(e.wert || '')}"
                       data-schluessel="${esc(e.schluessel)}" data-original="${esc(e.wert || '')}">
                <button class="btn-icon" data-konfig-speichern="${esc(e.schluessel)}" title="Speichern">
                    <span class="material-symbols-outlined">save</span>
                </button>
            </div>
        </div>
    `;
}

// ============================================================
// Tab 5: Wartung
// ============================================================

function _wartung_tab(container) {
    container.innerHTML = `
        <!-- Aktivitaeten bereinigen -->
        <div class="karte" style="padding:16px;margin-bottom:16px">
            <div class="karte__titel" style="padding:0 0 8px">${t('admin.bereinigen_titel')}</div>
            <p style="color:var(--md-sys-color-on-surface-variant);font-size:14px;margin:0 0 16px">
                ${t('admin.bereinigen_text')}
            </p>
            <button class="btn btn--umrandet" id="btn-bereinigen">
                <span class="material-symbols-outlined">cleaning_services</span>
                ${t('admin.btn_bereinigen')}
            </button>
            <div id="bereinigung-ergebnis" class="versteckt" style="margin-top:12px"></div>
        </div>

        <!-- Private Inhalte verwalten -->
        <div class="karte" style="padding:16px;margin-bottom:16px" id="karte-private-inhalte">
            <div class="karte__titel" style="padding:0 0 8px">${t('admin.private_inhalte_titel')}</div>
            <p style="color:var(--md-sys-color-on-surface-variant);font-size:14px;margin:0 0 16px">
                ${t('admin.private_inhalte_text')}
            </p>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
                <button class="btn btn--umrandet btn--klein" data-aktion="zeige-private" data-typ="vokabeln">
                    <span class="material-symbols-outlined" style="font-size:16px">lock</span>
                    ${t('admin.private_vokabeln')}
                </button>
                <button class="btn btn--umrandet btn--klein" data-aktion="zeige-private" data-typ="lektionen">
                    <span class="material-symbols-outlined" style="font-size:16px">lock</span>
                    ${t('admin.private_lektionen')}
                </button>
                <button class="btn btn--umrandet btn--klein" data-aktion="zeige-private" data-typ="saetze">
                    <span class="material-symbols-outlined" style="font-size:16px">lock</span>
                    ${t('admin.private_saetze')}
                </button>
            </div>
            <div id="private-inhalte-ergebnis"></div>
        </div>

        <!-- Datenbank-Backup -->
        <div class="karte" style="padding:16px;margin-bottom:16px">
            <div class="karte__titel" style="padding:0 0 8px">${t('admin.backup_titel')}</div>
            <p style="color:var(--md-sys-color-on-surface-variant);font-size:14px;margin:0 0 16px">
                ${t('admin.backup_text')}
            </p>

            <div style="background:var(--md-sys-color-surface-container);border-radius:8px;padding:12px;margin-bottom:16px">
                <p style="font-weight:500;font-size:13px;margin:0 0 8px">${t('admin.auto_backup')}</p>
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                    <select class="eingabe" id="backup-auto-intervall" style="max-width:220px">
                        <option value="deaktiviert">${t('admin.intervall_deaktiviert')}</option>
                        <option value="taeglich">${t('admin.intervall_taeglich')}</option>
                        <option value="woechentlich">${t('admin.intervall_woechentlich')}</option>
                    </select>
                    <button class="btn btn--umrandet btn--klein" id="btn-backup-auto-speichern">
                        <span class="material-symbols-outlined" style="font-size:16px">save</span>
                        ${t('admin.intervall_speichern')}
                    </button>
                </div>
                <small style="color:var(--md-sys-color-on-surface-variant);display:block;margin-top:8px">
                    ${t('admin.auto_backup_info')}
                </small>
            </div>

            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
                <button class="btn btn--gefuellt" id="btn-backup-erstellen">
                    <span class="material-symbols-outlined">backup</span>
                    ${t('admin.backup_jetzt')}
                </button>
                <button class="btn btn--umrandet" id="btn-backup-herunterladen">
                    <span class="material-symbols-outlined">download</span>
                    ${t('admin.backup_herunterladen')}
                </button>
            </div>

            <div id="backup-ergebnis" class="versteckt" style="margin-top:8px"></div>

            <div id="backup-liste-container">
                <div style="font-weight:500;font-size:13px;margin-bottom:8px">${t('admin.vorhandene_backups')}</div>
                <div id="backup-liste">
                    <p style="color:var(--md-sys-color-on-surface-variant);font-size:14px">${t('admin.lade_backups')}</p>
                </div>
            </div>
        </div>

        <!-- Backup Wiederherstellen -->
        <div class="karte" style="padding:16px;margin-bottom:16px">
            <div class="karte__titel" style="padding:0 0 8px">${t('admin.backup_wiederherstellen')}</div>

            <div style="background:var(--md-sys-color-error-container);border-radius:8px;padding:12px;margin-bottom:16px;display:flex;gap:8px;align-items:flex-start">
                <span class="material-symbols-outlined" style="color:var(--md-sys-color-error);flex-shrink:0;margin-top:2px">warning</span>
                <div style="font-size:13px;color:var(--md-sys-color-on-error-container);line-height:1.5">
                    <strong>${t('admin.achtung')}:</strong> ${t('admin.backup_warnung')}
                </div>
            </div>

            <!-- Quelle: vorhandenes Backup oder Datei hochladen -->
            <div style="margin-bottom:12px">
                <p style="font-weight:500;font-size:13px;margin:0 0 8px">${t('admin.backup_quelle')}</p>
                <div style="display:flex;gap:8px;margin-bottom:10px">
                    <button class="btn btn--umrandet btn--klein restore-quelle-btn restore-quelle-btn--aktiv"
                            data-quelle="vorhanden" id="btn-restore-quelle-vorhanden">
                        ${t('admin.vorhandenes_backup')}
                    </button>
                    <button class="btn btn--umrandet btn--klein restore-quelle-btn"
                            data-quelle="hochladen" id="btn-restore-quelle-hochladen">
                        <span class="material-symbols-outlined" style="font-size:16px">upload_file</span>
                        ${t('admin.datei_hochladen')}
                    </button>
                </div>

                <!-- Option A: Vorhandenes Backup aus Dropdown -->
                <div id="restore-vorhanden">
                    <select class="eingabe" id="restore-backup-auswahl" style="max-width:400px;width:100%">
                        <option value="">${t('admin.backup_auswaehlen')}</option>
                    </select>
                </div>

                <!-- Option B: Datei hochladen -->
                <div id="restore-hochladen" class="versteckt">
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                        <label class="btn btn--umrandet btn--klein" style="cursor:pointer">
                            <span class="material-symbols-outlined" style="font-size:16px">folder_open</span>
                            ${t('admin.sql_datei_waehlen')}
                            <input type="file" id="restore-datei-input" accept=".sql" style="display:none">
                        </label>
                        <span id="restore-datei-name" style="font-size:13px;color:var(--md-sys-color-on-surface-variant)">
                            ${t('admin.keine_datei')}
                        </span>
                    </div>
                    <small style="display:block;margin-top:6px;color:var(--md-sys-color-on-surface-variant)">
                        ${t('admin.max_50mb')}
                    </small>
                </div>
            </div>

            <!-- Checkbox: Konfiguration einschliessen -->
            <div style="background:var(--md-sys-color-surface-container);border-radius:8px;padding:12px;margin-bottom:16px">
                <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;user-select:none">
                    <input type="checkbox" id="restore-inkl-konfig" style="margin-top:2px;flex-shrink:0">
                    <span>
                        <strong>${t('admin.inkl_konfig')}</strong><br>
                        <span style="font-size:12px;color:var(--md-sys-color-on-surface-variant)">
                            ${t('admin.inkl_konfig_info')}
                        </span>
                    </span>
                </label>
            </div>

            <button class="btn btn--gefuellt" id="btn-restore-ausfuehren" disabled
                    style="background:var(--md-sys-color-error);color:var(--md-sys-color-on-error)">
                <span class="material-symbols-outlined">settings_backup_restore</span>
                ${t('admin.backup_wiederherstellen')}
            </button>

            <div id="restore-ergebnis" class="versteckt" style="margin-top:12px"></div>
        </div>

        <!-- System-Info -->
        <div class="karte" style="padding:16px">
            <div class="karte__titel" style="padding:0 0 8px">${t('admin.system_info')}</div>
            <div class="admin-panel__system-info">
                <div class="admin-panel__info-reihe"><span>${t('admin.app_version')}</span><span>1.0.0</span></div>
                <div class="admin-panel__info-reihe"><span>${t('admin.phase')}</span><span>8 \u2014 Feinschliff</span></div>
                <div class="admin-panel__info-reihe"><span>${t('admin.datenbank')}</span><span>MariaDB / MySQL</span></div>
                <div class="admin-panel__info-reihe"><span>${t('admin.plattform')}</span><span>Android WebView / Browser</span></div>
            </div>
        </div>
    `;

    // Bereinigen
    container.querySelector('#btn-bereinigen').addEventListener('click', async () => {
        const bestaetigt = await bestaetigung_anzeigen(
            t('admin.bereinigen_titel'),
            t('admin.bereinigen_bestaetigung_text'),
            t('admin.btn_bereinigen'), t('allgemein.abbrechen'), true
        );
        if (!bestaetigt) return;

        const ergebnis    = await apiPost('admin/aktivitaeten_bereinigen.php');
        const ergebnisDiv = container.querySelector('#bereinigung-ergebnis');
        ergebnisDiv.classList.remove('versteckt');

        if (ergebnis.erfolg) {
            const d = ergebnis.daten;
            ergebnisDiv.innerHTML = `<p style="color:var(--md-sys-color-primary);font-weight:500">
                ${t('admin.bereinigen_erfolg', {anzahl: d.geloescht, tage: d.schwelle_tage})}
            </p>`;
            erfolg(t('admin.bereinigen_erfolg', {anzahl: d.geloescht, tage: d.schwelle_tage}));
        } else {
            ergebnisDiv.innerHTML = `<p style="color:var(--md-sys-color-error)">${t('admin.bereinigen_fehler')}</p>`;
            apiFehlerAnzeigen(ergebnis);
        }
    });

    // Private Inhalte: Buttons
    container.querySelectorAll('[data-aktion="zeige-private"]').forEach(btn => {
        btn.addEventListener('click', () => _private_inhalte_laden(container, btn.dataset.typ));
    });

    // Auto-Intervall laden & speichern
    _backup_auto_intervall_laden(container);

    container.querySelector('#btn-backup-auto-speichern').addEventListener('click', async () => {
        const intervall = container.querySelector('#backup-auto-intervall').value;
        const res = await apiPost('admin/konfiguration.php', { schluessel: 'backup_auto_intervall', wert: intervall });
        if (res.erfolg) {
            erfolg(t('admin.backup_intervall_gespeichert'));
        } else {
            apiFehlerAnzeigen(res);
        }
    });

    // Backup erstellen (speichern)
    container.querySelector('#btn-backup-erstellen').addEventListener('click', async () => {
        await _backup_erstellen(container, 'speichern');
    });

    // Backup herunterladen
    container.querySelector('#btn-backup-herunterladen').addEventListener('click', async () => {
        await _backup_erstellen(container, 'download');
    });

    // Backup-Liste
    _backup_liste_laden(container);

    // --- Restore: Events ---
    _restore_events_registrieren(container);
}

// ============================================================
// Private Inhalte (Admin-Wartung)
// ============================================================

async function _private_inhalte_laden(container, typ) {
    const ergebnisDiv = container.querySelector('#private-inhalte-ergebnis');
    if (!ergebnisDiv) return;

    ergebnisDiv.innerHTML = '<p style="color:var(--md-sys-color-on-surface-variant);font-size:14px">Lade…</p>';

    let apiUrl, titelLabel;
    switch (typ) {
        case 'vokabeln':
            apiUrl     = 'vokabeln/liste.php';
            titelLabel = t('admin.private_vokabeln');
            break;
        case 'lektionen':
            apiUrl     = 'lektionen/liste.php';
            titelLabel = t('admin.private_lektionen');
            break;
        case 'saetze':
            apiUrl     = 'saetze/liste.php';
            titelLabel = t('admin.private_saetze');
            break;
        default:
            ergebnisDiv.innerHTML = '';
            return;
    }

    const params = { auch_private: 1, pro_seite: 100 };
    const erg = await apiGet(apiUrl, params);

    if (!erg.erfolg) {
        ergebnisDiv.innerHTML = `<p style="color:var(--md-sys-color-error)">${t('admin.fehler_beim_laden')}</p>`;
        apiFehlerAnzeigen(erg);
        return;
    }

    const eintraege = erg.daten?.eintraege || erg.daten || [];
    const nur_private = eintraege.filter(e => e.ist_privat);

    if (nur_private.length === 0) {
        ergebnisDiv.innerHTML = `<p style="color:var(--md-sys-color-on-surface-variant);font-size:14px">
            Keine privaten ${titelLabel.toLowerCase()} vorhanden.
        </p>`;
        return;
    }

    let html = `
        <h4 style="margin:0 0 8px;font-size:14px;font-weight:600">${esc(titelLabel)} (${nur_private.length})</h4>
        <table class="verwaltung-tabelle" style="font-size:13px;width:100%">
            <thead>
                <tr>
                    <th>${t('admin.th_inhalt')}</th>
                    <th>${t('admin.th_besitzer')}</th>
                    <th>${t('admin.th_aktion')}</th>
                </tr>
            </thead>
            <tbody>
    `;

    for (const e of nur_private) {
        let inhaltText = '';
        if (typ === 'vokabeln') {
            inhaltText = `${esc(e.schwedisch)} — ${esc(e.deutsch)} (${esc(e.wortart)})`;
        } else if (typ === 'lektionen') {
            inhaltText = esc(e.titel);
        } else if (typ === 'saetze') {
            inhaltText = `${esc(e.schwedisch_satz)} / ${esc(e.deutsch_satz)}`;
        }

        let loeschUrl = '';
        if (typ === 'vokabeln')   loeschUrl = `vokabeln/loeschen.php?id=${e.id}`;
        if (typ === 'lektionen')  loeschUrl = `lektionen/loeschen.php?id=${e.id}`;
        if (typ === 'saetze')     loeschUrl = `saetze/loeschen.php?id=${e.id}`;

        html += `
            <tr>
                <td>${inhaltText}</td>
                <td>${esc(e.besitzer_name || e.besitzer_id || '–')}</td>
                <td>
                    <button class="btn btn--text btn--klein btn--gefaehrlich"
                        data-aktion="privat-loeschen"
                        data-url="${esc(loeschUrl)}"
                        data-label="${inhaltText}"
                        title="${t('allgemein.loeschen')}">
                        <span class="material-symbols-outlined" style="font-size:16px">delete</span>
                        ${t('allgemein.loeschen')}
                    </button>
                </td>
            </tr>
        `;
    }

    html += `</tbody></table>`;
    ergebnisDiv.innerHTML = html;

    // Lösch-Handler
    ergebnisDiv.querySelectorAll('[data-aktion="privat-loeschen"]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ok = await bestaetigung_anzeigen(
                t('admin.privaten_inhalt_loeschen'),
                t('admin.privaten_inhalt_loeschen_text', {name: btn.dataset.label}),
                t('allgemein.loeschen'), t('allgemein.abbrechen'), true
            );
            if (!ok) return;

            const delErg = await apiDelete(btn.dataset.url);
            if (delErg.erfolg) {
                erfolg(t('admin.geloescht'));
                _private_inhalte_laden(container, typ);
            } else {
                apiFehlerAnzeigen(delErg);
            }
        });
    });
}

async function _backup_auto_intervall_laden(container) {
    const res = await apiGet('admin/konfiguration.php');
    if (!res.erfolg) return;

    const konfig    = res.daten || [];
    const eintrag   = konfig.find(e => e.schluessel === 'backup_auto_intervall');
    const intervall = eintrag?.wert || 'deaktiviert';

    const select = container.querySelector('#backup-auto-intervall');
    if (select) select.value = intervall;

    // Ggf. automatisches Backup ausloesen
    _backup_auto_pruefen(konfig, container);
}

async function _backup_auto_pruefen(konfig, container) {
    const map       = Object.fromEntries((konfig || []).map(e => [e.schluessel, e.wert]));
    const intervall = map['backup_auto_intervall'] || 'deaktiviert';
    const letztesAuto = map['backup_letztes_auto'] || '';

    if (intervall === 'deaktiviert') return;

    const jetzt   = new Date();
    const letztes = letztesAuto ? new Date(letztesAuto) : null;

    let faellig = false;
    if (!letztes) {
        faellig = true;
    } else if (intervall === 'taeglich') {
        faellig = (jetzt - letztes) >= 86400000;
    } else if (intervall === 'woechentlich') {
        faellig = (jetzt - letztes) >= 7 * 86400000;
    }

    if (!faellig) return;

    const res = await apiPost('admin/backup_ausfuehren.php', { modus: 'speichern' });
    if (res.erfolg) {
        await apiPost('admin/konfiguration.php', {
            schluessel: 'backup_letztes_auto',
            wert:       new Date().toISOString().slice(0, 19).replace('T', ' '),
        });
        _backup_liste_laden(container);
    }
}

async function _backup_erstellen(container, modus) {
    const ergebnisDiv = container.querySelector('#backup-ergebnis');
    ergebnisDiv.classList.add('versteckt');
    ergebnisDiv.innerHTML = '';

    // Zuerst Backup serverseitig erstellen
    const res = await apiPost('admin/backup_ausfuehren.php', { modus: 'speichern' });

    if (!res.erfolg) {
        ergebnisDiv.classList.remove('versteckt');
        ergebnisDiv.innerHTML = `<p style="color:var(--md-sys-color-error)">${t('admin.backup_fehlgeschlagen')}</p>`;
        apiFehlerAnzeigen(res);
        return;
    }

    const dateiname = res.daten?.dateiname;

    if (modus === 'download' && dateiname) {
        const url = `/vokabeltrainer/api/admin/backup_herunterladen.php?datei=${encodeURIComponent(dateiname)}`;
        await _datei_herunterladen(url, dateiname);
        erfolg(t('admin.backup_erstellt_download'));
    } else {
        ergebnisDiv.classList.remove('versteckt');
        ergebnisDiv.innerHTML = `
            <p style="color:var(--md-sys-color-primary);font-weight:500">
                ${t('admin.backup_erstellt_info', {dateiname: esc(dateiname || ''), kb: res.daten?.groesse_kb || 0})}
            </p>
        `;
        erfolg(t('admin.backup_erstellt_info', {dateiname, kb: res.daten?.groesse_kb || 0}));
    }

    _backup_liste_laden(container);
}

async function _backup_liste_laden(container) {
    const liste = container.querySelector('#backup-liste');
    if (!liste) return;

    liste.innerHTML = `<p style="color:var(--md-sys-color-on-surface-variant);font-size:14px">${t('admin.lade_backups')}</p>`;

    const res = await apiGet('admin/backup_liste.php');
    if (!res.erfolg) {
        liste.innerHTML = `<p style="color:var(--md-sys-color-error);font-size:14px">${t('admin.backup_liste_fehler')}</p>`;
        return;
    }

    const backups   = res.daten?.backups || [];
    const maxAnzahl = res.daten?.max_backups || 10;

    if (backups.length === 0) {
        liste.innerHTML = `<p style="color:var(--md-sys-color-on-surface-variant);font-size:14px">${t('admin.keine_backups')}</p>`;
        return;
    }

    let html = `
        <p style="color:var(--md-sys-color-on-surface-variant);font-size:13px;margin:0 0 8px">
            ${backups.length} von max. ${maxAnzahl} Backups vorhanden.
        </p>
        <div class="verwaltung-tabelle-wrapper">
            <table class="verwaltung-tabelle" style="font-size:13px">
                <thead><tr>
                    <th>${t('admin.th_dateiname')}</th>
                    <th>${t('admin.th_groesse')}</th>
                    <th>${t('admin.th_erstellt')}</th>
                    <th>${t('admin.th_aktion')}</th>
                </tr></thead>
                <tbody>
    `;

    for (const b of backups) {
        html += `
            <tr>
                <td><code style="font-size:11px">${esc(b.dateiname)}</code></td>
                <td>${b.groesse_kb} KB</td>
                <td>${esc(b.erstellt_am)}</td>
                <td>
                    <button class="btn-icon" data-backup-dl="${esc(b.dateiname)}" title="${t('admin.backup_herunterladen')}">
                        <span class="material-symbols-outlined">download</span>
                    </button>
                </td>
            </tr>
        `;
    }

    html += '</tbody></table></div>';
    liste.innerHTML = html;

    liste.querySelectorAll('[data-backup-dl]').forEach(btn => {
        btn.addEventListener('click', () => {
            const dateiname = btn.dataset.backupDl;
            const url = `/vokabeltrainer/api/admin/backup_herunterladen.php?datei=${encodeURIComponent(dateiname)}`;
            _datei_herunterladen(url, dateiname);
        });
    });
}

// ============================================================
// Backup Wiederherstellen — UI-Logik
// ============================================================

let _restoreUploadDateiname = '';

function _restore_events_registrieren(container) {
    const quelleVorhanden = container.querySelector('#btn-restore-quelle-vorhanden');
    const quelleHochladen = container.querySelector('#btn-restore-quelle-hochladen');
    const divVorhanden    = container.querySelector('#restore-vorhanden');
    const divHochladen    = container.querySelector('#restore-hochladen');
    const dateiInput      = container.querySelector('#restore-datei-input');
    const dateiNameSpan   = container.querySelector('#restore-datei-name');
    const auswahl         = container.querySelector('#restore-backup-auswahl');
    const btnAusfuehren   = container.querySelector('#btn-restore-ausfuehren');

    _restoreUploadDateiname = '';

    // Quellen-Toggle
    quelleVorhanden?.addEventListener('click', () => {
        quelleVorhanden.classList.add('restore-quelle-btn--aktiv');
        quelleHochladen.classList.remove('restore-quelle-btn--aktiv');
        divVorhanden?.classList.remove('versteckt');
        divHochladen?.classList.add('versteckt');
        _restoreUploadDateiname = '';
        _restore_btn_aktualisieren(container);
    });

    quelleHochladen?.addEventListener('click', () => {
        quelleHochladen.classList.add('restore-quelle-btn--aktiv');
        quelleVorhanden.classList.remove('restore-quelle-btn--aktiv');
        divHochladen?.classList.remove('versteckt');
        divVorhanden?.classList.add('versteckt');
        _restore_btn_aktualisieren(container);
    });

    // Datei-Upload
    dateiInput?.addEventListener('change', async () => {
        if (!dateiInput.files.length) return;
        const datei = dateiInput.files[0];

        if (datei.size > 50 * 1024 * 1024) {
            fehlerMsg(t('admin.datei_zu_gross'));
            dateiInput.value = '';
            return;
        }

        dateiNameSpan.textContent = `${datei.name} (${(datei.size / 1024).toFixed(1)} KB) — wird hochgeladen…`;

        const formData = new FormData();
        formData.append('datei', datei);

        try {
            const token = holen('token') || '';
            const res = await fetch('/vokabeltrainer/api/admin/backup_hochladen.php', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData,
            });
            const json = await res.json();

            if (json.erfolg) {
                _restoreUploadDateiname = json.daten.dateiname;
                dateiNameSpan.innerHTML = `<span style="color:var(--md-sys-color-primary);font-weight:500">${esc(json.daten.dateiname)}</span> (${json.daten.groesse_kb} KB) — hochgeladen`;
                erfolg(t('admin.backup_hochgeladen'));
                // Auch Backup-Liste und Dropdown aktualisieren
                _backup_liste_laden(container);
                _restore_dropdown_fuellen(container);
            } else {
                dateiNameSpan.textContent = t('admin.upload_fehlgeschlagen');
                fehlerMsg(json.fehler?.nachricht || t('admin.upload_fehlgeschlagen'));
                _restoreUploadDateiname = '';
            }
        } catch (e) {
            dateiNameSpan.textContent = t('admin.netzwerk_fehler_upload');
            fehlerMsg(t('admin.netzwerk_fehler_upload'));
            _restoreUploadDateiname = '';
        }
        dateiInput.value = '';
        _restore_btn_aktualisieren(container);
    });

    // Dropdown Change
    auswahl?.addEventListener('change', () => _restore_btn_aktualisieren(container));

    // Restore ausfuehren
    btnAusfuehren?.addEventListener('click', () => _restore_ausfuehren(container));

    // Dropdown befuellen
    _restore_dropdown_fuellen(container);
}

async function _restore_dropdown_fuellen(container) {
    const auswahl = container.querySelector('#restore-backup-auswahl');
    if (!auswahl) return;

    const res = await apiGet('admin/backup_liste.php');
    const backups = res.erfolg ? (res.daten?.backups || []) : [];

    // Aktuelle Auswahl merken
    const aktuellerWert = auswahl.value;

    auswahl.innerHTML = `<option value="">${t('admin.backup_auswaehlen')}</option>`;
    for (const b of backups) {
        const opt = document.createElement('option');
        opt.value = b.dateiname;
        opt.textContent = `${b.dateiname} (${b.groesse_kb} KB — ${b.erstellt_am})`;
        auswahl.appendChild(opt);
    }

    // Vorherige Auswahl wiederherstellen
    if (aktuellerWert) auswahl.value = aktuellerWert;

    _restore_btn_aktualisieren(container);
}

function _restore_btn_aktualisieren(container) {
    const btn = container.querySelector('#btn-restore-ausfuehren');
    if (!btn) return;

    const quelleHochladenAktiv = container.querySelector('#btn-restore-quelle-hochladen')
                                          ?.classList.contains('restore-quelle-btn--aktiv');

    if (quelleHochladenAktiv) {
        btn.disabled = !_restoreUploadDateiname;
    } else {
        const auswahl = container.querySelector('#restore-backup-auswahl');
        btn.disabled = !auswahl?.value;
    }
}

async function _restore_ausfuehren(container) {
    const quelleHochladenAktiv = container.querySelector('#btn-restore-quelle-hochladen')
                                          ?.classList.contains('restore-quelle-btn--aktiv');

    let dateiname = '';
    if (quelleHochladenAktiv) {
        dateiname = _restoreUploadDateiname;
    } else {
        dateiname = container.querySelector('#restore-backup-auswahl')?.value || '';
    }

    if (!dateiname) {
        fehlerMsg(t('admin.kein_backup_ausgewaehlt'));
        return;
    }

    const inklKonfig = container.querySelector('#restore-inkl-konfig')?.checked || false;

    // Bestaetigungs-Dialog
    const konfigHinweis = inklKonfig
        ? ' ' + t('admin.restore_konfig_ueberschrieben')
        : ' ' + t('admin.restore_konfig_erhalten');

    const bestaetigt = await bestaetigung_anzeigen(
        t('admin.backup_wiederherstellen'),
        t('admin.restore_bestaetigung_text', {dateiname}) + konfigHinweis,
        t('admin.wiederherstellen'),
        t('allgemein.abbrechen'),
        true // destruktiv
    );
    if (!bestaetigt) return;

    const btn = container.querySelector('#btn-restore-ausfuehren');
    const ergebnisDiv = container.querySelector('#restore-ergebnis');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="material-symbols-outlined">hourglass_empty</span> ${t('admin.restore_laeuft')}`;
    }

    if (ergebnisDiv) {
        ergebnisDiv.classList.remove('versteckt');
        ergebnisDiv.innerHTML = `<p style="color:var(--md-sys-color-on-surface-variant)">${t('admin.restore_bitte_warten')}</p>`;
    }

    const res = await apiPost('admin/backup_wiederherstellen.php', {
        dateiname,
        inkl_konfiguration: inklKonfig,
    });

    if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span class="material-symbols-outlined">settings_backup_restore</span> ${t('admin.backup_wiederherstellen')}`;
    }

    if (res.erfolg) {
        const d = res.daten;
        const stat = d.statistik || {};
        const hatFehler = stat.fehler && stat.fehler.length > 0;

        ergebnisDiv.innerHTML = `
            <div style="background:var(--md-sys-color-tertiary-container);border-radius:8px;padding:12px">
                <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
                    <span class="material-symbols-outlined" style="color:var(--md-sys-color-tertiary)">check_circle</span>
                    <strong>${t('admin.restore_erfolgreich')}</strong>
                </div>
                <div style="font-size:13px;color:var(--md-sys-color-on-tertiary-container)">
                    <p style="margin:0 0 4px">Quelle: <code>${esc(d.dateiname)}</code></p>
                    ${d.sicherung_erstellt ? `<p style="margin:0 0 4px">Sicherungs-Backup: <code>${esc(d.sicherung_erstellt)}</code></p>` : ''}
                    <p style="margin:0 0 4px">Tabellen: ${stat.tabellen_erstellt || 0} | Inserts: ${stat.inserts || 0}${stat.uebersprungen ? ` | Uebersprungen: ${stat.uebersprungen}` : ''}</p>
                    <p style="margin:0">Konfiguration: ${d.inkl_konfiguration ? 'ueberschrieben' : 'beibehalten'}</p>
                </div>
                ${hatFehler ? `
                    <details style="margin-top:8px">
                        <summary style="cursor:pointer;color:var(--md-sys-color-error);font-size:13px">${stat.fehler.length} Warnung(en)</summary>
                        <ul style="margin-top:4px;font-size:12px;max-height:200px;overflow-y:auto">${stat.fehler.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
                    </details>
                ` : ''}
            </div>
        `;
        erfolg(t('admin.restore_erfolg'));

        // Listen aktualisieren
        _backup_liste_laden(container);
        _restore_dropdown_fuellen(container);
    } else {
        ergebnisDiv.innerHTML = `
            <div style="background:var(--md-sys-color-error-container);border-radius:8px;padding:12px">
                <div style="display:flex;gap:8px;align-items:center">
                    <span class="material-symbols-outlined" style="color:var(--md-sys-color-error)">error</span>
                    <strong>${t('admin.restore_fehlgeschlagen')}</strong>
                </div>
                <p style="font-size:13px;margin:8px 0 0;color:var(--md-sys-color-on-error-container)">
                    ${esc(res.fehler?.nachricht || 'Unbekannter Fehler')}
                </p>
            </div>
        `;
        apiFehlerAnzeigen(res);
    }

    _restore_btn_aktualisieren(container);
}

// ============================================================
// Tab 6: SQL
// ============================================================

function _sql_tab(container) {
    container.innerHTML = `
        <div class="admin-sql">
            <div class="karte" style="margin-bottom:16px">
                <div class="karte__inhalt">
                    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:10px">
                        <h3 style="margin:0;font-size:var(--md-sys-typescale-title-medium-size)">${t('admin.sql_editor')}</h3>
                        <div style="display:flex;gap:8px">
                            <label class="btn btn--tonal btn--klein" style="cursor:pointer">
                                <span class="material-symbols-outlined">upload_file</span>
                                ${t('admin.sql_datei_laden')}
                                <input type="file" id="sql-datei-input" accept=".sql,text/plain" style="display:none">
                            </label>
                            <button class="btn btn--tonal btn--klein" id="btn-sql-leeren">
                                <span class="material-symbols-outlined">clear</span>
                                ${t('admin.sql_leeren')}
                            </button>
                        </div>
                    </div>
                    <textarea id="sql-eingabe" class="eingabe"
                        style="width:100%;min-height:220px;font-family:monospace;font-size:13px;resize:vertical;white-space:pre"
                        placeholder="SELECT * FROM benutzer;&#10;&#10;-- Mehrere Statements werden nacheinander ausgeführt&#10;UPDATE app_konfiguration SET wert = '10' WHERE schluessel = 'neue_vokabeln_pro_tag';"></textarea>
                    <div style="display:flex;gap:8px;margin-top:10px;align-items:center">
                        <button class="btn btn--gefuellt" id="btn-sql-ausfuehren">
                            <span class="material-symbols-outlined">play_arrow</span>
                            ${t('admin.sql_ausfuehren')}
                        </button>
                        <span style="font-size:12px;color:var(--md-sys-color-on-surface-variant)">
                            ${t('admin.sql_hinweis_trennen')}
                        </span>
                    </div>
                </div>
            </div>
            <div id="sql-ergebnisse"></div>
        </div>
    `;

    // Datei einlesen und in Textarea laden
    container.querySelector('#sql-datei-input').addEventListener('change', (e) => {
        const datei = e.target.files[0];
        if (!datei) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            container.querySelector('#sql-eingabe').value = ev.target.result;
        };
        reader.readAsText(datei, 'UTF-8');
        e.target.value = '';
    });

    container.querySelector('#btn-sql-leeren').addEventListener('click', () => {
        container.querySelector('#sql-eingabe').value = '';
        container.querySelector('#sql-ergebnisse').innerHTML = '';
    });

    container.querySelector('#btn-sql-ausfuehren').addEventListener('click', () => _sql_ausfuehren(container));
}

async function _sql_ausfuehren(container) {
    const sql = container.querySelector('#sql-eingabe').value.trim();
    if (!sql) { fehlerMsg(t('admin.sql_leer')); return; }

    const ergebnisDiv = container.querySelector('#sql-ergebnisse');
    ergebnisDiv.innerHTML = `<p style="color:var(--md-sys-color-on-surface-variant)">${t('admin.sql_wird_ausgefuehrt')}</p>`;

    const res = await apiPost('admin/sql_ausfuehren.php', { sql });

    if (!res.erfolg) {
        ergebnisDiv.innerHTML = '';
        apiFehlerAnzeigen(res);
        return;
    }

    const { ergebnisse, gesamt_ok, gesamt_fehler } = res.daten;

    let html = `
        <div style="display:flex;gap:16px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
            <span style="color:var(--md-sys-color-primary);font-weight:500">
                ✓ ${t('admin.sql_erfolgreich', { anzahl: gesamt_ok })}
            </span>
            ${gesamt_fehler > 0 ? `
                <span style="color:var(--md-sys-color-error);font-weight:500">
                    ✗ ${t('admin.sql_fehlgeschlagen', { anzahl: gesamt_fehler })}
                </span>
            ` : ''}
        </div>
    `;

    for (const stmt of ergebnisse) {
        if (stmt.erfolg) {
            if (stmt.typ === 'select') {
                html += _sql_select_html(stmt);
            } else {
                html += `
                    <div class="karte" style="margin-bottom:10px;border-left:3px solid var(--md-sys-color-primary)">
                        <div class="karte__inhalt" style="padding:10px 14px">
                            <code style="font-size:12px;color:var(--md-sys-color-on-surface-variant)">
                                ${esc(stmt.sql_kurz)}${stmt.sql_kurz.length >= 150 ? '…' : ''}
                            </code>
                            <p style="margin:4px 0 0;color:var(--md-sys-color-primary)">
                                ✓ ${t('admin.sql_zeilen_betroffen', { anzahl: stmt.betroffen })}
                            </p>
                        </div>
                    </div>
                `;
            }
        } else {
            html += `
                <div class="karte" style="margin-bottom:10px;border-left:3px solid var(--md-sys-color-error)">
                    <div class="karte__inhalt" style="padding:10px 14px">
                        <code style="font-size:12px;color:var(--md-sys-color-on-surface-variant)">
                            ${esc(stmt.sql_kurz)}${stmt.sql_kurz.length >= 150 ? '…' : ''}
                        </code>
                        <p style="margin:4px 0 0;color:var(--md-sys-color-error)">✗ ${esc(stmt.fehler)}</p>
                    </div>
                </div>
            `;
        }
    }

    ergebnisDiv.innerHTML = html;
}

function _sql_select_html(stmt) {
    const header = `
        <code style="font-size:12px;color:var(--md-sys-color-on-surface-variant)">
            ${esc(stmt.sql_kurz)}${stmt.sql_kurz.length >= 150 ? '…' : ''}
        </code>
        <p style="margin:4px 0 8px;color:var(--md-sys-color-primary)">
            ✓ ${t('admin.sql_zeilen_ergebnis', { anzahl: stmt.anzahl })}
            ${stmt.abgeschnitten ? ` <span style="color:var(--md-sys-color-on-surface-variant)">${t('admin.sql_max_angezeigt')}</span>` : ''}
        </p>
    `;

    if (stmt.anzahl === 0) {
        return `<div class="karte" style="margin-bottom:10px"><div class="karte__inhalt" style="padding:10px 14px">${header}<p style="color:var(--md-sys-color-on-surface-variant)">${t('admin.sql_keine_ergebnisse')}</p></div></div>`;
    }

    let tabelle = '<div style="overflow-x:auto"><table class="verwaltung-tabelle" style="font-size:12px"><thead><tr>';
    for (const sp of stmt.spalten) tabelle += `<th>${esc(sp)}</th>`;
    tabelle += '</tr></thead><tbody>';
    for (const zeile of stmt.zeilen) {
        tabelle += '<tr>';
        for (const sp of stmt.spalten) {
            const val = zeile[sp];
            tabelle += `<td>${val === null ? '<em style="color:var(--md-sys-color-outline)">NULL</em>' : esc(String(val))}</td>`;
        }
        tabelle += '</tr>';
    }
    tabelle += '</tbody></table></div>';

    return `<div class="karte" style="margin-bottom:10px"><div class="karte__inhalt" style="padding:10px 14px">${header}${tabelle}</div></div>`;
}

// ============================================================
// Tab 7: Rechtliches
// ============================================================

async function _rechtliches_tab(container) {
    container.innerHTML = `<p style="color:var(--md-sys-color-on-surface-variant);padding:16px">${t('allgemein.laden')}…</p>`;

    const res  = await apiGet('admin/rechtliches_laden.php');
    const data = res.erfolg ? res.daten : {};

    container.innerHTML = `
        <div class="admin-rechtliches">

            <!-- Systeminformationen -->
            <section class="karte" style="margin-bottom:20px">
                <div class="karte__kopf">
                    <h3 class="karte__titel">${t('admin.systeminformationen')}</h3>
                </div>
                <div class="karte__inhalt">
                    <div class="formular-feld" style="margin-bottom:12px">
                        <label class="formular-feld__label">${t('admin.app_titel')}</label>
                        <input class="eingabe" type="text" id="sys-app-titel"
                               value="${esc(data.system_titel || '')}"
                               placeholder="Vokabeltrainer Schwedisch">
                    </div>
                    <div class="formular-feld" style="margin-bottom:12px">
                        <label class="formular-feld__label">${t('admin.betreiber_name')}</label>
                        <input class="eingabe" type="text" id="sys-betreiber-name"
                               value="${esc(data.betreiber_name || '')}"
                               placeholder="Max Mustermann">
                    </div>
                    <div class="formular-feld" style="margin-bottom:16px">
                        <label class="formular-feld__label">${t('admin.kontakt_email')}</label>
                        <input class="eingabe" type="email" id="sys-betreiber-email"
                               value="${esc(data.betreiber_email || '')}"
                               placeholder="kontakt@beispiel.de">
                    </div>
                    <button class="btn btn--gefuellt btn--klein" id="btn-system-speichern">
                        <span class="material-symbols-outlined">save</span>
                        Speichern
                    </button>
                </div>
            </section>

            <!-- Impressum -->
            <section class="karte" style="margin-bottom:20px">
                <div class="karte__kopf">
                    <h3 class="karte__titel">${t('admin.impressum')}</h3>
                    <span style="font-size:12px;color:var(--md-sys-color-on-surface-variant)">HTML erlaubt · leer = Standard-Vorlage</span>
                </div>
                <div class="karte__inhalt">
                    <textarea id="rechtliches-impressum" class="eingabe"
                        style="width:100%;min-height:260px;font-family:monospace;font-size:13px;resize:vertical;white-space:pre"
                    >${esc(data.impressum_text || '')}</textarea>
                    <button class="btn btn--gefuellt btn--klein" id="btn-impressum-speichern" style="margin-top:10px">
                        <span class="material-symbols-outlined">save</span>
                        ${t('admin.impressum_speichern')}
                    </button>
                </div>
            </section>

            <!-- Datenschutz -->
            <section class="karte">
                <div class="karte__kopf">
                    <h3 class="karte__titel">${t('admin.datenschutz')}</h3>
                    <span style="font-size:12px;color:var(--md-sys-color-on-surface-variant)">HTML erlaubt · leer = Standard-Vorlage</span>
                </div>
                <div class="karte__inhalt">
                    <textarea id="rechtliches-datenschutz" class="eingabe"
                        style="width:100%;min-height:320px;font-family:monospace;font-size:13px;resize:vertical;white-space:pre"
                    >${esc(data.datenschutz_text || '')}</textarea>
                    <button class="btn btn--gefuellt btn--klein" id="btn-datenschutz-speichern" style="margin-top:10px">
                        <span class="material-symbols-outlined">save</span>
                        ${t('admin.datenschutz_speichern')}
                    </button>
                </div>
            </section>
        </div>
    `;

    container.querySelector('#btn-system-speichern').addEventListener('click', async () => {
        await _rechtliches_speichern({
            system_titel:    container.querySelector('#sys-app-titel').value,
            betreiber_name:  container.querySelector('#sys-betreiber-name').value,
            betreiber_email: container.querySelector('#sys-betreiber-email').value,
        });
    });

    container.querySelector('#btn-impressum-speichern').addEventListener('click', async () => {
        await _rechtliches_speichern({ impressum_text: container.querySelector('#rechtliches-impressum').value });
    });

    container.querySelector('#btn-datenschutz-speichern').addEventListener('click', async () => {
        await _rechtliches_speichern({ datenschutz_text: container.querySelector('#rechtliches-datenschutz').value });
    });
}

async function _rechtliches_speichern(felder) {
    const res = await apiPost('admin/rechtliches_speichern.php', felder);
    if (res.erfolg) {
        erfolg(t('allgemein.gespeichert'));
    } else {
        apiFehlerAnzeigen(res);
    }
}

// ============================================================
// Tab 8: Server-Einstellungen (DB + SMTP)
// ============================================================

async function _server_tab(container) {
    container.innerHTML = `
        <div style="max-width:720px">
            <div id="server-lade" style="text-align:center;padding:40px 0">
                <span class="material-symbols-outlined" style="font-size:40px;color:var(--md-sys-color-on-surface-variant)">sync</span>
                <p style="margin-top:8px;color:var(--md-sys-color-on-surface-variant)">${t('admin.einstellungen_laden')}</p>
            </div>
        </div>
    `;

    const res = await apiGet('admin/server_einstellungen_laden.php');
    if (!res.erfolg) {
        container.innerHTML = `<p style="color:var(--md-sys-color-error)">Fehler: ${esc(res.fehler?.nachricht || 'Unbekannter Fehler')}</p>`;
        return;
    }

    const d = res.daten;
    const db   = d.db   || {};
    const smtp = d.smtp || {};
    const allg = d.allgemein || {};
    const schreibbar = d.schreibbar !== false;

    const passwort_platzhalter = (wert) => wert === '__GESETZT__' ? '••••••••' : '';
    const passwort_title = 'Leer lassen = unveraendert behalten';

    container.innerHTML = `
        <div style="max-width:720px">
            ${!schreibbar ? `<div class="meldung meldung--warnung" style="margin-bottom:16px">
                <span class="material-symbols-outlined">warning</span>
                umgebung.php ist nicht schreibbar. Bitte Dateirechte pruefen (chmod 644 oder 666).
            </div>` : ''}

            <!-- Allgemein -->
            <section class="karte" style="margin-bottom:20px">
                <div class="karte__kopf">
                    <h3 class="karte__titel">
                        <span class="material-symbols-outlined">public</span>
                        ${t('admin.allgemein')}
                    </h3>
                </div>
                <div class="karte__inhalt">
                    <div class="formular-raster" style="display:grid;grid-template-columns:1fr 1fr;gap:12px 16px">
                        <div class="formular-gruppe" style="grid-column:1/-1">
                            <label class="formular-label" for="srv-basis-url">${t('admin.basis_url')}</label>
                            <input class="eingabe" type="text" id="srv-basis-url"
                                value="${esc(allg.basis_url || '')}"
                                placeholder="z.B. /vokabeltrainer oder leer für Root">
                            <small style="color:var(--md-sys-color-on-surface-variant)">
                                Lokal: /vokabeltrainer &nbsp;|&nbsp; Root-Domain: leer &nbsp;|&nbsp; Unterordner: /app
                            </small>
                        </div>
                        <div class="formular-gruppe">
                            <label class="formular-label" for="srv-umgebung">${t('admin.umgebung')}</label>
                            <select class="eingabe" id="srv-umgebung">
                                <option value="production" ${allg.umgebung === 'production' ? 'selected' : ''}>${t('admin.produktion')}</option>
                                <option value="development" ${allg.umgebung === 'development' ? 'selected' : ''}>${t('admin.entwicklung')}</option>
                            </select>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Datenbankverbindung -->
            <section class="karte" style="margin-bottom:20px">
                <div class="karte__kopf">
                    <h3 class="karte__titel">
                        <span class="material-symbols-outlined">storage</span>
                        ${t('admin.datenbankverbindung')}
                    </h3>
                </div>
                <div class="karte__inhalt">
                    <div class="formular-raster" style="display:grid;grid-template-columns:1fr 1fr;gap:12px 16px">
                        <div class="formular-gruppe">
                            <label class="formular-label" for="db-host">DB_HOST</label>
                            <input class="eingabe" type="text" id="db-host"
                                value="${esc(db.host || '')}" placeholder="localhost">
                        </div>
                        <div class="formular-gruppe">
                            <label class="formular-label" for="db-name">DB_NAME</label>
                            <input class="eingabe" type="text" id="db-name"
                                value="${esc(db.name || '')}" placeholder="vokabeltrainer">
                        </div>
                        <div class="formular-gruppe">
                            <label class="formular-label" for="db-user">DB_USER</label>
                            <input class="eingabe" type="text" id="db-user"
                                value="${esc(db.benutzer || '')}" placeholder="root">
                        </div>
                        <div class="formular-gruppe">
                            <label class="formular-label" for="db-pass">DB_PASS</label>
                            <input class="eingabe" type="password" id="db-pass"
                                placeholder="${db.passwort === '__GESETZT__' ? '••••••••  (unveraendert)' : 'Passwort eingeben'}"
                                title="${passwort_title}">
                        </div>
                        <div class="formular-gruppe">
                            <label class="formular-label" for="db-charset">DB_CHARSET</label>
                            <input class="eingabe" type="text" id="db-charset"
                                value="${esc(db.charset || 'utf8mb4')}" placeholder="utf8mb4">
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
                        <button class="btn btn--tonal btn--klein" id="btn-db-testen">
                            <span class="material-symbols-outlined">cable</span>
                            ${t('admin.verbindung_testen')}
                        </button>
                        <span id="db-test-ergebnis" style="align-self:center;font-size:13px"></span>
                    </div>
                </div>
            </section>

            <!-- SMTP -->
            <section class="karte" style="margin-bottom:20px">
                <div class="karte__kopf">
                    <h3 class="karte__titel">
                        <span class="material-symbols-outlined">mail</span>
                        E-Mail / SMTP (PHPMailer)
                    </h3>
                </div>
                <div class="karte__inhalt">
                    <div class="formular-raster" style="display:grid;grid-template-columns:1fr 1fr;gap:12px 16px">
                        <div class="formular-gruppe">
                            <label class="formular-label" for="smtp-host">SMTP_HOST</label>
                            <input class="eingabe" type="text" id="smtp-host"
                                value="${esc(smtp.host || '')}" placeholder="smtp.dogado.de">
                        </div>
                        <div class="formular-gruppe">
                            <label class="formular-label" for="smtp-port">SMTP_PORT</label>
                            <input class="eingabe" type="number" id="smtp-port"
                                value="${esc(String(smtp.port || '587'))}" placeholder="587" min="1" max="65535">
                        </div>
                        <div class="formular-gruppe">
                            <label class="formular-label" for="smtp-enc">${t('admin.verschluesselung')}</label>
                            <select class="eingabe" id="smtp-enc">
                                <option value="tls" ${(smtp.verschluesselung || 'tls') === 'tls' ? 'selected' : ''}>STARTTLS (Port 587)</option>
                                <option value="ssl" ${smtp.verschluesselung === 'ssl' ? 'selected' : ''}>SSL/TLS (Port 465)</option>
                                <option value="" ${smtp.verschluesselung === '' ? 'selected' : ''}>${t('admin.keine')}</option>
                            </select>
                        </div>
                        <div class="formular-gruppe">
                            <label class="formular-label" for="smtp-user">SMTP_USER</label>
                            <input class="eingabe" type="text" id="smtp-user"
                                value="${esc(smtp.benutzer || '')}" placeholder="user@domain.de"
                                autocomplete="off">
                        </div>
                        <div class="formular-gruppe">
                            <label class="formular-label" for="smtp-pass">SMTP_PASS</label>
                            <input class="eingabe" type="password" id="smtp-pass"
                                placeholder="${smtp.passwort === '__GESETZT__' ? '••••••••  (unveraendert)' : 'Passwort eingeben'}"
                                title="${passwort_title}"
                                autocomplete="new-password">
                        </div>
                        <div class="formular-gruppe">
                            <label class="formular-label" for="smtp-from">SMTP_FROM (Absender-Adresse)</label>
                            <input class="eingabe" type="email" id="smtp-from"
                                value="${esc(smtp.von || '')}" placeholder="noreply@domain.de">
                        </div>
                        <div class="formular-gruppe">
                            <label class="formular-label" for="smtp-from-name">SMTP_FROM_NAME (Absender-Name)</label>
                            <input class="eingabe" type="text" id="smtp-from-name"
                                value="${esc(smtp.von_name || 'Vokabeltrainer')}" placeholder="Vokabeltrainer">
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;align-items:center">
                        <input class="eingabe" type="email" id="smtp-test-empfaenger"
                            placeholder="Test-E-Mail an..." style="max-width:240px"
                            title="Leer = eigene Admin-E-Mail">
                        <button class="btn btn--tonal btn--klein" id="btn-smtp-testen">
                            <span class="material-symbols-outlined">send</span>
                            ${t('admin.test_email_senden')}
                        </button>
                        <span id="smtp-test-ergebnis" style="align-self:center;font-size:13px"></span>
                    </div>
                </div>
            </section>

            <!-- Speichern -->
            <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
                <button class="btn btn--gefuellt" id="btn-server-speichern" ${!schreibbar ? 'disabled title="umgebung.php nicht schreibbar"' : ''}>
                    <span class="material-symbols-outlined">save</span>
                    ${t('admin.alle_einstellungen_speichern')}
                </button>
                <span id="server-speichern-ergebnis" style="font-size:13px"></span>
            </div>
        </div>
    `;

    // DB testen
    container.querySelector('#btn-db-testen')?.addEventListener('click', async () => {
        const ergebnis_el = container.querySelector('#db-test-ergebnis');
        const btn = container.querySelector('#btn-db-testen');
        btn.disabled = true;
        ergebnis_el.textContent = '⏳ Teste…';

        const res = await apiPost('admin/db_testen.php', {
            host:     container.querySelector('#db-host').value.trim(),
            name:     container.querySelector('#db-name').value.trim(),
            user:     container.querySelector('#db-user').value.trim(),
            passwort: container.querySelector('#db-pass').value,
            charset:  container.querySelector('#db-charset').value.trim() || 'utf8mb4',
        });

        btn.disabled = false;
        if (res.erfolg) {
            ergebnis_el.style.color = 'var(--md-sys-color-tertiary)';
            ergebnis_el.textContent = '✓ ' + (res.nachricht || 'Verbindung OK');
        } else {
            ergebnis_el.style.color = 'var(--md-sys-color-error)';
            ergebnis_el.textContent = '✗ ' + (res.fehler?.nachricht || 'Verbindung fehlgeschlagen');
        }
    });

    // SMTP testen
    container.querySelector('#btn-smtp-testen')?.addEventListener('click', async () => {
        const ergebnis_el = container.querySelector('#smtp-test-ergebnis');
        const btn = container.querySelector('#btn-smtp-testen');
        btn.disabled = true;
        ergebnis_el.textContent = '⏳ Sende…';

        const an = container.querySelector('#smtp-test-empfaenger').value.trim();
        const res = await apiPost('admin/smtp_testen.php', an ? { an } : {});

        btn.disabled = false;
        if (res.erfolg) {
            ergebnis_el.style.color = 'var(--md-sys-color-tertiary)';
            ergebnis_el.textContent = '✓ ' + (res.nachricht || 'E-Mail gesendet!');
        } else {
            ergebnis_el.style.color = 'var(--md-sys-color-error)';
            ergebnis_el.textContent = '✗ ' + (res.fehler?.nachricht || 'Sendefehler');
        }
    });

    // Alles speichern
    container.querySelector('#btn-server-speichern')?.addEventListener('click', async () => {
        await _server_einstellungen_speichern(container);
    });
}

async function _server_einstellungen_speichern(container) {
    const btn     = container.querySelector('#btn-server-speichern');
    const info_el = container.querySelector('#server-speichern-ergebnis');

    btn.disabled = true;
    info_el.textContent = '⏳ Speichern…';
    info_el.style.color = '';

    // Passwortfelder: leer = unveraendert
    const db_pass_raw   = container.querySelector('#db-pass').value;
    const smtp_pass_raw = container.querySelector('#smtp-pass').value;

    const payload = {
        db: {
            host:     container.querySelector('#db-host').value.trim(),
            name:     container.querySelector('#db-name').value.trim(),
            benutzer: container.querySelector('#db-user').value.trim(),
            passwort: db_pass_raw === '' ? '__UNVERAENDERT__' : db_pass_raw,
            charset:  container.querySelector('#db-charset').value.trim() || 'utf8mb4',
        },
        smtp: {
            host:             container.querySelector('#smtp-host').value.trim(),
            port:             parseInt(container.querySelector('#smtp-port').value) || 587,
            verschluesselung: container.querySelector('#smtp-enc').value,
            benutzer:         container.querySelector('#smtp-user').value.trim(),
            passwort:         smtp_pass_raw === '' ? '__UNVERAENDERT__' : smtp_pass_raw,
            von:              container.querySelector('#smtp-from').value.trim(),
            von_name:         container.querySelector('#smtp-from-name').value.trim() || 'Vokabeltrainer',
        },
        allgemein: {
            basis_url: container.querySelector('#srv-basis-url').value.trim(),
            umgebung:  container.querySelector('#srv-umgebung').value,
        },
    };

    const res = await apiPost('admin/server_einstellungen_speichern.php', payload);

    btn.disabled = false;
    if (res.erfolg) {
        info_el.style.color = 'var(--md-sys-color-tertiary)';
        info_el.textContent = '✓ Gespeichert!';
        erfolg(t('admin.server_gespeichert'));
        // Neu laden damit neue Konstanten aus umgebung.php aktiv werden
        setTimeout(() => window.location.reload(), 1500);
    } else {
        info_el.style.color = 'var(--md-sys-color-error)';
        info_el.textContent = '✗ ' + (res.fehler?.nachricht || 'Fehler beim Speichern');
        apiFehlerAnzeigen(res);
    }
}

// i18n-Dateien-Tab
let _i18nd_module       = [];   // Namespace-Liste
let _i18nd_modul        = '';   // aktiv gewählter Namespace
let _i18nd_daten        = null; // { modul, hat_datei, de:{}, sv:{} }
let _i18nd_geaendert    = false;
let _i18nd_suche        = '';
let _i18nd_filter       = 'alle'; // 'alle' | 'fehlend'

// Tab: i18n-Dateien (file-basierter Übersetzungs-Editor)
// ============================================================

async function _i18n_dateien_tab(container) {
    container.innerHTML = '';
    lade_anzeige_rendern(container);

    const res = await apiGet('admin/i18n_dateien.php');
    lade_anzeige_entfernen(container);

    if (!res.erfolg) {
        apiFehlerAnzeigen(res);
        return;
    }

    _i18nd_module = res.daten.module || [];
    _i18n_dateien_rendern(container);
}

function _i18n_dateien_rendern(container) {
    container.innerHTML = `
        <div class="i18n-dat-layout">

            <!-- Sidebar: Modul-Liste -->
            <aside class="i18n-dat-sidebar">
                <div class="i18n-dat-sidebar__kopf">
                    <span style="font-size:0.8rem;font-weight:600;color:var(--md-sys-color-on-surface-variant);text-transform:uppercase;letter-spacing:.05em">
                        ${t('admin.i18n_dat_modul_waehlen')}
                    </span>
                    <button class="btn btn--gefuellt btn--klein" id="btn-i18nd-bauen"
                            title="${t('admin.i18n_dat_veroeffentlichen_hint')}"
                            style="margin-top:8px;width:100%">
                        <span class="material-symbols-outlined" style="font-size:16px">publish</span>
                        ${t('admin.i18n_dat_veroeffentlichen')}
                    </button>
                </div>
                <ul class="i18n-dat-modul-liste" id="i18nd-modul-liste">
                    ${_i18nd_module.map(m => _i18nd_modul_item(m)).join('')}
                </ul>
            </aside>

            <!-- Haupt-Editor -->
            <div class="i18n-dat-editor" id="i18nd-editor">
                <div style="display:flex;align-items:center;justify-content:center;height:100%;
                            color:var(--md-sys-color-on-surface-variant);font-size:0.95rem">
                    <span class="material-symbols-outlined" style="font-size:40px;display:block;margin-bottom:8px;opacity:.4">translate</span>
                </div>
                <p style="text-align:center;color:var(--md-sys-color-on-surface-variant)">
                    ${t('admin.i18n_dat_kein_modul')}
                </p>
            </div>
        </div>
    `;

    // Modul-Klick
    container.querySelectorAll('.i18nd-modul-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (_i18nd_geaendert) {
                const weiter = confirm(t('admin.i18n_dat_ungespeichert'));
                if (!weiter) return;
                _i18nd_geaendert = false;
            }
            _i18nd_modul = btn.dataset.modul;
            _i18nd_daten = null;
            _i18nd_suche = '';
            _i18nd_filter = 'alle';
            _i18n_dateien_modul_laden(container);
        });
    });

    // Veröffentlichen-Button
    container.querySelector('#btn-i18nd-bauen')?.addEventListener('click', () => _i18nd_bauen(container));

    // Falls Modul schon gewählt war, direkt laden
    if (_i18nd_modul && _i18nd_daten) {
        _i18n_editor_rendern(container);
    }
}

function _i18nd_modul_item(m) {
    const aktiv    = m.modul === _i18nd_modul ? 'i18nd-modul-btn--aktiv' : '';
    const fehlend  = m.keys_fehlend > 0;
    const vollst   = m.hat_datei && m.keys_fehlend === 0;
    const keinDatei = !m.hat_datei;

    let badge = '';
    if (keinDatei) {
        badge = `<span class="i18nd-badge i18nd-badge--neu" title="Keine JSON-Datei">JSON</span>`;
    } else if (fehlend) {
        badge = `<span class="i18nd-badge i18nd-badge--fehlend">${m.keys_fehlend}</span>`;
    } else if (vollst) {
        badge = `<span class="i18nd-badge i18nd-badge--ok">✓</span>`;
    }

    return `
        <li>
            <button class="i18nd-modul-btn ${aktiv}" data-modul="${esc(m.modul)}">
                <span class="i18nd-modul-name">${esc(m.modul)}</span>
                <span style="display:flex;align-items:center;gap:4px;font-size:0.75rem;
                             color:var(--md-sys-color-on-surface-variant)">
                    <span>${m.keys_gesamt}</span>
                    ${badge}
                </span>
            </button>
        </li>
    `;
}

async function _i18n_dateien_modul_laden(container) {
    const editor = container.querySelector('#i18nd-editor');
    if (!editor) return;
    editor.innerHTML = '';
    lade_anzeige_rendern(editor);

    const res = await apiGet('admin/i18n_dateien.php', { modul: _i18nd_modul });
    lade_anzeige_entfernen(editor);

    if (!res.erfolg) {
        apiFehlerAnzeigen(res);
        return;
    }

    _i18nd_daten = res.daten;
    _i18n_editor_rendern(container);
}

function _i18n_editor_rendern(container) {
    const editor = container.querySelector('#i18nd-editor');
    if (!editor || !_i18nd_daten) return;

    const d = _i18nd_daten;

    // Aktiven Tab in Sidebar markieren
    container.querySelectorAll('.i18nd-modul-btn').forEach(btn => {
        btn.classList.toggle('i18nd-modul-btn--aktiv', btn.dataset.modul === _i18nd_modul);
    });

    // Keys ermitteln und filtern
    const alle_keys = Object.keys(d.de || {});

    let gefiltert = alle_keys;
    if (_i18nd_filter === 'fehlend') {
        gefiltert = gefiltert.filter(k => !d.sv?.[k]?.trim());
    }
    if (_i18nd_suche.trim()) {
        const q = _i18nd_suche.toLowerCase();
        gefiltert = gefiltert.filter(k =>
            k.toLowerCase().includes(q) ||
            (d.de?.[k] || '').toLowerCase().includes(q) ||
            (d.sv?.[k] || '').toLowerCase().includes(q)
        );
    }

    const fehlend_gesamt = alle_keys.filter(k => !d.sv?.[k]?.trim()).length;

    editor.innerHTML = `
        <!-- Toolbar -->
        <div class="i18nd-toolbar">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex:1;min-width:0">
                <code style="font-size:1rem;font-weight:600;color:var(--md-sys-color-primary)">
                    ${esc(_i18nd_modul)}
                </code>
                ${d.hat_datei
                    ? `<span style="font-size:0.78rem;color:var(--md-sys-color-on-surface-variant)">
                           ${t('admin.i18n_dat_keys_gesamt', { anzahl: alle_keys.length })}
                           ${fehlend_gesamt > 0
                               ? `· <span style="color:var(--md-sys-color-error)">${t('admin.i18n_dat_keys_fehlend', { anzahl: fehlend_gesamt })}</span>`
                               : ''}
                       </span>`
                    : `<span class="i18nd-badge i18nd-badge--neu" style="font-size:0.75rem">keine JSON</span>`
                }
                <span id="i18nd-ungespeichert" style="font-size:0.78rem;color:var(--md-sys-color-tertiary);${_i18nd_geaendert ? '' : 'display:none'}">
                    ● ${t('admin.i18n_dat_ungespeichert')}
                </span>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap">
                ${d.hat_datei ? `
                    <button class="btn btn--tonal btn--klein" id="btn-i18nd-key-neu">
                        <span class="material-symbols-outlined" style="font-size:16px">add</span>
                        ${t('admin.i18n_dat_key_hinzufuegen')}
                    </button>
                    <button class="btn btn--gefuellt btn--klein" id="btn-i18nd-speichern">
                        <span class="material-symbols-outlined" style="font-size:16px">save</span>
                        ${t('admin.i18n_dat_speichern')}
                    </button>
                ` : `
                    <button class="btn btn--gefuellt btn--klein" id="btn-i18nd-erstellen">
                        <span class="material-symbols-outlined" style="font-size:16px">add_circle</span>
                        ${t('admin.i18n_dat_erstellen')}
                    </button>
                `}
            </div>
        </div>

        ${!d.hat_datei ? `
            <div style="padding:12px 0 16px;color:var(--md-sys-color-on-surface-variant);font-size:0.88rem">
                ${t('admin.i18n_dat_erstellen_hint')}
            </div>
        ` : ''}

        ${d.hat_datei ? `
            <!-- Filter-Leiste -->
            <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
                <input class="eingabe" type="search" id="i18nd-suche"
                       placeholder="${t('admin.i18n_dat_suche')}"
                       value="${esc(_i18nd_suche)}"
                       style="max-width:260px">
                <div style="display:flex;border:1px solid var(--md-sys-color-outline-variant);border-radius:8px;overflow:hidden">
                    <button class="i18nd-filter-btn ${_i18nd_filter === 'alle' ? 'i18nd-filter-btn--aktiv' : ''}"
                            data-filter="alle">${t('admin.i18n_dat_filter_alle')}</button>
                    <button class="i18nd-filter-btn ${_i18nd_filter === 'fehlend' ? 'i18nd-filter-btn--aktiv' : ''}"
                            data-filter="fehlend">${t('admin.i18n_dat_filter_fehlend')}
                        ${fehlend_gesamt > 0 ? `<span class="i18nd-badge i18nd-badge--fehlend" style="margin-left:4px">${fehlend_gesamt}</span>` : ''}
                    </button>
                </div>
                <span style="font-size:0.8rem;color:var(--md-sys-color-on-surface-variant)">
                    ${gefiltert.length !== alle_keys.length
                        ? `${gefiltert.length} / ${alle_keys.length}`
                        : t('admin.i18n_dat_keys_gesamt', { anzahl: alle_keys.length })
                    }
                </span>
            </div>

            <!-- Tabelle -->
            <div style="overflow-x:auto">
                <table class="admin-tabelle i18nd-tabelle" style="width:100%">
                    <thead>
                        <tr>
                            <th style="width:36px"></th>
                            <th style="min-width:160px">${t('admin.i18n_dat_th_key')}</th>
                            <th style="min-width:220px">${t('admin.i18n_dat_th_de')}</th>
                            <th style="min-width:220px">${t('admin.i18n_dat_th_sv')}</th>
                        </tr>
                    </thead>
                    <tbody id="i18nd-tbody">
                        ${gefiltert.length > 0
                            ? gefiltert.map(k => _i18nd_zeile(k, d)).join('')
                            : `<tr><td colspan="4" style="text-align:center;padding:24px;
                               color:var(--md-sys-color-on-surface-variant)">${t('admin.i18n_dat_keine_treffer')}</td></tr>`
                        }
                    </tbody>
                </table>
            </div>
        ` : ''}
    `;

    // Events: Filter
    editor.querySelectorAll('.i18nd-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _i18nd_filter = btn.dataset.filter;
            _i18n_editor_rendern(container);
        });
    });

    // Events: Suche
    editor.querySelector('#i18nd-suche')?.addEventListener('input', entprellen(ev => {
        _i18nd_suche = ev.target.value;
        _i18n_editor_rendern(container);
    }, 250));

    // Events: Textarea-Änderungen live in _i18nd_daten schreiben
    editor.querySelectorAll('.i18nd-input-de').forEach(ta => {
        ta.addEventListener('input', ev => {
            const k = ta.dataset.key;
            if (!_i18nd_daten.de) _i18nd_daten.de = {};
            _i18nd_daten.de[k] = ev.target.value;
            _i18nd_geaendert = true;
            _i18nd_ungespeichert_anzeigen(editor);
            _i18nd_zeile_status_aktualisieren(editor, k);
        });
    });
    editor.querySelectorAll('.i18nd-input-sv').forEach(ta => {
        ta.addEventListener('input', ev => {
            const k = ta.dataset.key;
            if (!_i18nd_daten.sv) _i18nd_daten.sv = {};
            _i18nd_daten.sv[k] = ev.target.value;
            _i18nd_geaendert = true;
            _i18nd_ungespeichert_anzeigen(editor);
            _i18nd_zeile_status_aktualisieren(editor, k);
        });
    });

    // Events: Key löschen
    editor.querySelectorAll('.btn-i18nd-del').forEach(btn => {
        btn.addEventListener('click', () => {
            const k = btn.dataset.key;
            if (!confirm(`Key "${_i18nd_modul}.${k}" löschen?`)) return;
            delete _i18nd_daten.de[k];
            delete _i18nd_daten.sv[k];
            _i18nd_geaendert = true;
            _i18n_editor_rendern(container);
        });
    });

    // Speichern
    editor.querySelector('#btn-i18nd-speichern')?.addEventListener('click', () => _i18nd_speichern(container));

    // Erstellen (neue JSON-Datei)
    editor.querySelector('#btn-i18nd-erstellen')?.addEventListener('click', () => _i18nd_erstellen(container));

    // Neuer Key
    editor.querySelector('#btn-i18nd-key-neu')?.addEventListener('click', () => _i18nd_key_neu_dialog(container));
}

function _i18nd_zeile(key, d) {
    const de_val  = d.de?.[key] ?? '';
    const sv_val  = d.sv?.[key] ?? '';
    const sv_leer = !sv_val.trim();

    return `
        <tr class="i18nd-row${sv_leer ? ' i18nd-row--fehlend' : ''}" data-key="${esc(key)}">
            <td>
                <button class="btn--icon btn-i18nd-del" data-key="${esc(key)}"
                        title="${t('admin.i18n_dat_key_loeschen')}" style="color:var(--md-sys-color-error)">
                    <span class="material-symbols-outlined" style="font-size:17px">delete</span>
                </button>
            </td>
            <td>
                <code style="font-size:0.8rem;word-break:break-all">
                    <span style="opacity:.5">${esc(_i18nd_modul)}.</span>${esc(key)}
                </code>
            </td>
            <td>
                <textarea class="eingabe i18nd-input-de" data-key="${esc(key)}"
                          rows="2" style="width:100%;resize:vertical;font-size:0.85rem">${esc(de_val)}</textarea>
            </td>
            <td>
                <textarea class="eingabe i18nd-input-sv ${sv_leer ? 'i18nd-input--fehlend' : ''}"
                          data-key="${esc(key)}"
                          rows="2" style="width:100%;resize:vertical;font-size:0.85rem"
                          placeholder="${sv_leer ? '⚠ fehlt' : ''}">${esc(sv_val)}</textarea>
            </td>
        </tr>
    `;
}

function _i18nd_ungespeichert_anzeigen(editor) {
    const el = editor.querySelector('#i18nd-ungespeichert');
    if (el) el.style.display = '';
}

function _i18nd_zeile_status_aktualisieren(editor, key) {
    const row = editor.querySelector(`tr[data-key="${CSS.escape(key)}"]`);
    if (!row) return;
    const sv_val = _i18nd_daten?.sv?.[key] ?? '';
    const sv_leer = !sv_val.trim();
    row.classList.toggle('i18nd-row--fehlend', sv_leer);
    const svInput = row.querySelector('.i18nd-input-sv');
    if (svInput) {
        svInput.classList.toggle('i18nd-input--fehlend', sv_leer);
        svInput.placeholder = sv_leer ? '⚠ fehlt' : '';
    }
}

async function _i18nd_speichern(container) {
    if (!_i18nd_daten) return;
    const btn = container.querySelector('#btn-i18nd-speichern');
    if (btn) { btn.disabled = true; btn.textContent = t('allgemein.laden'); }

    const res = await apiPost('admin/i18n_dateien.php?aktion=speichern', {
        modul: _i18nd_modul,
        de:    _i18nd_daten.de || {},
        sv:    _i18nd_daten.sv || {},
    });

    if (btn) { btn.disabled = false; btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px">save</span> ${t('admin.i18n_dat_speichern')}`; }

    if (res.erfolg) {
        _i18nd_geaendert = false;
        _i18nd_daten.hat_datei = true;
        // Sidebar-Zähler aktualisieren
        const m = _i18nd_module.find(x => x.modul === _i18nd_modul);
        if (m && res.daten) {
            m.hat_datei    = true;
            m.keys_gesamt  = res.daten.keys_gesamt ?? m.keys_gesamt;
            m.keys_fehlend = res.daten.keys_fehlend ?? 0;
        }
        erfolg(t('admin.i18n_dat_gespeichert'));
        _i18n_editor_rendern(container);
        _i18nd_sidebar_aktualisieren(container);
    } else {
        apiFehlerAnzeigen(res);
    }
}

async function _i18nd_erstellen(container) {
    const btn = container.querySelector('#btn-i18nd-erstellen');
    if (btn) btn.disabled = true;

    const res = await apiPost('admin/i18n_dateien.php?aktion=erstellen', {
        modul: _i18nd_modul,
    });

    if (btn) btn.disabled = false;

    if (res.erfolg) {
        erfolg(t('admin.i18n_dat_erstellt', {
            keys:   res.daten?.keys_de ?? 0,
            module: 1,
        }));
        // Modul neu laden
        _i18nd_daten = null;
        const m = _i18nd_module.find(x => x.modul === _i18nd_modul);
        if (m) { m.hat_datei = true; m.keys_gesamt = res.daten?.keys_de ?? 0; m.keys_fehlend = 0; }
        _i18nd_sidebar_aktualisieren(container);
        await _i18n_dateien_modul_laden(container);
    } else {
        apiFehlerAnzeigen(res);
    }
}

async function _i18nd_bauen(container) {
    const btn = container.querySelector('#btn-i18nd-bauen');
    if (btn) { btn.disabled = true; btn.textContent = t('allgemein.laden'); }

    const res = await apiPost('admin/i18n_dateien.php?aktion=bauen', {});

    if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px">publish</span> ${t('admin.i18n_dat_veroeffentlichen')}`;
    }

    if (res.erfolg) {
        erfolg(t('admin.i18n_dat_veroeffentlicht', {
            keys:   res.daten?.keys_de ?? 0,
            module: res.daten?.module_count ?? 0,
        }));
    } else {
        apiFehlerAnzeigen(res);
    }
}

function _i18nd_key_neu_dialog(container) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px';
    overlay.innerHTML = `
        <div style="background:var(--md-sys-color-surface);color:var(--md-sys-color-on-surface);
                    border-radius:16px;padding:24px;max-width:480px;width:100%">
            <h3 style="margin:0 0 16px">${t('admin.i18n_dat_key_hinzufuegen')}</h3>
            <label style="display:block;margin-bottom:12px">
                <span style="font-size:.85rem;color:var(--md-sys-color-on-surface-variant)">
                    Key <em style="opacity:.6">(nur Kleinbuchstaben + Unterstriche)</em>
                </span>
                <div style="display:flex;align-items:center;gap:4px;margin-top:4px">
                    <code style="opacity:.5;font-size:.9rem">${esc(_i18nd_modul)}.</code>
                    <input class="eingabe" id="neuer-key-name" style="flex:1"
                           placeholder="${t('admin.i18n_dat_neuer_key')}"
                           pattern="[a-z0-9_]+" autocomplete="off">
                </div>
            </label>
            <label style="display:block;margin-bottom:12px">
                <span style="font-size:.85rem;color:var(--md-sys-color-on-surface-variant)">${t('admin.i18n_dat_th_de')}</span>
                <textarea class="eingabe" id="neuer-key-de" rows="2" style="width:100%;margin-top:4px"></textarea>
            </label>
            <label style="display:block;margin-bottom:16px">
                <span style="font-size:.85rem;color:var(--md-sys-color-on-surface-variant)">${t('admin.i18n_dat_th_sv')}</span>
                <textarea class="eingabe" id="neuer-key-sv" rows="2" style="width:100%;margin-top:4px"></textarea>
            </label>
            <div style="display:flex;gap:8px;justify-content:flex-end">
                <button class="btn btn--text" id="key-neu-cancel">${t('allgemein.abbrechen')}</button>
                <button class="btn btn--gefuellt" id="key-neu-ok">${t('admin.i18n_dat_key_hinzufuegen')}</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    setTimeout(() => overlay.querySelector('#neuer-key-name')?.focus(), 80);
    overlay.querySelector('#key-neu-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', ev => { if (ev.target === overlay) overlay.remove(); });

    overlay.querySelector('#key-neu-ok').addEventListener('click', () => {
        const raw  = overlay.querySelector('#neuer-key-name').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
        const de   = overlay.querySelector('#neuer-key-de').value;
        const sv   = overlay.querySelector('#neuer-key-sv').value;

        if (!raw) {
            overlay.querySelector('#neuer-key-name').focus();
            return;
        }
        if (_i18nd_daten.de?.[raw] !== undefined) {
            fehlerMsg(`Key "${raw}" existiert bereits.`);
            return;
        }

        if (!_i18nd_daten.de) _i18nd_daten.de = {};
        if (!_i18nd_daten.sv) _i18nd_daten.sv = {};
        _i18nd_daten.de[raw] = de;
        _i18nd_daten.sv[raw] = sv;
        _i18nd_geaendert = true;
        _i18nd_suche = '';
        _i18nd_filter = 'alle';
        overlay.remove();
        _i18n_editor_rendern(container);

        // Neue Zeile scrollen
        setTimeout(() => {
            const row = container.querySelector(`tr[data-key="${CSS.escape(raw)}"]`);
            row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    });
}

function _i18nd_sidebar_aktualisieren(container) {
    const liste = container.querySelector('#i18nd-modul-liste');
    if (liste) {
        liste.innerHTML = _i18nd_module.map(m => _i18nd_modul_item(m)).join('');
        liste.querySelectorAll('.i18nd-modul-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (_i18nd_geaendert) {
                    const weiter = confirm(t('admin.i18n_dat_ungespeichert'));
                    if (!weiter) return;
                    _i18nd_geaendert = false;
                }
                _i18nd_modul = btn.dataset.modul;
                _i18nd_daten = null;
                _i18nd_suche = '';
                _i18nd_filter = 'alle';
                _i18n_dateien_modul_laden(container);
            });
        });
    }
}
