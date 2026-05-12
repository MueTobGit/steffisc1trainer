/**
 * Vokabel-Editor — Erstellen / Bearbeiten
 *
 * Dynamische Wortart-Felder, Formen, Synonyme, Saetze inline.
 * Komplexestes Frontend-Modul.
 */

import { apiGet, apiPost, apiPut } from '../api-client.js';
import { ist_admin, holen } from '../zustand.js';
import { navigieren } from '../router.js';
import { esc } from '../hilfs-funktionen.js';
import { t } from '../dienste/sprache.js';
import { lade_anzeige_rendern } from '../komponenten/lade-anzeige.js';
import { erfolg, fehler, apiFehlerAnzeigen } from '../benachrichtigungen.js';

// Wortart → Formen-Felder (Funktion, da t() erst nach Sprach-Init verfuegbar)
function _wortart_formen() {
    return {
        Nomen: [
            { key: 'unbestimmt_singular', label: t('vokabel_editor.form_unbestimmt_sg'), beispiel: 'en hund' },
            { key: 'bestimmt_singular', label: t('vokabel_editor.form_bestimmt_sg'), beispiel: 'hunden' },
            { key: 'unbestimmt_plural', label: t('vokabel_editor.form_unbestimmt_pl'), beispiel: 'hundar' },
            { key: 'bestimmt_plural', label: t('vokabel_editor.form_bestimmt_pl'), beispiel: 'hundarna' },
        ],
        Verb: [
            { key: 'infinitiv', label: t('vokabel_editor.form_infinitiv'), beispiel: 'tala' },
            { key: 'praesens', label: t('vokabel_editor.form_praesens'), beispiel: 'talar' },
            { key: 'praeteritum', label: t('vokabel_editor.form_praeteritum'), beispiel: 'talade' },
            { key: 'supinum', label: t('vokabel_editor.form_supinum'), beispiel: 'talat' },
            { key: 'imperativ', label: t('vokabel_editor.form_imperativ'), beispiel: 'tala!' },
            { key: 'perfekt_partizip', label: t('vokabel_editor.form_perfekt_partizip'), beispiel: 'talad' },
        ],
        Adjektiv: [
            { key: 'grundform', label: t('vokabel_editor.form_grundform'), beispiel: 'stor' },
            { key: 'komparativ', label: t('vokabel_editor.form_komparativ'), beispiel: 'stoerre' },
            { key: 'superlativ', label: t('vokabel_editor.form_superlativ'), beispiel: 'stoerst' },
            { key: 'bestimmte_form', label: t('vokabel_editor.form_bestimmte'), beispiel: 'stora' },
            { key: 'neutrum_form', label: t('vokabel_editor.form_neutrum'), beispiel: 'stort' },
        ],
    };
}

let _modus = 'neu'; // 'neu' oder 'bearbeiten'
let _vokabelId = null;
let _vokabelDaten = null;
let _synonyme = [];
let _kategorien = [];

/**
 * Modul rendern
 */
export async function rendern(params = {}) {
    const container = document.getElementById('inhalt');
    if (!container) return;

    // Modus erkennen
    if (params.id) {
        _modus = 'bearbeiten';
        _vokabelId = parseInt(params.id, 10);
    } else {
        _modus = 'neu';
        _vokabelId = null;
        _vokabelDaten = null;
        _synonyme = [];
    }

    lade_anzeige_rendern(container);

    // Kategorien laden
    const katErgebnis = await apiGet('kategorien/liste.php');
    if (katErgebnis.erfolg) {
        _kategorien = katErgebnis.daten || [];
    }

    // Bei Bearbeiten: Vokabel laden
    if (_modus === 'bearbeiten') {
        const ergebnis = await apiGet(`vokabeln/details.php?id=${_vokabelId}`);
        if (!ergebnis.erfolg) {
            apiFehlerAnzeigen(ergebnis);
            navigieren('/vokabeln');
            return;
        }
        _vokabelDaten = ergebnis.daten;
        _synonyme = _vokabelDaten.synonyme || [];

        // Berechtigungspruefung: Nur Admin oder Besitzer der eigenen privaten Vokabel
        const benutzer = holen('benutzer');
        const istEigenePrivate = _vokabelDaten.ist_privat && _vokabelDaten.besitzer_id === benutzer?.id;
        if (!ist_admin() && !istEigenePrivate) {
            fehler(t('vokabel_editor.keine_berechtigung') || 'Diese Vokabel kann nur von Administratoren bearbeitet werden.');
            navigieren('/vokabeln');
            return;
        }
    }

    _formular_rendern(container);

    // Lektionen-Dropdown befuellen (nur Non-Admin)
    if (!ist_admin()) {
        const lekErg = await apiGet('lektionen/liste.php?nur_privat=1&pro_seite=200&nur_aktive=1');
        const lekSelect = document.getElementById('ed-lektion');
        if (lekErg.erfolg && lekSelect) {
            for (const l of (lekErg.daten?.eintraege || [])) {
                const opt = document.createElement('option');
                opt.value = l.id;
                opt.textContent = l.titel + (l.vokabel_anzahl > 0 ? ` (${l.vokabel_anzahl})` : '');
                lekSelect.appendChild(opt);
            }
        }
    }
}

/**
 * Formular rendern
 */
function _formular_rendern(container) {
    const v = _vokabelDaten || {};
    const titel = _modus === 'neu' ? t('vokabel_editor.titel_neu') : t('vokabel_editor.titel_bearbeiten', {wort: v.schwedisch || t('vokabel_liste.titel')});

    container.innerHTML = `
        <div class="editor-formular">
            <div class="editor-formular__kopf">
                <button class="btn btn--text" id="btn-zurueck">
                    <span class="material-symbols-outlined" style="font-size:20px">arrow_back</span>
                    ${t('vokabel_editor.zurueck')}
                </button>
                <h2>${esc(titel)}</h2>
            </div>

            <form id="vokabel-form" class="editor-formular__inhalt">
                <!-- Grunddaten -->
                <fieldset class="editor-formular__abschnitt">
                    <legend>${t('vokabel_editor.grunddaten')}</legend>

                    <div class="editor-formular__reihe">
                        <div class="formular-gruppe">
                            <label class="formular-label" for="ed-schwedisch">${t('vokabel_editor.schwedisch')}</label>
                            <input class="eingabe" type="text" id="ed-schwedisch" name="schwedisch"
                                value="${esc(v.schwedisch || '')}" required placeholder="${t('vokabel_editor.schwedisch_placeholder')}">
                        </div>
                        <div class="formular-gruppe">
                            <label class="formular-label" for="ed-deutsch">${t('vokabel_editor.deutsch')}</label>
                            <input class="eingabe" type="text" id="ed-deutsch" name="deutsch"
                                value="${esc(v.deutsch || '')}" required placeholder="${t('vokabel_editor.deutsch_placeholder')}">
                        </div>
                    </div>

                    <div class="editor-formular__reihe">
                        <div class="formular-gruppe">
                            <label class="formular-label" for="ed-wortart">${t('vokabel_editor.wortart')}</label>
                            <select class="eingabe" id="ed-wortart" name="wortart" required>
                                <option value="">${t('vokabel_editor.waehlen')}</option>
                                ${['Nomen','Verb','Adjektiv','Adverb','Pronomen','Praeposition','Konjunktion','Interjektion','Phrase']
                                    .map(w => `<option value="${w}" ${v.wortart === w ? 'selected' : ''}>${w}</option>`).join('')}
                            </select>
                        </div>
                        <div class="formular-gruppe">
                            <label class="formular-label" for="ed-sprachniveau">${t('vokabel_editor.sprachniveau')}</label>
                            <select class="eingabe" id="ed-sprachniveau" name="sprachniveau">
                                ${['A1','A2','B1','B2','C1','C2']
                                    .map(n => `<option value="${n}" ${(v.sprachniveau || 'A1') === n ? 'selected' : ''}>${n}</option>`).join('')}
                            </select>
                        </div>
                    </div>

                    <div class="editor-formular__reihe" id="wortart-spezifisch">
                        <!-- Genus/Verbgruppe (dynamisch) -->
                    </div>

                    ${ist_admin() ? `
                    <div class="editor-formular__reihe">
                        <div class="formular-gruppe">
                            <label class="formular-label" for="ed-kategorie">${t('vokabel_editor.kategorie')}</label>
                            <select class="eingabe" id="ed-kategorie" name="kategorie_id">
                                <option value="">${t('vokabel_editor.keine_kategorie')}</option>
                            </select>
                        </div>
                    </div>
                    ` : `
                    <div class="editor-formular__reihe">
                        <div class="formular-gruppe">
                            <label class="formular-label" for="ed-lektion">${t('vokabel_editor.lektion')}</label>
                            <select class="eingabe" id="ed-lektion" name="lektion_id">
                                <option value="">${t('vokabel_editor.keine_lektion')}</option>
                            </select>
                        </div>
                    </div>
                    `}

                    <div class="formular-gruppe">
                        <label class="formular-label" for="ed-notizen">${t('vokabel_editor.notizen')}</label>
                        <textarea class="eingabe" id="ed-notizen" name="notizen" rows="2"
                            placeholder="${t('vokabel_editor.notizen_placeholder')}">${esc(v.notizen || '')}</textarea>
                    </div>
                </fieldset>

                <!-- Formen -->
                <fieldset class="editor-formular__abschnitt" id="formen-abschnitt">
                    <legend>${t('vokabel_editor.formen')}</legend>
                    <div id="formen-bereich">
                        <!-- Dynamisch je Wortart -->
                    </div>
                </fieldset>

                <!-- Synonyme -->
                <fieldset class="editor-formular__abschnitt">
                    <legend>${t('vokabel_editor.synonyme')}</legend>
                    <div id="synonyme-bereich"></div>
                    <button type="button" class="btn btn--text" id="btn-synonym-hinzufuegen">
                        <span class="material-symbols-outlined" style="font-size:18px">add</span>
                        ${t('vokabel_editor.synonym_hinzufuegen')}
                    </button>
                </fieldset>

                <!-- Aktionen -->
                <div class="editor-formular__aktionen">
                    <button type="button" class="btn btn--text" id="btn-abbrechen">${t('allgemein.abbrechen')}</button>
                    <button type="submit" class="btn btn--gefuellt" id="btn-speichern">
                        <span class="material-symbols-outlined" style="font-size:20px">save</span>
                        ${t('allgemein.speichern')}
                    </button>
                </div>
            </form>
        </div>
    `;

    // Kategorien befuellen (nur Admin)
    if (ist_admin()) {
        _kategorien_select_befuellen();
    }

    // Wortart-spezifische Felder
    _wortart_felder_aktualisieren();

    // Formen laden (bei Bearbeiten)
    _formen_rendern();

    // Synonyme rendern
    _synonyme_rendern();

    // Event-Listener
    document.getElementById('btn-zurueck')?.addEventListener('click', () => navigieren('/vokabeln'));
    document.getElementById('btn-abbrechen')?.addEventListener('click', () => navigieren('/vokabeln'));

    document.getElementById('ed-wortart')?.addEventListener('change', () => {
        _wortart_felder_aktualisieren();
        _formen_rendern();
    });

    document.getElementById('btn-synonym-hinzufuegen')?.addEventListener('click', () => {
        _synonyme.push({ synonym: '', sprache: 'de' });
        _synonyme_rendern();
    });

    document.getElementById('vokabel-form')?.addEventListener('submit', _speichern);
}

/**
 * Kategorien-Select befuellen
 */
function _kategorien_select_befuellen() {
    const select = document.getElementById('ed-kategorie');
    if (!select) return;

    const aktuelleKat = _vokabelDaten?.kategorie_id;

    function _optionen(kategorien, prefix = '') {
        for (const kat of kategorien) {
            const option = document.createElement('option');
            option.value = kat.id;
            option.textContent = prefix + kat.name;
            if (kat.id === aktuelleKat) option.selected = true;
            select.appendChild(option);

            if (kat.kinder && kat.kinder.length > 0) {
                _optionen(kat.kinder, prefix + '\u00A0\u00A0\u00A0');
            }
        }
    }

    _optionen(_kategorien);
}

/**
 * Wortart-spezifische Felder (Genus/Verbgruppe) aktualisieren
 */
function _wortart_felder_aktualisieren() {
    const container = document.getElementById('wortart-spezifisch');
    if (!container) return;

    const wortart = document.getElementById('ed-wortart')?.value || '';
    const v = _vokabelDaten || {};

    if (wortart === 'Nomen') {
        container.innerHTML = `
            <div class="formular-gruppe">
                <label class="formular-label" for="ed-genus">${t('vokabel_editor.genus')}</label>
                <select class="eingabe" id="ed-genus" name="genus" required>
                    <option value="">${t('vokabel_editor.waehlen')}</option>
                    <option value="en" ${v.genus === 'en' ? 'selected' : ''}>en (utrum)</option>
                    <option value="ett" ${v.genus === 'ett' ? 'selected' : ''}>ett (neutrum)</option>
                </select>
            </div>
        `;
    } else if (wortart === 'Verb') {
        container.innerHTML = `
            <div class="formular-gruppe">
                <label class="formular-label" for="ed-verbgruppe">${t('vokabel_editor.verbgruppe')}</label>
                <select class="eingabe" id="ed-verbgruppe" name="verbgruppe" required>
                    <option value="">${t('vokabel_editor.waehlen')}</option>
                    ${['1','2a','2b','3','4','deponens'].map(g =>
                        `<option value="${g}" ${v.verbgruppe === g ? 'selected' : ''}>${t('vokabel_editor.verbgruppe_option', {g})}</option>`
                    ).join('')}
                </select>
            </div>
        `;
    } else {
        container.innerHTML = '';
    }
}

/**
 * Formen-Felder rendern (abhaengig von Wortart)
 */
function _formen_rendern() {
    const bereich = document.getElementById('formen-bereich');
    const abschnitt = document.getElementById('formen-abschnitt');
    if (!bereich) return;

    const wortart = document.getElementById('ed-wortart')?.value || '';
    const formenDefinition = _wortart_formen()[wortart];

    if (!formenDefinition) {
        if (abschnitt) abschnitt.style.display = 'none';
        bereich.innerHTML = '';
        return;
    }

    if (abschnitt) abschnitt.style.display = '';

    // Bestehende Formen-Werte
    const bestehendeFormen = {};
    if (_vokabelDaten?.formen) {
        for (const f of _vokabelDaten.formen) {
            bestehendeFormen[f.form_bezeichnung] = f.form_wert;
        }
    }

    let html = '<div class="editor-formular__formen-grid">';

    for (const form of formenDefinition) {
        const wert = bestehendeFormen[form.key] || '';
        html += `
            <div class="formular-gruppe">
                <label class="formular-label" for="form-${form.key}">${esc(form.label)}</label>
                <input class="eingabe" type="text" id="form-${form.key}"
                    data-form="${form.key}"
                    value="${esc(wert)}"
                    placeholder="${esc(form.beispiel)}">
            </div>
        `;
    }

    html += '</div>';
    bereich.innerHTML = html;
}

/**
 * Synonyme rendern
 */
function _synonyme_rendern() {
    const bereich = document.getElementById('synonyme-bereich');
    if (!bereich) return;

    if (_synonyme.length === 0) {
        bereich.innerHTML = `<p class="editor-formular__hinweis">${t('vokabel_editor.keine_synonyme')}</p>`;
        return;
    }

    let html = '';
    _synonyme.forEach((syn, index) => {
        html += `
            <div class="editor-formular__synonym-reihe" data-index="${index}">
                <input class="eingabe eingabe--klein" type="text"
                    data-synonym-index="${index}"
                    value="${esc(syn.synonym)}"
                    placeholder="${t('vokabel_editor.synonym_placeholder')}">
                <select class="eingabe eingabe--klein" data-synonym-sprache="${index}">
                    <option value="de" ${syn.sprache === 'de' ? 'selected' : ''}>${t('vokabel_editor.sprache_deutsch')}</option>
                    <option value="sv" ${syn.sprache === 'sv' ? 'selected' : ''}>${t('vokabel_editor.sprache_schwedisch')}</option>
                </select>
                <button type="button" class="btn-icon btn-icon--gefaehrlich" data-synonym-entfernen="${index}">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
        `;
    });

    bereich.innerHTML = html;

    // Entfernen-Buttons
    bereich.querySelectorAll('[data-synonym-entfernen]').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.synonymEntfernen, 10);
            _synonyme.splice(idx, 1);
            _synonyme_rendern();
        });
    });

    // Wert-Updates
    bereich.querySelectorAll('[data-synonym-index]').forEach(input => {
        input.addEventListener('input', () => {
            const idx = parseInt(input.dataset.synonymIndex, 10);
            _synonyme[idx].synonym = input.value;
        });
    });

    bereich.querySelectorAll('[data-synonym-sprache]').forEach(select => {
        select.addEventListener('change', () => {
            const idx = parseInt(select.dataset.synonymSprache, 10);
            _synonyme[idx].sprache = select.value;
        });
    });
}

/**
 * Speichern
 */
async function _speichern(e) {
    e.preventDefault();

    const btn = document.getElementById('btn-speichern');
    if (btn) {
        btn.disabled = true;
        btn.textContent = t('vokabel_editor.speichern_laden');
    }

    // Grunddaten sammeln
    const daten = {
        schwedisch: document.getElementById('ed-schwedisch')?.value?.trim(),
        deutsch: document.getElementById('ed-deutsch')?.value?.trim(),
        wortart: document.getElementById('ed-wortart')?.value,
        sprachniveau: document.getElementById('ed-sprachniveau')?.value || 'A1',
        notizen: document.getElementById('ed-notizen')?.value?.trim() || null,
    };

    // Admin: Kategorie; Non-Admin: Lektion (optional)
    if (ist_admin()) {
        daten.kategorie_id = document.getElementById('ed-kategorie')?.value || null;
    } else {
        const lekVal = document.getElementById('ed-lektion')?.value;
        if (lekVal) daten.lektion_id = parseInt(lekVal, 10);
    }

    // Genus/Verbgruppe
    if (daten.wortart === 'Nomen') {
        daten.genus = document.getElementById('ed-genus')?.value || null;
    } else if (daten.wortart === 'Verb') {
        daten.verbgruppe = document.getElementById('ed-verbgruppe')?.value || null;
    }

    // Formen sammeln
    const formen = [];
    document.querySelectorAll('[data-form]').forEach(input => {
        const wert = input.value.trim();
        if (wert) {
            formen.push({
                form_bezeichnung: input.dataset.form,
                form_wert: wert,
            });
        }
    });

    // Synonyme (aktuelle Werte aus Feldern lesen)
    document.querySelectorAll('[data-synonym-index]').forEach(input => {
        const idx = parseInt(input.dataset.synonymIndex, 10);
        if (_synonyme[idx]) {
            _synonyme[idx].synonym = input.value.trim();
        }
    });

    const synonyme = _synonyme.filter(s => s.synonym);

    // Validierung
    if (!daten.schwedisch || !daten.deutsch || !daten.wortart) {
        fehler(t('vokabel_editor.pflichtfelder'));
        _btn_zuruecksetzen(btn);
        return;
    }

    try {
        let ergebnis;

        if (_modus === 'neu') {
            // Alles in einem Request
            daten.formen = formen;
            daten.synonyme = synonyme;
            ergebnis = await apiPost('vokabeln/erstellen.php', daten);
        } else {
            // Vokabel aktualisieren
            ergebnis = await apiPut(`vokabeln/aktualisieren.php?id=${_vokabelId}`, daten);
        }

        if (!ergebnis.erfolg) {
            apiFehlerAnzeigen(ergebnis);
            _btn_zuruecksetzen(btn);
            return;
        }

        const vokabelId = _modus === 'neu' ? ergebnis.daten.id : _vokabelId;

        // Bei Bearbeiten: Formen und Synonyme separat speichern
        if (_modus === 'bearbeiten') {
            // Formen speichern
            const formenErg = await apiPost(`vokabeln/formen_speichern.php?id=${vokabelId}`, { formen });
            if (!formenErg.erfolg) {
                console.warn('Formen speichern fehlgeschlagen:', formenErg);
            }

            // Synonyme speichern
            const synErg = await apiPost(`vokabeln/synonyme_speichern.php?id=${vokabelId}`, { synonyme });
            if (!synErg.erfolg) {
                console.warn('Synonyme speichern fehlgeschlagen:', synErg);
            }
        }

        erfolg(_modus === 'neu' ? t('vokabel_editor.erstellt') : t('vokabel_editor.aktualisiert'));
        navigieren('/vokabeln');

    } catch (err) {
        fehler(t('vokabel_editor.speichern_fehler'));
        console.error('Speichern-Fehler:', err);
        _btn_zuruecksetzen(btn);
    }
}

function _btn_zuruecksetzen(btn) {
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:20px">save</span> ${t('allgemein.speichern')}`;
    }
}

export function aufraeumen() {
    _modus = 'neu';
    _vokabelId = null;
    _vokabelDaten = null;
    _synonyme = [];
}
