/**
 * Leer-Zustand — Platzhalter wenn keine Daten vorhanden
 *
 * Zeigt Icon + Titel + Beschreibung + optionalen Aktions-Button.
 */

import { esc } from '../hilfs-funktionen.js';

/**
 * Leer-Zustand in Container rendern
 *
 * @param {HTMLElement} container Ziel-Element
 * @param {string} icon Material-Symbol-Name
 * @param {string} titel Titel-Text
 * @param {string} beschreibung Beschreibungstext
 * @param {string} [aktionText] Button-Text (optional)
 * @param {function} [aktionCb] Button-Callback (optional)
 */
export function leer_zustand_rendern(container, icon, titel, beschreibung, aktionText = '', aktionCb = null) {
    if (!container) return;

    let aktionHtml = '';
    if (aktionText) {
        aktionHtml = `
            <button class="btn btn--tonal leer-zustand__aktion" id="leer-zustand-aktion">
                ${esc(aktionText)}
            </button>
        `;
    }

    container.innerHTML = `
        <div class="leer-zustand">
            <span class="material-symbols-outlined leer-zustand__icon">${esc(icon)}</span>
            <h3 class="leer-zustand__titel">${esc(titel)}</h3>
            <p class="leer-zustand__beschreibung">${esc(beschreibung)}</p>
            ${aktionHtml}
        </div>
    `;

    if (aktionCb) {
        const btn = container.querySelector('#leer-zustand-aktion');
        if (btn) {
            btn.addEventListener('click', aktionCb);
        }
    }
}
