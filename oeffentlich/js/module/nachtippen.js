/**
 * Nachtippen — Tipp-Übungsmodus
 *
 * Start-Screen: Themenfeld-Auswahl + Optionen
 * Übungs-Screen: Satz anzeigen, Zeichen-für-Zeichen Tipp-Prüfung
 *
 * Route: /nachtippen
 */

import { apiGet } from '../api-client.js';
import { esc } from '../hilfs-funktionen.js';
import { t } from '../dienste/sprache.js';
import { lade_anzeige_rendern } from '../komponenten/lade-anzeige.js';
import { apiFehlerAnzeigen } from '../benachrichtigungen.js';

// ---- State ----
let _themenfelder    = [];
let _aktive_tf_ids   = new Set();  // leere Set = alle
let _include_ohne    = true;
let _pool_groesse    = 0;

// Übungs-State
let _satz            = null;    // { id, text, themenfeld_titel }
let _korrekt         = 0;       // korrekt getippte Zeichen
let _blockiert       = false;   // falsches Zeichen getippt
let _session_korrekt = 0;       // Sätze diese Session
let _session_skip    = 0;       // Übersprungen
let _laedt           = false;

export async function rendern(params = {}) {
    const container = document.getElementById('inhalt');
    if (!container) return;

    // State zurücksetzen
    _satz            = null;
    _korrekt         = 0;
    _blockiert       = false;
    _session_korrekt = 0;
    _session_skip    = 0;
    _aktive_tf_ids   = new Set();
    _include_ohne    = true;

    lade_anzeige_rendern(container);

    const tfErg = await apiGet('themenfelder/liste.php', { pro_seite: 500 });
    _themenfelder = tfErg.erfolg ? (tfErg.daten?.eintraege || []) : [];

    _start_rendern(container);
}

// ============================================================
// START-SCREEN
// ============================================================

function _start_rendern(container) {
    const alleAktiv = _aktive_tf_ids.size === 0;

    container.innerHTML = `
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

    _start_events_binden(container);
    _pool_info_laden(container);
}

function _start_events_binden(container) {
    // Alle Themenfelder
    container.querySelector('[data-tf-alle]')?.addEventListener('click', () => {
        _aktive_tf_ids.clear();
        _start_chips_aktualisieren(container);
        _pool_info_laden(container);
    });

    // Einzelne Themenfelder
    container.querySelectorAll('[data-tf-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tid = parseInt(btn.dataset.tfId, 10);
            if (_aktive_tf_ids.has(tid)) {
                _aktive_tf_ids.delete(tid);
            } else {
                _aktive_tf_ids.add(tid);
            }
            _start_chips_aktualisieren(container);
            _pool_info_laden(container);
        });
    });

    // Include-ohne Checkbox
    container.querySelector('#chk-include-ohne')?.addEventListener('change', e => {
        _include_ohne = e.target.checked;
        _pool_info_laden(container);
    });

    // Starten
    container.querySelector('#btn-starten')?.addEventListener('click', () => {
        _uebung_starten(container);
    });
}

function _start_chips_aktualisieren(container) {
    const alleAktiv = _aktive_tf_ids.size === 0;
    container.querySelector('[data-tf-alle]')?.classList.toggle('nt-tf-chip--aktiv', alleAktiv);
    container.querySelectorAll('[data-tf-id]').forEach(btn => {
        const tid = parseInt(btn.dataset.tfId, 10);
        btn.classList.toggle('nt-tf-chip--aktiv', _aktive_tf_ids.has(tid));
    });
}

async function _pool_info_laden(container) {
    const params = _api_params();
    const erg = await apiGet('tipp_saetze/zufaellig.php', params);
    const info = container.querySelector('#pool-info');
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

async function _uebung_starten(container) {
    if (_pool_groesse === 0) {
        // Noch einmal prüfen
        await _pool_info_laden(container);
        if (_pool_groesse === 0) return;
    }

    _korrekt   = 0;
    _blockiert = false;

    lade_anzeige_rendern(container);
    await _naechsten_satz_laden(container, true);
}

async function _naechsten_satz_laden(container, erster = false) {
    if (_laedt) return;
    _laedt = true;

    const letzteId = erster ? 0 : (_satz?.id ?? 0);
    const erg = await apiGet('tipp_saetze/zufaellig.php', {
        ..._api_params(),
        exclude_id: letzteId,
    });

    _laedt = false;

    if (!erg.erfolg) {
        apiFehlerAnzeigen(erg);
        _start_rendern(container);
        return;
    }

    _satz      = erg.daten.satz;
    _korrekt   = 0;
    _blockiert = false;

    _uebung_rendern(container);
}

function _uebung_rendern(container) {
    container.innerHTML = `
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

                <!-- Satz-Box -->
                <div class="nt-satz-box" id="satz-box">
                    ${_satz.themenfeld_titel
                        ? `<span class="nt-themenfeld-badge">${esc(_satz.themenfeld_titel)}</span>`
                        : ''
                    }
                    <div class="nt-satz-anzeige" id="satz-anzeige" aria-live="polite">
                        ${_satz_anzeige_html(0, false)}
                    </div>
                    <div class="nt-fortschritt-wrapper">
                        <div class="nt-fortschritt-bar">
                            <div class="nt-fortschritt-fill" id="fortschritt-fill" style="width:0%"></div>
                        </div>
                    </div>
                </div>

                <!-- Eingabe -->
                <div class="nt-eingabe-bereich">
                    <input type="text"
                        class="nt-eingabe-feld" id="nt-eingabe"
                        autocomplete="off" autocorrect="off"
                        autocapitalize="off" spellcheck="false"
                        placeholder="${t('nachtippen.eingabe_placeholder')}">
                    <div class="nt-eingabe-aktionen">
                        <button class="btn btn--text" id="btn-ueberspringen">
                            <span class="material-symbols-outlined" style="font-size:18px">skip_next</span>
                            ${t('nachtippen.ueberspringen')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    _uebung_events_binden(container);

    // Auto-Fokus
    requestAnimationFrame(() => {
        container.querySelector('#nt-eingabe')?.focus();
    });
}

function _satz_anzeige_html(korrekt, blockiert, eingabe_wert = '') {
    const text = _satz?.text ?? '';
    return text.split('').map((zeichen, i) => {
        if (i < korrekt) {
            return `<span class="nt-char nt-char--korrekt">${_zeichen_esc(zeichen)}</span>`;
        }
        if (i === korrekt) {
            if (blockiert) {
                // Falsch getipptes Zeichen anzeigen
                const falsch = eingabe_wert[korrekt] ?? '';
                return `<span class="nt-char nt-char--falsch">${_zeichen_esc(falsch || zeichen)}</span>`;
            }
            return `<span class="nt-char nt-char--naechst">${_zeichen_esc(zeichen)}</span>`;
        }
        return `<span class="nt-char nt-char--offen">${_zeichen_esc(zeichen)}</span>`;
    }).join('');
}

function _zeichen_esc(z) {
    if (z === ' ') return '&nbsp;';
    if (z === '<') return '&lt;';
    if (z === '>') return '&gt;';
    if (z === '&') return '&amp;';
    return z;
}

function _uebung_events_binden(container) {
    const eingabe = container.querySelector('#nt-eingabe');
    if (!eingabe) return;

    // Backspace / Blockierung
    eingabe.addEventListener('keydown', e => {
        // Meta-/Control-Shortcuts erlauben (z.B. Ctrl+A, Ctrl+C)
        if (e.ctrlKey || e.metaKey) return;
        // Backspace immer erlauben
        if (e.key === 'Backspace') return;
        // Bei Blockierung: alle anderen Tasten sperren
        if (_blockiert) {
            e.preventDefault();
        }
    });

    // Eingabe verarbeiten
    eingabe.addEventListener('input', () => {
        _eingabe_verarbeiten(container, eingabe);
    });

    // Überspringen
    container.querySelector('#btn-ueberspringen')?.addEventListener('click', () => {
        _ueberspringen(container);
    });

    // Beenden
    container.querySelector('#btn-beenden')?.addEventListener('click', () => {
        _start_rendern(container);
    });
}

function _eingabe_verarbeiten(container, eingabe) {
    const val  = eingabe.value;
    const text = _satz?.text ?? '';

    if (val.length === 0) {
        // Alles gelöscht
        _korrekt   = 0;
        _blockiert = false;
    } else if (val.length <= _korrekt) {
        // Backspace — ggf. Block aufheben
        _korrekt   = val.length;
        _blockiert = false;
    } else if (val.length === _korrekt + 1) {
        // Neues Zeichen
        const neues = val[_korrekt];
        if (neues === text[_korrekt]) {
            _korrekt++;
            _blockiert = false;
        } else {
            _blockiert = true;
        }
    }
    // val.length > _korrekt + 1 kann durch Paste passieren →
    // Input auf Kontrollzustand zurücksetzen
    if (val.length > _korrekt + (_blockiert ? 1 : 0)) {
        eingabe.value = val.slice(0, _korrekt + (_blockiert ? 1 : 0));
    }

    // Anzeige aktualisieren
    const anzeige = container.querySelector('#satz-anzeige');
    if (anzeige) anzeige.innerHTML = _satz_anzeige_html(_korrekt, _blockiert, eingabe.value);

    // Fortschrittsbalken
    const fill = container.querySelector('#fortschritt-fill');
    if (fill) fill.style.width = `${Math.round((_korrekt / text.length) * 100)}%`;

    // Eingabefeld stylen
    eingabe.classList.toggle('nt-eingabe-feld--falsch', _blockiert);

    // Fertig?
    if (_korrekt === text.length && text.length > 0) {
        _satz_abgeschlossen(container, eingabe);
    }
}

async function _satz_abgeschlossen(container, eingabe) {
    _session_korrekt++;

    // Erfolgs-Overlay einblenden
    const box = container.querySelector('#satz-box');
    if (box) {
        const overlay = document.createElement('div');
        overlay.className = 'nt-erfolg-overlay';
        overlay.innerHTML = '<span class="material-symbols-outlined nt-erfolg-icon">check_circle</span>';
        box.appendChild(overlay);
    }

    // Stats aktualisieren
    const statEl = container.querySelector('#stat-korrekt');
    if (statEl) statEl.textContent = _session_korrekt;

    // Eingabe leeren & deaktivieren
    if (eingabe) { eingabe.value = ''; eingabe.disabled = true; }

    // Kurz warten, dann nächster Satz
    await new Promise(r => setTimeout(r, 700));

    await _naechsten_satz_laden(container);
}

function _ueberspringen(container) {
    _session_skip++;
    const statEl = container.querySelector('#stat-skip');
    if (statEl) statEl.textContent = _session_skip;

    _naechsten_satz_laden(container);
}

// ---- Hilfsfunktionen ----

function _api_params() {
    return {
        themenfeld_ids: [..._aktive_tf_ids].join(','),
        include_ohne:   _include_ohne ? 1 : 0,
    };
}

export function aufraeumen() {
    _themenfelder    = [];
    _aktive_tf_ids.clear();
    _include_ohne    = true;
    _satz            = null;
    _korrekt         = 0;
    _blockiert       = false;
    _session_korrekt = 0;
    _session_skip    = 0;
    _laedt           = false;
}
