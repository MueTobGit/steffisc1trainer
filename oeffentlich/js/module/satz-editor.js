/**
 * Satz-Editor — Beispielsätze verwalten
 *
 * Darstellung: Vokabel-Name groß als Gruppe, dahinter Formen-Icons
 * (vorhandene Sätze farbig, fehlende ausgegraut).
 * Klick auf Form → alle Sätze für diese Form aufklappen / zuklappen.
 * Mehrere Sätze pro Form möglich (Badge mit Anzahl).
 * Fehlender Satz → Inline-Formular zum Hinzufügen.
 * Filter: Vokabel-Suche, Kategorie, Lektion.
 */

import { apiPaginiert, apiGet, apiPost, apiPut, apiDelete } from '../api-client.js';
import { ist_admin, holen } from '../zustand.js';
import { esc, entprellen } from '../hilfs-funktionen.js';
import { paginierung_rendern } from '../komponenten/paginierung.js';
import { lade_anzeige_rendern } from '../komponenten/lade-anzeige.js';
import { leer_zustand_rendern } from '../komponenten/leer-zustand.js';
import { bestaetigung_anzeigen } from '../komponenten/bestaetigung-dialog.js';
import { erfolg, fehler, apiFehlerAnzeigen } from '../benachrichtigungen.js';
import { t } from '../dienste/sprache.js';

// Formen je Wortart (muss zu konstanten.php passen)
const WORTART_FORMEN = {
    Nomen:    ['unbestimmt_singular', 'bestimmt_singular', 'unbestimmt_plural', 'bestimmt_plural'],
    Verb:     ['infinitiv', 'praesens', 'praeteritum', 'supinum', 'imperativ', 'perfekt_partizip'],
    Adjektiv: ['grundform', 'komparativ', 'superlativ', 'bestimmte_form', 'neutrum_form'],
};

// Kurz-Labels für Formen-Icons — as function so t() is evaluated at call time
function FORM_LABELS() {
    return {
        unbestimmt_singular: t('satz_editor.form_unbestimmt_singular'),
        bestimmt_singular:   t('satz_editor.form_bestimmt_singular'),
        unbestimmt_plural:   t('satz_editor.form_unbestimmt_plural'),
        bestimmt_plural:     t('satz_editor.form_bestimmt_plural'),
        infinitiv:           t('satz_editor.form_infinitiv'),
        praesens:            t('satz_editor.form_praesens'),
        praeteritum:         t('satz_editor.form_praeteritum'),
        supinum:             t('satz_editor.form_supinum'),
        imperativ:           t('satz_editor.form_imperativ'),
        perfekt_partizip:    t('satz_editor.form_perfekt_partizip'),
        grundform:           t('satz_editor.form_grundform'),
        komparativ:          t('satz_editor.form_komparativ'),
        superlativ:          t('satz_editor.form_superlativ'),
        bestimmte_form:      t('satz_editor.form_bestimmte_form'),
        neutrum_form:        t('satz_editor.form_neutrum_form'),
    };
}

let _seite              = 1;
let _proSeite           = 50;        // Einträge pro Seite
let _filterVokabel      = '';
let _filterKategorie    = '';
let _filterLektion      = '';
let _nurPrivate         = false;     // Admin: nur private Sätze anzeigen
let _filterBesitzerId   = '';        // Admin: private nach Besitzer filtern
let _benutzerListe      = [];        // Admin: Cache für User-Dropdown
let _kategorien         = [];
// Aktuell geöffnetes Detail: 'form:{vokabelId}:{form}'
let _offen              = null;

export async function rendern() {
    const container = document.getElementById('inhalt');
    if (!container) return;

    const admin = ist_admin();

    container.innerHTML = `
        <div class="verwaltung">
            <div class="verwaltung__kopf">
                <h2 class="verwaltung__titel">${t('satz_editor.titel')}</h2>
                <button class="btn btn--gefuellt" id="btn-satz-neu">
                    <span class="material-symbols-outlined" style="font-size:20px">add</span>
                    ${admin ? t('satz_editor.neuer_satz') : t('satz_editor.meinen_satz_hinzufuegen')}
                </button>
            </div>

            <!-- Filter -->
            <div class="filter-leiste">
                <div class="filter-leiste__feld">
                    <input class="eingabe eingabe--klein" type="search" id="filter-satz-suche"
                        placeholder="${t('satz_editor.vokabel_suchen_placeholder')}" autocomplete="off"
                        value="${esc(_filterVokabel)}">
                </div>
                <div class="filter-leiste__feld">
                    <select class="eingabe eingabe--klein" id="filter-satz-kategorie">
                        <option value="">${t('satz_editor.alle_kategorien')}</option>
                    </select>
                </div>
                <div class="filter-leiste__feld">
                    <select class="eingabe eingabe--klein" id="filter-satz-lektion">
                        <option value="">${t('satz_editor.alle_lektionen')}</option>
                    </select>
                </div>
                <div class="filter-leiste__feld">
                    <select class="eingabe eingabe--klein" id="filter-satz-pro-seite">
                        <option value="10"  ${_proSeite === 10  ? 'selected' : ''}>${t('satz_editor.pro_seite', {n: 10})}</option>
                        <option value="25"  ${_proSeite === 25  ? 'selected' : ''}>${t('satz_editor.pro_seite', {n: 25})}</option>
                        <option value="50"  ${_proSeite === 50  ? 'selected' : ''}>${t('satz_editor.pro_seite', {n: 50})}</option>
                        <option value="100" ${_proSeite === 100 ? 'selected' : ''}>${t('satz_editor.pro_seite', {n: 100})}</option>
                        <option value="200" ${_proSeite === 200 ? 'selected' : ''}>${t('satz_editor.pro_seite', {n: 200})}</option>
                        <option value="500" ${_proSeite === 500 ? 'selected' : ''}>${t('satz_editor.pro_seite', {n: 500})}</option>
                        <option value="999" ${_proSeite === 999 ? 'selected' : ''}>${t('satz_editor.alle_anzeigen')}</option>
                    </select>
                </div>
                ${!admin ? `
                    <div class="filter-leiste__feld filter-leiste__feld--checkbox">
                        <label class="filter-checkbox">
                            <input type="checkbox" id="filter-satz-eigene-privat" ${_nurPrivate ? 'checked' : ''}>
                            <span>${t('satz_editor.meine_privaten')}</span>
                        </label>
                    </div>
                ` : `
                    <div class="filter-leiste__feld filter-leiste__feld--checkbox">
                        <label class="filter-checkbox">
                            <input type="checkbox" id="filter-satz-nur-privat" ${_nurPrivate ? 'checked' : ''}>
                            <span>${t('satz_editor.nur_private_anzeigen')}</span>
                        </label>
                    </div>
                    <div class="filter-leiste__feld" id="filter-satz-besitzer-feld" ${!_nurPrivate ? 'style="display:none"' : ''}>
                        <select class="eingabe eingabe--klein" id="filter-satz-besitzer">
                            <option value="">${t('satz_editor.alle_besitzer')}</option>
                        </select>
                    </div>
                `}
            </div>

            <!-- Neuer-Satz-Formular (ganz oben, nur wenn kein Vokabel-Kontext) -->
            <div id="satz-global-formular"></div>

            <!-- Liste -->
            <div id="satz-inhalt"></div>
            <div id="satz-paginierung"></div>
        </div>
    `;

    // "Neuer Satz"-Button → globales Formular
    document.getElementById('btn-satz-neu')?.addEventListener('click', () => {
        _offen = null;
        _globales_formular_anzeigen();
    });

    // Filter
    const suchFeld = document.getElementById('filter-satz-suche');
    suchFeld?.addEventListener('input', entprellen(() => {
        _filterVokabel = suchFeld.value.trim();
        _seite = 1;
        _laden();
    }, 400));

    document.getElementById('filter-satz-kategorie')?.addEventListener('change', (e) => {
        _filterKategorie = e.target.value;
        _filterLektion   = '';
        _seite = 1;
        _lektionen_laden(e.target.value);
        _laden();
    });

    document.getElementById('filter-satz-lektion')?.addEventListener('change', (e) => {
        _filterLektion = e.target.value;
        _seite = 1;
        _laden();
    });

    document.getElementById('filter-satz-pro-seite')?.addEventListener('change', (e) => {
        _proSeite = parseInt(e.target.value, 10);
        _seite = 1;
        _laden();
    });

    // Non-Admin: "Meine privaten"-Checkbox
    if (!admin) {
        document.getElementById('filter-satz-eigene-privat')?.addEventListener('change', (e) => {
            _nurPrivate = e.target.checked;
            _seite = 1;
            _laden();
        });
    }

    if (admin) {
        document.getElementById('filter-satz-nur-privat')?.addEventListener('change', async (e) => {
            _nurPrivate = e.target.checked;
            _filterBesitzerId = '';
            _seite = 1;
            const besitzerFeld = document.getElementById('filter-satz-besitzer-feld');
            if (besitzerFeld) besitzerFeld.style.display = _nurPrivate ? '' : 'none';
            if (_nurPrivate) await _satz_benutzer_dropdown_laden();
            _laden();
        });

        document.getElementById('filter-satz-besitzer')?.addEventListener('change', (e) => {
            _filterBesitzerId = e.target.value;
            _seite = 1;
            _laden();
        });

        if (_nurPrivate) await _satz_benutzer_dropdown_laden();
    }

    await _kategorien_laden();
    _laden();
}

async function _satz_benutzer_dropdown_laden() {
    const select = document.getElementById('filter-satz-besitzer');
    if (!select) return;

    if (_benutzerListe.length === 0) {
        const erg = await apiGet('admin/benutzer_liste.php', { pro_seite: 200, nur_aktive: 0 });
        if (erg.erfolg) {
            _benutzerListe = (erg.daten?.eintraege || [])
                .sort((a, b) => a.benutzername.localeCompare(b.benutzername, 'de'));
        }
    }

    select.innerHTML = `<option value="">${t('satz_editor.alle_besitzer')}</option>`;
    for (const u of _benutzerListe) {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.benutzername + (u.vorname || u.nachname
            ? ` (${[u.vorname, u.nachname].filter(Boolean).join(' ')})`
            : '');
        select.appendChild(opt);
    }
    if (_filterBesitzerId) select.value = _filterBesitzerId;
}

async function _kategorien_laden() {
    const erg = await apiGet('kategorien/liste.php');
    if (!erg.erfolg) return;
    _kategorien = erg.daten || [];
    _kategorien_sortieren(_kategorien);

    const sel = document.getElementById('filter-satz-kategorie');
    if (!sel) return;
    _kategorien_optionen(sel, _kategorien);
    if (_filterKategorie) {
        sel.value = _filterKategorie;
        await _lektionen_laden(_filterKategorie);
    }
}

function _kategorien_sortieren(liste) {
    liste.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    for (const k of liste) {
        if (k.kinder?.length > 0) _kategorien_sortieren(k.kinder);
    }
}

function _kategorien_optionen(sel, kategorien, prefix = '') {
    for (const k of kategorien) {
        const opt = document.createElement('option');
        opt.value = k.id;
        opt.textContent = prefix + k.name;
        sel.appendChild(opt);
        if (k.kinder?.length > 0) _kategorien_optionen(sel, k.kinder, prefix + '\u00A0\u00A0\u00A0');
    }
}

async function _lektionen_laden(kategorieId = '') {
    const sel = document.getElementById('filter-satz-lektion');
    if (!sel) return;

    const params = { pro_seite: 200, nur_aktive: 1 };
    if (kategorieId) params.kategorie_id = kategorieId;

    const erg = await apiGet('lektionen/liste.php', params);
    sel.innerHTML = `<option value="">${t('satz_editor.alle_lektionen')}</option>`;

    if (erg.erfolg) {
        const lektionen = (erg.daten?.eintraege || [])
            .sort((a, b) => {
                const ka = a.kategorie_name || '', kb = b.kategorie_name || '';
                const c = ka.localeCompare(kb, 'de');
                return c !== 0 ? c : a.titel.localeCompare(b.titel, 'de');
            });
        for (const l of lektionen) {
            const opt = document.createElement('option');
            opt.value = l.id;
            opt.textContent = (l.kategorie_name ? `${l.kategorie_name} › ` : '') + l.titel;
            sel.appendChild(opt);
        }
        if (_filterLektion) sel.value = _filterLektion;
    }
}

async function _laden() {
    const inhalt = document.getElementById('satz-inhalt');
    if (!inhalt) return;

    lade_anzeige_rendern(inhalt);

    const params = {};
    if (_filterVokabel && _filterVokabel.length >= 2) params.suche = _filterVokabel;
    if (_filterKategorie) params.kategorie_id = _filterKategorie;
    if (_filterLektion)   params.lektion_id   = _filterLektion;
    params.sortierung = 'vokabel_schwedisch';
    params.richtung   = 'ASC';
    params.pro_seite  = _proSeite;
    if (_nurPrivate) {
        params.nur_privat = 1;
    }
    if (ist_admin()) {
        if (_nurPrivate) {
            params.auch_private = 1;
            if (_filterBesitzerId) params.besitzer_id = _filterBesitzerId;
        } else {
            params.auch_private = 1;
        }
    }

    const ergebnis = await apiPaginiert('saetze/liste.php', _seite, params);

    if (!ergebnis.erfolg) {
        apiFehlerAnzeigen(ergebnis);
        return;
    }

    const saetze      = ergebnis.daten.eintraege || [];
    const paginierung = ergebnis.daten.paginierung;

    if (saetze.length === 0) {
        leer_zustand_rendern(inhalt, 'text_ad', t('satz_editor.keine_saetze_titel'),
            t('satz_editor.keine_saetze_text'));
        document.getElementById('satz-paginierung').innerHTML = '';
        return;
    }

    // Sätze nach Vokabel gruppieren
    const gruppen = new Map(); // vokabel_id → { info, saetze[] }
    for (const s of saetze) {
        if (!gruppen.has(s.vokabel_id)) {
            gruppen.set(s.vokabel_id, {
                id:            s.vokabel_id,
                schwedisch:    s.vokabel_schwedisch,
                deutsch:       s.vokabel_deutsch,
                wortart:       s.vokabel_wortart,
                ist_privat:    s.ist_privat,
                besitzer_id:   s.besitzer_id,
                besitzer_name: s.besitzer_name,
                saetze:        [],
            });
        }
        gruppen.get(s.vokabel_id).saetze.push(s);
    }

    _liste_rendern(inhalt, gruppen);

    paginierung_rendern(
        document.getElementById('satz-paginierung'),
        paginierung,
        (s) => { _seite = s; _laden(); }
    );
}

// Helper: <option>-Elemente für ein Formen-Dropdown erzeugen
function _form_optionen_html(wortart, ausgewaehlt = '') {
    const labels = FORM_LABELS();
    const formen = WORTART_FORMEN[wortart] || [];
    if (formen.length === 0) {
        return `<option value="${esc(ausgewaehlt)}">${esc(labels[ausgewaehlt] || ausgewaehlt)}</option>`;
    }
    return formen.map(f => {
        const label = labels[f] || f;
        const sel   = f === ausgewaehlt ? ' selected' : '';
        return `<option value="${esc(f)}"${sel}>${esc(label)}</option>`;
    }).join('');
}

function _liste_rendern(container, gruppen) {
    const admin = ist_admin();
    const labels = FORM_LABELS();
    let html = '<div class="satz-gruppen">';

    for (const gruppe of gruppen.values()) {
        const formen = WORTART_FORMEN[gruppe.wortart] || [];

        // Für diese Vokabel: welche Formen haben Sätze? Map<form, satz[]>
        const formMap = new Map();
        for (const s of gruppe.saetze) {
            if (!formMap.has(s.benoetigte_form)) formMap.set(s.benoetigte_form, []);
            formMap.get(s.benoetigte_form).push(s);
        }

        // Formen-Icons
        let iconsHtml = '';
        for (const form of formen) {
            const saetze  = formMap.get(form) || [];
            const label   = labels[form] || form;
            const hatSatz = saetze.length > 0;
            const aktiv   = _offen === `form:${gruppe.id}:${form}`;
            const anzahl  = saetze.length;
            iconsHtml += `
                <button class="satz-form-icon${hatSatz ? ' satz-form-icon--vorhanden' : ' satz-form-icon--fehlend'}${aktiv ? ' satz-form-icon--aktiv' : ''}"
                    data-aktion="form-toggle"
                    data-vokabel-id="${gruppe.id}"
                    data-form="${esc(form)}"
                    data-satz-ids="${saetze.map(s => s.id).join(',')}"
                    title="${esc(form)}"
                >${esc(label)}${anzahl > 1 ? `<span class="satz-anzahl-badge">${anzahl}</span>` : ''}</button>
            `;
        }

        // Sätze ohne bekannte Form (andere benoetigte_form-Werte), zusammengefasst
        const bekannteForms = new Set(formen);
        const extraForms    = new Map();
        for (const s of gruppe.saetze) {
            if (!bekannteForms.has(s.benoetigte_form)) {
                if (!extraForms.has(s.benoetigte_form)) extraForms.set(s.benoetigte_form, []);
                extraForms.get(s.benoetigte_form).push(s);
            }
        }
        for (const [extraForm, extraSaetze] of extraForms) {
            const aktiv  = _offen === `form:${gruppe.id}:${extraForm}`;
            const anzahl = extraSaetze.length;
            iconsHtml += `
                <button class="satz-form-icon satz-form-icon--vorhanden${aktiv ? ' satz-form-icon--aktiv' : ''}"
                    data-aktion="form-toggle"
                    data-vokabel-id="${gruppe.id}"
                    data-form="${esc(extraForm)}"
                    data-satz-ids="${extraSaetze.map(s => s.id).join(',')}"
                    title="${esc(extraForm)}"
                >${esc(extraForm.slice(0, 5))}${anzahl > 1 ? `<span class="satz-anzahl-badge">${anzahl}</span>` : ''}</button>
            `;
        }

        const privatKlasse = gruppe.ist_privat ? ' satz-gruppe--privat' : '';
        const privatBadge  = gruppe.ist_privat
            ? `<span class="satz-privat-badge" title="${t('satz_editor.privater_inhalt_von', {name: esc(gruppe.besitzer_name || t('satz_editor.unbekannt'))})}">
                   <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">lock</span>
                   ${esc(gruppe.besitzer_name || '')}
               </span>`
            : '';

        html += `
            <div class="satz-gruppe${privatKlasse}" data-vokabel-id="${gruppe.id}">
                <div class="satz-gruppe__kopf">
                    <div class="satz-gruppe__vokabel">
                        <span class="satz-gruppe__sv">${esc(gruppe.schwedisch)}</span>
                        <span class="satz-gruppe__de">${esc(gruppe.deutsch)}</span>
                        <span class="tag tag--${(gruppe.wortart || '').toLowerCase()}" style="margin-left:4px">${esc(gruppe.wortart || '')}</span>
                        ${privatBadge}
                    </div>
                    <div class="satz-gruppe__formen">${iconsHtml}</div>
                </div>
                <div class="satz-gruppe__detail" id="satz-detail-${gruppe.id}"></div>
            </div>
        `;
    }

    html += '</div>';
    container.innerHTML = html;

    // Events: Formen-Icons
    container.querySelectorAll('[data-aktion="form-toggle"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const vokabelId  = parseInt(btn.dataset.vokabelId, 10);
            const form       = btn.dataset.form;
            const schluessel = `form:${vokabelId}:${form}`;

            if (_offen === schluessel) {
                // Zuklappen
                _offen = null;
                _detail_leeren(vokabelId);
            } else {
                _offen = schluessel;
                const gruppe = gruppen.get(vokabelId);
                const saetze = (gruppe?.saetze || []).filter(s => s.benoetigte_form === form);
                _detail_form_anzeigen(vokabelId, form, saetze, gruppe, admin);
            }

            // Aktiv-Klassen aktualisieren
            container.querySelectorAll('[data-aktion="form-toggle"]').forEach(b => {
                const bKey = `form:${b.dataset.vokabelId}:${b.dataset.form}`;
                b.classList.toggle('satz-form-icon--aktiv', bKey === _offen);
            });
        });
    });

    // Wenn _offen gesetzt und eine passende Gruppe da ist → automatisch öffnen
    if (_offen) {
        const teile = _offen.split(':');
        if (teile[0] === 'form' && teile.length >= 3) {
            const vokabelId = parseInt(teile[1], 10);
            const form      = teile.slice(2).join(':');
            const gruppe    = gruppen.get(vokabelId);
            if (gruppe) {
                const saetze = gruppe.saetze.filter(s => s.benoetigte_form === form);
                _detail_form_anzeigen(vokabelId, form, saetze, gruppe, admin);
            }
        }
    }
}

function _detail_leeren(vokabelId) {
    const el = document.getElementById(`satz-detail-${vokabelId}`);
    if (el) el.innerHTML = '';
}

// Zeigt alle Sätze einer Form + "Weiteren hinzufügen"-Button
function _detail_form_anzeigen(vokabelId, form, saetze, gruppe, admin) {
    const container = document.getElementById(`satz-detail-${vokabelId}`);
    if (!container) return;

    if (saetze.length === 0) {
        // Noch kein Satz → direkt Neuformular anzeigen
        _detail_neu_anzeigen(vokabelId, form, gruppe);
        return;
    }

    // Alle Sätze dieser Form rendern
    let innerHtml = '<div class="satz-detail-gruppe">';
    for (const satz of saetze) {
        innerHtml += _satz_detail_html(satz, admin);
    }
    innerHtml += `
        <div class="satz-detail__hinzufuegen">
            <button class="btn btn--text btn--klein" data-aktion="form-satz-hinzufuegen">
                <span class="material-symbols-outlined" style="font-size:16px">add</span>
                ${t('satz_editor.weiteren_satz_hinzufuegen')}
            </button>
        </div>
    </div>`;
    container.innerHTML = innerHtml;

    // Events für jeden Satz
    for (const satz of saetze) {
        _satz_detail_events(container, satz, vokabelId, admin);
    }

    // "Weiteren Satz hinzufügen"
    container.querySelector('[data-aktion="form-satz-hinzufuegen"]')?.addEventListener('click', (e) => {
        e.currentTarget.closest('.satz-detail__hinzufuegen').style.display = 'none';
        _detail_neu_anzeigen_append(vokabelId, form, container);
    });
}

// Hängt ein Neuformular für einen weiteren Satz ans Detail an
function _detail_neu_anzeigen_append(vokabelId, form, detailContainer) {
    detailContainer.querySelector('.satz-detail--append')?.remove();

    const div = document.createElement('div');
    div.className = 'satz-detail satz-detail--neu satz-detail--append';
    const labels = FORM_LABELS();
    const formLabel = labels[form] || form;
    div.innerHTML = `
        <p class="satz-detail__hinweis">
            ${t('satz_editor.weiteren_satz_fuer', {form: `<strong>${esc(formLabel)}</strong>`})}
        </p>
        <div class="satz-inline-formular">
            <div class="formular-gruppe">
                <label class="formular-label">${t('satz_editor.label_schwedischer_satz')} <small>(${t('satz_editor.mit_luecke')})</small></label>
                <input class="eingabe" type="text" id="app-sv" placeholder="Jag har en ___.">
            </div>
            <div class="formular-gruppe">
                <label class="formular-label">${t('satz_editor.label_deutscher_satz')}</label>
                <input class="eingabe" type="text" id="app-de" placeholder="Ich habe einen Hund.">
            </div>
            <div class="editor-formular__reihe">
                <div class="formular-gruppe">
                    <label class="formular-label">${t('satz_editor.label_niveau')}</label>
                    <select class="eingabe" id="app-niv">
                        ${['A1','A2','B1','B2','C1','C2'].map(n => `<option value="${n}">${n}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="editor-formular__aktionen">
                <button class="btn btn--text btn--klein" data-aktion="app-abbrechen">${t('allgemein.abbrechen')}</button>
                <button class="btn btn--gefuellt btn--klein" data-aktion="app-speichern">${t('allgemein.speichern')}</button>
            </div>
        </div>
    `;

    const hinzufuegenDiv = detailContainer.querySelector('.satz-detail__hinzufuegen');
    if (hinzufuegenDiv) {
        detailContainer.querySelector('.satz-detail-gruppe').insertBefore(div, hinzufuegenDiv);
    } else {
        detailContainer.appendChild(div);
    }

    div.querySelector('[data-aktion="app-abbrechen"]')?.addEventListener('click', () => {
        div.remove();
        const hinzBtn = detailContainer.querySelector('.satz-detail__hinzufuegen');
        if (hinzBtn) hinzBtn.style.display = '';
    });

    div.querySelector('[data-aktion="app-speichern"]')?.addEventListener('click', async () => {
        const sv  = div.querySelector('#app-sv')?.value?.trim();
        const de  = div.querySelector('#app-de')?.value?.trim();
        const niv = div.querySelector('#app-niv')?.value;

        if (!sv || !de) { fehler(t('satz_editor.pflichtfelder_fehler')); return; }
        if (!sv.includes('___')) { fehler(t('satz_editor.luecke_fehler')); return; }

        const erg = await apiPost('saetze/erstellen.php', {
            vokabel_id:      vokabelId,
            schwedisch_satz: sv,
            deutsch_satz:    de,
            benoetigte_form: form,
            sprachniveau:    niv,
        });

        if (erg.erfolg) {
            erfolg(t('satz_editor.satz_erstellt'));
            _offen = `form:${vokabelId}:${form}`;
            _laden();
        } else apiFehlerAnzeigen(erg);
    });
}

function _satz_detail_html(satz, admin) {
    const labels = FORM_LABELS();
    const aktuellerBenutzer = holen('benutzer');
    const istEigenSatz = !admin && satz.ist_privat && aktuellerBenutzer &&
                         parseInt(satz.besitzer_id, 10) === parseInt(aktuellerBenutzer.id, 10);
    const kannBearbeiten = admin;
    const kannLoeschen   = admin || istEigenSatz;

    return `
        <div class="satz-detail${satz.ist_privat ? ' satz-detail--privat' : ''}" data-satz-id="${satz.id}">
            <div class="satz-detail__saetze">
                <div class="satz-detail__sv">${esc(satz.schwedisch_satz)}</div>
                <div class="satz-detail__de">${esc(satz.deutsch_satz)}</div>
            </div>
            <div class="satz-detail__meta">
                <span class="tag tag--${(satz.sprachniveau || 'a1').toLowerCase()}">${esc(satz.sprachniveau)}</span>
                <span class="satz-detail__form">${t('satz_editor.form_label')}: <strong>${esc(labels[satz.benoetigte_form] || satz.benoetigte_form)}</strong></span>
                ${satz.ist_privat ? `<span class="satz-privat-badge">
                    <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">lock</span>
                    ${t('satz_editor.privat')}
                </span>` : ''}
            </div>
            ${kannLoeschen || kannBearbeiten ? `
                <div class="satz-detail__aktionen">
                    ${kannBearbeiten ? `
                        <button class="btn btn--text btn--klein" data-aktion="satz-bearbeiten" data-id="${satz.id}">
                            <span class="material-symbols-outlined" style="font-size:16px">edit</span> ${t('allgemein.bearbeiten')}
                        </button>
                    ` : ''}
                    ${kannLoeschen ? `
                        <button class="btn btn--text btn--klein btn--gefaehrlich" data-aktion="satz-loeschen" data-id="${satz.id}">
                            <span class="material-symbols-outlined" style="font-size:16px">delete</span> ${t('allgemein.loeschen')}
                        </button>
                    ` : ''}
                </div>
                ${kannBearbeiten ? `<div class="satz-bearbeiten-formular" id="satz-bearb-form-${satz.id}" style="display:none"></div>` : ''}
            ` : ''}
        </div>
    `;
}

function _satz_detail_events(container, satz, vokabelId, admin) {
    const aktuellerBenutzer = holen('benutzer');
    const istEigenSatz = !admin && satz.ist_privat && aktuellerBenutzer &&
                         parseInt(satz.besitzer_id, 10) === parseInt(aktuellerBenutzer.id, 10);

    if (admin) {
        container.querySelector(`[data-aktion="satz-bearbeiten"][data-id="${satz.id}"]`)?.addEventListener('click', () => {
            const formDiv = document.getElementById(`satz-bearb-form-${satz.id}`);
            if (!formDiv) return;
            const sichtbar = formDiv.style.display !== 'none';
            formDiv.style.display = sichtbar ? 'none' : 'block';
            if (!sichtbar) _bearbeiten_formular_rendern(formDiv, satz, vokabelId);
        });
    }

    if (admin || istEigenSatz) {
        container.querySelector(`[data-aktion="satz-loeschen"][data-id="${satz.id}"]`)?.addEventListener('click', async () => {
            const labels = FORM_LABELS();
            const formLabel = labels[satz.benoetigte_form] || satz.benoetigte_form;
            const ok = await bestaetigung_anzeigen(
                t('satz_editor.satz_loeschen_titel'),
                t('satz_editor.satz_loeschen_text', {form: formLabel, vokabel: satz.vokabel_schwedisch}),
                t('allgemein.loeschen'), t('allgemein.abbrechen'), true
            );
            if (ok) {
                const erg = await apiDelete(`saetze/loeschen.php?id=${satz.id}`);
                if (erg.erfolg) {
                    erfolg(t('satz_editor.satz_geloescht'));
                    _offen = null;
                    _laden();
                } else apiFehlerAnzeigen(erg);
            }
        });
    }
}

function _bearbeiten_formular_rendern(formDiv, satz, vokabelId) {
    const wortart = satz.vokabel_wortart || '';
    formDiv.innerHTML = `
        <div class="satz-inline-formular">
            <div class="formular-gruppe">
                <label class="formular-label">${t('satz_editor.label_schwedischer_satz')} <small>(${t('satz_editor.mit_luecke')})</small></label>
                <input class="eingabe" type="text" id="bearb-sv-${satz.id}"
                    value="${esc(satz.schwedisch_satz)}" placeholder="Jag har en ___.">
            </div>
            <div class="formular-gruppe">
                <label class="formular-label">${t('satz_editor.label_deutscher_satz')}</label>
                <input class="eingabe" type="text" id="bearb-de-${satz.id}"
                    value="${esc(satz.deutsch_satz)}" placeholder="Ich habe einen Hund.">
            </div>
            <div class="editor-formular__reihe">
                <div class="formular-gruppe">
                    <label class="formular-label">${t('satz_editor.label_benoetigte_form')}</label>
                    <select class="eingabe" id="bearb-form-${satz.id}">
                        ${_form_optionen_html(wortart, satz.benoetigte_form)}
                    </select>
                </div>
                <div class="formular-gruppe">
                    <label class="formular-label">${t('satz_editor.label_niveau')}</label>
                    <select class="eingabe" id="bearb-niveau-${satz.id}">
                        ${['A1','A2','B1','B2','C1','C2'].map(n =>
                            `<option value="${n}"${satz.sprachniveau === n ? ' selected' : ''}>${n}</option>`
                        ).join('')}
                    </select>
                </div>
            </div>
            <div class="editor-formular__aktionen">
                <button class="btn btn--text btn--klein" data-aktion="bearb-abbrechen">${t('allgemein.abbrechen')}</button>
                <button class="btn btn--gefuellt btn--klein" data-aktion="bearb-speichern" data-id="${satz.id}">${t('allgemein.speichern')}</button>
            </div>
        </div>
    `;

    formDiv.querySelector('[data-aktion="bearb-abbrechen"]')?.addEventListener('click', () => {
        formDiv.style.display = 'none';
    });

    formDiv.querySelector('[data-aktion="bearb-speichern"]')?.addEventListener('click', async () => {
        const sv   = document.getElementById(`bearb-sv-${satz.id}`)?.value?.trim();
        const de   = document.getElementById(`bearb-de-${satz.id}`)?.value?.trim();
        const form = document.getElementById(`bearb-form-${satz.id}`)?.value;
        const niv  = document.getElementById(`bearb-niveau-${satz.id}`)?.value;

        if (!sv || !de || !form) { fehler(t('satz_editor.pflichtfelder_fehler')); return; }
        if (!sv.includes('___')) { fehler(t('satz_editor.luecke_fehler')); return; }

        const erg = await apiPut(`saetze/aktualisieren.php?id=${satz.id}`, {
            vokabel_id:      vokabelId,
            schwedisch_satz: sv,
            deutsch_satz:    de,
            benoetigte_form: form,
            sprachniveau:    niv,
        });

        if (erg.erfolg) { erfolg(t('satz_editor.satz_aktualisiert')); _offen = null; _laden(); }
        else apiFehlerAnzeigen(erg);
    });
}

function _detail_neu_anzeigen(vokabelId, form, gruppe) {
    const container = document.getElementById(`satz-detail-${vokabelId}`);
    if (!container) return;

    const wortart   = gruppe?.wortart || '';
    const labels    = FORM_LABELS();
    const formLabel = labels[form] || form;

    container.innerHTML = `
        <div class="satz-detail satz-detail--neu">
            <p class="satz-detail__hinweis">
                ${t('satz_editor.kein_satz_vorhanden', {form: `<strong>${esc(formLabel)}</strong>`})}
            </p>
            <div class="satz-inline-formular">
                <div class="formular-gruppe">
                    <label class="formular-label">${t('satz_editor.label_schwedischer_satz')} <small>(${t('satz_editor.mit_luecke')})</small></label>
                    <input class="eingabe" type="text" id="neu-sv"
                        placeholder="Jag har en ___.">
                </div>
                <div class="formular-gruppe">
                    <label class="formular-label">${t('satz_editor.label_deutscher_satz')}</label>
                    <input class="eingabe" type="text" id="neu-de"
                        placeholder="Ich habe einen Hund.">
                </div>
                <div class="editor-formular__reihe">
                    <div class="formular-gruppe">
                        <label class="formular-label">${t('satz_editor.label_benoetigte_form')}</label>
                        <select class="eingabe" id="neu-form">
                            ${_form_optionen_html(wortart, form)}
                        </select>
                    </div>
                    <div class="formular-gruppe">
                        <label class="formular-label">${t('satz_editor.label_niveau')}</label>
                        <select class="eingabe" id="neu-niveau">
                            ${['A1','A2','B1','B2','C1','C2'].map(n =>
                                `<option value="${n}">` + n + '</option>'
                            ).join('')}
                        </select>
                    </div>
                </div>
                <div class="editor-formular__aktionen">
                    <button class="btn btn--text btn--klein" id="btn-neu-abbrechen">${t('allgemein.abbrechen')}</button>
                    <button class="btn btn--gefuellt btn--klein" id="btn-neu-speichern">${t('allgemein.speichern')}</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('btn-neu-abbrechen')?.addEventListener('click', () => {
        _offen = null;
        _detail_leeren(vokabelId);
        document.querySelectorAll('[data-aktion="form-toggle"]').forEach(b => {
            b.classList.remove('satz-form-icon--aktiv');
        });
    });

    document.getElementById('btn-neu-speichern')?.addEventListener('click', async () => {
        const sv          = document.getElementById('neu-sv')?.value?.trim();
        const de          = document.getElementById('neu-de')?.value?.trim();
        const selectedForm = document.getElementById('neu-form')?.value || form;
        const niv         = document.getElementById('neu-niveau')?.value;

        if (!sv || !de) { fehler(t('satz_editor.pflichtfelder_fehler')); return; }
        if (!sv.includes('___')) { fehler(t('satz_editor.luecke_fehler')); return; }

        const erg = await apiPost('saetze/erstellen.php', {
            vokabel_id:      vokabelId,
            schwedisch_satz: sv,
            deutsch_satz:    de,
            benoetigte_form: selectedForm,
            sprachniveau:    niv,
        });

        if (erg.erfolg) {
            erfolg(t('satz_editor.satz_erstellt'));
            _offen = null;
            _laden();
        } else apiFehlerAnzeigen(erg);
    });
}

async function _globales_formular_anzeigen() {
    const container = document.getElementById('satz-global-formular');
    if (!container) return;

    // Toggle: wenn schon sichtbar → schließen
    if (container.innerHTML.trim()) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <div class="karte editor-formular__inline" style="margin-bottom:16px">
            <h3>${t('satz_editor.neuer_satz')}</h3>
            <div class="formular-gruppe">
                <label class="formular-label">${t('satz_editor.label_vokabel')}</label>
                <input class="eingabe" type="text" id="gneu-vokabel-suche" placeholder="${t('satz_editor.vokabel_suchen_kurz')}">
                <input type="hidden" id="gneu-vokabel-id">
                <input type="hidden" id="gneu-vokabel-wortart">
                <div id="gneu-vokabel-ergebnisse" class="suche-ergebnisse"></div>
            </div>
            <div class="formular-gruppe">
                <label class="formular-label">${t('satz_editor.label_schwedischer_satz')} <small>(${t('satz_editor.mit_luecke')})</small></label>
                <input class="eingabe" type="text" id="gneu-sv" placeholder="Jag har en ___.">
            </div>
            <div class="formular-gruppe">
                <label class="formular-label">${t('satz_editor.label_deutscher_satz')}</label>
                <input class="eingabe" type="text" id="gneu-de" placeholder="Ich habe einen Hund.">
            </div>
            <div class="editor-formular__reihe">
                <div class="formular-gruppe">
                    <label class="formular-label">${t('satz_editor.label_benoetigte_form')}</label>
                    <div id="gneu-form-wrapper">
                        <input class="eingabe" type="text" id="gneu-form" placeholder="${t('satz_editor.form_placeholder')}">
                    </div>
                </div>
                <div class="formular-gruppe">
                    <label class="formular-label">${t('satz_editor.label_niveau')}</label>
                    <select class="eingabe" id="gneu-niveau">
                        ${['A1','A2','B1','B2','C1','C2'].map(n => `<option value="${n}">${n}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="editor-formular__aktionen">
                <button class="btn btn--text" id="gneu-abbrechen">${t('allgemein.abbrechen')}</button>
                <button class="btn btn--gefuellt" id="gneu-speichern">${t('allgemein.speichern')}</button>
            </div>
        </div>
    `;

    // Vokabel-Suche
    document.getElementById('gneu-vokabel-suche')?.addEventListener('input', entprellen(async () => {
        const q   = document.getElementById('gneu-vokabel-suche').value.trim();
        const res = document.getElementById('gneu-vokabel-ergebnisse');
        if (!res) return;
        if (q.length < 2) { res.innerHTML = ''; return; }

        const erg = await apiGet('vokabeln/suchen.php', { q });
        if (erg.erfolg && erg.daten.length > 0) {
            res.innerHTML = erg.daten.map(v =>
                `<div class="suche-ergebnis" data-vid="${v.id}" data-wortart="${esc(v.wortart)}">
                    <strong>${esc(v.schwedisch)}</strong> — ${esc(v.deutsch)} (${esc(v.wortart)})
                </div>`
            ).join('');
            res.querySelectorAll('.suche-ergebnis').forEach(el => {
                el.addEventListener('click', () => {
                    document.getElementById('gneu-vokabel-id').value      = el.dataset.vid;
                    document.getElementById('gneu-vokabel-wortart').value = el.dataset.wortart;
                    document.getElementById('gneu-vokabel-suche').value   = el.textContent.trim();
                    res.innerHTML = '';
                    // Formen-Dropdown aufbauen sobald Wortart bekannt
                    const wrapper = document.getElementById('gneu-form-wrapper');
                    const formen  = WORTART_FORMEN[el.dataset.wortart] || [];
                    if (wrapper && formen.length > 0) {
                        wrapper.innerHTML = `<select class="eingabe" id="gneu-form">
                            ${_form_optionen_html(el.dataset.wortart)}
                        </select>`;
                    }
                });
            });
        } else if (erg.erfolg) {
            res.innerHTML = `<div class="suche-ergebnis suche-ergebnis--leer">${t('satz_editor.nichts_gefunden')}</div>`;
        }
    }, 300));

    document.getElementById('gneu-abbrechen')?.addEventListener('click', () => {
        container.innerHTML = '';
    });

    document.getElementById('gneu-speichern')?.addEventListener('click', async () => {
        const vokId = document.getElementById('gneu-vokabel-id')?.value;
        const sv    = document.getElementById('gneu-sv')?.value?.trim();
        const de    = document.getElementById('gneu-de')?.value?.trim();
        const form  = document.getElementById('gneu-form')?.value?.trim();
        const niv   = document.getElementById('gneu-niveau')?.value;

        if (!vokId || !sv || !de || !form) { fehler(t('satz_editor.pflichtfelder_fehler')); return; }
        if (!sv.includes('___')) { fehler(t('satz_editor.luecke_fehler')); return; }

        const erg = await apiPost('saetze/erstellen.php', {
            vokabel_id:      parseInt(vokId, 10),
            schwedisch_satz: sv,
            deutsch_satz:    de,
            benoetigte_form: form,
            sprachniveau:    niv,
        });

        if (erg.erfolg) {
            erfolg(t('satz_editor.satz_erstellt'));
            container.innerHTML = '';
            _laden();
        } else apiFehlerAnzeigen(erg);
    });
}

export function aufraeumen() {
    _seite            = 1;
    _proSeite         = 50;
    _filterVokabel    = '';
    _filterKategorie  = '';
    _filterLektion    = '';
    _nurPrivate       = false;
    _filterBesitzerId = '';
    _benutzerListe    = [];
    _offen            = null;
}
