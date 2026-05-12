/**
 * Untere Leiste — Mobile Bottom Navigation Bar
 *
 * 5 Icons: Home, Vokabeln, Training, Fortschritt, Profil
 */

import { holen, abonnieren } from '../zustand.js';
import { unten_leiste_routen, navigieren } from '../router.js';
import { esc } from '../hilfs-funktionen.js';
import { krone_svg_html } from '../dienste/krone-svg.js';

/**
 * Untere Leiste rendern
 */
export function unten_leiste_rendern() {
    const container = document.getElementById('unten-leiste');
    if (!container) return;

    const routen      = unten_leiste_routen();
    const aktiveRoute = holen('aktive_route');
    const benutzer    = holen('benutzer');
    const avatarUrl   = benutzer?.avatar_url;
    const beste_krone     = benutzer?.beste_krone;
    const beste_krone_typ = benutzer?.beste_krone_typ || 'standard';

    let html = '<nav class="unten-leiste__nav">';

    for (const route of routen) {
        const istAktiv = aktiveRoute === route.pfad ||
            (route.pfad === '/dashboard' && aktiveRoute === '');
        const aktivKlasse = istAktiv ? 'unten-leiste__link--aktiv' : '';

        let ikonHtml;
        if (route.pfad === '/profil') {
            const kroneBadge = beste_krone
                ? `<span class="krone-badge">${krone_svg_html(beste_krone_typ, beste_krone)}</span>`
                : '';
            ikonHtml = avatarUrl
                ? `<span class="krone-badge-wrapper"><img src="${esc(avatarUrl)}" class="unten-leiste__avatar-img" alt="Avatar">${kroneBadge}</span>`
                : `<span class="krone-badge-wrapper"><span class="material-symbols-outlined">${route.icon}</span>${kroneBadge}</span>`;
        } else {
            ikonHtml = `<span class="material-symbols-outlined">${route.icon}</span>`;
        }

        html += `
            <button class="unten-leiste__link ${aktivKlasse}" data-pfad="${route.pfad}">
                <div class="unten-leiste__indikator">
                    ${ikonHtml}
                </div>
                <span class="unten-leiste__label sr-only">${route.titel}</span>
            </button>
        `;
    }

    html += '</nav>';
    container.innerHTML = html;

    // Event-Listener
    container.querySelectorAll('[data-pfad]').forEach(btn => {
        btn.addEventListener('click', () => {
            navigieren(btn.dataset.pfad);
        });
    });
}

/**
 * Aktiven Link aktualisieren (ohne Neurendern)
 */
export function unten_leiste_aktiv_aktualisieren(pfad) {
    const container = document.getElementById('unten-leiste');
    if (!container) return;

    // Alle deaktivieren
    container.querySelectorAll('.unten-leiste__link--aktiv').forEach(el => {
        el.classList.remove('unten-leiste__link--aktiv');
    });

    // Neuen aktivieren
    const aktiver = container.querySelector(`[data-pfad="${pfad}"]`);
    if (aktiver) {
        aktiver.classList.add('unten-leiste__link--aktiv');
    }
}

// Auf Route-Aenderungen lauschen
abonnieren('aktive_route', (pfad) => {
    unten_leiste_aktiv_aktualisieren(pfad);
});
