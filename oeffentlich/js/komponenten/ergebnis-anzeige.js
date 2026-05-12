/**
 * Ergebnis-Anzeige — Trainings-Zusammenfassung Komponente
 *
 * Zeigt Donut-Chart (Genauigkeit), XP, Streak, Sterne,
 * optional Level-Aufstieg und neue Belohnungen.
 */

import { esc, zahlFormatieren, levelLabel } from '../hilfs-funktionen.js';
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
    const level_aufstieg = zusammenfassung.level_aufstieg || null;
    const neue_belohnungen = zusammenfassung.neue_belohnungen || [];

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
            icon: 'star',
            label: t('ergebnis.xp_verdient'),
            wert: `+${zahlFormatieren(zf.xp_verdient || 0)}`,
            klasse: 'ergebnis-anzeige__stat--xp',
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

    // --- Level-Aufstieg ---
    if (level_aufstieg) {
        const level_el = document.createElement('div');
        level_el.className = 'ergebnis-anzeige__level-aufstieg';

        const neues_level_label = levelLabel(level_aufstieg.nach);
        level_el.innerHTML = `
            <div class="ergebnis-anzeige__level-animation">
                <span class="material-symbols-outlined ergebnis-anzeige__level-icon">upgrade</span>
                <div class="ergebnis-anzeige__level-text">
                    <div class="ergebnis-anzeige__level-titel">${t('ergebnis.level_erreicht', {level: level_aufstieg.nach, label: neues_level_label})}</div>
                    <div class="ergebnis-anzeige__level-bonus">${t('ergebnis.bonus_xp', {xp: level_aufstieg.bonus_xp})}</div>
                </div>
            </div>
        `;
        container.appendChild(level_el);
    }

    // --- Neue Belohnungen ---
    if (neue_belohnungen.length > 0) {
        const echt = neue_belohnungen.filter(b => b.typ === 'echt');
        const normal = neue_belohnungen.filter(b => b.typ !== 'echt');

        // Echte Gruppenbelohnungen zuerst + hervorgehoben
        if (echt.length > 0) {
            const echt_el = document.createElement('div');
            echt_el.className = 'ergebnis-anzeige__belohnungen ergebnis-anzeige__belohnungen--echt';

            const echt_titel = document.createElement('h3');
            echt_titel.className = 'ergebnis-anzeige__belohnungen-titel ergebnis-anzeige__belohnungen-titel--echt';
            echt_titel.innerHTML = `<span class="material-symbols-outlined">redeem</span> ${t('ergebnis.echte_belohnung')}`;
            echt_el.appendChild(echt_titel);

            for (const belohnung of echt) {
                const karte = document.createElement('div');
                karte.className = 'ergebnis-anzeige__belohnung-karte ergebnis-anzeige__belohnung-karte--echt';

                const icon = belohnung.bild_pfad
                    ? `<img src="${esc(belohnung.bild_pfad)}" alt="" class="ergebnis-anzeige__belohnung-bild">`
                    : '<span class="material-symbols-outlined ergebnis-anzeige__belohnung-icon ergebnis-anzeige__belohnung-icon--echt">redeem</span>';

                karte.innerHTML = `
                    ${icon}
                    <div class="ergebnis-anzeige__belohnung-info">
                        <div class="ergebnis-anzeige__belohnung-titel">${esc(belohnung.titel)}</div>
                        <div class="ergebnis-anzeige__belohnung-beschreibung">${esc(belohnung.beschreibung || '')}</div>
                    </div>
                `;
                echt_el.appendChild(karte);
            }
            container.appendChild(echt_el);
        }

        // Normale Belohnungen
        if (normal.length > 0) {
            const belohnungen_el = document.createElement('div');
            belohnungen_el.className = 'ergebnis-anzeige__belohnungen';

            const belohnungen_titel = document.createElement('h3');
            belohnungen_titel.className = 'ergebnis-anzeige__belohnungen-titel';
            belohnungen_titel.textContent = t('ergebnis.neue_belohnungen');
            belohnungen_el.appendChild(belohnungen_titel);

            for (const belohnung of normal) {
                const karte = document.createElement('div');
                karte.className = 'ergebnis-anzeige__belohnung-karte';

                const icon = belohnung.bild_pfad
                    ? `<img src="${esc(belohnung.bild_pfad)}" alt="" class="ergebnis-anzeige__belohnung-bild">`
                    : '<span class="material-symbols-outlined ergebnis-anzeige__belohnung-icon">military_tech</span>';

                karte.innerHTML = `
                    ${icon}
                    <div class="ergebnis-anzeige__belohnung-info">
                        <div class="ergebnis-anzeige__belohnung-titel">${esc(belohnung.titel)}</div>
                        <div class="ergebnis-anzeige__belohnung-beschreibung">${esc(belohnung.beschreibung || '')}</div>
                    </div>
                `;
                belohnungen_el.appendChild(karte);
            }
            container.appendChild(belohnungen_el);
        }
    }

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
