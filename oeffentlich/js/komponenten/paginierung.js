/**
 * Paginierung — Wiederverwendbare Seitennavigation
 *
 * Zeigt Zurueck/Seiten-Buttons/Weiter.
 * Nutzt paginierung-Daten aus API-Antwort.
 */

import { t } from '../dienste/sprache.js';

/**
 * Paginierung rendern
 *
 * @param {HTMLElement} container Ziel-Element
 * @param {object} paginierung Paginierungs-Daten aus API
 * @param {function} callback Funktion(seite) bei Seitenwechsel
 */
export function paginierung_rendern(container, paginierung, callback) {
    if (!container || !paginierung || paginierung.gesamt_seiten <= 1) {
        // Keine Paginierung noetig
        if (container) container.innerHTML = '';
        return;
    }

    const { seite, gesamt_seiten, gesamt, hat_vorherige, hat_naechste } = paginierung;

    // Sichtbare Seiten berechnen (max 5 Buttons)
    const maxButtons = 5;
    let start = Math.max(1, seite - Math.floor(maxButtons / 2));
    let ende = Math.min(gesamt_seiten, start + maxButtons - 1);

    if (ende - start + 1 < maxButtons) {
        start = Math.max(1, ende - maxButtons + 1);
    }

    let html = '<div class="paginierung">';

    // Zurueck-Button
    html += `
        <button class="paginierung__btn ${hat_vorherige ? '' : 'paginierung__btn--deaktiviert'}"
                data-seite="${seite - 1}" ${hat_vorherige ? '' : 'disabled'}>
            <span class="material-symbols-outlined" style="font-size:20px">chevron_left</span>
        </button>
    `;

    // Erste Seite + Punkte
    if (start > 1) {
        html += `<button class="paginierung__btn paginierung__seite" data-seite="1">1</button>`;
        if (start > 2) {
            html += `<span class="paginierung__punkte">...</span>`;
        }
    }

    // Seiten-Buttons
    for (let i = start; i <= ende; i++) {
        const aktiv = i === seite ? 'paginierung__seite--aktiv' : '';
        html += `<button class="paginierung__btn paginierung__seite ${aktiv}" data-seite="${i}">${i}</button>`;
    }

    // Letzte Seite + Punkte
    if (ende < gesamt_seiten) {
        if (ende < gesamt_seiten - 1) {
            html += `<span class="paginierung__punkte">...</span>`;
        }
        html += `<button class="paginierung__btn paginierung__seite" data-seite="${gesamt_seiten}">${gesamt_seiten}</button>`;
    }

    // Weiter-Button
    html += `
        <button class="paginierung__btn ${hat_naechste ? '' : 'paginierung__btn--deaktiviert'}"
                data-seite="${seite + 1}" ${hat_naechste ? '' : 'disabled'}>
            <span class="material-symbols-outlined" style="font-size:20px">chevron_right</span>
        </button>
    `;

    // Info
    html += `<span class="paginierung__info">${t('paginierung.eintraege', { anzahl: gesamt })}</span>`;

    html += '</div>';

    container.innerHTML = html;

    // Event-Listener
    container.querySelectorAll('[data-seite]').forEach(btn => {
        if (!btn.disabled) {
            btn.addEventListener('click', () => {
                const zielSeite = parseInt(btn.dataset.seite, 10);
                if (zielSeite >= 1 && zielSeite <= gesamt_seiten) {
                    callback(zielSeite);
                }
            });
        }
    });
}
