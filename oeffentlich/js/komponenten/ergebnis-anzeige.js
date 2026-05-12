/**
 * Ergebnis-Anzeige — Trainings-Zusammenfassung Komponente
 *
 * Zeigt Donut-Chart (Genauigkeit), XP, Streak, Sterne,
 * optional Level-Aufstieg und neue Belohnungen.
 */

import { esc, zahlFormatieren } from '../hilfs-funktionen.js';
import { t } from '../dienste/sprache.js';

/**
 * Ergebnis-Anzeige erstellen
 *
 * @param {object} zusammenfassung Daten von beenden.php Response
 * @param {object} optionen Callbacks
 * @returns {HTMLElement}
 */
export function ergebnis_anzeige_erstellen(zusammenfassung, optionen = {}) {
    const {
        onNochmal = () => {},
        onNochmalGemischt = null,
        onZurueck = () => {},
        onDashboard = () => {},
    } = optionen;

    const zf = zusammenfassung.zusammenfassung || zusammenfassung;

    const container = document.createElement('div');
    container.className = 'ergebnis-anzeige';

    // --- Titel ---
    const titel = document.createElement('h2');
    titel.className = 'ergebnis-anzeige__titel';
    titel.textContent = t('ergebnis.titel');
    container.appendChild(titel);

    // --- Donut-Chart ---
    const kreis_container = document.createElement('div');
    kreis_container.className = 'ergebnis-anzeige__kreis-container';

    const kreis = document.createElement('div');
    kreis.className = 'ergebnis-anzeige__kreis';

    const genauigkeit = zf.genauigkeit || 0;
    let kreis_farbe;
    if (genauigkeit >= 80) {
        kreis_farbe = 'var(--md-sys-color-tertiary, #4CAF50)';
    } else if (genauigkeit >= 60) {
        kreis_farbe = 'var(--md-sys-color-secondary, #FECC02)';
    } else {
        kreis_farbe = 'var(--md-sys-color-error, #BA1A1A)';
    }

    kreis.style.background = `conic-gradient(${kreis_farbe} ${genauigkeit}%, var(--md-sys-color-surface-variant, #E0E0E0) ${genauigkeit}%)`;

    const kreis_innen = document.createElement('div');
    kreis_innen.className = 'ergebnis-anzeige__kreis-innen';
    kreis_innen.innerHTML = `<span class="ergebnis-anzeige__kreis-prozent">${genauigkeit}%</span>
        <span class="ergebnis-anzeige__kreis-label">${t('ergebnis.genauigkeit')}</span>`;
    kreis.appendChild(kreis_innen);
    kreis_container.appendChild(kreis);
    container.appendChild(kreis_container);

    // --- Statistiken ---
    const stats = document.createElement('div');
    stats.className = 'ergebnis-anzeige__statistiken';

    const stat_items = [
        {
            icon: 'check_circle',
            label: t('ergebnis.richtig'),
            wert: `${zf.anzahl_richtig || 0} / ${zf.anzahl_fragen || 0}`,
        },
        {
            icon: 'school',
            label: t('ergebnis.vokabeln_gelernt'),
            wert: zahlFormatieren(zf.vokabeln_gelernt || 0),
        },
    ];

    for (const item of stat_items) {
        const stat_el = document.createElement('div');
        stat_el.className = `ergebnis-anzeige__stat ${item.klasse || ''}`;
        stat_el.innerHTML = `
            <span class="material-symbols-outlined ergebnis-anzeige__stat-icon">${item.icon}</span>
            <span class="ergebnis-anzeige__stat-label">${esc(item.label)}</span>
            <span class="ergebnis-anzeige__stat-wert">${esc(item.wert)}</span>
        `;
        stats.appendChild(stat_el);
    }

    container.appendChild(stats);

    // --- Aktionen ---
    const aktionen = document.createElement('div');
    aktionen.className = 'ergebnis-anzeige__aktionen';

    const nochmal_btn = document.createElement('button');
    nochmal_btn.className = 'btn btn--gefuellt';
    nochmal_btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px">replay</span> ${t('ergebnis.nochmal')}`;
    nochmal_btn.addEventListener('click', () => onNochmal());
    aktionen.appendChild(nochmal_btn);

    if (typeof onNochmalGemischt === 'function') {
        const gemischt_btn = document.createElement('button');
        gemischt_btn.className = 'btn btn--tonal';
        gemischt_btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px">casino</span> ${t('ergebnis.nochmal_gemischt')}`;
        gemischt_btn.addEventListener('click', () => onNochmalGemischt());
        aktionen.appendChild(gemischt_btn);
    }

    const zurueck_btn = document.createElement('button');
    zurueck_btn.className = 'btn btn--tonal ergebnis-andere-auswahl';
    zurueck_btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px">tune</span> ${t('ergebnis.andere_auswahl')}`;
    zurueck_btn.addEventListener('click', () => onZurueck());
    aktionen.appendChild(zurueck_btn);

    const dashboard_btn = document.createElement('button');
    dashboard_btn.className = 'btn btn--text';
    dashboard_btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px">dashboard</span> ${t('ergebnis.zum_dashboard')}`;
    dashboard_btn.addEventListener('click', () => onDashboard());
    aktionen.appendChild(dashboard_btn);

    container.appendChild(aktionen);

    return container;
}
