/**
 * Impressum & Datenschutz
 *
 * Ohne Login erreichbar (Pflichtseiten).
 * Inhalte werden aus der API geladen (Admin kann sie im Admin-Panel bearbeiten).
 * Fallback auf Standard-Vorlage wenn API-Wert leer.
 */

import { ist_eingeloggt } from '../zustand.js';
import { navigieren } from '../router.js';
import { API_PFAD_BASIS } from '../konfiguration.js';
import { t } from '../dienste/sprache.js';

/**
 * Impressum/Datenschutz rendern
 */
export async function rendern() {
    // Je nach Login-Status: in #inhalt oder #rechtliches-ansicht
    const container = ist_eingeloggt()
        ? document.getElementById('inhalt')
        : document.getElementById('rechtliches-ansicht');

    if (!container) return;

    // Wenn nicht eingeloggt, Ansicht sichtbar machen
    if (!ist_eingeloggt()) {
        container.classList.remove('versteckt');
        document.getElementById('anmeldung-ansicht')?.classList.add('versteckt');
    }

    // Texte aus API laden (kein Auth erforderlich)
    let daten = {};
    try {
        const antwort = await fetch(API_PFAD_BASIS + '/rechtliches/laden.php');
        if (antwort.ok) {
            const json = await antwort.json();
            if (json.erfolg) daten = json.daten;
        }
    } catch (_) {
        // Netzwerkfehler → Fallback-Inhalte werden genutzt
    }

    const systemTitel   = daten.system_titel    || '';
    const betreiberName = daten.betreiber_name  || '[Name / Betreiber]';
    const betreiberMail = daten.betreiber_email || '[email@beispiel.de]';

    const impressumHtml = daten.impressum_text
        ? daten.impressum_text
        : _standard_impressum(betreiberName, betreiberMail);

    const datenschutzHtml = daten.datenschutz_text
        ? daten.datenschutz_text
        : _standard_datenschutz();

    container.innerHTML = `
        <div class="rechtliches">
            ${!ist_eingeloggt() ? `
                <div class="rechtliches__header">
                    <button class="btn btn--text" id="btn-zurueck-anmeldung">
                        <span class="material-symbols-outlined">arrow_back</span>
                        ${t('impressum.zurueck')}
                    </button>
                </div>
            ` : ''}

            <div class="rechtliches__inhalt">
                <!-- Impressum -->
                <section class="karte" style="margin-bottom:24px">
                    <h2 class="karte__titel" style="font-size:var(--md-sys-typescale-headline-small-size)">${t('impressum.titel')}</h2>
                    <div class="karte__inhalt">${impressumHtml}</div>
                </section>

                <!-- Datenschutz -->
                <section class="karte">
                    <h2 class="karte__titel" style="font-size:var(--md-sys-typescale-headline-small-size)">${t('impressum.datenschutz_titel')}</h2>
                    <div class="karte__inhalt">${datenschutzHtml}</div>
                </section>
            </div>
        </div>
    `;

    stil_einfuegen();

    document.getElementById('btn-zurueck-anmeldung')?.addEventListener('click', () => {
        container.classList.add('versteckt');
        document.getElementById('anmeldung-ansicht')?.classList.remove('versteckt');
    });
}

function _standard_impressum(betreiberName, betreiberMail) {
    return `
        <p><strong>Angaben gemaess &sect; 5 TMG</strong></p>
        <p style="margin-top:12px">
            ${betreiberName}<br>
            [Straße Nr.]<br>
            [PLZ Ort]<br>
            [Land]
        </p>
        <p style="margin-top:12px">
            <strong>Kontakt:</strong><br>
            E-Mail: ${betreiberMail}
        </p>
        <p style="margin-top:12px; color:var(--md-sys-color-on-surface-variant); font-size:var(--md-sys-typescale-label-medium-size)">
            Diese Seite ist ein privates Lernprojekt zum Erlernen der schwedischen Sprache.
        </p>
    `;
}

function _standard_datenschutz() {
    return `
        <h3 style="margin-top:16px; font-size:var(--md-sys-typescale-title-medium-size)">1. Verantwortlicher</h3>
        <p>Verantwortlich für die Datenverarbeitung auf dieser Webseite ist der oben genannte Betreiber.</p>

        <h3 style="margin-top:16px; font-size:var(--md-sys-typescale-title-medium-size)">2. Erhobene Daten</h3>
        <p>Wir erheben und verarbeiten folgende personenbezogene Daten:</p>
        <ul style="margin:8px 0 0 20px">
            <li>Benutzername, E-Mail-Adresse, Vor- und Nachname (bei Registrierung)</li>
            <li>Lernfortschritt und Trainingsstatistiken</li>
            <li>Technische Zugriffsdaten (IP-Adresse, Zeitstempel) in Server-Logs</li>
        </ul>

        <h3 style="margin-top:16px; font-size:var(--md-sys-typescale-title-medium-size)">3. Zweck der Verarbeitung</h3>
        <p>Die Daten werden ausschließlich zur Bereitstellung der Lernplattform und zur Personalisierung des Lernerlebnisses verwendet.</p>

        <h3 style="margin-top:16px; font-size:var(--md-sys-typescale-title-medium-size)">4. Keine Weitergabe an Dritte</h3>
        <p>Personenbezogene Daten werden nicht an Dritte weitergegeben.</p>

        <h3 style="margin-top:16px; font-size:var(--md-sys-typescale-title-medium-size)">5. Keine externen Dienste</h3>
        <p>Diese Webseite lädt keine externen Ressourcen (Schriften, Skripte, Tracker). Alle Inhalte werden lokal gehostet. Es werden keine Cookies für Tracking verwendet.</p>

        <h3 style="margin-top:16px; font-size:var(--md-sys-typescale-title-medium-size)">6. Speicherdauer</h3>
        <p>Lernfortschrittsdaten werden gespeichert, solange das Benutzerkonto aktiv ist. Aktivitaetslogs werden nach 60 Tagen automatisch gelöscht.</p>

        <h3 style="margin-top:16px; font-size:var(--md-sys-typescale-title-medium-size)">7. Ihre Rechte</h3>
        <p>Sie haben das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung Ihrer personenbezogenen Daten. Kontaktieren Sie uns hierzu per E-Mail.</p>

        <h3 style="margin-top:16px; font-size:var(--md-sys-typescale-title-medium-size)">8. Verschlüsselung</h3>
        <p>Diese Webseite nutzt eine SSL/TLS-Verschlüsselung (HTTPS) für alle Datenübertragungen.</p>
    `;
}

export function stil_einfuegen() {
    if (document.getElementById('rechtliches-stil')) return;

    const stil = document.createElement('style');
    stil.id = 'rechtliches-stil';
    stil.textContent = `
        .rechtliches {
            max-width: 800px;
            margin: 0 auto;
            padding: 24px 16px;
        }

        .rechtliches__header {
            margin-bottom: 16px;
        }

        #rechtliches-ansicht {
            min-height: 100vh;
            background-color: var(--md-sys-color-background);
            color: var(--md-sys-color-on-background);
        }

        .rechtliches__inhalt ul {
            list-style-type: disc;
        }

        .rechtliches__inhalt p {
            line-height: 1.6;
        }
    `;
    document.head.appendChild(stil);
}

export function aufraeumen() {
    // Nichts aufzuraeumen
}
