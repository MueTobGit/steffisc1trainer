/**
 * Dashboard — Startseite nach Login
 *
 * Zeigt die Lernpfad-Timeline mit Favoriten, eigenen Lektionen,
 * aufgegebenen Lektionen (Hausaufgaben) und dem sequenziellen Lernpfad.
 * Maskottchen: saison-abhaengiges Tier-Logo.
 */

import { holen, abonnieren } from '../zustand.js';
import { navigieren } from '../router.js';
import { esc, zahlFormatieren } from '../hilfs-funktionen.js';
import { apiGet } from '../api-client.js';
import { milestones_pruefen, benachrichtigungen_sync, uebungs_erinnerung_setzen, streak_warnung_setzen } from '../dienste/android-benachrichtigungen.js';
import { neue_belohnungen_pruefen } from '../komponenten/neue-belohnung-overlay.js';
import { t } from '../dienste/sprache.js';

// ============================================
// Maskottchen-Logik
// ============================================

/**
 * Saisonbild bestimmen.
 * Saisons werden primaer aus der DB geladen (via konfiguration.maskottchen_saisons im State).
 * Fallback: hardcodierte Standardsaisons (falls Migration noch nicht ausgefuehrt).
 */
const MASKOTTCHEN_STANDARD = 'maskottchen_standard.png';

// Fallback-Saisons (identisch mit den DB-Standardwerten in migration_maskottchen.sql)
const _MASKOTTCHEN_SAISONS_FALLBACK = [
    { von_monat: 6,  von_tag: 21, bis_monat: 7,  bis_tag: 31, bild: 'maskottchen_midsommar.png', bild_dunkel: '', aktiv: true },
    { von_monat: 12, von_tag:  1, bis_monat: 2,  bis_tag: 28, bild: 'maskottchen_midsommar.png', bild_dunkel: '', aktiv: true },
    { von_monat: 9,  von_tag:  1, bis_monat: 11, bis_tag: 30, bild: 'maskottchen_nordlicht.png', bild_dunkel: '', aktiv: true },
    { von_monat: 8,  von_tag: 15, bis_monat: 8,  bis_tag: 31, bild: 'maskottchen_nordlicht.png', bild_dunkel: '', aktiv: true },
];

function _ist_dunkelmodus() {
    const thema = document.documentElement.getAttribute('data-thema');
    if (thema === 'dunkel') return true;
    if (thema === 'hell') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function _maskottchen_bild() {
    const konfig  = holen('konfiguration');
    const saisons = (konfig?.maskottchen_saisons?.length > 0)
        ? konfig.maskottchen_saisons
        : _MASKOTTCHEN_SAISONS_FALLBACK;

    const heute = new Date();
    const m = heute.getMonth() + 1; // 1-12
    const d = heute.getDate();

    const dunkel = _ist_dunkelmodus();

    for (const saison of saisons) {
        if (saison.aktiv === false) continue;
        const vm = saison.von_monat, vd = saison.von_tag;
        const bm = saison.bis_monat, bd = saison.bis_tag;

        // Zeitraum über Jahreswechsel (z.B. Dez–Feb)
        let trifft = false;
        if (vm > bm) {
            trifft = (m > vm || (m === vm && d >= vd)) || (m < bm || (m === bm && d <= bd));
        } else {
            trifft = (m > vm || (m === vm && d >= vd)) && (m < bm || (m === bm && d <= bd));
        }
        if (trifft) {
            return (dunkel && saison.bild_dunkel) ? saison.bild_dunkel : saison.bild;
        }
    }
    return MASKOTTCHEN_STANDARD;
}

function _maskottchen_url() {
    const basis = window.location.pathname.replace(/\/index\.php$/, '').replace(/\/$/, '');
    return `${basis}/oeffentlich/bilder/${_maskottchen_bild()}`;
}

// Aktive Beobachter (werden beim naechsten rendern aufgeraeumt)
let _thema_observer = null;
let _thema_media_handler = null;

function _maskottchen_beobachter_starten(container) {
    // Alte Beobachter aufraeumen
    _maskottchen_beobachter_stoppen();

    const aktualisieren = () => {
        const img = container.querySelector('.dashboard__maskottchen');
        if (!img) return;
        const neues = _maskottchen_url();
        if (img.src !== neues && !img.src.endsWith(neues)) {
            img.src = neues;
        }
    };

    // 1) MutationObserver fuer data-thema Attribut auf <html>
    _thema_observer = new MutationObserver(aktualisieren);
    _thema_observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-thema'],
    });

    // 2) matchMedia-Listener fuer System-Praeferenz (Modus "system")
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    _thema_media_handler = aktualisieren;
    mq.addEventListener('change', _thema_media_handler);
}

function _maskottchen_beobachter_stoppen() {
    if (_thema_observer) {
        _thema_observer.disconnect();
        _thema_observer = null;
    }
    if (_thema_media_handler) {
        window.matchMedia('(prefers-color-scheme: dark)')
            .removeEventListener('change', _thema_media_handler);
        _thema_media_handler = null;
    }
}

// ============================================
// Dashboard rendern
// ============================================

export async function rendern() {
    const container = document.getElementById('inhalt');
    if (!container) return;

    // Benutzer-State sicherstellen (Schutz gegen Race-Condition bei Hard-Reload)
    let benutzer = holen('benutzer');
    if (!benutzer) {
        await new Promise(resolve => {
            const abbestellen = abonnieren('benutzer', (b) => {
                if (b) { abbestellen(); resolve(); }
            });
            // Sicherheits-Timeout nach 2 Sekunden
            setTimeout(() => { abbestellen(); resolve(); }, 2000);
        });
        benutzer = holen('benutzer');
    }

    const statistik = holen('statistik');

    const vorname = benutzer?.vorname || benutzer?.benutzername || t('dashboard.nutzer_fallback');

    // Basis-HTML aufbauen
    container.innerHTML = `
        <div class="dashboard">
            <!-- Begruessung + Maskottchen -->
            <section class="dashboard__begruessung">
                <div class="dashboard__begruessung-text">
                    <h2>${t('dashboard.willkommen', {name: esc(vorname)})}</h2>
                    <p>${t('dashboard.willkommen_text')}</p>
                </div>
                <img class="dashboard__maskottchen"
                     src="${_maskottchen_url()}"
                     alt="${t('dashboard.maskottchen_alt')}"
                     loading="lazy">
            </section>

            <!-- Lernpfad-Timeline -->
            <section id="dashboard-hauptinhalt">
                <div class="lade-platzhalter" style="text-align:center;padding:32px">
                    <span class="material-symbols-outlined" style="font-size:40px;color:var(--md-sys-color-outline)">sync</span>
                </div>
            </section>

            <!-- Vokabel-Statistik (unter Hauptinhalt) -->
            <section id="dashboard-vokabel-stats" class="versteckt"></section>

            <!-- Rechtliches -->
            <footer class="dashboard__rechtliches">
                <a href="#/impressum" class="dashboard__rechtliches-link">${t('anmeldung.impressum_link')}</a>
            </footer>
        </div>
    `;

    // Asynchron Daten laden
    try {
        await _lernpfad_timeline_laden(container, statistik);
        await _vokabel_stats_laden(container);
    } catch (e) {
        console.warn('[Dashboard] Fehler beim Laden:', e);
        const hauptinhalt = container.querySelector('#dashboard-hauptinhalt');
        if (hauptinhalt) hauptinhalt.innerHTML = `<p style="color:var(--md-sys-color-error)">${t('dashboard.lernpfad_fehler')}</p>`;
    }

    // Benachrichtigungskanäle aus DB laden und anwenden (nur Android)
    if (window.Android && statistik) {
        _taeglich_kanaele_laden(statistik);
        setTimeout(() => _milestones_pruefen_aus_db(statistik), 2000);
    }

    // Neue Gruppen-Belohnungen pruefen (bei jedem Dashboard-Besuch)
    setTimeout(() => neue_belohnungen_pruefen(), 1000);

    // Maskottchen bei Theme-Wechsel sofort aktualisieren
    _maskottchen_beobachter_starten(container);
}

// ============================================
// Lernpfad-Timeline
// ============================================

async function _lernpfad_timeline_laden(container, statistik) {
    const hauptinhalt = container.querySelector('#dashboard-hauptinhalt');
    if (!hauptinhalt) return;

    const res = await apiGet('lektionen/lernpfad.php');
    if (!res.erfolg) {
        hauptinhalt.innerHTML = `<p style="color:var(--md-sys-color-error)">${t('dashboard.lernpfad_fehler')}</p>`;
        return;
    }

    const lektionen            = res.daten?.lektionen            || [];
    const schwelleProzent      = res.daten?.konfiguriert_prozent ?? 50;
    const favoritenAnzahl      = res.daten?.favoriten_anzahl      || 0;
    const eigeneLektionen      = res.daten?.eigene_lektionen      || [];
    const aufgegebeneLektionen = res.daten?.aufgegebene_lektionen || [];

    // Aktuelle Lektion: erste nicht-abgeschlossene freigeschaltete offizielle Lektion
    const schwelle = schwelleProzent / 100;
    let aktuelleIdx = lektionen.findIndex(l => l.freigeschaltet && (l.stufe3_anteil || 0) < schwelle);
    if (aktuelleIdx < 0) aktuelleIdx = lektionen.length - 1;

    const aktuelleLektion = lektionen[aktuelleIdx] || null;
    const vergangene      = lektionen.slice(0, aktuelleIdx);
    // Zukünftige: max 8 sichtbar, Rest hinter "Alle anzeigen"-Toggle
    const alleZukuenftige    = lektionen.slice(aktuelleIdx + 1);
    const zukuenftige        = alleZukuenftige.slice(0, 8);
    const weitereZukuenftige = alleZukuenftige.slice(8);

    // Toggle-Zustände
    let privatAusgeklappt  = false;
    let aufgabenAusgeklappt = false;
    let gapAusgeklappt     = false;
    let alleZukuenftigeSichtbar = false;

    // Vergangene Lektionen: Gap-Logik bei >= 4 Eintraegen
    const zeigeGap = vergangene.length >= 4;
    const ersteLektion = zeigeGap ? vergangene[0] : null;
    const verborgene = zeigeGap ? vergangene.slice(1, vergangene.length - 1) : [];
    const letzteVergangene = zeigeGap ? vergangene[vergangene.length - 1] : null;

    hauptinhalt.innerHTML = `
        <h3 class="dashboard__section-titel">
            <span class="material-symbols-outlined" style="vertical-align:middle;font-size:20px;margin-right:6px">route</span>
            ${t('dashboard.lernpfad_titel')}
            <span style="font-size:0.8125rem;font-weight:400;color:var(--md-sys-color-on-surface-variant);margin-left:8px">
                ${t('dashboard.lernpfad_schwelle', {prozent: schwelleProzent})}
            </span>
        </h3>
        <div class="lernpfad-timeline">

            ${favoritenAnzahl > 0 ? _timeline_favoriten(favoritenAnzahl) : ''}

            ${eigeneLektionen.length > 0 ? _timeline_eigene_gruppe(eigeneLektionen) : ''}

            ${aufgegebeneLektionen.length > 0 ? _timeline_aufgaben_gruppe(aufgegebeneLektionen) : ''}

            ${zeigeGap ? `
                ${_timeline_lektion_vergangen(ersteLektion)}
                <div class="lernpfad-knoten lernpfad-knoten--gap" id="lernpfad-gap-toggle" style="cursor:pointer">
                    <div class="lernpfad-knoten__linie"></div>
                    <div class="lernpfad-knoten__kreis lernpfad-knoten__kreis--gap">
                        <span class="material-symbols-outlined" style="font-size:14px">more_horiz</span>
                    </div>
                    <div class="lernpfad-knoten__inhalt">
                        <span class="lernpfad-knoten__titel" style="color:var(--md-sys-color-primary);font-size:0.8125rem">
                            ${t('dashboard.lernpfad_verborgene', {anzahl: verborgene.length})}
                        </span>
                    </div>
                </div>
                <div id="lernpfad-gap-inhalt" class="versteckt">
                    ${verborgene.map(l => _timeline_lektion_vergangen(l)).join('')}
                </div>
                <div id="lernpfad-gap-einklappen" class="versteckt" style="text-align:center;padding:4px 0;margin-bottom:-8px">
                    <button class="btn btn--tonal" style="width:auto;font-size:0.8125rem;min-height:32px;padding:4px 14px" id="btn-gap-einklappen">
                        <span class="material-symbols-outlined" style="font-size:16px">expand_less</span>
                        ${t('dashboard.lernpfad_ausblenden')}
                    </button>
                </div>
                ${_timeline_lektion_vergangen(letzteVergangene)}
            ` : `
                ${vergangene.map(l => _timeline_lektion_vergangen(l)).join('')}
            `}
            ${aktuelleLektion ? `<div id="lernpfad-aktuell-marker">${_timeline_lektion_aktuell(aktuelleLektion)}</div>` : ''}
            ${zukuenftige.map((l, i) => _timeline_lektion_zukunft(l, i)).join('')}

            ${weitereZukuenftige.length > 0 ? `
                <div id="lernpfad-weitere-container" class="versteckt">
                    ${weitereZukuenftige.map((l, i) => _timeline_lektion_zukunft(l, i + 8)).join('')}
                </div>
                <div class="lernpfad-ende" style="text-align:center;padding:12px 0 4px">
                    <button class="btn btn--tonal" id="btn-alle-lektionen-anzeigen"
                        style="width:auto;font-size:0.8125rem;min-height:32px;padding:4px 14px">
                        <span class="material-symbols-outlined" style="font-size:16px">expand_more</span>
                        ${t('dashboard.lernpfad_alle_anzeigen', {anzahl: weitereZukuenftige.length})}
                    </button>
                </div>
            ` : ''}
        </div>
    `;

    // Eigene-Lektionen-Toggle
    const toggleBtn = hauptinhalt.querySelector('#btn-eigene-toggle');
    const eigeneContainer = hauptinhalt.querySelector('#eigene-lektionen-container');
    if (toggleBtn && eigeneContainer) {
        toggleBtn.addEventListener('click', () => {
            privatAusgeklappt = !privatAusgeklappt;
            eigeneContainer.style.display = privatAusgeklappt ? '' : 'none';
            toggleBtn.querySelector('.lernpfad-toggle-pfeil').textContent =
                privatAusgeklappt ? 'expand_less' : 'expand_more';
        });
    }

    // Aufgaben-Toggle
    const aufgabenToggleBtn = hauptinhalt.querySelector('#btn-aufgaben-toggle');
    const aufgabenContainer = hauptinhalt.querySelector('#aufgaben-lektionen-container');
    if (aufgabenToggleBtn && aufgabenContainer) {
        aufgabenToggleBtn.addEventListener('click', () => {
            aufgabenAusgeklappt = !aufgabenAusgeklappt;
            aufgabenContainer.style.display = aufgabenAusgeklappt ? '' : 'none';
            aufgabenToggleBtn.querySelector('.lernpfad-toggle-pfeil').textContent =
                aufgabenAusgeklappt ? 'expand_less' : 'expand_more';
        });
    }

    // Aufgabe entfernen (Mülleimer-Button in aufgeklappter Liste)
    hauptinhalt.querySelectorAll('[data-aufgabe-entfernen]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const lektionId = parseInt(btn.dataset.aufgabeEntfernen, 10);
            if (!lektionId) return;
            const { apiDelete } = await import('../api-client.js');
            const erg = await apiDelete('lektionen/aufgaben.php', { lektion_id: lektionId });
            if (erg.erfolg) {
                await _lernpfad_timeline_laden(container, statistik);
            }
        });
    });

    // "Alle Lektionen anzeigen"-Toggle
    const btnAlleAnzeigen = hauptinhalt.querySelector('#btn-alle-lektionen-anzeigen');
    const weitereContainer = hauptinhalt.querySelector('#lernpfad-weitere-container');
    if (btnAlleAnzeigen && weitereContainer) {
        btnAlleAnzeigen.addEventListener('click', () => {
            alleZukuenftigeSichtbar = !alleZukuenftigeSichtbar;
            weitereContainer.classList.toggle('versteckt', !alleZukuenftigeSichtbar);
            const icon = btnAlleAnzeigen.querySelector('.material-symbols-outlined');
            if (icon) icon.textContent = alleZukuenftigeSichtbar ? 'expand_less' : 'expand_more';
            btnAlleAnzeigen.childNodes[btnAlleAnzeigen.childNodes.length - 1].textContent =
                alleZukuenftigeSichtbar
                    ? ` ${t('dashboard.lernpfad_ausblenden')}`
                    : ` ${t('dashboard.lernpfad_alle_anzeigen', {anzahl: weitereZukuenftige.length})}`;
        });
    }

    // Lernpfad-Gap Toggle
    const gapToggle = hauptinhalt.querySelector('#lernpfad-gap-toggle');
    const gapInhalt = hauptinhalt.querySelector('#lernpfad-gap-inhalt');
    const gapEinklappen = hauptinhalt.querySelector('#lernpfad-gap-einklappen');
    const btnGapEinklappen = hauptinhalt.querySelector('#btn-gap-einklappen');
    const aktuellMarker = hauptinhalt.querySelector('#lernpfad-aktuell-marker');

    const _gap_umschalten = () => {
        gapAusgeklappt = !gapAusgeklappt;
        if (gapAusgeklappt) {
            gapInhalt.classList.remove('versteckt');
            gapEinklappen.classList.remove('versteckt');
            gapToggle.style.display = 'none';
        } else {
            gapInhalt.classList.add('versteckt');
            gapEinklappen.classList.add('versteckt');
            gapToggle.style.display = '';
        }
        if (aktuellMarker) {
            aktuellMarker.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    if (gapToggle) gapToggle.addEventListener('click', _gap_umschalten);
    if (btnGapEinklappen) btnGapEinklappen.addEventListener('click', _gap_umschalten);

    // Alle Aktions-Buttons
    hauptinhalt.querySelectorAll('[data-aktion]').forEach(btn => {
        btn.addEventListener('click', () => {
            const { aktion, lektionId, filter } = btn.dataset;
            // Gemeinsamer Param fuer Training/Lernmodus/Schnellueben: ?lektion=ID oder ?filter=X
            const trainParam  = lektionId ? `?lektion=${lektionId}` : filter ? `?filter=${filter}` : '';
            // Vokabelliste erwartet ?lektion_id=ID; &von=lernpfad → Zurück-Button geht zum Dashboard
            const vokaParam   = lektionId ? `?lektion_id=${lektionId}&von=lernpfad` : filter ? `?filter=${filter}` : '';
            if (aktion === 'training')    navigieren('/training'     + trainParam);
            if (aktion === 'lernmodus')   navigieren('/lernmodus'    + trainParam);
            if (aktion === 'schnell')     navigieren('/schnellueben' + trainParam);
            if (aktion === 'vokabeln')    navigieren('/vokabeln'     + vokaParam);
        });
    });

    // Vergangen-Knoten: Klick auf Knoten klappt Aktions-Buttons auf/zu
    hauptinhalt.querySelectorAll('.lernpfad-knoten--vergangen').forEach(knoten => {
        knoten.addEventListener('click', e => {
            if (e.target.closest('[data-aktion]')) return;
            const aktionen = knoten.querySelector('.lernpfad-knoten__aktionen');
            if (!aktionen) return;
            aktionen.style.display = aktionen.style.display === 'none' ? 'flex' : 'none';
        });
    });

    // Zukunft-Knoten: Klick öffnet "Als Aufgabe hinzufügen"-Dialog
    hauptinhalt.querySelectorAll('.lernpfad-knoten--zukunft[data-lektion-id]').forEach(knoten => {
        knoten.addEventListener('click', () => {
            const lektionId = parseInt(knoten.dataset.lektionId, 10);
            const titel     = knoten.dataset.lektionTitel || '';
            _aufgabe_dialog_zeigen(lektionId, titel, container, statistik);
        });
    });
}

// ============================================
// Aufgaben-Dialog (gesperrte Lektion als Hausaufgabe)
// ============================================

async function _aufgabe_dialog_zeigen(lektionId, titel, container, statistik) {
    const bestehend = document.getElementById('aufgabe-dialog');
    if (bestehend) bestehend.remove();

    const dialog = document.createElement('div');
    dialog.id = 'aufgabe-dialog';
    dialog.style.cssText = `
        position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
        background:rgba(0,0,0,0.4);padding:16px
    `;
    dialog.innerHTML = `
        <div style="background:var(--md-sys-color-surface);border-radius:16px;padding:24px;
                    max-width:360px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,0.3)">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
                <span class="material-symbols-outlined" style="color:var(--md-sys-color-primary);font-size:28px">assignment</span>
                <h3 style="margin:0;font-size:1rem;font-weight:600">${t('dashboard.aufgabe_titel')}</h3>
            </div>
            <p style="margin:0 0 8px;color:var(--md-sys-color-on-surface-variant);font-size:0.875rem">
                ${t('dashboard.aufgabe_text')}
            </p>
            <p style="margin:0 0 20px;font-weight:500;font-size:0.9375rem">${esc(titel)}</p>
            <p style="margin:0 0 20px;color:var(--md-sys-color-on-surface-variant);font-size:0.8125rem">
                ${t('dashboard.aufgabe_hinweis')}
            </p>
            <div style="display:flex;gap:8px;justify-content:flex-end">
                <button id="aufgabe-abbrechen" class="btn btn--text">
                    ${t('allgemein.abbrechen')}
                </button>
                <button id="aufgabe-bestaetigen" class="btn btn--gefuellt">
                    ${t('dashboard.aufgabe_hinzufuegen')}
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);

    dialog.querySelector('#aufgabe-abbrechen').addEventListener('click', () => dialog.remove());
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.remove(); });

    dialog.querySelector('#aufgabe-bestaetigen').addEventListener('click', async () => {
        const btn = dialog.querySelector('#aufgabe-bestaetigen');
        btn.disabled = true;
        btn.textContent = '...';
        const { apiPost } = await import('../api-client.js');
        const erg = await apiPost('lektionen/aufgaben.php', { lektion_id: lektionId });
        dialog.remove();
        if (erg.erfolg) {
            await _lernpfad_timeline_laden(container, statistik);
        }
    });
}

function _timeline_favoriten(anzahl) {
    return `
        <div class="lernpfad-knoten lernpfad-knoten--favorit">
            <div class="lernpfad-knoten__linie"></div>
            <div class="lernpfad-knoten__kreis lernpfad-knoten__kreis--favorit">
                <span class="material-symbols-outlined" style="font-size:14px">star</span>
            </div>
            <div class="lernpfad-knoten__inhalt">
                <span class="lernpfad-knoten__titel">${t('dashboard.favoriten_titel')}</span>
                <span class="lernpfad-knoten__info">${t('dashboard.favoriten_anzahl', {anzahl: anzahl})}</span>
            </div>
            <div class="lernpfad-knoten__aktionen">
                <button class="lernpfad-btn" data-aktion="training"  data-filter="favorit" title="${t('dashboard.favoriten_training')}">
                    <span class="material-symbols-outlined">fitness_center</span>
                </button>
                <button class="lernpfad-btn" data-aktion="lernmodus" data-filter="favorit" title="${t('dashboard.favoriten_lernmodus')}">
                    <span class="material-symbols-outlined">school</span>
                </button>
                <button class="lernpfad-btn" data-aktion="vokabeln"  data-filter="favorit" title="${t('dashboard.favoriten_vokabeln')}">
                    <span class="material-symbols-outlined">list</span>
                </button>
            </div>
        </div>
    `;
}

function _timeline_eigene_gruppe(eigeneLektionen) {
    const gesamtVokabeln = eigeneLektionen.reduce((s, l) => s + l.vokabel_anzahl, 0);
    const einzelItems = eigeneLektionen.map(l => {
        const prozent = Math.round((l.stufe4_anteil || 0) * 100);
        return `
        <div class="lernpfad-knoten lernpfad-knoten--privat" style="padding-left:12px">
            <div class="lernpfad-knoten__linie" style="left:-8px"></div>
            <div class="lernpfad-knoten__kreis lernpfad-knoten__kreis--privat" style="left:-16px;width:14px;height:14px">
                <span class="material-symbols-outlined" style="font-size:10px">lock_open</span>
            </div>
            <div class="lernpfad-knoten__inhalt">
                <span class="lernpfad-knoten__titel">${esc(l.titel)}</span>
                <span class="lernpfad-knoten__info">${t('dashboard.lernpfad_vokabeln', {prozent, anzahl: l.vokabel_anzahl})}</span>
            </div>`;
    }).map((start, i) => {
        const l = eigeneLektionen[i];
        return start + `
            <div class="lernpfad-knoten__aktionen">
                <button class="lernpfad-btn" data-aktion="training"  data-lektion-id="${l.id}" title="${t('dashboard.favoriten_training')}">
                    <span class="material-symbols-outlined">fitness_center</span>
                </button>
                <button class="lernpfad-btn" data-aktion="lernmodus" data-lektion-id="${l.id}" title="${t('dashboard.favoriten_lernmodus')}">
                    <span class="material-symbols-outlined">school</span>
                </button>
                <button class="lernpfad-btn" data-aktion="vokabeln"  data-lektion-id="${l.id}" title="${t('dashboard.karte_vokabeln')}">
                    <span class="material-symbols-outlined">list</span>
                </button>
            </div>
        </div>
    `;
    }).join('');

    return `
        <div class="lernpfad-knoten lernpfad-knoten--eigene">
            <div class="lernpfad-knoten__linie"></div>
            <div class="lernpfad-knoten__kreis lernpfad-knoten__kreis--eigene">
                <span class="material-symbols-outlined" style="font-size:14px">folder</span>
            </div>
            <div class="lernpfad-knoten__inhalt">
                <span class="lernpfad-knoten__titel">${t('dashboard.eigene_titel')}</span>
                <span class="lernpfad-knoten__info">${t('dashboard.eigene_info', {lektionen: eigeneLektionen.length, vokabeln: gesamtVokabeln})}</span>
            </div>
            <button class="lernpfad-btn" id="btn-eigene-toggle" title="${t('dashboard.aufklappen')}">
                <span class="material-symbols-outlined lernpfad-toggle-pfeil">expand_more</span>
            </button>
        </div>
        <div id="eigene-lektionen-container" style="display:none">
            ${einzelItems}
        </div>
    `;
}

function _timeline_lektion_vergangen(l) {
    const prozent = Math.round((l.stufe3_anteil || 0) * 100);
    return `
        <div class="lernpfad-knoten lernpfad-knoten--vergangen" style="cursor:pointer">
            <div class="lernpfad-knoten__linie"></div>
            <div class="lernpfad-knoten__kreis">
                <span class="material-symbols-outlined" style="font-size:16px;color:var(--md-sys-color-tertiary)">check_circle</span>
            </div>
            <div class="lernpfad-knoten__inhalt">
                <span class="lernpfad-knoten__titel">${esc(l.titel)}</span>
                <span class="lernpfad-knoten__kategorie">${esc(l.kategorie_name || '')}</span>
                <span class="lernpfad-knoten__info">${t('dashboard.lernpfad_vokabeln', {prozent, anzahl: l.vokabel_anzahl})}</span>
            </div>
            <div class="lernpfad-knoten__aktionen" style="display:none">
                <button class="lernpfad-btn" data-aktion="training"  data-lektion-id="${l.id}" title="${t('dashboard.favoriten_training')}">
                    <span class="material-symbols-outlined">fitness_center</span>
                </button>
                <button class="lernpfad-btn" data-aktion="lernmodus" data-lektion-id="${l.id}" title="${t('dashboard.favoriten_lernmodus')}">
                    <span class="material-symbols-outlined">school</span>
                </button>
                <button class="lernpfad-btn" data-aktion="schnell"   data-lektion-id="${l.id}" title="${t('dashboard.schnellueben_title')}">
                    <span class="material-symbols-outlined">bolt</span>
                </button>
                <button class="lernpfad-btn" data-aktion="vokabeln"  data-lektion-id="${l.id}" title="${t('dashboard.karte_vokabeln')}">
                    <span class="material-symbols-outlined">list</span>
                </button>
            </div>
        </div>
    `;
}

function _timeline_lektion_aktuell(l) {
    return `
        <div class="lernpfad-knoten lernpfad-knoten--aktuell">
            <div class="lernpfad-knoten__linie"></div>
            <div class="lernpfad-knoten__kreis lernpfad-knoten__kreis--aktuell">
                <span class="material-symbols-outlined" style="font-size:20px">star</span>
            </div>
            <div class="lernpfad-knoten__inhalt">
                <span class="lernpfad-knoten__titel">${esc(l.titel)}</span>
                <span class="lernpfad-knoten__kategorie">${esc(l.kategorie_name || '')}</span>
                <span class="lernpfad-knoten__info">${t('dashboard.lernpfad_vokabeln', {prozent: Math.round((l.stufe3_anteil || 0) * 100), anzahl: l.vokabel_anzahl})}</span>
            </div>
            <div class="lernpfad-knoten__aktionen">
                <button class="lernpfad-btn" data-aktion="training"  data-lektion-id="${l.id}" title="${t('dashboard.favoriten_training')}">
                    <span class="material-symbols-outlined">fitness_center</span>
                </button>
                <button class="lernpfad-btn" data-aktion="lernmodus" data-lektion-id="${l.id}" title="${t('dashboard.favoriten_lernmodus')}">
                    <span class="material-symbols-outlined">school</span>
                </button>
                <button class="lernpfad-btn" data-aktion="schnell"   data-lektion-id="${l.id}" title="${t('dashboard.schnellueben_title')}">
                    <span class="material-symbols-outlined">bolt</span>
                </button>
                <button class="lernpfad-btn" data-aktion="vokabeln"  data-lektion-id="${l.id}" title="${t('dashboard.karte_vokabeln')}">
                    <span class="material-symbols-outlined">list</span>
                </button>
            </div>
        </div>
    `;
}

function _timeline_lektion_zukunft(l, index) {
    // +1 bis +5: ausgegraut. +6: 50% transparent. +7+: fast unsichtbar
    const undurchsichtig = index >= 6 ? Math.max(0, 1 - (index - 5) * 0.5) : index >= 5 ? 0.5 : 1;
    const gesperrt = !l.freigeschaltet;

    return `
        <div class="lernpfad-knoten lernpfad-knoten--zukunft"
             style="opacity:${undurchsichtig};cursor:pointer"
             data-lektion-id="${l.id}"
             data-lektion-titel="${esc(l.titel)}"
             title="${t('dashboard.aufgabe_klick_hinweis')}">
            <div class="lernpfad-knoten__linie"></div>
            <div class="lernpfad-knoten__kreis lernpfad-knoten__kreis--zukunft">
                <span class="material-symbols-outlined" style="font-size:14px">${gesperrt ? 'lock' : 'circle'}</span>
            </div>
            <div class="lernpfad-knoten__inhalt">
                <span class="lernpfad-knoten__titel">${esc(l.titel)}</span>
                <span class="lernpfad-knoten__kategorie">${esc(l.kategorie_name || '')}</span>
            </div>
        </div>
    `;
}

function _timeline_aufgaben_gruppe(aufgegebeneLektionen) {
    const einzelItems = aufgegebeneLektionen.map(l => `
        <div class="lernpfad-knoten lernpfad-knoten--privat" style="padding-left:12px">
            <div class="lernpfad-knoten__linie" style="left:-8px"></div>
            <div class="lernpfad-knoten__kreis lernpfad-knoten__kreis--aufgabe" style="left:-16px;width:14px;height:14px">
                <span class="material-symbols-outlined" style="font-size:10px">assignment</span>
            </div>
            <div class="lernpfad-knoten__inhalt">
                <span class="lernpfad-knoten__titel">${esc(l.titel)}</span>
                <span class="lernpfad-knoten__info">${esc(l.kategorie_name || '')} · ${l.vokabel_anzahl} ${t('dashboard.vokabeln_kurz')}</span>
            </div>
            <div class="lernpfad-knoten__aktionen">
                <button class="lernpfad-btn" data-aktion="training" data-lektion-id="${l.id}" title="${t('dashboard.favoriten_training')}">
                    <span class="material-symbols-outlined">fitness_center</span>
                </button>
                <button class="lernpfad-btn" data-aktion="lernmodus" data-lektion-id="${l.id}" title="${t('dashboard.favoriten_lernmodus')}">
                    <span class="material-symbols-outlined">school</span>
                </button>
                <button class="lernpfad-btn" data-aufgabe-entfernen="${l.id}" title="${t('dashboard.aufgabe_entfernen')}"
                    style="color:var(--md-sys-color-error)">
                    <span class="material-symbols-outlined">delete</span>
                </button>
            </div>
        </div>
    `).join('');

    return `
        <div class="lernpfad-knoten lernpfad-knoten--aufgaben">
            <div class="lernpfad-knoten__linie"></div>
            <div class="lernpfad-knoten__kreis lernpfad-knoten__kreis--aufgaben">
                <span class="material-symbols-outlined" style="font-size:14px">assignment</span>
            </div>
            <div class="lernpfad-knoten__inhalt">
                <span class="lernpfad-knoten__titel">${t('dashboard.aufgaben_titel')}</span>
                <span class="lernpfad-knoten__info">${t('dashboard.aufgaben_anzahl', {anzahl: aufgegebeneLektionen.length})}</span>
            </div>
            <button class="lernpfad-btn" id="btn-aufgaben-toggle" title="${t('dashboard.aufklappen')}">
                <span class="material-symbols-outlined lernpfad-toggle-pfeil">expand_more</span>
            </button>
        </div>
        <div id="aufgaben-lektionen-container" style="display:none">
            ${einzelItems}
        </div>
    `;
}

// ============================================
// Vokabel-Statistik (Dashboard-Spiegelung)
// ============================================

async function _vokabel_stats_laden(container) {
    const sektion = container.querySelector('#dashboard-vokabel-stats');
    if (!sektion) return;

    try {
        const res = await apiGet('statistik/benutzer.php');
        if (!res.erfolg) return;

        const s = res.daten || {};
        const gelernt   = s.vokabeln_gelernt   || 0;
        const wiederholt = s.vokabeln_wiederholt || 0;
        const faellig   = s.vokabeln_faellig    || 0;
        const neu       = s.vokabeln_neu        || 0;

        sektion.classList.remove('versteckt');
        sektion.innerHTML = `
            <div class="karte" style="margin-top:16px">
                <div class="karte__titel" style="margin-bottom:12px">${t('dashboard.vokabel_uebersicht')}</div>
                <div class="dashboard__vokabel-stats">
                    <div class="dashboard__stat-chip">
                        <span class="dashboard__stat-wert" style="color:var(--md-sys-color-tertiary)">${zahlFormatieren(gelernt)}</span>
                        <span class="dashboard__stat-label">${t('dashboard.stat_gelernt')}</span>
                    </div>
                    <div class="dashboard__stat-chip">
                        <span class="dashboard__stat-wert" style="color:var(--md-sys-color-primary)">${zahlFormatieren(wiederholt)}</span>
                        <span class="dashboard__stat-label">${t('dashboard.stat_wiederholt')}</span>
                    </div>
                    <button class="dashboard__stat-chip dashboard__stat-chip--link" data-nav="/vokabeln?filter=faellig">
                        <span class="dashboard__stat-wert" style="color:var(--vt-farbe-streak)">${zahlFormatieren(faellig)}</span>
                        <span class="dashboard__stat-label">${t('dashboard.stat_faellig')} ↗</span>
                    </button>
                    <button class="dashboard__stat-chip dashboard__stat-chip--link" data-nav="/vokabeln?filter=neu">
                        <span class="dashboard__stat-wert" style="color:var(--md-sys-color-secondary)">${zahlFormatieren(neu)}</span>
                        <span class="dashboard__stat-label">${t('dashboard.stat_neu')} ↗</span>
                    </button>
                </div>
            </div>
        `;

        sektion.querySelectorAll('[data-nav]').forEach(btn => {
            btn.addEventListener('click', () => navigieren(btn.dataset.nav));
        });
    } catch (_) {
        // Lautlos fehlschlagen — Statistik ist nicht kritisch
    }
}

// ============================================
// CSS einfuegen
// ============================================

export function stil_einfuegen() {
    if (document.getElementById('dashboard-stil')) return;

    const stil = document.createElement('style');
    stil.id = 'dashboard-stil';
    stil.textContent = `
        .dashboard {
            max-width: 900px;
        }

        /* Begruessung */
        .dashboard__begruessung {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 24px;
            gap: 16px;
        }

        .dashboard__begruessung-text h2 {
            font-size: var(--md-sys-typescale-headline-small-size);
            font-weight: 500;
            margin-bottom: 4px;
        }

        .dashboard__begruessung-text p {
            color: var(--md-sys-color-on-surface-variant);
        }

        .dashboard__maskottchen {
            width: 240px;
            height: auto;
            object-fit: contain;
            flex-shrink: 0;
            border-radius: 12px;
            drop-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }

        /* Kacheln */
        .dashboard__section-titel {
            font-size: var(--md-sys-typescale-title-medium-size);
            font-weight: var(--md-sys-typescale-title-medium-weight);
            margin-bottom: 12px;
            color: var(--md-sys-color-on-surface);
        }

        .dashboard__aktionen-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: 12px;
            margin-bottom: 16px;
        }

        .dashboard__aktion {
            cursor: pointer;
            border: none;
            text-align: left;
            padding: 20px 16px;
            transition: transform var(--vt-uebergang), box-shadow var(--vt-uebergang);
        }

        .dashboard__aktion:hover {
            transform: translateY(-2px);
        }

        .dashboard__aktion-icon {
            font-size: 32px;
            color: var(--md-sys-color-primary);
            margin-bottom: 8px;
            display: block;
        }

        .dashboard__aktion-titel {
            display: block;
            font-size: var(--md-sys-typescale-title-medium-size);
            font-weight: 500;
            margin-bottom: 4px;
            color: var(--md-sys-color-on-surface);
        }

        .dashboard__aktion-beschreibung {
            display: block;
            font-size: var(--md-sys-typescale-body-medium-size);
            color: var(--md-sys-color-on-surface-variant);
        }

        /* Vokabel-Stats */
        .dashboard__vokabel-stats {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        .dashboard__stat-chip {
            flex: 1;
            min-width: 60px;
            background: var(--md-sys-color-surface-container);
            border-radius: var(--vt-radius-mittel);
            padding: 10px 8px;
            text-align: center;
            border: none;
            cursor: default;
        }

        .dashboard__stat-chip--link {
            cursor: pointer;
            transition: background var(--vt-uebergang);
        }

        .dashboard__stat-chip--link:hover {
            background: var(--md-sys-color-surface-container-high);
        }

        .dashboard__stat-wert {
            display: block;
            font-size: 22px;
            font-weight: 600;
            line-height: 1.2;
        }

        .dashboard__stat-label {
            display: block;
            font-size: var(--md-sys-typescale-label-small-size, 11px);
            color: var(--md-sys-color-on-surface-variant);
            margin-top: 2px;
        }

        /* Lernpfad-Timeline */
        .lernpfad-timeline {
            position: relative;
            padding-left: 28px;
        }

        .lernpfad-knoten {
            position: relative;
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 0;
        }

        .lernpfad-knoten__linie {
            position: absolute;
            left: -20px;
            top: 0;
            bottom: 0;
            width: 2px;
            background: var(--md-sys-color-outline-variant);
        }

        .lernpfad-knoten:first-child .lernpfad-knoten__linie {
            top: 50%;
        }

        .lernpfad-knoten:last-child .lernpfad-knoten__linie {
            bottom: 50%;
        }

        .lernpfad-knoten__kreis {
            position: absolute;
            left: -28px;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: var(--md-sys-color-surface-container-high);
            border: 2px solid var(--md-sys-color-outline-variant);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1;
            flex-shrink: 0;
        }

        .lernpfad-knoten__kreis--aktuell {
            width: 26px;
            height: 26px;
            left: -32px;
            background: var(--md-sys-color-primary);
            border-color: var(--md-sys-color-primary);
            color: var(--md-sys-color-on-primary);
        }

        .lernpfad-knoten__kreis--zukunft {
            background: var(--md-sys-color-surface-container);
            border-color: var(--md-sys-color-outline-variant);
            color: var(--md-sys-color-on-surface-variant);
        }

        .lernpfad-knoten__inhalt {
            flex: 1;
            min-width: 0;
        }

        .lernpfad-knoten__titel {
            display: block;
            font-weight: 500;
            font-size: var(--md-sys-typescale-title-small-size, 14px);
            color: var(--md-sys-color-on-surface);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .lernpfad-knoten__kategorie {
            display: block;
            font-size: var(--md-sys-typescale-label-medium-size, 12px);
            color: var(--md-sys-color-on-surface-variant);
        }

        .lernpfad-knoten__info {
            display: block;
            font-size: var(--md-sys-typescale-label-small-size, 11px);
            color: var(--md-sys-color-primary);
            margin-top: 2px;
        }

        .lernpfad-knoten--aktuell {
            padding: 16px 0;
        }

        .lernpfad-knoten--aktuell .lernpfad-knoten__inhalt {
            background: var(--md-sys-color-primary-container);
            border-radius: var(--vt-radius-mittel);
            padding: 10px 12px;
        }

        .lernpfad-knoten--aktuell .lernpfad-knoten__titel {
            color: var(--md-sys-color-on-primary-container);
            font-size: var(--md-sys-typescale-body-large-size, 16px);
        }

        .lernpfad-knoten--zukunft .lernpfad-knoten__titel {
            color: var(--md-sys-color-on-surface-variant);
        }

        .lernpfad-knoten__aktionen {
            display: flex;
            gap: 4px;
        }

        .lernpfad-btn {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            border: none;
            background: var(--md-sys-color-surface-container-high);
            color: var(--md-sys-color-primary);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: background var(--vt-uebergang);
        }

        .lernpfad-btn:hover {
            background: var(--md-sys-color-primary-container);
        }

        .lernpfad-knoten__btn {
            flex-shrink: 0;
            font-size: 13px;
            padding: 6px 12px;
        }

        /* Gap-Knoten */
        .lernpfad-knoten__kreis--gap {
            background: var(--md-sys-color-surface-container-high);
            border-color: var(--md-sys-color-primary);
            color: var(--md-sys-color-primary);
        }

        .lernpfad-knoten--gap:hover .lernpfad-knoten__titel {
            text-decoration: underline;
        }

        /* Favoriten-Knoten */
        .lernpfad-knoten--favorit .lernpfad-knoten__kreis--favorit {
            background: var(--md-sys-color-tertiary-container);
            border-color: var(--md-sys-color-tertiary);
            color: var(--md-sys-color-on-tertiary-container);
        }

        /* Eigene-Lektionen-Gruppe */
        .lernpfad-knoten--eigene .lernpfad-knoten__kreis--eigene {
            background: var(--md-sys-color-secondary-container);
            border-color: var(--md-sys-color-secondary);
            color: var(--md-sys-color-on-secondary-container);
        }

        /* Private Lektionen (aufgeklappt) */
        .lernpfad-knoten--privat .lernpfad-knoten__kreis--privat {
            background: var(--md-sys-color-surface-container-high);
            border-color: var(--md-sys-color-secondary);
            color: var(--md-sys-color-secondary);
        }

        /* Aufgaben-Knoten */
        .lernpfad-knoten--aufgaben .lernpfad-knoten__kreis--aufgaben {
            background: var(--md-sys-color-error-container);
            border-color: var(--md-sys-color-error);
            color: var(--md-sys-color-on-error-container);
        }

        .lernpfad-knoten--privat .lernpfad-knoten__kreis--aufgabe {
            background: var(--md-sys-color-error-container);
            border-color: var(--md-sys-color-error);
            color: var(--md-sys-color-on-error-container);
        }

        .lernpfad-knoten--zukunft:hover .lernpfad-knoten__inhalt {
            background: var(--md-sys-color-surface-container);
            border-radius: var(--vt-radius-klein, 4px);
        }

        /* Rechtliches */
        .dashboard__rechtliches {
            text-align: center;
            padding: 8px 0 4px;
            margin-top: 24px;
        }

        .dashboard__rechtliches-link {
            font-size: var(--md-sys-typescale-body-small-size, 12px);
            color: var(--md-sys-color-outline);
            text-decoration: none;
        }

        .dashboard__rechtliches-link:hover {
            color: var(--md-sys-color-on-surface-variant);
            text-decoration: underline;
        }

        @media (max-width: 768px) {
            .dashboard__aktionen-grid {
                grid-template-columns: repeat(2, 1fr);
            }

            .dashboard__begruessung {
                flex-direction: column-reverse;
                align-items: center;
                text-align: center;
            }

            .dashboard__maskottchen {
                width: 180px;
            }

            .lernpfad-knoten__aktionen {
                flex-wrap: wrap;
            }
        }
    `;
    document.head.appendChild(stil);
}

export function aufraeumen() {
    // Nichts spezielles aufzuraeumen
}

// ============================================
// Tägliche Benachrichtigungskanäle aus DB laden
// ============================================

/**
 * Lädt tägliche Benachrichtigungskanäle aus der DB und konfiguriert den AlarmManager.
 * Wird bei jedem Dashboard-Load aufgerufen, damit Admin-Änderungen sofort wirksam sind.
 * Fallback: androidTtsReady hat bereits Standard-Alarme mit Standardzeiten geplant.
 */
async function _taeglich_kanaele_laden(statistik) {
    const endpunkt = 'benachrichtigungen/kanaele.php';
    try {
        const res = await apiGet(endpunkt);

        if (!res.erfolg) {
            console.error(`[Dashboard] Kanalconfig-API Fehler ${res._httpStatus}: ${endpunkt}`, res.fehler ?? res);
            return; // Fallback: androidTtsReady-Bootstrap greift
        }

        const kanaele = res.daten || [];
        for (const k of kanaele) {
            if (!k.uhrzeit) continue;
            if (k.schluessel === 'uebungs_erinnerung') {
                uebungs_erinnerung_setzen({ aktiv: k.aktiv, uhrzeit: k.uhrzeit, titel: k.titel, text: k.text });
            } else if (k.schluessel === 'streak_warnung') {
                streak_warnung_setzen({ aktiv: k.aktiv, uhrzeit: k.uhrzeit, titel: k.titel, text: k.text });
            }
        }
    } catch (fehler) {
        console.error(`[Dashboard] Kanalconfig-API unerwarteter Fehler: ${endpunkt}`, fehler);
        // Fallback: androidTtsReady-Bootstrap greift
    }
}

// ============================================
// Milestones aus DB laden und prüfen
// ============================================

async function _milestones_pruefen_aus_db(statistik) {
    const endpunkt = 'admin/benachrichtigungen.php?typ=milestone';

    try {
        const res = await apiGet(endpunkt);

        if (!res.erfolg) {
            if (res._httpStatus === 403) {
                // Normaler Zustand für Nicht-Admin-Nutzer — Milestones werden übersprungen.
                // Tägliche Alarme werden separat via _taeglich_kanaele_laden() konfiguriert.
                return;
            }

            if (res._httpStatus === 0) {
                console.error(`[Dashboard] Milestone-API nicht erreichbar (Netzwerkfehler): ${endpunkt}`);
                return;
            }

            console.error(
                `[Dashboard] Milestone-API Fehler ${res._httpStatus}: ${endpunkt}`,
                res.fehler ?? res
            );
            return;
        }

        const milestones = (res.daten || [])
            .filter(e => e.aktiv && e.parameter_1 && e.parameter_2)
            .map(e => ({
                typ:   e.parameter_1,
                wert:  parseInt(e.parameter_2, 10),
                titel: e.titel,
                text:  e.text,
            }))
            .filter(m => !isNaN(m.wert));

        milestones_pruefen(milestones, {
            gesamt_xp:       statistik.gesamt_xp              || 0,
            streak_tage:     statistik.streak_tage            || 0,
            vokabeln_gesamt: statistik.gesamt_vokabeln_gelernt || 0,
            level:           statistik.globales_level         || 1,
        });

    } catch (fehler) {
        console.error(`[Dashboard] Milestone-API unerwarteter Fehler: ${endpunkt}`, fehler);
    }
}
