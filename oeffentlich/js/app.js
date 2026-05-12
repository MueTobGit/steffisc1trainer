/**
 * App — Haupt-Controller
 *
 * Initialisiert die SPA: Token pruefen, Router starten,
 * Module dynamisch laden, Responsive erkennen.
 */

import { holen, setzen, abonnieren, bildschirm_erkennen, ist_eingeloggt } from './zustand.js';
import { token_pruefen } from './api-client.js';
import { router_init, navigieren, aktuelle_route } from './router.js';
import { seitenleiste_rendern } from './komponenten/seitenleiste.js';
import { kopfzeile_rendern, kopfzeile_titel_setzen, thema_laden } from './komponenten/kopfzeile.js';
import { schriftgroesse_laden, schriftgroesse_anwenden } from './module/profil.js';
import { entprellen } from './hilfs-funktionen.js';
import { sprache_init, sprache_anwenden, t } from './dienste/sprache.js';
import { apiGet } from './api-client.js';

// Aktuell geladenes Modul
let _aktivesModul = null;
let _aktiverModulName = null;

// Versions-Suffix für dynamische Imports (Cache-Busting in Android WebView)
// window.APP_VERSION wird von index.php injiziert
const _V = window.APP_VERSION ? `?v=${window.APP_VERSION}` : '';

// Flag: Benutzer war beim letzten benutzer-State-Update bereits angemeldet.
// Verhindert dass Profil-Updates (lernpfad toggle etc.) die aktuelle Route neu laden.
let _benutzer_war_gesetzt = false;

/**
 * App starten
 */
/**
 * Versions-Prüfung beim App-Start.
 *
 * Holt den aktuellen Server-Versions-Hash und vergleicht ihn mit dem gespeicherten.
 * Bei Abweichung → Hard-Reload mit Cache-Buster-URL (zuverlässig auch in Android WebView).
 *
 * @returns {boolean} true wenn ein Reload eingeleitet wurde (App-Start abbrechen)
 */
async function _version_pruefen() {
    try {
        const res = await fetch(`api/version.php?_=${Date.now()}`, {
            method:      'GET',
            cache:       'no-store',
            credentials: 'same-origin',
        });
        if (!res.ok) return false;

        const { version } = await res.json();
        if (!version) return false;

        const alteVersion = localStorage.getItem('vt_version');
        localStorage.setItem('vt_version', version); // Vor dem Reload setzen → kein Loop

        if (alteVersion && alteVersion !== version) {
            console.log(`[App] Neue Version ${version} (bisher ${alteVersion}) — lade neu.`);
            // Cache-Buster: neue Query-Param-URL erzwingt frischen Fetch auch im WebView-Cache
            const basis = location.href.replace(/[?#].*$/, '');
            window.location.replace(basis + '?_=' + version);
            return true; // Reload eingeleitet — App-Start abbrechen
        }
        return false;
    } catch (_) {
        // Offline oder Server-Fehler → App normal starten, kein Reload
        return false;
    }
}

async function app_starten() {
    console.log('[App] Starte Vokabeltrainer...');

    // 0a. Versions-Prüfung (vor allem anderen) — bricht bei Reload sofort ab
    const reload_pending = await _version_pruefen();
    if (reload_pending) return;

    // 0b. Android-Umgebung erkennen und konfigurieren
    if (window.Android) {
        document.body.classList.add('android-app');
        console.log('[App] Android-WebView erkannt, Version:', window.Android.getVersion?.() || '?');
    }

    // 1. Thema + Schriftgröße + Sprache laden (vor allem anderen, um Flash zu vermeiden)
    thema_laden();
    schriftgroesse_laden();
    await sprache_init();

    // 2. Bildschirmgroesse erkennen
    bildschirm_erkennen();
    window.addEventListener('resize', entprellen(() => {
        bildschirm_erkennen();
    }, 250));

    // 3. Token pruefen
    const auth = await token_pruefen();

    // Schriftgröße-Server-Standard anwenden, falls noch kein lokaler Wert gesetzt
    if (auth && !localStorage.getItem('vt_schrift')) {
        const serverSchrift = holen('konfiguration')?.standard_schrift;
        if (serverSchrift && serverSchrift !== 'klein') {
            schriftgroesse_anwenden(serverSchrift);
        }
    }

    // 4. Lade-Bildschirm ausblenden
    _lade_bildschirm_ausblenden();

    if (auth) {
        // Eingeloggt → App zeigen; Flag setzen damit State-Updates keine Route-Neuladen auslösen
        _benutzer_war_gesetzt = true;
        _app_anzeigen();

    } else {
        // Nicht eingeloggt → Anmeldung zeigen
        _anmeldung_anzeigen();
    }

    // 5. Router starten
    router_init(_route_verarbeiten);

    // 6. Auf Auth-Aenderungen reagieren
    abonnieren('benutzer', (benutzer) => {
        if (benutzer) {
            _app_anzeigen();

            if (!_benutzer_war_gesetzt) {
                // Frischer Login (zuvor war kein Benutzer gesetzt):
                // Route neu verarbeiten, da kein hashchange-Event feuert
                // (Hash stand bereits auf /dashboard und hat sich nicht geaendert)
                window.dispatchEvent(new Event('hashchange'));

            }
            // Ab jetzt gilt Benutzer als gesetzt — weitere setzen('benutzer', ...)
            // Aufrufe (z.B. Profil-Toggles) lösen keinen Route-Reload mehr aus
            _benutzer_war_gesetzt = true;
        } else {
            _benutzer_war_gesetzt = false;
            _anmeldung_anzeigen();
        }
    });

    console.log('[App] Bereit.');
}

/**
 * Route verarbeiten (vom Router aufgerufen)
 */
async function _route_verarbeiten(routeInfo) {
    if (!routeInfo) return;

    // Sonderfall: Anmeldeseite
    if (routeInfo.erfordert_auth || !ist_eingeloggt()) {
        if (!routeInfo.config || routeInfo.config.auth !== false) {
            _anmeldung_anzeigen();
            return;
        }
    }

    // Impressum/Datenschutz ist immer erreichbar
    if (routeInfo.pfad === '/impressum') {
        if (ist_eingeloggt()) {
            _app_anzeigen();
        } else {
            _rechtliches_anzeigen();
        }
        await _modul_laden('impressum', routeInfo);
        return;
    }

    // Sicherstellen dass App sichtbar ist
    if (ist_eingeloggt()) {
        _app_anzeigen();
    }

    // Modul laden
    if (routeInfo.config) {
        await _modul_laden(routeInfo.config.modul, routeInfo);

        // Kopfzeile-Titel aktualisieren
        kopfzeile_titel_setzen(routeInfo.config.titel_key ? t(routeInfo.config.titel_key) : routeInfo.config.titel);
    }
}

/**
 * Modul dynamisch laden
 */
async function _modul_laden(modulName, routeInfo) {
    // Altes Modul aufraeumen
    if (_aktivesModul && typeof _aktivesModul.aufraeumen === 'function') {
        _aktivesModul.aufraeumen();
    }

    _aktiverModulName = modulName;

    try {
        // Dynamischer Import mit Versions-Suffix (Cache-Buster für lazy-geladene Module)
        const modul = await import(`./module/${modulName}.js${_V}`);
        _aktivesModul = modul;

        // Stil einfuegen (falls vorhanden)
        if (typeof modul.stil_einfuegen === 'function') {
            modul.stil_einfuegen();
        }

        // Modul rendern
        if (typeof modul.rendern === 'function') {
            modul.rendern(routeInfo?.params || {});
        }
    } catch (fehler) {
        console.error(`[App] Modul '${modulName}' konnte nicht geladen werden:`, fehler);

        // Platzhalter anzeigen
        const inhalt = document.getElementById('inhalt');
        if (inhalt) {
            inhalt.innerHTML = `
                <div style="text-align:center; padding:48px 24px;">
                    <span class="material-symbols-outlined" style="font-size:64px; color:var(--md-sys-color-outline)">construction</span>
                    <h2 style="margin:16px 0 8px; font-size:var(--md-sys-typescale-headline-small-size)">${t('fehler.modul_in_entwicklung')}</h2>
                    <p style="color:var(--md-sys-color-on-surface-variant)">
                        ${t('fehler.modul_nicht_verfuegbar', { modul: modulName })}
                    </p>
                    <button class="btn btn--tonal" style="margin-top:16px" onclick="location.hash='#/dashboard'">
                        ${t('allgemein.zurueck_dashboard')}
                    </button>
                </div>
            `;
        }
    }
}

/**
 * App-Ansicht anzeigen (authentifiziert)
 */
function _app_anzeigen() {
    const anmeldung = document.getElementById('anmeldung-ansicht');
    const app = document.getElementById('app-container');
    const rechtliches = document.getElementById('rechtliches-ansicht');

    if (anmeldung) anmeldung.classList.add('versteckt');
    if (rechtliches) rechtliches.classList.add('versteckt');
    if (app) app.classList.remove('versteckt');

    // Navigation rendern (einmalig oder bei Auth-Wechsel)
    seitenleiste_rendern();
    kopfzeile_rendern();

    // i18n: statische data-i18n Elemente übersetzen
    sprache_anwenden();
}

/**
 * Rechtliches anzeigen (Impressum fuer nicht-eingeloggte Nutzer)
 */
function _rechtliches_anzeigen() {
    const anmeldung = document.getElementById('anmeldung-ansicht');
    const app = document.getElementById('app-container');
    const rechtliches = document.getElementById('rechtliches-ansicht');

    if (app) app.classList.add('versteckt');
    if (anmeldung) anmeldung.classList.add('versteckt');
    if (rechtliches) rechtliches.classList.remove('versteckt');
}

/**
 * Anmeldung anzeigen
 */
async function _anmeldung_anzeigen() {
    const anmeldung = document.getElementById('anmeldung-ansicht');
    const app = document.getElementById('app-container');
    const rechtliches = document.getElementById('rechtliches-ansicht');

    if (app) app.classList.add('versteckt');
    if (rechtliches) rechtliches.classList.add('versteckt');
    if (anmeldung) anmeldung.classList.remove('versteckt');

    // Anmeldungs-Modul laden
    try {
        const modul = await import(`./module/anmeldung.js${_V}`);
        modul.rendern();
    } catch (fehler) {
        console.error('[App] Anmeldungs-Modul Fehler:', fehler);
    }
}

/**
 * Lade-Bildschirm ausblenden
 */
function _lade_bildschirm_ausblenden() {
    const lader = document.getElementById('lade-bildschirm');
    if (lader) {
        lader.classList.add('ausblenden');
        // Nach Animation entfernen
        setTimeout(() => {
            lader.remove();
        }, 500);
    }
}


// ---- Globale Funktion fuer Android-Bridge ----
// Ermoeglicht der nativen App, nach einem Magic-Link- oder Custom-Scheme-Login
// den Token direkt in die laufende SPA zu injizieren, ohne einen Neustart.
// Aufruf: webView.evaluateJavascript("window.vt_token_empfangen('TOKEN', false)")
window.vt_token_empfangen = async function(token, istNeu) {
    try {
        localStorage.setItem('vt_token', token);
        if (istNeu) sessionStorage.setItem('vt_neu_registriert', '1');
        const auth = await token_pruefen();
        if (auth && !ist_eingeloggt()) {
            setzen('benutzer', auth);
        }
    } catch (e) {
        console.error('[App] vt_token_empfangen Fehler:', e);
    }
};

// ---- App starten wenn DOM bereit ----
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', app_starten);
} else {
    app_starten();
}
