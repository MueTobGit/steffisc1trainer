/**
 * Frage-Anzeige — Wiederverwendbare Trainings-Frage-Komponente
 *
 * 3 Modi: 'eingabe' (Frage beantworten), 'ergebnis' (Ergebnis zeigen), 'nachtippen' (Loesung abtippen).
 * Genutzt von training.js und schnellueben.js.
 */

import { esc } from '../hilfs-funktionen.js';
import { vorlesen, tts_verfuegbar } from '../dienste/sprach-dienst.js';
import { apiGet, apiPost } from '../api-client.js';
import { t } from '../dienste/sprache.js';

// Wortarten für die Grammatik-Button-Anzeige (muss vor allen Funktionen stehen)
const _GRAMMATIK_WORTARTEN = new Set(['Nomen', 'Verb', 'Adjektiv']);

/**
 * Frage-Anzeige erstellen
 *
 * @param {object} frage Frage-Daten vom Server
 * @param {object} optionen Callbacks und Zustand
 * @returns {HTMLElement}
 */
export function frage_anzeige_erstellen(frage, optionen = {}) {
    const {
        onAntwort = () => {},
        onTrotzdemRichtig = () => {},
        onNachtippen = () => {},
        onWeiter = () => {},
        onBeenden = null,            // optional: Training vorzeitig beenden
        modus = 'eingabe',           // 'eingabe' | 'ergebnis' | 'nachtippen'
        ergebnis = null,
        gesamt = 0,
        autovorlesen = false,        // Richtige Antwort nach Ergebnis automatisch vorlesen
        auto_tts_frage = false,      // Frage/Wort beim Einblenden automatisch vorlesen
        trotzdem_gesperrt = false,   // true = "Trotzdem richtig"-Button ausblenden
    } = optionen;

    const container = document.createElement('div');
    container.className = 'frage-anzeige';

    if (modus === 'ergebnis' && ergebnis) {
        if (ergebnis.richtig && ergebnis.ist_tippfehler) {
            container.classList.add('frage-anzeige--tippfehler');
        } else if (ergebnis.richtig) {
            container.classList.add('frage-anzeige--richtig');
        } else {
            container.classList.add('frage-anzeige--falsch');
        }
    }

    // --- Kopf: Fortschritt + Typ-Badge + Beenden-Button ---
    const kopf = document.createElement('div');
    kopf.className = 'frage-anzeige__kopf';

    const fortschritt_text = document.createElement('span');
    fortschritt_text.className = 'frage-anzeige__fortschritt';
    fortschritt_text.textContent = t('frage.fortschritt', {nr: frage.index + 1, gesamt: gesamt});
    kopf.appendChild(fortschritt_text);

    const kopf_rechts = document.createElement('div');
    kopf_rechts.className = 'frage-anzeige__kopf-rechts';

    const badge = document.createElement('span');
    badge.className = `frage-badge frage-badge--${frage.typ}`;
    const typ_labels = { vokabel: t('training.typ_vokabel'), satz: t('training.typ_satz'), flexion: t('training.typ_flexion') };
    badge.textContent = typ_labels[frage.typ] || frage.typ;
    kopf_rechts.appendChild(badge);

    // Meta-Badge: Wortart + Genus/Gruppe + Niveau
    if (frage.vokabel_wortart) {
        const meta = document.createElement('span');
        meta.className = 'frage-meta-badge';
        let label = frage.vokabel_wortart;
        // Bei Flexion: kein Genus/Gruppe anzeigen (wäre ein Tipp!)
        if (frage.typ !== 'flexion') {
            if (frage.vokabel_verbgruppe)    label += ` Gr.${frage.vokabel_verbgruppe}`;
            else if (frage.vokabel_genus)    label += ` (${frage.vokabel_genus})`;
        }
        if (frage.vokabel_niveau)        label += ` · ${frage.vokabel_niveau}`;
        meta.textContent = label;
        meta.dataset.wortart = frage.vokabel_wortart.toLowerCase();
        kopf_rechts.appendChild(meta);

        // Grammatik-Button im Header — immer für Nomen/Verb/Adjektiv bei Vokabel-Fragen
        if (frage.typ === 'vokabel' && _GRAMMATIK_WORTARTEN.has(frage.vokabel_wortart)) {
            kopf_rechts.appendChild(_grammatik_icon_button(frage.grammatik_regel_id ?? null, '1.2rem'));
        }
    }

    // Beenden-Button (X)
    if (typeof onBeenden === 'function') {
        const beenden_btn = document.createElement('button');
        beenden_btn.className = 'btn-icon frage-anzeige__beenden-btn';
        beenden_btn.title = t('frage.beenden_title');
        beenden_btn.innerHTML = '<span class="material-symbols-outlined">close</span>';
        beenden_btn.addEventListener('click', () => onBeenden());
        kopf_rechts.appendChild(beenden_btn);
    }

    kopf.appendChild(kopf_rechts);
    container.appendChild(kopf);

    // --- Je nach Modus ---
    if (modus === 'eingabe') {
        _eingabe_modus(container, frage, onAntwort);
        // Auto-TTS: Frage/Wort automatisch vorlesen wenn gewünscht
        if (auto_tts_frage && tts_verfuegbar() && frage.tts_text) {
            setTimeout(() => vorlesen(frage.tts_text, frage.tts_sprache || 'sv-SE'), 300);
        }
    } else if (modus === 'ergebnis') {
        _ergebnis_modus(container, frage, ergebnis, onTrotzdemRichtig, onWeiter, autovorlesen, trotzdem_gesperrt);
    } else if (modus === 'nachtippen') {
        _nachtippen_modus(container, frage, ergebnis, onNachtippen, onWeiter);
    }

    return container;
}

// ============================================
// Grammatik-Popup
// ============================================

// Lokale Kopie der Form-Labels (identisch zu grammatik.js/FORM_LABELS)
const _FORM_LABELS = {
    unbestimmt_singular: t('frage.form_unbest_sg'),
    bestimmt_singular:   t('frage.form_best_sg'),
    unbestimmt_plural:   t('frage.form_unbest_pl'),
    bestimmt_plural:     t('frage.form_best_pl'),
    infinitiv:           t('frage.form_infinitiv'),
    praesens:            t('frage.form_praesens'),
    praeteritum:         t('frage.form_praeteritum'),
    supinum:             t('frage.form_supinum'),
    imperativ:           t('frage.form_imperativ'),
    perfekt_partizip:    t('frage.form_perfekt_partizip'),
    s_form:              t('frage.form_s_form'),
    grundform:           t('frage.form_grundform'),
    neutrum_form:        t('frage.form_neutrum_form'),
    komparativ:          t('frage.form_komparativ'),
    superlativ:          t('frage.form_superlativ'),
    bestimmte_form:      t('frage.form_best_form'),
};

async function _grammatik_popup_oeffnen(regelId) {
    // Overlay
    const overlay = document.createElement('div');
    overlay.className = 'grammatik-popup-overlay';

    const popup = document.createElement('div');
    popup.className = 'grammatik-popup';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-modal', 'true');

    // Schließen-Button
    const schliessen_btn = document.createElement('button');
    schliessen_btn.className = 'grammatik-popup-schliessen';
    schliessen_btn.title = t('frage.grammatik_schliessen');
    schliessen_btn.innerHTML = '<span class="material-symbols-outlined">close</span>';

    const inhalt = document.createElement('div');
    inhalt.className = 'grammatik-popup-inhalt';

    popup.appendChild(schliessen_btn);
    popup.appendChild(inhalt);
    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    // Schließen-Logik
    const schliessen = () => {
        overlay.remove();
        document.removeEventListener('keydown', _esc_handler);
    };
    const _esc_handler = (e) => { if (e.key === 'Escape') schliessen(); };
    schliessen_btn.addEventListener('click', schliessen);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) schliessen(); });
    document.addEventListener('keydown', _esc_handler);

    // Kein Eintrag
    if (!regelId) {
        inhalt.innerHTML = `
            <div class="grammatik-popup-kein-eintrag">
                <span class="material-symbols-outlined">info</span>
                <p>${t('frage.keine_grammatik')}</p>
            </div>`;
        return;
    }

    // Laden-Indikator
    inhalt.innerHTML = '<div class="grammatik-popup-laden"><span class="material-symbols-outlined">progress_activity</span></div>';

    const antwort = await apiGet('grammatik/detail.php?id=' + regelId);
    if (!antwort.erfolg || !antwort.daten?.regel) {
        inhalt.innerHTML = `<p class="grammatik-popup-fehler">${t('frage.grammatik_fehler')}</p>`;
        return;
    }

    const regel = antwort.daten.regel;
    inhalt.innerHTML = '';

    // Titel
    const titel = document.createElement('h2');
    titel.className = 'grammatik-popup-titel';
    titel.textContent = `${regel.wortart} — ${regel.genus_gruppe}`;
    inhalt.appendChild(titel);

    // Form-Chips
    if (regel.formen?.length) {
        const formen_el = document.createElement('div');
        formen_el.className = 'grammatik-popup-formen';
        regel.formen.forEach(f => {
            const chip = document.createElement('span');
            chip.className = 'grammatik-form-chip';
            chip.textContent = _FORM_LABELS[f] ?? f;
            formen_el.appendChild(chip);
        });
        inhalt.appendChild(formen_el);
    }

    // Regeltext (HTML vom Server)
    const regeltext_el = document.createElement('div');
    regeltext_el.className = 'grammatik-regeltext';
    regeltext_el.innerHTML = regel.regeltext;
    inhalt.appendChild(regeltext_el);
}

// Grammatik-Icon-Button: öffnet Popup statt zu navigieren
function _grammatik_icon_button(regelId, fontSize = '1.4rem') {
    const btn = document.createElement('button');
    btn.className = 'grammatik-icon-btn';
    btn.title = regelId ? t('frage.grammatikregel_title') : t('frage.keine_grammatikregel');
    btn.style.fontSize = fontSize;
    if (!regelId) btn.classList.add('grammatik-icon-btn--kein-eintrag');
    btn.innerHTML = '<span class="material-symbols-outlined">assignment_globe</span>';
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        _grammatik_popup_oeffnen(regelId);
    });
    return btn;
}

// ============================================
// TTS-Button Hilfsfunktion
// ============================================

function _tts_button(frage) {
    if (!tts_verfuegbar() || !frage.tts_text || !frage.tts_sprache) return null;
    const btn = document.createElement('button');
    btn.className = 'btn-icon frage-anzeige__tts';
    btn.title = t('frage.vorlesen');
    btn.innerHTML = '<span class="material-symbols-outlined">volume_up</span>';
    btn.addEventListener('click', () => vorlesen(frage.tts_text, frage.tts_sprache));
    return btn;
}

// ============================================
// Favoriten-Button Hilfsfunktion
// ============================================

function _favorit_button(vokabel_id) {
    let ist_favorit = false;

    const btn = document.createElement('button');
    btn.className = 'btn-icon frage-anzeige__favorit';
    btn.title = t('frage.favorit_hinzufuegen');
    btn.innerHTML = '<span class="material-symbols-outlined">star_border</span>';

    btn.addEventListener('click', async () => {
        const erg = await apiPost('favoriten/umschalten.php', { vokabel_id: vokabel_id });
        if (!erg.erfolg) return;
        ist_favorit = erg.daten.ist_favorit;
        const icon = btn.querySelector('.material-symbols-outlined');
        icon.textContent = ist_favorit ? 'star' : 'star_border';
        btn.classList.toggle('frage-anzeige__favorit--aktiv', ist_favorit);
        btn.title = ist_favorit ? t('frage.favorit_entfernen') : t('frage.favorit_hinzufuegen');
    });

    return btn;
}

// ============================================
// Modus: Eingabe
// ============================================

function _eingabe_modus(container, frage, onAntwort) {
    // Frage-Bereich
    const frage_bereich = document.createElement('div');
    frage_bereich.className = 'frage-anzeige__frage';

    const frage_text = document.createElement('div');
    frage_text.className = 'frage-anzeige__frage-text';
    frage_text.textContent = frage.frage_text;
    frage_bereich.appendChild(frage_text);

    // Kontext bei Satz-Fragen: Stichwort immer sichtbar, Satzkontextübersetzung hinter Hint
    if (frage.typ === 'satz') {
        const hint_zeile = document.createElement('div');
        hint_zeile.className = 'frage-anzeige__hint-zeile';

        // Stichwort (deutsche Grundform) — immer sichtbar
        if (frage.stichwort) {
            const stichwort_el = document.createElement('span');
            stichwort_el.className = 'frage-anzeige__stichwort';
            stichwort_el.textContent = frage.stichwort;
            hint_zeile.appendChild(stichwort_el);
        }

        // Grammatik-Symbol — immer für Nomen/Verb/Adjektiv
        if (_GRAMMATIK_WORTARTEN.has(frage.vokabel_wortart)) {
            hint_zeile.appendChild(_grammatik_icon_button(frage.grammatik_regel_id ?? null, '1.1rem'));
        }

        // Hint-Button für den deutschen Satz
        if (frage.kontext) {
            const hint_btn = document.createElement('button');
            hint_btn.type = 'button';
            hint_btn.className = 'btn-icon frage-anzeige__hint-btn';
            hint_btn.title = t('frage.satz_anzeigen');
            hint_btn.innerHTML = '<span class="material-symbols-outlined">help_outline</span>';

            const hint_text = document.createElement('span');
            hint_text.className = 'frage-anzeige__hint-text versteckt';
            hint_text.textContent = frage.kontext;

            let hint_sichtbar = false;
            hint_btn.addEventListener('click', () => {
                hint_sichtbar = !hint_sichtbar;
                hint_text.classList.toggle('versteckt', !hint_sichtbar);
                hint_btn.querySelector('.material-symbols-outlined').textContent =
                    hint_sichtbar ? 'help' : 'help_outline';
                hint_btn.title = hint_sichtbar ? t('frage.satz_verbergen') : t('frage.satz_anzeigen');
            });

            hint_zeile.appendChild(hint_btn);
            hint_zeile.appendChild(hint_text);
        }

        frage_bereich.appendChild(hint_zeile);
    } else if (frage.hinweis) {
        // Normaler Hinweis (Genus, Wortart) — immer sichtbar
        const hinweis = document.createElement('div');
        hinweis.className = 'frage-anzeige__hinweis';
        hinweis.textContent = frage.hinweis;
        frage_bereich.appendChild(hinweis);

        // Grammatik-Symbol bei Flexions-Hinweis — immer für Nomen/Verb/Adjektiv
        if (frage.typ === 'flexion' && _GRAMMATIK_WORTARTEN.has(frage.vokabel_wortart)) {
            hinweis.appendChild(_grammatik_icon_button(frage.grammatik_regel_id ?? null, '1.8rem'));
        }
    }

    // TTS-Button
    const tts_btn = _tts_button(frage);
    if (tts_btn) frage_bereich.appendChild(tts_btn);

    container.appendChild(frage_bereich);

    // Eingabe-Bereich
    const eingabe_bereich = document.createElement('div');
    eingabe_bereich.className = 'frage-anzeige__eingabe';

    const textfeld = document.createElement('input');
    textfeld.type = 'text';
    textfeld.className = 'eingabe frage-anzeige__textfeld';
    textfeld.placeholder = t('frage.placeholder');
    textfeld.autocomplete = 'off';
    textfeld.autocorrect = 'off';
    textfeld.spellcheck = false;

    textfeld.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onAntwort(textfeld.value.trim());
        }
    });

    eingabe_bereich.appendChild(textfeld);
    container.appendChild(eingabe_bereich);

    // Aktionen
    const aktionen = document.createElement('div');
    aktionen.className = 'frage-anzeige__aktionen';

    const pruefen_btn = document.createElement('button');
    pruefen_btn.className = 'btn btn--gefuellt';
    pruefen_btn.textContent = t('frage.pruefen');
    pruefen_btn.addEventListener('click', () => onAntwort(textfeld.value.trim()));
    aktionen.appendChild(pruefen_btn);

    container.appendChild(aktionen);

    // Auto-Focus
    requestAnimationFrame(() => textfeld.focus());
}

// ============================================
// Modus: Ergebnis
// ============================================

function _ergebnis_modus(container, frage, ergebnis, onTrotzdemRichtig, onWeiter, autovorlesen = false, trotzdem_gesperrt = false) {
    // Automatisch vorlesen wenn aktiviert
    if (autovorlesen && tts_verfuegbar() && frage.tts_text && frage.tts_sprache) {
        // Kurze Verzögerung damit die UI erst gerendert ist
        setTimeout(() => vorlesen(frage.tts_text, frage.tts_sprache), 300);
    }

    // Frage (ausgegraut) + TTS + Favorit
    const frage_bereich = document.createElement('div');
    frage_bereich.className = 'frage-anzeige__frage frage-anzeige__frage--ausgegraut';

    const frage_text = document.createElement('div');
    frage_text.className = 'frage-anzeige__frage-text';

    // Bei Satz-Fragen: Blank durch richtige Antwort ersetzen und hervorheben
    if (frage.typ === 'satz' && frage.frage_text.includes('___')) {
        const loesung = ergebnis.erwartet || '';
        const teile = frage.frage_text.split('___');
        frage_text.innerHTML = esc(teile[0])
            + `<span class="frage-anzeige__blank-loesung">${esc(loesung)}</span>`
            + esc(teile.slice(1).join('___'));
    } else {
        frage_text.textContent = frage.frage_text;
    }
    frage_bereich.appendChild(frage_text);

    // Kontext bei Satz-Fragen im Ergebnis immer sichtbar anzeigen
    if (frage.typ === 'satz' && frage.kontext) {
        const kontext_el = document.createElement('div');
        kontext_el.className = 'frage-anzeige__hinweis';
        kontext_el.textContent = frage.kontext;
        frage_bereich.appendChild(kontext_el);
    }

    const frage_aktionen = document.createElement('div');
    frage_aktionen.className = 'frage-anzeige__frage-aktionen';

    const tts_btn = _tts_button(frage);
    if (tts_btn) frage_aktionen.appendChild(tts_btn);

    const fav_btn = _favorit_button(frage.vokabel_id);
    frage_aktionen.appendChild(fav_btn);

    frage_bereich.appendChild(frage_aktionen);
    container.appendChild(frage_bereich);

    // Ergebnis-Bereich
    const ergebnis_bereich = document.createElement('div');
    ergebnis_bereich.className = 'frage-anzeige__ergebnis';

    // Icon + Text
    let icon_name, ergebnis_text, ergebnis_klasse;
    if (ergebnis.richtig && ergebnis.ist_tippfehler) {
        icon_name = 'spellcheck';
        ergebnis_text = t('frage.tippfehler');
        ergebnis_klasse = 'frage-anzeige__ergebnis-status--tippfehler';
    } else if (ergebnis.richtig) {
        icon_name = 'check_circle';
        ergebnis_text = ergebnis.qualitaet === 5 ? t('frage.perfekt') : t('frage.richtig');
        ergebnis_klasse = 'frage-anzeige__ergebnis-status--richtig';
    } else {
        icon_name = 'cancel';
        ergebnis_text = t('frage.falsch');
        ergebnis_klasse = 'frage-anzeige__ergebnis-status--falsch';
    }

    const status_zeile = document.createElement('div');
    status_zeile.className = `frage-anzeige__ergebnis-status ${ergebnis_klasse}`;
    status_zeile.innerHTML = `
        <span class="material-symbols-outlined">${icon_name}</span>
        <span>${esc(ergebnis_text)}</span>
    `;
    ergebnis_bereich.appendChild(status_zeile);

    // Antwort-Vergleich (bei Fehler oder Tippfehler)
    if (!ergebnis.richtig || ergebnis.ist_tippfehler) {
        const vergleich = document.createElement('div');
        vergleich.className = 'frage-anzeige__vergleich';
        vergleich.innerHTML = `
            <div class="frage-anzeige__vergleich-zeile">
                <span class="frage-anzeige__vergleich-label">${t('frage.deine_antwort')}</span>
                <span class="frage-anzeige__vergleich-wert frage-anzeige__vergleich-wert--eingabe">${esc(ergebnis.eingabe_bereinigt || '')}</span>
            </div>
            <div class="frage-anzeige__vergleich-zeile">
                <span class="frage-anzeige__vergleich-label">${t('frage.richtige_antwort')}</span>
                <span class="frage-anzeige__vergleich-wert frage-anzeige__vergleich-wert--erwartet">${esc(ergebnis.erwartet)}</span>
            </div>
        `;
        ergebnis_bereich.appendChild(vergleich);
    }

    // XP Badge
    if (ergebnis.xp > 0) {
        const xp_badge = document.createElement('span');
        xp_badge.className = 'xp-badge';
        xp_badge.textContent = `+${ergebnis.xp} XP`;
        ergebnis_bereich.appendChild(xp_badge);
    }

    container.appendChild(ergebnis_bereich);

    // Aktionen
    const aktionen = document.createElement('div');
    aktionen.className = 'frage-anzeige__aktionen';

    if (!ergebnis.richtig && !trotzdem_gesperrt) {
        const trotzdem_btn = document.createElement('button');
        trotzdem_btn.className = 'btn btn--text';
        trotzdem_btn.textContent = t('frage.trotzdem_richtig');
        trotzdem_btn.addEventListener('click', () => onTrotzdemRichtig());
        aktionen.appendChild(trotzdem_btn);
    }

    const weiter_btn = document.createElement('button');
    weiter_btn.className = 'btn btn--gefuellt';
    weiter_btn.textContent = ergebnis.nachtippen_noetig ? t('frage.nachtippen') : t('allgemein.weiter');
    weiter_btn.addEventListener('click', () => onWeiter());
    aktionen.appendChild(weiter_btn);

    container.appendChild(aktionen);

    // Enter → Weiter
    const _keyHandler = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.removeEventListener('keydown', _keyHandler);
            onWeiter();
        }
    };
    document.addEventListener('keydown', _keyHandler);

    const observer = new MutationObserver(() => {
        if (!document.contains(container)) {
            document.removeEventListener('keydown', _keyHandler);
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

// ============================================
// Modus: Nachtippen
// ============================================

function _nachtippen_modus(container, frage, ergebnis, onNachtippen, onWeiter) {
    const nachtippen_bereich = document.createElement('div');
    nachtippen_bereich.className = 'frage-anzeige__nachtippen';

    const anweisung = document.createElement('div');
    anweisung.className = 'frage-anzeige__nachtippen-anweisung';
    anweisung.textContent = t('frage.nachtippen_anweisung');
    nachtippen_bereich.appendChild(anweisung);

    // Loesung + TTS nebeneinander
    const loesung_zeile = document.createElement('div');
    loesung_zeile.className = 'frage-anzeige__nachtippen-zeile';

    const loesung = document.createElement('div');
    loesung.className = 'frage-anzeige__nachtippen-loesung';
    loesung.textContent = ergebnis?.erwartet || frage.erwartet;
    loesung_zeile.appendChild(loesung);

    const tts_btn = _tts_button(frage);
    if (tts_btn) loesung_zeile.appendChild(tts_btn);

    nachtippen_bereich.appendChild(loesung_zeile);

    // Eingabefeld
    const textfeld = document.createElement('input');
    textfeld.type = 'text';
    textfeld.className = 'eingabe frage-anzeige__textfeld';
    textfeld.placeholder = t('frage.nachtippen_placeholder');
    textfeld.autocomplete = 'off';
    textfeld.autocorrect = 'off';
    textfeld.spellcheck = false;
    nachtippen_bereich.appendChild(textfeld);

    container.appendChild(nachtippen_bereich);

    // Aktionen
    const aktionen = document.createElement('div');
    aktionen.className = 'frage-anzeige__aktionen';

    const weiter_btn = document.createElement('button');
    weiter_btn.className = 'btn btn--gefuellt';
    weiter_btn.textContent = t('allgemein.weiter');
    weiter_btn.disabled = true;

    // Satzzeichen-normalisierung fuer Nachtippen-Vergleich:
    // Ellipsis (... und …) → Leerzeichen, dann alle gaengigen Satzzeichen entfernen,
    // Whitespace kollabieren. Entspricht satzzeichen_normalisieren() in hilfsfunktionen.php.
    const _normalisieren = (text) => {
        let s = text.replace(/\.{2,}|…/g, ' ');
        s = s.replace(/[.,!?;:\u2013\u2014"'()[\]{}]/g, '');
        return s.replace(/\s+/g, ' ').trim().toLowerCase();
    };

    // "/" als ODER: jede Alternative der erwarteten Antwort wird akzeptiert.
    // z.B. "Anwalt/Anwältin" → beide Formen gelten beim Nachtippen.
    const erwartet_roh = ergebnis?.erwartet || frage.erwartet || '';
    const erwartet_alternativen = erwartet_roh
        .split('/')
        .map(s => _normalisieren(s.trim()))
        .filter(s => s !== '');

    const _erwartet_stimmt = (eingabe) => {
        const norm = _normalisieren(eingabe);
        return erwartet_alternativen.some(alt => norm === alt);
    };

    const _pruefen = () => {
        weiter_btn.disabled = !_erwartet_stimmt(textfeld.value);
    };

    textfeld.addEventListener('input', _pruefen);
    textfeld.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (_erwartet_stimmt(textfeld.value)) {
                onNachtippen(textfeld.value.trim());
                onWeiter();
            }
        }
    });

    weiter_btn.addEventListener('click', () => {
        onNachtippen(textfeld.value.trim());
        onWeiter();
    });

    aktionen.appendChild(weiter_btn);
    container.appendChild(aktionen);

    requestAnimationFrame(() => textfeld.focus());
}
