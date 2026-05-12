/**
 * Einstellungen — App-Einstellungen
 *
 * Darstellungs-Modus (Hell/Dunkel/System),
 * aktuelles Sprachlevel mit Formen-Uebersicht,
 * App-Informationen,
 * Android-Benachrichtigungen (nur in App-Umgebung).
 */

import { holen, setzen, abonnieren } from '../zustand.js';
import { apiPost } from '../api-client.js';
import { esc, levelLabel } from '../hilfs-funktionen.js';
import { thema_anwenden } from '../komponenten/kopfzeile.js';
import { navigieren } from '../router.js';
import { apiFehlerAnzeigen } from '../benachrichtigungen.js';
import { t } from '../dienste/sprache.js';
import {
    benachrichtigungen_verfuegbar,
    berechtigung_anfragen,
    uebungs_erinnerung_setzen,
    streak_warnung_setzen,
    konfig_laden,
    alle_deaktivieren,
} from '../dienste/android-benachrichtigungen.js';

// ============================================
// Konstanten
// ============================================

const LEVEL_FORMEN = {
    1: ['Unbestimmt Singular', 'Infinitiv', 'Praesens', 'Grundform'],
    2: ['Bestimmt Singular', 'Supinum', 'Neutrum-Form'],
    3: ['Praeteritum', 'Unbestimmt Plural', 'Bestimmt Plural', 'Komparativ'],
    4: ['Imperativ', 'Superlativ', 'Bestimmte Form', 'Perfekt-Partizip'],
    5: [],
};

function _thema_optionen() {
    return [
        { wert: 'hell', icon: 'light_mode', label: t('profil.thema_hell'), beschreibung: t('profil.thema_hell_beschreibung') },
        { wert: 'dunkel', icon: 'dark_mode', label: t('profil.thema_dunkel'), beschreibung: t('profil.thema_dunkel_beschreibung') },
        { wert: 'system', icon: 'contrast', label: t('profil.thema_system'), beschreibung: t('profil.thema_system_beschreibung') },
    ];
}

// ============================================
// Modul-Zustand
// ============================================

let _wrapper = null;
let _abbestellen = null;

// ============================================
// Modul-Exports
// ============================================

export function rendern() {
    const container = document.getElementById('inhalt');
    if (!container) return;

    container.innerHTML = '';

    _wrapper = document.createElement('div');
    _wrapper.className = 'einstellungen';
    container.appendChild(_wrapper);

    const statistik = holen('statistik');
    const level = statistik?.globales_level || 1;
    const aktuellesThema = holen('thema') || 'system';
    const konfigs = konfig_laden();
    // Formen fuer alle Level bis zum aktuellen sammeln
    let alleFomen = [];
    for (let i = 1; i <= level; i++) {
        alleFomen = alleFomen.concat(LEVEL_FORMEN[i] || []);
    }

    const naechstesLevel = level < 5 ? level + 1 : null;
    const naechsteFormen = naechstesLevel ? LEVEL_FORMEN[naechstesLevel] || [] : [];

    _wrapper.innerHTML = `
        <section class="einstellungen__kopf">
            <h2>${t('einstellungen.titel')}</h2>
        </section>

        <!-- Darstellung -->
        <section class="einstellungen__thema">
            <div class="karte" style="padding:16px">
                <div class="karte__titel" style="padding:0 0 8px">${t('profil.darstellung')}</div>
                <p style="color:var(--md-sys-color-on-surface-variant);font-size:14px;margin:0 0 12px">
                    ${t('profil.thema_beschreibung')}
                </p>
                <div class="einstellungen__thema-optionen">
                    ${_thema_optionen().map(opt => `
                        <label class="einstellungen__thema-option">
                            <input type="radio" name="thema" value="${opt.wert}"
                                ${aktuellesThema === opt.wert ? 'checked' : ''}>
                            <span class="material-symbols-outlined">${opt.icon}</span>
                            <div class="einstellungen__thema-vorschau">
                                <span class="einstellungen__thema-label">${esc(opt.label)}</span>
                                <span class="einstellungen__thema-beschreibung">${esc(opt.beschreibung)}</span>
                            </div>
                        </label>
                    `).join('')}
                </div>
            </div>
        </section>

        <!-- Sprachlevel -->
        <section class="einstellungen__level">
            <div class="karte" style="padding:16px">
                <div class="karte__titel" style="padding:0 0 8px">${t('einstellungen.sprachlevel')}</div>
                <p style="color:var(--md-sys-color-on-surface-variant);font-size:14px;margin:0 0 12px">
                    ${t('einstellungen.sprachlevel_text')}
                </p>
                <div class="einstellungen__level-anzeige">
                    <span class="einstellungen__level-nummer">${t('einstellungen.level_anzeige', {level})}</span>
                    <span class="einstellungen__level-name">${esc(levelLabel(level))}</span>
                </div>
                <div class="einstellungen__level-formen">
                    <p style="font-weight:500;font-size:14px;margin:12px 0 4px">${t('einstellungen.aktive_formen')}</p>
                    <ul>
                        ${alleFomen.map(f => `<li>${esc(f)}</li>`).join('')}
                    </ul>
                    ${naechstesLevel && naechsteFormen.length > 0 ? `
                        <p style="font-size:12px;color:var(--md-sys-color-on-surface-variant);margin-top:12px">
                            ${t('einstellungen.naechstes_level', {level: naechstesLevel, formen: naechsteFormen.join(', ')})}
                        </p>
                    ` : level >= 5 ? `
                        <p style="font-size:12px;color:var(--md-sys-color-tertiary);margin-top:12px;font-weight:500">
                            ${t('einstellungen.max_level')}
                        </p>
                    ` : ''}
                </div>
            </div>
        </section>

        ${_benachrichtigungen_html(konfigs)}

        <!-- App-Informationen -->
        <section class="einstellungen__info">
            <div class="karte" style="padding:16px">
                <div class="karte__titel" style="padding:0 0 8px">${t('einstellungen.app_info')}</div>
                <div>
                    <div class="einstellungen__info-reihe">
                        <span>${t('einstellungen.version')}</span>
                        <span>${window.Android ? (window.Android.getVersion?.() || '1.0') : '1.0.0'}</span>
                    </div>
                    <div class="einstellungen__info-reihe">
                        <span>${t('einstellungen.build')}</span>
                        <span>Phase 8</span>
                    </div>
                    <div class="einstellungen__info-reihe">
                        <span>${t('einstellungen.sprachen')}</span>
                        <span>${t('einstellungen.sprachen_wert')}</span>
                    </div>
                    <div class="einstellungen__info-reihe">
                        <span>${t('einstellungen.rechtliches')}</span>
                        <a href="#/impressum" style="color:var(--md-sys-color-primary)">${t('anmeldung.impressum_link')}</a>
                    </div>
                </div>
            </div>
        </section>
    `;

    // Thema-Radio Events
    _wrapper.querySelectorAll('input[name="thema"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const neuesThema = radio.value;
            setzen('thema', neuesThema);
            thema_anwenden(neuesThema);
            localStorage.setItem('vt_thema', neuesThema);
        });
    });

    // Abonnieren fuer externe Aenderungen (z.B. ueber Kopfzeile)
    _abbestellen = abonnieren('thema', (neuesThema) => {
        const radio = _wrapper?.querySelector(`input[name="thema"][value="${neuesThema}"]`);
        if (radio) radio.checked = true;
    });

    // Benachrichtigungs-Events (nur in Android-App)
    _benachrichtigungen_events_binden();
}

export function aufraeumen() {
    if (_abbestellen) {
        _abbestellen();
        _abbestellen = null;
    }
    _wrapper = null;
}

// ============================================
// Benachrichtigungs-UI (nur Android)
// ============================================

function _benachrichtigungen_html(konfigs) {
    if (!window.Android) return '';

    const hatBerechtigung = benachrichtigungen_verfuegbar();
    const uebungKonfig    = konfigs['uebungs_erinnerung'] || {};
    const streakKonfig    = konfigs['streak_warnung'] || {};

    return `
        <section class="einstellungen__benachrichtigungen" id="benachrichtigungen-sektion">
            <div class="karte" style="padding:16px">
                <div class="karte__titel" style="padding:0 0 8px">
                    <span class="material-symbols-outlined" style="vertical-align:middle;margin-right:6px">notifications</span>
                    ${t('einstellungen.benachrichtigungen')}
                </div>

                ${!hatBerechtigung ? `
                    <div style="background:var(--md-sys-color-error-container);border-radius:8px;padding:12px;margin-bottom:12px">
                        <p style="margin:0 0 8px;color:var(--md-sys-color-on-error-container);font-size:13px">
                            ${t('einstellungen.benachrichtigungen_deaktiviert')}
                        </p>
                        <button id="btn-berechtigung-anfragen" class="schaltflaeche schaltflaeche--gefuellt" style="font-size:13px;padding:6px 14px">
                            ${t('einstellungen.berechtigung_erteilen')}
                        </button>
                    </div>
                ` : ''}

                <!-- Übungserinnerung -->
                <div class="einstellungen__benachrichtigung-reihe">
                    <div style="flex:1">
                        <div style="font-weight:500;font-size:14px">${t('einstellungen.uebungserinnerung')}</div>
                        <div style="font-size:12px;color:var(--md-sys-color-on-surface-variant)">
                            ${t('einstellungen.uebungserinnerung_text')}
                        </div>
                    </div>
                    <label class="einstellungen__schalter">
                        <input type="checkbox" id="cb-uebung-aktiv"
                            ${uebungKonfig.aktiv !== false && uebungKonfig.uhrzeit ? 'checked' : ''}
                            ${!hatBerechtigung ? 'disabled' : ''}>
                        <span class="einstellungen__schalter-thumb"></span>
                    </label>
                </div>
                <div class="einstellungen__benachrichtigung-details" id="detail-uebung"
                    style="${uebungKonfig.aktiv !== false && uebungKonfig.uhrzeit && hatBerechtigung ? '' : 'display:none'}">
                    <label style="font-size:13px;color:var(--md-sys-color-on-surface-variant)">
                        ${t('einstellungen.uhrzeit')}
                        <input type="time" id="zeit-uebung" value="${uebungKonfig.uhrzeit || '20:00'}"
                            style="margin-left:8px;background:var(--md-sys-color-surface-variant);
                                   color:var(--md-sys-color-on-surface);border:none;border-radius:4px;padding:4px 8px">
                    </label>
                </div>

                <!-- Streak-Warnung -->
                <div class="einstellungen__benachrichtigung-reihe" style="margin-top:12px">
                    <div style="flex:1">
                        <div style="font-weight:500;font-size:14px">${t('einstellungen.streak_warnung')}</div>
                        <div style="font-size:12px;color:var(--md-sys-color-on-surface-variant)">
                            ${t('einstellungen.streak_warnung_text')}
                        </div>
                    </div>
                    <label class="einstellungen__schalter">
                        <input type="checkbox" id="cb-streak-aktiv"
                            ${streakKonfig.aktiv !== false && streakKonfig.uhrzeit ? 'checked' : ''}
                            ${!hatBerechtigung ? 'disabled' : ''}>
                        <span class="einstellungen__schalter-thumb"></span>
                    </label>
                </div>
                <div class="einstellungen__benachrichtigung-details" id="detail-streak"
                    style="${streakKonfig.aktiv !== false && streakKonfig.uhrzeit && hatBerechtigung ? '' : 'display:none'}">
                    <label style="font-size:13px;color:var(--md-sys-color-on-surface-variant)">
                        ${t('einstellungen.uhrzeit')}
                        <input type="time" id="zeit-streak" value="${streakKonfig.uhrzeit || '09:00'}"
                            style="margin-left:8px;background:var(--md-sys-color-surface-variant);
                                   color:var(--md-sys-color-on-surface);border:none;border-radius:4px;padding:4px 8px">
                    </label>
                </div>

                <!-- Alle deaktivieren -->
                ${(uebungKonfig.aktiv || streakKonfig.aktiv) ? `
                    <button id="btn-alle-deaktivieren"
                        style="margin-top:16px;font-size:12px;color:var(--md-sys-color-error);
                               background:none;border:none;cursor:pointer;padding:0">
                        ${t('einstellungen.alle_deaktivieren')}
                    </button>
                ` : ''}
            </div>
        </section>
    `;
}

function _benachrichtigungen_events_binden() {
    if (!_wrapper || !window.Android) return;

    // Berechtigung anfragen
    const btnBerechtigung = _wrapper.querySelector('#btn-berechtigung-anfragen');
    if (btnBerechtigung) {
        btnBerechtigung.addEventListener('click', async () => {
            const granted = await berechtigung_anfragen();
            if (granted) {
                // Sektion neu rendern
                const sektion = _wrapper.querySelector('#benachrichtigungen-sektion');
                if (sektion) {
                    const neueHtml = document.createElement('div');
                    neueHtml.innerHTML = _benachrichtigungen_html(konfig_laden());
                    const neueSektion = neueHtml.querySelector('#benachrichtigungen-sektion');
                    if (neueSektion) {
                        sektion.replaceWith(neueSektion);
                        _benachrichtigungen_events_binden();
                    }
                }
            }
        });
    }

    // Übungserinnerung Toggle
    const cbUebung = _wrapper.querySelector('#cb-uebung-aktiv');
    const detailUebung = _wrapper.querySelector('#detail-uebung');
    if (cbUebung && detailUebung) {
        cbUebung.addEventListener('change', () => {
            detailUebung.style.display = cbUebung.checked ? '' : 'none';
            _uebung_speichern();
        });
    }

    const zeitUebung = _wrapper.querySelector('#zeit-uebung');
    if (zeitUebung) {
        zeitUebung.addEventListener('change', () => _uebung_speichern());
    }

    // Streak-Warnung Toggle
    const cbStreak = _wrapper.querySelector('#cb-streak-aktiv');
    const detailStreak = _wrapper.querySelector('#detail-streak');
    if (cbStreak && detailStreak) {
        cbStreak.addEventListener('change', () => {
            detailStreak.style.display = cbStreak.checked ? '' : 'none';
            _streak_speichern();
        });
    }

    const zeitStreak = _wrapper.querySelector('#zeit-streak');
    if (zeitStreak) {
        zeitStreak.addEventListener('change', () => _streak_speichern());
    }

    // Alle deaktivieren
    const btnAlle = _wrapper.querySelector('#btn-alle-deaktivieren');
    if (btnAlle) {
        btnAlle.addEventListener('click', () => {
            alle_deaktivieren();
            // UI zurücksetzen
            if (cbUebung) { cbUebung.checked = false; }
            if (cbStreak) { cbStreak.checked = false; }
            if (detailUebung) detailUebung.style.display = 'none';
            if (detailStreak) detailStreak.style.display = 'none';
            btnAlle.style.display = 'none';
        });
    }
}

function _uebung_speichern() {
    const aktiv = _wrapper?.querySelector('#cb-uebung-aktiv')?.checked || false;
    const zeit  = _wrapper?.querySelector('#zeit-uebung')?.value || '20:00';
    uebungs_erinnerung_setzen({ aktiv, uhrzeit: zeit });
}

function _streak_speichern() {
    const aktiv = _wrapper?.querySelector('#cb-streak-aktiv')?.checked || false;
    const zeit  = _wrapper?.querySelector('#zeit-streak')?.value || '09:00';
    streak_warnung_setzen({ aktiv, uhrzeit: zeit });
}
