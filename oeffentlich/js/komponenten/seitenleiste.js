/**
 * Seitenleiste — Desktop-Navigation
 *
 * Gruppierte Links, Benutzer-Info, Abmelden.
 */

import { holen, abonnieren, ist_admin } from '../zustand.js';
import { seitenleiste_routen, navigieren } from '../router.js';
import { abmelden } from '../api-client.js';
import { esc } from '../hilfs-funktionen.js';
import { t } from '../dienste/sprache.js';
import { krone_svg_html } from '../dienste/krone-svg.js';

let _overlay = null;

function _krone_badge_html(beste_krone, beste_krone_typ) {
    if (!beste_krone) return '';
    return `<span class="krone-badge">${krone_svg_html(beste_krone_typ || 'standard', beste_krone)}</span>`;
}

/**
 * Seitenleiste rendern
 */
export function seitenleiste_rendern() {
    const container = document.getElementById('seitenleiste');
    if (!container) return;

    const routen = seitenleiste_routen();
    const benutzer = holen('benutzer');
    const aktiveRoute = holen('aktive_route');

    // Benutzer-Anzeigename + Avatar
    const anzeigename = benutzer?.spitzname || benutzer?.vorname || benutzer?.benutzername || 'Benutzer';
    const avatarUrl   = benutzer?.avatar_url;
    const avatarIkon  = avatarUrl
        ? `<img src="${esc(avatarUrl)}" class="seitenleiste__avatar-img" alt="Avatar">`
        : `<span class="material-symbols-outlined">account_circle</span>`;
    const kroneBadge  = _krone_badge_html(benutzer?.beste_krone, benutzer?.beste_krone_typ);

    let html = `
        <div class="seitenleiste__kopf">
            <span class="seitenleiste__logo">&#x1F1F8;&#x1F1EA;</span>
            <div>
                <div class="seitenleiste__app-name">${t('navigation.app_name')}</div>
            </div>
        </div>
    `;

    // Gruppen rendern
    const gruppenTitel = {
        lernen: t('navigation.gruppe_lernen'),
        inhalte: t('navigation.gruppe_inhalte'),
        gemeinschaft: t('navigation.gruppe_gemeinschaft'),
        persoenlich: t('navigation.gruppe_persoenlich'),
        admin: t('navigation.gruppe_admin'),
    };

    for (const [gruppe, links] of Object.entries(routen)) {
        // Admin-Gruppe nur fuer Admins
        if (gruppe === 'admin' && !ist_admin()) continue;

        // Admin-Only Links in normalen Gruppen herausfiltern (z.B. Kategorien, Lektionen)
        const sichtbareLinks = links.filter(link => !link.admin || ist_admin());
        if (sichtbareLinks.length === 0) continue;

        html += `<div class="seitenleiste__gruppe">`;
        html += `<div class="seitenleiste__gruppe-titel">${gruppenTitel[gruppe]}</div>`;

        for (const link of sichtbareLinks) {
            const istAktiv = aktiveRoute === link.pfad;
            const aktivKlasse = istAktiv ? 'seitenleiste__link--aktiv' : '';

            html += `
                <button class="seitenleiste__link ${aktivKlasse}" data-pfad="${link.pfad}">
                    <span class="material-symbols-outlined">${link.icon}</span>
                    <span>${esc(link.titel_key ? t(link.titel_key) : link.titel)}</span>
                </button>
            `;
        }

        html += `</div>`;
    }

    // Fussbereich: Benutzer + Abmelden (eigene Klassen, kein seitenleiste__link)
    html += `
        <div class="seitenleiste__fuss">
            <button class="seitenleiste__fuss-btn" data-pfad="/profil">
                <span class="krone-badge-wrapper">${avatarIkon}${kroneBadge}</span>
                <span>${esc(anzeigename)}</span>
            </button>
            <button class="seitenleiste__fuss-btn" id="btn-abmelden">
                <span class="material-symbols-outlined">logout</span>
                <span>${t('navigation.abmelden')}</span>
            </button>
        </div>
    `;

    container.innerHTML = html;

    // Event-Listener
    container.querySelectorAll('[data-pfad]').forEach(btn => {
        btn.addEventListener('click', () => {
            navigieren(btn.dataset.pfad);
            _seitenleiste_schliessen();
        });
    });

    document.getElementById('btn-abmelden')?.addEventListener('click', async () => {
        await abmelden();
    });

    // Overlay fuer Mobil erstellen
    _overlay_erstellen();
}

/**
 * Aktiven Link aktualisieren (ohne komplettes Neurendern)
 */
export function seitenleiste_aktiv_aktualisieren(pfad) {
    const container = document.getElementById('seitenleiste');
    if (!container) return;

    // Alle Links deaktivieren
    container.querySelectorAll('.seitenleiste__link--aktiv').forEach(el => {
        el.classList.remove('seitenleiste__link--aktiv');
    });

    // Neuen Link aktivieren
    const aktiver = container.querySelector(`[data-pfad="${pfad}"]`);
    if (aktiver) {
        aktiver.classList.add('seitenleiste__link--aktiv');
    }
}

/**
 * Seitenleiste oeffnen (Mobil)
 */
export function seitenleiste_oeffnen() {
    const container = document.getElementById('seitenleiste');
    if (container) {
        container.classList.add('seitenleiste--offen');
    }
    if (_overlay) {
        _overlay.classList.add('seitenleiste-overlay--sichtbar');
    }
}

/**
 * Seitenleiste schliessen (Mobil)
 */
function _seitenleiste_schliessen() {
    const container = document.getElementById('seitenleiste');
    if (container) {
        container.classList.remove('seitenleiste--offen');
    }
    if (_overlay) {
        _overlay.classList.remove('seitenleiste-overlay--sichtbar');
    }
}

function _overlay_erstellen() {
    if (_overlay) return;

    _overlay = document.createElement('div');
    _overlay.className = 'seitenleiste-overlay';
    _overlay.addEventListener('click', _seitenleiste_schliessen);

    const appContainer = document.getElementById('app-container');
    if (appContainer) {
        appContainer.appendChild(_overlay);
    }
}

// Auf Route-Aenderungen lauschen
abonnieren('aktive_route', (pfad) => {
    seitenleiste_aktiv_aktualisieren(pfad);
});
