/**
 * Vokabel-Liste — Paginierte Tabelle mit Filtern
 *
 * Filter: Suche, Wortart, Kategorie (alphabetisch), Lektion (alphabetisch), Niveau.
 * Spalten-Sortierung: Klick auf Tabellenkopf sortiert; zweiter Klick → zurück zu Standard.
 * Zusatz-Spalte "Ausgeblendet" (admin): zeigt 1/0 und ist sortierbar.
 * Checkbox: Ausgeblendete Vokabeln anzeigen (nur_aktive=0).
 * Löschen: Soft-Delete (ausblenden) oder Hard-Delete (endgültig, nur bei ausgebl.).
 */

import { apiPaginiert, apiGet, apiDelete, apiPost } from '../api-client.js';
import { ist_admin, holen } from '../zustand.js';
import { navigieren } from '../router.js';
import { esc, entprellen } from '../hilfs-funktionen.js';
import { t } from '../dienste/sprache.js';
import { paginierung_rendern } from '../komponenten/paginierung.js';
import { lade_anzeige_rendern } from '../komponenten/lade-anzeige.js';
import { leer_zustand_rendern } from '../komponenten/leer-zustand.js';
import { bestaetigung_anzeigen } from '../komponenten/bestaetigung-dialog.js';
import { erfolg, apiFehlerAnzeigen } from '../benachrichtigungen.js';

let _seite = 1;
let _proSeite = 25;             // Einträge pro Seite (10/25/50/100/200/500/alle)
let _filter = {
    wortart: '',
    kategorie_id: '',
    lektion_id: '',
    sprachniveau: '',
    suche: '',
};
let _filterModus = '';          // 'faellig' | 'neu' | 'favorit' — Sonder-Filter vom Dashboard
let _vonRoute = '';             // 'lernpfad' — woher wurde navigiert (beeinflusst Zurück-Button)
let _nurAktive = true;          // false = auch ausgeblendete anzeigen
let _auchPrivate = false;       // Admin: alle privaten Inhalte anzeigen
let _nurPrivate = false;        // Admin: ausschließlich private Vokabeln anzeigen
let _filterBesitzerId = '';     // Admin: private Vokabeln nach Besitzer filtern
let _benutzerListe = [];        // Admin: Cache für User-Dropdown
let _kategorien = [];
let _lektionInfo = null;        // Wenn aus Lektions-Kontext aufgerufen
let _privatLimit = null;        // { anzahl, limit } für User-Anzeige

// Sortierung: null = Standard (schwedisch ASC), sonst { spalte, richtung }
let _sortierung = null;
// Erlaubte Spalten-Keys → API-Parameter-Wert
const _SORTIER_SPALTEN = {
    englisch: 'englisch',
    deutsch:       'deutsch',
    wortart:       'wortart',
    sprachniveau:  'sprachniveau',
    kategorie:     'kategorie_name',
    ausgeblendet:  'aktiv',
};

// Hash-Query-Parameter auslesen (z.B. #/vokabeln?lektion_id=3)
function _hash_params() {
    const hash = window.location.hash || '';
    const idx = hash.indexOf('?');
    if (idx === -1) return {};
    const query = hash.slice(idx + 1);
    const params = {};
    for (const teil of query.split('&')) {
        const [key, val] = teil.split('=');
        if (key) params[decodeURIComponent(key)] = decodeURIComponent(val || '');
    }
    return params;
}

/**
 * Aktuellen Filter- und Scroll-Zustand in sessionStorage speichern.
 * Wird vor Navigation zum Vokabel-Editor aufgerufen.
 */
function _zustand_speichern() {
    const inhalt = document.getElementById('inhalt');
    sessionStorage.setItem('vokabel_liste_zustand', JSON.stringify({
        filter:       { ..._filter },
        seite:        _seite,
        proSeite:     _proSeite,
        sortierung:   _sortierung,
        nurAktive:    _nurAktive,
        filterModus:  _filterModus,
        vonRoute:     _vonRoute,
        scrollY:      inhalt?.scrollTop ?? 0,
    }));
}

/**
 * Zustand aus sessionStorage wiederherstellen.
 * Gibt gespeichertes scrollY zurück oder null wenn kein Zustand gespeichert war.
 */
function _zustand_wiederherstellen() {
    const raw = sessionStorage.getItem('vokabel_liste_zustand');
    if (!raw) return null;
    sessionStorage.removeItem('vokabel_liste_zustand');
    try {
        const z = JSON.parse(raw);
        _filter      = { ..._filter, ...(z.filter || {}) };
        _seite       = z.seite       ?? 1;
        _proSeite    = z.proSeite    ?? 25;
        _sortierung  = z.sortierung  ?? null;
        _nurAktive   = z.nurAktive   ?? true;
        _filterModus = z.filterModus ?? '';
        _vonRoute    = z.vonRoute    ?? '';
        return z.scrollY ?? 0;
    } catch (e) {
        return null;
    }
}

export async function rendern() {
    const container = document.getElementById('inhalt');
    if (!container) return;

    // Gespeicherten Zustand wiederherstellen (nach Navigation vom Editor zurück)
    const _gespeicherter_scroll = _zustand_wiederherstellen();
    const _von_editor = _gespeicherter_scroll !== null;

    // URL-Parameter auswerten (überspringen wenn Zustand wiederhergestellt)
    if (!_von_editor) {
    const urlParams = _hash_params();
    if (urlParams.themenfeld_id) _filter.lektion_id = urlParams.themenfeld_id;
    else if (urlParams.lektion_id) _filter.lektion_id = urlParams.lektion_id;
    if (urlParams.kategorie_id) _filter.kategorie_id = urlParams.kategorie_id;
    // Sonder-Filter vom Dashboard (faellig / neu / favorit)
    if (urlParams.filter && ['faellig', 'neu', 'favorit'].includes(urlParams.filter)) {
        _filterModus = urlParams.filter;
    } else if (!urlParams.filter) {
        // Kein filter-Param → Modus zuruecksetzen (direkter Navigationsaufruf)
        _filterModus = '';
    }
    // Herkunfts-Route: 'lernpfad'/'dashboard' → Zurück zum Dashboard, 'fortschritt' → Zurück zum Lernfortschritt
    if (urlParams.von === 'lernpfad' || urlParams.von === 'dashboard') {
        _vonRoute = 'dashboard';
    } else if (urlParams.von === 'fortschritt') {
        _vonRoute = 'fortschritt';
    } else {
        _vonRoute = '';
    }

    } // end if (!_von_editor)

    // Lektions-Info laden wenn lektion_id gesetzt
    _lektionInfo = null;
    if (_filter.lektion_id) {
        const lektErg = await apiGet(`themenfelder/details.php?id=${_filter.lektion_id}`);
        if (lektErg.erfolg) _lektionInfo = lektErg.daten;
    }

    const admin = ist_admin();

    container.innerHTML = `
        <div class="verwaltung">
            <div class="verwaltung__kopf">
                ${_lektionInfo ? `
                    <div style="display:flex;align-items:center;gap:12px;flex:1">
                        <button class="btn-icon" id="btn-zurueck-lektionen" title="${t('vokabel_liste.zurueck_lektionen')}">
                            <span class="material-symbols-outlined">arrow_back</span>
                        </button>
                        <div>
                            <h2 class="verwaltung__titel" style="margin:0">
                                <span class="material-symbols-outlined" style="vertical-align:middle;font-size:22px;margin-right:6px">menu_book</span>
                                ${esc(_lektionInfo.titel)}
                            </h2>
                            <small style="color:var(--md-sys-color-on-surface-variant)">
                                ${_lektionInfo.kategorie_name ? esc(_lektionInfo.kategorie_name) + ' · ' : ''}
                                ${t('vokabel_liste.vokabeln_anzahl', {anzahl: _lektionInfo.vokabel_anzahl})}
                            </small>
                        </div>
                    </div>
                ` : _filterModus ? `
                    <div style="display:flex;align-items:center;gap:12px;flex:1">
                        <button class="btn-icon" id="btn-zurueck-dashboard" title="${_vonRoute === 'fortschritt' ? t('vokabel_liste.zurueck_fortschritt') : t('vokabel_liste.zurueck_dashboard')}">
                            <span class="material-symbols-outlined">arrow_back</span>
                        </button>
                        <div>
                            <h2 class="verwaltung__titel" style="margin:0">
                                ${{faellig:t('vokabel_liste.faellige_titel'), neu:t('vokabel_liste.neue_titel'), favorit:t('vokabel_liste.favoriten_titel')}[_filterModus] || t('vokabel_liste.titel')}
                            </h2>
                            <small style="color:var(--md-sys-color-on-surface-variant)" id="filter-modus-info">
                                ${{faellig:t('vokabel_liste.faellige_info'), neu:t('vokabel_liste.neue_info'), favorit:t('vokabel_liste.favoriten_info')}[_filterModus] || ''}
                            </small>
                        </div>
                    </div>
                ` : `
                    <h2 class="verwaltung__titel">${t('vokabel_liste.titel')}</h2>
                `}
                ${_filterModus === 'faellig' ? `
                <button class="btn btn--gefuellt" id="btn-training-faellig">
                    <span class="material-symbols-outlined" style="font-size:20px">fitness_center</span>
                    ${t('vokabel_liste.training_starten_faellig')}
                </button>
                ` : `
                <button class="btn btn--gefuellt" id="btn-vokabel-neu">
                    <span class="material-symbols-outlined" style="font-size:20px">add</span>
                    ${admin ? t('vokabel_liste.neue_vokabel') : t('vokabel_liste.meine_vokabel')}
                </button>
                `}
            </div>

            <!-- Favoriten-Chip (nur in der normalen Ansicht ohne Sonder-Filter) -->
            ${!_filterModus && !_lektionInfo ? `
                <div style="display:flex;gap:8px;padding:4px 0 8px;flex-wrap:wrap">
                    <button class="btn btn--klein ${_filterModus === '' ? 'btn--gefuellt' : 'btn--umrandet'}" id="chip-alle-vokabeln">
                        ${t('vokabel_liste.alle_vokabeln')}
                    </button>
                    <button class="btn btn--klein btn--umrandet" id="chip-nur-favoriten" style="display:flex;align-items:center;gap:4px">
                        <span class="material-symbols-outlined" style="font-size:16px;color:var(--md-sys-color-secondary)">star</span>
                        ${t('vokabel_liste.nur_favoriten')}
                    </button>
                </div>
            ` : ''}

            <!-- Filterleiste — ausgeblendet wenn Sonder-Filter, aus Lernpfad oder Lernfortschritt -->
            <div class="filter-leiste" id="filter-leiste" ${(_filterModus || _vonRoute === 'lernpfad' || _vonRoute === 'fortschritt') ? 'style="display:none"' : ''}>
                <div class="filter-leiste__feld">
                    <input class="eingabe eingabe--klein" type="search" id="filter-suche"
                        placeholder="${t('vokabel_liste.suchen')}" autocomplete="off"
                        value="${esc(_filter.suche)}">
                </div>
                <div class="filter-leiste__feld">
                    <select class="eingabe eingabe--klein" id="filter-wortart">
                        <option value="">${t('vokabel_liste.alle_wortarten')}</option>
                        <option value="Nomen">Nomen</option>
                        <option value="Verb">Verb</option>
                        <option value="Adjektiv">Adjektiv</option>
                        <option value="Adverb">Adverb</option>
                        <option value="Pronomen">Pronomen</option>
                        <option value="Praeposition">Praeposition</option>
                        <option value="Konjunktion">Konjunktion</option>
                        <option value="Interjektion">Interjektion</option>
                        <option value="Phrase">Phrase</option>
                    </select>
                </div>
                <div class="filter-leiste__feld">
                    <select class="eingabe eingabe--klein" id="filter-kategorie">
                        <option value="">${t('vokabel_liste.alle_kategorien')}</option>
                    </select>
                </div>
                ${!_lektionInfo ? `
                    <div class="filter-leiste__feld">
                        <select class="eingabe eingabe--klein" id="filter-lektion">
                            <option value="">${t('vokabel_liste.alle_lektionen')}</option>
                        </select>
                    </div>
                ` : ''}
                <div class="filter-leiste__feld">
                    <select class="eingabe eingabe--klein" id="filter-niveau">
                        <option value="">${t('vokabel_liste.alle_niveaus')}</option>
                        <option value="A1">A1</option>
                        <option value="A2">A2</option>
                        <option value="B1">B1</option>
                        <option value="B2">B2</option>
                        <option value="C1">C1</option>
                        <option value="C2">C2</option>
                    </select>
                </div>
                <div class="filter-leiste__feld">
                    <select class="eingabe eingabe--klein" id="filter-pro-seite">
                        <option value="10"  ${_proSeite === 10  ? 'selected' : ''}>${t('vokabel_liste.pro_seite', {anzahl: 10})}</option>
                        <option value="25"  ${_proSeite === 25  ? 'selected' : ''}>${t('vokabel_liste.pro_seite', {anzahl: 25})}</option>
                        <option value="50"  ${_proSeite === 50  ? 'selected' : ''}>${t('vokabel_liste.pro_seite', {anzahl: 50})}</option>
                        <option value="100" ${_proSeite === 100 ? 'selected' : ''}>${t('vokabel_liste.pro_seite', {anzahl: 100})}</option>
                        <option value="200" ${_proSeite === 200 ? 'selected' : ''}>${t('vokabel_liste.pro_seite', {anzahl: 200})}</option>
                        <option value="500" ${_proSeite === 500 ? 'selected' : ''}>${t('vokabel_liste.pro_seite', {anzahl: 500})}</option>
                        <option value="999" ${_proSeite === 999 ? 'selected' : ''}>${t('vokabel_liste.alle_anzeigen')}</option>
                    </select>
                </div>
                ${!admin ? `
                    <div class="filter-leiste__feld filter-leiste__feld--checkbox">
                        <label class="filter-checkbox">
                            <input type="checkbox" id="filter-nur-eigene-private" ${_nurPrivate ? 'checked' : ''}>
                            <span>${t('vokabel_liste.meine_privaten')}</span>
                        </label>
                    </div>
                ` : `
                    <div class="filter-leiste__feld filter-leiste__feld--checkbox">
                        <label class="filter-checkbox">
                            <input type="checkbox" id="filter-ausgeblendet" ${!_nurAktive ? 'checked' : ''}>
                            <span>${t('vokabel_liste.ausgeblendete_anzeigen')}</span>
                        </label>
                    </div>
                    <div class="filter-leiste__feld filter-leiste__feld--checkbox">
                        <label class="filter-checkbox">
                            <input type="checkbox" id="filter-nur-private" ${_nurPrivate ? 'checked' : ''}>
                            <span>${t('vokabel_liste.nur_private_anzeigen')}</span>
                        </label>
                    </div>
                    <div class="filter-leiste__feld" id="filter-besitzer-feld" ${!_nurPrivate ? 'style="display:none"' : ''}>
                        <select class="eingabe eingabe--klein" id="filter-besitzer">
                            <option value="">${t('vokabel_liste.alle_besitzer')}</option>
                        </select>
                    </div>
                `}
            </div>

            <!-- Inhalt -->
            <div id="vokabel-inhalt"></div>
            <div id="vokabel-paginierung"></div>
        </div>
    `;

    // Events registrieren
    document.getElementById('btn-zurueck-lektionen')?.addEventListener('click', () => navigieren(
        _vonRoute === 'dashboard' ? '/dashboard' : '/lektionen'
    ));
    document.getElementById('btn-zurueck-dashboard')?.addEventListener('click', () => navigieren(
        _vonRoute === 'fortschritt' ? '/fortschritt' : '/dashboard'
    ));
    document.getElementById('btn-vokabel-neu')?.addEventListener('click', () => navigieren('/vokabeln/neu'));

    document.getElementById('chip-nur-favoriten')?.addEventListener('click', () => {
        _filterModus = 'favorit';
        _seite = 1;
        _laden();
        // Chips und Filter ausblenden, Header neu rendern
        document.getElementById('filter-leiste')?.style.setProperty('display', 'none');
        document.querySelector('[id="chip-alle-vokabeln"]')?.closest('div')?.style.setProperty('display', 'none');
        const kopf = container.querySelector('.verwaltung__kopf');
        if (kopf) kopf.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;flex:1">
                <button class="btn-icon" id="btn-zurueck-vokabeln-favorit" title="${t('vokabel_liste.alle_vokabeln')}">
                    <span class="material-symbols-outlined">arrow_back</span>
                </button>
                <div>
                    <h2 class="verwaltung__titel" style="margin:0">${t('vokabel_liste.favoriten_titel')}</h2>
                    <small style="color:var(--md-sys-color-on-surface-variant)">${t('vokabel_liste.favoriten_info')}</small>
                </div>
            </div>`;
        document.getElementById('btn-zurueck-vokabeln-favorit')?.addEventListener('click', () => {
            _filterModus = '';
            _seite = 1;
            rendern();
        });
    });
    document.getElementById('chip-alle-vokabeln')?.addEventListener('click', () => {});

    document.getElementById('btn-training-faellig')?.addEventListener('click', () => navigieren('/training?filter=faellig'));

    // Private Vokabeln-Limit für normale User laden und anzeigen
    if (!admin) {
        apiGet('vokabeln/privat_zaehlen.php').then(erg => {
            if (erg.erfolg) {
                _privatLimit = erg.daten;
                const kopf = document.querySelector('.verwaltung__kopf');
                if (kopf && _privatLimit) {
                    const badge = document.createElement('small');
                    badge.id = 'privat-limit-badge';
                    badge.style.cssText = 'color:var(--md-sys-color-on-surface-variant);margin-left:8px';
                    badge.textContent = t('vokabel_liste.privat_limit', {anzahl: _privatLimit.anzahl, limit: _privatLimit.limit});
                    kopf.appendChild(badge);
                }
            }
        });
    }

    const suchFeld = document.getElementById('filter-suche');
    suchFeld?.addEventListener('input', entprellen(() => {
        _filter.suche = suchFeld.value.trim();
        _seite = 1;
        _laden();
    }, 400));

    document.getElementById('filter-wortart')?.addEventListener('change', (e) => {
        _filter.wortart = e.target.value;
        _seite = 1;
        _laden();
    });

    document.getElementById('filter-kategorie')?.addEventListener('change', (e) => {
        _filter.kategorie_id = e.target.value;
        _seite = 1;
        _lektionen_laden(e.target.value);
        _laden();
    });

    document.getElementById('filter-lektion')?.addEventListener('change', (e) => {
        _filter.lektion_id = e.target.value;
        _seite = 1;
        _laden();
    });

    document.getElementById('filter-niveau')?.addEventListener('change', (e) => {
        _filter.sprachniveau = e.target.value;
        _seite = 1;
        _laden();
    });

    document.getElementById('filter-pro-seite')?.addEventListener('change', (e) => {
        _proSeite = parseInt(e.target.value, 10);
        _seite = 1;
        _laden();
    });

    // Non-Admin: "Meine privaten"-Checkbox
    document.getElementById('filter-nur-eigene-private')?.addEventListener('change', (e) => {
        _nurPrivate = e.target.checked;
        _seite = 1;
        _laden();
    });

    document.getElementById('filter-ausgeblendet')?.addEventListener('change', (e) => {
        _nurAktive = !e.target.checked;
        _seite = 1;
        _laden();
    });

    document.getElementById('filter-nur-private')?.addEventListener('change', async (e) => {
        _nurPrivate = e.target.checked;
        _filterBesitzerId = '';
        _seite = 1;
        // Besitzer-Dropdown ein-/ausblenden und ggf. Benutzerliste laden
        const besitzerFeld = document.getElementById('filter-besitzer-feld');
        if (besitzerFeld) besitzerFeld.style.display = _nurPrivate ? '' : 'none';
        if (_nurPrivate) {
            await _benutzer_dropdown_laden();
        } else {
            const sel = document.getElementById('filter-besitzer');
            if (sel) sel.value = '';
        }
        _laden();
    });

    document.getElementById('filter-besitzer')?.addEventListener('change', (e) => {
        _filterBesitzerId = e.target.value;
        _seite = 1;
        _laden();
    });

    // Filterleiste laden (Kategorien/Lektionen/Dropdowns) — nur wenn sichtbar
    const filterVerborgen = _filterModus || _vonRoute === 'lernpfad' || _vonRoute === 'fortschritt';
    if (!filterVerborgen) {
        await _kategorien_laden();
        if (!_lektionInfo) await _lektionen_laden(_filter.kategorie_id);

        // Admin: Besitzer-Dropdown vorab laden wenn "Nur Private" bereits aktiv
        if (admin && _nurPrivate) {
            await _benutzer_dropdown_laden();
        }

        // Filter-Selects auf gespeicherte Werte setzen
        if (_filter.wortart) {
            const el = document.getElementById('filter-wortart');
            if (el) el.value = _filter.wortart;
        }
        if (_filter.kategorie_id) {
            const el = document.getElementById('filter-kategorie');
            if (el) el.value = _filter.kategorie_id;
        }
        if (_filter.lektion_id && !_lektionInfo) {
            const el = document.getElementById('filter-lektion');
            if (el) el.value = _filter.lektion_id;
        }
        if (_filter.sprachniveau) {
            const el = document.getElementById('filter-niveau');
            if (el) el.value = _filter.sprachniveau;
        }
    }

    if (_von_editor) {
        await _laden();
        requestAnimationFrame(() => {
            const inhalt = document.getElementById('inhalt');
            if (inhalt) inhalt.scrollTop = _gespeicherter_scroll;
        });
    } else {
        _laden();
    }
}

async function _kategorien_laden() {
    // sortierung=name damit Dropdown alphabetisch ist
    const erg = await apiGet('kategorien/liste.php', { sortierung: 'name' });
    if (erg.erfolg) {
        _kategorien = erg.daten || [];
        // Sortiere Top-Level alphabetisch, Kinder ebenfalls
        _kategorien_sortieren(_kategorien);
        const select = document.getElementById('filter-kategorie');
        if (select) {
            _kategorien_optionen(select, _kategorien);
            // Option für nicht zugeordnete Vokabeln (kategorie_id IS NULL)
            const optNone = document.createElement('option');
            optNone.value = 'keine';
            optNone.textContent = t('vokabel_liste.nicht_zugeordnet');
            select.appendChild(optNone);
        }
    }
}

function _kategorien_sortieren(liste) {
    liste.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    for (const k of liste) {
        if (k.kinder?.length > 0) _kategorien_sortieren(k.kinder);
    }
}

function _kategorien_optionen(select, kategorien, prefix = '') {
    for (const kat of kategorien) {
        const option = document.createElement('option');
        option.value = kat.id;
        option.textContent = prefix + kat.name + (kat.vokabel_anzahl > 0 ? ` (${kat.vokabel_anzahl})` : '');
        select.appendChild(option);
        if (kat.kinder?.length > 0) {
            _kategorien_optionen(select, kat.kinder, prefix + '\u00A0\u00A0\u00A0');
        }
    }
}

async function _lektionen_laden(kategorieId = '') {
    const select = document.getElementById('filter-lektion');
    if (!select) return;

    const params = { pro_seite: 200, nur_aktive: 1, sortierung: 'titel' };
    if (kategorieId) params.kategorie_id = kategorieId;

    const erg = await apiGet('lektionen/liste.php', params);
    select.innerHTML = `<option value="">${t('vokabel_liste.alle_lektionen')}</option><option value="ohne">${t('vokabel_liste.ohne_lektion')}</option>`;

    if (erg.erfolg) {
        const lektionen = (erg.daten?.eintraege || [])
            .sort((a, b) => {
                // Alphabetisch: erst nach Kategorie, dann nach Titel
                const katA = a.kategorie_name || '';
                const katB = b.kategorie_name || '';
                const katCmp = katA.localeCompare(katB, 'de');
                if (katCmp !== 0) return katCmp;
                return a.titel.localeCompare(b.titel, 'de');
            });

        for (const l of lektionen) {
            const option = document.createElement('option');
            option.value = l.id;
            option.textContent = (l.kategorie_name ? `${l.kategorie_name} › ` : '') +
                                  l.titel +
                                  (l.vokabel_anzahl > 0 ? ` (${l.vokabel_anzahl})` : '');
            select.appendChild(option);
        }
        // Vorauswahl wiederherstellen
        if (_filter.lektion_id) select.value = _filter.lektion_id;
    }
}

async function _benutzer_dropdown_laden() {
    const select = document.getElementById('filter-besitzer');
    if (!select) return;

    // Aus Cache verwenden falls vorhanden
    if (_benutzerListe.length === 0) {
        const erg = await apiGet('admin/benutzer_liste.php', { pro_seite: 200, nur_aktive: 0 });
        if (erg.erfolg) {
            _benutzerListe = (erg.daten?.eintraege || [])
                .sort((a, b) => a.benutzername.localeCompare(b.benutzername, 'de'));
        }
    }

    select.innerHTML = `<option value="">${t('vokabel_liste.alle_besitzer')}</option>`;
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

async function _laden() {
    const inhalt = document.getElementById('vokabel-inhalt');
    if (!inhalt) return;

    lade_anzeige_rendern(inhalt);

    const params = { nur_aktive: _nurAktive ? 1 : 0 };
    if (_filter.wortart)                          params.wortart      = _filter.wortart;
    if (_filter.kategorie_id === 'keine') {
        params.ohne_kategorie = 1;                // Keine Kategorie zugeordnet
    } else if (_filter.kategorie_id) {
        params.kategorie_id = _filter.kategorie_id;
    }
    if (_filter.lektion_id === 'ohne') {
        params.ohne_themenfeld = 1;
    } else if (_filter.lektion_id) {
        params.themenfeld_id = _filter.lektion_id;
    }
    if (_filter.sprachniveau)                     params.sprachniveau = _filter.sprachniveau;
    if (_filter.suche && _filter.suche.length >= 2) params.suche      = _filter.suche;
    // Sonder-Filter (faellig / neu / favorit) — wird serverseitig ausgewertet
    if (_filterModus)                             params.filter_modus = _filterModus;
    if (_nurPrivate) {
        params.nur_privat = 1;
    }
    if (ist_admin()) {
        if (_nurPrivate) {
            params.auch_private = 1;
            if (_filterBesitzerId) params.besitzer_id = _filterBesitzerId;
        } else if (_auchPrivate) {
            params.auch_private = 1;
        }
    }

    // Sortierung
    if (_sortierung) {
        params.sortierung = _sortierung.spalte;
        params.richtung   = _sortierung.richtung;
    } else {
        params.sortierung = 'englisch';
        params.richtung   = 'ASC';
    }

    // Einträge pro Seite (überschreibt apiPaginiert-Standard)
    params.pro_seite = _proSeite;

    const erg = await apiPaginiert('vokabeln/liste.php', _seite, params);

    if (!erg.erfolg) { apiFehlerAnzeigen(erg); return; }

    const vokabeln   = erg.daten.eintraege || [];
    const paginierung = erg.daten.paginierung;

    if (vokabeln.length === 0) {
        const hatFilter = _filter.suche || _filter.wortart || _filter.kategorie_id ||
                          _filter.lektion_id || _filter.sprachniveau || !_nurAktive;
        const leerTitel = _filterModus === 'faellig' ? t('vokabel_liste.leer_faellig_titel')
                        : _filterModus === 'neu'     ? t('vokabel_liste.leer_neu_titel')
                        : _filterModus === 'favorit' ? t('vokabel_liste.leer_favorit_titel')
                        : (_lektionInfo ? t('vokabel_liste.leer_lektion_titel') : t('vokabel_liste.leer_titel'));
        const leerText  = _filterModus === 'faellig' ? t('vokabel_liste.leer_faellig_text')
                        : _filterModus === 'neu'     ? t('vokabel_liste.leer_neu_text')
                        : _filterModus === 'favorit' ? t('vokabel_liste.leer_favorit_text')
                        : hatFilter ? t('vokabel_liste.leer_filter_text')
                        : (_lektionInfo ? t('vokabel_liste.leer_lektion_text')
                                        : t('vokabel_liste.leer_text'));
        leer_zustand_rendern(
            inhalt, 'dictionary',
            leerTitel,
            leerText,
            ist_admin() && !_filterModus ? (_lektionInfo ? t('vokabel_liste.leer_zuordnen') : t('vokabel_liste.leer_erste')) : '',
            ist_admin() && !_filterModus ? (_lektionInfo ? () => navigieren('/lektionen') : () => navigieren('/vokabeln/neu')) : null
        );
        document.getElementById('vokabel-paginierung').innerHTML = '';
        return;
    }

    _tabelle_rendern(inhalt, vokabeln);

    paginierung_rendern(
        document.getElementById('vokabel-paginierung'),
        paginierung,
        (s) => { _seite = s; _laden(); }
    );
}

function _tabelle_rendern(container, vokabeln) {
    const admin = ist_admin();
    const zeigeAusgeblendet = !_nurAktive;

    // Spalten-Definition: key, Label, CSS-Klasse (optional), mobil-versteckt
    const spalten = [
        { key: 'englisch',   label: t('vokabel_liste.spalte_schwedisch'),   klasse: 'verwaltung-tabelle__englisch' },
        { key: 'deutsch',      label: t('vokabel_liste.spalte_deutsch') },
        { key: 'wortart',      label: t('vokabel_liste.spalte_wortart') },
        { key: null,           label: t('vokabel_liste.spalte_genus'),  mobil: true },
        { key: 'sprachniveau', label: t('vokabel_liste.spalte_niveau'),        mobil: true },
        { key: 'kategorie',    label: t('vokabel_liste.spalte_kategorie'),     mobil: true },
        // "Ausgeblendet" nur wenn Admin und Checkbox aktiv
        ...(admin && zeigeAusgeblendet
            ? [{ key: 'ausgeblendet', label: t('vokabel_liste.spalte_ausgeblendet'), mobil: true }]
            : []),
    ];

    // Tabellenkopf mit Sortierpfeilen
    const thHtml = spalten.map(sp => {
        const mobKlasse = sp.mobil ? ' class="verwaltung-tabelle__mobil-versteckt' + (sp.klasse ? ' ' + sp.klasse : '') + '"' : (sp.klasse ? ` class="${sp.klasse}"` : '');
        if (!sp.key) {
            // Nicht sortierbar
            return `<th${mobKlasse}>${sp.label}</th>`;
        }
        const aktiv = _sortierung?.spalte === _SORTIER_SPALTEN[sp.key];
        const pfeil = aktiv
            ? (_sortierung.richtung === 'ASC' ? ' ↑' : ' ↓')
            : '';
        const aktKlasse = aktiv ? ' th--sortiert' : '';
        return `<th${mobKlasse} class="th--sortierbar${aktKlasse}" data-sort-key="${sp.key}" style="cursor:pointer;user-select:none">${sp.label}${pfeil}</th>`;
    }).join('');

    let html = `
        <div class="verwaltung-tabelle-wrapper">
            <table class="verwaltung-tabelle">
                <thead>
                    <tr>
                        ${thHtml}
                        <th>${t('vokabel_liste.spalte_aktionen')}</th>
                    </tr>
                </thead>
                <tbody>
    `;

    const aktuellerUser = holen('benutzer');
    const meineBenutzerId = aktuellerUser?.id;

    for (const v of vokabeln) {
        const istDeaktiviert = !v.aktiv;
        const istPrivat      = !!v.ist_privat;
        const istEigen       = istPrivat && Number(v.besitzer_id) === Number(meineBenutzerId);
        const wortartKlasse  = `tag tag--${(v.wortart || '').toLowerCase()}`;
        const niveauKlasse   = `tag tag--${(v.sprachniveau || 'a1').toLowerCase()}`;

        let zeilenKlasse = 'verwaltung-tabelle__zeile';
        if (istDeaktiviert) zeilenKlasse += ' verwaltung-tabelle__zeile--deaktiviert';
        if (istPrivat)      zeilenKlasse += ' verwaltung-tabelle__zeile--privat';

        let genusGruppe = '';
        if (v.wortart === 'Nomen' && v.genus) {
            genusGruppe = `<span class="tag tag--${v.genus}">${v.genus}</span>`;
        } else if (v.wortart === 'Verb' && v.verbgruppe) {
            genusGruppe = `Gr.&nbsp;${esc(v.verbgruppe)}`;
        }

        // Kategorie-Label: privat ohne Kategorie zeigt „Private Sammlung"
        let kategorieName = esc(v.kategorie_name || '–');
        if (istPrivat && !v.kategorie_name) {
            const besitzerName = v.besitzer_name || t('vokabel_liste.besitzer_unbekannt');
            kategorieName = `<em style="color:var(--md-sys-color-primary)">🔒 ${esc(besitzerName)}</em>`;
        }

        // Aktionen-Spalte
        let aktionenHtml = '';
        if (admin) {
            if (istPrivat) {
                // Admin: Hard-Delete für private Vokabeln
                aktionenHtml = `
                    <button class="btn-icon btn-icon--gefaehrlich" data-aktion="loeschen"
                        data-id="${v.id}" data-englisch="${esc(v.englisch)}"
                        data-ist-privat="1" title="${t('allgemein.loeschen')}">
                        <span class="material-symbols-outlined">delete</span>
                    </button>`;
            } else if (istDeaktiviert) {
                aktionenHtml = `
                    <button class="btn-icon" data-aktion="reaktivieren" data-id="${v.id}"
                        title="${t('vokabel_liste.reaktivieren_titel')}">
                        <span class="material-symbols-outlined">visibility</span>
                    </button>
                    <button class="btn-icon btn-icon--gefaehrlich" data-aktion="endgueltig-loeschen"
                        data-id="${v.id}" data-englisch="${esc(v.englisch)}"
                        title="${t('vokabel_liste.endgueltig_titel')}">
                        <span class="material-symbols-outlined">delete_forever</span>
                    </button>`;
            } else {
                aktionenHtml = `
                    <button class="btn-icon" data-aktion="bearbeiten" data-id="${v.id}" title="${t('allgemein.bearbeiten')}">
                        <span class="material-symbols-outlined">edit</span>
                    </button>
                    <button class="btn-icon btn-icon--gefaehrlich" data-aktion="loeschen"
                        data-id="${v.id}" data-englisch="${esc(v.englisch)}"
                        title="${t('vokabel_liste.ausblenden_button')}">
                        <span class="material-symbols-outlined">visibility_off</span>
                    </button>`;
            }
        } else if (istEigen) {
            // Normaler User: eigene private Vokabeln können gelöscht werden
            aktionenHtml = `
                <button class="btn-icon btn-icon--gefaehrlich" data-aktion="loeschen"
                    data-id="${v.id}" data-englisch="${esc(v.englisch)}"
                    data-ist-privat="1" title="${t('vokabel_liste.meine_loeschen_titel')}">
                    <span class="material-symbols-outlined">delete</span>
                </button>`;
        }

        // Favorit-Modus: Aktionen auf Stern-Button beschränken
        if (_filterModus === 'favorit') {
            aktionenHtml = `
                <button class="btn-icon" data-aktion="favorit-entfernen"
                    data-id="${v.id}" title="${t('vokabel_liste.favorit_entfernen_titel')}">
                    <span class="material-symbols-outlined" style="color:var(--md-sys-color-primary)">star</span>
                </button>`;
        }

        html += `
            <tr class="${zeilenKlasse}"
                data-id="${v.id}" data-aktiv="${v.aktiv ? '1' : '0'}"
                data-ist-privat="${istPrivat ? '1' : '0'}"
                data-ist-eigen="${istEigen ? '1' : '0'}">
                <td class="verwaltung-tabelle__englisch">
                    ${istPrivat ? '<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;color:var(--md-sys-color-primary);margin-right:4px">lock</span>' : ''}
                    <strong>${esc(v.englisch)}</strong>
                    ${istDeaktiviert ? `<span class="tag tag--deaktiviert" style="margin-left:6px">${t('vokabel_liste.ausgeblendet_tag')}</span>` : ''}
                </td>
                <td>${esc(v.deutsch)}</td>
                <td><span class="${wortartKlasse}">${esc(v.wortart)}</span></td>
                <td class="verwaltung-tabelle__mobil-versteckt">${genusGruppe}</td>
                <td class="verwaltung-tabelle__mobil-versteckt">
                    <span class="${niveauKlasse}">${esc(v.sprachniveau)}</span>
                </td>
                <td class="verwaltung-tabelle__mobil-versteckt">${kategorieName}</td>
                ${admin && zeigeAusgeblendet ? `
                    <td class="verwaltung-tabelle__mobil-versteckt" style="text-align:center">
                        ${istDeaktiviert
                            ? `<span class="tag tag--deaktiviert">${t('vokabel_liste.ausgeblendet_ja')}</span>`
                            : '<span style="color:var(--md-sys-color-on-surface-variant)">–</span>'}
                    </td>
                ` : ''}
                <td class="verwaltung-tabelle__aktionen">${aktionenHtml}</td>
            </tr>
        `;
    }

    // Aktionen-Spalte immer anzeigen (auch für User mit eigenen Vokabeln)
    html += `</tbody></table></div>`;
    container.innerHTML = html;

    // Spalten-Sortierung: Klick auf Tabellenkopf
    container.querySelectorAll('[data-sort-key]').forEach(th => {
        th.addEventListener('click', () => {
            const key = th.dataset.sortKey;
            const apiSpalte = _SORTIER_SPALTEN[key];
            if (!apiSpalte) return;

            if (_sortierung && _sortierung.spalte === apiSpalte) {
                if (_sortierung.richtung === 'ASC') {
                    _sortierung = { spalte: apiSpalte, richtung: 'DESC' };
                } else {
                    _sortierung = null;
                }
            } else {
                _sortierung = { spalte: apiSpalte, richtung: 'ASC' };
            }
            _seite = 1;
            _laden();
        });
    });

    // Zeilen-Klick → Vokabel-Editor
    // Admin: alle Zeilen klickbar.
    // Normaler User: nur eigene private Vokabeln klickbar (öffentliche Vokabeln würden
    // im Editor mit 403 abgewiesen — daher Klick für Fremd-/öffentliche Zeilen sperren).
    container.querySelectorAll('.verwaltung-tabelle__zeile').forEach(zeile => {
        const istEigenZeile = zeile.dataset.istEigen === '1';
        const klickErlaubt  = ist_admin() || istEigenZeile;
        if (!klickErlaubt) {
            zeile.style.cursor = 'default';
            return; // kein Click-Listener registrieren
        }
        zeile.addEventListener('click', (e) => {
            if (e.target.closest('[data-aktion]')) return;
            _zustand_speichern();
            navigieren(`/vokabeln/${zeile.dataset.id}`);
        });
    });

    // Bearbeiten (Admin)
    container.querySelectorAll('[data-aktion="bearbeiten"]').forEach(btn => {
        btn.addEventListener('click', () => { _zustand_speichern(); navigieren(`/vokabeln/${btn.dataset.id}`); });
    });

    // Löschen: Soft-Delete (öffentl.) oder Hard-Delete (privat)
    container.querySelectorAll('[data-aktion="loeschen"]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const istPrivat = btn.dataset.istPrivat === '1';
            if (istPrivat) {
                const bestaetigt = await bestaetigung_anzeigen(
                    t('vokabel_liste.loeschen_titel'),
                    t('vokabel_liste.loeschen_text', {wort: btn.dataset.englisch}),
                    t('allgemein.loeschen'), t('allgemein.abbrechen'), true
                );
                if (bestaetigt) {
                    const erg = await apiDelete(`vokabeln/loeschen.php?id=${btn.dataset.id}`);
                    if (erg.erfolg) { erfolg(t('vokabel_liste.geloescht', {wort: btn.dataset.englisch})); _laden(); }
                    else apiFehlerAnzeigen(erg);
                }
            } else {
                // Admin: Soft-Delete
                const bestaetigt = await bestaetigung_anzeigen(
                    t('vokabel_liste.ausblenden_titel'),
                    t('vokabel_liste.ausblenden_text', {wort: btn.dataset.englisch}),
                    t('vokabel_liste.ausblenden_button'), t('allgemein.abbrechen'), true
                );
                if (bestaetigt) {
                    const erg = await apiDelete(`vokabeln/loeschen.php?id=${btn.dataset.id}`);
                    if (erg.erfolg) { erfolg(t('vokabel_liste.ausgeblendet_erfolg')); _laden(); }
                    else apiFehlerAnzeigen(erg);
                }
            }
        });
    });

    // Reaktivieren (Admin)
    container.querySelectorAll('[data-aktion="reaktivieren"]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const erg = await apiPost('vokabeln/reaktivieren.php', { id: parseInt(btn.dataset.id, 10) });
            if (erg.erfolg) { erfolg(t('vokabel_liste.reaktiviert')); _laden(); }
            else apiFehlerAnzeigen(erg);
        });
    });

    // Endgültig löschen (Admin)
    container.querySelectorAll('[data-aktion="endgueltig-loeschen"]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const bestaetigt = await bestaetigung_anzeigen(
                t('vokabel_liste.endgueltig_titel'),
                t('vokabel_liste.endgueltig_text', {wort: btn.dataset.englisch}),
                t('vokabel_liste.endgueltig_button'), t('allgemein.abbrechen'), true
            );
            if (bestaetigt) {
                const erg = await apiDelete(`vokabeln/endgueltig_loeschen.php?id=${btn.dataset.id}`);
                if (erg.erfolg) { erfolg(t('vokabel_liste.endgueltig_erfolg', {wort: btn.dataset.englisch})); _laden(); }
                else apiFehlerAnzeigen(erg);
            }
        });
    });

    // Favorit entfernen (nur im Favoriten-Filter-Modus)
    container.querySelectorAll('[data-aktion="favorit-entfernen"]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const erg = await apiPost('favoriten/umschalten.php', { vokabel_id: parseInt(btn.dataset.id, 10) });
            if (erg.erfolg) {
                if (!erg.daten.ist_favorit) {
                    _laden(); // aus Liste entfernen
                }
                // Falls jemand es als Favorit markiert hat (theoretisch, falls Toggle zurückgeht) — nichts tun
            } else {
                apiFehlerAnzeigen(erg);
            }
        });
    });
}

export function aufraeumen() {
    _seite           = 1;
    _proSeite        = 25;
    _filter          = { wortart: '', kategorie_id: '', lektion_id: '', sprachniveau: '', suche: '' };
    _filterModus     = '';
    _vonRoute        = '';
    _nurAktive       = true;
    _auchPrivate     = false;
    _nurPrivate      = false;
    _filterBesitzerId = '';
    _benutzerListe   = [];
    _lektionInfo     = null;
    _sortierung      = null;
    _privatLimit     = null;
}
