/**
 * Präpositionen-Modul — Lernmodul
 *
 * 3 Screens: Auswahl → Spiel-Schleife → Zusammenfassung
 * Modul I: Chunk-Training (Lückentext + 4 Optionen)
 * Modul IV: Kategorisierung (Begriff → Präposition tippen/klicken)
 * Kein SM-2, 2 XP pro richtiger Antwort (50 % des Schnellübens).
 * Vollständig mobilfreundlich (Tap/Klick, kein Drag & Drop).
 */

import { apiPost } from '../api-client.js';
import { esc } from '../hilfs-funktionen.js';
import { apiFehlerAnzeigen } from '../benachrichtigungen.js';
import { lade_anzeige_rendern, lade_anzeige_entfernen } from '../komponenten/lade-anzeige.js';
import { ergebnis_anzeige_erstellen } from '../komponenten/ergebnis-anzeige.js';
import { navigieren } from '../router.js';
import { t } from '../dienste/sprache.js';

// ============================================
// Interner Zustand
// ============================================

let _ansicht = 'auswahl';       // 'auswahl' | 'spiel' | 'zusammenfassung'
let _sitzung_id = null;
let _aufgaben = [];
let _aktueller_index = 0;
let _ergebnisse = [];           // { index, typ, richtig }
let _zusammenfassung = null;

let _einstellungen = {
    typen: ['praep_chunk', 'praep_kategorisierung'],
    anzahl: 10,
};

// ============================================
// Modul-Exports
// ============================================

export async function rendern(params) {
    const inhalt = document.getElementById('inhalt');
    if (!inhalt) return;
    inhalt.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'praepositionen';
    inhalt.appendChild(wrapper);

    if (_ansicht === 'auswahl') {
        _auswahl_rendern(wrapper);
    } else if (_ansicht === 'spiel') {
        _spiel_rendern(wrapper);
    } else if (_ansicht === 'zusammenfassung') {
        _zusammenfassung_rendern(wrapper);
    }
}

export function aufraeumen() {
    _ansicht = 'auswahl';
    _sitzung_id = null;
    _aufgaben = [];
    _aktueller_index = 0;
    _ergebnisse = [];
    _zusammenfassung = null;
    _einstellungen = {
        typen: ['praep_chunk', 'praep_kategorisierung'],
        anzahl: 10,
    };
}

// ============================================
// Screen 1: Auswahl
// ============================================

function _auswahl_rendern(wrapper) {
    wrapper.innerHTML = `
        <div class="lernmodus">
            <div class="verwaltung__kopf">
                <h2 class="verwaltung__titel">${t('praepositionen.titel')}</h2>
            </div>
            <p class="lernmodus__beschreibung">${t('praepositionen.beschreibung')}</p>

            <div class="training__optionen-block">
                <div class="training__option-gruppe">
                    <div class="training__option-label">${t('praepositionen.aufgabentypen')}</div>
                    <div class="praep__typ-chips">
                        <button type="button" class="training__chip ${_einstellungen.typen.includes('praep_chunk') ? 'training__chip--aktiv' : ''}" data-typ="praep_chunk">
                            <span class="material-symbols-outlined">short_text</span>
                            ${t('praepositionen.typ_chunk')}
                        </button>
                        <button type="button" class="training__chip ${_einstellungen.typen.includes('praep_kategorisierung') ? 'training__chip--aktiv' : ''}" data-typ="praep_kategorisierung">
                            <span class="material-symbols-outlined">category</span>
                            ${t('praepositionen.typ_kategorisierung')}
                        </button>
                    </div>
                </div>

                <div class="training__option-gruppe">
                    <div class="training__option-label">${t('praepositionen.anzahl_aufgaben')}</div>
                    <div class="praep__anzahl-chips">
                        ${[5, 10, 15, 20].map(n => `
                            <button type="button" class="training__chip ${_einstellungen.anzahl === n ? 'training__chip--aktiv' : ''}" data-anzahl="${n}">
                                ${n}
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>

            <button type="button" id="praep-starten-btn" class="btn btn--gefuellt praep__starten-btn">
                <span class="material-symbols-outlined">play_arrow</span>
                ${t('praepositionen.starten')}
            </button>
        </div>
    `;

    // Typ-Chips
    wrapper.querySelectorAll('.praep__typ-chips .training__chip').forEach(btn => {
        btn.addEventListener('click', () => {
            const typ = btn.dataset.typ;
            if (_einstellungen.typen.includes(typ)) {
                if (_einstellungen.typen.length <= 1) return; // mindestens 1
                _einstellungen.typen = _einstellungen.typen.filter(t => t !== typ);
            } else {
                _einstellungen.typen = [..._einstellungen.typen, typ];
            }
            btn.classList.toggle('training__chip--aktiv', _einstellungen.typen.includes(typ));
        });
    });

    // Anzahl-Chips
    wrapper.querySelectorAll('.praep__anzahl-chips .training__chip').forEach(btn => {
        btn.addEventListener('click', () => {
            _einstellungen.anzahl = parseInt(btn.dataset.anzahl);
            wrapper.querySelectorAll('.praep__anzahl-chips .training__chip').forEach(b =>
                b.classList.toggle('training__chip--aktiv', b.dataset.anzahl == _einstellungen.anzahl)
            );
        });
    });

    // Starten
    wrapper.querySelector('#praep-starten-btn')?.addEventListener('click', () => _spiel_starten(wrapper));
}

// ============================================
// Session starten
// ============================================

async function _spiel_starten(wrapper) {
    lade_anzeige_rendern(wrapper);

    const res = await apiPost('praepositionen/starten.php', {
        anzahl: _einstellungen.anzahl,
        typen: _einstellungen.typen,
    });

    lade_anzeige_entfernen(wrapper);

    if (!res.erfolg) {
        apiFehlerAnzeigen(res);
        return;
    }

    _sitzung_id = res.daten.sitzung_id;
    _aufgaben   = res.daten.fragen ?? [];
    _aktueller_index = 0;
    _ergebnisse = [];

    if (_aufgaben.length === 0) {
        wrapper.innerHTML = `<p class="praep__fehler">${t('praepositionen.keine_aufgaben')}</p>`;
        return;
    }

    _ansicht = 'spiel';
    _spiel_rendern(wrapper);
}

// ============================================
// Screen 2: Spiel-Schleife
// ============================================

function _spiel_rendern(wrapper) {
    const aufgabe = _aufgaben[_aktueller_index];
    const fortschritt = Math.round((_aktueller_index / _aufgaben.length) * 100);

    wrapper.innerHTML = `
        <div class="praepositionen__spiel">
            <div class="praep__fortschritt-leiste">
                <div class="praep__fortschritt-balken" style="width:${fortschritt}%"></div>
            </div>
            <div class="praep__zaehler">${_aktueller_index + 1} / ${_aufgaben.length}</div>
            <div id="praep-frage-container" class="praep__frage-container"></div>
            <button type="button" id="praep-beenden-btn" class="btn btn--text praep__beenden-btn">
                ${t('praepositionen.beenden')}
            </button>
        </div>
    `;

    wrapper.querySelector('#praep-beenden-btn')?.addEventListener('click', () => _sitzung_beenden(wrapper));

    _frage_rendern(wrapper, aufgabe);
}

function _frage_rendern(wrapper, aufgabe) {
    const container = document.getElementById('praep-frage-container');
    if (!container) return;

    if (aufgabe.typ === 'praep_chunk') {
        _chunk_rendern(container, aufgabe, wrapper);
    } else {
        _kategorisierung_rendern(container, aufgabe, wrapper);
    }
}

// ---- Chunk-Rendering ----

function _chunk_rendern(container, aufgabe, wrapper) {
    // Satz mit Lücke: ___ als blauer Unterstrich
    const satz_html = esc(aufgabe.satz).replace('___', '<span class="praep__luecke">___</span>');

    container.innerHTML = `
        <div class="praep__chunk">
            <div class="praep__satz">${satz_html}</div>
            <button type="button" class="btn btn--text praep__uebersetzung-toggle">
                <span class="material-symbols-outlined">translate</span>
                ${t('praepositionen.uebersetzung_einblenden')}
            </button>
            <div class="praep__uebersetzung" style="display:none">${esc(aufgabe.uebersetzung)}</div>
            <div class="praep__optionen" id="praep-optionen"></div>
            <div class="praep__feedback" id="praep-feedback" style="display:none"></div>
            <button type="button" id="praep-naechste" class="btn btn--gefuellt praep__naechste" style="display:none">
                ${_aktueller_index + 1 < _aufgaben.length ? t('praepositionen.naechste') : t('praepositionen.auswertung')}
            </button>
        </div>
    `;

    container.querySelector('.praep__uebersetzung-toggle')?.addEventListener('click', () => {
        const el = container.querySelector('.praep__uebersetzung');
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
    });

    _optionen_rendern(container, aufgabe, wrapper);
}

// ---- Kategorisierungs-Rendering ----

function _kategorisierung_rendern(container, aufgabe, wrapper) {
    container.innerHTML = `
        <div class="praep__kategorisierung">
            <div class="praep__kategorie-badge">${t('praepositionen.kategorie_frage')}</div>
            <div class="praep__begriff">${esc(aufgabe.schwedisch)}</div>
            ${aufgabe.deutsch ? `
                <button type="button" class="btn btn--text praep__uebersetzung-toggle">
                    <span class="material-symbols-outlined">translate</span>
                    ${t('praepositionen.uebersetzung_einblenden')}
                </button>
                <div class="praep__uebersetzung" style="display:none">${esc(aufgabe.deutsch)}</div>
            ` : ''}
            <div class="praep__optionen" id="praep-optionen"></div>
            <div class="praep__feedback" id="praep-feedback" style="display:none"></div>
            <div class="praep__merksatz-bereich" id="praep-merksatz" style="display:none">
                <span class="material-symbols-outlined">lightbulb</span>
                <span>${esc(aufgabe.merksatz)}</span>
            </div>
            <button type="button" id="praep-naechste" class="btn btn--gefuellt praep__naechste" style="display:none">
                ${_aktueller_index + 1 < _aufgaben.length ? t('praepositionen.naechste') : t('praepositionen.auswertung')}
            </button>
        </div>
    `;

    container.querySelector('.praep__uebersetzung-toggle')?.addEventListener('click', () => {
        const el = container.querySelector('.praep__uebersetzung');
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
    });

    _optionen_rendern(container, aufgabe, wrapper);
}

// ---- Optionen (4 Buttons) ----

function _optionen_rendern(container, aufgabe, wrapper) {
    const optionenDiv = document.getElementById('praep-optionen');
    if (!optionenDiv) return;

    aufgabe.optionen.forEach(option => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn--tonal praep__option-btn';
        btn.textContent = option;
        btn.addEventListener('click', () => _option_auswaehlen(container, aufgabe, option, wrapper));
        optionenDiv.appendChild(btn);
    });
}

// ---- Antwort auswählen ----

function _option_auswaehlen(container, aufgabe, gewaehlte_option, wrapper) {
    // Alle Buttons sperren
    container.querySelectorAll('.praep__option-btn').forEach(b => {
        b.disabled = true;
    });

    const richtig = gewaehlte_option === aufgabe.loesung;
    _ergebnisse.push({ index: _aktueller_index, typ: aufgabe.typ, richtig });

    // Buttons einfärben
    container.querySelectorAll('.praep__option-btn').forEach(b => {
        if (b.textContent.trim() === aufgabe.loesung) {
            b.style.backgroundColor = 'var(--md-sys-color-primary-container)';
            b.style.color = 'var(--md-sys-color-on-primary-container)';
            b.style.fontWeight = 'bold';
        } else if (b.textContent.trim() === gewaehlte_option && !richtig) {
            b.style.backgroundColor = 'var(--md-sys-color-error-container)';
            b.style.color = 'var(--md-sys-color-on-error-container)';
        }
    });

    // Satz mit Lösung für Chunk
    if (aufgabe.typ === 'praep_chunk') {
        const satzEl = container.querySelector('.praep__satz');
        if (satzEl) {
            satzEl.innerHTML = esc(aufgabe.satz).replace(
                '___',
                `<strong style="color:var(--md-sys-color-primary)">${esc(aufgabe.loesung)}</strong>`
            );
        }
    }

    // Merksatz für Kategorisierung einblenden
    const merksatzEl = document.getElementById('praep-merksatz');
    if (merksatzEl) {
        merksatzEl.style.display = 'flex';
    }

    // Feedback
    const feedback = document.getElementById('praep-feedback');
    if (feedback) {
        feedback.style.display = 'block';
        feedback.innerHTML = richtig
            ? `<span class="praep__feedback--richtig"><span class="material-symbols-outlined">check_circle</span> ${t('praepositionen.richtig')}</span>`
            : `<span class="praep__feedback--falsch"><span class="material-symbols-outlined">cancel</span> ${t('praepositionen.falsch')} — ${t('praepositionen.korrekt')}: <strong>${esc(aufgabe.loesung)}</strong></span>`;
    }

    // Nächste-Button einblenden
    const naechsteBtn = document.getElementById('praep-naechste');
    if (naechsteBtn) {
        naechsteBtn.style.display = 'inline-flex';
        naechsteBtn.addEventListener('click', () => _naechste_frage(wrapper));
    }
}

// ---- Nächste Frage ----

function _naechste_frage(wrapper) {
    _aktueller_index++;
    if (_aktueller_index < _aufgaben.length) {
        _spiel_rendern(wrapper);
    } else {
        _sitzung_beenden(wrapper);
    }
}

// ============================================
// Session beenden
// ============================================

async function _sitzung_beenden(wrapper) {
    _ansicht = 'zusammenfassung';

    const anzahl_richtig = _ergebnisse.filter(e => e.richtig).length;
    const gesamt = _aufgaben.length;

    lade_anzeige_rendern(wrapper);

    const res = await apiPost('praepositionen/beenden.php', {
        sitzung_id: _sitzung_id,
        anzahl_richtig,
        gesamt,
    });

    lade_anzeige_entfernen(wrapper);

    if (res.erfolg) {
        _zusammenfassung = res.daten.zusammenfassung;
    }

    _zusammenfassung_rendern(wrapper);
}

// ============================================
// Screen 3: Zusammenfassung
// ============================================

function _zusammenfassung_rendern(wrapper) {
    const richtig = _ergebnisse.filter(e => e.richtig).length;
    const gesamt  = _ergebnisse.length || _aufgaben.length;
    const genauigkeit = gesamt > 0 ? Math.round((richtig / gesamt) * 100) : 0;
    const xp = _zusammenfassung?.xp_verdient ?? richtig * 2;

    wrapper.innerHTML = `
        <div class="praepositionen__zusammenfassung lernmodus">
            <div class="verwaltung__kopf">
                <h2 class="verwaltung__titel">${t('praepositionen.zusammenfassung_titel')}</h2>
            </div>

            <div class="praep__ergebnis-kreis">
                <div class="praep__ergebnis-zahl">${richtig}/${gesamt}</div>
                <div class="praep__ergebnis-label">${t('praepositionen.richtig_label')}</div>
            </div>

            <div class="praep__ergebnis-stats">
                <div class="praep__stat">
                    <span class="material-symbols-outlined">percent</span>
                    <span>${genauigkeit} %</span>
                </div>
                <div class="praep__stat">
                    <span class="material-symbols-outlined">star</span>
                    <span>+${xp} XP</span>
                </div>
                ${_zusammenfassung?.streak_tage ? `
                    <div class="praep__stat">
                        <span class="material-symbols-outlined">local_fire_department</span>
                        <span>${_zusammenfassung.streak_tage} ${t('praepositionen.streak_tage')}</span>
                    </div>
                ` : ''}
            </div>

            <div class="praep__zusammenfassung-aktionen">
                <button type="button" class="btn btn--gefuellt" id="praep-nochmal">
                    <span class="material-symbols-outlined">replay</span>
                    ${t('praepositionen.nochmal')}
                </button>
                <button type="button" class="btn btn--tonal" id="praep-zum-dashboard">
                    <span class="material-symbols-outlined">home</span>
                    ${t('praepositionen.zum_dashboard')}
                </button>
            </div>

            ${_ergebnisse.length > 0 ? `
                <div class="praep__ergebnis-liste">
                    <h3>${t('praepositionen.ergebnis_details')}</h3>
                    ${_ergebnisse.map((e, i) => {
                        const aufgabe = _aufgaben[e.index];
                        const label = aufgabe?.typ === 'praep_chunk'
                            ? esc(aufgabe?.satz ?? '')
                            : esc(aufgabe?.schwedisch ?? '');
                        return `
                            <div class="praep__ergebnis-zeile praep__ergebnis-zeile--${e.richtig ? 'richtig' : 'falsch'}">
                                <span class="material-symbols-outlined">${e.richtig ? 'check' : 'close'}</span>
                                <span class="praep__ergebnis-frage">${label}</span>
                                <span class="praep__ergebnis-antwort">${esc(aufgabe?.loesung ?? '')}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            ` : ''}
        </div>
    `;

    wrapper.querySelector('#praep-nochmal')?.addEventListener('click', () => {
        _ergebnisse = [];
        _aktueller_index = 0;
        _aufgaben = [];
        _sitzung_id = null;
        _zusammenfassung = null;
        _ansicht = 'auswahl';
        _auswahl_rendern(wrapper);
    });

    wrapper.querySelector('#praep-zum-dashboard')?.addEventListener('click', () => {
        navigieren('/dashboard');
    });
}
