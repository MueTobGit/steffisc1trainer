/**
 * Anmeldung — Passwort-Login
 */

import { anmelden } from '../api-client.js';
import { setzen } from '../zustand.js';
import { esc } from '../hilfs-funktionen.js';

export function rendern() {
    const container = document.getElementById('anmeldung-ansicht');
    if (!container) return;

    container.innerHTML = `
        <div class="anmeldung-container" id="anmeldung-container">
            <div class="anmeldung__kopf">
                <div class="anmeldung__flagge">&#x1F1EC;&#x1F1E7;</div>
                <h1 class="anmeldung__titel">Steffis C1-Trainer</h1>
                <p class="anmeldung__untertitel">Englisch C1 — Vokabeltraining</p>
            </div>

            <form class="anmeldung__formular" id="passwort-form" novalidate>
                <div class="formular-gruppe">
                    <label class="formular-label" for="pw-benutzername">Benutzername</label>
                    <input
                        class="eingabe"
                        type="text"
                        id="pw-benutzername"
                        name="benutzername"
                        autocomplete="username"
                        placeholder="Benutzername"
                        required
                    >
                </div>

                <div class="formular-gruppe" style="margin-top:12px">
                    <label class="formular-label" for="pw-passwort">Passwort</label>
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
                    <span class="btn-text">Anmelden</span>
                    <span class="btn-lader"></span>
                </button>
            </form>

            <div class="anmeldung__fuss">
                <a href="#/impressum">Impressum & Datenschutz</a>
            </div>
        </div>
    `;

    document.getElementById('pw-benutzername')?.focus();
    document.getElementById('passwort-form')?.addEventListener('submit', _passwort_absenden);
}

export function aufraeumen() {}

async function _passwort_absenden(e) {
    e.preventDefault();

    const benutzername = document.getElementById('pw-benutzername')?.value?.trim() ?? '';
    const passwort     = document.getElementById('pw-passwort')?.value ?? '';
    const fehler_el    = document.getElementById('pw-fehler');
    const fehler_text  = document.getElementById('pw-fehler-text');
    const btn          = document.getElementById('btn-passwort-login');

    fehler_el?.classList.add('versteckt');

    if (!benutzername || !passwort) {
        if (fehler_text) fehler_text.textContent = 'Bitte Benutzername und Passwort eingeben.';
        fehler_el?.classList.remove('versteckt');
        return;
    }

    if (btn) { btn.classList.add('btn--ladend'); btn.disabled = true; }

    const ergebnis = await anmelden(benutzername, passwort);

    if (btn) { btn.classList.remove('btn--ladend'); btn.disabled = false; }

    if (ergebnis.erfolg) {
        localStorage.setItem('vt_token', ergebnis.daten.token);
        setzen('benutzer', ergebnis.daten.benutzer);
    } else {
        const msg = ergebnis.fehler?.nachricht || 'Benutzername oder Passwort falsch.';
        if (fehler_text) fehler_text.textContent = msg;
        fehler_el?.classList.remove('versteckt');
        const pwInput = document.getElementById('pw-passwort');
        if (pwInput) { pwInput.value = ''; pwInput.focus(); }
    }
}
