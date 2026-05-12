/**
 * Benachrichtigungen — Toast/Snackbar System
 *
 * Zeigt temporaere Benachrichtigungen am unteren Bildschirmrand.
 */

const STANDARD_DAUER = 4000; // 4 Sekunden
const MAX_SICHTBAR = 3;

let _container = null;

/**
 * Container initialisieren
 */
function _container_holen() {
    if (!_container) {
        _container = document.getElementById('benachrichtigungen');
    }
    return _container;
}

/**
 * Benachrichtigung anzeigen
 *
 * @param {string} text Nachrichtentext
 * @param {string} typ 'info' | 'erfolg' | 'fehler' | 'warnung'
 * @param {number} dauer Anzeigedauer in ms (0 = permanent)
 */
export function benachrichtigen(text, typ = 'info', dauer = STANDARD_DAUER) {
    const container = _container_holen();
    if (!container) return;

    // Max sichtbare begrenzen
    const vorhandene = container.querySelectorAll('.snackbar');
    if (vorhandene.length >= MAX_SICHTBAR) {
        _entfernen(vorhandene[0]);
    }

    // Snackbar erstellen
    const snackbar = document.createElement('div');
    snackbar.className = `snackbar ${typ !== 'info' ? `snackbar--${typ}` : ''}`;

    // Icon je nach Typ
    const icons = {
        info: 'info',
        erfolg: 'check_circle',
        fehler: 'error',
        warnung: 'warning',
    };

    snackbar.innerHTML = `
        <span class="material-symbols-outlined" style="font-size:20px">${icons[typ] || 'info'}</span>
        <span class="snackbar__text">${_esc(text)}</span>
        <button class="snackbar__schliessen" aria-label="Schliessen">
            <span class="material-symbols-outlined" style="font-size:18px">close</span>
        </button>
    `;

    // Schliessen-Button
    snackbar.querySelector('.snackbar__schliessen').addEventListener('click', () => {
        _entfernen(snackbar);
    });

    container.appendChild(snackbar);

    // Automatisch entfernen
    if (dauer > 0) {
        setTimeout(() => _entfernen(snackbar), dauer);
    }
}

/**
 * Snackbar mit Animation entfernen
 */
function _entfernen(snackbar) {
    if (!snackbar || !snackbar.parentNode) return;

    snackbar.classList.add('ausblenden');
    snackbar.addEventListener('animationend', () => {
        snackbar.remove();
    });
}

/**
 * HTML-Escaping
 */
function _esc(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ---- Komfort-Funktionen ----

export function erfolg(text, dauer = STANDARD_DAUER) {
    benachrichtigen(text, 'erfolg', dauer);
}

export function fehler(text, dauer = 6000) {
    benachrichtigen(text, 'fehler', dauer);
}

export function warnung(text, dauer = 5000) {
    benachrichtigen(text, 'warnung', dauer);
}

export function info(text, dauer = STANDARD_DAUER) {
    benachrichtigen(text, 'info', dauer);
}

/**
 * API-Fehler als Benachrichtigung anzeigen
 *
 * @param {object} ergebnis API-Antwort mit fehler-Objekt
 */
export function apiFehlerAnzeigen(ergebnis) {
    if (ergebnis?.fehler?.nachricht) {
        fehler(ergebnis.fehler.nachricht);
    } else {
        fehler('Ein unbekannter Fehler ist aufgetreten.');
    }
}
