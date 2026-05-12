/**
 * Rangliste-Tabelle Komponente
 *
 * Wiederverwendbare Tabelle fuer Liga-Rankings.
 * Top 3 hervorgehoben mit Medaillen. Eigener Rang markiert.
 *
 * @module komponenten/rangliste-tabelle
 */

import { esc, zahlFormatieren } from '../hilfs-funktionen.js';
import { t } from '../dienste/sprache.js';
import { krone_svg_html } from '../dienste/krone-svg.js';

const MEDAILLEN = { 1: '\u{1F947}', 2: '\u{1F948}', 3: '\u{1F949}' };

/**
 * Rangliste-Tabelle erstellen
 *
 * @param {Array} teilnehmer Array of { rang, benutzername, spitzname, punkte, ist_ich }
 * @param {object} [optionen]
 * @param {boolean} [optionen.kompakt=false]  Kompakter Modus
 * @param {string}  [optionen.punkte_label='Punkte'] Spalten-Label
 * @returns {HTMLElement}
 */
export function rangliste_tabelle_erstellen(teilnehmer, optionen = {}) {
    const {
        kompakt = false,
        punkte_label = t('rangliste.punkte'),
    } = optionen;

    const container = document.createElement('div');
    container.className = 'rangliste' + (kompakt ? ' rangliste--kompakt' : '');

    if (!teilnehmer || teilnehmer.length === 0) {
        container.innerHTML = `
            <div class="rangliste__leer">
                <span class="material-symbols-outlined">leaderboard</span>
                <p>${t('rangliste.keine_teilnehmer')}</p>
            </div>
        `;
        return container;
    }

    // Kopfzeile
    const kopf = document.createElement('div');
    kopf.className = 'rangliste__kopf';
    kopf.innerHTML = `
        <span class="rangliste__kopf-rang">#</span>
        <span class="rangliste__kopf-name">${t('rangliste.name')}</span>
        <span class="rangliste__kopf-punkte">${esc(punkte_label)}</span>
    `;
    container.appendChild(kopf);

    // Liste
    const liste = document.createElement('div');
    liste.className = 'rangliste__liste';

    for (const tn of teilnehmer) {
        const eintrag = document.createElement('div');
        let klassen = 'rangliste__eintrag';

        if (tn.rang <= 3) klassen += ` rangliste__eintrag--top${tn.rang}`;
        if (tn.ist_ich) klassen += ' rangliste__eintrag--ich';

        eintrag.className = klassen;

        const name = tn.spitzname || tn.benutzername || t('rangliste.unbekannt');
        const initiale = name.charAt(0).toUpperCase();
        const medaille = MEDAILLEN[tn.rang] || '';
        const kroneSvg = tn.beste_krone
            ? krone_svg_html(tn.beste_krone_typ || 'standard', tn.beste_krone)
            : '';
        const avatarHtml = tn.avatar_url
            ? `<img src="${esc(tn.avatar_url)}" class="rangliste__avatar rangliste__avatar--img" alt="${esc(initiale)}">`
            : `<span class="rangliste__avatar">${esc(initiale)}</span>`;

        eintrag.innerHTML = `
            <span class="rangliste__rang">
                ${medaille ? `<span class="rangliste__medaille">${medaille}</span>` : tn.rang}
            </span>
            <span class="rangliste__name">
                ${avatarHtml}
                <span class="rangliste__name-text">${esc(name)}</span>
                ${kroneSvg ? `<span class="rangliste__krone" title="${t('rangliste.liga_sieger')}">${kroneSvg}</span>` : ''}
                ${tn.ist_ich ? `<span class="tag tag--klein">${t('rangliste.du')}</span>` : ''}
            </span>
            <span class="rangliste__punkte">${zahlFormatieren(tn.punkte)}</span>
        `;

        liste.appendChild(eintrag);
    }

    container.appendChild(liste);
    return container;
}
