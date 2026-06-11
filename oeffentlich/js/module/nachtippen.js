/**
 * Nachtippen — Tipp-Übungsmodus
 *
 * Start-Screen: Themenfeld-Auswahl + Optionen
 * Übungs-Screen: Text satzweise eintippen (direkt über den angezeigten Text)
 *
 * Route: /nachtippen
 */

import { apiGet } from '../api-client.js';
import { esc } from '../hilfs-funktionen.js';
import { t } from '../dienste/sprache.js';
import { lade_anzeige_rendern } from '../komponenten/lade-anzeige.js';
import { apiFehlerAnzeigen } from '../benachrichtigungen.js';

// ---- Modul-State ----
let _container       = null;

// Start-Screen State
let _themenfelder    = [];
let _aktive_tf_ids   = new Set();
let _include_ohne    = true;
let _pool_groesse    = 0;

// Übungs-State
let _satz            = null;    // aktueller DB-Eintrag { id, text, themenfeld_titel }
let _saetze          = [];      // grammatische Sätze (Split nach . ! ?)
let _satz_index      = 0;       // aktueller Satz-Index in _saetze
let _korrekt         = 0;       // korrekt getippte Zeichen im aktuellen Satz
let _blockiert       = false;   // falsches Zeichen getippt
let _session_korrekt = 0;       // Texte diese Session vollständig abgetippt
let _session_skip    = 0;       // Übersprungene Texte
let _laedt           = false;

// ============================================================
// ENTRY POINT
// ============================================================

export async function rendern(params = {}) {
    _container = document.getElementById('inhalt');
    if (!_container) return;

    _satz            = null;
    _saetze          = [];
    _satz_index      = 0;
    _korrekt         = 0;
    _blockiert       = false;
    _session_korrekt = 0;
    _session_skip    = 0;
    _aktive_tf_ids   = new Set();
    _include_ohne    = true;

    lade_anzeige_rendern(_container);

    const tfErg = await apiGet('themenfelder/liste.php', { pro_seite: 500 });
    _themenfelder = tfErg.erfolg ? (tfErg.daten?.eintraege || []) : [];

    _start_rendern();
}

// ============================================================
// START-SCREEN
// ============================================================

function _start_rendern() {
    const alleAktiv = _aktive_tf_ids.size === 0;

    _container.innerHTML = `
        <div class="nt-container">
            <div class="nt-start">
                <h1 class="nt-start__titel">
                    <span class="material-symbols-outlined">keyboard</span>
                    ${t('nachtippen.titel')}
                </h1>

                <div class="nt-start__abschnitt">
                    <p class="nt-start__abschnitt-titel">${t('nachtippen.themenfeld_waehlen')}</p>
                    <div class="nt-tf-chips" id="tf-chips">
                        <button class="nt-tf-chip nt-tf-chip--alle ${alleAktiv ? 'nt-tf-chip--aktiv' : ''}"
                            data-tf-alle>
                            ${t('nachtippen.alle_themenfelder')}
                        </button>
                        ${_themenfelder.map(tf => `
                            <button class="nt-tf-chip ${_aktive_tf_ids.has(tf.id) ? 'nt-tf-chip--aktiv' : ''}"
                                data-tf-id="${tf.id}">
                                ${esc(tf.titel)}
                            </button>
                        `).join('')}
                    </div>
                </div>

                <div class="nt-start__abschnitt">
                    <p class="nt-start__abschnitt-titel">${t('nachtippen.optionen')}</p>
                    <div class="nt-optionen">
                        <label class="nt-option">
                            <input type="checkbox" id="chk-include-ohne" ${_include_ohne ? 'checked' : ''}>
                            ${t('nachtippen.include_ohne')}
                        </label>
                    </div>
                    <p class="nt-pool-info" id="pool-info">&nbsp;</p>
                </div>

                <div class="nt-start__aktionen">
                    <button class="btn btn--gefuellt btn--gross" id="btn-starten">
                        <span class="material-symbols-outlined">play_arrow</span>
                        ${t('nachtippen.starten')}
                    </button>
                </div>
            </div>
        </div>
    `;

    _start_events_binden();
    _pool_info_laden();
}

function _start_events_binden() {
    _container.querySelector('[data-tf-alle]')?.addEventListener('click', () => {
        _aktive_tf_ids.clear();
        _start_chips_aktualisieren();
        _pool_info_laden();
    });

    _container.querySelectorAll('[data-tf-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tid = parseInt(btn.dataset.tfId, 10);
            if (_aktive_tf_ids.has(tid)) {
                _aktive_tf_ids.delete(tid);
            } else {
                _aktive_tf_ids.add(tid);
            }
            _start_chips_aktualisieren();
            _pool_info_laden();
        });
    });

    _container.querySelector('#chk-include-ohne')?.addEventListener('change', e => {
        _include_ohne = e.target.checked;
        _pool_info_laden();
    });

    _container.querySelector('#btn-starten')?.addEventListener('click', () => {
        _uebung_starten();
    });
}

function _start_chips_aktualisieren() {
    const alleAktiv = _aktive_tf_ids.size === 0;
    _container.querySelector('[data-tf-alle]')?.classList.toggle('nt-tf-chip--aktiv', alleAktiv);
    _container.querySelectorAll('[data-tf-id]').forEach(btn => {
        const tid = parseInt(btn.dataset.tfId, 10);
        btn.classList.toggle('nt-tf-chip--aktiv', _aktive_tf_ids.has(tid));
    });
}

async function _pool_info_laden() {
    const erg = await apiGet('tipp_saetze/zufaellig.php', _api_params());
    const info = _container?.querySelector('#pool-info');
    if (!info) return;

    if (erg.erfolg) {
        _pool_groesse = erg.daten.pool_groesse;
        info.textContent = t('nachtippen.pool_groesse', { anzahl: _pool_groesse });
        info.style.color = '';
    } else {
        _pool_groesse = 0;
        info.textContent = t('nachtippen.pool_leer');
        info.style.color = 'var(--md-sys-color-error)';
    }
}

// ============================================================
// ÜBUNGS-SCREEN
// ============================================================

async function _uebung_starten() {
    if (_pool_groesse === 0) {
        await _pool_info_laden();
        if (_pool_groesse === 0) return;
    }

    lade_anzeige_rendern(_container);
    await _naechsten_text_laden(true);
}

async function _naechsten_text_laden(erster = false) {
    if (_laedt) return;
    _laedt = true;

    const erg = await apiGet('tipp_saetze/zufaellig.php', {
        ..._api_params(),
        exclude_id: erster ? 0 : (_satz?.id ?? 0),
    });

    _laedt = false;

    if (!erg.erfolg) {
        apiFehlerAnzeigen(erg);
        _start_rendern();
        return;
    }

    _satz       = erg.daten.satz;
    _saetze     = _text_in_saetze_teilen(_satz.text);
    _satz_index = 0;
    _korrekt    = 0;
    _blockiert  = false;

    _uebung_rendern();
}

function _uebung_rendern() {
    const mehrSaetze = _saetze.length > 1;

    _container.innerHTML = `
        <div class="nt-container">
            <div class="nt-uebung">

                <!-- Kopf mit Stats -->
                <div class="nt-kopf">
                    <button class="btn btn--text" id="btn-beenden">
                        <span class="material-symbols-outlined" style="font-size:18px">arrow_back</span>
                        ${t('nachtippen.beenden')}
                    </button>
                    <div class="nt-stats">
                        <span class="nt-stat nt-stat--korrekt">
                            <span class="material-symbols-outlined">check_circle</span>
                            <span id="stat-korrekt">${_session_korrekt}</span>
                        </span>
                        <span class="nt-stat nt-stat--uebersprungen">
                            <span class="material-symbols-outlined">skip_next</span>
                            <span id="stat-skip">${_session_skip}</span>
                        </span>
                    </div>
                </div>

                <!-- Tipp-Box: Text anzeigen, hier wird getippt -->
                <div class="nt-tipp-box" id="tipp-box">
                    <!-- Badge-Zeile: Themenfeld + Satz-Fortschritt -->
                    <div class="nt-tipp-badges">
                        ${_satz.themenfeld_titel
                            ? `<span class="nt-themenfeld-badge">${esc(_satz.themenfeld_titel)}</span>`
                            : '<span></span>'
                        }
                        ${mehrSaetze
                            ? `<span class="nt-satz-zaehler" id="satz-zaehler">
                                   ${_satz_index + 1}&thinsp;/&thinsp;${_saetze.length}
                               </span>`
                            : ''
                        }
                    </div>

                    <!-- Aktueller Satz (zeichenweise gefärbt) -->
                    <div class="nt-satz-anzeige" id="satz-anzeige" aria-live="polite">
                        ${_satz_anzeige_html()}
                    </div>

                    <!-- Nächster Satz Vorschau -->
                    <div class="nt-naechster-satz" id="naechster-satz">
                        ${_naechster_satz_vorschau_html()}
                    </div>

                    <!-- Versteckte Eingabe (fängt Tastatureingaben ab) -->
                    <input type="text" class="nt-versteckte-eingabe" id="nt-eingabe"
                        autocomplete="off" autocorrect="off"
                        autocapitalize="none" spellcheck="false"
                        aria-label="${t('nachtippen.titel')}">
                </div>

                <!-- Fortschrittsbalken (über gesamten Text) -->
                <div class="nt-fortschritt-wrapper">
                    <div class="nt-fortschritt-bar">
                        <div class="nt-fortschritt-fill" id="fortschritt-fill" style="width:0%"></div>
                    </div>
                </div>

                <!-- Aktionen -->
                <div class="nt-aktionen">
                    <button class="btn btn--text" id="btn-ueberspringen">
                        <span class="material-symbols-outlined" style="font-size:18px">skip_next</span>
                        ${t('nachtippen.ueberspringen')}
                    </button>
                </div>

            </div>
        </div>
    `;

    _uebung_events_binden();

    requestAnimationFrame(() => {
        _container.querySelector('#nt-eingabe')?.focus();
    });
}

// ---- Zeichen-für-Zeichen Anzeige ----

function _satz_anzeige_html() {
    const text = _aktueller_satz_text();
    return text.split('').map((zeichen, i) => {
        let klasse;
        if (i < _korrekt)        klasse = 'nt-char--korrekt';
        else if (i === _korrekt) klasse = _blockiert ? 'nt-char--falsch' : 'nt-char--cursor';
        else                     klasse = 'nt-char--offen';

        if (zeichen === '\n') {
            return `<span class="nt-char ${klasse} nt-char--nl">↵</span><br>`;
        }
        return `<span class="nt-char ${klasse}">${_zeichen_esc(zeichen)}</span>`;
    }).join('');
}

function _naechster_satz_vorschau_html() {
    const naechster = _naechster_satz_text();
    if (!naechster) return '';

    const woerter    = naechster.trim().split(/\s+/);
    const vorschau   = woerter.slice(0, 5);
    const anzahl     = vorschau.length;
    // Opacity: 0.60 → 0.20 gleichmäßig über die Wörter
    const html = vorschau.map((w, i) => {
        const op = anzahl > 1
            ? (0.60 - (i / (anzahl - 1)) * 0.40).toFixed(2)
            : '0.60';
        return `<span style="opacity:${op}">${esc(w)}</span>`;
    }).join(' ');

    return html + '<span style="opacity:0.12"> …</span>';
}

function _zeichen_esc(z) {
    if (z === ' ') return '&nbsp;';
    if (z === '<') return '&lt;';
    if (z === '>') return '&gt;';
    if (z === '&') return '&amp;';
    return z;
}

// ---- Anzeige aktualisieren ----

function _anzeige_aktualisieren() {
    const anzeige = _container?.querySelector('#satz-anzeige');
    if (anzeige) anzeige.innerHTML = _satz_anzeige_html();

    const vorschau = _container?.querySelector('#naechster-satz');
    if (vorschau) vorschau.innerHTML = _naechster_satz_vorschau_html();

    const zaehler = _container?.querySelector('#satz-zaehler');
    if (zaehler) zaehler.innerHTML = `${_satz_index + 1}&thinsp;/&thinsp;${_saetze.length}`;

    // Fortschrittsbalken über gesamten Text
    const fill = _container?.querySelector('#fortschritt-fill');
    if (fill) {
        const gesamt = _saetze.reduce((sum, s) => sum + s.length, 0);
        const fertig = _saetze.slice(0, _satz_index).reduce((sum, s) => sum + s.length, 0) + _korrekt;
        fill.style.width = `${gesamt > 0 ? Math.round(fertig / gesamt * 100) : 0}%`;
    }
}

// ---- Events ----

function _uebung_events_binden() {
    const tippBox = _container.querySelector('#tipp-box');
    const eingabe = _container.querySelector('#nt-eingabe');
    if (!eingabe) return;

    // Klick auf die ganze Tipp-Box fokussiert die versteckte Eingabe
    tippBox?.addEventListener('click', () => eingabe.focus());

    // Fokus-Ring auf der Box anzeigen
    eingabe.addEventListener('focus',  () => tippBox?.classList.add('nt-tipp-box--fokus'));
    eingabe.addEventListener('blur',   () => tippBox?.classList.remove('nt-tipp-box--fokus'));

    // Tastatureingabe abfangen
    eingabe.addEventListener('keydown', e => {
        // System-Shortcuts (Strg/Cmd) durchlassen
        if (e.ctrlKey || e.metaKey) return;

        if (e.key === 'Backspace') {
            e.preventDefault();
            if (_blockiert) {
                _blockiert = false;
            } else if (_korrekt > 0) {
                _korrekt--;
            }
            _anzeige_aktualisieren();
            return;
        }

        const text = _aktueller_satz_text();
        const erwartet = text[_korrekt] ?? '';

        // Enter oder Space gelten als Eingabe für Zeilenumbrüche
        let zeichenEingabe;
        if (e.key === 'Enter') {
            if (erwartet === '\n') {
                e.preventDefault();
                zeichenEingabe = '\n';
            } else {
                return; // Enter ignorieren wenn kein \n erwartet
            }
        } else if (e.key === ' ' && erwartet === '\n') {
            // Space als Alternative zu Enter für Zeilenumbrüche
            e.preventDefault();
            zeichenEingabe = '\n';
        } else if (e.key.length !== 1 || e.altKey) {
            return; // Sondertasten ignorieren
        } else {
            e.preventDefault();
            zeichenEingabe = e.key;
        }

        if (_korrekt >= text.length) return;

        const korrektesZeichen = zeichenEingabe === erwartet;

        if (_blockiert) {
            // Nur die richtige Taste entsperrt und macht weiter
            if (!korrektesZeichen) return;
            _blockiert = false;
        }

        if (korrektesZeichen) {
            _korrekt++;
            if (_korrekt === text.length) {
                _satz_fertig();
                return;
            }
        } else {
            _blockiert = true;
        }

        _anzeige_aktualisieren();
    });

    // input-Event verhindert, dass Browser-Autokorrekturen den Value verändern
    eingabe.addEventListener('input', () => {
        eingabe.value = '';
    });

    _container.querySelector('#btn-ueberspringen')?.addEventListener('click', () => _ueberspringen());
    _container.querySelector('#btn-beenden')?.addEventListener('click', () => _start_rendern());
}

// ---- Satz / Text Abschluss ----

function _satz_fertig() {
    if (_satz_index < _saetze.length - 1) {
        // Nächster Satz im selben Text
        _satz_index++;
        _korrekt   = 0;
        _blockiert = false;
        _anzeige_aktualisieren();
    } else {
        // Letzter Satz: gesamter Text abgetippt
        _text_abgeschlossen();
    }
}

async function _text_abgeschlossen() {
    _session_korrekt++;

    const box = _container?.querySelector('#tipp-box');
    if (box) {
        const overlay = document.createElement('div');
        overlay.className = 'nt-erfolg-overlay';
        overlay.innerHTML = '<span class="material-symbols-outlined nt-erfolg-icon">check_circle</span>';
        box.appendChild(overlay);
    }

    const statEl = _container?.querySelector('#stat-korrekt');
    if (statEl) statEl.textContent = _session_korrekt;

    await new Promise(r => setTimeout(r, 700));
    await _naechsten_text_laden();
}

function _ueberspringen() {
    _session_skip++;
    const statEl = _container?.querySelector('#stat-skip');
    if (statEl) statEl.textContent = _session_skip;

    _naechsten_text_laden();
}

// ---- Hilfsfunktionen ----

function _text_in_saetze_teilen(text) {
    // Splittet auf ., ! oder ? — behält das Satzzeichen beim vorherigen Satz.
    // Führende Leerzeichen/Newlines (durch vorangehendes Satzzeichen) werden entfernt,
    // interne Newlines bleiben erhalten (werden als ↵ angezeigt und müssen getippt werden).
    const teile = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
    return teile
        .map(s => s.replace(/^[\s\n]+/, ''))   // nur FÜHRENDE Whitespace/Newlines entfernen
        .filter(s => s.length > 0);
}

function _aktueller_satz_text() {
    return _saetze[_satz_index] ?? '';
}

function _naechster_satz_text() {
    return _saetze[_satz_index + 1] ?? null;
}

function _api_params() {
    return {
        themenfeld_ids: [..._aktive_tf_ids].join(','),
        include_ohne:   _include_ohne ? 1 : 0,
    };
}

// ============================================================
// CLEANUP
// ============================================================

export function aufraeumen() {
    _container       = null;
    _themenfelder    = [];
    _aktive_tf_ids.clear();
    _include_ohne    = true;
    _satz            = null;
    _saetze          = [];
    _satz_index      = 0;
    _korrekt         = 0;
    _blockiert       = false;
    _session_korrekt = 0;
    _session_skip    = 0;
    _laedt           = false;
}
