/**
 * API-Client — Zentraler Fetch-Wrapper
 *
 * Automatisches Token-Handling, Fehlerbehandlung,
 * responsive Paginierung (Mobil vs. Desktop).
 */

import { holen, setzen } from './zustand.js';
import { API_PFAD_BASIS } from './konfiguration.js';

const API_BASIS = API_PFAD_BASIS;

/**
 * API-Anfrage senden
 *
 * @param {string} endpunkt Relativer Pfad (z.B. 'auth/anmelden.php')
 * @param {object} optionen Fetch-Optionen
 * @param {string} [optionen.methode='GET'] HTTP-Methode
 * @param {object} [optionen.body] Request-Body (wird zu JSON)
 * @param {object} [optionen.params] URL-Query-Parameter
 * @param {boolean} [optionen.auth=true] Token automatisch senden?
 * @returns {Promise<object>} API-Antwort
 */
export async function api(endpunkt, optionen = {}) {
    const {
        methode = 'GET',
        body = null,
        params = null,
        auth = true,
    } = optionen;

    // URL aufbauen
    let url = `${API_BASIS}/${endpunkt}`;

    if (params) {
        const suchParams = new URLSearchParams();
        for (const [schluessel, wert] of Object.entries(params)) {
            if (wert !== null && wert !== undefined) {
                suchParams.set(schluessel, String(wert));
            }
        }
        const paramString = suchParams.toString();
        if (paramString) {
            url += `?${paramString}`;
        }
    }

    // Headers
    const headers = {
        'Accept': 'application/json',
    };

    // Token hinzufuegen
    if (auth) {
        const token = holen('token');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
    }

    // Fetch-Optionen
    // credentials: 'include' sendet Cookies + Session-ID mit (Fallback neben Bearer-Token)
    const fetchOptionen = {
        method: methode,
        headers,
        credentials: 'include',
    };

    // Body hinzufuegen (nicht bei GET/HEAD)
    if (body !== null && methode !== 'GET' && methode !== 'HEAD') {
        headers['Content-Type'] = 'application/json; charset=utf-8';
        fetchOptionen.body = JSON.stringify(body);
    }

    try {
        const antwort = await fetch(url, fetchOptionen);
        const json = await antwort.json();

        // 401: Token ungueltig → Abmelden
        if (antwort.status === 401) {
            console.warn('API 401: Token ungueltig, melde ab...');
            abmelden_lokal();
            return { ...json, _httpStatus: 401 };
        }

        // HTTP-Status immer zurückgeben, damit Aufrufer gezielt auf 403 etc. reagieren können
        return { ...json, _httpStatus: antwort.status };
    } catch (fehler) {
        console.error(`API-Fehler [${methode} ${endpunkt}]:`, fehler);
        return {
            erfolg: false,
            _httpStatus: 0,  // 0 = Netzwerkfehler / kein Status
            fehler: {
                code: 'NETZWERK_FEHLER',
                nachricht: 'Verbindung zum Server fehlgeschlagen. Bitte pruefe deine Internetverbindung.',
            }
        };
    }
}

// ---- Komfort-Methoden ----

export function apiGet(endpunkt, params = null, auth = true) {
    return api(endpunkt, { methode: 'GET', params, auth });
}

export function apiPost(endpunkt, body = null, auth = true) {
    return api(endpunkt, { methode: 'POST', body, auth });
}

export function apiPut(endpunkt, body = null) {
    return api(endpunkt, { methode: 'PUT', body });
}

export function apiDelete(endpunkt) {
    return api(endpunkt, { methode: 'DELETE' });
}

// ---- Paginierung ----

/**
 * Paginierte Anfrage mit responsiver Seitengroesse
 */
export function apiPaginiert(endpunkt, seite = 1, weitereParams = {}) {
    const bildschirm = holen('bildschirm');
    const proSeite = bildschirm === 'mobil' ? 10 : 20;

    return apiGet(endpunkt, {
        seite,
        pro_seite: proSeite,
        ...weitereParams,
    });
}

// ---- Auth-Helfer ----

/**
 * Lokale Abmeldung (Token + Zustand loeschen)
 */
function abmelden_lokal() {
    localStorage.removeItem('vt_token');
    setzen({
        benutzer: null,
        token: null,
        statistik: null,
    });
    // Zur Anmeldeseite navigieren
    window.location.hash = '#/';
}

/**
 * Anmelden
 */
export async function anmelden(benutzername, passwort, geraet = 'Browser') {
    const ergebnis = await apiPost('auth/anmelden.php', {
        benutzername,
        passwort,
        geraet,
    }, false);

    if (ergebnis.erfolg) {
        localStorage.setItem('vt_token', ergebnis.daten.token);
        setzen({
            token: ergebnis.daten.token,
            benutzer: ergebnis.daten.benutzer,
        });
    }

    return ergebnis;
}

/**
 * Registrieren
 */
export async function registrieren(daten) {
    const ergebnis = await apiPost('auth/registrieren.php', daten, false);

    if (ergebnis.erfolg) {
        localStorage.setItem('vt_token', ergebnis.daten.token);
        setzen({
            token: ergebnis.daten.token,
            benutzer: ergebnis.daten.benutzer,
        });
    }

    return ergebnis;
}

/**
 * Abmelden
 */
export async function abmelden() {
    // Serverseitig Token deaktivieren
    await apiPost('auth/abmelden.php');
    abmelden_lokal();
}

/**
 * Token pruefen (beim App-Start)
 */
export async function token_pruefen() {
    const token = localStorage.getItem('vt_token');
    if (!token) return null;

    setzen('token', token);

    const ergebnis = await apiGet('auth/token_pruefen.php');

    if (ergebnis.erfolg) {
        setzen({
            benutzer: ergebnis.daten.benutzer,
            statistik: ergebnis.daten.statistik,
            konfiguration: ergebnis.daten.konfiguration ?? null,
        });
        return ergebnis.daten;
    }

    // Token ungueltig
    localStorage.removeItem('vt_token');
    setzen({ token: null, benutzer: null, statistik: null });
    return null;
}

/**
 * Passwort vergessen
 */
export async function passwort_vergessen(email) {
    return apiPost('auth/passwort_vergessen.php', { email }, false);
}

// ---- Magic Link ----

/**
 * Magic Link anfordern (E-Mail mit Einmal-Anmeldelink)
 * @param {string} email
 * @param {string} hp_feld Honeypot-Feld (muss leer sein)
 */
export async function magic_link_anfordern(email, hp_feld = '') {
    return apiPost('auth/magic_link_anfordern.php', { email, hp_feld }, false);
}

/**
 * Passwort aendern
 */
export async function passwort_aendern(altes_passwort, neues_passwort) {
    return apiPost('auth/passwort_aendern.php', {
        altes_passwort,
        neues_passwort,
    });
}

/**
 * Datei hochladen (Multipart)
 */
export async function datei_hochladen(endpunkt, datei, zusatzDaten = {}) {
    const token = holen('token');
    const formData = new FormData();
    formData.append('datei', datei);

    for (const [k, v] of Object.entries(zusatzDaten)) {
        formData.append(k, v);
    }

    try {
        const antwort = await fetch(`${API_BASIS}/${endpunkt}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            body: formData,
        });

        return await antwort.json();
    } catch (fehler) {
        console.error('Upload-Fehler:', fehler);
        return {
            erfolg: false,
            fehler: {
                code: 'UPLOAD_FEHLER',
                nachricht: 'Datei-Upload fehlgeschlagen.',
            }
        };
    }
}
