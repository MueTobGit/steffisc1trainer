/**
 * Neue-Belohnung-Overlay
 *
 * Zeigt einen bildschirmfuellenden Hinweis wenn eine neue Gruppen-Belohnung
 * (typ='echt') existiert, die der Nutzer noch nicht gesehen hat.
 * Gesehene IDs werden in localStorage gespeichert.
 */

import { apiGet } from '../api-client.js';
import { esc } from '../hilfs-funktionen.js';
import { t } from '../dienste/sprache.js';

const LS_KEY = 'vt_gesehene_belohnungen';
const LS_KEY_LEITER = 'vt_belohnung_leiter_gesehen'; // { [id]: freigeschaltet_count }

/**
 * Pruefen ob neue Belohnungen vorhanden sind und ggf. Overlay zeigen.
 * Sollte nach Login / Dashboard-Load aufgerufen werden.
 */
export async function neue_belohnungen_pruefen() {
    try {
        const res = await apiGet('belohnungen/liste.php');
        if (!res.erfolg) return;

        const belohnungen = res.daten?.belohnungen || [];
        const gesehene = _gesehene_laden();

        // Mitglieder: neue (ungesehene) echt-Belohnungen
        const neue = belohnungen.filter(b =>
            b.typ === 'echt' &&
            !b.freigeschaltet &&
            !b.ist_leiter &&
            !gesehene.has(b.id)
        );

        // Leiter: Mitglieder-Fortschritt prüfen
        const leiter_meldungen = _leiter_meldungen_ermitteln(belohnungen);

        if (neue.length > 0) {
            _overlay_anzeigen(neue[0]);
            for (const b of neue) gesehene.add(b.id);
            _gesehene_speichern(gesehene);
        } else if (leiter_meldungen.length > 0) {
            _leiter_overlay_anzeigen(leiter_meldungen[0]);
        }
    } catch (e) {
        console.warn('[Neue-Belohnung] Prüfung fehlgeschlagen:', e);
    }
}

// ============================================
// Overlay rendern
// ============================================

function _overlay_anzeigen(belohnung) {
    const overlay = document.createElement('div');
    overlay.className = 'neue-belohnung-overlay';

    // Bedingungen aufbereiten
    const kriterien = belohnung.kriterien || {};
    const bedingungen = [];
    if (kriterien.min_streak > 0) {
        const key = kriterien.streak_relativ ? 'belohnung.bed_streak_relativ' : 'belohnung.bed_streak';
        bedingungen.push({ icon: 'local_fire_department', text: t(key, { tage: kriterien.min_streak }) });
    }
    if (kriterien.min_vokabeln > 0) {
        const key = kriterien.vokabeln_relativ ? 'belohnung.bed_vokabeln_relativ' : 'belohnung.bed_vokabeln';
        bedingungen.push({ icon: 'dictionary', text: t(key, { anzahl: kriterien.min_vokabeln }) });
    }
    if (kriterien.min_vokabeln_geuebt > 0) {
        bedingungen.push({ icon: 'fitness_center', text: t('belohnung.bed_geuebt', { anzahl: kriterien.min_vokabeln_geuebt }) });
    }

    // Fortschritt aufbereiten
    const fortschrittListe = belohnung.fortschritt_liste || [];

    overlay.innerHTML = `
        <div class="neue-belohnung-overlay__inhalt">
            <div class="neue-belohnung-overlay__icon-ring">
                <span class="material-symbols-outlined neue-belohnung-overlay__icon">redeem</span>
            </div>

            <h2 class="neue-belohnung-overlay__titel">${t('belohnung.neue_titel')}</h2>
            <p class="neue-belohnung-overlay__untertitel">${t('belohnung.neue_untertitel')}</p>

            <div class="neue-belohnung-overlay__belohnung-karte">
                <div class="neue-belohnung-overlay__belohnung-name">${esc(belohnung.titel)}</div>
                ${belohnung.beschreibung ? `<div class="neue-belohnung-overlay__belohnung-beschreibung">${esc(belohnung.beschreibung)}</div>` : ''}
                ${belohnung.gruppen_name ? `<div class="neue-belohnung-overlay__gruppe">
                    <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle">group</span>
                    ${esc(belohnung.gruppen_name)}
                </div>` : ''}
            </div>

            ${bedingungen.length > 0 ? `
                <div class="neue-belohnung-overlay__bedingungen">
                    <p class="neue-belohnung-overlay__bedingungen-titel">${t('belohnung.bedingungen_titel')}</p>
                    <ul class="neue-belohnung-overlay__bedingungen-liste">
                        ${bedingungen.map(b => `
                            <li class="neue-belohnung-overlay__bedingung">
                                <span class="material-symbols-outlined">${b.icon}</span>
                                <span>${esc(b.text)}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            ` : ''}

            ${fortschrittListe.length > 0 ? `
                <div class="neue-belohnung-overlay__fortschritt">
                    ${fortschrittListe.map(f => `
                        <div class="neue-belohnung-overlay__fortschritt-zeile">
                            <span class="neue-belohnung-overlay__fortschritt-label">${esc(f.label)}</span>
                            <div class="neue-belohnung-overlay__fortschritt-balken">
                                <div class="neue-belohnung-overlay__fortschritt-fuellung" style="width:${f.prozent}%"></div>
                            </div>
                            <span class="neue-belohnung-overlay__fortschritt-wert">${f.aktuell}/${f.ziel}</span>
                        </div>
                    `).join('')}
                </div>
            ` : ''}

            <button class="btn btn--gefuellt neue-belohnung-overlay__btn" id="btn-neue-belohnung-ok">
                ${t('belohnung.los_gehts')}
            </button>
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    // Animation einkicken
    requestAnimationFrame(() => overlay.classList.add('neue-belohnung-overlay--sichtbar'));

    // Schliessen
    const schliessen = () => {
        overlay.classList.remove('neue-belohnung-overlay--sichtbar');
        overlay.addEventListener('transitionend', () => {
            overlay.remove();
            document.body.style.overflow = '';
        }, { once: true });
        // Fallback falls kein transitionend feuert
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.remove();
                document.body.style.overflow = '';
            }
        }, 400);
    };

    overlay.querySelector('#btn-neue-belohnung-ok').addEventListener('click', schliessen);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) schliessen();
    });
}

function _leiter_overlay_anzeigen(meldung) {
    const { belohnung, aktuell, gesamt, alle_erreicht } = meldung;

    const alleText = alle_erreicht
        ? t('belohnung.leiter_fortschritt_alle', { gesamt, titel: belohnung.titel })
        : t('belohnung.leiter_fortschritt', { aktuell, gesamt, titel: belohnung.titel });

    const overlay = document.createElement('div');
    overlay.className = 'neue-belohnung-overlay';

    overlay.innerHTML = `
        <div class="neue-belohnung-overlay__inhalt">
            <div class="neue-belohnung-overlay__icon-ring">
                <span class="material-symbols-outlined neue-belohnung-overlay__icon">${alle_erreicht ? 'card_giftcard' : 'group'}</span>
            </div>

            <h2 class="neue-belohnung-overlay__titel">${alle_erreicht ? t('belohnung.leiter_titel_alle') : t('belohnung.leiter_titel')}</h2>

            <div class="neue-belohnung-overlay__belohnung-karte">
                <div class="neue-belohnung-overlay__belohnung-name">${esc(belohnung.titel)}</div>
                ${belohnung.beschreibung ? `<div class="neue-belohnung-overlay__belohnung-beschreibung">${esc(belohnung.beschreibung)}</div>` : ''}
                ${belohnung.gruppen_name ? `<div class="neue-belohnung-overlay__gruppe">
                    <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle">group</span>
                    ${esc(belohnung.gruppen_name)}
                </div>` : ''}
            </div>

            <p class="neue-belohnung-overlay__untertitel" style="margin-top:0">${esc(alleText)}</p>

            <button class="btn btn--gefuellt neue-belohnung-overlay__btn" id="btn-leiter-belohnung-ok">
                ${t('belohnung.leiter_btn')}
            </button>
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => overlay.classList.add('neue-belohnung-overlay--sichtbar'));

    const schliessen = () => {
        overlay.classList.remove('neue-belohnung-overlay--sichtbar');
        overlay.addEventListener('transitionend', () => {
            overlay.remove();
            document.body.style.overflow = '';
        }, { once: true });
        setTimeout(() => {
            if (overlay.parentNode) { overlay.remove(); document.body.style.overflow = ''; }
        }, 400);
    };

    overlay.querySelector('#btn-leiter-belohnung-ok').addEventListener('click', schliessen);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) schliessen(); });
}

// ============================================
// localStorage-Helfer
// ============================================

function _gesehene_laden() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return new Set();
        return new Set(JSON.parse(raw));
    } catch {
        return new Set();
    }
}

function _gesehene_speichern(set) {
    localStorage.setItem(LS_KEY, JSON.stringify([...set]));
}

function _leiter_gesehen_laden() {
    try {
        return JSON.parse(localStorage.getItem(LS_KEY_LEITER) || '{}');
    } catch {
        return {};
    }
}

function _leiter_gesehen_speichern(obj) {
    localStorage.setItem(LS_KEY_LEITER, JSON.stringify(obj));
}

/**
 * Ermittelt Leiter-Meldungen: echt-Belohnungen bei denen seit dem letzten
 * Dashboard-Load neue Mitglieder freigeschaltet haben.
 */
function _leiter_meldungen_ermitteln(belohnungen) {
    const gesehen = _leiter_gesehen_laden();
    const meldungen = [];
    let geaendert = false;

    for (const b of belohnungen) {
        if (b.typ !== 'echt' || !b.ist_leiter) continue;

        const aktuell = b.freigeschaltet_mitglieder ?? 0;
        const prev = gesehen[b.id];

        if (prev === undefined) {
            // Erstmalig gesehen – speichern ohne Benachrichtigung
            gesehen[b.id] = aktuell;
            geaendert = true;
        } else if (aktuell > prev) {
            meldungen.push({
                belohnung: b,
                aktuell,
                gesamt: b.gesamt_mitglieder ?? 0,
                alle_erreicht: b.alle_erreicht ?? false,
            });
            gesehen[b.id] = aktuell;
            geaendert = true;
        }
    }

    if (geaendert) _leiter_gesehen_speichern(gesehen);
    return meldungen;
}

// ============================================
// CSS einfuegen
// ============================================

export function stil_einfuegen() {
    if (document.getElementById('neue-belohnung-stil')) return;

    const stil = document.createElement('style');
    stil.id = 'neue-belohnung-stil';
    stil.textContent = `
        .neue-belohnung-overlay {
            position: fixed;
            inset: 0;
            z-index: 9999;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        .neue-belohnung-overlay--sichtbar {
            opacity: 1;
        }

        .neue-belohnung-overlay__inhalt {
            background: var(--md-sys-color-surface);
            border-radius: 24px;
            padding: 32px 24px;
            max-width: 400px;
            width: 100%;
            text-align: center;
            max-height: 90vh;
            overflow-y: auto;
            transform: scale(0.9) translateY(20px);
            transition: transform 0.3s ease;
        }

        .neue-belohnung-overlay--sichtbar .neue-belohnung-overlay__inhalt {
            transform: scale(1) translateY(0);
        }

        .neue-belohnung-overlay__icon-ring {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            background: linear-gradient(135deg, var(--md-sys-color-primary-container), var(--md-sys-color-tertiary-container));
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 20px;
        }

        .neue-belohnung-overlay__icon {
            font-size: 40px;
            color: var(--md-sys-color-primary);
        }

        .neue-belohnung-overlay__titel {
            font-size: var(--md-sys-typescale-headline-small-size, 24px);
            font-weight: 600;
            color: var(--md-sys-color-on-surface);
            margin: 0 0 4px;
        }

        .neue-belohnung-overlay__untertitel {
            font-size: var(--md-sys-typescale-body-medium-size, 14px);
            color: var(--md-sys-color-on-surface-variant);
            margin: 0 0 20px;
        }

        .neue-belohnung-overlay__belohnung-karte {
            background: var(--md-sys-color-surface-container);
            border-radius: 16px;
            padding: 16px;
            margin-bottom: 20px;
        }

        .neue-belohnung-overlay__belohnung-name {
            font-size: var(--md-sys-typescale-title-medium-size, 16px);
            font-weight: 600;
            color: var(--md-sys-color-on-surface);
            margin-bottom: 4px;
        }

        .neue-belohnung-overlay__belohnung-beschreibung {
            font-size: var(--md-sys-typescale-body-small-size, 12px);
            color: var(--md-sys-color-on-surface-variant);
            margin-bottom: 8px;
        }

        .neue-belohnung-overlay__gruppe {
            font-size: var(--md-sys-typescale-label-medium-size, 12px);
            color: var(--md-sys-color-primary);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
        }

        .neue-belohnung-overlay__bedingungen {
            text-align: left;
            margin-bottom: 16px;
        }

        .neue-belohnung-overlay__bedingungen-titel {
            font-size: var(--md-sys-typescale-body-medium-size, 14px);
            font-weight: 500;
            color: var(--md-sys-color-on-surface);
            margin: 0 0 10px;
            text-align: center;
        }

        .neue-belohnung-overlay__bedingungen-liste {
            list-style: none;
            padding: 0;
            margin: 0;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .neue-belohnung-overlay__bedingung {
            display: flex;
            align-items: center;
            gap: 10px;
            background: var(--md-sys-color-surface-container);
            border-radius: 12px;
            padding: 12px 14px;
            font-size: var(--md-sys-typescale-body-medium-size, 14px);
            color: var(--md-sys-color-on-surface);
        }

        .neue-belohnung-overlay__bedingung .material-symbols-outlined {
            font-size: 22px;
            color: var(--md-sys-color-primary);
            flex-shrink: 0;
        }

        .neue-belohnung-overlay__fortschritt {
            margin-bottom: 20px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .neue-belohnung-overlay__fortschritt-zeile {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
        }

        .neue-belohnung-overlay__fortschritt-label {
            width: 70px;
            text-align: right;
            color: var(--md-sys-color-on-surface-variant);
            flex-shrink: 0;
        }

        .neue-belohnung-overlay__fortschritt-balken {
            flex: 1;
            height: 6px;
            background: var(--md-sys-color-surface-container-high);
            border-radius: 3px;
            overflow: hidden;
        }

        .neue-belohnung-overlay__fortschritt-fuellung {
            height: 100%;
            background: var(--md-sys-color-primary);
            border-radius: 3px;
            transition: width 0.5s ease;
        }

        .neue-belohnung-overlay__fortschritt-wert {
            width: 50px;
            text-align: left;
            color: var(--md-sys-color-on-surface-variant);
            flex-shrink: 0;
        }

        .neue-belohnung-overlay__btn {
            width: 100%;
            padding: 14px;
            font-size: var(--md-sys-typescale-label-large-size, 14px);
            border-radius: 12px;
        }
    `;
    document.head.appendChild(stil);
}
