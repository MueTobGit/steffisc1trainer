/**
 * XP-Leiste Komponente
 *
 * Fortschrittsbalken zum naechsten Stern (Bronze/Silber/Gold).
 * Zeigt aktuelle XP, Schwelle, Prozent und fehlende XP.
 * Genutzt in dashboard.js, statistik.js und fortschritt.js (Phase 6).
 *
 * @module komponenten/xp-leiste
 */

import { zahlFormatieren } from '../hilfs-funktionen.js';
import { t } from '../dienste/sprache.js';
import { holen } from '../zustand.js';

// Stern-Schwellen: Fallback-Werte falls Konfiguration noch nicht geladen
const STERN_SCHWELLEN_STANDARD = {
    bronze: 500,
    silber: 2500,
    gold: 12500,
};

/**
 * Aktuelle Stern-Schwellen aus App-Zustand lesen (oder Fallback).
 * @returns {{ bronze: number, silber: number, gold: number }}
 */
function _schwellen_holen() {
    const konfig = holen('konfiguration');
    if (konfig?.xp_bronze && konfig?.xp_silber && konfig?.xp_gold) {
        return { bronze: konfig.xp_bronze, silber: konfig.xp_silber, gold: konfig.xp_gold };
    }
    return STERN_SCHWELLEN_STANDARD;
}

function STERN_LABELS() {
    return {
        bronze: t('xp.stern_bronze'),
        silber: t('xp.stern_silber'),
        gold: t('xp.stern_gold'),
    };
}

const STERN_FARBEN = {
    bronze: 'var(--vt-farbe-bronze, #CD7F32)',
    silber: 'var(--vt-farbe-silber, #C0C0C0)',
    gold: 'var(--vt-farbe-gold, #FFD700)',
};

/**
 * XP-Leiste erstellen
 *
 * @param {number} xp Aktuelle Gesamt-XP
 * @param {object} [optionen]
 * @param {string} [optionen.stern='bronze'] 'bronze' | 'silber' | 'gold'
 * @param {boolean} [optionen.kompakt=false] Kompakte Variante ohne Labels
 * @param {number|null} [optionen.naechste_schwelle=null] Vom Server vorberechneter XP-Wert fuer den naechsten Stern (ueberschreibt lokale Berechnung)
 * @returns {HTMLElement}
 */
export function xp_leiste_erstellen(xp, optionen = {}) {
    const {
        stern = 'bronze',
        kompakt = false,
        naechste_schwelle: naechste_schwelle_server = null,
    } = optionen;

    const schwellen = _schwellen_holen();
    const schwelle = schwellen[stern] || schwellen.bronze;
    const labels = STERN_LABELS();
    const label = labels[stern] || labels.bronze;
    const farbe = STERN_FARBEN[stern] || STERN_FARBEN.bronze;

    // Berechnung — Server-Wert hat Vorrang vor lokaler Berechnung
    const aktuelle_sterne = Math.floor(xp / schwelle);
    const naechste_schwelle = naechste_schwelle_server ?? (aktuelle_sterne + 1) * schwelle;
    const fortschritt_xp = xp - (aktuelle_sterne * schwelle);
    const prozent = Math.min(100, Math.round((fortschritt_xp / schwelle) * 100));
    const fehlend = naechste_schwelle - xp;

    // --- Container ---
    const container = document.createElement('div');
    container.className = 'xp-leiste';
    if (kompakt) {
        container.classList.add('xp-leiste--kompakt');
    }

    // --- Kopf (Label + Werte) ---
    if (!kompakt) {
        const kopf = document.createElement('div');
        kopf.className = 'xp-leiste__kopf';

        const labelEl = document.createElement('span');
        labelEl.className = 'xp-leiste__label';
        labelEl.textContent = t('xp.naechster_stern', { stern: label });
        kopf.appendChild(labelEl);

        const werte = document.createElement('span');
        werte.className = 'xp-leiste__werte';
        werte.textContent = `${zahlFormatieren(fortschritt_xp)} / ${zahlFormatieren(schwelle)} XP`;
        kopf.appendChild(werte);

        container.appendChild(kopf);
    }

    // --- Balken ---
    const balken = document.createElement('div');
    balken.className = 'xp-leiste__balken';

    const fuellung = document.createElement('div');
    fuellung.className = 'xp-leiste__fuellung';
    fuellung.style.width = `${prozent}%`;
    fuellung.style.background = farbe;
    balken.appendChild(fuellung);

    container.appendChild(balken);

    // --- Fuss (Prozent + Fehlend) ---
    if (!kompakt) {
        const fuss = document.createElement('div');
        fuss.className = 'xp-leiste__fuss';

        const prozentEl = document.createElement('span');
        prozentEl.className = 'xp-leiste__prozent';
        prozentEl.textContent = `${prozent}%`;
        fuss.appendChild(prozentEl);

        const fehlendEl = document.createElement('span');
        fehlendEl.className = 'xp-leiste__fehlend';
        fehlendEl.textContent = t('xp.noch_xp', { xp: zahlFormatieren(fehlend) });
        fuss.appendChild(fehlendEl);

        container.appendChild(fuss);
    }

    return container;
}
