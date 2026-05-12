/**
 * Fortschritt — Lernfortschritt-Uebersicht (inkl. Statistik)
 *
 * Vereint Lernfortschritt + ehemalige Statistik-Seite:
 * Streak, Vokabel-Uebersicht, Statistik-Kacheln (XP, Level, Sterne, Vokabeln sicher gelernt),
 * Sprachniveau, Vokabel-Stufen, Letzte Aktivitaeten.
 */

import { apiGet, apiPost } from '../api-client.js';
import { holen } from '../zustand.js';
import { navigieren } from '../router.js';
import { esc, zahlFormatieren, levelLabel } from '../hilfs-funktionen.js';
import { lade_anzeige_rendern, lade_anzeige_entfernen } from '../komponenten/lade-anzeige.js';
import { leer_zustand_rendern } from '../komponenten/leer-zustand.js';
import { streak_anzeige_erstellen } from '../komponenten/streak-anzeige.js';
import { xp_leiste_erstellen } from '../komponenten/xp-leiste.js';
import { paginierung_rendern } from '../komponenten/paginierung.js';
import { t, aktuelle_sprache } from '../dienste/sprache.js';

// Stufen-Farben
const STUFEN_FARBEN = [
    'var(--md-sys-color-outline)',                    // Stufe 0: Grau
    'var(--md-sys-color-primary)',                    // Stufe 1: Blau
    'var(--md-sys-color-primary)',                    // Stufe 2: Blau
    'var(--md-sys-color-secondary)',                  // Stufe 3: Gelb
    'var(--md-sys-color-tertiary, #4CAF50)',          // Stufe 4: Gruen
    'var(--md-sys-color-tertiary, #4CAF50)',          // Stufe 5: Gruen
    'var(--vt-farbe-gold, #FFD700)',                  // Stufe 6: Gold
];

// Aktivitaeten-Icon Mapping
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
 * Fortschritt-Modul rendern
 */
export async function rendern() {
    const container = document.getElementById('inhalt');
    if (!container) return;

    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'fortschritt';
    container.appendChild(wrapper);

    lade_anzeige_rendern(wrapper);

    try {
        const [stat_erg, fort_erg, akt_erg] = await Promise.all([
            apiGet('statistik/benutzer.php'),
            apiGet('fortschritt/laden.php'),
            apiGet('statistik/aktivitaeten.php'),
        ]);

        lade_anzeige_entfernen(wrapper);

        if (!stat_erg.erfolg || !fort_erg.erfolg) {
            leer_zustand_rendern(wrapper, 'error', t('profil.fehler_titel'), t('fortschritt.fehler_laden'));
            return;
        }

        _seite_rendern(wrapper, stat_erg.daten, fort_erg.daten, akt_erg.erfolg ? akt_erg.daten : null);
    } catch (e) {
        console.error('Fortschritt laden fehlgeschlagen:', e);
        lade_anzeige_entfernen(wrapper);
        leer_zustand_rendern(wrapper, 'error', t('profil.fehler_titel'), t('fortschritt.fehler_laden'));
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

function _seite_rendern(wrapper, stat_daten, fort_daten, aktivitaeten_daten) {
    const s = stat_daten.statistik;
    const tr = stat_daten.trainings;
    const u = fort_daten.uebersicht;
    const stufen = u.stufen || stat_daten.stufen || [0, 0, 0, 0, 0, 0, 0];

    wrapper.innerHTML = '';

    // --- Titel ---
    const kopf = document.createElement('section');
    kopf.className = 'fortschritt__kopf';
    kopf.innerHTML = `<h2>${esc(t('fortschritt.titel'))}</h2>`;
    wrapper.appendChild(kopf);

    // --- 1. Streak ---
    const streakBereich = document.createElement('section');
    streakBereich.className = 'fortschritt__streak';

    const streakKarte = document.createElement('div');
    streakKarte.className = 'karte';
    streakKarte.style.padding = '16px';

    const streakTitel = document.createElement('div');
    streakTitel.className = 'karte__titel';
    streakTitel.textContent = t('fortschritt.streak');
    streakKarte.appendChild(streakTitel);

    const streakInhalt = document.createElement('div');
    streakInhalt.style.cssText = 'display:flex;align-items:center;justify-content:center;padding:12px 0;';
    streakInhalt.appendChild(streak_anzeige_erstellen(s.streak_tage, {
        animiert: s.streak_tage > 0,
        groesse: 'gross',
        label: true,
    }));
    streakKarte.appendChild(streakInhalt);

    if (s.laengstes_streak > 0) {
        const laengstes = document.createElement('div');
        laengstes.style.cssText = 'text-align:center;color:var(--md-sys-color-on-surface-variant);font-size:var(--md-sys-typescale-body-small-size,12px);';
        laengstes.textContent = t('fortschritt.laengstes_streak', { anzahl: s.laengstes_streak });
        streakKarte.appendChild(laengstes);
    }

    streakBereich.appendChild(streakKarte);
    wrapper.appendChild(streakBereich);

    // --- 2. Vokabel-Uebersicht ---
    _vokabeln_uebersicht_rendern(wrapper, stat_daten);

    // --- 3. Statistik-Kacheln (4 klickbare Karten) ---
    _statistik_kacheln_rendern(wrapper, stat_daten, fort_daten);

    // --- 4. Sprachniveau ---
    const niv_daten = fort_daten.sprachniveau_fortschritt;
    if (niv_daten && niv_daten.length > 0) {
        _sprachniveau_rendern(wrapper, niv_daten);
    }

    // --- 5. Vokabel-Stufen ---
    _stufen_chart_rendern(wrapper, stufen);

    // --- 6. Letzte Aktivitaeten ---
    _aktivitaeten_bereich_rendern(wrapper, aktivitaeten_daten);
}

// ============================================
// Statistik-Kacheln (XP, Level, Sterne, Vokabeln sicher gelernt)
// ============================================

function _statistik_kacheln_rendern(wrapper, stat_daten, fort_daten) {
    const s = stat_daten.statistik;
    const tr = stat_daten.trainings;
    const sf = stat_daten.stern_fortschritt || {};
    const vokabeln_sicher = stat_daten.vokabeln_sicher_gelernt ?? s.gesamt_vokabeln_gelernt ?? 0;

    const bereich = document.createElement('section');
    bereich.className = 'fortschritt__statistik-kacheln';

    // Kachel-Grid
    const grid = document.createElement('div');
    grid.className = 'statistik__uebersicht';

    // -- XP-Kachel --
    const xpKachel = _stat_kachel('star', t('statistik.xp'), zahlFormatieren(s.xp), 'var(--vt-farbe-xp)');
    grid.appendChild(xpKachel);

    // -- Level-Kachel --
    const levelKachel = _stat_kachel('school', t('statistik.level', { level: s.globales_level }), levelLabel(s.globales_level), 'var(--md-sys-color-primary)');
    grid.appendChild(levelKachel);

    // -- Sterne-Kachel (mit farbigen Icons) --
    const sterneKachel = document.createElement('div');
    sterneKachel.className = 'karte statistik__stat-karte statistik__stat-karte--klickbar';
    sterneKachel.innerHTML = `
        <div class="statistik__stat-icon" style="color:var(--vt-farbe-gold, #FFD700)">
            <span class="material-symbols-outlined">workspace_premium</span>
        </div>
        <div class="statistik__stat-wert statistik__sterne-wert">
            <span style="color:#FFD700">${s.gold_sterne || 0}</span><span class="material-symbols-outlined" style="font-size:16px;color:#FFD700;vertical-align:middle">workspace_premium</span>
            <span style="color:#C0C0C0;margin-left:4px">${s.silber_sterne || 0}</span><span class="material-symbols-outlined" style="font-size:16px;color:#C0C0C0;vertical-align:middle">workspace_premium</span>
            <span style="color:#CD7F32;margin-left:4px">${s.bronze_sterne || 0}</span><span class="material-symbols-outlined" style="font-size:16px;color:#CD7F32;vertical-align:middle">workspace_premium</span>
        </div>
        <div class="statistik__stat-label">${esc(t('statistik.sterne'))}</div>
    `;
    grid.appendChild(sterneKachel);

    // -- Vokabeln sicher gelernt --
    const vokKachel = _stat_kachel('dictionary', t('fortschritt.sicher_gelernt'), zahlFormatieren(vokabeln_sicher), 'var(--md-sys-color-secondary)');
    grid.appendChild(vokKachel);

    bereich.appendChild(grid);

    // --- Aufklappbare Detail-Sektionen ---

    // Sterne-Details (fuer XP + Sterne Klick)
    const sterneDetails = document.createElement('div');
    sterneDetails.className = 'fortschritt__detail-sektion versteckt';
    sterneDetails.id = 'fortschritt-sterne-details';

    const sterneDetailKarte = document.createElement('div');
    sterneDetailKarte.className = 'karte';
    sterneDetailKarte.style.padding = '16px';

    const sterneDetailTitel = document.createElement('div');
    sterneDetailTitel.className = 'karte__titel';
    sterneDetailTitel.textContent = t('fortschritt.xp_sterne_fortschritt');
    sterneDetailKarte.appendChild(sterneDetailTitel);

    const sterneDetailInhalt = document.createElement('div');
    sterneDetailInhalt.style.cssText = 'display:flex;flex-direction:column;gap:16px;margin-top:8px;';
    sterneDetailInhalt.appendChild(xp_leiste_erstellen(s.xp, { stern: 'bronze', naechste_schwelle: sf.naechster_bronze ?? null }));
    sterneDetailInhalt.appendChild(xp_leiste_erstellen(s.xp, { stern: 'silber', naechste_schwelle: sf.naechster_silber ?? null }));
    sterneDetailInhalt.appendChild(xp_leiste_erstellen(s.xp, { stern: 'gold',   naechste_schwelle: sf.naechster_gold   ?? null }));
    sterneDetailKarte.appendChild(sterneDetailInhalt);
    sterneDetails.appendChild(sterneDetailKarte);
    bereich.appendChild(sterneDetails);

    // Level-Details (Sprachlevel-Overlay)
    const levelDetails = document.createElement('div');
    levelDetails.className = 'fortschritt__detail-sektion versteckt';
    levelDetails.id = 'fortschritt-level-details';

    const beherrschungsquote = fort_daten.beherrschungsquote ?? s.beherrschungsquote ?? 0;
    const level = s.globales_level;
    const level_konfiguration = fort_daten.level_konfiguration || null;
    const _lk_fuer = (nr) => level_konfiguration?.find(l => l.level === nr);
    const _fallback_namen = {
        1: t('fortschritt.level_einsteiger'),
        2: t('fortschritt.level_lernender'),
        3: t('fortschritt.level_fortgeschrittener'),
        4: t('fortschritt.level_experte'),
        5: t('fortschritt.level_meister'),
    };

    const alle_formen = [];
    for (let l = 1; l <= level; l++) {
        const formen = _lk_fuer(l)?.formen || [];
        alle_formen.push(...formen);
    }

    const levelDetailKarte = document.createElement('div');
    levelDetailKarte.className = 'karte';
    levelDetailKarte.style.padding = '16px';

    let levelDetailHTML = `
        <div class="karte__titel">${esc(t('fortschritt.sprachlevel'))}</div>
        <div class="fortschritt__level-anzeige" style="margin-top:8px">
            <div class="fortschritt__level-aktuell">
                <span class="fortschritt__level-name">${esc(_lk_fuer(level)?.name || _fallback_namen[level] || t('fortschritt.level_unbekannt'))}</span>
                <span class="fortschritt__level-quote">${esc(t('fortschritt.wortschatz_gemeistert', { prozent: beherrschungsquote }))}</span>
            </div>
    `;

    if (alle_formen.length > 0) {
        levelDetailHTML += `
            <div class="fortschritt__level-formen">
                <div class="fortschritt__level-formen-label">${esc(t('fortschritt.freigeschaltete_formen'))}</div>
                <div class="fortschritt__level-formen-liste">${alle_formen.map(f => esc(f)).join(', ')}</div>
            </div>
        `;
    }

    if (level === 5) {
        levelDetailHTML += `<div class="fortschritt__level-fertig">${esc(t('fortschritt.alle_formen'))}</div>`;
    } else {
        const naechster_lk = _lk_fuer(level + 1);
        const naechster_name = naechster_lk?.name || _fallback_namen[level + 1] || '';
        const naechste_schwelle = naechster_lk?.schwelle ?? null;
        if (naechster_name && naechste_schwelle !== null) {
            levelDetailHTML += `<div class="fortschritt__level-naechster">${esc(t('fortschritt.naechster_titel', { name: naechster_name, schwelle: naechste_schwelle }))}</div>`;
        }
    }

    levelDetailHTML += `</div>`;
    levelDetailKarte.innerHTML = levelDetailHTML;
    levelDetails.appendChild(levelDetailKarte);
    bereich.appendChild(levelDetails);

    // Trainings-Statistik-Details (fuer Vokabeln sicher gelernt Klick)
    const trainingsDetails = document.createElement('div');
    trainingsDetails.className = 'fortschritt__detail-sektion versteckt';
    trainingsDetails.id = 'fortschritt-trainings-details';

    const trainingsKarte = document.createElement('div');
    trainingsKarte.className = 'karte';
    trainingsKarte.style.padding = '16px';
    trainingsKarte.innerHTML = `
        <div class="karte__titel">${esc(t('statistik.trainings_titel'))}</div>
        <div class="karte__inhalt">
            <div class="statistik__trainings-grid">
                <div class="statistik__trainings-item">
                    <span class="statistik__trainings-wert">${zahlFormatieren(tr.gesamt_sitzungen)}</span>
                    <span class="statistik__trainings-label">${esc(t('statistik.sitzungen'))}</span>
                </div>
                <div class="statistik__trainings-item">
                    <span class="statistik__trainings-wert">${zahlFormatieren(tr.gesamt_fragen)}</span>
                    <span class="statistik__trainings-label">${esc(t('statistik.fragen'))}</span>
                </div>
                <div class="statistik__trainings-item">
                    <span class="statistik__trainings-wert">${zahlFormatieren(tr.gesamt_richtig)}</span>
                    <span class="statistik__trainings-label">${esc(t('statistik.richtig'))}</span>
                </div>
                <div class="statistik__trainings-item">
                    <span class="statistik__trainings-wert">${tr.genauigkeit}%</span>
                    <span class="statistik__trainings-label">${esc(t('statistik.genauigkeit'))}</span>
                </div>
            </div>
        </div>
    `;
    trainingsDetails.appendChild(trainingsKarte);
    bereich.appendChild(trainingsDetails);

    wrapper.appendChild(bereich);

    // --- Klick-Events fuer Kacheln ---
    xpKachel.addEventListener('click', () => _detail_toggle('fortschritt-sterne-details'));
    sterneKachel.addEventListener('click', () => _detail_toggle('fortschritt-sterne-details'));
    levelKachel.addEventListener('click', () => _detail_toggle('fortschritt-level-details'));
    vokKachel.addEventListener('click', () => _detail_toggle('fortschritt-trainings-details'));
}

function _stat_kachel(icon, label, wert, farbe) {
    const karte = document.createElement('div');
    karte.className = 'karte statistik__stat-karte statistik__stat-karte--klickbar';
    karte.innerHTML = `
        <div class="statistik__stat-icon" style="color:${farbe}">
            <span class="material-symbols-outlined">${icon}</span>
        </div>
        <div class="statistik__stat-wert">${esc(wert)}</div>
        <div class="statistik__stat-label">${esc(label)}</div>
    `;
    return karte;
}

function _detail_toggle(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const war_sichtbar = !el.classList.contains('versteckt');

    // Alle Detail-Sektionen schliessen
    document.querySelectorAll('.fortschritt__detail-sektion').forEach(s => s.classList.add('versteckt'));

    // Gewahlte Sektion oeffnen (wenn sie nicht bereits offen war)
    if (!war_sichtbar) {
        el.classList.remove('versteckt');
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// ============================================
// Sprachniveau-Fortschritt
// ============================================

const NIVEAU_FARBEN = {
    A1: 'var(--md-sys-color-primary)',
    A2: 'var(--md-sys-color-secondary)',
    B1: 'var(--md-sys-color-tertiary, #4CAF50)',
    B2: 'var(--vt-farbe-gold, #FFD700)',
};

function _sprachniveau_rendern(wrapper, niveaus) {
    const bereich = document.createElement('section');
    bereich.className = 'fortschritt__sprachniveau';

    const karte = document.createElement('div');
    karte.className = 'karte';
    karte.style.padding = '16px';

    const kartenTitel = document.createElement('div');
    kartenTitel.className = 'karte__titel';
    kartenTitel.textContent = t('fortschritt.sprachniveau');
    karte.appendChild(kartenTitel);

    const hinweis = document.createElement('div');
    hinweis.className = 'fortschritt__niveau-hinweis';
    hinweis.textContent = t('fortschritt.niveau_hinweis');
    karte.appendChild(hinweis);

    const liste = document.createElement('div');
    liste.className = 'fortschritt__niveau-liste';

    for (const n of niveaus) {
        const zeile = document.createElement('div');
        zeile.className = 'fortschritt__niveau-zeile';

        const kopf = document.createElement('div');
        kopf.className = 'fortschritt__niveau-kopf';

        const label = document.createElement('span');
        label.className = 'fortschritt__niveau-label';
        label.textContent = n.niveau;

        const zahlen = document.createElement('span');
        zahlen.className = 'fortschritt__niveau-zahlen';
        const dbHinweis = n.in_db < n.ziel
            ? ` ${t('fortschritt.im_system', { anzahl: n.in_db })}`
            : '';
        zahlen.textContent = `${zahlFormatieren(n.gemeistert)} / ${zahlFormatieren(n.ziel)}${dbHinweis}`;

        kopf.appendChild(label);
        kopf.appendChild(zahlen);
        zeile.appendChild(kopf);

        const balkenHuelle = document.createElement('div');
        balkenHuelle.className = 'fortschritt__niveau-balken';

        const fuellung = document.createElement('div');
        fuellung.className = 'fortschritt__niveau-fuellung';
        fuellung.style.width = `${n.prozent}%`;
        fuellung.style.backgroundColor = NIVEAU_FARBEN[n.niveau] || 'var(--md-sys-color-primary)';

        balkenHuelle.appendChild(fuellung);
        zeile.appendChild(balkenHuelle);

        const prozentText = document.createElement('div');
        prozentText.className = 'fortschritt__niveau-prozent';
        prozentText.textContent = `${n.prozent}%`;
        zeile.appendChild(prozentText);

        liste.appendChild(zeile);
    }

    karte.appendChild(liste);
    bereich.appendChild(karte);
    wrapper.appendChild(bereich);
}

// ============================================
// Stufen-Verteilung (Balkendiagramm)
// ============================================

function _stufen_chart_rendern(wrapper, stufen) {
    const bereich = document.createElement('section');
    bereich.className = 'fortschritt__stufen';

    const karte = document.createElement('div');
    karte.className = 'karte';
    karte.style.padding = '16px';

    const titel = document.createElement('div');
    titel.className = 'karte__titel';
    titel.textContent = t('fortschritt.vokabel_stufen');
    karte.appendChild(titel);

    const hinweis = document.createElement('div');
    hinweis.style.cssText = 'font-size:11px;color:var(--md-sys-color-on-surface-variant);margin-bottom:10px;';
    hinweis.textContent = t('fortschritt.stufe_klick_hinweis');
    karte.appendChild(hinweis);

    const chart = document.createElement('div');
    chart.className = 'fortschritt__stufen-chart';

    const max_stufe = Math.max(...stufen, 1);

    const stufen_labels = [
        t('fortschritt.stufe_0'),
        t('fortschritt.stufe_1'),
        t('fortschritt.stufe_2'),
        t('fortschritt.stufe_3'),
        t('fortschritt.stufe_4'),
        t('fortschritt.stufe_5'),
        t('fortschritt.stufe_6'),
    ];

    for (let i = 0; i <= 6; i++) {
        const anzahl = stufen[i] || 0;
        const prozent = max_stufe > 0 ? Math.round((anzahl / max_stufe) * 100) : 0;

        const reihe = document.createElement('div');
        reihe.className = 'fortschritt__stufe-reihe fortschritt__stufe-reihe--klickbar';
        reihe.title = t('fortschritt.stufe_anzeigen', { stufe: i, anzahl });

        const label = document.createElement('span');
        label.className = 'fortschritt__stufe-label';
        label.textContent = stufen_labels[i];
        reihe.appendChild(label);

        const balkenBg = document.createElement('div');
        balkenBg.className = 'fortschritt__stufe-balken-bg';

        const balken = document.createElement('div');
        balken.className = 'fortschritt__stufe-balken';
        balken.style.width = `${prozent}%`;
        balken.style.background = STUFEN_FARBEN[i];
        balkenBg.appendChild(balken);

        reihe.appendChild(balkenBg);

        const zahlEl = document.createElement('span');
        zahlEl.className = 'fortschritt__stufe-anzahl';
        zahlEl.textContent = anzahl.toString();
        reihe.appendChild(zahlEl);

        if (anzahl > 0) {
            reihe.addEventListener('click', () => _stufen_overlay_oeffnen(i, stufen_labels[i]));
        } else {
            reihe.classList.add('fortschritt__stufe-reihe--leer');
        }

        chart.appendChild(reihe);
    }

    karte.appendChild(chart);
    bereich.appendChild(karte);
    wrapper.appendChild(bereich);
}

// ============================================
// Stufen-Vokabel-Overlay
// ============================================

async function _stufen_overlay_oeffnen(stufe, label) {
    const overlay = document.createElement('div');
    overlay.className = 'fortschritt__overlay-bg';
    document.body.appendChild(overlay);

    const dialog = document.createElement('div');
    dialog.className = 'fortschritt__overlay-dialog';

    const kopf = document.createElement('div');
    kopf.className = 'fortschritt__overlay-kopf';
    kopf.innerHTML = `
        <span class="fortschritt__overlay-titel">${esc(label)}</span>
        <button class="fortschritt__overlay-schliessen" aria-label="${esc(t('allgemein.schliessen'))}">
            <span class="material-symbols-outlined">close</span>
        </button>
    `;
    dialog.appendChild(kopf);

    const inhalt = document.createElement('div');
    inhalt.className = 'fortschritt__overlay-inhalt';
    inhalt.innerHTML = `<div style="text-align:center;padding:24px;color:var(--md-sys-color-on-surface-variant)">${esc(t('allgemein.laden'))}</div>`;
    dialog.appendChild(inhalt);

    overlay.appendChild(dialog);
    document.body.style.overflow = 'hidden';

    const schliessen = () => {
        overlay.remove();
        document.body.style.overflow = '';
    };
    kopf.querySelector('.fortschritt__overlay-schliessen').addEventListener('click', schliessen);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) schliessen(); });

    try {
        const erg = await apiGet(`fortschritt/details.php?stufe=${stufe}&pro_seite=100`);
        if (!erg.erfolg) {
            inhalt.innerHTML = `<p style="padding:16px;color:var(--md-sys-color-error)">${esc(t('fortschritt.fehler_detail_laden'))}</p>`;
            return;
        }
        const eintraege = erg.daten.eintraege || [];
        _overlay_liste_rendern(inhalt, eintraege);
    } catch {
        inhalt.innerHTML = `<p style="padding:16px;color:var(--md-sys-color-error)">${esc(t('fortschritt.fehler_detail_laden'))}</p>`;
    }
}

function _overlay_liste_rendern(inhalt, eintraege) {
    if (eintraege.length === 0) {
        inhalt.innerHTML = `<p style="padding:16px;color:var(--md-sys-color-on-surface-variant)">${esc(t('fortschritt.keine_vokabeln_stufe'))}</p>`;
        return;
    }

    inhalt.innerHTML = '';
    const liste = document.createElement('ul');
    liste.className = 'fortschritt__overlay-liste';

    for (const e of eintraege) {
        const li = document.createElement('li');
        li.className = 'fortschritt__overlay-item';

        const text = document.createElement('div');
        text.className = 'fortschritt__overlay-item-text';
        text.innerHTML = `
            <span class="fortschritt__overlay-schwedisch">${esc(e.schwedisch)}</span>
            <span class="fortschritt__overlay-deutsch">${esc(e.deutsch)}</span>
        `;

        const sternBtn = document.createElement('button');
        sternBtn.className = 'fortschritt__overlay-stern' + (e.ist_favorit ? ' fortschritt__overlay-stern--aktiv' : '');
        sternBtn.title = e.ist_favorit ? t('fortschritt.favorit_entfernen') : t('fortschritt.favorit_markieren');
        sternBtn.innerHTML = `<span class="material-symbols-outlined">${e.ist_favorit ? 'star' : 'star_border'}</span>`;
        sternBtn.dataset.vokabelId = e.vokabel_id;
        sternBtn.dataset.istFavorit = e.ist_favorit ? '1' : '0';

        sternBtn.addEventListener('click', async () => {
            try {
                const res = await apiPost('favoriten/umschalten.php', { vokabel_id: e.vokabel_id });
                if (res.erfolg) {
                    const neu = res.daten.ist_favorit;
                    sternBtn.dataset.istFavorit = neu ? '1' : '0';
                    sternBtn.className = 'fortschritt__overlay-stern' + (neu ? ' fortschritt__overlay-stern--aktiv' : '');
                    sternBtn.title = neu ? t('fortschritt.favorit_entfernen') : t('fortschritt.favorit_markieren');
                    sternBtn.innerHTML = `<span class="material-symbols-outlined">${neu ? 'star' : 'star_border'}</span>`;
                }
            } catch { /* ignorieren */ }
        });

        li.appendChild(text);
        li.appendChild(sternBtn);
        liste.appendChild(li);
    }

    inhalt.appendChild(liste);
}

// ============================================
// Vokabel-Uebersicht
// ============================================

function _vokabeln_uebersicht_rendern(wrapper, stat_daten) {
    const gelernt    = stat_daten.vokabeln_gelernt    || 0;
    const wiederholt = stat_daten.vokabeln_wiederholt || 0;
    const faellig    = stat_daten.vokabeln_faellig    || 0;
    const neu        = stat_daten.vokabeln_neu        || 0;

    const bereich = document.createElement('section');
    bereich.className = 'fortschritt__vokabeln';

    const karte = document.createElement('div');
    karte.className = 'karte';
    karte.style.padding = '16px';

    karte.innerHTML = `
        <div class="karte__titel" style="margin-bottom:12px">${esc(t('dashboard.vokabel_uebersicht'))}</div>
        <div class="dashboard__vokabel-stats">
            <div class="dashboard__stat-chip">
                <span class="dashboard__stat-wert" style="color:var(--md-sys-color-tertiary)">${zahlFormatieren(gelernt)}</span>
                <span class="dashboard__stat-label">${esc(t('dashboard.stat_gelernt'))}</span>
            </div>
            <div class="dashboard__stat-chip">
                <span class="dashboard__stat-wert" style="color:var(--md-sys-color-primary)">${zahlFormatieren(wiederholt)}</span>
                <span class="dashboard__stat-label">${esc(t('dashboard.stat_wiederholt'))}</span>
            </div>
            <button class="dashboard__stat-chip dashboard__stat-chip--link" data-nav="/vokabeln?filter=faellig&von=fortschritt">
                <span class="dashboard__stat-wert" style="color:var(--vt-farbe-streak)">${zahlFormatieren(faellig)}</span>
                <span class="dashboard__stat-label">${esc(t('dashboard.stat_faellig'))} \u2197</span>
            </button>
            <button class="dashboard__stat-chip dashboard__stat-chip--link" data-nav="/vokabeln?filter=neu&von=fortschritt">
                <span class="dashboard__stat-wert" style="color:var(--md-sys-color-secondary)">${zahlFormatieren(neu)}</span>
                <span class="dashboard__stat-label">${esc(t('dashboard.stat_neu'))} \u2197</span>
            </button>
        </div>
    `;

    karte.querySelectorAll('[data-nav]').forEach(btn => {
        btn.addEventListener('click', () => navigieren(btn.dataset.nav));
    });

    bereich.appendChild(karte);
    wrapper.appendChild(bereich);
}

// ============================================
// Letzte Aktivitaeten (aus Statistik)
// ============================================

function _aktivitaeten_bereich_rendern(wrapper, aktivitaeten_daten) {
    const bereich = document.createElement('section');
    bereich.className = 'fortschritt__aktivitaeten';

    const karte = document.createElement('div');
    karte.className = 'karte';
    karte.style.padding = '16px';

    const titel = document.createElement('div');
    titel.className = 'karte__titel';
    titel.textContent = t('statistik.aktivitaeten');
    karte.appendChild(titel);

    const liste = document.createElement('div');
    liste.id = 'fortschritt-aktivitaeten-liste';
    karte.appendChild(liste);

    const pag = document.createElement('div');
    pag.id = 'fortschritt-paginierung';
    karte.appendChild(pag);

    bereich.appendChild(karte);
    wrapper.appendChild(bereich);

    if (aktivitaeten_daten) {
        _aktivitaeten_rendern(aktivitaeten_daten);
    }
}

function _aktivitaeten_rendern(daten) {
    const liste = document.getElementById('fortschritt-aktivitaeten-liste');
    const pag = document.getElementById('fortschritt-paginierung');
    if (!liste) return;

    liste.innerHTML = '';

    const eintraege = daten.eintraege || [];

    if (eintraege.length === 0) {
        liste.innerHTML = `<p style="color:var(--md-sys-color-on-surface-variant);padding:12px 0;">${esc(t('statistik.keine_aktivitaeten'))}</p>`;
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

    if (pag && daten.paginierung) {
        paginierung_rendern(pag, daten.paginierung, async (seite) => {
            const erg = await apiGet('statistik/aktivitaeten.php', { seite });
            if (erg.erfolg) {
                _aktivitaeten_rendern(erg.daten);
            }
        });
    }
}

function _relative_zeit(datum_str) {
    if (!datum_str) return '';

    const datum = new Date(datum_str);
    const jetzt = new Date();
    const diff_ms = jetzt - datum;
    const diff_min = Math.floor(diff_ms / 60000);
    const diff_std = Math.floor(diff_min / 60);
    const diff_tage = Math.floor(diff_std / 24);

    if (diff_min < 1) return t('statistik.zeit_gerade');
    if (diff_min < 60) return t('statistik.zeit_minuten', { anzahl: diff_min });
    if (diff_std < 24) return t('statistik.zeit_stunden', { anzahl: diff_std });
    if (diff_tage === 1) return t('statistik.zeit_gestern');
    if (diff_tage < 7) return t('statistik.zeit_tage', { anzahl: diff_tage });

    return datum.toLocaleDateString(aktuelle_sprache() === 'sv' ? 'sv-SE' : 'de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
