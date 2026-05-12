/**
 * Anmeldung — Magic Link
 *
 * Login-System:
 * - Kein Passwort, nur E-Mail-Adresse
 * - Magic Link (E-Mail mit Einmal-Link) für Erst-Registrierung + Login
 * - Honeypot gegen Bots
 * - Admin-Fallback: klassischer Benutzername/Passwort-Login
 *
 * Ansichten:
 *   'eingabe'   — E-Mail-Eingabe (default)
 *   'gesendet'  — Bestätigung nach E-Mail-Versand
 *   'passwort'  — Passwort-Login (Admin-Fallback)
 */

import { magic_link_anfordern, anmelden } from '../api-client.js';
import { setzen } from '../zustand.js';
import { esc } from '../hilfs-funktionen.js';
import { t } from '../dienste/sprache.js';

let _ansicht       = 'eingabe';
let _letzte_email  = '';

// ---- Export: Modul rendern ----

export function rendern() {
    const container = document.getElementById('anmeldung-ansicht');
    if (!container) return;

    _ansicht = 'eingabe';

    // In App oeffnen-Banner: nur auf Android-Browser, nicht in der App selbst
    const zeige_app_banner = !window.Android
        && /Android/i.test(navigator.userAgent);

    container.innerHTML = `
        <div class="anmeldung-container" id="anmeldung-container">

            ${zeige_app_banner ? `
            <div class="anmeldung__app-banner">
                <span class="material-symbols-outlined">phone_android</span>
                <span>${t('anmeldung.app_hinweis')}</span>
                <a href="vokabeltrainer://open" class="anmeldung__app-banner-btn">${t('anmeldung.app_oeffnen')}</a>
            </div>
            ` : ''}

            <div class="anmeldung__kopf">
                <div class="anmeldung__flagge">&#x1F1F8;&#x1F1EA;</div>
                <h1 class="anmeldung__titel">${t('anmeldung.app_name')}</h1>
                <p class="anmeldung__untertitel">${t('anmeldung.untertitel')}</p>
            </div>

            <div id="anmeldung-inhalt">
                <!-- Wird dynamisch befuellt -->
            </div>

            <div class="anmeldung__fuss">
                <a href="#/impressum">${t('anmeldung.impressum_link')}</a>
            </div>
        </div>
    `;

    _ansicht_rendern();
}

export function aufraeumen() {
    _ansicht = 'eingabe';
    _letzte_email = '';
}

// ---- Ansichten ----

function _ansicht_rendern() {
    const inhalt = document.getElementById('anmeldung-inhalt');
    if (!inhalt) return;

    if (_ansicht === 'eingabe') {
        _eingabe_rendern(inhalt);
    } else if (_ansicht === 'gesendet') {
        _gesendet_rendern(inhalt);
    } else if (_ansicht === 'passwort') {
        _passwort_rendern(inhalt);
    }
}

// ---- Ansicht 1: E-Mail-Eingabe ----

function _eingabe_rendern(container) {
    container.innerHTML = `
        <form class="anmeldung__formular" id="magic-link-form" novalidate>
            <div class="formular-gruppe">
                <label class="formular-label" for="anmeldung-email">${t('anmeldung.email_label')}</label>
                <input
                    class="eingabe anmeldung__email-feld"
                    type="email"
                    id="anmeldung-email"
                    name="email"
                    autocomplete="email"
                    inputmode="email"
                    placeholder="${t('anmeldung.email_placeholder')}"
                    required
                >
                <!-- Honeypot: unsichtbar fuer echte Nutzer, Bots fuellen es aus -->
                <input
                    type="text"
                    name="hp_feld"
                    id="hp-feld"
                    tabindex="-1"
                    aria-hidden="true"
                    autocomplete="off"
                    class="anmeldung__honeypot"
                    value=""
                >
            </div>

            <div class="anmeldung__fehler versteckt" id="anmeldung-fehler">
                <span class="material-symbols-outlined" style="font-size:18px;flex-shrink:0">error</span>
                <span id="anmeldung-fehler-text"></span>
            </div>

            <button type="submit" class="btn btn--gefuellt anmeldung__submit" id="btn-magic-link">
                <span class="material-symbols-outlined">mail</span>
                <span class="btn-text">${t('anmeldung.email_senden')}</span>
                <span class="btn-lader"></span>
            </button>
        </form>

        <div class="anmeldung__passwort-link">
            <button type="button" id="btn-zu-passwort">${t('anmeldung.mit_passwort')}</button>
        </div>
    `;

    const emailInput = document.getElementById('anmeldung-email');
    emailInput?.focus();

    document.getElementById('magic-link-form')?.addEventListener('submit', _magic_link_absenden);
    document.getElementById('btn-zu-passwort')?.addEventListener('click', () => {
        _ansicht = 'passwort';
        _ansicht_rendern();
    });
}

async function _magic_link_absenden(e) {
    e.preventDefault();
    _fehler_verstecken();

    const email   = document.getElementById('anmeldung-email')?.value?.trim() ?? '';
    const hp_feld = document.getElementById('hp-feld')?.value ?? '';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        _fehler_anzeigen(t('anmeldung.email_ungueltig'));
        return;
    }

    const btn = document.getElementById('btn-magic-link');
    _laden_starten(btn);

    const ergebnis = await magic_link_anfordern(email, hp_feld);

    _laden_stoppen(btn);

    // Immer Erfolgs-Ansicht zeigen (auch bei Fehler — Sicherheit)
    _letzte_email = email;
    _ansicht = 'gesendet';
    _ansicht_rendern();
}

// ---- Ansicht 2: E-Mail gesendet ----

function _gesendet_rendern(container) {
    const escaped = esc(_letzte_email);
    container.innerHTML = `
        <div class="anmeldung__bestaetigung">
            <div class="anmeldung__bestaetigung-icon">
                <span class="material-symbols-outlined">mark_email_read</span>
            </div>

            <h2 class="anmeldung__bestaetigung-titel">${t('anmeldung.email_gesendet_titel')}</h2>

            <p class="anmeldung__bestaetigung-text">
                ${t('anmeldung.email_gesendet_text', {email: escaped})}
            </p>

            <p class="anmeldung__bestaetigung-hinweis">
                ${t('anmeldung.email_gesendet_hinweis')}
            </p>

            <div class="anmeldung__bestaetigung-tipps">
                <p>&#x26A0;&#xFE0F; ${t('anmeldung.email_spam')}</p>
            </div>

            <button type="button" class="btn btn--umrandet anmeldung__submit" id="btn-andere-email">
                <span class="material-symbols-outlined">arrow_back</span>
                <span>${t('anmeldung.email_andere')}</span>
            </button>
        </div>
    `;

    document.getElementById('btn-andere-email')?.addEventListener('click', () => {
        _ansicht = 'eingabe';
        _letzte_email = '';
        _ansicht_rendern();
    });
}

// ---- Ansicht 3: Passwort-Login (Admin-Fallback) ----

function _passwort_rendern(container) {
    container.innerHTML = `
        <form class="anmeldung__formular" id="passwort-form" novalidate>
            <div class="anmeldung__passwort-kopf">
                <button type="button" class="btn btn--text btn--klein" id="btn-zurueck-von-passwort">
                    <span class="material-symbols-outlined">arrow_back</span>
                    ${t('anmeldung.zurueck')}
                </button>
                <p style="font-size:13px;color:var(--md-sys-color-on-surface-variant);margin:8px 0 16px">
                    ${t('anmeldung.klassisch_text')}
                </p>
            </div>

            <div class="formular-gruppe">
                <label class="formular-label" for="pw-benutzername">${t('anmeldung.benutzername')}</label>
                <input
                    class="eingabe"
                    type="text"
                    id="pw-benutzername"
                    name="benutzername"
                    autocomplete="username"
                    placeholder="admin"
                    required
                >
            </div>

            <div class="formular-gruppe" style="margin-top:12px">
                <label class="formular-label" for="pw-passwort">${t('anmeldung.passwort')}</label>
                <input
                    class="eingabe"
                    type="password"
                    id="pw-passwort"
                    name="passwort"
                    autocomplete="current-password"
                    placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                    required
                >
            </div>

            <div class="anmeldung__fehler versteckt" id="pw-fehler" style="margin-top:12px">
                <span class="material-symbols-outlined" style="font-size:18px;flex-shrink:0">error</span>
                <span id="pw-fehler-text"></span>
            </div>

            <button type="submit" class="btn btn--gefuellt anmeldung__submit" id="btn-passwort-login" style="margin-top:16px">
                <span class="material-symbols-outlined">lock_open</span>
                <span class="btn-text">${t('anmeldung.anmelden')}</span>
                <span class="btn-lader"></span>
            </button>
        </form>
    `;

    document.getElementById('pw-benutzername')?.focus();

    document.getElementById('btn-zurueck-von-passwort')?.addEventListener('click', () => {
        _ansicht = 'eingabe';
        _ansicht_rendern();
    });

    document.getElementById('passwort-form')?.addEventListener('submit', _passwort_absenden);
}

async function _passwort_absenden(e) {
    e.preventDefault();

    const benutzername = document.getElementById('pw-benutzername')?.value?.trim() ?? '';
    const passwort     = document.getElementById('pw-passwort')?.value ?? '';
    const fehler_el    = document.getElementById('pw-fehler');
    const fehler_text  = document.getElementById('pw-fehler-text');
    const btn          = document.getElementById('btn-passwort-login');

    // Fehlermeldung ausblenden
    fehler_el?.classList.add('versteckt');

    if (!benutzername || !passwort) {
        if (fehler_text) fehler_text.textContent = t('anmeldung.eingabe_fehlt');
        fehler_el?.classList.remove('versteckt');
        return;
    }

    _laden_starten(btn);

    const ergebnis = await anmelden(benutzername, passwort, 'Admin-Login');

    _laden_stoppen(btn);

    if (ergebnis.erfolg) {
        // Token speichern und App-Zustand aktualisieren
        localStorage.setItem('vt_token', ergebnis.daten.token);
        setzen('benutzer', ergebnis.daten.benutzer);
    } else {
        const msg = ergebnis.fehler?.nachricht || t('anmeldung.falsch');
        if (fehler_text) fehler_text.textContent = msg;
        fehler_el?.classList.remove('versteckt');
        // Passwortfeld leeren
        const pwInput = document.getElementById('pw-passwort');
        if (pwInput) { pwInput.value = ''; pwInput.focus(); }
    }
}

// ---- Helfer ----

function _fehler_anzeigen(text) {
    const el     = document.getElementById('anmeldung-fehler');
    const textEl = document.getElementById('anmeldung-fehler-text');
    if (el && textEl) {
        textEl.textContent = text;
        el.classList.remove('versteckt');
    }
}

function _fehler_verstecken() {
    document.getElementById('anmeldung-fehler')?.classList.add('versteckt');
}

function _laden_starten(btn) {
    if (btn) { btn.classList.add('btn--ladend'); btn.disabled = true; }
}

function _laden_stoppen(btn) {
    if (btn) { btn.classList.remove('btn--ladend'); btn.disabled = false; }
}
