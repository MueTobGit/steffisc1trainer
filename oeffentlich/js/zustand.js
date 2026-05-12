/**
 * Zustand — Reaktiver State-Store
 *
 * Einfacher, reaktiver Store mit Abonnement-System.
 * Alle globalen App-Daten werden hier zentral verwaltet.
 */

// Initialer Zustand
const _initialerZustand = {
    // Auth
    benutzer: null,
    token: null,
    statistik: null,

    // Navigation
    aktive_route: '',
    vorherige_route: '',

    // UI
    bildschirm: 'desktop', // 'desktop' | 'mobil'
    seitenleiste_offen: false,
    thema: 'system', // 'hell' | 'dunkel' | 'system'
    sprache: 'de', // 'de' | 'sv'
    lade_status: true,

    // Training (aktive Sitzung)
    training_sitzung: null,
};

// Interner Zustand
let _zustand = { ..._initialerZustand };

// Abonnenten: Map<schluessel, Set<callback>>
const _abonnenten = new Map();

// Alle-Abonnenten (werden bei jeder Aenderung benachrichtigt)
const _globale_abonnenten = new Set();

/**
 * Aktuellen Zustand oder einzelnen Wert holen
 *
 * @param {string} [schluessel] Optionaler Schluessel
 * @returns {*} Zustandswert
 */
export function holen(schluessel) {
    if (schluessel === undefined) {
        return { ..._zustand };
    }
    return _zustand[schluessel];
}

/**
 * Zustand aktualisieren
 *
 * @param {string|object} schluesselOderObjekt Schluessel oder Objekt mit Updates
 * @param {*} [wert] Wert (nur bei String-Schluessel)
 */
export function setzen(schluesselOderObjekt, wert) {
    let aenderungen = {};

    if (typeof schluesselOderObjekt === 'string') {
        aenderungen[schluesselOderObjekt] = wert;
    } else if (typeof schluesselOderObjekt === 'object') {
        aenderungen = schluesselOderObjekt;
    }

    const geaenderte_schluessel = [];

    for (const [k, v] of Object.entries(aenderungen)) {
        if (_zustand[k] !== v) {
            _zustand[k] = v;
            geaenderte_schluessel.push(k);
        }
    }

    // Abonnenten benachrichtigen
    if (geaenderte_schluessel.length > 0) {
        for (const schluessel of geaenderte_schluessel) {
            const callbacks = _abonnenten.get(schluessel);
            if (callbacks) {
                for (const cb of callbacks) {
                    try {
                        cb(_zustand[schluessel], schluessel);
                    } catch (fehler) {
                        console.error(`Zustand-Abonnent Fehler [${schluessel}]:`, fehler);
                    }
                }
            }
        }

        // Globale Abonnenten
        for (const cb of _globale_abonnenten) {
            try {
                cb({ ..._zustand }, geaenderte_schluessel);
            } catch (fehler) {
                console.error('Globaler Zustand-Abonnent Fehler:', fehler);
            }
        }
    }
}

/**
 * Auf Zustandsaenderungen abonnieren
 *
 * @param {string|string[]|null} schluessel Schluessel oder Array von Schluesseln (null = global)
 * @param {Function} callback Callback(neuerWert, schluessel)
 * @returns {Function} Abbestellen-Funktion
 */
export function abonnieren(schluessel, callback) {
    if (schluessel === null) {
        // Globaler Abonnent
        _globale_abonnenten.add(callback);
        return () => _globale_abonnenten.delete(callback);
    }

    const schluessel_liste = Array.isArray(schluessel) ? schluessel : [schluessel];

    for (const s of schluessel_liste) {
        if (!_abonnenten.has(s)) {
            _abonnenten.set(s, new Set());
        }
        _abonnenten.get(s).add(callback);
    }

    // Abbestellen-Funktion
    return () => {
        for (const s of schluessel_liste) {
            const callbacks = _abonnenten.get(s);
            if (callbacks) {
                callbacks.delete(callback);
                if (callbacks.size === 0) {
                    _abonnenten.delete(s);
                }
            }
        }
    };
}

/**
 * Zustand vollstaendig zuruecksetzen (z.B. bei Logout)
 */
export function zuruecksetzen() {
    _zustand = { ..._initialerZustand };

    // Alle Abonnenten ueber Reset benachrichtigen
    for (const cb of _globale_abonnenten) {
        try {
            cb({ ..._zustand }, Object.keys(_initialerZustand));
        } catch (fehler) {
            console.error('Zustand-Reset Fehler:', fehler);
        }
    }
}

/**
 * Auth-Daten setzen (Komfortfunktion)
 */
export function auth_setzen(benutzer, token, statistik = null) {
    setzen({
        benutzer,
        token,
        statistik,
    });
}

/**
 * Pruefen ob Benutzer eingeloggt ist
 */
export function ist_eingeloggt() {
    return _zustand.token !== null && _zustand.benutzer !== null;
}

/**
 * Pruefen ob Benutzer Admin ist
 */
export function ist_admin() {
    return _zustand.benutzer?.rolle === 'admin';
}

/**
 * Bildschirmgroesse erkennen und setzen
 */
export function bildschirm_erkennen() {
    const breite = window.innerWidth;
    const neu = breite <= 768 ? 'mobil' : 'desktop';
    if (_zustand.bildschirm !== neu) {
        setzen('bildschirm', neu);
    }
    return neu;
}

// Debug-Hilfe (nur in Entwicklung)
if (typeof window !== 'undefined') {
    window.__vt_zustand = {
        holen,
        setzen,
        abonnieren,
    };
}
