/**
 * Kategorie- & Lektion-Übersicht (vereint)
 *
 * Linke Spalte: Kategorie-Baum (Lehrwerke → Kapitel)
 * Rechte Spalte: Lektionen der angeklickten Kategorie,
 *               jede Lektion aufklappbar → zeigt Vokabeln mit Satz-Icons
 *
 * Lernpfad-Toggle prominent oben, beeinflusst Lektionsanzeige.
 */

import { apiGet, apiPost, apiPut, apiDelete } from '../api-client.js';
import { ist_admin, holen, setzen } from '../zustand.js';
import { esc } from '../hilfs-funktionen.js';
import { lade_anzeige_rendern } from '../komponenten/lade-anzeige.js';
import { leer_zustand_rendern } from '../komponenten/leer-zustand.js';
import { bestaetigung_anzeigen } from '../komponenten/bestaetigung-dialog.js';
import { erfolg, fehler, apiFehlerAnzeigen } from '../benachrichtigungen.js';
import { navigieren } from '../router.js';
import { t } from '../dienste/sprache.js';

let _kategorien          = [];
let _expandiert          = new Set();   // Expandierte Kategorie-IDs im Baum
let _expandierteLektionen = new Set();  // Expandierte Lektion-IDs im Lektionen-Panel
let _ausgewaehlteKategorieId = null;
let _lernpfadDaten       = null;

// ─── Lernpfad ───────────────────────────────────────────────────────────────

async function _lernpfad_laden() {
    const erg = await apiGet('lektionen/lernpfad.php');
    if (!erg.erfolg) { _lernpfadDaten = null; return; }
    const freigeschaltet = (erg.daten?.lektionen || []).filter(l => l.freigeschaltet);
    _lernpfadDaten = {
        freigeschalteteIds: new Set(freigeschaltet.map(l => l.id)),
        lektionen: erg.daten.lektionen || [], // alle, nicht nur freigeschaltete
    };
}

// ─── Einstieg ────────────────────────────────────────────────────────────────

export async function rendern() {
    const container = document.getElementById('inhalt');
    if (!container) return;

    const admin = ist_admin();

    container.innerHTML = `
        <div class="verwaltung">

            <!-- Kopf -->
            <div class="verwaltung__kopf">
                <h2 class="verwaltung__titel">${t('kategorie_liste.titel')}</h2>
                ${admin ? `
                    <button class="btn btn--gefuellt" id="btn-kategorie-neu">
                        <span class="material-symbols-outlined" style="font-size:20px">add</span>
                        ${t('kategorie_liste.neues_lehrwerk')}
                    </button>
                ` : ''}
            </div>

            <div id="kategorie-formular" class="versteckt"></div>

            <!-- Zwei-Spalten-Layout: Baum links, Lektionen rechts -->
            <div class="kategorie-layout">
                <div id="kategorie-inhalt" class="kategorie-layout__baum"></div>
                <div id="kategorie-lektionen" class="kategorie-layout__lektionen versteckt"></div>
            </div>
        </div>
    `;

    // Events
    document.getElementById('btn-kategorie-neu')?.addEventListener('click', () => _formular_anzeigen(null, null));

    _laden();
}

// ─── Baum laden ──────────────────────────────────────────────────────────────

async function _laden() {
    const inhalt = document.getElementById('kategorie-inhalt');
    if (!inhalt) return;

    lade_anzeige_rendern(inhalt);

    const ergebnis = await apiGet('kategorien/liste.php');
    if (!ergebnis.erfolg) { apiFehlerAnzeigen(ergebnis); return; }

    _kategorien = ergebnis.daten || [];
    const admin = ist_admin();

    // Für nicht-Admin: private Lektionen als Pseudo-Kategorie
    let privateLektionen = [];
    if (!admin) {
        const privErg = await apiGet('lektionen/liste.php', { pro_seite: 100 });
        if (privErg.erfolg) {
            privateLektionen = (privErg.daten?.eintraege || []).filter(l => l.ist_privat);
        }
    }

    if (_kategorien.length === 0 && privateLektionen.length === 0) {
        leer_zustand_rendern(inhalt, 'folder', t('kategorie_liste.keine_lehrwerke'),
            t('kategorie_liste.keine_lehrwerke_text'),
            admin ? t('kategorie_liste.erstes_lehrwerk') : '',
            admin ? () => _formular_anzeigen(null, null) : null);
        return;
    }

    _baum_rendern(inhalt, privateLektionen);

    if (_ausgewaehlteKategorieId !== null) {
        if (_ausgewaehlteKategorieId === 'privat') {
            _private_lektionen_laden(privateLektionen);
        } else {
            _lektionen_laden(_ausgewaehlteKategorieId);
        }
    }
}

// ─── Baum rendern ────────────────────────────────────────────────────────────

function _baum_rendern(container, privateLektionen = []) {
    const admin    = ist_admin();
    const benutzer = holen('benutzer');
    let html       = '<div class="baum">';

    if (!admin && privateLektionen.length > 0) {
        const benutzername = benutzer?.benutzername || 'Meine';
        html += `
            <div class="baum__knoten">
                <div class="baum__zeile baum__zeile--klickbar baum__zeile--privat${_ausgewaehlteKategorieId === 'privat' ? ' baum__zeile--aktiv' : ''}"
                    data-id="privat">
                    <span class="baum__platzhalter"></span>
                    <span class="material-symbols-outlined baum__icon">lock</span>
                    <span class="baum__name kategorie-privat">${t('kategorie_liste.private_sammlung', {name: esc(benutzername)})}</span>
                    <span class="baum__anzahl">${t('kategorie_liste.lektionen_anzahl', {anzahl: privateLektionen.length})}</span>
                </div>
            </div>
        `;
    }

    for (const kat of _kategorien) {
        html += _knoten_html(kat, admin, 0);
    }

    html += '</div>';
    container.innerHTML = html;

    // Toggle expand/collapse
    container.querySelectorAll('.baum__toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = parseInt(btn.dataset.id, 10);
            _expandiert.has(id) ? _expandiert.delete(id) : _expandiert.add(id);
            _baum_rendern(container, privateLektionen);
            // Lektionen-Panel offen halten
            if (_ausgewaehlteKategorieId !== null && _ausgewaehlteKategorieId !== 'privat') {
                _lektionen_laden(_ausgewaehlteKategorieId);
            }
        });
    });

    // Klick auf Zeile → Lektionen anzeigen
    container.querySelectorAll('.baum__zeile--klickbar').forEach(zeile => {
        zeile.addEventListener('click', () => {
            const rawId = zeile.dataset.id;
            const id    = rawId === 'privat' ? 'privat' : parseInt(rawId, 10);
            if (_ausgewaehlteKategorieId === id) {
                _ausgewaehlteKategorieId = null;
                document.getElementById('kategorie-lektionen')?.classList.add('versteckt');
                container.querySelectorAll('.baum__zeile--aktiv').forEach(z => z.classList.remove('baum__zeile--aktiv'));
            } else {
                _ausgewaehlteKategorieId = id;
                container.querySelectorAll('.baum__zeile--aktiv').forEach(z => z.classList.remove('baum__zeile--aktiv'));
                zeile.classList.add('baum__zeile--aktiv');
                if (id === 'privat') {
                    _private_lektionen_laden(privateLektionen);
                } else {
                    _expandierteLektionen.clear();
                    _lektionen_laden(id);
                }
            }
        });
    });

    // Admin-Aktionen
    container.querySelectorAll('[data-aktion]').forEach(btn => {
        const id     = parseInt(btn.dataset.id, 10);
        const aktion = btn.dataset.aktion;

        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (aktion === 'kapitel-hinzufuegen') {
                _formular_anzeigen(id, null);
            } else if (aktion === 'bearbeiten') {
                _formular_anzeigen(null, id);
            } else if (aktion === 'loeschen') {
                const kat      = _kategorie_finden(_kategorien, id);
                const katName  = kat ? kat.name : '';

                // Lektionen & Unterkategorien zählen für Warnung
                const kinderAnzahl = kat ? _kinder_zaehlen(kat) : 0;
                let warnText = t('kategorie_liste.kategorie_loeschen_text', {name: katName});
                if (kinderAnzahl > 0) warnText += t('kategorie_liste.kategorie_loeschen_kinder', {anzahl: kinderAnzahl});
                warnText += t('kategorie_liste.kategorie_loeschen_hinweis');

                const ok = await bestaetigung_anzeigen(
                    t('kategorie_liste.kategorie_loeschen_titel'), warnText, t('allgemein.loeschen'), t('allgemein.abbrechen'), true
                );
                if (ok) {
                    const erg = await apiDelete(`kategorien/loeschen.php?id=${id}`);
                    if (erg.erfolg) {
                        if (_ausgewaehlteKategorieId === id) {
                            _ausgewaehlteKategorieId = null;
                            document.getElementById('kategorie-lektionen')?.classList.add('versteckt');
                        }
                        erfolg(erg.nachricht);
                        _laden();
                    } else {
                        apiFehlerAnzeigen(erg);
                    }
                }
            }
        });
    });

    // Aktive Markierung wiederherstellen
    if (_ausgewaehlteKategorieId !== null) {
        container.querySelectorAll(`.baum__zeile--klickbar[data-id="${_ausgewaehlteKategorieId}"]`)
            .forEach(z => z.classList.add('baum__zeile--aktiv'));
    }
}

function _knoten_html(kat, admin, ebene) {
    const hatKinder    = kat.kinder && kat.kinder.length > 0;
    const istExpandiert = _expandiert.has(kat.id);
    const einrueckung  = ebene * 24;

    let html = `
        <div class="baum__knoten" style="padding-left:${einrueckung}px">
            <div class="baum__zeile baum__zeile--klickbar${_ausgewaehlteKategorieId === kat.id ? ' baum__zeile--aktiv' : ''}" data-id="${kat.id}">
                ${hatKinder
                    ? `<button class="baum__toggle" data-id="${kat.id}">
                            <span class="material-symbols-outlined">${istExpandiert ? 'expand_more' : 'chevron_right'}</span>
                       </button>`
                    : '<span class="baum__platzhalter"></span>'}
                <span class="material-symbols-outlined baum__icon">${ebene === 0 ? 'folder' : 'description'}</span>
                <span class="baum__name">${esc(kat.name)}</span>
                <span class="baum__anzahl">${t('kategorie_liste.vokabeln_anzahl', {anzahl: kat.vokabel_anzahl})}</span>
                ${!kat.aktiv ? `<span class="tag tag--deaktiviert">${t('kategorie_liste.deaktiviert')}</span>` : ''}
                ${admin ? `
                    <div class="baum__aktionen">
                        ${ebene === 0 ? `
                            <button class="btn-icon" data-aktion="kapitel-hinzufuegen" data-id="${kat.id}" title="${t('kategorie_liste.kapitel_hinzufuegen')}">
                                <span class="material-symbols-outlined">create_new_folder</span>
                            </button>
                        ` : ''}
                        <button class="btn-icon" data-aktion="bearbeiten" data-id="${kat.id}" title="${t('allgemein.bearbeiten')}">
                            <span class="material-symbols-outlined">edit</span>
                        </button>
                        <button class="btn-icon btn-icon--gefaehrlich" data-aktion="loeschen" data-id="${kat.id}" title="${t('allgemein.loeschen')}">
                            <span class="material-symbols-outlined">delete</span>
                        </button>
                    </div>
                ` : ''}
            </div>
        </div>
    `;

    if (hatKinder && istExpandiert) {
        for (const kind of kat.kinder) {
            html += _knoten_html(kind, admin, ebene + 1);
        }
    }
    return html;
}

// ─── Lektionen-Panel ─────────────────────────────────────────────────────────

function _private_lektionen_laden(privateLektionen) {
    const panel    = document.getElementById('kategorie-lektionen');
    if (!panel) return;
    panel.classList.remove('versteckt');

    const benutzer    = holen('benutzer');
    const benutzername = benutzer?.benutzername || 'Meine';

    let html = `
        <div class="lektionen-panel">
            <div class="lektionen-panel__kopf">
                <h3>
                    <span class="material-symbols-outlined" style="vertical-align:middle;font-size:20px">lock</span>
                    ${t('kategorie_liste.private_lektionen', {name: esc(benutzername)})}
                </h3>
                <button class="btn-icon" id="btn-panel-schliessen" title="${t('allgemein.schliessen')}">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
    `;

    if (privateLektionen.length === 0) {
        html += `<p class="lektionen-panel__leer">${t('kategorie_liste.keine_privaten')}</p>`;
    } else {
        html += privateLektionen.map(l => _lektion_eintrag_html(l, null)).join('');
    }

    html += `</div>`;
    panel.innerHTML = html;
    _panel_events(panel, privateLektionen);
}

async function _lektionen_laden(kategorieId) {
    const panel = document.getElementById('kategorie-lektionen');
    if (!panel) return;
    panel.classList.remove('versteckt');
    lade_anzeige_rendern(panel);

    const kat     = _kategorie_finden(_kategorien, kategorieId);
    const katName = kat ? kat.name : '';
    const admin   = ist_admin();

    const erg = await apiGet('lektionen/liste.php', {
        kategorie_id: kategorieId, nur_aktive: 1, pro_seite: 100,
        ...(admin ? { auch_private: 1 } : {}),
    });

    if (!erg.erfolg) {
        panel.innerHTML = `<p class="editor-formular__hinweis">${t('kategorie_liste.fehler_laden')}</p>`;
        return;
    }

    let lektionen = erg.daten?.eintraege || [];

    // Lernpfad-Filter
    if (_lernpfadDaten) {
        // Alle Lektionen anzeigen, aber gesperrte markieren (nicht ausblenden)
    }

    let html = `
        <div class="lektionen-panel">
            <div class="lektionen-panel__kopf">
                <h3>
                    <span class="material-symbols-outlined" style="vertical-align:middle;font-size:20px">menu_book</span>
                    ${esc(katName)}
                </h3>
                <div style="display:flex;gap:6px;align-items:center">
                    ${admin ? `
                        <button class="btn btn--text btn--klein" id="btn-lektionen-verwalten">
                            <span class="material-symbols-outlined" style="font-size:16px">settings</span>
                            ${t('kategorie_liste.verwalten')}
                        </button>
                    ` : ''}
                    <button class="btn-icon" id="btn-panel-schliessen" title="${t('allgemein.schliessen')}">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
            </div>
    `;

    if (lektionen.length === 0) {
        html += `<p class="lektionen-panel__leer">${t('kategorie_liste.keine_lektionen')}</p>`;
        if (admin) {
            html += `
                <button class="btn btn--umrandet btn--klein" id="btn-lektion-hier-neu">
                    <span class="material-symbols-outlined" style="font-size:18px">add</span>
                    ${t('kategorie_liste.lektion_hier_anlegen')}
                </button>
            `;
        }
    } else {
        html += lektionen.map(l => {
            const lernpfadInfo = _lernpfadDaten
                ? (_lernpfadDaten.lektionen?.find(lp => lp.id === l.id) || null)
                : null;
            return _lektion_eintrag_html(l, lernpfadInfo);
        }).join('');

        if (admin) {
            html += `
                <div style="padding:8px 0 4px">
                    <button class="btn btn--umrandet btn--klein" id="btn-lektion-hier-neu">
                        <span class="material-symbols-outlined" style="font-size:18px">add</span>
                        ${t('kategorie_liste.lektion_hier_anlegen')}
                    </button>
                </div>
            `;
        }
    }

    html += `</div>`;
    panel.innerHTML = html;
    _panel_events(panel, lektionen, kategorieId);
}

function _lektion_eintrag_html(l, lernpfadInfo) {
    const istExpandiert  = _expandierteLektionen.has(l.id);
    const istGesperrt    = lernpfadInfo && !lernpfadInfo.freigeschaltet;
    const istErste       = lernpfadInfo?.erste_der_kategorie;
    const fortschrittPct = lernpfadInfo ? Math.round(lernpfadInfo.stufe3_anteil * 100) : null;

    let lernpfadBadge = '';
    if (lernpfadInfo) {
        if (istGesperrt) {
            lernpfadBadge = `<span class="lernpfad-badge lernpfad-badge--gesperrt" title="${t('kategorie_liste.lernpfad_gesperrt', {prozent: fortschrittPct})}">
                <span class="material-symbols-outlined" style="font-size:13px">lock</span> ${fortschrittPct}%
            </span>`;
        } else {
            lernpfadBadge = `<span class="lernpfad-badge lernpfad-badge--frei" title="${istErste ? t('kategorie_liste.lernpfad_erste') : t('kategorie_liste.lernpfad_fortschritt', {prozent: fortschrittPct})}">
                <span class="material-symbols-outlined" style="font-size:13px">${istErste ? 'star' : 'check_circle'}</span> ${istErste ? '' : fortschrittPct + '%'}
            </span>`;
        }
    }

    return `
        <div class="lektion-eintrag${istGesperrt ? ' lektion-eintrag--gesperrt' : ''}${istExpandiert ? ' lektion-eintrag--offen' : ''}"
            data-lektion-id="${l.id}">
            <div class="lektion-eintrag__kopf" data-aktion="toggle" data-id="${l.id}">
                <div class="lektion-eintrag__kopf-links">
                    <span class="material-symbols-outlined lektion-eintrag__chevron">${istExpandiert ? 'expand_more' : 'chevron_right'}</span>
                    <div>
                        <span class="lektion-eintrag__titel">${esc(l.titel)}</span>
                        <span class="lektion-eintrag__meta">
                            <span class="tag tag--${(l.sprachniveau || 'a1').toLowerCase()}">${esc(l.sprachniveau || 'A1')}</span>
                            <span>${t('kategorie_liste.vokabeln_anzahl', {anzahl: l.vokabel_anzahl})}</span>
                            ${lernpfadBadge}
                        </span>
                    </div>
                </div>
            </div>
            ${istExpandiert ? `<div class="lektion-eintrag__vokabeln" id="vok-panel-${l.id}">
                <div class="lektion-eintrag__lade">${t('kategorie_liste.lade_vokabeln')}</div>
            </div>` : ''}
        </div>
    `;
}

function _panel_events(panel, lektionen, kategorieId = null) {
    const admin = ist_admin();

    document.getElementById('btn-panel-schliessen')?.addEventListener('click', () => {
        panel.classList.add('versteckt');
        _ausgewaehlteKategorieId = null;
        document.querySelectorAll('.baum__zeile--aktiv').forEach(z => z.classList.remove('baum__zeile--aktiv'));
    });

    document.getElementById('btn-lektionen-verwalten')?.addEventListener('click', () => {
        navigieren(`/lektionen?kategorie=${kategorieId}`);
    });

    document.getElementById('btn-lektion-hier-neu')?.addEventListener('click', () => {
        navigieren(`/lektionen?kategorie=${kategorieId}&neu=1`);
    });

    // Lektion aufklappen / zuklappen
    panel.querySelectorAll('[data-aktion="toggle"]').forEach(kopf => {
        kopf.addEventListener('click', async () => {
            const id = parseInt(kopf.dataset.id, 10);
            if (_expandierteLektionen.has(id)) {
                _expandierteLektionen.delete(id);
                // Eintrag neu rendern (zugeklappt)
                const eintrag = panel.querySelector(`.lektion-eintrag[data-lektion-id="${id}"]`);
                if (eintrag) {
                    const l           = lektionen.find(lk => lk.id === id);
                    const lernpfadInfo = _lernpfadDaten
                        ? (_lernpfadDaten.lektionen?.find(lp => lp.id === id) || null)
                        : null;
                    eintrag.outerHTML = _lektion_eintrag_html(l, lernpfadInfo);
                    // Neu-gebundene Events
                    const neuerEintrag = panel.querySelector(`.lektion-eintrag[data-lektion-id="${id}"]`);
                    neuerEintrag?.querySelector('[data-aktion="toggle"]')?.addEventListener('click',
                        () => kopf.click()); // Rekursion vermeiden — direkt ersetzen
                }
                // Einfacher: ganzes Panel neu laden
                if (kategorieId !== null) {
                    await _lektionen_laden(kategorieId);
                } else {
                    const benutzer = holen('benutzer');
                    _private_lektionen_laden(lektionen);
                }
            } else {
                _expandierteLektionen.add(id);
                if (kategorieId !== null) {
                    await _lektionen_laden(kategorieId);
                } else {
                    _private_lektionen_laden(lektionen);
                }
                // Vokabeln laden
                await _vokabeln_laden(id);
            }
        });
    });
}

async function _vokabeln_laden(lektionId) {
    const vokPanel = document.getElementById(`vok-panel-${lektionId}`);
    if (!vokPanel) return;

    const erg = await apiGet(`lektionen/details.php?id=${lektionId}`);
    if (!erg.erfolg) {
        vokPanel.innerHTML = `<p class="lektion-eintrag__lade-fehler">${t('kategorie_liste.fehler_vokabeln')}</p>`;
        return;
    }

    const vokabeln = erg.daten?.vokabeln || [];

    if (vokabeln.length === 0) {
        vokPanel.innerHTML = `<p class="lektion-eintrag__leer">${t('kategorie_liste.keine_vokabeln')}</p>`;
        return;
    }

    let html = '<div class="vokabel-inline-liste">';
    for (const v of vokabeln) {
        const wortart   = (v.wortart || '').toLowerCase();
        const satzAnzahl = v.satz_anzahl ?? 0;

        // Satz-Icon: grün wenn Sätze vorhanden, grau wenn nicht
        const satzIcon = satzAnzahl > 0
            ? `<span class="vok-satz-icon vok-satz-icon--vorhanden" title="${t('kategorie_liste.beispielsaetze_vorhanden', {anzahl: satzAnzahl})}">
                <span class="material-symbols-outlined" style="font-size:14px">format_quote</span>
                <span>${satzAnzahl}</span>
               </span>`
            : `<span class="vok-satz-icon vok-satz-icon--fehlt" title="${t('kategorie_liste.keine_beispielsaetze')}">
                <span class="material-symbols-outlined" style="font-size:14px">format_quote</span>
               </span>`;

        html += `
            <div class="vokabel-inline-eintrag">
                <div class="vokabel-inline-eintrag__hauptwort">
                    <span class="vokabel-inline-eintrag__sv">${esc(v.schwedisch)}</span>
                    <span class="vokabel-inline-eintrag__de">${esc(v.deutsch)}</span>
                </div>
                <div class="vokabel-inline-eintrag__meta">
                    <span class="tag tag--${wortart}">${esc(v.wortart || '—')}</span>
                    ${v.genus ? `<span class="tag tag--genus">${esc(v.genus)}</span>` : ''}
                    ${satzIcon}
                </div>
            </div>
        `;
    }
    html += '</div>';
    vokPanel.innerHTML = html;
}

// ─── Kategorie-Formular ──────────────────────────────────────────────────────

async function _formular_anzeigen(elternId, bearbeitenId) {
    const container = document.getElementById('kategorie-formular');
    if (!container) return;
    container.classList.remove('versteckt');

    let name        = '';
    let beschreibung = '';
    let titel       = elternId ? t('kategorie_liste.neues_kapitel') : t('kategorie_liste.neues_lehrwerk_formular');

    if (bearbeitenId) {
        const kat = _kategorie_finden(_kategorien, bearbeitenId);
        if (kat) {
            name        = kat.name;
            beschreibung = kat.beschreibung || '';
            titel       = t('kategorie_liste.bearbeiten_formular', {name: kat.name});
        }
    }

    container.innerHTML = `
        <div class="karte editor-formular__inline">
            <h3>${esc(titel)}</h3>
            <div class="formular-gruppe">
                <label class="formular-label" for="kat-name">${t('kategorie_liste.name_label')}</label>
                <input class="eingabe" type="text" id="kat-name" value="${esc(name)}" required
                    placeholder="${elternId ? t('kategorie_liste.kapitelname_placeholder') : t('kategorie_liste.lehrwerk_placeholder')}">
            </div>
            <div class="formular-gruppe">
                <label class="formular-label" for="kat-beschreibung">${t('kategorie_liste.beschreibung_label')}</label>
                <textarea class="eingabe" id="kat-beschreibung" rows="2">${esc(beschreibung)}</textarea>
            </div>
            <div class="editor-formular__aktionen">
                <button class="btn btn--text" id="btn-kat-abbrechen">${t('allgemein.abbrechen')}</button>
                <button class="btn btn--gefuellt" id="btn-kat-speichern">${t('allgemein.speichern')}</button>
            </div>
        </div>
    `;

    document.getElementById('btn-kat-abbrechen')?.addEventListener('click', () => {
        container.classList.add('versteckt');
        container.innerHTML = '';
    });

    document.getElementById('btn-kat-speichern')?.addEventListener('click', async () => {
        const eingabeName  = document.getElementById('kat-name')?.value?.trim();
        const eingabeBeschr = document.getElementById('kat-beschreibung')?.value?.trim();
        if (!eingabeName) { fehler(t('kategorie_liste.name_erforderlich')); return; }

        let erg;
        if (bearbeitenId) {
            erg = await apiPut(`kategorien/aktualisieren.php?id=${bearbeitenId}`, {
                name: eingabeName, beschreibung: eingabeBeschr || null,
            });
        } else {
            erg = await apiPost('kategorien/erstellen.php', {
                name: eingabeName, beschreibung: eingabeBeschr || null, eltern_id: elternId || null,
            });
        }

        if (erg.erfolg) {
            erfolg(bearbeitenId ? t('kategorie_liste.kategorie_aktualisiert') : t('kategorie_liste.kategorie_erstellt'));
            container.classList.add('versteckt');
            container.innerHTML = '';
            _laden();
        } else {
            apiFehlerAnzeigen(erg);
        }
    });

    document.getElementById('kat-name')?.focus();
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function _kategorie_finden(kategorien, id) {
    for (const kat of kategorien) {
        if (kat.id === id) return kat;
        if (kat.kinder) {
            const gefunden = _kategorie_finden(kat.kinder, id);
            if (gefunden) return gefunden;
        }
    }
    return null;
}

function _kinder_zaehlen(kat) {
    if (!kat.kinder || kat.kinder.length === 0) return 0;
    return kat.kinder.reduce((sum, k) => sum + 1 + _kinder_zaehlen(k), 0);
}

export function aufraeumen() {
    _expandiert.clear();
    _expandierteLektionen.clear();
    _ausgewaehlteKategorieId = null;
    _lernpfadDaten = null;
}
