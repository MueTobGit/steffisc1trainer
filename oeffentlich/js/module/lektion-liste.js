/**
 * Lektion-Liste — Nach Kategorie gruppiert
 *
 * Vokabel-Zuordnung mit Suchfeld + Checkboxen.
 * Unterstuetzt URL-Query-Parameter: ?kategorie=ID&neu=1
 * (werden von kategorie-liste.js beim Navigieren gesetzt)
 */

import { apiPaginiert, apiGet, apiPost, apiPut, apiDelete } from '../api-client.js';
import { ist_admin, holen } from '../zustand.js';
import { navigieren } from '../router.js';
import { esc, entprellen } from '../hilfs-funktionen.js';
import { t } from '../dienste/sprache.js';
import { paginierung_rendern } from '../komponenten/paginierung.js';
import { lade_anzeige_rendern } from '../komponenten/lade-anzeige.js';
import { leer_zustand_rendern } from '../komponenten/leer-zustand.js';
import { bestaetigung_anzeigen } from '../komponenten/bestaetigung-dialog.js';
import { erfolg, fehler, apiFehlerAnzeigen } from '../benachrichtigungen.js';

let _seite = 1;
let _filterKategorie = '';
let _ausgewaehlteLektion = null;
let _alleKategorien = []; // Cache fuer Dropdown
let _lernpfadDaten = null; // { freigeschalteteIds: Set<number> } oder null wenn Lernpfad inaktiv

// Hash-Query-Parameter auslesen (z.B. #/lektionen?kategorie=5&neu=1)
function _hash_params() {
    const hash = window.location.hash || '';
    const fragezeichen = hash.indexOf('?');
    if (fragezeichen === -1) return {};
    const query = hash.slice(fragezeichen + 1);
    const params = {};
    for (const teil of query.split('&')) {
        const [key, val] = teil.split('=');
        if (key) params[decodeURIComponent(key)] = decodeURIComponent(val || '');
    }
    return params;
}

export async function rendern() {
    const container = document.getElementById('inhalt');
    if (!container) return;

    // URL-Parameter auswerten
    const params = _hash_params();
    if (params.kategorie) {
        _filterKategorie = params.kategorie;
    }

    const benutzer = holen('benutzer');

    container.innerHTML = `
        <div class="verwaltung">

            <div class="verwaltung__kopf">
                <h2 class="verwaltung__titel">${t('lektion_liste.titel')}</h2>
                <button class="btn btn--gefuellt" id="btn-lektion-neu">
                    <span class="material-symbols-outlined" style="font-size:20px">add</span>
                    ${ist_admin() ? t('lektion_liste.neue_lektion') : t('lektion_liste.meine_lektion')}
                </button>
            </div>

            <!-- Filter -->
            <div class="filter-leiste">
                <div class="filter-leiste__feld">
                    <select class="eingabe eingabe--klein" id="filter-lektion-kategorie">
                        <option value="">${t('lektion_liste.alle_kategorien')}</option>
                    </select>
                </div>
            </div>

            <!-- Formular -->
            <div id="lektion-formular" class="versteckt"></div>

            <!-- Zuordnung -->
            <div id="lektion-zuordnung" class="versteckt"></div>

            <!-- Liste -->
            <div id="lektion-inhalt"></div>
            <div id="lektion-paginierung"></div>
        </div>
    `;

    document.getElementById('btn-lektion-neu')?.addEventListener('click', () => {
        // Aktiv gesetzten Kategorie-Filter als Vorauswahl mitgeben
        _formular_anzeigen(null, _filterKategorie || null);
    });

    document.getElementById('filter-lektion-kategorie')?.addEventListener('change', (e) => {
        _filterKategorie = e.target.value;
        _seite = 1;
        _laden();
    });

    _kategorien_laden().then(async () => {
        // Filter-Select auf URL-Parameter setzen (nach dem Laden der Optionen)
        if (_filterKategorie) {
            const sel = document.getElementById('filter-lektion-kategorie');
            if (sel) sel.value = _filterKategorie;
        }

        // Wenn ?neu=1 in URL → Formular direkt öffnen
        if (params.neu === '1') {
            _formular_anzeigen(null, _filterKategorie || null);
        }
    });

    await _lernpfad_laden();
    _laden();
}

async function _lernpfad_laden() {
    const erg = await apiGet('lektionen/lernpfad.php');
    if (!erg.erfolg) { _lernpfadDaten = null; return; }
    const freigeschaltet = (erg.daten?.lektionen || []).filter(l => l.freigeschaltet);
    _lernpfadDaten = {
        freigeschalteteIds: new Set(freigeschaltet.map(l => l.id)),
        lektionen: freigeschaltet,
    };
}

async function _kategorien_laden() {
    const erg = await apiGet('kategorien/liste.php');
    if (erg.erfolg) {
        _alleKategorien = erg.daten || [];
        const select = document.getElementById('filter-lektion-kategorie');
        if (select) {
            function _optionen(kats, prefix = '') {
                for (const k of kats) {
                    const opt = document.createElement('option');
                    opt.value = k.id;
                    opt.textContent = prefix + k.name;
                    select.appendChild(opt);
                    if (k.kinder) _optionen(k.kinder, prefix + '\u00A0\u00A0');
                }
            }
            _optionen(_alleKategorien);
        }
    }
}

async function _laden() {
    const inhalt = document.getElementById('lektion-inhalt');
    if (!inhalt) return;

    lade_anzeige_rendern(inhalt);

    const apiParams = { pro_seite: 200 }; // Alle auf einmal für Kategorien-Gruppierung
    if (_filterKategorie) apiParams.kategorie_id = _filterKategorie;
    if (ist_admin()) apiParams.auch_private = 1;

    const erg = await apiPaginiert('lektionen/liste.php', 1, apiParams);

    if (!erg.erfolg) {
        apiFehlerAnzeigen(erg);
        return;
    }

    let lektionen = erg.daten.eintraege || [];

    if (lektionen.length === 0) {
        leer_zustand_rendern(inhalt, 'menu_book', t('lektion_liste.keine_lektionen'), t('lektion_liste.keine_lektionen_text'),
            ist_admin() ? t('lektion_liste.erste_lektion') : '',
            ist_admin() ? () => _formular_anzeigen(null, _filterKategorie || null) : null);
        document.getElementById('lektion-paginierung').innerHTML = '';
        return;
    }

    _liste_rendern(inhalt, lektionen);
    document.getElementById('lektion-paginierung').innerHTML = ''; // Keine Paginierung mehr nötig
}

function _liste_rendern(container, lektionen) {
    const admin = ist_admin();
    const benutzer = holen('benutzer');

    // Nach Kategorie gruppieren
    const gruppen = new Map(); // kategorieKey → { name, icon, privat, lektionen[] }
    for (const l of lektionen) {
        const istEigeneGruppierung = l.ist_privat || (benutzer && l.besitzer_id != null
            && parseInt(l.besitzer_id, 10) === parseInt(benutzer.id, 10));

        let key, name;
        if (istEigeneGruppierung) {
            if (admin && l.besitzer_id) {
                // Admin: separate Supergruppe pro Benutzer
                key  = `__privat__${l.besitzer_id}`;
                name = t('lektion_liste.benutzer_privat', {name: l.besitzer_name || ('Benutzer ' + l.besitzer_id)});
            } else {
                key  = '__privat__';
                name = t('lektion_liste.meine_privaten');
            }
        } else if (l.kategorie_name) {
            key  = l.kategorie_id ? String(l.kategorie_id) : '__ohne__';
            name = l.kategorie_name;
        } else {
            key  = '__ohne__';
            name = t('lektion_liste.ohne_kategorie');
        }

        if (!gruppen.has(key)) {
            gruppen.set(key, {
                name,
                icon:   istEigeneGruppierung ? 'lock' : 'folder',
                privat: istEigeneGruppierung,
                lektionen: [],
            });
        }
        gruppen.get(key).lektionen.push(l);
    }

    // Sortierung: benannte Kategorien alphabetisch, dann "Ohne Kategorie", dann private Supergruppen
    const sortiert = [...gruppen.entries()].sort(([ka, a], [kb, b]) => {
        const aPrivat = ka.startsWith('__privat__');
        const bPrivat = kb.startsWith('__privat__');
        if (aPrivat && !bPrivat) return 1;
        if (!aPrivat && bPrivat) return -1;
        if (ka === '__ohne__') return 1;
        if (kb === '__ohne__') return -1;
        return a.name.localeCompare(b.name, 'de');
    });

    let html = '';

    for (const [key, gruppe] of sortiert) {
        const privatKlasse = gruppe.privat ? ' lektion-gruppe--privat lektion-gruppe--kollabiert' : '';
        const chevronHtml  = gruppe.privat
            ? `<span class="material-symbols-outlined lektion-gruppe__chevron">chevron_right</span>`
            : '';
        html += `
            <div class="lektion-gruppe${privatKlasse}" data-gruppe-key="${esc(key)}">
                <h3 class="lektion-gruppe__titel${gruppe.privat ? ' lektion-gruppe__titel--klickbar' : ''}">
                    <span class="material-symbols-outlined">${gruppe.icon}</span>
                    ${chevronHtml}
                    ${esc(gruppe.name)}
                    <span class="lektion-gruppe__anzahl">${gruppe.lektionen.length}</span>
                </h3>
                <div class="lektion-grid lektion-gruppe__inhalt">
        `;

        for (const l of gruppe.lektionen) {
            const istPrivat      = !!l.ist_privat;
            const istEigene      = benutzer && l.besitzer_id != null
                && parseInt(l.besitzer_id, 10) === parseInt(benutzer.id, 10);
            const kannLoeschen   = admin || istEigene;
            const kannBearbeiten = admin || (istEigene && istPrivat);

            const lernpfadInfo = _lernpfadDaten
                ? (_lernpfadDaten.lektionen?.find(lp => lp.id === l.id) || null)
                : null;

            html += `
                <div class="karte karte--erhoeht lektion-karte${istPrivat ? ' lektion-karte--privat' : ''}" data-id="${l.id}">
                    <div class="lektion-karte__kopf">
                        <span class="material-symbols-outlined lektion-karte__icon">${istPrivat ? 'lock' : 'menu_book'}</span>
                        <div>
                            <h3 class="lektion-karte__titel">${esc(l.titel)}</h3>
                        </div>
                    </div>
                    ${l.beschreibung ? `<p class="lektion-karte__beschreibung">${esc(l.beschreibung)}</p>` : ''}
                    <div class="lektion-karte__info">
                        <span class="tag tag--${(l.sprachniveau || 'a1').toLowerCase()}">${esc(l.sprachniveau)}</span>
                        <span>${t('lektion_liste.vokabeln_anzahl', {anzahl: l.vokabel_anzahl})}</span>
                        ${lernpfadInfo ? `
                            <span class="lernpfad-fortschritt" title="${t('lektion_liste.stufe3_prozent', {prozent: Math.round(lernpfadInfo.stufe3_anteil * 100)})}">
                                <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">${lernpfadInfo.erste_der_kategorie ? 'star' : 'route'}</span>
                                ${Math.round(lernpfadInfo.stufe3_anteil * 100)}%
                            </span>
                        ` : ''}
                    </div>
                    ${l.vokabel_anzahl > 0 ? `
                        <div class="lektion-karte__fortschritt">
                            <div class="lektion-karte__fortschritt-bar">
                                <div class="lektion-karte__fortschritt-fill" style="width:${Math.round((l.stufe4_anteil || 0) * 100)}%"></div>
                            </div>
                            <span class="lektion-karte__fortschritt-text">${t('lektion_liste.gelernt_prozent', {prozent: Math.round((l.stufe4_anteil || 0) * 100)})}</span>
                        </div>
                    ` : ''}
                    <div class="lektion-karte__aktionen">
                        <button class="btn btn--text btn--klein" data-aktion="vokabeln-ansehen" data-id="${l.id}">
                            <span class="material-symbols-outlined" style="font-size:16px">list</span>
                            ${t('lektion_liste.vokabeln_ansehen')}
                        </button>
                        ${(admin || (istEigene && istPrivat)) ? `
                            <button class="btn btn--text btn--klein" data-aktion="zuordnen" data-id="${l.id}">
                                ${t('lektion_liste.vokabeln_zuordnen')}
                            </button>
                        ` : ''}
                        ${kannBearbeiten ? `
                            <button class="btn-icon" data-aktion="bearbeiten" data-id="${l.id}" title="${t('allgemein.bearbeiten')}">
                                <span class="material-symbols-outlined">edit</span>
                            </button>
                        ` : ''}
                        ${kannLoeschen ? `
                            <button class="btn-icon btn-icon--gefaehrlich" data-aktion="loeschen" data-id="${l.id}"
                                data-titel="${esc(l.titel)}" title="${t('allgemein.loeschen')}">
                                <span class="material-symbols-outlined">delete</span>
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }

        html += `</div></div>`; // lektion-grid + lektion-gruppe
    }

    container.innerHTML = html;

    // Collapsible: private Supergruppen auf-/zuklappen
    container.querySelectorAll('.lektion-gruppe__titel--klickbar').forEach(titel => {
        titel.addEventListener('click', () => {
            titel.closest('.lektion-gruppe').classList.toggle('lektion-gruppe--kollabiert');
        });
    });

    // Events
    container.querySelectorAll('[data-aktion="vokabeln-ansehen"]').forEach(btn => {
        btn.addEventListener('click', () => {
            navigieren(`/vokabeln?themenfeld_id=${btn.dataset.id}`);
        });
    });

    container.querySelectorAll('[data-aktion="bearbeiten"]').forEach(btn => {
        btn.addEventListener('click', () => _formular_anzeigen(parseInt(btn.dataset.id, 10), null));
    });

    container.querySelectorAll('[data-aktion="loeschen"]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const lektTitel = btn.dataset.titel || '';
            const ok = await bestaetigung_anzeigen(
                t('lektion_liste.loeschen_titel'),
                t('lektion_liste.loeschen_text', {titel: lektTitel}),
                t('allgemein.loeschen'), t('allgemein.abbrechen'), true
            );
            if (ok) {
                const erg = await apiDelete(`lektionen/loeschen.php?id=${btn.dataset.id}`);
                if (erg.erfolg) {
                    erfolg(t('lektion_liste.geloescht'));
                    _laden();
                } else apiFehlerAnzeigen(erg);
            }
        });
    });

    container.querySelectorAll('[data-aktion="zuordnen"]').forEach(btn => {
        btn.addEventListener('click', () => _zuordnung_anzeigen(parseInt(btn.dataset.id, 10)));
    });
}

/**
 * Formular anzeigen.
 * @param {number|null} bearbeitenId  — null = neue Lektion
 * @param {string|number|null} vorauswahl_kategorie_id — Kategorie vorauswaehlen (nur bei neu)
 */
async function _formular_anzeigen(bearbeitenId, vorauswahl_kategorie_id) {
    const container = document.getElementById('lektion-formular');
    if (!container) return;

    container.classList.remove('versteckt');
    // Kurze Lademarkierung waehrend Daten geholt werden
    container.innerHTML = `<div class="karte editor-formular__inline"><p>${t('lektion_liste.formular_laden')}</p></div>`;

    let titel = '';
    let beschreibung = '';
    let kategorie_id = vorauswahl_kategorie_id ? String(vorauswahl_kategorie_id) : '';
    let sprachniveau = 'A1';

    if (bearbeitenId) {
        const erg = await apiGet(`lektionen/details.php?id=${bearbeitenId}`);
        if (erg.erfolg) {
            titel       = erg.daten.titel || '';
            beschreibung = erg.daten.beschreibung || '';
            kategorie_id = erg.daten.kategorie_id != null ? String(erg.daten.kategorie_id) : '';
            sprachniveau = erg.daten.sprachniveau || 'A1';
        }
    }

    // Kategorien aus Cache oder neu laden
    if (_alleKategorien.length === 0) {
        const katErg = await apiGet('kategorien/liste.php');
        if (katErg.erfolg) _alleKategorien = katErg.daten || [];
    }

    const kategorienOptionen = _kategorien_optionen_bauen(_alleKategorien);

    const admin = ist_admin();

    container.innerHTML = `
        <div class="karte editor-formular__inline">
            <h3>${bearbeitenId ? t('lektion_liste.bearbeiten_titel') : (admin ? t('lektion_liste.neue_lektion') : t('lektion_liste.meine_lektion'))}</h3>
            ${!admin && !bearbeitenId ? `
                <p class="editor-formular__hinweis" style="margin-bottom:12px">
                    <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle">lock</span>
                    ${t('lektion_liste.privat_hinweis')}
                </p>
            ` : ''}
            <div class="editor-formular__reihe">
                <div class="formular-gruppe">
                    <label class="formular-label">${t('lektion_liste.titel_label')}</label>
                    <input class="eingabe" type="text" id="lekt-titel" value="${esc(titel)}" required>
                </div>
                <div class="formular-gruppe">
                    <label class="formular-label">${t('lektion_liste.sprachniveau_label')}</label>
                    <select class="eingabe" id="lekt-niveau">
                        ${['A1','A2','B1','B2','C1','C2'].map(n =>
                            `<option value="${n}" ${sprachniveau === n ? 'selected' : ''}>${n}</option>`
                        ).join('')}
                    </select>
                </div>
            </div>
            ${admin ? `
                <div class="editor-formular__reihe">
                    <div class="formular-gruppe">
                        <label class="formular-label">${t('lektion_liste.kategorie_label')}</label>
                        <select class="eingabe" id="lekt-kategorie">
                            <option value="">${t('lektion_liste.keine_kategorie')}</option>
                            ${kategorienOptionen}
                        </select>
                    </div>
                </div>
            ` : ''}
            <div class="formular-gruppe">
                <label class="formular-label">${t('lektion_liste.beschreibung_label')}</label>
                <textarea class="eingabe" id="lekt-beschreibung" rows="2">${esc(beschreibung)}</textarea>
            </div>
            <div class="editor-formular__aktionen">
                <button class="btn btn--text" id="btn-lekt-abbrechen">${t('allgemein.abbrechen')}</button>
                <button class="btn btn--gefuellt" id="btn-lekt-speichern">${t('allgemein.speichern')}</button>
            </div>
        </div>
    `;

    // Kategorie-Vorauswahl setzen — NACH innerHTML, damit Optionen vorhanden sind
    const katSelect = document.getElementById('lekt-kategorie');
    if (katSelect && kategorie_id) {
        katSelect.value = kategorie_id;
        // Fallback: wenn der Wert nicht gefunden (Option nicht vorhanden), leer lassen
        if (katSelect.value !== kategorie_id) {
            katSelect.value = '';
        }
    }

    document.getElementById('btn-lekt-abbrechen')?.addEventListener('click', () => {
        container.classList.add('versteckt');
        container.innerHTML = '';
    });

    document.getElementById('btn-lekt-speichern')?.addEventListener('click', async () => {
        const titelWert = document.getElementById('lekt-titel')?.value?.trim();
        if (!titelWert) { fehler(t('lektion_liste.titel_pflicht')); return; }

        const katVal = document.getElementById('lekt-kategorie')?.value;
        const body = {
            titel:        titelWert,
            beschreibung: document.getElementById('lekt-beschreibung')?.value?.trim() || null,
            sprachniveau: document.getElementById('lekt-niveau')?.value,
        };
        // Kategorie nur für Admin
        if (ist_admin()) {
            body.kategorie_id = katVal ? parseInt(katVal, 10) : null;
        }

        let erg;
        if (bearbeitenId) {
            erg = await apiPut(`lektionen/aktualisieren.php?id=${bearbeitenId}`, body);
        } else {
            erg = await apiPost('lektionen/erstellen.php', body);
        }

        if (erg.erfolg) {
            erfolg(bearbeitenId ? t('lektion_liste.aktualisiert') : t('lektion_liste.erstellt'));
            container.classList.add('versteckt');
            container.innerHTML = '';
            _laden();
        } else {
            apiFehlerAnzeigen(erg);
        }
    });

    document.getElementById('lekt-titel')?.focus();
}

async function _zuordnung_anzeigen(lektionId) {
    const container = document.getElementById('lektion-zuordnung');
    if (!container) return;

    container.classList.remove('versteckt');
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    lade_anzeige_rendern(container);

    // Lektion-Details laden (inkl. zugeordnete Vokabeln)
    const erg = await apiGet(`lektionen/details.php?id=${lektionId}`);
    if (!erg.erfolg) { apiFehlerAnzeigen(erg); return; }

    const lektion = erg.daten;
    const zugeordnete = new Set(lektion.vokabeln.map(v => v.id));

    container.innerHTML = `
        <div class="karte zuordnung-box">
            <h3>${t('lektion_liste.zuordnen_titel', {titel: lektion.titel})}</h3>

            <div class="zuordnung-filter-zeile">
                <input class="eingabe eingabe--klein" type="search" id="zuordnung-suche"
                    placeholder="${t('lektion_liste.zuordnen_suche')}" style="flex:1">
                <label class="filter-checkbox" style="white-space:nowrap">
                    <input type="checkbox" id="zuordnung-nur-ohne-lektion">
                    <span>${t('lektion_liste.zuordnen_ohne_lektion')}</span>
                </label>
            </div>

            <div id="zuordnung-ergebnisse" class="zuordnung-liste"></div>

            <div class="editor-formular__aktionen">
                <button class="btn btn--text" id="btn-zuordnung-schliessen">${t('allgemein.schliessen')}</button>
                <button class="btn btn--gefuellt" id="btn-zuordnung-speichern">${t('lektion_liste.zuordnen_speichern')}</button>
            </div>
        </div>
    `;

    // Hilfsfunktion: aktuelle Suche ausführen
    async function _zuordnung_suche_ausfuehren() {
        const q       = document.getElementById('zuordnung-suche')?.value?.trim() || '';
        const nurOhne = document.getElementById('zuordnung-nur-ohne-lektion')?.checked ?? false;

        if (!nurOhne && q.length < 2) {
            // Kein Filter aktiv → bestehende Zuordnungen zeigen
            _zuordnung_liste_rendern(lektion.vokabeln, zugeordnete);
            return;
        }

        const suchParams = {};
        if (q.length >= 2) suchParams.q = q;
        if (!ist_admin()) suchParams.nur_privat = 1; // Non-Admin: nur eigene private Vokabeln
        if (nurOhne) {
            suchParams.ohne_themenfeld = '1';
        }
        // Kein Ausschluss bei normaler Suche — zeigt alle Vokabeln,
        // Häkchen zeigt aktuelle Zuordnung (auch mehrere Themenfelder möglich)

        const suchErg = await apiGet('vokabeln/suchen.php', suchParams);
        if (suchErg.erfolg) {
            _zuordnung_liste_rendern(suchErg.daten, zugeordnete);
        }
    }

    // Bestehende Vokabeln initial anzeigen
    _zuordnung_liste_rendern(lektion.vokabeln, zugeordnete);

    // Suche
    document.getElementById('zuordnung-suche')?.addEventListener('input',
        entprellen(_zuordnung_suche_ausfuehren, 300));

    // Checkbox "Nur ohne Lektion"
    document.getElementById('zuordnung-nur-ohne-lektion')?.addEventListener('change',
        _zuordnung_suche_ausfuehren);

    // Schliessen
    document.getElementById('btn-zuordnung-schliessen')?.addEventListener('click', () => {
        container.classList.add('versteckt');
        container.innerHTML = '';
    });

    // Speichern
    document.getElementById('btn-zuordnung-speichern')?.addEventListener('click', async () => {
        // zugeordnete-Set als Quelle nutzen: enthält ALLE zugewiesenen IDs (vorhandene +
        // neu angehakte), unabhängig davon welche Vokabeln gerade sichtbar sind (z.B. bei
        // aktivem "Ohne Lektion"-Filter wären vorhandene Vokabeln sonst nicht sichtbar und
        // würden fälschlicherweise aus der Lektion entfernt).
        const ids = Array.from(zugeordnete);

        const saveErg = await apiPost(`lektionen/vokabeln_zuordnen.php?id=${lektionId}`, { vokabel_ids: ids });
        if (saveErg.erfolg) {
            erfolg(t('lektion_liste.zuordnen_erfolg', {anzahl: saveErg.daten.zugeordnet}));
            container.classList.add('versteckt');
            container.innerHTML = '';
            _laden();
        } else {
            apiFehlerAnzeigen(saveErg);
        }
    });
}

function _zuordnung_liste_rendern(vokabeln, zugeordnete) {
    const container = document.getElementById('zuordnung-ergebnisse');
    if (!container) return;

    if (vokabeln.length === 0) {
        container.innerHTML = `<p class="editor-formular__hinweis">${t('lektion_liste.zuordnen_keine')}</p>`;
        return;
    }

    let html = `<div class="zuordnung-alle-zeile">
        <button class="btn btn--text btn--klein" id="btn-zuordnung-alle" type="button">${t('lektion_liste.zuordnen_alle')}</button>
    </div>`;
    for (const v of vokabeln) {
        const checked = zugeordnete.has(v.id) ? 'checked' : '';
        html += `
            <label class="zuordnung-eintrag">
                <input type="checkbox" class="zuordnung-checkbox" value="${v.id}" ${checked}>
                <strong>${esc(v.englisch || v.schwedisch || '')}</strong> — ${esc(v.deutsch)}
                <span class="tag tag--${(v.wortart || '').toLowerCase()}">${esc(v.wortart)}</span>
            </label>
        `;
    }

    container.innerHTML = html;

    // Checkbox-Changes tracken
    const checkboxes = container.querySelectorAll('.zuordnung-checkbox');
    checkboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            const id = parseInt(cb.value, 10);
            if (cb.checked) zugeordnete.add(id);
            else zugeordnete.delete(id);
        });
    });

    // Alle auswählen / abwählen
    const btnAlle = document.getElementById('btn-zuordnung-alle');
    if (btnAlle) {
        const _aktualisiere_btn_text = () => {
            const alleAusgewaehlt = [...checkboxes].every(cb => cb.checked);
            btnAlle.textContent = alleAusgewaehlt ? t('lektion_liste.zuordnen_alle_ab') : t('lektion_liste.zuordnen_alle');
        };
        _aktualisiere_btn_text();

        btnAlle.addEventListener('click', () => {
            const alleAusgewaehlt = [...checkboxes].every(cb => cb.checked);
            checkboxes.forEach(cb => {
                cb.checked = !alleAusgewaehlt;
                const id = parseInt(cb.value, 10);
                if (cb.checked) zugeordnete.add(id);
                else zugeordnete.delete(id);
            });
            _aktualisiere_btn_text();
        });
    }
}

function _kategorien_optionen_bauen(kats, prefix = '') {
    let html = '';
    for (const k of kats) {
        html += `<option value="${k.id}">${esc(prefix + k.name)}</option>`;
        if (k.kinder && k.kinder.length > 0) {
            html += _kategorien_optionen_bauen(k.kinder, prefix + '\u00A0\u00A0');
        }
    }
    return html;
}

export function aufraeumen() {
    _seite = 1;
    _filterKategorie = '';
    _ausgewaehlteLektion = null;
    _alleKategorien = [];
    _lernpfadDaten = null;
}
