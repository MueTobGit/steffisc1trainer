/**
 * Synonyme — Verwaltung von Synonymen pro Vokabel
 *
 * Zeigt eine durchsuchbare Liste aller Vokabeln und ermöglicht das
 * Hinzufügen/Entfernen von englischen und deutschen Synonymen pro Vokabel.
 * Synonyme werden im Training als alternative richtige Antworten akzeptiert.
 */

import { apiGet, apiPost } from '../api-client.js';
import { esc } from '../hilfs-funktionen.js';
import { navigieren } from '../router.js';
import { erfolg, fehler, apiFehlerAnzeigen } from '../benachrichtigungen.js';
import { lade_anzeige_rendern, lade_anzeige_entfernen } from '../komponenten/lade-anzeige.js';
import { t } from '../dienste/sprache.js';

const PRO_SEITE = 25;

let _seite = 1;
let _suche = '';
let _gesamt = 0;
let _suchTimer = null;

// Offene Vokabeln: { [vokabelId]: { synonyme: [{synonym, sprache}], geaendert: bool } }
const _offen = {};

export async function rendern(params) {
    const container = document.getElementById('inhalt');
    if (!container) return;

    _seite = 1;
    _suche = '';
    _gesamt = 0;

    container.innerHTML = `
        <div class="synonyme-seite">
            <div class="synonyme-kopf">
                <h2>${t('synonyme.titel')}</h2>
                <p class="synonyme-beschreibung">${t('synonyme.beschreibung')}</p>
            </div>

            <div class="synonyme-suche-zeile">
                <div class="eingabe-icon-wrapper" style="flex:1;max-width:420px">
                    <span class="material-symbols-outlined eingabe-icon">search</span>
                    <input type="search" class="eingabe eingabe--icon" id="syn-suche"
                        placeholder="${t('synonyme.suche_placeholder')}"
                        value="">
                </div>
            </div>

            <div id="syn-liste-container"></div>
        </div>
    `;

    document.getElementById('syn-suche')?.addEventListener('input', e => {
        clearTimeout(_suchTimer);
        _suchTimer = setTimeout(() => {
            _suche = e.target.value.trim();
            _seite = 1;
            _liste_laden();
        }, 300);
    });

    await _liste_laden();
}

async function _liste_laden() {
    const container = document.getElementById('syn-liste-container');
    if (!container) return;

    lade_anzeige_rendern(container);

    try {
        const res = await apiGet('vokabeln/liste.php', {
            suche: _suche,
            seite: _seite,
            pro_seite: PRO_SEITE,
        });

        lade_anzeige_entfernen(container);

        if (!res.erfolg) {
            apiFehlerAnzeigen(res);
            container.innerHTML = '';
            return;
        }

        const eintraege = res.daten?.eintraege || [];
        _gesamt = res.daten?.paginierung?.gesamt || 0;
        const seiten_gesamt = Math.ceil(_gesamt / PRO_SEITE);

        if (eintraege.length === 0) {
            container.innerHTML = `
                <div class="leer-zustand" style="margin-top:32px">
                    <span class="material-symbols-outlined leer-zustand__icon">search_off</span>
                    <p>${t('synonyme.keine_ergebnisse')}</p>
                </div>`;
            return;
        }

        let html = `<div class="synonyme-liste">`;
        for (const vok of eintraege) {
            html += _vokabel_reihe_html(vok);
        }
        html += `</div>`;

        // Paginierung
        if (seiten_gesamt > 1) {
            html += `<div class="synonyme-paginierung">`;
            if (_seite > 1) {
                html += `<button class="btn btn--umrandet" id="syn-zurueck">← ${t('allgemein.zurueck')}</button>`;
            }
            html += `<span class="synonyme-seite-info">${t('synonyme.seite_info', { seite: _seite, gesamt: seiten_gesamt })}</span>`;
            if (_seite < seiten_gesamt) {
                html += `<button class="btn btn--umrandet" id="syn-weiter">${t('allgemein.weiter')} →</button>`;
            }
            html += `</div>`;
        }

        container.innerHTML = html;

        // Events für expandierbare Reihen
        container.querySelectorAll('.syn-reihe-kopf').forEach(kopf => {
            kopf.addEventListener('click', () => {
                const vokId = parseInt(kopf.dataset.vokId, 10);
                _reihe_umschalten(vokId);
            });
        });

        document.getElementById('syn-zurueck')?.addEventListener('click', () => {
            _seite--;
            _liste_laden();
        });

        document.getElementById('syn-weiter')?.addEventListener('click', () => {
            _seite++;
            _liste_laden();
        });

    } catch (_) {
        lade_anzeige_entfernen(container);
        container.innerHTML = `<p style="color:var(--md-sys-color-error)">${t('allgemein.fehler_laden')}</p>`;
    }
}

function _vokabel_reihe_html(vok) {
    const id = vok.id;
    return `
        <div class="syn-reihe" id="syn-reihe-${id}">
            <div class="syn-reihe-kopf" data-vok-id="${id}">
                <div class="syn-reihe-vokabel">
                    <span class="syn-reihe-englisch">${esc(vok.englisch)}</span>
                    <span class="syn-reihe-trenner">/</span>
                    <span class="syn-reihe-deutsch">${esc(vok.deutsch)}</span>
                    ${vok.wortart ? `<span class="syn-reihe-wortart">${esc(vok.wortart)}</span>` : ''}
                </div>
                <span class="material-symbols-outlined syn-reihe-pfeil" id="syn-pfeil-${id}">expand_more</span>
            </div>
            <div class="syn-reihe-editor versteckt" id="syn-editor-${id}"></div>
        </div>
    `;
}

async function _reihe_umschalten(vokId) {
    const editor = document.getElementById(`syn-editor-${vokId}`);
    const pfeil = document.getElementById(`syn-pfeil-${vokId}`);
    if (!editor) return;

    const istOffen = !editor.classList.contains('versteckt');

    if (istOffen) {
        editor.classList.add('versteckt');
        if (pfeil) pfeil.textContent = 'expand_more';
        return;
    }

    // Auf- und Synonyme laden falls noch nicht geladen
    editor.classList.remove('versteckt');
    if (pfeil) pfeil.textContent = 'expand_less';

    if (!_offen[vokId]) {
        editor.innerHTML = `<div style="padding:12px 16px"><span class="material-symbols-outlined" style="font-size:18px;animation:rotation 1s linear infinite">sync</span></div>`;
        try {
            const res = await apiGet(`vokabeln/details.php?id=${vokId}`);
            if (!res.erfolg) {
                editor.innerHTML = `<p style="padding:12px;color:var(--md-sys-color-error)">${t('allgemein.fehler_laden')}</p>`;
                return;
            }
            const synonyme = (res.daten.synonyme || []).map(s => ({ synonym: s.synonym, sprache: s.sprache }));
            _offen[vokId] = { synonyme, geaendert: false };
        } catch (_) {
            editor.innerHTML = `<p style="padding:12px;color:var(--md-sys-color-error)">${t('allgemein.fehler_laden')}</p>`;
            return;
        }
    }

    _editor_rendern(vokId);
}

function _editor_rendern(vokId) {
    const editor = document.getElementById(`syn-editor-${vokId}`);
    if (!editor || !_offen[vokId]) return;

    const syn = _offen[vokId].synonyme;
    const en_liste = syn.filter(s => s.sprache === 'en');
    const de_liste = syn.filter(s => s.sprache === 'de');

    editor.innerHTML = `
        <div class="syn-editor-inhalt">
            <div class="syn-editor-gruppe">
                <div class="syn-editor-gruppe-titel">${t('synonyme.en_synonyme')}</div>
                <div class="syn-editor-gruppe-hinweis">${t('synonyme.en_hinweis')}</div>
                <div class="syn-chips" id="syn-en-chips-${vokId}">
                    ${_chips_html(en_liste, vokId, 'en')}
                </div>
                <div class="syn-editor-eingabe-reihe">
                    <input type="text" class="eingabe eingabe--klein" id="syn-en-input-${vokId}"
                        placeholder="${t('synonyme.en_placeholder')}" style="flex:1">
                    <button class="btn btn--text btn--klein" data-syn-add-en="${vokId}">
                        <span class="material-symbols-outlined" style="font-size:16px">add</span>
                        ${t('allgemein.hinzufuegen')}
                    </button>
                </div>
            </div>

            <div class="syn-editor-gruppe" style="margin-top:12px">
                <div class="syn-editor-gruppe-titel">${t('synonyme.de_synonyme')}</div>
                <div class="syn-editor-gruppe-hinweis">${t('synonyme.de_hinweis')}</div>
                <div class="syn-chips" id="syn-de-chips-${vokId}">
                    ${_chips_html(de_liste, vokId, 'de')}
                </div>
                <div class="syn-editor-eingabe-reihe">
                    <input type="text" class="eingabe eingabe--klein" id="syn-de-input-${vokId}"
                        placeholder="${t('synonyme.de_placeholder')}" style="flex:1">
                    <button class="btn btn--text btn--klein" data-syn-add-de="${vokId}">
                        <span class="material-symbols-outlined" style="font-size:16px">add</span>
                        ${t('allgemein.hinzufuegen')}
                    </button>
                </div>
            </div>

            <div class="syn-editor-aktionen">
                <button class="btn btn--gefuellt btn--klein" data-syn-speichern="${vokId}">
                    <span class="material-symbols-outlined" style="font-size:18px">save</span>
                    ${t('allgemein.speichern')}
                </button>
            </div>
        </div>
    `;

    // EN hinzufügen
    const enBtn = editor.querySelector(`[data-syn-add-en="${vokId}"]`);
    const enInput = document.getElementById(`syn-en-input-${vokId}`);
    enBtn?.addEventListener('click', () => _synonym_hinzufuegen(vokId, enInput, 'en'));
    enInput?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); _synonym_hinzufuegen(vokId, enInput, 'en'); }
    });

    // DE hinzufügen
    const deBtn = editor.querySelector(`[data-syn-add-de="${vokId}"]`);
    const deInput = document.getElementById(`syn-de-input-${vokId}`);
    deBtn?.addEventListener('click', () => _synonym_hinzufuegen(vokId, deInput, 'de'));
    deInput?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); _synonym_hinzufuegen(vokId, deInput, 'de'); }
    });

    // Entfernen-Buttons
    editor.querySelectorAll('[data-syn-entfernen]').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.synEntfernen, 10);
            _offen[vokId].synonyme.splice(idx, 1);
            _offen[vokId].geaendert = true;
            _editor_rendern(vokId);
        });
    });

    // Speichern
    const speichernBtn = editor.querySelector(`[data-syn-speichern="${vokId}"]`);
    speichernBtn?.addEventListener('click', () => _speichern(vokId, speichernBtn));
}

function _chips_html(liste, vokId, sprache) {
    if (liste.length === 0) {
        return `<span class="syn-leer-hinweis">${t('synonyme.keine')}</span>`;
    }
    // Alle-Synonyme-Indizes im vollen Array ermitteln
    const alleIdx = _offen[vokId].synonyme;
    return liste.map(s => {
        const idx = alleIdx.indexOf(s);
        return `
            <span class="syn-chip syn-chip--${sprache}">
                ${esc(s.synonym)}
                <button type="button" class="syn-chip-entfernen" data-syn-entfernen="${idx}" title="${t('allgemein.entfernen')}">
                    <span class="material-symbols-outlined" style="font-size:14px">close</span>
                </button>
            </span>
        `;
    }).join('');
}

function _synonym_hinzufuegen(vokId, input, sprache) {
    if (!input || !_offen[vokId]) return;
    const wert = input.value.trim();
    if (!wert) return;

    // Duplikat prüfen
    const bereits = _offen[vokId].synonyme.some(
        s => s.sprache === sprache && s.synonym.toLowerCase() === wert.toLowerCase()
    );
    if (bereits) {
        input.value = '';
        return;
    }

    _offen[vokId].synonyme.push({ synonym: wert, sprache });
    _offen[vokId].geaendert = true;
    input.value = '';
    _editor_rendern(vokId);

    // Fokus zurück auf das Input
    setTimeout(() => {
        document.getElementById(`syn-${sprache}-input-${vokId}`)?.focus();
    }, 50);
}

async function _speichern(vokId, btn) {
    if (!_offen[vokId]) return;

    const original = btn?.innerHTML || '';
    if (btn) { btn.disabled = true; btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px;animation:rotation 1s linear infinite">sync</span>`; }

    const synonyme = _offen[vokId].synonyme.filter(s => s.synonym.trim());

    try {
        const res = await apiPost(`vokabeln/synonyme_speichern.php?id=${vokId}`, { synonyme });
        if (res.erfolg) {
            _offen[vokId].geaendert = false;
            // Gespeicherte Daten aktualisieren
            _offen[vokId].synonyme = (res.daten || []).map(s => ({ synonym: s.synonym, sprache: s.sprache }));
            _editor_rendern(vokId);
            erfolg(t('synonyme.gespeichert'));
        } else {
            apiFehlerAnzeigen(res);
        }
    } catch (_) {
        fehler(t('allgemein.fehler_speichern'));
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = original; }
    }
}

export function aufraeumen() {}

export function stil_einfuegen() {
    if (document.getElementById('synonyme-stil')) return;
    const stil = document.createElement('style');
    stil.id = 'synonyme-stil';
    stil.textContent = `
        .synonyme-seite {
            max-width: 860px;
        }

        .synonyme-kopf {
            margin-bottom: 20px;
        }

        .synonyme-kopf h2 {
            font-size: var(--md-sys-typescale-headline-small-size);
            font-weight: 500;
            margin-bottom: 4px;
        }

        .synonyme-beschreibung {
            color: var(--md-sys-color-on-surface-variant);
            margin: 0;
        }

        .synonyme-suche-zeile {
            display: flex;
            gap: 12px;
            align-items: center;
            margin-bottom: 20px;
        }

        .synonyme-liste {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        /* Vokabel-Reihe */
        .syn-reihe {
            background: var(--md-sys-color-surface-container-low);
            border-radius: var(--vt-radius-mittel);
            overflow: hidden;
        }

        .syn-reihe-kopf {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 12px 16px;
            cursor: pointer;
            transition: background var(--vt-uebergang);
            user-select: none;
        }

        .syn-reihe-kopf:hover {
            background: var(--md-sys-color-surface-container);
        }

        .syn-reihe-vokabel {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
            flex: 1;
            min-width: 0;
        }

        .syn-reihe-englisch {
            font-weight: 500;
            color: var(--md-sys-color-on-surface);
        }

        .syn-reihe-trenner {
            color: var(--md-sys-color-outline);
        }

        .syn-reihe-deutsch {
            color: var(--md-sys-color-on-surface-variant);
        }

        .syn-reihe-wortart {
            font-size: var(--md-sys-typescale-label-small-size, 11px);
            color: var(--md-sys-color-on-surface-variant);
            background: var(--md-sys-color-surface-container-high);
            padding: 2px 7px;
            border-radius: 99px;
        }

        .syn-reihe-pfeil {
            font-size: 20px;
            color: var(--md-sys-color-on-surface-variant);
            flex-shrink: 0;
            transition: transform 0.2s;
        }

        /* Editor-Bereich */
        .syn-editor-inhalt {
            padding: 16px;
            border-top: 1px solid var(--md-sys-color-outline-variant);
            background: var(--md-sys-color-surface);
        }

        .syn-editor-gruppe-titel {
            font-size: var(--md-sys-typescale-label-medium-size, 12px);
            font-weight: 600;
            color: var(--md-sys-color-on-surface-variant);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 2px;
        }

        .syn-editor-gruppe-hinweis {
            font-size: var(--md-sys-typescale-body-small-size, 11px);
            color: var(--md-sys-color-on-surface-variant);
            font-style: italic;
            margin-bottom: 8px;
        }

        .syn-chips {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            min-height: 28px;
            margin-bottom: 8px;
        }

        .syn-chip {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 4px 4px 10px;
            border-radius: 99px;
            font-size: 13px;
            font-weight: 500;
        }

        .syn-chip--en {
            background: var(--md-sys-color-primary-container);
            color: var(--md-sys-color-on-primary-container);
        }

        .syn-chip--de {
            background: var(--md-sys-color-secondary-container);
            color: var(--md-sys-color-on-secondary-container);
        }

        .syn-chip-entfernen {
            display: flex;
            align-items: center;
            background: none;
            border: none;
            cursor: pointer;
            color: inherit;
            opacity: 0.7;
            padding: 2px;
            border-radius: 50%;
        }

        .syn-chip-entfernen:hover {
            opacity: 1;
        }

        .syn-leer-hinweis {
            font-size: var(--md-sys-typescale-body-small-size, 12px);
            color: var(--md-sys-color-on-surface-variant);
            font-style: italic;
        }

        .syn-editor-eingabe-reihe {
            display: flex;
            gap: 8px;
            align-items: center;
        }

        .syn-editor-aktionen {
            display: flex;
            justify-content: flex-end;
            margin-top: 16px;
            padding-top: 12px;
            border-top: 1px solid var(--md-sys-color-outline-variant);
        }

        .synonyme-paginierung {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 16px;
            margin-top: 24px;
        }

        .synonyme-seite-info {
            font-size: var(--md-sys-typescale-body-small-size, 12px);
            color: var(--md-sys-color-on-surface-variant);
        }

        @keyframes rotation {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(stil);
}
