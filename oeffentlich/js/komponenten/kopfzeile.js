/**
 * Kopfzeile — Top App Bar
 *
 * Seitentitel, Hamburger-Menu (Mobil), Streak-Anzeige, Dark-Mode-Toggle.
 */

import { holen, setzen } from '../zustand.js';
import { seitenleiste_oeffnen } from './seitenleiste.js';
import { esc } from '../hilfs-funktionen.js';
import { t } from '../dienste/sprache.js';

/**
 * Kopfzeile rendern
 */
export function kopfzeile_rendern() {
    const container = document.getElementById('kopfzeile');
    if (!container) return;

    container.innerHTML = `
        <button class="kopfzeile__menue-btn" id="btn-menue" aria-label="${t('kopfzeile.menue_oeffnen')}">
            <span class="material-symbols-outlined">menu</span>
        </button>

        <h1 class="kopfzeile__titel" id="kopfzeile-titel">${t('kopfzeile.dashboard')}</h1>

        <div class="kopfzeile__aktionen">
            <button class="kopfzeile__icon-btn" id="btn-thema-wechseln" aria-label="${t('kopfzeile.thema_umschalten')}" title="${t('kopfzeile.thema_umschalten')}">
                <span class="material-symbols-outlined" id="thema-icon">dark_mode</span>
            </button>
        </div>
    `;

    // Event-Listener
    document.getElementById('btn-menue')?.addEventListener('click', () => {
        seitenleiste_oeffnen();
    });

    document.getElementById('btn-thema-wechseln')?.addEventListener('click', () => {
        _thema_wechseln();
    });

    // Initiales Thema-Icon setzen
    _thema_icon_aktualisieren();
}

/**
 * Seitentitel aktualisieren
 */
export function kopfzeile_titel_setzen(titel) {
    const el = document.getElementById('kopfzeile-titel');
    if (el) {
        el.textContent = titel;
    }
    // Browser-Tab-Titel
    document.title = t('kopfzeile.browser_titel', {titel: titel});
}

/**
 * Dark Mode Toggle
 */
function _thema_wechseln() {
    const aktuell = holen('thema');
    let neues;

    if (aktuell === 'hell') {
        neues = 'dunkel';
    } else if (aktuell === 'dunkel') {
        neues = 'system';
    } else {
        // System oder Standard → Hell
        neues = 'hell';
    }

    setzen('thema', neues);
    _thema_anwenden(neues);
    _thema_icon_aktualisieren();

    // In localStorage speichern
    localStorage.setItem('vt_thema', neues);
}

/**
 * Thema anwenden
 */
export function thema_anwenden(thema) {
    _thema_anwenden(thema || 'system');
}

function _thema_anwenden(thema) {
    const root = document.documentElement;

    if (thema === 'hell') {
        root.setAttribute('data-thema', 'hell');
        root.classList.remove('dunkel-modus');
    } else if (thema === 'dunkel') {
        root.setAttribute('data-thema', 'dunkel');
        root.classList.add('dunkel-modus');
    } else {
        // System-Praeferenz
        root.removeAttribute('data-thema');
        root.classList.remove('dunkel-modus');
    }
}

function _thema_icon_aktualisieren() {
    const icon = document.getElementById('thema-icon');
    if (!icon) return;

    const thema = holen('thema');
    if (thema === 'hell') {
        icon.textContent = 'light_mode';
    } else if (thema === 'dunkel') {
        icon.textContent = 'dark_mode';
    } else {
        icon.textContent = 'contrast';
    }
}

/**
 * Thema beim App-Start laden
 */
export function thema_laden() {
    const gespeichert = localStorage.getItem('vt_thema') || 'system';
    setzen('thema', gespeichert);
    _thema_anwenden(gespeichert);
}

