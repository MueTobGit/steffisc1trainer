/**
 * android-benachrichtigungen.js
 *
 * Dienst zum Verwalten von App-Benachrichtigungen via Android-Bridge.
 *
 * Benachrichtigungs-Typen:
 * ┌──────────────────────┬────────────────────────────────────────────────────┐
 * │ ID                   │ Beschreibung                                       │
 * ├──────────────────────┼────────────────────────────────────────────────────┤
 * │ uebungs_erinnerung   │ Täglich zur konfig. Uhrzeit (wenn noch nicht geübt)│
 * │ streak_warnung       │ Täglich früh: gestern nicht geübt → Streak verpasse│
 * │ einmalig_*           │ Aus einer Liste (z.B. Update verfügbar)            │
 * │ milestone_*          │ Konfigurierbare Milestone-Benachrichtigungen        │
 * └──────────────────────┴────────────────────────────────────────────────────┘
 *
 * Verwendung:
 *   import { benachrichtigungen_init, uebungs_erinnerung_setzen } from './android-benachrichtigungen.js';
 *
 *   // Beim App-Start:
 *   benachrichtigungen_init();
 *
 *   // Aus den Einstellungen:
 *   uebungs_erinnerung_setzen({ aktiv: true, uhrzeit: '20:00' });
 *   streak_warnung_setzen({ aktiv: true, uhrzeit: '09:00' });
 *   einmalige_benachrichtigungen_setzen([{ id: 'update_1_1', titel: 'Update', text: '...' }]);
 *   milestone_benachrichtigungen_setzen([{ typ: 'xp', wert: 1000, titel: '...', text: '...' }]);
 */

import { holen as _zustand_holen } from '../zustand.js';

// ============================================
// Interner Zustand
// ============================================

/** @type {boolean} Läuft die App als Android-WebView? */
let _ist_android = false;

/** @type {boolean} Hat der Nutzer Benachrichtigungen erlaubt? */
let _berechtigung = false;

// ============================================
// Initialisierung
// ============================================

/**
 * Benachrichtigungs-Dienst initialisieren.
 * Erkennt Android-Umgebung, lädt gespeicherte Konfigurationen,
 * und richtet bei Erststart Standard-Alarme ein.
 * Muss einmalig beim App-Start aufgerufen werden.
 */
export function benachrichtigungen_init() {
    _ist_android = !!window.Android;

    if (!_ist_android) return;

    // Berechtigung prüfen (Methode könnte fehlen → false als Fallback)
    _berechtigung = typeof window.Android.benachrichtigungErlaubt === 'function'
        ? window.Android.benachrichtigungErlaubt()
        : false;

    // Auf TTS-Ready-Event warten (Seite vollständig geladen)
    window.addEventListener('androidTtsReady', () => {
        // Konfiguration mit gespeicherten Werten zurückspielen (für Einstellungsseite)
        _konfigs_vom_android_laden();

        // Bei Erststart (leere SharedPreferences): Standard-Alarme einrichten.
        // KEIN _berechtigung-Guard: AlarmManager braucht keine POST_NOTIFICATIONS-Permission.
        // Die Permission ist nur nötig damit die Notification angezeigt wird, nicht zum Planen.
        // Ohne diesen Guard würde bei laufendem Permission-Dialog (Seite schon geladen,
        // Nutzer noch nicht geklickt) _berechtigung=false sein → keine Alarme → leerer dumpsys.
        _standard_alarme_initialisieren();
    }, { once: true });
}

/**
 * Prüft ob Benachrichtigungen verfügbar sind.
 * @returns {boolean}
 */
export function benachrichtigungen_verfuegbar() {
    return _ist_android && _berechtigung;
}

/**
 * Benachrichtigungsberechtigung anfragen.
 * Callback: window._vtBenachrichtigungBereitschaft(granted)
 * Richtet nach erstmaliger Genehmigung automatisch Standard-Alarme ein,
 * falls noch keine Konfigurationen vorhanden sind.
 *
 * @returns {Promise<boolean>}
 */
export function berechtigung_anfragen() {
    if (!_ist_android || typeof window.Android.benachrichtigungBerechtigungAnfragen !== 'function') return Promise.resolve(false);

    return new Promise((resolve) => {
        window._vtBenachrichtigungBereitschaft = (granted) => {
            _berechtigung = !!granted;
            delete window._vtBenachrichtigungBereitschaft;

            // Berechtigung gerade erteilt → Standard-Alarme einrichten falls noch keine da
            if (_berechtigung) {
                _standard_alarme_initialisieren();
            }

            resolve(_berechtigung);
        };
        window.Android.benachrichtigungBerechtigungAnfragen();

        // Timeout-Fallback (falls Callback nicht aufgerufen wird)
        setTimeout(() => {
            if (window._vtBenachrichtigungBereitschaft) {
                delete window._vtBenachrichtigungBereitschaft;
                resolve(false);
            }
        }, 10000);
    });
}

// ============================================
// Übungserinnerung (täglich)
// ============================================

/**
 * Tägliche Übungserinnerung konfigurieren.
 *
 * @param {Object} optionen
 * @param {boolean} optionen.aktiv       - Benachrichtigung aktiv?
 * @param {string}  optionen.uhrzeit     - Uhrzeit im Format "HH:mm" (z.B. "20:00")
 * @param {string}  [optionen.titel]     - Optionaler Titel
 * @param {string}  [optionen.text]      - Optionaler Text
 */
export function uebungs_erinnerung_setzen(optionen) {
    if (!_ist_android || typeof window.Android.benachrichtigungKonfigurieren !== 'function') return;

    // Letztes Training aus Statistik holen (für intelligente Unterdrückung)
    // PHP gibt "YYYY-MM-DD" zurück — in ms-Timestamp umrechnen für Java
    const statistik = _zustand_holen('statistik');
    const letztesTraining = _datum_zu_timestamp(statistik?.letztes_training);

    const config = {
        id:              'uebungs_erinnerung',
        typ:             'taeglich',
        kanal:           'training',
        aktiv:           optionen.aktiv !== false,
        uhrzeit:         optionen.uhrzeit || '20:00',
        titel:           optionen.titel || '📚 Zeit zum Üben!',
        text:            optionen.text  || 'Du hast heute noch nicht geübt. Stärke deinen Wortschatz!',
        // Intelligente Unterdrückung: nicht senden wenn heute schon aktiv
        letztes_training: letztesTraining,
        unterdrücken_wenn_heute_aktiv: true,
    };

    window.Android.benachrichtigungKonfigurieren(JSON.stringify(config));
}

// ============================================
// Streak-Warnung (täglich)
// ============================================

/**
 * Tägliche Streak-Warnung konfigurieren.
 * Erinnert den Nutzer morgens, wenn er gestern nicht geübt hat.
 *
 * @param {Object} optionen
 * @param {boolean} optionen.aktiv
 * @param {string}  optionen.uhrzeit  - Uhrzeit (z.B. "09:00")
 */
export function streak_warnung_setzen(optionen) {
    if (!_ist_android || typeof window.Android.benachrichtigungKonfigurieren !== 'function') return;

    // PHP gibt "YYYY-MM-DD" zurück — in ms-Timestamp umrechnen für Java
    const statistik = _zustand_holen('statistik');
    const letztesTraining = _datum_zu_timestamp(statistik?.letztes_training);

    const config = {
        id:              'streak_warnung',
        typ:             'taeglich',
        kanal:           'streak',
        aktiv:           optionen.aktiv !== false,
        uhrzeit:         optionen.uhrzeit || '09:00',
        titel:           optionen.titel || '🔥 Streak in Gefahr!',
        text:            optionen.text  || 'Du hast gestern nicht geübt. Übe heute, um deinen Streak zu retten!',
        // Nicht senden wenn gestern oder heute schon geübt
        letztes_training: letztesTraining,
        unterdrücken_wenn_gestern_aktiv: true,
    };

    window.Android.benachrichtigungKonfigurieren(JSON.stringify(config));
}

// ============================================
// Einmalige Benachrichtigungen (aus Liste)
// ============================================

/**
 * Einmalige Benachrichtigungen aus einer Liste setzen.
 * Jede Benachrichtigung wird genau einmal angezeigt.
 *
 * @param {Array<Object>} liste
 * @param {string} liste[].id        - Eindeutige ID (einmal gesenden = merken)
 * @param {string} liste[].titel     - Titel
 * @param {string} liste[].text      - Text
 * @param {number} [liste[].timestamp] - Unix-Timestamp in ms (optional, Standard: sofort)
 */
export function einmalige_benachrichtigungen_setzen(liste) {
    if (!_ist_android || !Array.isArray(liste) || typeof window.Android.einmaligeBenachrichtigungSenden !== 'function') return;

    // Bereits gezeigte IDs laden
    const gezeigt = _gezeigte_einmalige_laden();

    liste.forEach(item => {
        if (!item.id || gezeigt.has(item.id)) return;

        if (item.timestamp && item.timestamp > Date.now()) {
            // Zukunft: Alarm planen — noch NICHT als gezeigt markieren,
            // damit der Alarm bei Bedarf neu geplant werden kann.
            const config = {
                id:        'einmalig_' + item.id,
                typ:       'einmalig',
                kanal:     'einmalig',
                aktiv:     true,
                timestamp: item.timestamp,
                titel:     item.titel,
                text:      item.text,
            };
            window.Android.benachrichtigungKonfigurieren(JSON.stringify(config));
        } else {
            // Sofort oder Vergangenheit: sofort senden und als gezeigt markieren
            window.Android.einmaligeBenachrichtigungSenden(
                item.titel,
                item.text,
                'einmalig_' + item.id,
                'einmalig'
            );
            gezeigt.add(item.id);
        }
    });

    _gezeigte_einmalige_speichern(gezeigt);
}

// ============================================
// Milestone-Benachrichtigungen
// ============================================

/**
 * Milestone-Benachrichtigung sofort auslösen (wenn Milestone erreicht).
 * Wird aus der Webapp aufgerufen wenn ein Meilenstein erreicht wird.
 *
 * @param {Object} milestone
 * @param {string} milestone.typ   - "xp" | "streak" | "vokabeln" | "level"
 * @param {number} milestone.wert  - Erreicher Wert
 * @param {string} milestone.titel - Benachrichtigungstitel
 * @param {string} milestone.text  - Benachrichtigungstext
 */
export function milestone_erreicht(milestone) {
    if (!_ist_android) return;

    const id = 'milestone_' + milestone.typ + '_' + milestone.wert;

    // Jeden Milestone nur einmal senden
    const gezeigt = _gezeigte_einmalige_laden();
    if (gezeigt.has(id)) return;

    window.Android.einmaligeBenachrichtigungSenden(
        milestone.titel,
        milestone.text,
        id,
        'milestone'
    );

    gezeigt.add(id);
    _gezeigte_einmalige_speichern(gezeigt);
}

/**
 * Milestone-Konfigurationen für die Webapp bereitstellen.
 * Die Webapp prüft beim Laden ob ein Milestone erreicht wurde
 * und ruft dann milestone_erreicht() auf.
 *
 * @param {Array<Object>} milestones
 * @param {string} milestones[].typ    - "xp" | "streak" | "vokabeln" | "level"
 * @param {number} milestones[].wert   - Schwellenwert
 * @param {string} milestones[].titel
 * @param {string} milestones[].text
 */
export function milestones_pruefen(milestones, statistik) {
    if (!_ist_android || !Array.isArray(milestones) || !statistik) return;

    milestones.forEach(m => {
        let aktuell = 0;
        switch (m.typ) {
            case 'xp':       aktuell = statistik.gesamt_xp       || 0; break;
            case 'streak':   aktuell = statistik.streak_tage     || 0; break;
            case 'vokabeln': aktuell = statistik.vokabeln_gesamt || 0; break;
            case 'level':    aktuell = statistik.level           || 0; break;
        }

        if (aktuell >= m.wert) {
            milestone_erreicht(m);
        }
    });
}

// ============================================
// Konfiguration laden/speichern
// ============================================

/**
 * Aktuelle Benachrichtigungs-Konfiguration aus der Android-App laden.
 * @returns {Object} Konfigurationen als Objekt { id: config }
 */
export function konfig_laden() {
    if (!_ist_android || typeof window.Android.getBenachrichtigungsKonfigs !== 'function') return {};
    try {
        return JSON.parse(window.Android.getBenachrichtigungsKonfigs() || '{}');
    } catch {
        return {};
    }
}

/**
 * Alle Benachrichtigungen deaktivieren.
 */
export function alle_deaktivieren() {
    if (!_ist_android || typeof window.Android.alleBenachrichtigungenEntfernen !== 'function') return;
    window.Android.alleBenachrichtigungenEntfernen();
    localStorage.removeItem('vt_gezeigte_benachrichtigungen');
}

// ============================================
// Training-Zeitstempel melden
// ============================================

/**
 * Zeitpunkt des letzten Trainings an Android melden.
 *
 * Der BenachrichtigungsEmpfaenger liest diesen Wert wenn ein Alarm feuert:
 * - Übungserinnerung (training): wird unterdrückt wenn heute schon geübt
 * - Streak-Warnung (streak):     wird unterdrückt wenn gestern oder heute geübt
 *
 * Aufruf nach erfolgreichem Trainingsabschluss:
 *   import { letztes_training_melden } from './android-benachrichtigungen.js';
 *   letztes_training_melden();
 *
 * @param {number} [timestampMs] - Unix-Timestamp in ms (Standard: jetzt)
 */
export function letztes_training_melden(timestampMs = Date.now()) {
    if (!_ist_android || typeof window.Android.letztesTraining_setzen !== 'function') return;
    window.Android.letztesTraining_setzen(timestampMs);
}

// ============================================
// Startup-Sync: WebView → Nativer AlarmManager
// ============================================

/**
 * Vollständiger Abgleich der Benachrichtigungsdaten mit dem nativen AlarmManager.
 *
 * Wird aufgerufen nachdem die Webapp die Statistik vom Backend geladen hat.
 * Überträgt:
 * 1. Den letzten Trainings-Zeitstempel (für Alarm-Unterdrückung)
 * 2. Alle aktiven Benachrichtigungs-Konfigurationen (Alarme neu planen)
 *
 * Dadurch funktionieren Alarme auch wenn:
 * - Der Nutzer auf einem anderen Gerät (Web) trainiert hat
 * - Die App lange nicht geöffnet war
 * - SharedPreferences veraltete Daten enthalten
 */
export function benachrichtigungen_sync() {
    if (!_ist_android || typeof window.Android.benachrichtigungenSynchronisieren !== 'function') return;

    const statistik = _zustand_holen('statistik');
    // PHP-Backend liefert letztes_training als Datumsstring "YYYY-MM-DD".
    // Java erwartet Unix-Timestamp in ms (long). Hier konvertieren.
    const letztesTrainingMs = _datum_zu_timestamp(statistik?.letztes_training);
    const konfigs = konfig_laden();

    // Wenn keine Konfigurationen vorhanden: nichts zu synchronisieren.
    // Die Initialisierung erfolgt über _taeglich_kanaele_laden() im Dashboard
    // (lädt Uhrzeit/Titel/Text aus der DB) oder als Bootstrap via androidTtsReady.
    if (Object.keys(konfigs).length === 0) {
        return;
    }

    // Sync-Paket zusammenstellen
    const syncDaten = {
        letztes_training: letztesTrainingMs,
        benachrichtigungen: [],
    };

    // Alle aktiven Konfigurationen einsammeln
    for (const [id, config] of Object.entries(konfigs)) {
        if (config && config.aktiv !== false) {
            // letztes_training in jede Config injizieren (für Receiver-Unterdrückung)
            syncDaten.benachrichtigungen.push({
                ...config,
                letztes_training: letztesTrainingMs,
            });
        }
    }

    window.Android.benachrichtigungenSynchronisieren(JSON.stringify(syncDaten));
}

// ============================================
// Private Hilfsfunktionen
// ============================================

function _konfigs_vom_android_laden() {
    // Gespeicherte Configs an die Webapp zurückspielen (für Einstellungsseite)
    window.dispatchEvent(new CustomEvent('vtBenachrichtigungenGeladen', {
        detail: konfig_laden()
    }));
}

/**
 * Standard-Alarme einrichten falls noch keine Konfiguration gespeichert ist.
 *
 * Wird aufgerufen wenn:
 * a) Berechtigung gerade erteilt wurde (frischer Install)
 * b) TTS-Ready fired und Berechtigung vorhanden, aber SharedPreferences leer
 *
 * Ohne diese Funktion zeigt `adb shell dumpsys alarm` keine Einträge,
 * weil benachrichtigungen_sync() ein leeres Array an Java sendet
 * und Java dann gar keine Alarme plant.
 */
function _standard_alarme_initialisieren() {
    if (!_ist_android || typeof window.Android.benachrichtigungKonfigurieren !== 'function') return;

    const vorhandene = konfig_laden();
    const hatKonfigs = Object.keys(vorhandene).length > 0;

    if (hatKonfigs) return; // Bereits konfiguriert → nichts tun

    // Erststart: Standard-Alarme anlegen
    // Der Nutzer kann diese in den Einstellungen anpassen oder deaktivieren.
    const statistik = _zustand_holen('statistik');
    // PHP gibt "YYYY-MM-DD" zurück — in ms-Timestamp umrechnen für Java
    const letztesTraining = _datum_zu_timestamp(statistik?.letztes_training);

    window.Android.benachrichtigungKonfigurieren(JSON.stringify({
        id:               'uebungs_erinnerung',
        typ:              'taeglich',
        kanal:            'training',
        aktiv:            true,
        uhrzeit:          '20:00',
        titel:            '📚 Zeit zum Üben!',
        text:             'Du hast heute noch nicht geübt. Stärke deinen Wortschatz!',
        letztes_training: letztesTraining,
    }));

    window.Android.benachrichtigungKonfigurieren(JSON.stringify({
        id:               'streak_warnung',
        typ:              'taeglich',
        kanal:            'streak',
        aktiv:            true,
        uhrzeit:          '09:00',
        titel:            '🔥 Streak in Gefahr!',
        text:             'Du hast gestern nicht geübt. Übe heute, um deinen Streak zu retten!',
        letztes_training: letztesTraining,
    }));

    console.log('[Benachrichtigungen] Standard-Alarme eingerichtet (Erststart)');
}

/**
 * Datums-String oder Zahl in Unix-Timestamp (ms) umwandeln.
 *
 * Das PHP-Backend gibt letztes_training als "YYYY-MM-DD" zurück.
 * Java erwartet in allen Feldern einen long (Unix-ms).
 * Diese Funktion normalisiert beide Formate auf ms-Timestamp.
 *
 * @param {string|number|null|undefined} datum  "2026-03-15", Unix-ms oder null
 * @returns {number} Unix-Timestamp in ms, 0 wenn nicht auflösbar
 */
function _datum_zu_timestamp(datum) {
    if (!datum) return 0;
    if (typeof datum === 'number') return datum;
    if (typeof datum === 'string') {
        // "YYYY-MM-DD" → Beginn des Tages in lokaler Zeit
        const ts = new Date(datum + 'T00:00:00').getTime();
        return isNaN(ts) ? 0 : ts;
    }
    return 0;
}

function _gezeigte_einmalige_laden() {
    try {
        const gespeichert = localStorage.getItem('vt_gezeigte_benachrichtigungen');
        return new Set(gespeichert ? JSON.parse(gespeichert) : []);
    } catch {
        return new Set();
    }
}

function _gezeigte_einmalige_speichern(set) {
    try {
        localStorage.setItem('vt_gezeigte_benachrichtigungen',
            JSON.stringify(Array.from(set)));
    } catch {
        // localStorage nicht verfügbar
    }
}
