/**
 * Belohnungen — Belohnungs-Galerie
 *
 * Zeigt alle 13 Belohnungen in 3 Kategorien (Abzeichen, Meilensteine, Titel).
 * Freigeschaltete bunt mit Datum, Gesperrte grau mit Fortschrittsbalken.
 * Gesamt-Fortschritt als Uebersichtsbalken.
 */

import { apiGet } from '../api-client.js';
import { esc, zahlFormatieren } from '../hilfs-funktionen.js';
import { lade_anzeige_rendern, lade_anzeige_entfernen } from '../komponenten/lade-anzeige.js';
import { leer_zustand_rendern } from '../komponenten/leer-zustand.js';
import { t, aktuelle_sprache } from '../dienste/sprache.js';

// ============================================
// Typ-Konfiguration
// ============================================

function _typ_labels() {
    return {
        abzeichen: t('belohnungen.typ_abzeichen'),
        meilenstein: t('belohnungen.typ_meilenstein'),
        titel: t('belohnungen.typ_titel'),
    };
}

const TYP_ICONS = {
    abzeichen: 'verified',
    meilenstein: 'flag',
    titel: 'workspace_premium',
};

const TYP_REIHENFOLGE = ['abzeichen', 'meilenstein', 'titel'];

// ============================================
// Modul-Exports
// ============================================

/**
 * Belohnungen-Modul rendern
 */
export async function rendern() {
    const container = document.getElementById('inhalt');
    if (!container) return;

    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'belohnungen';
    container.appendChild(wrapper);

    lade_anzeige_rendern(wrapper);

    try {
        const ergebnis = await apiGet('belohnungen/liste.php');

        lade_anzeige_entfernen(wrapper);

        if (!ergebnis.erfolg) {
            leer_zustand_rendern(wrapper, 'error', t('profil.fehler_titel'), t('belohnungen.fehler_laden'));
            return;
        }

        _seite_rendern(wrapper, ergebnis.daten);
    } catch (e) {
        console.error('Belohnungen laden fehlgeschlagen:', e);
        lade_anzeige_entfernen(wrapper);
        leer_zustand_rendern(wrapper, 'error', t('profil.fehler_titel'), t('belohnungen.fehler_laden'));
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

function _seite_rendern(wrapper, daten) {
    const belohnungen = daten.belohnungen || [];
    const zf = daten.zusammenfassung || {};

    wrapper.innerHTML = '';

    // --- Kopf mit Zusammenfassung ---
    const kopf = document.createElement('section');
    kopf.className = 'belohnungen__kopf';

    const titel = document.createElement('h2');
    titel.textContent = t('belohnungen.titel');
    kopf.appendChild(titel);

    const zusammenfassung = document.createElement('p');
    zusammenfassung.className = 'belohnungen__zusammenfassung';
    zusammenfassung.textContent = t('belohnungen.zusammenfassung', {freigeschaltet: zf.freigeschaltet || 0, gesamt: zf.gesamt || 0, prozent: zf.prozent || 0});
    kopf.appendChild(zusammenfassung);

    // Gesamt-Fortschrittsbalken
    const gesamtFortschritt = document.createElement('div');
    gesamtFortschritt.className = 'belohnungen__gesamt-fortschritt';

    const gesamtBalken = document.createElement('div');
    gesamtBalken.className = 'belohnungen__gesamt-balken';
    gesamtBalken.style.width = `${zf.prozent || 0}%`;
    gesamtFortschritt.appendChild(gesamtBalken);

    kopf.appendChild(gesamtFortschritt);
    wrapper.appendChild(kopf);

    // --- Echte (Gruppen-)Belohnungen zuerst ---
    const echt_belohnungen = belohnungen.filter(b => b.typ === 'echt');
    if (echt_belohnungen.length > 0) {
        wrapper.appendChild(_echt_sektion(echt_belohnungen));
    }

    // --- Belohnungen nach Typ gruppieren (ohne 'echt') ---
    const nach_typ = {};
    for (const b of belohnungen) {
        if (b.typ === 'echt') continue;
        const typ = b.typ || 'abzeichen';
        if (!nach_typ[typ]) nach_typ[typ] = [];
        nach_typ[typ].push(b);
    }

    // --- Pro Typ eine Sektion ---
    for (const typ of TYP_REIHENFOLGE) {
        const items = nach_typ[typ];
        if (!items || items.length === 0) continue;

        const sektion = document.createElement('section');
        sektion.className = 'belohnungen__kategorie';

        const kategorieTitel = document.createElement('h3');
        kategorieTitel.className = 'belohnungen__kategorie-titel';
        kategorieTitel.innerHTML = `<span class="material-symbols-outlined">${TYP_ICONS[typ]}</span> ${_typ_labels()[typ]}`;
        sektion.appendChild(kategorieTitel);

        const grid = document.createElement('div');
        grid.className = 'belohnungen__grid';

        for (const b of items) {
            grid.appendChild(_belohnung_karte(b));
        }

        sektion.appendChild(grid);
        wrapper.appendChild(sektion);
    }

    // Leer-Zustand
    if (belohnungen.length === 0) {
        leer_zustand_rendern(wrapper, 'military_tech', t('belohnungen.keine'),
            t('belohnungen.keine_text'));
    }
}

// ============================================
// Belohnungs-Karte
// ============================================

// ============================================
// Echte Gruppen-Belohnungen
// ============================================

function _echt_sektion(belohnungen) {
    const sektion = document.createElement('section');
    sektion.className = 'belohnungen__kategorie belohnungen__kategorie--echt';

    const kategorieTitel = document.createElement('h3');
    kategorieTitel.className = 'belohnungen__kategorie-titel';
    kategorieTitel.innerHTML = `<span class="material-symbols-outlined">redeem</span> ${t('belohnungen.echte_titel')}`;
    sektion.appendChild(kategorieTitel);

    const grid = document.createElement('div');
    grid.className = 'belohnungen__grid';

    for (const b of belohnungen) {
        grid.appendChild(_echt_karte(b));
    }

    sektion.appendChild(grid);
    return sektion;
}

function _echt_karte(belohnung) {
    const karte = document.createElement('div');
    karte.className = 'belohnungen__karte belohnungen__karte--echt';
    if (belohnung.freigeschaltet || belohnung.alle_erreicht) {
        karte.classList.add('belohnungen__karte--freigeschaltet');
    } else {
        karte.classList.add('belohnungen__karte--gesperrt');
    }

    // Zeile: Icon + Inhalt nebeneinander (karte selbst ist flex-column)
    const zeile = document.createElement('div');
    zeile.className = 'belohnungen__karte-zeile';

    // --- Icon ---
    const iconContainer = document.createElement('div');
    iconContainer.className = 'belohnungen__karte-icon';
    if (belohnung.alle_erreicht) {
        iconContainer.innerHTML = belohnung.bild_pfad
            ? `<img src="${esc(belohnung.bild_pfad)}" alt="" class="belohnungen__karte-bild">`
            : '<span class="material-symbols-outlined">card_giftcard</span>';
    } else if (belohnung.freigeschaltet) {
        iconContainer.innerHTML = belohnung.bild_pfad
            ? `<img src="${esc(belohnung.bild_pfad)}" alt="" class="belohnungen__karte-bild">`
            : '<span class="material-symbols-outlined">redeem</span>';
    } else {
        iconContainer.classList.add('belohnungen__karte-icon--gesperrt');
        iconContainer.innerHTML = '<span class="material-symbols-outlined">lock</span>';
    }
    zeile.appendChild(iconContainer);

    // --- Inhalt ---
    const inhalt = document.createElement('div');
    inhalt.className = 'belohnungen__karte-inhalt';

    const titel = document.createElement('div');
    titel.className = 'belohnungen__karte-titel';
    titel.textContent = belohnung.titel;
    inhalt.appendChild(titel);

    if (belohnung.gruppen_name) {
        const gruppe = document.createElement('div');
        gruppe.className = 'belohnungen__karte-gruppe';
        gruppe.innerHTML = `<span class="material-symbols-outlined">groups</span> ${esc(belohnung.gruppen_name)}`;
        inhalt.appendChild(gruppe);
    }

    if (belohnung.beschreibung) {
        const beschreibung = document.createElement('div');
        beschreibung.className = 'belohnungen__karte-beschreibung';
        beschreibung.textContent = belohnung.beschreibung;
        inhalt.appendChild(beschreibung);
    }

    if (belohnung.freigeschaltet && belohnung.freigeschaltet_am) {
        const meta = document.createElement('div');
        meta.className = 'belohnungen__karte-meta';
        const datum = document.createElement('span');
        datum.className = 'belohnungen__karte-datum';
        datum.textContent = t('belohnungen.freigeschaltet_am', {datum: new Date(belohnung.freigeschaltet_am).toLocaleDateString(aktuelle_sprache() === 'sv' ? 'sv-SE' : 'de-DE')});
        meta.appendChild(datum);
        inhalt.appendChild(meta);
    }

    if (belohnung.ist_leiter) {
        // === Leiter-Ansicht: Kriterien + aufklappbare Mitgliederliste ===
        if (belohnung.kriterien) {
            const kriterienZeile = document.createElement('div');
            kriterienZeile.className = 'belohnungen__karte-kriterien-zeile';

            const kriterienText = document.createElement('span');
            kriterienText.className = 'belohnungen__karte-kriterien-text';
            kriterienText.textContent = _kriterien_text(belohnung.kriterien);
            kriterienZeile.appendChild(kriterienText);

            const expandBtn = document.createElement('button');
            expandBtn.className = 'btn-icon belohnungen__expand-btn';
            expandBtn.title = t('belohnungen.mitglieder_anzeigen');
            expandBtn.innerHTML = '<span class="material-symbols-outlined">expand_more</span>';
            kriterienZeile.appendChild(expandBtn);
            inhalt.appendChild(kriterienZeile);
        }
        zeile.appendChild(inhalt);
        karte.appendChild(zeile);

        // Aufklappbarer Bereich für Mitglieder (unterhalb der Zeile)
        const expandArea = document.createElement('div');
        expandArea.className = 'belohnungen__expand-bereich versteckt';
        karte.appendChild(expandArea);

        const expandBtn = karte.querySelector('.belohnungen__expand-btn');
        if (expandBtn) {
            let geladen = false;
            expandBtn.addEventListener('click', async () => {
                const offen = !expandArea.classList.contains('versteckt');
                expandArea.classList.toggle('versteckt', offen);
                expandBtn.querySelector('span').textContent = offen ? 'expand_more' : 'expand_less';

                if (!offen && !geladen) {
                    geladen = true;
                    expandArea.innerHTML = `<div class="belohnungen__expand-lade">${t('belohnungen.lade_mitglieder')}</div>`;
                    try {
                        const ergebnis = await apiGet('gruppen/belohnung_mitglieder_fortschritt.php', { belohnung_id: belohnung.id });
                        if (ergebnis.erfolg) {
                            expandArea.innerHTML = '';
                            expandArea.appendChild(_mitglieder_liste_rendern(ergebnis.daten.mitglieder));
                        } else {
                            expandArea.innerHTML = `<div class="belohnungen__expand-fehler">${t('belohnungen.fehler_detail')}</div>`;
                            geladen = false;
                        }
                    } catch {
                        expandArea.innerHTML = `<div class="belohnungen__expand-fehler">${t('belohnungen.fehler_detail')}</div>`;
                        geladen = false;
                    }
                }
            });
        }
    } else {
        // === Mitglieder-Ansicht: persönliche Fortschrittsbalken ===
        if (!belohnung.freigeschaltet && belohnung.fortschritt_liste?.length > 0) {
            const fortschrittBlock = document.createElement('div');
            fortschrittBlock.className = 'belohnungen__karte-fortschritt-liste';
            for (const item of belohnung.fortschritt_liste) {
                fortschrittBlock.appendChild(_fortschritt_zeile_rendern(item));
            }
            inhalt.appendChild(fortschrittBlock);
        }
        zeile.appendChild(inhalt);
        karte.appendChild(zeile);
    }

    return karte;
}

function _kriterien_text(kriterien) {
    const teile = [];
    if (kriterien.min_streak > 0) {
        const key = kriterien.streak_relativ ? 'belohnungen.kriterien_streak_relativ' : 'belohnungen.kriterien_streak';
        teile.push(t(key, {wert: kriterien.min_streak}));
    }
    if (kriterien.min_vokabeln > 0) {
        const key = kriterien.vokabeln_relativ ? 'belohnungen.kriterien_vokabeln_relativ' : 'belohnungen.kriterien_vokabeln';
        teile.push(t(key, {wert: kriterien.min_vokabeln}));
    }
    if (kriterien.min_vokabeln_geuebt > 0) teile.push(t('belohnungen.kriterien_geuebt', {wert: kriterien.min_vokabeln_geuebt}));
    return teile.join(' · ');
}

function _fortschritt_zeile_rendern(item, kompakt = false) {
    const zeile = document.createElement('div');
    zeile.className = 'belohnungen__karte-fortschritt' + (kompakt ? ' belohnungen__karte-fortschritt--kompakt' : '');

    const label = document.createElement('span');
    label.className = 'belohnungen__karte-fortschritt-label';
    label.textContent = item.einheit ? `${item.label} (${item.einheit})` : item.label;
    zeile.appendChild(label);

    const balken = document.createElement('div');
    balken.className = 'belohnungen__karte-balken';
    const fuellung = document.createElement('div');
    fuellung.className = 'belohnungen__karte-fuellung';
    fuellung.style.width = `${item.prozent}%`;
    balken.appendChild(fuellung);
    zeile.appendChild(balken);

    const text = document.createElement('span');
    text.className = 'belohnungen__karte-fortschritt-text';
    text.textContent = `${zahlFormatieren(item.aktuell)} / ${zahlFormatieren(item.ziel)}`;
    zeile.appendChild(text);

    return zeile;
}

function _mitglieder_liste_rendern(mitglieder) {
    const liste = document.createElement('div');
    liste.className = 'belohnungen__mitglieder-liste';

    if (!mitglieder || mitglieder.length === 0) {
        liste.innerHTML = `<div class="belohnungen__mitglied-leer">${t('belohnungen.keine_mitglieder')}</div>`;
        return liste;
    }

    for (const m of mitglieder) {
        const eintrag = document.createElement('div');
        eintrag.className = 'belohnungen__mitglied-eintrag' + (m.freigeschaltet ? ' belohnungen__mitglied-eintrag--erreicht' : '');

        const nameZeile = document.createElement('div');
        nameZeile.className = 'belohnungen__mitglied-name';
        nameZeile.innerHTML = `<span class="material-symbols-outlined">person</span> ${esc(m.benutzername)}`;
        if (m.freigeschaltet) {
            nameZeile.innerHTML += ' <span class="material-symbols-outlined belohnungen__mitglied-check">verified</span>';
        }
        eintrag.appendChild(nameZeile);

        if (m.fortschritt_liste?.length > 0) {
            for (const item of m.fortschritt_liste) {
                eintrag.appendChild(_fortschritt_zeile_rendern(item, true));
            }
        }

        liste.appendChild(eintrag);
    }

    return liste;
}

// ============================================
// Standard-Belohnungs-Karte
// ============================================

function _belohnung_karte(belohnung) {
    const karte = document.createElement('div');
    karte.className = 'belohnungen__karte';

    if (belohnung.freigeschaltet) {
        karte.classList.add('belohnungen__karte--freigeschaltet');
    } else {
        karte.classList.add('belohnungen__karte--gesperrt');
    }

    // --- Icon ---
    const iconContainer = document.createElement('div');
    iconContainer.className = 'belohnungen__karte-icon';

    if (belohnung.freigeschaltet) {
        if (belohnung.bild_pfad) {
            iconContainer.innerHTML = `<img src="${esc(belohnung.bild_pfad)}" alt="" class="belohnungen__karte-bild">`;
        } else {
            iconContainer.innerHTML = '<span class="material-symbols-outlined">military_tech</span>';
        }
    } else {
        iconContainer.classList.add('belohnungen__karte-icon--gesperrt');
        iconContainer.innerHTML = '<span class="material-symbols-outlined">lock</span>';
    }

    karte.appendChild(iconContainer);

    // --- Inhalt ---
    const inhalt = document.createElement('div');
    inhalt.className = 'belohnungen__karte-inhalt';

    const titel = document.createElement('div');
    titel.className = 'belohnungen__karte-titel';
    titel.textContent = belohnung.titel;
    inhalt.appendChild(titel);

    const beschreibung = document.createElement('div');
    beschreibung.className = 'belohnungen__karte-beschreibung';
    beschreibung.textContent = belohnung.beschreibung || '';
    inhalt.appendChild(beschreibung);

    // Freigeschaltet: Datum + XP
    if (belohnung.freigeschaltet) {
        const meta = document.createElement('div');
        meta.className = 'belohnungen__karte-meta';

        if (belohnung.freigeschaltet_am) {
            const datum = document.createElement('span');
            datum.className = 'belohnungen__karte-datum';
            const d = new Date(belohnung.freigeschaltet_am);
            datum.textContent = t('belohnungen.freigeschaltet_am', {datum: d.toLocaleDateString(aktuelle_sprache() === 'sv' ? 'sv-SE' : 'de-DE')});
            meta.appendChild(datum);
        }

        if (belohnung.xp_wert > 0) {
            const xp = document.createElement('span');
            xp.className = 'belohnungen__karte-xp';
            xp.textContent = `+${belohnung.xp_wert} XP`;
            meta.appendChild(xp);
        }

        inhalt.appendChild(meta);
    }

    // Gesperrt: Fortschrittsbalken
    if (!belohnung.freigeschaltet && belohnung.fortschritt) {
        const f = belohnung.fortschritt;
        const fortschritt = document.createElement('div');
        fortschritt.className = 'belohnungen__karte-fortschritt';

        const balken = document.createElement('div');
        balken.className = 'belohnungen__karte-balken';

        const fuellung = document.createElement('div');
        fuellung.className = 'belohnungen__karte-fuellung';
        fuellung.style.width = `${f.prozent}%`;
        balken.appendChild(fuellung);

        fortschritt.appendChild(balken);

        const text = document.createElement('span');
        text.className = 'belohnungen__karte-fortschritt-text';
        text.textContent = `${zahlFormatieren(f.aktuell)} / ${zahlFormatieren(f.ziel)}`;
        fortschritt.appendChild(text);

        inhalt.appendChild(fortschritt);
    }

    karte.appendChild(inhalt);

    return karte;
}
