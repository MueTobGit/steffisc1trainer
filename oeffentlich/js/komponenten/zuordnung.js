/**
 * Zuordnung (Matching) Komponente
 *
 * Zeigt 4-6 schwedische Woerter links und 4-6 deutsche Woerter rechts.
 * Tap-to-match: Erstes Tippen waehlt, zweites Tippen verbindet.
 * Android WebView-kompatibel (kein Drag & Drop).
 * Genutzt von schnellueben.js (Phase 5).
 *
 * @module komponenten/zuordnung
 */

import { esc } from '../hilfs-funktionen.js';
import { t } from '../dienste/sprache.js';

/**
 * Zuordnung-Aufgabe erstellen
 *
 * @param {object} aufgabe Aufgaben-Daten vom Server
 * @param {object} optionen Callbacks
 * @returns {HTMLElement}
 */
export function zuordnung_erstellen(aufgabe, optionen = {}) {
    const {
        onFertig = () => {},
        onWeiter = () => {},
    } = optionen;

    // Interner Zustand
    let _ausgewaehlt = null;   // { seite: 'links'|'rechts', index: number, element: HTMLElement }
    let _verbundene_paare = 0;
    let _fehlversuche = 0;
    let _fertig = false;

    const gesamt_paare = aufgabe.gesamt_paare || aufgabe.paare.length;

    // Paare-Lookup: links-Index → rechts-Text (korrekte Zuordnung)
    const korrekte_zuordnung = {};
    aufgabe.paare.forEach((paar, i) => {
        korrekte_zuordnung[i] = paar.rechts;
    });

    // Rechte Seite: gemischte Reihenfolge
    const rechts_items = aufgabe.rechts_reihenfolge || aufgabe.paare.map(p => p.rechts);

    // Farben fuer verbundene Paare
    const paar_farben = [
        'var(--md-sys-color-primary-container)',
        'var(--md-sys-color-tertiary-container)',
        'var(--md-sys-color-secondary-container)',
        'var(--md-sys-color-surface-container-highest)',
        'var(--md-sys-color-primary-container)',
        'var(--md-sys-color-tertiary-container)',
    ];

    // --- Container ---
    const container = document.createElement('div');
    container.className = 'zuordnung-aufgabe';

    // --- Kopf ---
    const kopf = document.createElement('div');
    kopf.className = 'zuordnung-aufgabe__kopf';

    const badge = document.createElement('span');
    badge.className = 'frage-badge frage-badge--zuordnung';
    badge.textContent = t('zuordnung.badge');
    kopf.appendChild(badge);

    const zaehler = document.createElement('span');
    zaehler.className = 'zuordnung-aufgabe__zaehler';
    zaehler.textContent = t('zuordnung.zaehler', {aktuell: 0, gesamt: gesamt_paare});
    kopf.appendChild(zaehler);

    container.appendChild(kopf);

    // --- Spalten ---
    const spalten = document.createElement('div');
    spalten.className = 'zuordnung-aufgabe__spalten';

    // Linke Spalte (Schwedisch)
    const spalteLinks = document.createElement('div');
    spalteLinks.className = 'zuordnung-aufgabe__spalte zuordnung-aufgabe__spalte--links';

    const linksButtons = [];
    aufgabe.paare.forEach((paar, i) => {
        const btn = document.createElement('button');
        btn.className = 'zuordnung-aufgabe__item';
        btn.type = 'button';
        btn.dataset.seite = 'links';
        btn.dataset.index = i;
        btn.dataset.text = paar.links;
        btn.textContent = paar.links;

        btn.addEventListener('click', () => _item_klick('links', i, btn));
        linksButtons.push(btn);
        spalteLinks.appendChild(btn);
    });

    // Rechte Spalte (Deutsch, gemischt)
    const spalteRechts = document.createElement('div');
    spalteRechts.className = 'zuordnung-aufgabe__spalte zuordnung-aufgabe__spalte--rechts';

    const rechtsButtons = [];
    rechts_items.forEach((text, i) => {
        const btn = document.createElement('button');
        btn.className = 'zuordnung-aufgabe__item';
        btn.type = 'button';
        btn.dataset.seite = 'rechts';
        btn.dataset.index = i;
        btn.dataset.text = text;
        btn.textContent = text;

        btn.addEventListener('click', () => _item_klick('rechts', i, btn));
        rechtsButtons.push(btn);
        spalteRechts.appendChild(btn);
    });

    spalten.appendChild(spalteLinks);
    spalten.appendChild(spalteRechts);
    container.appendChild(spalten);

    // --- Aktionen (versteckt bis fertig) ---
    const aktionenBereich = document.createElement('div');
    aktionenBereich.className = 'zuordnung-aufgabe__aktionen versteckt';

    const xpBadge = document.createElement('span');
    xpBadge.className = 'xp-badge';
    xpBadge.textContent = `+${gesamt_paare * 3} XP`;
    aktionenBereich.appendChild(xpBadge);

    const weiterBtn = document.createElement('button');
    weiterBtn.type = 'button';
    weiterBtn.className = 'btn btn--gefuellt';
    weiterBtn.textContent = t('allgemein.weiter');
    weiterBtn.addEventListener('click', () => {
        onWeiter();
    });
    aktionenBereich.appendChild(weiterBtn);

    container.appendChild(aktionenBereich);

    // --- Klick-Handler ---
    function _item_klick(seite, index, element) {
        if (_fertig) return;
        if (element.classList.contains('zuordnung-aufgabe__item--verbunden')) return;

        if (_ausgewaehlt === null) {
            // Erste Auswahl
            _auswahl_setzen(seite, index, element);
        } else if (_ausgewaehlt.seite === seite) {
            // Gleiche Seite → Auswahl wechseln
            _ausgewaehlt.element.classList.remove('zuordnung-aufgabe__item--ausgewaehlt');
            _auswahl_setzen(seite, index, element);
        } else {
            // Andere Seite → Paar pruefen
            const links_index = seite === 'links' ? index : _ausgewaehlt.index;
            const rechts_index = seite === 'rechts' ? index : _ausgewaehlt.index;
            const links_btn = seite === 'links' ? element : _ausgewaehlt.element;
            const rechts_btn = seite === 'rechts' ? element : _ausgewaehlt.element;

            // Korrekt? links_index zeigt auf paare[links_index].rechts
            const erwartet = korrekte_zuordnung[links_index];
            const gewaehlt = rechts_items[rechts_index];

            if (erwartet === gewaehlt) {
                // Richtig!
                _paar_verbinden(links_btn, rechts_btn);
            } else {
                // Falsch — rotes Aufblitzen
                _fehlversuche++;
                _falsch_aufblitzen(links_btn, rechts_btn);
            }

            // Auswahl aufheben
            _ausgewaehlt.element.classList.remove('zuordnung-aufgabe__item--ausgewaehlt');
            _ausgewaehlt = null;
        }
    }

    function _auswahl_setzen(seite, index, element) {
        _ausgewaehlt = { seite, index, element };
        element.classList.add('zuordnung-aufgabe__item--ausgewaehlt');
    }

    function _paar_verbinden(linksBtn, rechtsBtn) {
        const farbe = paar_farben[_verbundene_paare % paar_farben.length];

        linksBtn.classList.add('zuordnung-aufgabe__item--verbunden');
        rechtsBtn.classList.add('zuordnung-aufgabe__item--verbunden');
        linksBtn.style.background = farbe;
        rechtsBtn.style.background = farbe;

        _verbundene_paare++;
        zaehler.textContent = t('zuordnung.zaehler', {aktuell: _verbundene_paare, gesamt: gesamt_paare});

        // Alle verbunden?
        if (_verbundene_paare >= gesamt_paare) {
            _fertig = true;
            const alle_richtig = _fehlversuche === 0;

            // Aktionen anzeigen
            aktionenBereich.classList.remove('versteckt');

            // XP nur wenn alle richtig ohne Fehler
            if (!alle_richtig) {
                xpBadge.classList.add('versteckt');
            }

            onFertig(alle_richtig);
        }
    }

    function _falsch_aufblitzen(btn1, btn2) {
        btn1.classList.add('zuordnung-aufgabe__item--falsch');
        btn2.classList.add('zuordnung-aufgabe__item--falsch');

        setTimeout(() => {
            btn1.classList.remove('zuordnung-aufgabe__item--falsch');
            btn2.classList.remove('zuordnung-aufgabe__item--falsch');
        }, 600);
    }

    return container;
}
