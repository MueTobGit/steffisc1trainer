/**
 * Streak-Anzeige Komponente
 *
 * Wiederverwendbare Anzeige fuer den aktuellen Streak.
 * Flammen-Icon mit optionaler Animation.
 * Genutzt in dashboard.js und fortschritt.js (Phase 6).
 *
 * @module komponenten/streak-anzeige
 */

import { t } from '../dienste/sprache.js';

/**
 * Streak-Anzeige erstellen
 *
 * @param {number} streak Aktuelle Streak-Tage
 * @param {object} [optionen]
 * @param {boolean} [optionen.animiert=false] Flammen-Animation
 * @param {string} [optionen.groesse='mittel'] 'klein' | 'mittel' | 'gross'
 * @param {boolean} [optionen.label=true] Label "Streak-Tage" anzeigen
 * @returns {HTMLElement}
 */
export function streak_anzeige_erstellen(streak, optionen = {}) {
    const {
        animiert = false,
        groesse = 'mittel',
        label = true,
    } = optionen;

    const container = document.createElement('div');
    container.className = `streak-anzeige streak-anzeige--${groesse}`;

    // Animation nur wenn Streak > 0 und animiert gewuenscht
    if (animiert && streak > 0) {
        container.classList.add('streak-anzeige--animiert');
    }

    // Inaktiv-Stil bei Streak = 0
    if (streak === 0) {
        container.classList.add('streak-anzeige--inaktiv');
    }

    // --- Icon ---
    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined streak-anzeige__icon';
    icon.textContent = 'local_fire_department';
    container.appendChild(icon);

    // --- Wert ---
    const wert = document.createElement('span');
    wert.className = 'streak-anzeige__wert';
    wert.textContent = streak.toString();
    container.appendChild(wert);

    // --- Label (optional) ---
    if (label) {
        const labelEl = document.createElement('span');
        labelEl.className = 'streak-anzeige__label';
        labelEl.textContent = streak === 1 ? t('streak.tag') : t('streak.tage');
        container.appendChild(labelEl);
    }

    return container;
}
