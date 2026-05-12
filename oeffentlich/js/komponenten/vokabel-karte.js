/**
 * Vokabel-Karte — Wiederverwendbare Karteikarten-Komponente
 *
 * Zeigt eine Vokabel als Karteikarte mit:
 * - Schwedisches Wort + Wortart/Genus-Tags
 * - Grammatische Formen (level-gefiltert)
 * - Deutsche Uebersetzung (verdeckbar)
 * - TTS-Button (Vorlesen)
 * - STT-Button (Aussprache ueben)
 * - Favorit-Button (Stern)
 * - Abdeck-/Aufdeckfunktion
 *
 * Wiederverwendbar in Phase 3 (Lernmodus), 4 (Training), 5 (Schnellueben).
 */

import { esc } from '../hilfs-funktionen.js';
import {
    vorlesen,
    erkennung_starten,
    aussprache_bewerten,
    tts_verfuegbar,
    stt_verfuegbar
} from '../dienste/sprach-dienst.js';
import { t } from '../dienste/sprache.js';

// ============================================
// Form-Schema nach Wortart
// ============================================

/**
 * Reihenfolge und Bezeichnungen der Formen je Wortart.
 * schema: Schemazeile (Bezeichnungen in Reihenfolge)
 * felder: Schluessel aus vokabel.formen, in gleicher Reihenfolge
 */
const WORTART_SCHEMA = {
    'Nomen': {
        get schema() { return [t('vokabel_karte.form_unbest_sg'), t('vokabel_karte.form_best_sg'), t('vokabel_karte.form_unbest_pl'), t('vokabel_karte.form_best_pl')]; },
        felder: ['unbestimmt_singular', 'bestimmt_singular', 'unbestimmt_plural', 'bestimmt_plural'],
    },
    'Verb': {
        get schema() { return [t('vokabel_karte.form_infinitiv'), t('vokabel_karte.form_praesens'), t('vokabel_karte.form_praeteritum'), t('vokabel_karte.form_supinum')]; },
        felder: ['infinitiv', 'praesens', 'praeteritum', 'supinum'],
    },
    'Adjektiv': {
        get schema() { return [t('vokabel_karte.form_grundform'), t('vokabel_karte.form_neutrum'), t('vokabel_karte.form_best_form')]; },
        felder: ['grundform', 'neutrum_form', 'bestimmte_form'],
    },
};

// ============================================
// Haupt-Export
// ============================================

/**
 * Vokabel-Karte als DOM-Element erstellen.
 *
 * @param {object} vokabel Vokabel-Datenobjekt
 *   { id, schwedisch, deutsch, wortart, genus, verbgruppe, sprachniveau,
 *     formen: [{form_bezeichnung, form_wert, reihenfolge}] }
 *
 * @param {object} optionen Darstellungsoptionen
 *   {
 *     abdecken: 'keine'|'sv'|'de',       Welche Seite verdecken
 *     aufgedeckt: boolean,                 Diese Karte einzeln aufgedeckt?
 *     ist_favorit: boolean,                Favoriten-Status
 *     sichtbare_formen: string[]|null,     Erlaubte form_bezeichnungen (null = alle)
 *     onFavoritUmschalten: (id) => void,   Callback bei Favorit-Toggle
 *     onAufdecken: (id) => void,           Callback bei Aufdecken
 *   }
 *
 * @returns {HTMLElement} Fertiges Karten-Element mit Event-Listenern
 */
export function vokabel_karte_erstellen(vokabel, optionen = {}) {
    const {
        abdecken = 'keine',
        aufgedeckt = true,
        ist_favorit = false,
        sichtbare_formen = null,
        onFavoritUmschalten = null,
        onAufdecken = null,
    } = optionen;

    const karte = document.createElement('div');
    karte.className = 'vk-karte karte';
    karte.dataset.id = vokabel.id;

    // --- Verdeckt-Status berechnen ---
    const sv_verdeckt = abdecken === 'sv' && !aufgedeckt;
    const de_verdeckt = abdecken === 'de' && !aufgedeckt;

    // --- Formen-HTML aufbauen ---
    const formen_html = _formen_html(vokabel, sichtbare_formen, sv_verdeckt);

    // --- TTS-Button (nur wenn verfuegbar) ---
    const tts_html = tts_verfuegbar() ? `
        <button class="btn-icon vk-karte__tts" title="${t('frage.vorlesen')}" data-aktion="tts">
            <span class="material-symbols-outlined">volume_up</span>
        </button>` : '';

    // --- STT-Button (nur wenn verfuegbar) ---
    const stt_html = stt_verfuegbar() ? `
        <button class="btn-icon vk-karte__stt" title="${t('sprech.aussprache_ueben')}" data-aktion="stt">
            <span class="material-symbols-outlined">mic</span>
        </button>` : '';

    // --- Favorit-Button ---
    const fav_icon = ist_favorit ? 'star' : 'star_border';
    const fav_klasse = ist_favorit ? 'vk-karte__favorit--aktiv' : '';

    // --- Schwedisch-Bereich ---
    // Genus-Präfix: (en) oder (ett) vor dem Wort, nur bei Nomen
    const genus_praefix = (vokabel.wortart === 'Nomen' && vokabel.genus)
        ? `<span class="vk-karte__genus">(${esc(vokabel.genus)})</span> `
        : '';

    const sv_html = sv_verdeckt
        ? `<span class="vk-karte__verdeckt-text" data-aktion="aufdecken">${t('vokabel_karte.aufdecken')}</span>`
        : `<span class="vk-karte__schwedisch">${genus_praefix}${esc(vokabel.schwedisch)}</span>`;

    // --- Deutsch-Bereich ---
    const de_html = de_verdeckt
        ? `<span class="vk-karte__verdeckt-text" data-aktion="aufdecken">${t('vokabel_karte.aufdecken')}</span>`
        : `<span class="vk-karte__deutsch">${esc(vokabel.deutsch)}</span>`;


    // --- Karten-HTML zusammenbauen ---
    // Wenn Karte verdeckt ist: gesamte Karte ist klickbar zum Aufdecken
    const karte_aufdecken_klasse = (sv_verdeckt || de_verdeckt) ? 'vk-karte--verdeckt' : '';

    karte.innerHTML = `
        <div class="vk-karte__kopf">
            <div class="vk-karte__sv">
                ${sv_html}
            </div>
            <div class="vk-karte__aktionen">
                ${tts_html}
                ${stt_html}
                <button class="btn-icon vk-karte__favorit ${fav_klasse}"
                        title="${ist_favorit ? t('vokabel_karte.favorit_entfernen') : t('vokabel_karte.favorit_hinzufuegen')}"
                        data-aktion="favorit">
                    <span class="material-symbols-outlined">${fav_icon}</span>
                </button>
            </div>
        </div>
        ${formen_html}
        <div class="vk-karte__de ${de_verdeckt ? 'vk-karte__verdeckt-bereich' : ''}">
            ${de_html}
        </div>
        <div class="vk-karte__stt-ergebnis versteckt" id="stt-ergebnis-${vokabel.id}"></div>
    `;

    if (karte_aufdecken_klasse) karte.classList.add('vk-karte--verdeckt');

    // ============================================
    // Event-Listener
    // ============================================

    // --- TTS: Vorlesen ---
    karte.querySelector('[data-aktion="tts"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        btn.classList.add('vk-karte__tts--aktiv');
        vorlesen(vokabel.schwedisch, 'sv-SE').finally(() => {
            btn.classList.remove('vk-karte__tts--aktiv');
        });
    });

    // --- STT: Spracherkennung ---
    karte.querySelector('[data-aktion="stt"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        const icon = btn.querySelector('.material-symbols-outlined');

        // Hoer-Zustand anzeigen
        btn.classList.add('vk-karte__stt--aktiv');
        icon.textContent = 'hearing';

        try {
            const erkannt = await erkennung_starten('sv-SE');
            const bewertung = aussprache_bewerten(erkannt, vokabel.schwedisch);
            _stt_ergebnis_anzeigen(karte, vokabel.id, erkannt, bewertung);
        } catch (err) {
            _stt_ergebnis_anzeigen(karte, vokabel.id, '', {
                prozent: 0,
                bewertung: 'fehler'
            });
        } finally {
            btn.classList.remove('vk-karte__stt--aktiv');
            icon.textContent = 'mic';
        }
    });

    // --- Favorit: Toggle ---
    karte.querySelector('[data-aktion="favorit"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onFavoritUmschalten) {
            onFavoritUmschalten(vokabel.id);
        }
    });

    // --- Aufdecken: Klick auf verdeckten Bereich oder gesamte Karte ---
    karte.querySelectorAll('[data-aktion="aufdecken"]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (onAufdecken) {
                onAufdecken(vokabel.id);
            }
        });
    });

    // Klick auf beliebige Stelle der Karte deckt auf (wenn Karte verdeckt)
    if ((sv_verdeckt || de_verdeckt) && onAufdecken) {
        karte.addEventListener('click', (e) => {
            // Nicht wenn Buttons geklickt
            if (e.target.closest('button')) return;
            onAufdecken(vokabel.id);
        });
    }

    return karte;
}

// ============================================
// Private Helfer
// ============================================

/**
 * Formen-HTML fuer die Karte generieren.
 * Zeigt Schema-Zeile + darunter die Werte in fettem Schriftschnitt.
 * Alle vorhandenen Formen werden angezeigt (kein Level-Filter).
 */
function _formen_html(vokabel, sichtbare_formen, sv_verdeckt) {
    if (!vokabel.formen || vokabel.formen.length === 0) {
        return '';
    }

    // Formen in eine Map umwandeln: bezeichnung → wert
    const formen_map = new Map();
    for (const f of vokabel.formen) {
        formen_map.set(f.form_bezeichnung, f.form_wert);
    }

    // Schema fuer diese Wortart bestimmen
    const schema_def = WORTART_SCHEMA[vokabel.wortart];

    if (schema_def) {
        // Nur Felder rendern, fuer die auch Werte vorhanden sind
        const vorhandene_felder = schema_def.felder.filter(f => formen_map.has(f));
        if (vorhandene_felder.length === 0) return '';

        // Jede Form als eigene Zeile: Label links, Wert rechts (CSS-Grid)
        const paare = vorhandene_felder.map(f => {
            const orig_idx = schema_def.felder.indexOf(f);
            const label = schema_def.schema[orig_idx] || f;
            const wert = sv_verdeckt
                ? '<span class="vk-karte__verdeckt">???</span>'
                : esc(formen_map.get(f) || '—');
            return `<span class="vk-karte__form-schema-item">${esc(label)}</span>` +
                   `<span class="vk-karte__form-wert-item">${wert}</span>`;
        }).join('');

        return `<div class="vk-karte__formen">${paare}</div>`;
    }

    // Fallback fuer andere Wortarten: alle vorhandenen Formen als Label:Wert
    const items = Array.from(formen_map.entries()).map(([bezeichnung, wert]) => {
        const wert_html = sv_verdeckt
            ? '<span class="vk-karte__verdeckt">???</span>'
            : esc(wert);
        const i18n_key = 'vokabel_karte.form_' + bezeichnung;
        const uebersetzt = t(i18n_key);
        const label = uebersetzt !== i18n_key ? uebersetzt : bezeichnung;
        return `
            <span class="vk-karte__form">
                <span class="vk-karte__form-label">${esc(label)}</span>
                <span class="vk-karte__form-wert-item">${wert_html}</span>
            </span>`;
    }).join('');

    return `<div class="vk-karte__formen vk-karte__formen--fallback">${items}</div>`;
}

/**
 * STT-Ergebnis in der Karte anzeigen.
 */
function _stt_ergebnis_anzeigen(karte, vokabelId, erkannt, bewertung) {
    const container = karte.querySelector(`#stt-ergebnis-${vokabelId}`);
    if (!container) return;

    container.classList.remove('versteckt');

    const farben = {
        'super':   'var(--md-sys-color-tertiary)',
        'fast':    'var(--md-sys-color-secondary)',
        'nochmal': 'var(--md-sys-color-error)',
        'fehler':  'var(--md-sys-color-error)',
    };

    const texte = {
        'super':   t('vokabel_karte.stt_super', {prozent: bewertung.prozent}),
        'fast':    t('vokabel_karte.stt_fast', {prozent: bewertung.prozent}),
        'nochmal': t('vokabel_karte.stt_nochmal', {prozent: bewertung.prozent}),
        'fehler':  t('vokabel_karte.stt_fehler'),
    };

    container.innerHTML = `
        <span class="vk-karte__stt-bewertung" style="color: ${farben[bewertung.bewertung]}">
            ${texte[bewertung.bewertung]}
        </span>
        ${erkannt ? `<span class="vk-karte__stt-erkannt">${t('vokabel_karte.erkannt', { text: esc(erkannt) })}</span>` : ''}
    `;

    // Auto-Hide nach 5 Sekunden
    setTimeout(() => {
        container.classList.add('versteckt');
    }, 5000);
}
