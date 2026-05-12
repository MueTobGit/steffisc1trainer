/**
 * Statistik — Detaillierte Benutzer-Statistiken
 *
 * Zeigt XP, Level, Streak, Sterne, Trainings-Zusammenfassung,
 * XP-Fortschritt und paginierte Aktivitaeten-Liste.
 */

import { apiGet } from '../api-client.js';
import { holen } from '../zustand.js';
import { esc, zahlFormatieren, levelLabel } from '../hilfs-funktionen.js';
import { lade_anzeige_rendern, lade_anzeige_entfernen } from '../komponenten/lade-anzeige.js';
import { leer_zustand_rendern } from '../komponenten/leer-zustand.js';
import { paginierung_rendern } from '../komponenten/paginierung.js';
import { t, aktuelle_sprache } from '../dienste/sprache.js';

// ============================================
// Aktivitaeten-Icon Mapping
// ============================================

const TYP_ICONS = {
    training: 'fitness_center',
    belohnung: 'military_tech',
    level_aufstieg: 'upgrade',
    login: 'login',
    streak: 'local_fire_department',
    admin_aktion: 'admin_panel_settings',
};

// ============================================
// Modul-Exports
// ============================================

/**
 * Statistik-Modul rendern
 */
export async function rendern() {
    const container = document.getElementById('inhalt');
    if (!container) return;

    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'statistik';
    container.appendChild(wrapper);

    lade_anzeige_rendern(wrapper);

    try {
        const [stat_erg, akt_erg] = await Promise.all([
            apiGet('statistik/benutzer.php'),
            apiGet('statistik/aktivitaeten.php'),
        ]);

        lade_anzeige_entfernen(wrapper);

        if (!stat_erg.erfolg) {
            leer_zustand_rendern(wrapper, 'error', t('profil.fehler_titel'), t('statistik.fehler'));
            return;
        }

        _seite_rendern(wrapper, stat_erg.daten, akt_erg.erfolg ? akt_erg.daten : null);
    } catch (e) {
        console.error('Statistik laden fehlgeschlagen:', e);
        lade_anzeige_entfernen(wrapper);
        leer_zustand_rendern(wrapper, 'error', t('profil.fehler_titel'), t('statistik.fehler'));
    }
}

/**
 * Aufraeumen bei Modulwechsel
 */
export function aufraeumen() {
    // Nichts aufzuraeumen
}

// ============================================
// Seite aufbauen
// ============================================

function _seite_rendern(wrapper, daten, aktivitaeten_daten) {
    const s = daten.statistik;
    const tr = daten.trainings;
    const sf = daten.stern_fortschritt;

    wrapper.innerHTML = '';

    // --- Titel ---
    const kopf = document.createElement('section');
    kopf.className = 'statistik__kopf';
    kopf.innerHTML = `<h2>${t('statistik.titel')}</h2>`;
    wrapper.appendChild(kopf);

    // --- Uebersicht (6 Karten im Grid) ---
    const uebersicht = document.createElement('section');
    uebersicht.className = 'statistik__uebersicht';

    const karten = [
        { icon: 'star', label: t('statistik.xp'), wert: zahlFormatieren(s.xp), farbe: 'var(--vt-farbe-xp)' },
        { icon: 'school', label: t('statistik.level', {level: s.globales_level}), wert: levelLabel(s.globales_level), farbe: 'var(--md-sys-color-primary)' },
        { icon: 'local_fire_department', label: t('statistik.streak_aktuell'), wert: t('statistik.tage', {anzahl: s.streak_tage}), farbe: 'var(--vt-farbe-streak)' },
        { icon: 'emoji_events', label: t('statistik.streak_laengster'), wert: t('statistik.tage', {anzahl: s.laengstes_streak}), farbe: 'var(--md-sys-color-tertiary)' },
        { icon: 'workspace_premium', label: t('statistik.sterne'), wert: t('statistik.sterne_wert', {gold: s.gold_sterne, silber: s.silber_sterne, bronze: s.bronze_sterne}), farbe: 'var(--vt-farbe-gold, #FFD700)' },
        { icon: 'dictionary', label: t('statistik.vokabeln_gelernt'), wert: zahlFormatieren(s.gesamt_vokabeln_gelernt), farbe: 'var(--md-sys-color-secondary)' },
    ];

    for (const k of karten) {
        const karte = document.createElement('div');
        karte.className = 'karte statistik__stat-karte';
        karte.innerHTML = `
            <div class="statistik__stat-icon" style="color:${k.farbe}">
                <span class="material-symbols-outlined">${k.icon}</span>
            </div>
            <div class="statistik__stat-wert">${esc(k.wert)}</div>
            <div class="statistik__stat-label">${esc(k.label)}</div>
        `;
        uebersicht.appendChild(karte);
    }

    wrapper.appendChild(uebersicht);

    // --- Trainings-Zusammenfassung ---
    const trainingsBereich = document.createElement('section');
    trainingsBereich.className = 'statistik__trainings';

    const trainingsKarte = document.createElement('div');
    trainingsKarte.className = 'karte';

    trainingsKarte.innerHTML = `
        <div class="karte__titel">${t('statistik.trainings_titel')}</div>
        <div class="karte__inhalt">
            <div class="statistik__trainings-grid">
                <div class="statistik__trainings-item">
                    <span class="statistik__trainings-wert">${zahlFormatieren(tr.gesamt_sitzungen)}</span>
                    <span class="statistik__trainings-label">${t('statistik.sitzungen')}</span>
                </div>
                <div class="statistik__trainings-item">
                    <span class="statistik__trainings-wert">${zahlFormatieren(tr.gesamt_fragen)}</span>
                    <span class="statistik__trainings-label">${t('statistik.fragen')}</span>
                </div>
                <div class="statistik__trainings-item">
                    <span class="statistik__trainings-wert">${zahlFormatieren(tr.gesamt_richtig)}</span>
                    <span class="statistik__trainings-label">${t('statistik.richtig')}</span>
                </div>
                <div class="statistik__trainings-item">
                    <span class="statistik__trainings-wert">${tr.genauigkeit}%</span>
                    <span class="statistik__trainings-label">${t('statistik.genauigkeit')}</span>
                </div>
            </div>
        </div>
    `;

    trainingsBereich.appendChild(trainingsKarte);
    wrapper.appendChild(trainingsBereich);

    // --- Aktivitaeten ---
    const aktBereich = document.createElement('section');
    aktBereich.className = 'statistik__aktivitaeten';

    const aktKarte = document.createElement('div');
    aktKarte.className = 'karte';

    const aktTitel = document.createElement('div');
    aktTitel.className = 'karte__titel';
    aktTitel.textContent = t('statistik.aktivitaeten');
    aktKarte.appendChild(aktTitel);

    const aktListe = document.createElement('div');
    aktListe.id = 'statistik-aktivitaeten-liste';
    aktKarte.appendChild(aktListe);

    const aktPag = document.createElement('div');
    aktPag.id = 'statistik-paginierung';
    aktKarte.appendChild(aktPag);

    aktBereich.appendChild(aktKarte);
    wrapper.appendChild(aktBereich);

    // Aktivitaeten rendern
    if (aktivitaeten_daten) {
        _aktivitaeten_rendern(aktivitaeten_daten);
    }
}

// ============================================
// Aktivitaeten-Liste
// ============================================

function _aktivitaeten_rendern(daten) {
    const liste = document.getElementById('statistik-aktivitaeten-liste');
    const pag = document.getElementById('statistik-paginierung');
    if (!liste) return;

    liste.innerHTML = '';

    const eintraege = daten.eintraege || [];

    if (eintraege.length === 0) {
        liste.innerHTML = `<p style="color:var(--md-sys-color-on-surface-variant);padding:12px 0;">${t('statistik.keine_aktivitaeten')}</p>`;
        return;
    }

    for (const e of eintraege) {
        const item = document.createElement('div');
        item.className = 'statistik__aktivitaet';

        const icon = TYP_ICONS[e.typ] || 'info';
        const zeit = _relative_zeit(e.erstellt_am);

        item.innerHTML = `
            <span class="material-symbols-outlined statistik__aktivitaet-icon">${icon}</span>
            <div class="statistik__aktivitaet-inhalt">
                <span class="statistik__aktivitaet-text">${esc(e.beschreibung)}</span>
                <span class="statistik__aktivitaet-zeit">${esc(zeit)}</span>
            </div>
        `;

        liste.appendChild(item);
    }

    // Paginierung
    if (pag && daten.paginierung) {
        paginierung_rendern(pag, daten.paginierung, async (seite) => {
            const erg = await apiGet('statistik/aktivitaeten.php', { seite });
            if (erg.erfolg) {
                _aktivitaeten_rendern(erg.daten);
            }
        });
    }
}

/**
 * Relative Zeitangabe berechnen
 */
function _relative_zeit(datum_str) {
    if (!datum_str) return '';

    const datum = new Date(datum_str);
    const jetzt = new Date();
    const diff_ms = jetzt - datum;
    const diff_min = Math.floor(diff_ms / 60000);
    const diff_std = Math.floor(diff_min / 60);
    const diff_tage = Math.floor(diff_std / 24);

    if (diff_min < 1) return t('statistik.zeit_gerade');
    if (diff_min < 60) return t('statistik.zeit_minuten', {anzahl: diff_min});
    if (diff_std < 24) return t('statistik.zeit_stunden', {anzahl: diff_std});
    if (diff_tage === 1) return t('statistik.zeit_gestern');
    if (diff_tage < 7) return t('statistik.zeit_tage', {anzahl: diff_tage});

    const locale = (typeof aktuelle_sprache === 'function' ? aktuelle_sprache() : 'de') === 'sv' ? 'sv-SE' : 'de-DE';
    return datum.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}
