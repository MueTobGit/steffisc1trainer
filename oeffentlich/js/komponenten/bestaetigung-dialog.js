/**
 * Bestaetigungs-Dialog — Modal-Overlay
 *
 * Promise-basiert. Escape=Abbrechen, Enter=Bestaetigen.
 */

import { esc } from '../hilfs-funktionen.js';
import { t } from '../dienste/sprache.js';

/**
 * Bestaetigungs-Dialog anzeigen
 *
 * @param {string} titel Dialog-Titel
 * @param {string} nachricht Dialog-Nachricht
 * @param {string} [bestaetigenText='Bestaetigen'] Text des Bestaetigen-Buttons
 * @param {string} [abbrechenText='Abbrechen'] Text des Abbrechen-Buttons
 * @param {boolean} [gefaehrlich=false] Roter Bestaetigen-Button?
 * @returns {Promise<boolean>} true=bestaetigt, false=abgebrochen
 */
export function bestaetigung_anzeigen(titel, nachricht, bestaetigenText = null, abbrechenText = null, gefaehrlich = false) {
    if (bestaetigenText === null) bestaetigenText = t('allgemein.bestaetigen');
    if (abbrechenText === null) abbrechenText = t('allgemein.abbrechen');
    return new Promise((resolve) => {
        // Overlay erstellen
        const overlay = document.createElement('div');
        overlay.className = 'bestaetigung-dialog__overlay';

        const btnKlasse = gefaehrlich ? 'btn--gefuellt bestaetigung-dialog__btn--gefaehrlich' : 'btn--gefuellt';

        overlay.innerHTML = `
            <div class="bestaetigung-dialog__box">
                <h3 class="bestaetigung-dialog__titel">${esc(titel)}</h3>
                <p class="bestaetigung-dialog__nachricht">${esc(nachricht)}</p>
                <div class="bestaetigung-dialog__aktionen">
                    <button class="btn btn--text bestaetigung-dialog__abbrechen">${esc(abbrechenText)}</button>
                    <button class="btn ${btnKlasse} bestaetigung-dialog__bestaetigen">${esc(bestaetigenText)}</button>
                </div>
            </div>
        `;

        // Schliessen-Funktion
        function _schliessen(ergebnis) {
            overlay.classList.add('bestaetigung-dialog__overlay--ausblenden');
            document.removeEventListener('keydown', _tastatur);
            setTimeout(() => {
                overlay.remove();
                resolve(ergebnis);
            }, 200);
        }

        // Tastatur-Handler
        function _tastatur(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                _schliessen(false);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                _schliessen(true);
            }
        }

        // Event-Listener
        overlay.querySelector('.bestaetigung-dialog__abbrechen').addEventListener('click', () => {
            _schliessen(false);
        });

        overlay.querySelector('.bestaetigung-dialog__bestaetigen').addEventListener('click', () => {
            _schliessen(true);
        });

        // Klick auf Overlay = Abbrechen
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                _schliessen(false);
            }
        });

        document.addEventListener('keydown', _tastatur);

        // Anzeigen
        document.body.appendChild(overlay);

        // Fokus auf Bestaetigen-Button
        overlay.querySelector('.bestaetigung-dialog__bestaetigen').focus();
    });
}
