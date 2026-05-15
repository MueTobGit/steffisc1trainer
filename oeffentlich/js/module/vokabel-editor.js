/**
 * Vokabel-Editor — Erstellen / Bearbeiten
 *
 * Tab-Reihenfolge: englisch → deutsch → wortart → Speichern&Nächste → Speichern → Abbrechen → sekundäre Felder
 * Neu-Modus: Kategorie, Sprachniveau und Themenfeld aus letzter Eingabe vorbelegen.
 */

import { apiGet, apiPost, apiPut } from '../api-client.js';
import { ist_admin, holen } from '../zustand.js';
import { navigieren } from '../router.js';
import { esc } from '../hilfs-funktionen.js';
import { t } from '../dienste/sprache.js';
import { lade_anzeige_rendern } from '../komponenten/lade-anzeige.js';
import { erfolg, fehler, apiFehlerAnzeigen } from '../benachrichtigungen.js';

// LS-Keys für gemerkerte Werte
const LS_KATEGORIE   = 'vt_vok_kategorie';
const LS_NIVEAU      = 'vt_vok_niveau';
const LS_THEMENFELD  = 'vt_vok_themenfeld';

let _modus = 'neu'; // 'neu' | 'bearbeiten'
let _vokabelId = null;
let _vokabelDaten = null;
let _synonyme = [];
let _kategorien = [];
let _themenfelder = [];
let _naechste = false; // Flag: "Speichern und nächste" wurde gedrückt

export async function rendern(params = {}) {
    const container = document.getElementById('inhalt');
    if (!container) return;

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

    // Kategorien + Themenfelder parallel laden
    const admin = ist_admin();
    const [katErg, tfErg] = await Promise.all([
        admin ? apiGet('kategorien/liste.php') : Promise.resolve({ erfolg: false }),
        apiGet('themenfelder/liste.php', { pro_seite: 500 }),
    ]);

    _kategorien  = katErg.erfolg ? (katErg.daten || []) : [];
    _themenfelder = tfErg.erfolg ? (tfErg.daten?.eintraege || []) : [];

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

        const benutzer = holen('benutzer');
        const istEigenePrivate = _vokabelDaten.ist_privat && _vokabelDaten.besitzer_id === benutzer?.id;
        if (!admin && !istEigenePrivate) {
            fehler(t('vokabel_editor.keine_berechtigung') || 'Diese Vokabel kann nur von Administratoren bearbeitet werden.');
            navigieren('/vokabeln');
            return;
        }
    }

    _formular_rendern(container);
}

function _formular_rendern(container) {
    const admin = ist_admin();
    const v = _vokabelDaten || {};
    const titel = _modus === 'neu'
        ? t('vokabel_editor.titel_neu')
        : t('vokabel_editor.titel_bearbeiten', { wort: v.englisch || t('vokabel_liste.titel') });

    // Gemerkte Werte (nur im Neu-Modus)
    const letzteKat    = _modus === 'neu' ? (localStorage.getItem(LS_KATEGORIE) || '')  : '';
    const letztesNiv   = _modus === 'neu' ? (localStorage.getItem(LS_NIVEAU)    || 'C1') : (v.sprachniveau || 'C1');
    const letztesTf    = _modus === 'neu' ? (localStorage.getItem(LS_THEMENFELD) || '') : '';

    // Themenfeld-Optionen (details.php liefert themenfelder[] Array — erstes Themenfeld vorauswaehlen)
    const aktuellesTfId = _modus === 'neu' ? letztesTf : String(v.themenfelder?.[0]?.id || '');
    const tfOptionen = _themenfelder.map(tf =>
        `<option value="${tf.id}" ${aktuellesTfId === String(tf.id) ? 'selected' : ''}>
            ${esc(tf.titel)}${tf.kategorie_name ? ' · ' + esc(tf.kategorie_name) : ''}
        </option>`
    ).join('');

    container.innerHTML = `
        <div class="editor-formular">
            <div class="editor-formular__kopf">
                <button class="btn btn--text" id="btn-zurueck" tabindex="-1">
                    <span class="material-symbols-outlined" style="font-size:20px">arrow_back</span>
                    ${t('vokabel_editor.zurueck')}
                </button>
                <h2>${esc(titel)}</h2>
            </div>

            <form id="vokabel-form" class="editor-formular__inhalt">
                <!-- Primäre Pflichtfelder -->
                <fieldset class="editor-formular__abschnitt">
                    <legend>${t('vokabel_editor.grunddaten')}</legend>

                    <div class="editor-formular__reihe">
                        <div class="formular-gruppe">
                            <label class="formular-label" for="ed-englisch">Englisch</label>
                            <input class="eingabe" type="text" id="ed-englisch" name="englisch"
                                value="${esc(v.englisch || '')}" required tabindex="1"
                                placeholder="z.B. to accomplish" autocomplete="off">
                        </div>
                        <div class="formular-gruppe">
                            <label class="formular-label" for="ed-deutsch">${t('vokabel_editor.deutsch')}</label>
                            <input class="eingabe" type="text" id="ed-deutsch" name="deutsch"
                                value="${esc(v.deutsch || '')}" required tabindex="2"
                                placeholder="${t('vokabel_editor.deutsch_placeholder')}" autocomplete="off">
                        </div>
                    </div>

                    <div class="editor-formular__reihe">
                        <div class="formular-gruppe">
                            <label class="formular-label" for="ed-wortart">${t('vokabel_editor.wortart')}</label>
                            <select class="eingabe" id="ed-wortart" name="wortart" required tabindex="3">
                                <option value="">${t('vokabel_editor.waehlen')}</option>
                                ${['Nomen','Verb','Adjektiv','Adverb','Pronomen','Praeposition','Konjunktion','Interjektion','Phrase']
                                    .map(w => `<option value="${w}" ${v.wortart === w ? 'selected' : ''}>${w}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                </fieldset>

                <!-- Sekundäre Felder -->
                <fieldset class="editor-formular__abschnitt">
                    <legend>${t('vokabel_editor.weitere_angaben')}</legend>

                    <div class="editor-formular__reihe">
                        <div class="formular-gruppe">
                            <label class="formular-label" for="ed-sprachniveau">${t('vokabel_editor.sprachniveau')}</label>
                            <select class="eingabe" id="ed-sprachniveau" name="sprachniveau" tabindex="7">
                                ${['A1','A2','B1','B2','C1','C2']
                                    .map(n => `<option value="${n}" ${letztesNiv === n ? 'selected' : ''}>${n}</option>`).join('')}
                            </select>
                        </div>

                        ${admin ? `
                        <div class="formular-gruppe">
                            <label class="formular-label" for="ed-kategorie">${t('vokabel_editor.kategorie')}</label>
                            <select class="eingabe" id="ed-kategorie" name="kategorie_id" tabindex="8">
                                <option value="">${t('vokabel_editor.keine_kategorie')}</option>
                            </select>
                        </div>
                        ` : ''}

                        <div class="formular-gruppe">
                            <label class="formular-label" for="ed-themenfeld">${t('vokabel_editor.themenfeld')}</label>
                            <select class="eingabe" id="ed-themenfeld" name="themenfeld_id" tabindex="9">
                                <option value="">${t('vokabel_editor.kein_themenfeld')}</option>
                                ${tfOptionen}
                            </select>
                        </div>
                    </div>

                    <div class="formular-gruppe">
                        <label class="formular-label" for="ed-notizen">${t('vokabel_editor.notizen')}</label>
                        <textarea class="eingabe" id="ed-notizen" name="notizen" rows="2" tabindex="10"
                            placeholder="${t('vokabel_editor.notizen_placeholder')}">${esc(v.notizen || '')}</textarea>
                    </div>
                </fieldset>

                <!-- Synonyme -->
                <fieldset class="editor-formular__abschnitt">
                    <legend>${t('vokabel_editor.synonyme')}</legend>
                    <div class="editor-formular__synonym-gruppe">
                        <div class="editor-formular__synonym-gruppe-titel">${t('vokabel_editor.en_synonyme')}</div>
                        <div class="editor-formular__synonym-hinweis">${t('vokabel_editor.en_synonym_hinweis')}</div>
                        <div id="synonyme-en-bereich"></div>
                        <button type="button" class="btn btn--text btn--klein" id="btn-synonym-en-hinzufuegen" tabindex="-1">
                            <span class="material-symbols-outlined" style="font-size:16px">add</span>
                            ${t('vokabel_editor.en_synonym_hinzufuegen')}
                        </button>
                    </div>
                    <div class="editor-formular__synonym-gruppe" style="margin-top:12px">
                        <div class="editor-formular__synonym-gruppe-titel">${t('vokabel_editor.de_synonyme')}</div>
                        <div class="editor-formular__synonym-hinweis">${t('vokabel_editor.de_synonym_hinweis')}</div>
                        <div id="synonyme-de-bereich"></div>
                        <button type="button" class="btn btn--klein btn--text" id="btn-synonym-de-hinzufuegen" tabindex="-1">
                            <span class="material-symbols-outlined" style="font-size:16px">add</span>
                            ${t('vokabel_editor.de_synonym_hinzufuegen')}
                        </button>
                    </div>
                </fieldset>

                <!-- Aktionen — visuell unten, Tab-Reihenfolge 4/5/6 via tabindex -->
                <div class="editor-formular__aktionen" id="aktionen-unten">
                    ${_modus === 'neu' ? `
                    <button type="button" class="btn btn--gefuellt" id="btn-speichern-naechste" tabindex="4">
                        <span class="material-symbols-outlined" style="font-size:20px">save</span>
                        ${t('vokabel_editor.speichern_und_naechste')}
                    </button>
                    ` : ''}
                    <button type="submit" class="btn ${_modus === 'neu' ? 'btn--umrandet' : 'btn--gefuellt'}" id="btn-speichern" tabindex="5">
                        <span class="material-symbols-outlined" style="font-size:20px">save</span>
                        ${t('allgemein.speichern')}
                    </button>
                    <button type="button" class="btn btn--text" id="btn-abbrechen" tabindex="6">${t('allgemein.abbrechen')}</button>
                </div>
            </form>
        </div>
    `;

    // Kategorien-Select befüllen (nur Admin)
    if (admin) {
        _kategorien_select_befuellen(letzteKat);
    }

    _synonyme_rendern();

    // Event-Listener
    document.getElementById('btn-zurueck')?.addEventListener('click', () => navigieren('/vokabeln'));
    document.getElementById('btn-abbrechen')?.addEventListener('click', () => navigieren('/vokabeln'));

    document.getElementById('btn-synonym-en-hinzufuegen')?.addEventListener('click', () => {
        _synonyme.push({ synonym: '', sprache: 'en' });
        _synonyme_rendern();
    });

    document.getElementById('btn-synonym-de-hinzufuegen')?.addEventListener('click', () => {
        _synonyme.push({ synonym: '', sprache: 'de' });
        _synonyme_rendern();
    });

    document.getElementById('btn-speichern-naechste')?.addEventListener('click', () => {
        _naechste = true;
        document.getElementById('vokabel-form')?.requestSubmit();
    });

    document.getElementById('vokabel-form')?.addEventListener('submit', e => {
        if (!_naechste) {
            // normaler Submit: _naechste bleibt false
        }
        _speichern(e);
    });

    // Englisch-Feld fokussieren
    document.getElementById('ed-englisch')?.focus();
}

function _kategorien_select_befuellen(letzteKat = '') {
    const select = document.getElementById('ed-kategorie');
    if (!select) return;

    const aktuelleKat = _vokabelDaten?.kategorie_id
        ? String(_vokabelDaten.kategorie_id)
        : letzteKat;

    function _optionen(kategorien, prefix = '') {
        for (const kat of kategorien) {
            const option = document.createElement('option');
            option.value = kat.id;
            option.textContent = prefix + kat.name;
            if (String(kat.id) === aktuelleKat) option.selected = true;
            select.appendChild(option);
            if (kat.kinder?.length > 0) {
                _optionen(kat.kinder, prefix + '   ');
            }
        }
    }

    _optionen(_kategorien);
}

function _synonyme_rendern() {
    _synonyme_gruppe_rendern('en', 'synonyme-en-bereich');
    _synonyme_gruppe_rendern('de', 'synonyme-de-bereich');
}

function _synonyme_gruppe_rendern(sprache, bereachId) {
    const bereich = document.getElementById(bereachId);
    if (!bereich) return;

    const hat_eintraege = _synonyme.some(s => s.sprache === sprache);
    if (!hat_eintraege) {
        bereich.innerHTML = `<p class="editor-formular__hinweis" style="margin:4px 0 6px">${t('vokabel_editor.keine_synonyme')}</p>`;
        return;
    }

    let html = '';
    _synonyme.forEach((syn, index) => {
        if (syn.sprache !== sprache) return;
        html += `
            <div class="editor-formular__synonym-reihe">
                <input class="eingabe eingabe--klein" type="text" tabindex="-1"
                    data-synonym-index="${index}"
                    value="${esc(syn.synonym)}"
                    placeholder="${t('vokabel_editor.synonym_placeholder')}">
                <button type="button" class="btn-icon btn-icon--gefaehrlich" tabindex="-1"
                    data-synonym-entfernen="${index}">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
        `;
    });

    bereich.innerHTML = html;

    bereich.querySelectorAll('[data-synonym-entfernen]').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.synonymEntfernen, 10);
            _synonyme.splice(idx, 1);
            _synonyme_rendern();
        });
    });

    bereich.querySelectorAll('[data-synonym-index]').forEach(input => {
        input.addEventListener('input', () => {
            const idx = parseInt(input.dataset.synonymIndex, 10);
            if (_synonyme[idx]) _synonyme[idx].synonym = input.value;
        });
    });
}

async function _speichern(e) {
    e.preventDefault();
    const naechste = _naechste;
    _naechste = false;

    const btn = naechste
        ? document.getElementById('btn-speichern-naechste')
        : document.getElementById('btn-speichern');
    if (btn) {
        btn.disabled = true;
        btn.textContent = t('vokabel_editor.speichern_laden');
    }

    const daten = {
        englisch:     document.getElementById('ed-englisch')?.value?.trim(),
        deutsch:      document.getElementById('ed-deutsch')?.value?.trim(),
        wortart:      document.getElementById('ed-wortart')?.value,
        sprachniveau: document.getElementById('ed-sprachniveau')?.value || 'C1',
        notizen:      document.getElementById('ed-notizen')?.value?.trim() || null,
    };

    const admin = ist_admin();
    if (admin) {
        daten.kategorie_id = document.getElementById('ed-kategorie')?.value || null;
    }
    // themenfeld_id immer senden (0 = kein Themenfeld), damit Entfernen einer Zuordnung funktioniert
    const tfVal = document.getElementById('ed-themenfeld')?.value;
    if (!admin) daten.themenfeld_id = tfVal ? parseInt(tfVal, 10) : 0;

    // Synonyme aus Feldern lesen
    document.querySelectorAll('[data-synonym-index]').forEach(input => {
        const idx = parseInt(input.dataset.synonymIndex, 10);
        if (_synonyme[idx]) _synonyme[idx].synonym = input.value.trim();
    });
    const synonyme = _synonyme.filter(s => s.synonym);

    if (!daten.englisch || !daten.deutsch || !daten.wortart) {
        fehler(t('vokabel_editor.pflichtfelder'));
        _btn_zuruecksetzen(btn, naechste);
        return;
    }

    try {
        let ergebnis;
        if (_modus === 'neu') {
            daten.synonyme = synonyme;
            ergebnis = await apiPost('vokabeln/erstellen.php', daten);
        } else {
            ergebnis = await apiPut(`vokabeln/aktualisieren.php?id=${_vokabelId}`, daten);
        }

        if (!ergebnis.erfolg) {
            apiFehlerAnzeigen(ergebnis);
            _btn_zuruecksetzen(btn, naechste);
            return;
        }

        const vokabelId = _modus === 'neu' ? ergebnis.daten.id : _vokabelId;

        if (_modus === 'bearbeiten') {
            const synErg = await apiPost(`vokabeln/synonyme_speichern.php?id=${vokabelId}`, { synonyme });
            if (!synErg.erfolg) console.warn('Synonyme speichern fehlgeschlagen:', synErg);
        }

        // Werte merken (nur im Neu-Modus sinnvoll)
        if (_modus === 'neu') {
            const katVal = document.getElementById('ed-kategorie')?.value || '';
            const nivVal = document.getElementById('ed-sprachniveau')?.value || 'C1';
            const tfSel  = document.getElementById('ed-themenfeld')?.value || '';
            if (katVal) localStorage.setItem(LS_KATEGORIE,  katVal);
            localStorage.setItem(LS_NIVEAU,     nivVal);
            if (tfSel)  localStorage.setItem(LS_THEMENFELD, tfSel);
        }

        erfolg(_modus === 'neu' ? t('vokabel_editor.erstellt') : t('vokabel_editor.aktualisiert'));

        if (naechste && _modus === 'neu') {
            // Formular zurücksetzen, Fokus auf Englisch
            _vokabelDaten = null;
            _synonyme = [];
            _formular_rendern(document.getElementById('inhalt'));
        } else {
            navigieren('/vokabeln');
        }

    } catch (err) {
        fehler(t('vokabel_editor.speichern_fehler'));
        console.error('Speichern-Fehler:', err);
        _btn_zuruecksetzen(btn, naechste);
    }
}

function _btn_zuruecksetzen(btn, naechste) {
    if (!btn) return;
    btn.disabled = false;
    if (naechste) {
        btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:20px">save</span> ${t('vokabel_editor.speichern_und_naechste')}`;
    } else {
        btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:20px">save</span> ${t('allgemein.speichern')}`;
    }
}

export function aufraeumen() {
    _modus = 'neu';
    _vokabelId = null;
    _vokabelDaten = null;
    _synonyme = [];
    _themenfelder = [];
    _naechste = false;
}
