/**
 * Grammatik — Grammatik-Referenz (neu strukturiert)
 *
 * Sektionen:
 *   1. Zahlen & Zeiten  — statische Tabellen mit TTS
 *   2. Verbgruppen      — Allgemein + Gr.1-3 + Gr.4-Familien + Unregelmäßige
 *   3. Nomen            — vorhandene DB-Regeln
 *   4. Adjektive        — vorhandene DB-Regeln
 *
 * Admin: FAB + Dialog zum Erstellen/Bearbeiten von Regeln (unverändert)
 *
 * Route-Params:
 *   - regel:      ID einer Regel → direkt scrollen & aufklappen
 *   - kein_eintrag: '1' → Banner über Karten
 */

import { apiGet, apiPost, apiDelete }    from '../api-client.js';
import { ist_admin }                      from '../zustand.js';
import { benachrichtigen }                from '../benachrichtigungen.js';
import { esc }                            from '../hilfs-funktionen.js';
import { t }                              from '../dienste/sprache.js';
import { vorlesen, tts_verfuegbar }       from '../dienste/sprach-dienst.js';

// ─── Modul-State ────────────────────────────────────────────────────────────
let _regeln            = [];
let _aktive_sektion    = 'zahlen';  // 'zahlen' | 'verben' | 'nomen' | 'adjektive'
let _container         = null;
let _ist_admin         = false;
let _verb_familien     = null;      // lazy-loaded API result

// ─── Sektions-Definitionen ───────────────────────────────────────────────────
const SEKTIONEN = [
    { key: 'zahlen',    icon: 'calculate',    labelKey: 'grammatik.sek_zahlen' },
    { key: 'verben',    icon: 'bolt',          labelKey: 'grammatik.sek_verben' },
    { key: 'nomen',     icon: 'tag',           labelKey: 'grammatik.sek_nomen' },
    { key: 'adjektive', icon: 'star',          labelKey: 'grammatik.sek_adjektive' },
];

// ─── Statische Zahlen-Daten ──────────────────────────────────────────────────
const ZAHLEN = [
    [0,'noll'],[1,'ett / en'],[2,'två'],[3,'tre'],[4,'fyra'],[5,'fem'],
    [6,'sex'],[7,'sju'],[8,'åtta'],[9,'nio'],[10,'tio'],
    [11,'elva'],[12,'tolv'],[13,'tretton'],[14,'fjorton'],[15,'femton'],
    [16,'sexton'],[17,'sjutton'],[18,'arton'],[19,'nitton'],[20,'tjugo'],
    [21,'tjugoett'],[22,'tjugotvå'],[30,'trettio'],[40,'fyrtio'],[50,'femtio'],
    [60,'sextio'],[70,'sjuttio'],[80,'åttio'],[90,'nittio'],
    [100,'hundra'],[200,'tvåhundra'],[1000,'tusen'],[1000000,'en miljon'],
];

const UHRZEITEN = [
    { sv: 'Vad är klockan?',          de: 'Wie spät ist es?' },
    { sv: 'Klockan är tre.',           de: 'Es ist drei Uhr.' },
    { sv: 'Klockan är kvart över tre.',de: 'Es ist Viertel nach drei.' },
    { sv: 'Klockan är halv fyra.',     de: 'Es ist halb vier.' },
    { sv: 'Klockan är kvart i fyra.',  de: 'Es ist Viertel vor vier.' },
    { sv: 'Klockan är fem i halv fyra.',de:'Es ist fünf vor halb vier.' },
    { sv: 'Klockan är fem över halv fyra.',de:'Es ist fünf nach halb vier.' },
    { sv: 'Klockan är tjugo över tre.', de: 'Es ist zwanzig nach drei.' },
    { sv: 'Klockan är tio i fyra.',    de: 'Es ist zehn vor vier.' },
    { sv: 'Klockan är tolv / middag.', de: 'Es ist zwölf Uhr / Mittag.' },
    { sv: 'Klockan är tolv / midnatt.',de: 'Es ist Mitternacht.' },
];

// Anzeigenamen für verbklasse
const VERBKLASSEN_LABELS = {
    iei:         'i – e – i',
    iau:         'i – a – u',
    'uöu':       'u – ö – u',
    'yöu':       'y – ö – u',
    aoa:         'a – o/ä – a',
    kurz:        'Kurze Verben',
    sonderfall:  null, // aus i18n
    oregelbunden: null,
};

// ─── CSS ────────────────────────────────────────────────────────────────────

export function stil_einfuegen() {
    if (document.getElementById('grammatik-css')) return;
    const link = document.createElement('link');
    link.id   = 'grammatik-css';
    link.rel  = 'stylesheet';
    link.href = 'oeffentlich/css/grammatik.css';
    document.head.appendChild(link);
}

// ─── Haupt-Entry ────────────────────────────────────────────────────────────

export async function rendern(params = {}) {
    _container = document.getElementById('inhalt');
    if (!_container) return;

    _ist_admin = ist_admin();
    _container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'grammatik';
    _container.appendChild(wrapper);

    wrapper.innerHTML = '<div class="grammatik-lade"><span class="material-symbols-outlined">hourglass_empty</span></div>';

    const res = await apiGet('grammatik/liste.php');
    if (!res.erfolg) {
        wrapper.innerHTML = `<p class="grammatik-fehler">${t('grammatik.fehler_laden')}</p>`;
        return;
    }

    _regeln = res.daten.regeln || [];
    wrapper.innerHTML = '';

    // Header
    wrapper.appendChild(_header_rendern());

    // Tab-Navigation
    const tabNav = _tab_nav_rendern();
    wrapper.appendChild(tabNav);

    // Inhalts-Container
    const inhalt = document.createElement('div');
    inhalt.className = 'grammatik-inhalt';
    inhalt.id = 'grammatik-inhalt';
    wrapper.appendChild(inhalt);

    // Deeplink: ?regel=ID → Sektion Verben/Nomen/Adjektiv ermitteln + öffnen
    if (params.regel) {
        const regelId = parseInt(params.regel, 10);
        const regel = _regeln.find(r => r.id === regelId);
        if (regel) {
            _aktive_sektion = regel.wortart === 'Nomen'    ? 'nomen'
                            : regel.wortart === 'Adjektiv' ? 'adjektive'
                            : regel.wortart === 'Verb'     ? 'verben'
                            : _aktive_sektion;
        }
    }

    // kein_eintrag-Banner: Verben-Sektion öffnen
    if (params.kein_eintrag) {
        _aktive_sektion = 'verben';
    }

    // Initial active tab setzen
    tabNav.querySelector(`[data-sek="${_aktive_sektion}"]`)?.classList.add('aktiv');

    await _sektion_rendern(inhalt, params);

    // Zurück-Button für Deeplinks
    if (params.regel || params.kein_eintrag) {
        const zurueck = document.createElement('button');
        zurueck.className = 'grammatik-zurueck-btn';
        zurueck.innerHTML = `<span class="material-symbols-outlined">arrow_back</span> ${t('grammatik.zurueck_zur_frage')}`;
        zurueck.addEventListener('click', () => history.back());
        wrapper.appendChild(zurueck);
    }

    // Admin FAB
    if (_ist_admin) {
        const fab = document.createElement('button');
        fab.className = 'grammatik-fab';
        fab.title     = t('grammatik.neue_regel');
        fab.innerHTML = '<span class="material-symbols-outlined">add</span>';
        fab.onclick   = () => _dialog_oeffnen(null);
        wrapper.appendChild(fab);
    }

    // Deeplink scrollen
    if (params.regel) {
        const regelId = parseInt(params.regel, 10);
        if (!isNaN(regelId)) {
            requestAnimationFrame(() => _regel_fokussieren(regelId));
        }
    }
}

// ─── Header ─────────────────────────────────────────────────────────────────

function _header_rendern() {
    const header = document.createElement('div');
    header.className = 'grammatik-header';
    header.innerHTML = `
        <span class="material-symbols-outlined grammatik-header-icon">assignment_globe</span>
        <div>
            <h1 class="grammatik-titel">${t('grammatik.titel')}</h1>
            <p class="grammatik-untertitel">${t('grammatik.untertitel')}</p>
        </div>
    `;
    return header;
}

// ─── Tab-Navigation ──────────────────────────────────────────────────────────

function _tab_nav_rendern() {
    const nav = document.createElement('nav');
    nav.className = 'grammatik-tabs';
    nav.id = 'grammatik-tabs';

    for (const sek of SEKTIONEN) {
        const btn = document.createElement('button');
        btn.className    = 'grammatik-tab';
        btn.dataset.sek  = sek.key;
        btn.innerHTML    = `<span class="material-symbols-outlined">${sek.icon}</span><span>${t(sek.labelKey)}</span>`;
        btn.addEventListener('click', async () => {
            if (_aktive_sektion === sek.key) return;
            _aktive_sektion = sek.key;
            nav.querySelectorAll('.grammatik-tab').forEach(b =>
                b.classList.toggle('aktiv', b.dataset.sek === sek.key));
            const inhalt = document.getElementById('grammatik-inhalt');
            if (inhalt) await _sektion_rendern(inhalt, {});
        });
        nav.appendChild(btn);
    }

    return nav;
}

// ─── Sektions-Dispatcher ─────────────────────────────────────────────────────

async function _sektion_rendern(container, params) {
    container.innerHTML = '<div class="grammatik-lade"><span class="material-symbols-outlined">hourglass_empty</span></div>';

    switch (_aktive_sektion) {
        case 'zahlen':    _zahlen_rendern(container);               break;
        case 'verben':    await _verben_rendern(container, params); break;
        case 'nomen':     _wortart_rendern(container, 'Nomen');     break;
        case 'adjektive': _wortart_rendern(container, 'Adjektiv');  break;
        default:          _zahlen_rendern(container);
    }
}

// ─── Sektion 1: Zahlen & Zeiten ──────────────────────────────────────────────

function _zahlen_rendern(container) {
    let html = `
        <section class="grammatik-sektion">
            <h2 class="grammatik-sektion-titel">
                <span class="material-symbols-outlined">numbers</span>
                ${t('grammatik.zahlen_titel')}
            </h2>
            <div class="grammatik-tabelle-wrapper">
            <table class="grammatik-tabelle">
                <thead><tr>
                    <th>${t('grammatik.zahlen_th_zahl')}</th>
                    <th>${t('grammatik.zahlen_th_text')}</th>
                    <th></th>
                </tr></thead>
                <tbody>
                ${ZAHLEN.map(([zahl, text]) => `
                    <tr>
                        <td class="grammatik-zahl-num">${zahl.toLocaleString('de-DE')}</td>
                        <td class="grammatik-zahl-text">${esc(text)}</td>
                        <td><button class="grammatik-tts-btn" data-text="${esc(text)}" title="${t('grammatik.vorlesen')}">
                            <span class="material-symbols-outlined">volume_up</span>
                        </button></td>
                    </tr>`).join('')}
                </tbody>
            </table>
            </div>
        </section>

        <section class="grammatik-sektion" style="margin-top:24px">
            <h2 class="grammatik-sektion-titel">
                <span class="material-symbols-outlined">schedule</span>
                ${t('grammatik.uhrzeiten_titel')}
            </h2>
            <p class="grammatik-sektion-info">${t('grammatik.uhrzeiten_info')}</p>
            <div class="grammatik-uhrzeit-liste">
            ${UHRZEITEN.map(u => `
                <div class="grammatik-uhrzeit-zeile">
                    <div class="grammatik-uhrzeit-sv">${esc(u.sv)}</div>
                    <div class="grammatik-uhrzeit-de">${esc(u.de)}</div>
                    <button class="grammatik-tts-btn" data-text="${esc(u.sv)}" title="${t('grammatik.vorlesen')}">
                        <span class="material-symbols-outlined">volume_up</span>
                    </button>
                </div>`).join('')}
            </div>
        </section>
    `;

    container.innerHTML = html;

    // TTS-Buttons — immer anhängen, vorlesen() handhabt intern fehlende Verfügbarkeit
    container.querySelectorAll('.grammatik-tts-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            vorlesen(btn.dataset.text, 'sv-SE');
        });
    });
}

// ─── Sektion 2: Verbgruppen ──────────────────────────────────────────────────

async function _verben_rendern(container, params) {
    // Verb-Regeln aus _regeln filtern
    const verb_regeln = _regeln.filter(r => r.wortart === 'Verb');

    // Allgemein: genus_gruppe = 'Kein Eintrag' (keine spezifische Gruppe)
    const allgemein_regeln = verb_regeln.filter(r =>
        !r.genus_gruppe || r.genus_gruppe.toLowerCase() === 'kein eintrag');

    // Gr. 1-3: genus_gruppe in ['Gr. 1', 'Gr. 2a', 'Gr. 2b', 'Gr. 3']
    const gr1bis3 = ['Gr. 1', 'Gr. 2a', 'Gr. 2b', 'Gr. 3'];
    const gr1bis3_regeln = verb_regeln.filter(r => gr1bis3.includes(r.genus_gruppe));

    // Gr. 4: genus_gruppe = 'Gr. 4'
    const gr4_regeln = verb_regeln.filter(r => r.genus_gruppe === 'Gr. 4');

    container.innerHTML = '';

    // ── Gruppen 1–3 ──
    const sek_gr13 = _verb_untersek_erstellen(
        t('grammatik.verb_gr1bis3_titel'),
        'format_list_numbered'
    );
    if (gr1bis3_regeln.length > 0) {
        // Nochmals nach genus_gruppe gruppieren
        const gruppen_map = new Map();
        for (const r of gr1bis3_regeln) {
            if (!gruppen_map.has(r.genus_gruppe)) gruppen_map.set(r.genus_gruppe, []);
            gruppen_map.get(r.genus_gruppe).push(r);
        }
        for (const [gg, regeln] of gruppen_map) {
            const grp = document.createElement('div');
            grp.className = 'grammatik-gruppe-header';
            grp.innerHTML = `<span class="material-symbols-outlined">bolt</span><span>${esc(gg)}</span><span class="grammatik-gruppe-anzahl">${regeln.length}</span>`;
            sek_gr13.body.appendChild(grp);
            for (const r of regeln) sek_gr13.body.appendChild(_karte_rendern(r));
        }
    } else {
        sek_gr13.body.innerHTML = `<p class="grammatik-leer">${t('grammatik.keine_regeln')}</p>`;
    }
    container.appendChild(sek_gr13.el);

    // ── Gruppe 4 — Familien ──
    const sek_gr4 = _verb_untersek_erstellen(
        t('grammatik.verb_gr4_titel'),
        'family_history'
    );
    // Lazy-Load Verb-Familien beim Öffnen (zuerst Familien, dann DB-Regeln)
    // (Listener wird nach dem Toggle-Listener von _verb_untersek_erstellen ausgeführt,
    //  daher ist dataset.offen zu diesem Zeitpunkt bereits auf den neuen Wert gesetzt)
    sek_gr4.el.querySelector('.grammatik-untersek-kopf').addEventListener('click', async () => {
        const jetztOffen = sek_gr4.el.dataset.offen === '1';
        if (jetztOffen && !sek_gr4.el.dataset.famLoaded) {
            sek_gr4.el.dataset.famLoaded = '1';
            await _verb_familien_laden(sek_gr4.body);
            // DB-Regeln für Gr. 4 nach den Familien anzeigen
            for (const r of gr4_regeln) {
                sek_gr4.body.appendChild(_karte_rendern(r));
            }
        }
    });
    container.appendChild(sek_gr4.el);

    // ── Unregelmäßige Verben ──
    const sek_unreg = _verb_untersek_erstellen(
        t('grammatik.verb_unreg_titel'),
        'warning'
    );
    sek_unreg.el.querySelector('.grammatik-untersek-kopf').addEventListener('click', async () => {
        const jetztOffen = sek_unreg.el.dataset.offen === '1';
        if (jetztOffen && !sek_unreg.el.dataset.unregLoaded) {
            sek_unreg.el.dataset.unregLoaded = '1';
            await _unregelmaessige_laden(sek_unreg.body);
        }
    });
    container.appendChild(sek_unreg.el);

    // ── Deponens-Verben ──
    const sek_deponens = _verb_untersek_erstellen(
        t('grammatik.deponens_titel'),
        'swap_horiz'
    );
    _deponens_rendern(sek_deponens.body);
    container.appendChild(sek_deponens.el);

    // ── Allgemein (standardmäßig zugeklappt, am Ende) ──
    const sek_allgemein = _verb_untersek_erstellen(
        t('grammatik.verb_allgemein_titel'),
        'info',
        false // standardmäßig zugeklappt
    );
    if (allgemein_regeln.length > 0) {
        for (const r of allgemein_regeln) {
            sek_allgemein.body.appendChild(_karte_rendern(r));
        }
    } else {
        sek_allgemein.body.innerHTML = `<p class="grammatik-leer">${t('grammatik.keine_regeln')}</p>`;
    }
    container.appendChild(sek_allgemein.el);

    // Params-Banner (kein_eintrag)
    if (params?.kein_eintrag) {
        const banner = document.createElement('div');
        banner.className = 'grammatik-kein-eintrag-banner';
        banner.innerHTML = `<span class="material-symbols-outlined">info</span><span>${t('grammatik.kein_eintrag_banner')}</span>`;
        container.insertBefore(banner, container.firstChild);
    }
}

/** Rendert statischen Inhalt der Deponens-Verben-Karte */
function _deponens_rendern(container) {
    const tts = tts_verfuegbar();

    const DEPONENS_BEISPIELE = [
        { infinitiv: 'hoppas',  praesens: 'hoppas',  praeteritum: 'hoppades', supinum: 'hoppats',  deutsch: 'hoffen' },
        { infinitiv: 'trivas',  praesens: 'trivas',  praeteritum: 'trivdes',  supinum: 'trivts',   deutsch: 'sich wohlfühlen' },
        { infinitiv: 'minnas',  praesens: 'minns',   praeteritum: 'mindes',   supinum: 'mints',    deutsch: 'sich erinnern' },
        { infinitiv: 'hälsas', praesens: 'hälsas', praeteritum: 'hälsades', supinum: 'hälsats',  deutsch: 'grüßen' },
    ];

    const erklaerung = document.createElement('p');
    erklaerung.className = 'grammatik-sektion-info';
    erklaerung.textContent = t('grammatik.deponens_erklaerung');
    container.appendChild(erklaerung);

    const bildungInfo = document.createElement('p');
    bildungInfo.className = 'grammatik-sektion-info';
    bildungInfo.innerHTML = `<strong>${t('grammatik.deponens_bildung_titel')}</strong> ${t('grammatik.deponens_bildung')}`;
    container.appendChild(bildungInfo);

    const wrapper = document.createElement('div');
    wrapper.className = 'grammatik-tabelle-wrapper';
    wrapper.innerHTML = `
        <table class="grammatik-tabelle grammatik-tabelle--verben">
            <thead><tr>
                <th>${t('grammatik.verb_th_deutsch')}</th>
                <th>${t('grammatik.verb_th_infinitiv')}</th>
                <th>${t('grammatik.verb_th_praesens')}</th>
                <th>${t('grammatik.verb_th_praeteritum')}</th>
                <th>${t('grammatik.verb_th_supinum')}</th>
                ${tts ? `<th></th>` : ''}
            </tr></thead>
            <tbody>
            ${DEPONENS_BEISPIELE.map(v => `
                <tr>
                    <td class="grammatik-verb-deutsch">${esc(v.deutsch)}</td>
                    <td>att ${esc(v.infinitiv)}</td>
                    <td>${esc(v.praesens)}</td>
                    <td>${esc(v.praeteritum)}</td>
                    <td>${esc(v.supinum)}</td>
                    ${tts ? `<td><button class="grammatik-tts-btn"
                        data-text="${esc(v.infinitiv)}" title="${t('grammatik.vorlesen')}">
                        <span class="material-symbols-outlined">volume_up</span>
                    </button></td>` : ''}
                </tr>`).join('')}
            </tbody>
        </table>
    `;
    container.appendChild(wrapper);

    if (tts) {
        wrapper.querySelectorAll('.grammatik-tts-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                vorlesen(btn.dataset.text, 'sv-SE');
            });
        });
    }
}

/** Erstellt eine aufklappbare Unter-Sektion für den Verben-Bereich */
function _verb_untersek_erstellen(titel, icon, offen = false) {
    const el = document.createElement('div');
    el.className  = 'grammatik-untersek';
    el.dataset.offen = offen ? '1' : '0';

    const kopf = document.createElement('button');
    kopf.className = 'grammatik-untersek-kopf';
    kopf.innerHTML = `
        <span class="material-symbols-outlined">${icon}</span>
        <span class="grammatik-untersek-titel">${titel}</span>
        <span class="material-symbols-outlined grammatik-untersek-pfeil">${offen ? 'expand_less' : 'expand_more'}</span>
    `;

    const body = document.createElement('div');
    body.className = 'grammatik-untersek-body';
    body.hidden    = !offen;

    kopf.addEventListener('click', () => {
        const istOffen = el.dataset.offen === '1';
        el.dataset.offen = istOffen ? '0' : '1';
        body.hidden = istOffen;
        kopf.querySelector('.grammatik-untersek-pfeil').textContent = istOffen ? 'expand_more' : 'expand_less';
    });

    el.appendChild(kopf);
    el.appendChild(body);

    return { el, body };
}

/** Lädt Verbgruppe-4-Familien und rendert sie in container */
async function _verb_familien_laden(container) {
    if (!_verb_familien) {
        const ladeZeile = document.createElement('div');
        ladeZeile.className = 'grammatik-lade grammatik-lade--klein';
        ladeZeile.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span>';
        container.appendChild(ladeZeile);

        const res = await apiGet('grammatik/verb_familien.php');
        ladeZeile.remove();

        if (!res.erfolg) {
            container.innerHTML += `<p class="grammatik-leer">${t('grammatik.fehler_laden')}</p>`;
            return;
        }
        _verb_familien = res.daten;
    }

    const familien = _verb_familien.familien;
    const FAMILIE_NAMEN = {
        iei:         t('grammatik.verbklasse_iei'),
        iau:         t('grammatik.verbklasse_iau'),
        'uöu':       t('grammatik.verbklasse_uou'),
        'yöu':       t('grammatik.verbklasse_you'),
        aoa:         'Umlaut-Verben (a – o/ä – a)',
        kurz:        'Kurze Verben',
    };

    // Nur Familien-Klassen (keine sonderfall/oregelbunden)
    const familie_keys = ['iei','iau','uöu','yöu','aoa','kurz'];
    let hat_familien = false;

    for (const klasse of familie_keys) {
        const verben = familien[klasse];
        if (!verben || verben.length === 0) continue;
        hat_familien = true;

        const grp = document.createElement('div');
        grp.className = 'grammatik-gruppe-header';
        grp.innerHTML = `
            <span class="material-symbols-outlined">family_history</span>
            <span>${FAMILIE_NAMEN[klasse] ?? klasse}</span>
            <span class="grammatik-gruppe-anzahl">${verben.length}</span>
        `;
        container.appendChild(grp);
        container.appendChild(_verb_familien_tabelle(verben));
    }

    if (!hat_familien) {
        const leer = document.createElement('p');
        leer.className = 'grammatik-leer';
        leer.textContent = t('grammatik.verb_gr4_leer');
        container.appendChild(leer);
    }
}

/** Lädt unregelmäßige Verben und rendert sie */
async function _unregelmaessige_laden(container) {
    if (!_verb_familien) {
        const ladeZeile = document.createElement('div');
        ladeZeile.className = 'grammatik-lade grammatik-lade--klein';
        ladeZeile.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span>';
        container.appendChild(ladeZeile);

        const res = await apiGet('grammatik/verb_familien.php');
        ladeZeile.remove();

        if (!res.erfolg) {
            container.innerHTML += `<p class="grammatik-leer">${t('grammatik.fehler_laden')}</p>`;
            return;
        }
        _verb_familien = res.daten;
    }

    const familien = _verb_familien.familien;
    const unreg = [
        ...(familien['sonderfall']   ?? []),
        ...(familien['oregelbunden'] ?? []),
    ];

    if (unreg.length === 0) {
        const leer = document.createElement('p');
        leer.className = 'grammatik-leer';
        leer.textContent = t('grammatik.verb_unreg_leer');
        container.appendChild(leer);
        return;
    }

    container.appendChild(_verb_familien_tabelle(unreg));
}

/** Rendert eine Verb-Konjugationstabelle im 2-Zeilen-Mobile-Layout */
function _verb_familien_tabelle(verben) {
    const tts = tts_verfuegbar();
    const div = document.createElement('div');
    div.className = 'grammatik-tabelle-wrapper';

    const tbody_rows = verben.map(v => {
        const inf = v.infinitiv ? `att ${esc(v.infinitiv)}` : esc(v.schwedisch);
        const infText = v.infinitiv || v.schwedisch;
        const praesens   = esc(v.praesens    ?? '–');
        const praeteritum = esc(v.praeteritum ?? '–');
        const supinum    = esc(v.supinum     ?? '–');
        const formenText = [v.praesens, v.praeteritum, v.supinum].filter(Boolean).join(', ');

        if (tts) {
            return `
                <tr class="grammatik-verb-zeile-1">
                    <td class="grammatik-verb-deutsch">${esc(v.deutsch)}</td>
                    <td class="grammatik-verb-infinitiv">${inf}
                        <button class="grammatik-tts-btn grammatik-tts-btn--inf"
                            data-text="${esc(infText)}" title="${t('grammatik.vorlesen')}">
                            <span class="material-symbols-outlined">volume_up</span>
                        </button>
                    </td>
                </tr>
                <tr class="grammatik-verb-zeile-2">
                    <td colspan="2" class="grammatik-verb-formen">
                        ${praesens}, ${praeteritum}, ${supinum}
                        <button class="grammatik-tts-btn grammatik-tts-btn--formen"
                            data-praesens="${esc(v.praesens ?? '')}"
                            data-praeteritum="${esc(v.praeteritum ?? '')}"
                            data-supinum="${esc(v.supinum ?? '')}"
                            title="${t('grammatik.vorlesen')}">
                            <span class="material-symbols-outlined">volume_up</span>
                        </button>
                    </td>
                </tr>`;
        } else {
            return `
                <tr class="grammatik-verb-zeile-1">
                    <td class="grammatik-verb-deutsch">${esc(v.deutsch)}</td>
                    <td class="grammatik-verb-infinitiv">${inf}</td>
                </tr>
                <tr class="grammatik-verb-zeile-2">
                    <td colspan="2" class="grammatik-verb-formen">${praesens}, ${praeteritum}, ${supinum}</td>
                </tr>`;
        }
    }).join('');

    div.innerHTML = `
        <table class="grammatik-tabelle grammatik-tabelle--verben grammatik-tabelle--zweizeilig">
            <thead><tr>
                <th>${t('grammatik.verb_th_deutsch')} / ${t('grammatik.verb_th_infinitiv')}</th>
                <th>${t('grammatik.verb_th_praesens')}, ${t('grammatik.verb_th_praeteritum')}, ${t('grammatik.verb_th_supinum')}</th>
            </tr></thead>
            <tbody>${tbody_rows}</tbody>
        </table>
    `;

    if (tts) {
        // Einzel-TTS: Infinitiv
        div.querySelectorAll('.grammatik-tts-btn--inf').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                vorlesen(btn.dataset.text, 'sv-SE');
            });
        });
        // Serien-TTS: Präsens → Präteritum → Supinum mit 1200ms Pause
        div.querySelectorAll('.grammatik-tts-btn--formen').forEach(btn => {
            btn.addEventListener('click', async e => {
                e.stopPropagation();
                const formen = [btn.dataset.praesens, btn.dataset.praeteritum, btn.dataset.supinum]
                    .filter(f => f && f.trim());
                for (let i = 0; i < formen.length; i++) {
                    vorlesen(formen[i], 'sv-SE');
                    if (i < formen.length - 1) {
                        await new Promise(res => setTimeout(res, 1200));
                    }
                }
            });
        });
    }

    return div;
}

// ─── Sektion 3+4: Nomen / Adjektive (vorhandene Regeln) ─────────────────────

function _wortart_rendern(container, wortart) {
    const gefiltert = _regeln.filter(r => r.wortart === wortart);
    container.innerHTML = '';

    if (gefiltert.length === 0) {
        container.innerHTML = `<p class="grammatik-leer">${t('grammatik.keine_regeln')}</p>`;
        return;
    }

    // Nach genus_gruppe gruppieren
    const gruppen = new Map();
    for (const r of gefiltert) {
        const key = r.genus_gruppe || '';
        if (!gruppen.has(key)) gruppen.set(key, []);
        gruppen.get(key).push(r);
    }

    const WORTART_ICONS = { Nomen: 'tag', Verb: 'bolt', Adjektiv: 'star' };
    const icon = WORTART_ICONS[wortart] ?? 'category';

    for (const [gg, regeln] of gruppen) {
        const gg_label = (gg && gg.toLowerCase() !== 'kein eintrag') ? gg : t('grammatik.verb_allgemein_titel');
        const sek = _verb_untersek_erstellen(gg_label, icon);
        if (gg && gg.toLowerCase() !== 'kein eintrag') {
            const grp = document.createElement('div');
            grp.className = 'grammatik-gruppe-header';
            grp.innerHTML = `
                <span class="material-symbols-outlined">${icon}</span>
                <span>${esc(gg)}</span>
                <span class="grammatik-gruppe-anzahl">${regeln.length}</span>
            `;
            sek.body.appendChild(grp);
        }
        for (const r of regeln) sek.body.appendChild(_karte_rendern(r));
        container.appendChild(sek.el);
    }
}

// ─── Einzelne Karte ──────────────────────────────────────────────────────────

function _karte_rendern(regel) {
    const karte = document.createElement('div');
    karte.className = 'grammatik-karte';
    karte.dataset.regelId = regel.id;
    karte.dataset.wortart = regel.wortart.toLowerCase();

    const formen_chips = (regel.formen ?? [])
        .map(fb => `<span class="grammatik-form-chip">${esc(FORM_LABELS()[fb] ?? fb)}</span>`)
        .join('');

    const zeige_gruppe = regel.genus_gruppe &&
        regel.genus_gruppe.toLowerCase() !== 'kein eintrag';

    const kopf = document.createElement('button');
    kopf.className = 'grammatik-karte-kopf';
    kopf.setAttribute('aria-expanded', 'false');

    // Titel: Regel-Überschrift (falls gesetzt) oder Genus/Gruppe + Formen-Chips
    // <h2>-Wrapper aus alten DB-Einträgen entfernen — nur Textinhalt zeigen
    const regelTitel = (regel.regel ?? '').replace(/<\/?h2[^>]*>/gi, '').trim();
    const titelText = regelTitel
        ? `<span class="grammatik-karte-regel">${esc(regelTitel)}</span>`
        : `${zeige_gruppe ? `<span class="grammatik-karte-gruppe">${esc(regel.genus_gruppe)}</span>` : ''}
           ${zeige_gruppe && formen_chips ? `<span class="grammatik-karte-sep">—</span>` : ''}
           ${formen_chips ? `<span class="grammatik-karte-formen">${formen_chips}</span>` : ''}`;

    kopf.innerHTML = `
        <div class="grammatik-karte-titel">${titelText}</div>
        <span class="material-symbols-outlined grammatik-karte-pfeil">expand_more</span>
    `;

    const inhalt = document.createElement('div');
    inhalt.className = 'grammatik-karte-inhalt';
    inhalt.hidden = true;
    inhalt.innerHTML = `<div class="grammatik-regeltext">${regel.regeltext}</div>`;

    kopf.onclick = () => _karte_umschalten(karte, kopf, inhalt);

    // Admin-Aktionen
    if (_ist_admin) {
        const aktionen = document.createElement('div');
        aktionen.className = 'grammatik-karte-aktionen';

        const btn_bearbeiten = document.createElement('button');
        btn_bearbeiten.className = 'grammatik-aktion-btn';
        btn_bearbeiten.title = t('allgemein.bearbeiten');
        btn_bearbeiten.innerHTML = '<span class="material-symbols-outlined">edit</span>';
        btn_bearbeiten.onclick = (e) => { e.stopPropagation(); _dialog_oeffnen(regel); };

        const btn_loeschen = document.createElement('button');
        btn_loeschen.className = 'grammatik-aktion-btn grammatik-aktion-btn--loeschen';
        btn_loeschen.title = t('allgemein.loeschen');
        btn_loeschen.innerHTML = '<span class="material-symbols-outlined">delete</span>';
        btn_loeschen.onclick = (e) => { e.stopPropagation(); _regel_loeschen(regel.id); };

        aktionen.appendChild(btn_bearbeiten);
        aktionen.appendChild(btn_loeschen);
        inhalt.appendChild(aktionen);
    }

    karte.appendChild(kopf);
    karte.appendChild(inhalt);
    return karte;
}

function _karte_umschalten(karte, kopf, inhalt) {
    const offen = kopf.getAttribute('aria-expanded') === 'true';
    kopf.setAttribute('aria-expanded', String(!offen));
    inhalt.hidden = offen;
    const pfeil = kopf.querySelector('.grammatik-karte-pfeil');
    if (pfeil) pfeil.textContent = offen ? 'expand_more' : 'expand_less';
    karte.classList.toggle('offen', !offen);
}

// ─── Deeplink ─────────────────────────────────────────────────────────────────

function _regel_fokussieren(regelId) {
    const karte = document.querySelector(`.grammatik-karte[data-regel-id="${regelId}"]`);
    if (!karte) return;

    const kopf   = karte.querySelector('.grammatik-karte-kopf');
    const inhalt = karte.querySelector('.grammatik-karte-inhalt');
    if (!kopf || !inhalt) return;

    if (kopf.getAttribute('aria-expanded') !== 'true') {
        _karte_umschalten(karte, kopf, inhalt);
    }
    karte.scrollIntoView({ behavior: 'smooth', block: 'start' });
    karte.classList.add('fokussiert');
    setTimeout(() => karte.classList.remove('fokussiert'), 2000);
}

// ─── Admin: Löschen ──────────────────────────────────────────────────────────

async function _regel_loeschen(id) {
    if (!confirm(t('grammatik.loeschen_bestaetigen'))) return;

    const res = await apiDelete(`grammatik/loeschen.php?id=${id}`);
    if (res.erfolg) {
        _regeln = _regeln.filter(r => r.id !== id);
        const inhalt = document.getElementById('grammatik-inhalt');
        if (inhalt) await _sektion_rendern(inhalt, {});
        benachrichtigen(t('grammatik.regel_geloescht'), 'erfolg');
    } else {
        benachrichtigen(res.fehler?.nachricht ?? t('grammatik.fehler_loeschen'), 'fehler');
    }
}

// ─── Admin: Dialog (Erstellen / Bearbeiten) ───────────────────────────────────

const _DIALOG_GENUS_MAP = {
    Nomen:    ['en', 'ett', 'en/ett'],
    Verb:     ['Gr. 1', 'Gr. 2a', 'Gr. 2b', 'Gr. 3', 'Gr. 4', 'Kein Eintrag'],
    Adjektiv: ['Kein Eintrag'],
};

const _DIALOG_FORMEN_MAP = {
    Nomen:    ['unbestimmt_singular', 'bestimmt_singular', 'unbestimmt_plural', 'bestimmt_plural'],
    Verb:     ['infinitiv', 'praesens', 'praeteritum', 'supinum', 'imperativ', 'perfekt_partizip', 's_form'],
    Adjektiv: ['grundform', 'neutrum_form', 'komparativ', 'superlativ', 'bestimmte_form'],
};

export function FORM_LABELS() {
    return {
        unbestimmt_singular: t('grammatik.form_unbest_sg'),
        bestimmt_singular:   t('grammatik.form_best_sg'),
        unbestimmt_plural:   t('grammatik.form_unbest_pl'),
        bestimmt_plural:     t('grammatik.form_best_pl'),
        infinitiv:           t('grammatik.form_infinitiv'),
        praesens:            t('grammatik.form_praesens'),
        praeteritum:         t('grammatik.form_praeteritum'),
        supinum:             t('grammatik.form_supinum'),
        imperativ:           t('grammatik.form_imperativ'),
        perfekt_partizip:    t('grammatik.form_perf_partizip'),
        s_form:              t('grammatik.form_s_form'),
        grundform:           t('grammatik.form_grundform'),
        neutrum_form:        t('grammatik.form_neutrum'),
        komparativ:          t('grammatik.form_komparativ'),
        superlativ:          t('grammatik.form_superlativ'),
        bestimmte_form:      t('grammatik.form_best_form'),
    };
}

function _dialog_genus_optionen_html(wortart, ausgewaehlt) {
    const opts = _DIALOG_GENUS_MAP[wortart] ?? [];
    if (!opts.length) return `<option value="">${t('grammatik.erst_wortart_waehlen')}</option>`;
    return opts.map(o => {
        const label = o.toLowerCase() === 'kein eintrag' ? t('grammatik.filter_alle') : o;
        return `<option value="${esc(o)}"${o === ausgewaehlt ? ' selected' : ''}>${esc(label)}</option>`;
    }).join('');
}

function _dialog_formen_checkboxen_html(wortart, ausgewaehlt = []) {
    const formen = _DIALOG_FORMEN_MAP[wortart] ?? [];
    if (!formen.length) return `<span class="grammatik-formen-leer">${t('grammatik.erst_wortart_waehlen')}</span>`;
    return formen.map(fb => {
        const label   = FORM_LABELS()[fb] ?? fb;
        const checked = ausgewaehlt.includes(fb) ? 'checked' : '';
        return `<label class="grammatik-form-checkbox">
            <input type="checkbox" name="formen" value="${esc(fb)}" ${checked}>
            <span>${esc(label)}</span>
        </label>`;
    }).join('');
}

function _dialog_genus_aktualisieren(form_el, wortart, ausgewaehlt) {
    const sel = form_el.querySelector('[name="genus_gruppe"]');
    if (sel) sel.innerHTML = _dialog_genus_optionen_html(wortart, ausgewaehlt ?? '');
}

function _dialog_formen_aktualisieren(form_el, wortart, ausgewaehlt = []) {
    const box = form_el.querySelector('#grammatik-formen-checkboxen');
    if (box) box.innerHTML = _dialog_formen_checkboxen_html(wortart, ausgewaehlt);
}

function _dialog_oeffnen(regel) {
    const alt = document.getElementById('grammatik-dialog-overlay');
    if (alt) alt.remove();

    const overlay = document.createElement('div');
    overlay.id        = 'grammatik-dialog-overlay';
    overlay.className = 'grammatik-dialog-overlay';
    overlay.onclick   = (e) => { if (e.target === overlay) overlay.remove(); };

    const dialog = document.createElement('div');
    dialog.className = 'grammatik-dialog';

    const istNeu   = !regel;
    const wortart0 = regel?.wortart     ?? '';
    const gg0      = regel?.genus_gruppe ?? '';
    const formen0  = regel?.formen       ?? [];

    dialog.innerHTML = `
        <h2 class="grammatik-dialog-titel">${istNeu ? t('grammatik.neue_regel') : t('grammatik.regel_bearbeiten')}</h2>
        <form id="grammatik-dialog-form" class="grammatik-dialog-form">
            <label>${t('grammatik.label_wortart')}
                <select name="wortart" required>
                    <option value="">${t('grammatik.waehlen')}</option>
                    <option value="Nomen"    ${wortart0 === 'Nomen'    ? 'selected' : ''}>Nomen</option>
                    <option value="Verb"     ${wortart0 === 'Verb'     ? 'selected' : ''}>Verb</option>
                    <option value="Adjektiv" ${wortart0 === 'Adjektiv' ? 'selected' : ''}>Adjektiv</option>
                </select>
            </label>
            <label>${t('grammatik.label_genus_gruppe')}
                <select name="genus_gruppe" required>
                    ${_dialog_genus_optionen_html(wortart0, gg0)}
                </select>
            </label>
            <fieldset class="grammatik-dialog-formen-fieldset">
                <legend>${t('grammatik.gilt_fuer_formen')}</legend>
                <div id="grammatik-formen-checkboxen">
                    ${_dialog_formen_checkboxen_html(wortart0, formen0)}
                </div>
            </fieldset>
            <label>${t('grammatik.label_regelueberschrift')}
                <textarea name="regel" rows="2">${esc(regel?.regel ?? '')}</textarea>
            </label>
            <label>${t('grammatik.label_regeltext')}
                <textarea name="regeltext" rows="6" required>${esc(regel?.regeltext ?? '')}</textarea>
            </label>
            <label>${t('grammatik.label_reihenfolge')}
                <input type="number" name="reihenfolge" value="${regel?.reihenfolge ?? 0}" min="0">
            </label>
            <div class="grammatik-dialog-buttons">
                <button type="button" class="btn btn--text" id="grammatik-dialog-abbrechen">${t('allgemein.abbrechen')}</button>
                <button type="submit" class="btn btn--gefuellt">${istNeu ? t('grammatik.erstellen') : t('allgemein.speichern')}</button>
            </div>
        </form>
    `;

    dialog.querySelector('#grammatik-dialog-abbrechen').onclick = () => overlay.remove();

    const form_el = dialog.querySelector('#grammatik-dialog-form');

    form_el.querySelector('[name="wortart"]').addEventListener('change', (e) => {
        _dialog_genus_aktualisieren(form_el, e.target.value, null);
        _dialog_formen_aktualisieren(form_el, e.target.value, []);
    });

    form_el.onsubmit = async (e) => {
        e.preventDefault();
        await _dialog_speichern(e.target, regel, overlay);
    };

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    dialog.querySelector('select, input')?.focus();
}

async function _dialog_speichern(form, regelAlt, overlay) {
    const fd   = new FormData(form);
    const data = Object.fromEntries(fd);
    data.reihenfolge = parseInt(data.reihenfolge, 10) || 0;
    data.formen = Array.from(form.querySelectorAll('[name="formen"]:checked')).map(cb => cb.value);
    if (data.formen.length === 0) {
        benachrichtigen(t('grammatik.mind_eine_form'), 'fehler');
        return;
    }

    const submitBtn = form.querySelector('[type="submit"]');
    submitBtn.disabled = true;

    let res;
    if (!regelAlt) {
        res = await apiPost('grammatik/erstellen.php', data);
    } else {
        res = await apiPost(`grammatik/aktualisieren.php?id=${regelAlt.id}`, data);
    }

    submitBtn.disabled = false;

    if (res.erfolg) {
        const neueRegel = res.daten.regel;
        if (!regelAlt) {
            _regeln.push(neueRegel);
            _regeln.sort((a, b) => a.reihenfolge - b.reihenfolge || a.id - b.id);
        } else {
            const idx = _regeln.findIndex(r => r.id === regelAlt.id);
            if (idx !== -1) _regeln[idx] = neueRegel;
        }

        const inhalt = document.getElementById('grammatik-inhalt');
        if (inhalt) await _sektion_rendern(inhalt, {});

        overlay.remove();
        benachrichtigen(regelAlt ? t('grammatik.regel_aktualisiert') : t('grammatik.regel_erstellt'), 'erfolg');

        if (!regelAlt) {
            requestAnimationFrame(() => _regel_fokussieren(neueRegel.id));
        }
    } else {
        benachrichtigen(res.fehler?.nachricht ?? t('grammatik.fehler_speichern'), 'fehler');
    }
}
