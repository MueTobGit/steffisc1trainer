/**
 * Interferenz-Dialog — warnt bei zu vielen fälligen Vokabeln
 *
 * Wird einmal pro Tag beim erstmaligen Start einer Übung angezeigt,
 * wenn die Anzahl fälliger Vokabeln > Tageslimit * 5 ist.
 *
 * Optionen:
 *  A) Nur wiederholen (neue_vokabeln_faktor_override = 0)
 *  B) Trotzdem neue Wörter (kein Override)
 *  C) Heute nur Y neue (Override mit einer Stufe niedriger) — entfällt bei Entspannt
 *
 * Die Entscheidung wird fuer den gesamten Tag in sessionStorage gespeichert,
 * damit sie auch bei dauerhaft geöffneter WebView persistent bleibt.
 *
 * Gibt ein Promise zurück:
 *  - { override: null|0|50|100|200 }
 */

import { apiGet } from '../api-client.js';
import { esc } from '../hilfs-funktionen.js';
import { t } from '../dienste/sprache.js';

const SESSION_KEY_DATUM    = 'interferenz_datum';
const SESSION_KEY_OVERRIDE = 'interferenz_override';

/**
 * Liefert das heutige Datum als YYYY-MM-DD String.
 */
function _heute() {
    return new Date().toISOString().slice(0, 10);
}

/**
 * Prüft ob ein gespeicherter Override vom heutigen Tag existiert.
 * @returns {number|null} gespeicherter Override oder null
 */
function _gespeicherter_override() {
    const datum = sessionStorage.getItem(SESSION_KEY_DATUM);
    if (datum !== _heute()) return null; // anderer Tag oder noch nie gesetzt

    const wert = sessionStorage.getItem(SESSION_KEY_OVERRIDE);
    if (wert === null) return null; // Dialog wurde heute gezeigt, User wählte "trotzdem" → kein Override
    return parseInt(wert, 10);
}

/**
 * Speichert die Entscheidung für heute.
 * @param {number|null} override  null = "trotzdem neue" (kein Override), 0 = nur wiederholen, 50/100/200 = reduziert
 */
function _entscheidung_speichern(override) {
    sessionStorage.setItem(SESSION_KEY_DATUM, _heute());
    if (override !== null) {
        sessionStorage.setItem(SESSION_KEY_OVERRIDE, String(override));
    } else {
        sessionStorage.removeItem(SESSION_KEY_OVERRIDE);
    }
}

/**
 * Prüft ob der Interferenz-Dialog angezeigt werden soll.
 * Gibt ein Objekt zurück mit optionalem Override-Faktor.
 *
 * @returns {Promise<{override: number|null}>}
 *   override = null → normal starten
 *   override = 0   → keine neuen Vokabeln
 *   override = 50/100/200 → reduzierter Faktor
 */
export async function interferenz_pruefen() {
    // Bereits heute entschieden? → gespeicherten Override wiederverwenden
    const gespeichert = _gespeicherter_override();
    if (sessionStorage.getItem(SESSION_KEY_DATUM) === _heute()) {
        return { override: gespeichert }; // null = kein Override, Zahl = gespeicherter Override
    }

    try {
        const erg = await apiGet('training/interferenz_pruefen.php');
        if (!erg.erfolg) {
            _entscheidung_speichern(null); // als geprüft markieren
            return { override: null };
        }

        const d = erg.daten;

        if (!d.interferenz_warnung) {
            _entscheidung_speichern(null); // kein Problem → normal weiter
            return { override: null };
        }

        // Dialog anzeigen und Entscheidung speichern
        const ergebnis = await _dialog_anzeigen(d);
        _entscheidung_speichern(ergebnis.override);
        return ergebnis;
    } catch (e) {
        console.warn('Interferenz-Check fehlgeschlagen:', e);
        _entscheidung_speichern(null);
        return { override: null };
    }
}

/**
 * Zeigt den Interferenz-Dialog an und wartet auf die Antwort.
 */
function _dialog_anzeigen(daten) {
    return new Promise((resolve) => {
        const { faellige_anzahl, tages_limit, eine_stufe_niedriger } = daten;

        const overlay = document.createElement('div');
        overlay.className = 'interferenz-overlay';

        let optionC = '';
        if (eine_stufe_niedriger) {
            const label = _faktor_label(eine_stufe_niedriger.faktor);
            optionC = `
                <button class="interferenz__btn interferenz__btn--sekundaer" data-wahl="reduziert">
                    <span class="material-symbols-outlined">trending_down</span>
                    <div>
                        <div class="interferenz__btn-titel">${t('interferenz.heute_nur_neue', { anzahl: eine_stufe_niedriger.limit })}</div>
                        <div class="interferenz__btn-detail">${t('interferenz.modus_fuer_heute', { modus: esc(label) })}</div>
                    </div>
                </button>
            `;
        }

        overlay.innerHTML = `
            <div class="interferenz__dialog">
                <div class="interferenz__icon">
                    <span class="material-symbols-outlined">psychology_alt</span>
                </div>
                <h3 class="interferenz__titel">${t('interferenz.titel')}</h3>
                <p class="interferenz__text">
                    ${t('interferenz.text', { anzahl: faellige_anzahl })}
                </p>
                <div class="interferenz__optionen">
                    <button class="interferenz__btn interferenz__btn--primaer" data-wahl="wiederholen">
                        <span class="material-symbols-outlined">replay</span>
                        <div>
                            <div class="interferenz__btn-titel">${t('interferenz.nur_wiederholen')}</div>
                            <div class="interferenz__btn-detail">${t('interferenz.keine_neuen_heute')}</div>
                        </div>
                    </button>
                    ${optionC}
                    <button class="interferenz__btn interferenz__btn--text" data-wahl="trotzdem">
                        <span class="material-symbols-outlined">add_circle</span>
                        <div>
                            <div class="interferenz__btn-titel">${t('interferenz.trotzdem_neue')}</div>
                            <div class="interferenz__btn-detail">${t('interferenz.neue_wie_eingestellt', { anzahl: tages_limit })}</div>
                        </div>
                    </button>
                </div>
            </div>
        `;

        // Events
        overlay.querySelectorAll('[data-wahl]').forEach(btn => {
            btn.addEventListener('click', () => {
                const wahl = btn.dataset.wahl;
                overlay.remove();

                if (wahl === 'wiederholen') {
                    resolve({ override: 0 });
                } else if (wahl === 'reduziert' && eine_stufe_niedriger) {
                    resolve({ override: eine_stufe_niedriger.faktor });
                } else {
                    resolve({ override: null });
                }
            });
        });

        document.body.appendChild(overlay);
    });
}

function _faktor_label(faktor) {
    switch (faktor) {
        case 50:  return t('interferenz.modus_entspannt');
        case 100: return t('interferenz.modus_normal');
        case 200: return t('interferenz.modus_intensiv');
        case 300: return t('interferenz.modus_intensiv_plus');
        default:  return t('interferenz.modus_normal');
    }
}
