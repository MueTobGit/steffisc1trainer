/**
 * Ligen — Monats-Liga mit Rangliste
 *
 * Zeigt aktuelle Liga-Info, Beitreten-Button,
 * und paginierte Rangliste mit Medaillen fuer Top 3.
 */

import { apiGet, apiPost, apiPaginiert } from '../api-client.js';
import { esc, zahlFormatieren, datumFormatieren } from '../hilfs-funktionen.js';
import { paginierung_rendern } from '../komponenten/paginierung.js';
import { lade_anzeige_rendern, lade_anzeige_entfernen } from '../komponenten/lade-anzeige.js';
import { leer_zustand_rendern } from '../komponenten/leer-zustand.js';
import { rangliste_tabelle_erstellen } from '../komponenten/rangliste-tabelle.js';
import { erfolg, fehler as fehlerMsg } from '../benachrichtigungen.js';
import { t } from '../dienste/sprache.js';
import { krone_svg_html } from '../dienste/krone-svg.js';

// ============================================
// Modul-Zustand
// ============================================

let _ligaId = null;
let _ranglisteSeite = 1;
let _wrapper = null;

// ============================================
// Modul-Exports
// ============================================

export async function rendern() {
    const container = document.getElementById('inhalt');
    if (!container) return;

    container.innerHTML = '';

    _wrapper = document.createElement('div');
    _wrapper.className = 'sozial';
    container.appendChild(_wrapper);

    _wrapper.innerHTML = `
        <div class="sozial__kopf">
            <h2 class="sozial__titel">${t('ligen.titel')}</h2>
        </div>
        <div id="liga-info"></div>
        <div id="liga-rangliste"></div>
        <div id="liga-paginierung"></div>
        <div id="liga-champions"></div>
    `;

    await _laden();
    _champions_laden();
}

export function aufraeumen() {
    _ligaId = null;
    _ranglisteSeite = 1;
    _wrapper = null;
}

// ============================================
// Daten laden
// ============================================

async function _laden() {
    const infoContainer = _wrapper.querySelector('#liga-info');
    const ranglisteContainer = _wrapper.querySelector('#liga-rangliste');
    const pagContainer = _wrapper.querySelector('#liga-paginierung');

    ranglisteContainer.innerHTML = '';
    pagContainer.innerHTML = '';

    lade_anzeige_rendern(infoContainer);

    try {
        const ergebnis = await apiGet('ligen/aktuelle.php');

        lade_anzeige_entfernen(infoContainer);

        if (!ergebnis.erfolg) {
            leer_zustand_rendern(infoContainer, 'error', t('profil.fehler_titel'), t('ligen.fehler_laden'));
            return;
        }

        const { liga, teilnahme } = ergebnis.daten;

        if (!liga) {
            infoContainer.innerHTML = '';
            leer_zustand_rendern(infoContainer, 'emoji_events', t('ligen.keine_liga'),
                t('ligen.keine_liga_text'));
            return;
        }

        _ligaId = liga.id;
        _liga_info_rendern(infoContainer, liga, teilnahme);

        // Rangliste immer laden — auch ohne Beitritt sichtbar
        await _rangliste_laden();
    } catch (e) {
        console.error('Liga laden fehlgeschlagen:', e);
        lade_anzeige_entfernen(infoContainer);
        leer_zustand_rendern(infoContainer, 'error', t('profil.fehler_titel'), t('profil.fehler_netzwerk'));
    }
}

// ============================================
// Liga-Info Karte
// ============================================

function _liga_info_rendern(container, liga, teilnahme) {
    container.innerHTML = '';

    const karte = document.createElement('div');
    karte.className = 'karte liga-info';

    const startDatum = datumFormatieren(liga.start_datum);
    const endDatum = datumFormatieren(liga.end_datum);

    let statsHtml = '';
    if (teilnahme) {
        statsHtml = `
            <div class="liga-info__stats">
                <div class="liga-info__stat">
                    <span class="liga-info__stat-wert">${zahlFormatieren(liga.teilnehmer_anzahl)}</span>
                    <span class="liga-info__stat-label">${t('ligen.teilnehmer')}</span>
                </div>
                <div class="liga-info__stat">
                    <span class="liga-info__stat-wert">${zahlFormatieren(teilnahme.punkte)}</span>
                    <span class="liga-info__stat-label">${t('ligen.deine_punkte')}</span>
                </div>
                <div class="liga-info__stat">
                    <span class="liga-info__stat-wert">#${teilnahme.rang}</span>
                    <span class="liga-info__stat-label">${t('ligen.dein_rang')}</span>
                </div>
            </div>
        `;
    } else {
        statsHtml = `
            <div class="liga-info__stats">
                <div class="liga-info__stat">
                    <span class="liga-info__stat-wert">${zahlFormatieren(liga.teilnehmer_anzahl)}</span>
                    <span class="liga-info__stat-label">${t('ligen.teilnehmer')}</span>
                </div>
            </div>
            <button class="btn btn--gefuellt btn--breit" id="btn-liga-beitreten">
                <span class="material-symbols-outlined">add</span>
                ${t('ligen.beitreten')}
            </button>
        `;
    }

    karte.innerHTML = `
        <div class="liga-info__kopf">
            <span class="material-symbols-outlined liga-info__icon">emoji_events</span>
            <div>
                <h3 class="liga-info__name">${esc(liga.name)}</h3>
                <span class="liga-info__zeitraum">${startDatum} — ${endDatum}</span>
            </div>
        </div>
        ${liga.beschreibung ? `<p class="liga-info__beschreibung">${esc(liga.beschreibung)}</p>` : ''}
        ${statsHtml}
    `;

    container.appendChild(karte);

    // Beitreten-Button
    const beitretenBtn = karte.querySelector('#btn-liga-beitreten');
    if (beitretenBtn) {
        beitretenBtn.addEventListener('click', _beitreten);
    }
}

// ============================================
// Rangliste
// ============================================

async function _rangliste_laden() {
    if (!_ligaId) return;

    const ranglisteContainer = _wrapper.querySelector('#liga-rangliste');
    const pagContainer = _wrapper.querySelector('#liga-paginierung');

    lade_anzeige_rendern(ranglisteContainer);

    try {
        const ergebnis = await apiPaginiert('ligen/rangliste.php', _ranglisteSeite, { liga_id: _ligaId });

        lade_anzeige_entfernen(ranglisteContainer);

        if (!ergebnis.erfolg) {
            ranglisteContainer.innerHTML = `<p style="color:var(--md-sys-color-error)">${t('ligen.rangliste_fehler')}</p>`;
            return;
        }

        const teilnehmer = ergebnis.daten?.eintraege || [];
        const paginierung = ergebnis.daten?.paginierung;

        ranglisteContainer.innerHTML = '';

        if (teilnehmer.length === 0) {
            leer_zustand_rendern(ranglisteContainer, 'leaderboard', t('ligen.keine_teilnehmer'),
                t('ligen.keine_teilnehmer_text'));
            return;
        }

        // Rangliste-Tabelle Komponente
        const tabelle = rangliste_tabelle_erstellen(teilnehmer);
        ranglisteContainer.appendChild(tabelle);

        // Paginierung
        pagContainer.innerHTML = '';
        if (paginierung && paginierung.gesamt_seiten > 1) {
            paginierung_rendern(pagContainer, paginierung, (s) => {
                _ranglisteSeite = s;
                _rangliste_laden();
            });
        }
    } catch (e) {
        console.error('Rangliste laden fehlgeschlagen:', e);
        lade_anzeige_entfernen(ranglisteContainer);
    }
}

// ============================================
// Champions — vergangene Liga-Sieger
// ============================================

async function _champions_laden() {
    const container = _wrapper?.querySelector('#liga-champions');
    if (!container) return;

    try {
        const ergebnis = await apiGet('ligen/champions.php', { limit: 3 });
        if (!ergebnis.erfolg || !ergebnis.daten?.ligas?.length) return;

        container.innerHTML = '';
        const sektion = document.createElement('section');
        sektion.className = 'liga-champions';

        const titel = document.createElement('h3');
        titel.className = 'liga-champions__titel';
        titel.innerHTML = `<span class="material-symbols-outlined">military_tech</span> ${t('ligen.champions_titel')}`;
        sektion.appendChild(titel);

        for (const liga of ergebnis.daten.ligas) {
            sektion.appendChild(_champion_karte(liga));
        }

        container.appendChild(sektion);
    } catch (e) {
        // Champions-Sektion ist optional — Fehler stillschweigend ignorieren
    }
}

function _champion_karte(liga) {
    const karte = document.createElement('div');
    karte.className = 'karte liga-champion-karte';

    const kopf = document.createElement('div');
    kopf.className = 'liga-champion-karte__kopf';
    kopf.innerHTML = `
        <span class="liga-champion-karte__name">${esc(liga.liga_name)}</span>
        <span class="liga-champion-karte__datum">${datumFormatieren(liga.end_datum)}</span>
    `;
    karte.appendChild(kopf);

    if (!liga.gewinner?.length) {
        const leer = document.createElement('p');
        leer.className = 'liga-champion-karte__leer';
        leer.textContent = t('ligen.champions_keine');
        karte.appendChild(leer);
        return karte;
    }

    const liste = document.createElement('ol');
    liste.className = 'liga-champion-karte__liste';

    for (const w of liga.gewinner) {
        const item = document.createElement('li');
        item.className = `liga-champion-karte__eintrag liga-champion-karte__eintrag--rang${w.rang}`;
        const name = esc(w.spitzname || w.benutzername);
        item.innerHTML = `
            <span class="liga-champion-karte__krone">${krone_svg_html(liga.krone_typ || 'standard', w.rang)}</span>
            <span class="liga-champion-karte__benutzer">${name}</span>
            <span class="liga-champion-karte__punkte">${zahlFormatieren(w.punkte)}</span>
        `;
        liste.appendChild(item);
    }

    karte.appendChild(liste);
    return karte;
}

// ============================================
// Liga beitreten
// ============================================

async function _beitreten() {
    const ergebnis = await apiPost('ligen/beitreten.php');

    if (ergebnis.erfolg) {
        erfolg(t('ligen.beigetreten'));
        _ranglisteSeite = 1;
        await _laden();
    } else {
        fehlerMsg(ergebnis.fehler?.nachricht || t('ligen.beitreten_fehler'));
    }
}
