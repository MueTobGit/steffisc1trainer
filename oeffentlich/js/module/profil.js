/**
 * Profil — Benutzerprofil-Ansicht, -Bearbeitung und App-Einstellungen
 *
 * Zeigt Avatar, Name, E-Mail, Rolle, Mitglied-seit, Statistik.
 * Bearbeitungsformular fuer persoenliche Daten + Passwort.
 * Einstellungen: Darstellung (Thema), Schriftgröße, Sprachlevel, Lernpfad,
 *                Android-Systemberechtigungen (Benachrichtigungen, Mikrofon).
 *
 * Hinweis: Benachrichtigungs-Zeitpunkte werden nicht hier konfiguriert,
 * sondern ausschließlich über Admin → Konfiguration → App-Benachrichtigungen.
 */

import { apiGet, apiPost, apiDelete, passwort_aendern } from '../api-client.js';
import { OEFFENTLICH_PFAD_BASIS } from '../konfiguration.js';
import { holen, setzen, abonnieren } from '../zustand.js';
import { esc, zahlFormatieren, datumFormatieren } from '../hilfs-funktionen.js';
import { lade_anzeige_rendern, lade_anzeige_entfernen } from '../komponenten/lade-anzeige.js';
import { leer_zustand_rendern } from '../komponenten/leer-zustand.js';
import { erfolg, fehler as fehlerMsg, apiFehlerAnzeigen } from '../benachrichtigungen.js';
import { thema_anwenden } from '../komponenten/kopfzeile.js';
import { t } from '../dienste/sprache.js';

// ============================================
// Konstanten
// ============================================

function _thema_optionen() {
    return [
        { wert: 'hell',   icon: 'light_mode', label: t('profil.thema_hell'),   beschreibung: t('profil.thema_hell_beschreibung') },
        { wert: 'dunkel', icon: 'dark_mode',  label: t('profil.thema_dunkel'), beschreibung: t('profil.thema_dunkel_beschreibung') },
        { wert: 'system', icon: 'contrast',   label: t('profil.thema_system'), beschreibung: t('profil.thema_system_beschreibung') },
    ];
}

function _schrift_optionen() {
    return [
        { wert: 'klein',  label: t('profil.schrift_klein'),  beschreibung: t('profil.schrift_klein_beschreibung') },
        { wert: 'mittel', label: t('profil.schrift_mittel'), beschreibung: t('profil.schrift_mittel_beschreibung') },
        { wert: 'gross',  label: t('profil.schrift_gross'),  beschreibung: t('profil.schrift_gross_beschreibung') },
    ];
}

/**
 * Schriftgröße laden und anwenden (global)
 */
export function schriftgroesse_laden() {
    const gespeichert = localStorage.getItem('vt_schrift') || 'klein';
    schriftgroesse_anwenden(gespeichert);
}

export function schriftgroesse_anwenden(wert) {
    const html = document.documentElement;
    if (wert === 'mittel' || wert === 'gross') {
        html.setAttribute('data-schrift', wert);
    } else {
        html.removeAttribute('data-schrift');
    }
    localStorage.setItem('vt_schrift', wert);
}

// ============================================
// Modul-Zustand
// ============================================

let _wrapper     = null;
let _profil      = null;
let _abbestellen = null;

// ============================================
// Modul-Exports
// ============================================

export async function rendern() {
    const container = document.getElementById('inhalt');
    if (!container) return;

    container.innerHTML = '';

    _wrapper = document.createElement('div');
    _wrapper.className = 'profil';
    container.appendChild(_wrapper);

    lade_anzeige_rendern(_wrapper);

    try {
        const ergebnis = await apiGet('profil/laden.php');
        lade_anzeige_entfernen(_wrapper);

        if (!ergebnis.erfolg) {
            leer_zustand_rendern(_wrapper, 'error', t('profil.fehler_titel'), t('profil.fehler_laden'));
            return;
        }

        _profil = ergebnis.daten;
        _seite_rendern();
    } catch (e) {
        console.error('Profil laden fehlgeschlagen:', e);
        lade_anzeige_entfernen(_wrapper);
        leer_zustand_rendern(_wrapper, 'error', t('profil.fehler_titel'), t('profil.fehler_netzwerk'));
    }
}

export function aufraeumen() {
    if (_abbestellen) {
        _abbestellen();
        _abbestellen = null;
    }
    _wrapper = null;
    _profil  = null;
}

// ============================================
// Seite aufbauen
// ============================================

function _seite_rendern() {
    const b = _profil.benutzer;
    const s = _profil.statistik;

    const name         = [b.vorname, b.nachname].filter(Boolean).join(' ') || b.benutzername;
    const initiale     = (b.vorname || b.benutzername || '?').charAt(0).toUpperCase();
    const mitgliedSeit = datumFormatieren(b.erstellt_am);
    const rolleLabel_  = b.rolle === 'admin' ? t('profil.rolle_admin') : t('profil.rolle_benutzer');

    // Einstellungen-Daten
    const aktuellesThema   = holen('thema') || 'system';

    // Neue Vokabeln pro Tag (0 = unbegrenzt)
    const aktuelleNeueVokabeln = b.neue_vokabeln_pro_tag ?? 10;

    _wrapper.innerHTML = `
        <!-- ===== Profil-Info ===== -->
        <section class="profil__info-karte">
            <div class="karte" style="padding:24px">
                <div class="profil__kopf">
                    <div class="profil__avatar">
                        <span class="profil__avatar-initial">${esc(initiale)}</span>
                    </div>
                    <div class="profil__meta">
                        <h2 class="profil__name">${esc(name)}</h2>
                        <span class="profil__benutzername">@${esc(b.benutzername)}</span>
                        ${b.email ? `<span class="profil__email">${esc(b.email)}</span>` : ''}
                        <div class="profil__tags">
                            <span class="tag tag--${b.rolle}">${esc(rolleLabel_)}</span>
                            <span class="profil__mitglied-seit">${t('profil.mitglied_seit', {datum: mitgliedSeit})}</span>
                        </div>
                    </div>
                </div>
                <button class="btn btn--umrandet" id="btn-profil-bearbeiten" style="margin-top:16px">
                    <span class="material-symbols-outlined">edit</span>
                    ${t('profil.bearbeiten')}
                </button>
            </div>
        </section>

        <!-- ===== Bearbeitungs-Formular (versteckt) ===== -->
        <section class="profil__bearbeiten versteckt" id="profil-formular-bereich">
            <div class="karte" style="padding:16px">
                <div class="karte__titel" style="padding:0 0 12px">${t('profil.bearbeiten')}</div>
                <div class="formular-gruppe" style="margin-bottom:12px">
                    <label class="formular-label">${t('profil.benutzername')}</label>
                    <input class="eingabe" type="text" id="profil-benutzername" maxlength="32"
                        value="${esc(b.benutzername || '')}"
                        autocomplete="username" autocorrect="off" spellcheck="false">
                    <div id="profil-benutzername-status" style="font-size:0.75rem;margin-top:4px"></div>
                </div>
                <div class="formular-gruppe" style="margin-bottom:12px">
                    <label class="formular-label">${t('profil.vorname')}</label>
                    <input class="eingabe" type="text" id="profil-vorname" maxlength="64" value="${esc(b.vorname || '')}">
                </div>
                <div class="formular-gruppe" style="margin-bottom:12px">
                    <label class="formular-label">${t('profil.nachname')}</label>
                    <input class="eingabe" type="text" id="profil-nachname" maxlength="64" value="${esc(b.nachname || '')}">
                </div>
                <div class="formular-gruppe" style="margin-bottom:12px">
                    <label class="formular-label">${t('profil.email')}</label>
                    <input class="eingabe" type="email" id="profil-email" value="${esc(b.email || '')}">
                    <div style="font-size:0.75rem;color:var(--md-sys-color-on-surface-variant);margin-top:4px">
                        ${t('profil.email_aenderung_hinweis')}
                    </div>
                </div>
                <div class="profil__formular-aktionen">
                    <button class="btn btn--text" id="btn-profil-abbrechen">${t('profil.abbrechen')}</button>
                    <button class="btn btn--gefuellt" id="btn-profil-speichern">${t('profil.speichern')}</button>
                </div>
            </div>
        </section>

        <!-- ===== Passwort aendern ===== -->
        <section class="profil__passwort">
            <div class="karte" style="padding:16px">
                <button class="btn btn--umrandet" id="btn-pw-toggle" style="width:100%">
                    <span class="material-symbols-outlined">lock</span>
                    ${t('profil.passwort_aendern')}
                </button>
                <form class="profil__pw-felder versteckt" id="profil-pw-felder" style="margin-top:16px" autocomplete="off" onsubmit="return false">
                    <input type="text" autocomplete="username" value="${esc(_profil?.benutzer?.benutzername || _profil?.benutzer?.email || '')}" style="display:none" aria-hidden="true" tabindex="-1">
                    <div class="formular-gruppe" style="margin-bottom:12px">
                        <label class="formular-label">${t('profil.altes_passwort')}</label>
                        <input class="eingabe" type="password" id="profil-altes-pw" autocomplete="current-password">
                    </div>
                    <div class="formular-gruppe" style="margin-bottom:12px">
                        <label class="formular-label">${t('profil.neues_passwort')}</label>
                        <input class="eingabe" type="password" id="profil-neues-pw" autocomplete="new-password">
                    </div>
                    <div class="formular-gruppe" style="margin-bottom:8px">
                        <label class="formular-label">${t('profil.neues_passwort_wiederholen')}</label>
                        <input class="eingabe" type="password" id="profil-neues-pw2" autocomplete="new-password">
                    </div>
                    <p class="profil__pw-hinweis">${t('profil.passwort_hinweis')}</p>
                    <button class="btn btn--umrandet" id="btn-pw-aendern">${t('profil.passwort_aendern')}</button>
                </form>
            </div>
        </section>

        <!-- ===== Darstellung ===== -->
        <section>
            <div class="karte" style="padding:16px">
                <div class="karte__titel" style="padding:0 0 8px">
                    <span class="material-symbols-outlined" style="vertical-align:middle;margin-right:6px;font-size:20px">palette</span>
                    ${t('profil.darstellung')}
                </div>
                <p style="color:var(--md-sys-color-on-surface-variant);font-size:0.875rem;margin:0 0 12px">
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

        <!-- ===== Schriftgrösse ===== -->
        <section>
            <div class="karte" style="padding:16px">
                <div class="karte__titel" style="padding:0 0 8px">
                    <span class="material-symbols-outlined" style="vertical-align:middle;margin-right:6px;font-size:20px">text_fields</span>
                    ${t('profil.schriftgroesse')}
                </div>
                <p style="color:var(--md-sys-color-on-surface-variant);font-size:0.875rem;margin:0 0 12px">
                    ${t('profil.schriftgroesse_beschreibung')}
                </p>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                    ${_schrift_optionen().map(opt => `
                        <label style="flex:1;min-width:80px;cursor:pointer">
                            <input type="radio" name="schrift" value="${opt.wert}"
                                style="display:none"
                                ${(localStorage.getItem('vt_schrift') || 'klein') === opt.wert ? 'checked' : ''}>
                            <div class="schrift-option ${(localStorage.getItem('vt_schrift') || 'klein') === opt.wert ? 'schrift-option--aktiv' : ''}"
                                style="border:2px solid ${(localStorage.getItem('vt_schrift') || 'klein') === opt.wert ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-outline-variant)'};
                                    border-radius:8px;padding:12px;text-align:center;transition:border-color 0.2s">
                                <div style="font-size:${opt.wert === 'klein' ? '14' : opt.wert === 'mittel' ? '17' : '20'}px;font-weight:500;margin-bottom:2px">${opt.label}</div>
                                <div style="font-size:11px;color:var(--md-sys-color-on-surface-variant)">${opt.beschreibung}</div>
                            </div>
                        </label>
                    `).join('')}
                </div>
            </div>
        </section>

        <!-- ===== Neue Vokabeln pro Tag ===== -->
        <section>
            <div class="karte" style="padding:16px">
                <div class="karte__titel" style="padding:0 0 8px">
                    <span class="material-symbols-outlined" style="vertical-align:middle;margin-right:6px;font-size:20px">school</span>
                    ${t('profil.neue_vokabeln_titel')}
                </div>
                <p style="color:var(--md-sys-color-on-surface-variant);font-size:0.875rem;margin:0 0 12px" id="neue-vokabeln-text">
                    ${t('profil.neue_vokabeln_aktuell', { anzahl: aktuelleNeueVokabeln === 0 ? '∞' : aktuelleNeueVokabeln })}
                </p>
                <div style="display:flex;gap:8px;flex-wrap:wrap" id="neue-vokabeln-kacheln">
                    ${[
                        { wert: 5,  icon: 'self_improvement',      label: '5/Tag',  beschreibung: t('profil.neue_vokabeln_entspannt') },
                        { wert: 10, icon: 'school',                label: '10/Tag', beschreibung: t('profil.neue_vokabeln_normal') },
                        { wert: 20, icon: 'local_fire_department', label: '20/Tag', beschreibung: t('profil.neue_vokabeln_intensiv') },
                        { wert: 30, icon: 'rocket_launch',         label: '30/Tag', beschreibung: t('profil.neue_vokabeln_intensiv_plus') },
                        { wert: 0,  icon: 'all_inclusive',         label: '∞',      beschreibung: t('profil.neue_vokabeln_unbegrenzt') },
                    ].map(opt => `
                        <label style="flex:1;min-width:80px;cursor:pointer">
                            <input type="radio" name="neue_vokabeln" value="${opt.wert}"
                                style="display:none"
                                ${aktuelleNeueVokabeln === opt.wert ? 'checked' : ''}>
                            <div class="schrift-option ${aktuelleNeueVokabeln === opt.wert ? 'schrift-option--aktiv' : ''} neue-vokabeln-kachel"
                                data-wert="${opt.wert}"
                                style="border:2px solid ${aktuelleNeueVokabeln === opt.wert ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-outline-variant)'};
                                    border-radius:8px;padding:10px 6px;text-align:center;transition:border-color 0.2s">
                                <span class="material-symbols-outlined" style="font-size:20px;display:block;margin-bottom:2px">${opt.icon}</span>
                                <div style="font-size:14px;font-weight:600;margin-bottom:1px">${opt.label}</div>
                                <div style="font-size:11px;color:var(--md-sys-color-on-surface-variant)">${opt.beschreibung}</div>
                            </div>
                        </label>
                    `).join('')}
                </div>
            </div>
        </section>

        ${window.Android ? `
        <!-- ===== Android: Systemberechtigungen ===== -->
        <section>
            <div class="karte" style="padding:16px">
                <div class="karte__titel" style="padding:0 0 8px">
                    <span class="material-symbols-outlined" style="vertical-align:middle;margin-right:6px;font-size:20px">settings</span>
                    ${t('profil.android_berechtigungen')}
                </div>
                <p style="color:var(--md-sys-color-on-surface-variant);font-size:0.875rem;margin:0 0 12px">
                    ${t('profil.android_beschreibung')}
                </p>
                <div style="display:flex;flex-direction:column;gap:10px">
                    <button class="btn btn--umrandet" id="btn-android-benachrichtigungen" style="justify-content:flex-start;gap:10px">
                        <span class="material-symbols-outlined">notifications</span>
                        ${t('profil.android_benachrichtigungen')}
                    </button>
                    <button class="btn btn--umrandet" id="btn-android-mikrofon" style="justify-content:flex-start;gap:10px">
                        <span class="material-symbols-outlined">mic</span>
                        ${t('profil.android_mikrofon')}
                    </button>
                </div>
            </div>
        </section>
        ` : ''}

    `;

    _events_registrieren();
}

// ============================================
// Events
// ============================================

function _events_registrieren() {
    const formBereich = _wrapper.querySelector('#profil-formular-bereich');

    _wrapper.querySelector('#btn-profil-bearbeiten').addEventListener('click', () => {
        formBereich.classList.toggle('versteckt');
    });

    _wrapper.querySelector('#btn-profil-abbrechen').addEventListener('click', () => {
        formBereich.classList.add('versteckt');
    });

    _wrapper.querySelector('#btn-profil-speichern').addEventListener('click', _profil_speichern);

    // Passwort-Toggle
    const pwFelder = _wrapper.querySelector('#profil-pw-felder');
    _wrapper.querySelector('#btn-pw-toggle').addEventListener('click', () => {
        pwFelder.classList.toggle('versteckt');
    });
    _wrapper.querySelector('#btn-pw-aendern').addEventListener('click', _passwort_aendern_handler);

    // Thema-Radio
    _wrapper.querySelectorAll('input[name="thema"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const neuesThema = radio.value;
            setzen('thema', neuesThema);
            thema_anwenden(neuesThema);
            localStorage.setItem('vt_thema', neuesThema);
        });
    });

    // Schriftgröße-Radio
    _wrapper.querySelectorAll('input[name="schrift"]').forEach(radio => {
        radio.addEventListener('change', () => {
            schriftgroesse_anwenden(radio.value);
            // Optisch: alle Boxen aktualisieren
            _wrapper.querySelectorAll('input[name="schrift"]').forEach(r => {
                const box = r.nextElementSibling;
                if (box) {
                    const aktiv = r.value === radio.value;
                    box.style.borderColor = aktiv
                        ? 'var(--md-sys-color-primary)'
                        : 'var(--md-sys-color-outline-variant)';
                }
            });
        });
    });

    // Android Systemeinstellungen
    const btnBenach = _wrapper.querySelector('#btn-android-benachrichtigungen');
    if (btnBenach && window.Android) {
        btnBenach.addEventListener('click', () => {
            window.Android.openNotificationSettings?.();
        });
    }
    const btnMikro = _wrapper.querySelector('#btn-android-mikrofon');
    if (btnMikro && window.Android) {
        btnMikro.addEventListener('click', () => {
            window.Android.openAppSettings?.();
        });
    }

    // Benutzername Verfügbarkeitsprüfung
    const bnInput = _wrapper.querySelector('#profil-benutzername');
    const bnStatus = _wrapper.querySelector('#profil-benutzername-status');
    if (bnInput && bnStatus) {
        const _pruefe_benutzername = entprellen_lokal(async () => {
            const neu = bnInput.value.trim();
            const aktuell = _profil?.benutzer?.benutzername || '';
            if (!neu || neu === aktuell) {
                bnStatus.textContent = '';
                return;
            }
            if (neu.length < 3) {
                bnStatus.textContent = t('profil.benutzername_min');
                bnStatus.style.color = 'var(--md-sys-color-error)';
                return;
            }
            const res = await apiGet(`profil/benutzername_pruefen.php?benutzername=${encodeURIComponent(neu)}`);
            if (res?.daten?.verfuegbar) {
                bnStatus.textContent = t('profil.benutzername_verfuegbar');
                bnStatus.style.color = 'var(--md-sys-color-tertiary)';
            } else {
                bnStatus.textContent = t('profil.benutzername_vergeben');
                bnStatus.style.color = 'var(--md-sys-color-error)';
            }
        }, 500);
        bnInput.addEventListener('input', _pruefe_benutzername);
    }

    // Thema-Sync bei externer Aenderung (z.B. ueber Kopfzeile)
    if (_abbestellen) _abbestellen();
    _abbestellen = abonnieren('thema', (neuesThema) => {
        const radio = _wrapper?.querySelector(`input[name="thema"][value="${neuesThema}"]`);
        if (radio) radio.checked = true;
    });

    // Neue Vokabeln pro Tag — Kacheln
    _wrapper.querySelectorAll('.neue-vokabeln-kachel').forEach(kachel => {
        kachel.addEventListener('click', async () => {
            const wert = parseInt(kachel.dataset.wert, 10);
            // Alle Kacheln zurücksetzen, aktive hervorheben
            _wrapper.querySelectorAll('.neue-vokabeln-kachel').forEach(k => {
                const aktiv = k === kachel;
                k.classList.toggle('schrift-option--aktiv', aktiv);
                k.style.borderColor = aktiv ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-outline-variant)';
                const radio = k.closest('label')?.querySelector('input[type="radio"]');
                if (radio) radio.checked = aktiv;
            });
            // Beschreibungstext aktualisieren
            const beschr = _wrapper.querySelector('#neue-vokabeln-text');
            if (beschr) beschr.innerHTML = t('profil.neue_vokabeln_aktuell', { anzahl: wert === 0 ? '∞' : wert });
            const erg = await apiPost('profil/aktualisieren.php', { neue_vokabeln_pro_tag: wert });
            if (erg.erfolg) {
                erfolg(t('profil.neue_vokabeln_erfolg', { anzahl: wert === 0 ? '∞' : wert }));
                if (_profil?.benutzer) _profil.benutzer.neue_vokabeln_pro_tag = wert;
            } else {
                apiFehlerAnzeigen(erg);
            }
        });
    });

}

// ============================================
// Hilfsfunktion: lokales Entprellen
// ============================================
function entprellen_lokal(fn, verzoegerung) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), verzoegerung);
    };
}

// ============================================
// Profil speichern
// ============================================

async function _profil_speichern() {
    const benutzername = _wrapper.querySelector('#profil-benutzername')?.value.trim() || '';
    const vorname  = _wrapper.querySelector('#profil-vorname').value.trim();
    const nachname = _wrapper.querySelector('#profil-nachname').value.trim();
    const neueEmail = _wrapper.querySelector('#profil-email').value.trim();

    const alteEmail = _profil?.benutzer?.email || '';
    const alterBenutzername = _profil?.benutzer?.benutzername || '';

    if (benutzername && benutzername.length < 3) {
        fehlerMsg(t('profil.benutzername_min_fehler'));
        return;
    }

    const btn = _wrapper.querySelector('#btn-profil-speichern');
    btn.disabled = true;
    btn.textContent = t('profil.speichere');

    const nutzlast = {
        vorname:  vorname || null,
        nachname: nachname || null,
    };
    if (benutzername && benutzername !== alterBenutzername) {
        nutzlast.benutzername = benutzername;
    }
    // E-Mail-Änderung: Verifizierung anstoßen
    if (neueEmail && neueEmail !== alteEmail) {
        nutzlast.neue_email = neueEmail;
    }

    const ergebnis = await apiPost('profil/aktualisieren.php', nutzlast);

    btn.disabled = false;
    btn.textContent = t('profil.speichern');

    if (ergebnis.erfolg) {
        if (neueEmail && neueEmail !== alteEmail) {
            erfolg(t('profil.email_bestaetigung'));
        } else {
            erfolg(t('profil.gespeichert'));
        }

        // Zustand aktualisieren
        const benutzer = holen('benutzer');
        const aktualisiert = {
            ...benutzer,
            vorname,
            nachname,
        };
        if (benutzername && benutzername !== alterBenutzername) {
            aktualisiert.benutzername = benutzername;
        }
        setzen('benutzer', aktualisiert);

        _profil.benutzer.vorname   = vorname;
        _profil.benutzer.nachname  = nachname;
        if (benutzername && benutzername !== alterBenutzername) {
            _profil.benutzer.benutzername = benutzername;
        }
        _seite_rendern();
    } else {
        apiFehlerAnzeigen(ergebnis);
    }
}

// ============================================
// Passwort aendern
// ============================================

async function _passwort_aendern_handler() {
    const altes = _wrapper.querySelector('#profil-altes-pw').value;
    const neues = _wrapper.querySelector('#profil-neues-pw').value;
    const bestaetigung = _wrapper.querySelector('#profil-neues-pw2').value;

    if (!altes || !neues || !bestaetigung) {
        fehlerMsg(t('profil.pw_alle_felder'));
        return;
    }

    if (neues !== bestaetigung) {
        fehlerMsg(t('profil.pw_nicht_gleich'));
        return;
    }

    if (neues.length < 8) {
        fehlerMsg(t('profil.pw_zu_kurz'));
        return;
    }

    const ergebnis = await passwort_aendern(altes, neues);

    if (ergebnis.erfolg) {
        erfolg(t('profil.pw_geaendert'));
        _wrapper.querySelector('#profil-altes-pw').value  = '';
        _wrapper.querySelector('#profil-neues-pw').value  = '';
        _wrapper.querySelector('#profil-neues-pw2').value = '';
    } else {
        apiFehlerAnzeigen(ergebnis);
    }
}

