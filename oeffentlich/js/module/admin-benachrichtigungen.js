/**
 * admin-benachrichtigungen.js
 *
 * Eigenständige Admin-Seite zur Verwaltung aller konfigurierbaren
 * Push-Benachrichtigungen der Android-App.
 *
 * Gruppen-Tabs:
 *   Täglich     — Übungserinnerung, Streak-Warnung
 *   Einmalig    — Update-Hinweise u.ä. (aus einer Liste)
 *   Milestones  — XP / Streak / Vokabeln / Level
 *
 * Pro Eintrag:
 *   - Titel + Text bearbeiten
 *   - Parameter (Uhrzeit / Schwellenwert) einstellen
 *   - Aktiv/Inaktiv umschalten
 *   - Neuen Eintrag erstellen
 *   - Eintrag löschen (mit Bestätigung)
 */

import { apiGet, apiPost } from '../api-client.js';
import { esc } from '../hilfs-funktionen.js';
import { lade_anzeige_rendern, lade_anzeige_entfernen } from '../komponenten/lade-anzeige.js';
import { leer_zustand_rendern } from '../komponenten/leer-zustand.js';
import { bestaetigung_anzeigen } from '../komponenten/bestaetigung-dialog.js';
import { erfolg, fehler as fehlerMsg, apiFehlerAnzeigen } from '../benachrichtigungen.js';
import { t } from '../dienste/sprache.js';

// ============================================
// Modul-Zustand
// ============================================

let _wrapper    = null;
let _aktiver_tab = 'taeglich';
let _daten      = [];   // Cache: alle geladenen Einträge

// ============================================
// Exports
// ============================================

export async function rendern() {
    const container = document.getElementById('inhalt');
    if (!container) return;

    container.innerHTML = '';
    _wrapper = document.createElement('div');
    _wrapper.className = 'ab';          // ab = admin-benachrichtigungen
    container.appendChild(_wrapper);

    await _wrapper_befuellen();
}

/**
 * Rendert die Benachrichtigungs-Verwaltung in einen bestehenden Container.
 * Wird aus dem Admin-Konfiguration-Tab heraus aufgerufen.
 * @param {HTMLElement} container
 */
export async function rendern_in(container) {
    _wrapper = document.createElement('div');
    _wrapper.className = 'ab';
    container.appendChild(_wrapper);

    await _wrapper_befuellen();
}

async function _wrapper_befuellen() {
    _wrapper.innerHTML = `
        <div class="ab__kopf">
            <h2>
                <span class="material-symbols-outlined">notifications_active</span>
                ${t('admin_benachrichtigungen.titel')}
            </h2>
            <p class="ab__beschreibung">
                ${t('admin_benachrichtigungen.beschreibung')}
            </p>
        </div>

        <div class="ab__tabs">
            <button class="ab__tab ab__tab--aktiv" data-tab="taeglich">
                <span class="material-symbols-outlined">schedule</span>
                <span>${t('admin_benachrichtigungen.tab_taeglich')}</span>
            </button>
            <button class="ab__tab" data-tab="einmalig">
                <span class="material-symbols-outlined">campaign</span>
                <span>${t('admin_benachrichtigungen.tab_einmalig')}</span>
            </button>
            <button class="ab__tab" data-tab="milestone">
                <span class="material-symbols-outlined">emoji_events</span>
                <span>${t('admin_benachrichtigungen.tab_milestones')}</span>
            </button>
        </div>

        <div id="ab-inhalt"></div>
    `;

    _wrapper.querySelectorAll('.ab__tab').forEach(tab => {
        tab.addEventListener('click', () => {
            _wrapper.querySelectorAll('.ab__tab').forEach(tb => tb.classList.remove('ab__tab--aktiv'));
            tab.classList.add('ab__tab--aktiv');
            _aktiver_tab = tab.dataset.tab;
            _tab_rendern();
        });
    });

    await _daten_laden();
}

export function aufraeumen() {
    _wrapper     = null;
    _aktiver_tab = 'taeglich';
    _daten       = [];
}

// ============================================
// Daten laden
// ============================================

async function _daten_laden() {
    const inhalt = _wrapper?.querySelector('#ab-inhalt');
    if (!inhalt) return;
    lade_anzeige_rendern(inhalt);

    const res = await apiGet('admin/benachrichtigungen.php');
    lade_anzeige_entfernen(inhalt);

    if (!res.erfolg) {
        leer_zustand_rendern(inhalt, 'error', t('allgemein.fehler'), t('admin_benachrichtigungen.fehler_laden'));
        return;
    }

    _daten = res.daten || [];
    _tab_rendern();
}

// ============================================
// Tab-Dispatcher
// ============================================

function _tab_rendern() {
    const inhalt = _wrapper?.querySelector('#ab-inhalt');
    if (!inhalt) return;
    inhalt.innerHTML = '';
    _liste_rendern(inhalt, _aktiver_tab);
}

// ============================================
// Liste rendern
// ============================================

function _liste_rendern(container, typ) {
    const eintraege = _daten.filter(e => e.typ === typ);

    const kopf = document.createElement('div');
    kopf.className = 'ab__liste-kopf';
    kopf.innerHTML = `
        <span class="ab__zaehler">${t('admin_benachrichtigungen.eintraege_zaehler', {anzahl: eintraege.length})}</span>
        <button class="btn btn--gefuellt btn--klein" id="btn-ab-neu">
            <span class="material-symbols-outlined">add</span> ${t('admin_benachrichtigungen.neu')}
        </button>
    `;
    container.appendChild(kopf);
    kopf.querySelector('#btn-ab-neu').addEventListener('click', () => {
        _formular_neu_anzeigen(container, typ);
    });

    if (eintraege.length === 0) {
        leer_zustand_rendern(container, 'notifications_off',
            t('admin_benachrichtigungen.keine_eintraege'),
            t('admin_benachrichtigungen.keine_eintraege_text'));
        return;
    }

    const liste = document.createElement('div');
    liste.className = 'ab__liste';
    container.appendChild(liste);

    eintraege.forEach(e => {
        liste.appendChild(_karte_erstellen(e));
    });
}

// ============================================
// Einzelkarte
// ============================================

function _karte_erstellen(eintrag) {
    const karte = document.createElement('div');
    karte.className = `ab__karte${eintrag.aktiv ? '' : ' ab__karte--inaktiv'}`;
    karte.dataset.id = eintrag.id;

    karte.innerHTML = `
        <div class="ab__karte-kopf">
            <div class="ab__karte-meta">
                <span class="ab__badge ab__badge--${eintrag.kanal}">${_kanal_label(eintrag.kanal)}</span>
                <code class="ab__schluessel">${esc(eintrag.schluessel)}</code>
            </div>
            <div class="ab__karte-aktionen">
                <label class="einstellungen__schalter" title="${eintrag.aktiv ? t('admin_benachrichtigungen.deaktivieren') : t('admin_benachrichtigungen.aktivieren')}">
                    <input type="checkbox" class="ab__toggle" ${eintrag.aktiv ? 'checked' : ''}>
                    <span class="einstellungen__schalter-thumb"></span>
                </label>
                <button class="btn-icon ab__btn-bearbeiten" title="${t('allgemein.bearbeiten')}">
                    <span class="material-symbols-outlined">edit</span>
                </button>
                <button class="btn-icon ab__btn-loeschen" title="${t('allgemein.loeschen')}">
                    <span class="material-symbols-outlined" style="color:var(--md-sys-color-error)">delete</span>
                </button>
            </div>
        </div>

        <div class="ab__karte-inhalt">
            <div class="ab__bezeichnung">${esc(eintrag.bezeichnung)}</div>
            <div class="ab__vorschau">
                <div class="ab__vorschau-titel">${esc(eintrag.titel)}</div>
                <div class="ab__vorschau-text">${esc(eintrag.text)}</div>
            </div>
            ${_parameter_anzeige(eintrag)}
            ${eintrag.beschreibung ? `
                <div class="ab__hinweis">${esc(eintrag.beschreibung)}</div>
            ` : ''}
        </div>

        <div class="ab__formular" style="display:none"></div>
    `;

    // Toggle aktiv/inaktiv
    karte.querySelector('.ab__toggle').addEventListener('change', async (ev) => {
        const aktiv = ev.target.checked;
        const res = await apiPost('admin/benachrichtigungen.php', {
            aktion: 'status', id: eintrag.id, aktiv
        });
        if (res.erfolg) {
            eintrag.aktiv = aktiv;
            karte.classList.toggle('ab__karte--inaktiv', !aktiv);
            erfolg(aktiv ? t('admin_benachrichtigungen.aktiviert', {name: eintrag.bezeichnung}) : t('admin_benachrichtigungen.deaktiviert_msg', {name: eintrag.bezeichnung}));
        } else {
            ev.target.checked = !aktiv;  // rückgängig
            apiFehlerAnzeigen(res);
        }
    });

    // Bearbeiten
    karte.querySelector('.ab__btn-bearbeiten').addEventListener('click', () => {
        _formular_bearbeiten_anzeigen(karte, eintrag);
    });

    // Löschen
    karte.querySelector('.ab__btn-loeschen').addEventListener('click', async () => {
        const bestaetigt = await bestaetigung_anzeigen({
            titel:   t('admin_benachrichtigungen.loeschen_titel'),
            text:    t('admin_benachrichtigungen.loeschen_text', {name: eintrag.bezeichnung}),
            bestaetigen: t('allgemein.loeschen'),
            abbrechen:   t('allgemein.abbrechen'),
            gefaehrlich: true,
        });
        if (!bestaetigt) return;

        const res = await apiPost('admin/benachrichtigungen.php', {
            aktion: 'loeschen', id: eintrag.id
        });
        if (res.erfolg) {
            _daten = _daten.filter(d => d.id !== eintrag.id);
            karte.remove();
            erfolg(t('admin_benachrichtigungen.geloescht'));
        } else {
            apiFehlerAnzeigen(res);
        }
    });

    return karte;
}

// ============================================
// Inline-Bearbeitungs-Formular
// ============================================

function _formular_bearbeiten_anzeigen(karte, eintrag) {
    const formDiv = karte.querySelector('.ab__formular');
    const inhaltDiv = karte.querySelector('.ab__karte-inhalt');

    // Toggle: wenn bereits offen, schließen
    if (formDiv.style.display !== 'none') {
        formDiv.style.display = 'none';
        inhaltDiv.style.display = '';
        return;
    }

    inhaltDiv.style.display = 'none';
    formDiv.style.display = '';
    formDiv.innerHTML = _formular_html(eintrag, false);
    _formular_events_binden(formDiv, eintrag, karte, inhaltDiv);
}

function _formular_neu_anzeigen(container, typ) {
    // Bestehende Neu-Formulare entfernen
    container.querySelector('.ab__formular-neu')?.remove();

    const div = document.createElement('div');
    div.className = 'ab__formular-neu karte';
    div.style.padding = '16px';
    div.style.marginBottom = '16px';

    const vorlage = {
        id: null, schluessel: '', bezeichnung: '', typ,
        kanal: _standard_kanal(typ), titel: '', text: '',
        parameter_1: typ === 'taeglich' ? '20:00' : '',
        parameter_2: '',
        beschreibung: '', aktiv: true,
    };

    div.innerHTML = `
        <div style="font-weight:600;font-size:14px;margin-bottom:12px">
            <span class="material-symbols-outlined" style="vertical-align:middle;font-size:18px;margin-right:4px">add_circle</span>
            ${t('admin_benachrichtigungen.neue_benachrichtigung', {typ: _typ_label(typ)})}
        </div>
        ${_formular_html(vorlage, true)}
    `;

    // Vor der Liste einfügen
    const liste = container.querySelector('.ab__liste');
    container.insertBefore(div, liste || null);

    _formular_events_binden(div, vorlage, null, null, () => div.remove());
}

// ============================================
// Formular-HTML
// ============================================

function _formular_html(e, istNeu) {
    const istTaeglich  = e.typ === 'taeglich';
    const istEinmalig  = e.typ === 'einmalig';
    const istMilestone = e.typ === 'milestone';

    return `
        <div class="ab__formular-felder">
            ${istNeu ? `
                <div class="ab__feld">
                    <label class="ab__label">${t('admin_benachrichtigungen.label_schluessel')}</label>
                    <input class="eingabe" type="text" name="schluessel"
                        value="${esc(e.schluessel)}"
                        placeholder="z.B. einmalig_update_2_0"
                        style="font-family:monospace">
                    <span class="ab__feld-hint">${t('admin_benachrichtigungen.hint_schluessel')}</span>
                </div>
            ` : ''}

            <div class="ab__feld">
                <label class="ab__label">${t('admin_benachrichtigungen.label_bezeichnung')}</label>
                <input class="eingabe" type="text" name="bezeichnung"
                    value="${esc(e.bezeichnung)}" placeholder="z.B. Update-Hinweis Version 2.0">
            </div>

            ${istNeu ? `
                <div class="ab__feld ab__feld--halb">
                    <label class="ab__label">${t('admin_benachrichtigungen.label_kanal')}</label>
                    <select class="eingabe" name="kanal">
                        ${['training','streak','einmalig','milestone'].map(k =>
                            `<option value="${k}" ${e.kanal === k ? 'selected' : ''}>${_kanal_label(k)}</option>`
                        ).join('')}
                    </select>
                </div>
            ` : ''}

            <div class="ab__feld">
                <label class="ab__label">${t('admin_benachrichtigungen.label_titel')}</label>
                <input class="eingabe" type="text" name="titel"
                    value="${esc(e.titel)}" placeholder="📚 Kurzer, aufmerksamkeitsstarker Titel">
            </div>

            <div class="ab__feld">
                <label class="ab__label">${t('admin_benachrichtigungen.label_text')}</label>
                <textarea class="eingabe" name="text" rows="2"
                    placeholder="Ausführlicherer Text der Benachrichtigung..."
                    style="resize:vertical">${esc(e.text)}</textarea>
            </div>

            ${istTaeglich ? `
                <div class="ab__feld ab__feld--halb">
                    <label class="ab__label">${t('admin_benachrichtigungen.label_uhrzeit')}</label>
                    <input class="eingabe" type="time" name="parameter_1"
                        value="${esc(e.parameter_1 || '20:00')}">
                    <span class="ab__feld-hint">${t('admin_benachrichtigungen.hint_uhrzeit')}</span>
                </div>
            ` : ''}

            ${istEinmalig ? `
                <div class="ab__feld ab__feld--halb">
                    <label class="ab__label">${t('admin_benachrichtigungen.label_datum')}</label>
                    <input class="eingabe" type="datetime-local" name="parameter_1"
                        value="${esc(e.parameter_1 || '')}">
                    <span class="ab__feld-hint">${t('admin_benachrichtigungen.hint_datum')}</span>
                </div>
            ` : ''}

            ${istMilestone ? `
                <div class="ab__feld-gruppe">
                    <div class="ab__feld ab__feld--halb">
                        <label class="ab__label">${t('admin_benachrichtigungen.label_milestone_typ')}</label>
                        <select class="eingabe" name="parameter_1">
                            ${['xp','streak','vokabeln','level'].map(mt =>
                                `<option value="${mt}" ${e.parameter_1 === mt ? 'selected' : ''}>${_milestone_typ_label(mt)}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="ab__feld ab__feld--halb">
                        <label class="ab__label">${t('admin_benachrichtigungen.label_schwellenwert')}</label>
                        <input class="eingabe" type="number" name="parameter_2"
                            value="${esc(e.parameter_2 || '')}" min="1" placeholder="z.B. 1000">
                        <span class="ab__feld-hint">${t('admin_benachrichtigungen.hint_schwellenwert')}</span>
                    </div>
                </div>
            ` : ''}

            <div class="ab__feld">
                <label class="ab__label">${t('admin_benachrichtigungen.label_beschreibung')}</label>
                <input class="eingabe" type="text" name="beschreibung"
                    value="${esc(e.beschreibung || '')}"
                    placeholder="Erklärung für andere Admins">
            </div>
        </div>

        <div class="ab__formular-aktionen">
            <button class="btn btn--gefuellt btn--klein ab__btn-speichern">
                <span class="material-symbols-outlined">save</span>
                ${istNeu ? t('admin_benachrichtigungen.erstellen') : t('allgemein.speichern')}
            </button>
            <button class="btn btn--tonal btn--klein ab__btn-abbrechen">
                ${t('allgemein.abbrechen')}
            </button>
        </div>
    `;
}

function _formular_events_binden(formDiv, eintrag, karte, inhaltDiv, onAbbrechen) {
    formDiv.querySelector('.ab__btn-abbrechen').addEventListener('click', () => {
        if (onAbbrechen) {
            onAbbrechen();
        } else {
            formDiv.style.display = 'none';
            if (inhaltDiv) inhaltDiv.style.display = '';
        }
    });

    formDiv.querySelector('.ab__btn-speichern').addEventListener('click', async () => {
        const werte = _formular_lesen(formDiv);

        if (!werte.titel?.trim()) { fehlerMsg(t('admin_benachrichtigungen.titel_erforderlich')); return; }
        if (!werte.text?.trim())  { fehlerMsg(t('admin_benachrichtigungen.text_erforderlich'));  return; }

        const istNeu = !eintrag.id;

        if (istNeu) {
            if (!werte.schluessel?.trim()) { fehlerMsg(t('admin_benachrichtigungen.schluessel_erforderlich')); return; }
            if (!werte.bezeichnung?.trim()){ fehlerMsg(t('admin_benachrichtigungen.bezeichnung_erforderlich')); return; }
        }

        const payload = istNeu
            ? { aktion: 'erstellen', typ: eintrag.typ, ...werte }
            : { aktion: 'aktualisieren', id: eintrag.id, ...werte };

        const res = await apiPost('admin/benachrichtigungen.php', payload);

        if (!res.erfolg) {
            apiFehlerAnzeigen(res);
            return;
        }

        erfolg(istNeu ? t('admin_benachrichtigungen.erstellt_erfolg') : t('admin_benachrichtigungen.gespeichert'));

        // Daten neu laden und Tab neu rendern
        await _daten_laden();
    });
}

function _formular_lesen(formDiv) {
    const werte = {};
    formDiv.querySelectorAll('[name]').forEach(el => {
        werte[el.name] = el.value;
    });
    return werte;
}

// ============================================
// Hilfsfunktionen
// ============================================

function _parameter_anzeige(e) {
    if (!e.parameter_1 && !e.parameter_2) return '';

    let text = '';
    if (e.typ === 'taeglich') {
        text = `⏰ Uhrzeit: <strong>${esc(e.parameter_1)}</strong>`;
    } else if (e.typ === 'einmalig') {
        text = e.parameter_1
            ? `📅 Geplant: <strong>${esc(e.parameter_1)}</strong>`
            : `📅 Sofort beim App-Start`;
    } else if (e.typ === 'milestone') {
        const typ = _milestone_typ_label(e.parameter_1 || '');
        text = `🎯 ${typ} ≥ <strong>${esc(e.parameter_2 || '?')}</strong>`;
    }

    return `<div class="ab__parameter">${text}</div>`;
}

function _kanal_label(kanal) {
    const map = {
        training:  t('admin_benachrichtigungen.kanal_training'),
        streak:    t('admin_benachrichtigungen.kanal_streak'),
        einmalig:  t('admin_benachrichtigungen.kanal_einmalig'),
        milestone: t('admin_benachrichtigungen.kanal_milestone'),
    };
    return map[kanal] || kanal;
}

function _typ_label(typ) {
    const map = {
        taeglich:  t('admin_benachrichtigungen.tab_taeglich'),
        einmalig:  t('admin_benachrichtigungen.tab_einmalig'),
        milestone: t('admin_benachrichtigungen.tab_milestones'),
    };
    return map[typ] || typ;
}

function _milestone_typ_label(typ) {
    const map = {
        xp:       'XP',
        streak:   t('admin_benachrichtigungen.milestone_streak'),
        vokabeln: t('admin_benachrichtigungen.milestone_vokabeln'),
        level:    'Level',
    };
    return map[typ] || typ;
}

function _standard_kanal(typ) {
    const map = { taeglich: 'training', einmalig: 'einmalig', milestone: 'milestone' };
    return map[typ] || 'einmalig';
}

// ============================================
// CSS (einmalig injiziert)
// ============================================

export function stil_einfuegen() {
    if (document.getElementById('ab-stil')) return;
    const s = document.createElement('style');
    s.id = 'ab-stil';
    s.textContent = `
/* ── Wrapper & Kopf ── */
.ab { max-width: 900px; }

.ab__kopf { margin-bottom: 24px; }
.ab__kopf h2 {
    display: flex; align-items: center; gap: 10px;
    font-size: var(--md-sys-typescale-headline-small-size);
    font-weight: 500; margin: 0 0 6px;
}
.ab__kopf h2 .material-symbols-outlined { font-size: 28px; color: var(--md-sys-color-primary); }
.ab__beschreibung { color: var(--md-sys-color-on-surface-variant); font-size: 14px; margin: 0; }

/* ── Tabs ── */
.ab__tabs {
    display: flex; gap: 0;
    border-bottom: 2px solid var(--md-sys-color-outline-variant);
    margin-bottom: 24px; overflow-x: auto;
}
.ab__tab {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 20px; background: none; border: none; cursor: pointer;
    font-size: 14px; font-weight: 500;
    color: var(--md-sys-color-on-surface-variant);
    border-bottom: 2px solid transparent; margin-bottom: -2px;
    transition: color 0.2s, border-color 0.2s; white-space: nowrap;
}
.ab__tab:hover { color: var(--md-sys-color-on-surface); }
.ab__tab--aktiv { color: var(--md-sys-color-primary); border-bottom-color: var(--md-sys-color-primary); }
.ab__tab .material-symbols-outlined { font-size: 20px; }

/* ── Listen-Kopf ── */
.ab__liste-kopf {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 12px;
}
.ab__zaehler { font-size: 13px; color: var(--md-sys-color-on-surface-variant); }

/* ── Karte ── */
.ab__liste { display: flex; flex-direction: column; gap: 12px; }
.ab__karte {
    background: var(--md-sys-color-surface-container);
    border-radius: 12px; overflow: hidden;
    border: 1px solid var(--md-sys-color-outline-variant);
    transition: opacity 0.2s;
}
.ab__karte--inaktiv { opacity: 0.55; }

.ab__karte-kopf {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px;
    background: var(--md-sys-color-surface-container-high);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    gap: 8px;
}
.ab__karte-meta { display: flex; align-items: center; gap: 8px; min-width: 0; }
.ab__karte-aktionen { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }

/* ── Badge / Schlüssel ── */
.ab__badge {
    font-size: 11px; font-weight: 600; padding: 2px 8px;
    border-radius: 10px; text-transform: uppercase; letter-spacing: 0.5px;
    white-space: nowrap;
}
.ab__badge--training  { background: rgba(37,99,235,0.15); color: #60a5fa; }
.ab__badge--streak    { background: rgba(234,88,12,0.15);  color: #fb923c; }
.ab__badge--einmalig  { background: rgba(124,58,237,0.15); color: #a78bfa; }
.ab__badge--milestone { background: rgba(234,179,8,0.15);  color: #facc15; }

.ab__schluessel {
    font-family: monospace; font-size: 12px;
    color: var(--md-sys-color-on-surface-variant);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* ── Karte-Inhalt ── */
.ab__karte-inhalt { padding: 12px 14px; }
.ab__bezeichnung  { font-weight: 600; font-size: 14px; margin-bottom: 10px; }

.ab__vorschau {
    background: var(--md-sys-color-surface-container-highest);
    border-radius: 8px; padding: 10px 12px; margin-bottom: 8px;
    border-left: 3px solid var(--md-sys-color-primary);
}
.ab__vorschau-titel { font-weight: 500; font-size: 13px; margin-bottom: 3px; }
.ab__vorschau-text  { font-size: 12px; color: var(--md-sys-color-on-surface-variant); line-height: 1.4; }

.ab__parameter {
    font-size: 12px; color: var(--md-sys-color-on-surface-variant);
    margin-bottom: 6px;
}
.ab__hinweis {
    font-size: 11px; color: var(--md-sys-color-on-surface-variant);
    font-style: italic; margin-top: 4px;
    padding: 6px 8px; background: var(--md-sys-color-surface-variant);
    border-radius: 6px;
}

/* ── Formular ── */
.ab__formular { padding: 12px 14px; background: var(--md-sys-color-surface-container-low);
    border-top: 1px solid var(--md-sys-color-outline-variant); }

.ab__formular-felder { display: flex; flex-direction: column; gap: 12px; }
.ab__feld { display: flex; flex-direction: column; gap: 4px; }
.ab__feld-gruppe { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.ab__feld--halb { max-width: 280px; }
.ab__label { font-size: 13px; font-weight: 500; color: var(--md-sys-color-on-surface-variant); }
.ab__feld-hint { font-size: 11px; color: var(--md-sys-color-on-surface-variant); }

.ab__formular-aktionen {
    display: flex; gap: 8px; margin-top: 14px; padding-top: 12px;
    border-top: 1px solid var(--md-sys-color-outline-variant);
}

/* ── Neu-Formular ── */
.ab__formular-neu { border: 2px dashed var(--md-sys-color-primary); }

@media (max-width: 600px) {
    .ab__feld-gruppe { grid-template-columns: 1fr; }
    .ab__feld--halb { max-width: 100%; }
    .ab__schluessel { max-width: 120px; }
}
    `;
    document.head.appendChild(s);
}
