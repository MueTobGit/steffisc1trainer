/**
 * Lade-Anzeige — Zentrierter CSS-Spinner
 *
 * Zeigt eine Ladeanimation im Container.
 */

import { t } from '../dienste/sprache.js';

/**
 * Lade-Anzeige in Container rendern
 *
 * @param {HTMLElement} container Ziel-Element
 * @param {string} [text='Wird geladen...'] Optionaler Text
 */
export function lade_anzeige_rendern(container, text = null) {
    if (text === null) text = t('allgemein.laden');
    if (!container) return;

    container.innerHTML = `
        <div class="lade-anzeige">
            <div class="lade-anzeige__spinner"></div>
            <span class="lade-anzeige__text">${text}</span>
        </div>
    `;
}

/**
 * Lade-Anzeige entfernen
 *
 * @param {HTMLElement} container Ziel-Element
 */
export function lade_anzeige_entfernen(container) {
    if (!container) return;

    const anzeige = container.querySelector('.lade-anzeige');
    if (anzeige) {
        anzeige.remove();
    }
}
