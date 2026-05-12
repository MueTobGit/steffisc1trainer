/**
 * Dashboard — Startseite nach Login
 *
 * Zeigt Begrüßung, Themenfeld-Kacheln (nach Kategorie sortiert) und Vokabel-Statistik.
 */

import { holen, abonnieren } from '../zustand.js';
import { navigieren } from '../router.js';
import { esc, zahlFormatieren } from '../hilfs-funktionen.js';
import { apiGet } from '../api-client.js';
import { t } from '../dienste/sprache.js';

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
            setTimeout(() => { abbestellen(); resolve(); }, 2000);
        });
        benutzer = holen('benutzer');
    }

    const vorname = benutzer?.vorname || benutzer?.benutzername || t('dashboard.nutzer_fallback');

    container.innerHTML = `
        <div class="dashboard">
            <section class="dashboard__begruessung">
                <div>
                    <h2>${t('dashboard.willkommen', { name: esc(vorname) })}</h2>
                    <p>${t('dashboard.willkommen_text')}</p>
                </div>
            </section>

            <section id="dashboard-themenfelder"></section>

            <section id="dashboard-vokabel-stats"></section>

            <footer class="dashboard__rechtliches">
                <a href="#/impressum" class="dashboard__rechtliches-link">${t('anmeldung.impressum_link')}</a>
            </footer>
        </div>
    `;

    await Promise.all([
        _themenfelder_laden(container),
        _vokabel_stats_laden(container),
    ]);
}

async function _themenfelder_laden(container) {
    const sektion = container.querySelector('#dashboard-themenfelder');
    if (!sektion) return;

    try {
        const [tfErg, favErg] = await Promise.all([
            apiGet('themenfelder/liste.php', { pro_seite: 500 }),
            apiGet('favoriten/laden.php'),
        ]);

        const themenfelder = tfErg.daten?.eintraege || [];
        const favAnzahl = (favErg.erfolg && Array.isArray(favErg.daten)) ? favErg.daten.length : 0;

        if (!tfErg.erfolg && favAnzahl === 0) return;

        // Sortieren: erst Kategoriename alphabetisch, dann Themenfeld-Titel alphabetisch
        themenfelder.sort((a, b) => {
            const katA = (a.kategorie_name || '').toLowerCase();
            const katB = (b.kategorie_name || '').toLowerCase();
            const katCmp = katA.localeCompare(katB, 'de');
            if (katCmp !== 0) return katCmp;
            return (a.titel || '').localeCompare(b.titel || '', 'de');
        });

        // Nach Kategorie gruppieren
        const gruppen = new Map();
        for (const tf of themenfelder) {
            const katName = tf.kategorie_name || t('dashboard.keine_kategorie');
            if (!gruppen.has(katName)) gruppen.set(katName, []);
            gruppen.get(katName).push(tf);
        }

        let html = '';

        // Favoriten-Kachel (erste Position, hervorgehoben)
        if (favAnzahl > 0) {
            html += `
                <div class="dashboard__tf-gruppe">
                    <div class="dashboard__tf-grid">
                        <div class="karte dashboard__tf-karte dashboard__tf-karte--favoriten">
                            <div class="dashboard__tf-favoriten-kopf">
                                <span class="material-symbols-outlined dashboard__tf-favoriten-stern">star</span>
                                <div class="dashboard__tf-titel">${esc(t('dashboard.favoriten_titel'))}</div>
                            </div>
                            <div class="dashboard__tf-favoriten-anzahl">${esc(t('dashboard.favoriten_anzahl', { anzahl: favAnzahl }))}</div>
                            <div class="dashboard__tf-buttons">
                                <button class="btn-icon dashboard__tf-btn" title="${t('dashboard.karte_training')}"
                                    data-action="training-fav">
                                    <span class="material-symbols-outlined">fitness_center</span>
                                </button>
                                <button class="btn-icon dashboard__tf-btn" title="${t('dashboard.karte_schnellueben')}"
                                    data-action="schnellueben-fav">
                                    <span class="material-symbols-outlined">bolt</span>
                                </button>
                                <button class="btn-icon dashboard__tf-btn" title="${t('dashboard.karte_vokabeln')}"
                                    data-action="lernen-fav">
                                    <span class="material-symbols-outlined">menu_book</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        for (const [katName, felder] of gruppen) {
            html += `
                <div class="dashboard__tf-gruppe">
                    <h3 class="dashboard__tf-kategorie">${esc(katName)}</h3>
                    <div class="dashboard__tf-grid">
                        ${felder.map(tf => `
                            <div class="karte dashboard__tf-karte">
                                <div class="dashboard__tf-titel">${esc(tf.titel)}</div>
                                <div class="dashboard__tf-buttons">
                                    <button class="btn-icon dashboard__tf-btn" title="${t('dashboard.karte_training')}"
                                        data-action="training" data-id="${tf.id}">
                                        <span class="material-symbols-outlined">fitness_center</span>
                                    </button>
                                    <button class="btn-icon dashboard__tf-btn" title="${t('dashboard.karte_schnellueben')}"
                                        data-action="schnellueben" data-id="${tf.id}">
                                        <span class="material-symbols-outlined">bolt</span>
                                    </button>
                                    <button class="btn-icon dashboard__tf-btn" title="${t('dashboard.karte_vokabeln')}"
                                        data-action="lernen" data-id="${tf.id}">
                                        <span class="material-symbols-outlined">menu_book</span>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        sektion.innerHTML = html;

        sektion.querySelectorAll('.dashboard__tf-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const action = btn.dataset.action;
                if (action === 'training')         navigieren(`/training?lektion=${id}`);
                else if (action === 'schnellueben') navigieren(`/schnellueben?lektion=${id}`);
                else if (action === 'lernen')       navigieren(`/vokabeln?themenfeld_id=${id}&von=dashboard`);
                else if (action === 'training-fav')      navigieren('/training?filter=favorit');
                else if (action === 'schnellueben-fav')  navigieren('/schnellueben?filter=favorit');
                else if (action === 'lernen-fav')        navigieren('/vokabeln?filter=favorit');
            });
        });

    } catch (_) {
        // Themenfelder-Sektion ist nicht kritisch
    }
}

async function _vokabel_stats_laden(container) {
    const sektion = container.querySelector('#dashboard-vokabel-stats');
    if (!sektion) return;

    try {
        const res = await apiGet('statistik/benutzer.php');
        if (!res.erfolg) return;

        const s = res.daten || {};
        const gelernt    = s.vokabeln_gelernt    || 0;
        const wiederholt = s.vokabeln_wiederholt  || 0;
        const faellig    = s.vokabeln_faellig     || 0;
        const neu        = s.vokabeln_neu         || 0;

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
                        <span class="dashboard__stat-wert" style="color:var(--md-sys-color-error)">${zahlFormatieren(faellig)}</span>
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
        // Statistik ist nicht kritisch
    }
}

export function stil_einfuegen() {
    if (document.getElementById('dashboard-stil')) return;

    const stil = document.createElement('style');
    stil.id = 'dashboard-stil';
    stil.textContent = `
        .dashboard {
            max-width: 900px;
        }

        .dashboard__begruessung {
            margin-bottom: 24px;
        }

        .dashboard__begruessung h2 {
            font-size: var(--md-sys-typescale-headline-small-size);
            font-weight: 500;
            margin-bottom: 4px;
        }

        .dashboard__begruessung p {
            color: var(--md-sys-color-on-surface-variant);
        }

        /* Themenfelder */

        .dashboard__tf-gruppe {
            margin-bottom: 24px;
        }

        .dashboard__tf-kategorie {
            font-size: var(--md-sys-typescale-label-medium-size, 12px);
            font-weight: 600;
            color: var(--md-sys-color-on-surface-variant);
            text-transform: uppercase;
            letter-spacing: 0.06em;
            margin: 0 0 8px;
        }

        .dashboard__tf-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
            gap: 8px;
        }

        .dashboard__tf-karte {
            padding: 16px 12px 12px;
            min-height: 130px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            text-align: center;
        }

        .dashboard__tf-karte--favoriten {
            background: var(--md-sys-color-secondary-container);
        }

        .dashboard__tf-karte--favoriten .dashboard__tf-btn.btn-icon {
            color: var(--md-sys-color-on-secondary-container);
        }

        .dashboard__tf-karte--favoriten .dashboard__tf-btn.btn-icon:hover {
            color: var(--md-sys-color-secondary);
            background: color-mix(in srgb, var(--md-sys-color-secondary) 15%, transparent);
        }

        .dashboard__tf-favoriten-kopf {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            flex: 1;
        }

        .dashboard__tf-favoriten-stern {
            font-size: 20px;
            color: var(--md-sys-color-secondary);
            flex-shrink: 0;
        }

        .dashboard__tf-favoriten-anzahl {
            font-size: 12px;
            color: var(--md-sys-color-on-secondary-container);
            opacity: 0.8;
            flex-shrink: 0;
        }

        .dashboard__tf-titel {
            font-size: var(--md-sys-typescale-body-large-size, 16px);
            font-weight: 500;
            color: var(--md-sys-color-on-surface);
            line-height: 1.3;
            flex: 1;
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden;
            word-break: break-word;
        }

        .dashboard__tf-buttons {
            display: flex;
            gap: 4px;
            justify-content: center;
            flex-shrink: 0;
        }

        .dashboard__tf-btn.btn-icon {
            padding: 7px;
            color: var(--md-sys-color-on-surface-variant);
        }

        .dashboard__tf-btn.btn-icon .material-symbols-outlined {
            font-size: 26px;
        }

        .dashboard__tf-btn.btn-icon:hover {
            color: var(--md-sys-color-primary);
            background: var(--md-sys-color-primary-container);
        }

        /* Statistik */

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

        @media (max-width: 600px) {
            .dashboard__tf-grid {
                grid-template-columns: 1fr;
            }
        }
    `;
    document.head.appendChild(stil);
}

export function aufraeumen() {}
