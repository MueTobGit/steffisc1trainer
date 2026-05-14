/**
 * CSV-Import — Drag&Drop Upload, Analyse, Duplikat/Synonym-Dialog, Import, Export
 *
 * Flow:
 *  1. CSV laden → Vorschau → Import-Button sofort verfügbar
 *  2. Optional: "Analysieren" für Duplikat/Synonym-Prüfung
 *  3. "Importieren"-Button mit optionalen Entscheidungen
 */
import { apiGet, apiPost, apiPut, apiDelete } from '../api-client.js';
import { holen } from '../zustand.js';
import { esc } from '../hilfs-funktionen.js';
import { lade_anzeige_rendern } from '../komponenten/lade-anzeige.js';
import { erfolg, fehler, apiFehlerAnzeigen } from '../benachrichtigungen.js';
import { t } from '../dienste/sprache.js';

let _csvInhalt = '';
let _dateiName = '';
let _vorschau = null;
let _analyseErgebnis = null;
let _privatWiederherstellen = false;

// Synonym-Suche
let _synSuchbegriffe = [];

// Globaler Duplikat-Modus (für "Alle auf einmal setzen")
let _globalDuplikatModus = 'zusammenfuehren';

// Duplikat-Tabelle: flache Daten + Sort-Zustand
let _dupFlach = [];
let _dupSort  = { feld: 'sv', dir: 'asc' };

export function rendern() {
    const container = document.getElementById('inhalt');
    if (!container) return;

    container.innerHTML = `
        <div class="verwaltung">
            <div class="verwaltung__kopf">
                <h2 class="verwaltung__titel">${t('csv_import.titel')}</h2>
            </div>

            <!-- Export-Bereich -->
            <div class="karte" style="margin-bottom:24px">
                <div class="karte__titel">${t('csv_import.export_titel')}</div>
                <div class="karte__inhalt">
                    <p>${t('csv_import.export_beschreibung')}</p>
                    <label style="display:flex;align-items:center;gap:8px;margin-top:12px;cursor:pointer;user-select:none">
                        <input type="checkbox" id="export-inkl-privat">
                    ${t('csv_import.export_inkl_privat')}
                        <span style="font-size:12px;color:var(--md-sys-color-on-surface-variant)">${t('csv_import.export_inkl_privat_hint')}</span>
                    </label>
                    <button class="btn btn--umrandet" id="btn-export" style="margin-top:12px">
                        <span class="material-symbols-outlined" style="font-size:20px">download</span>
                        ${t('csv_import.export_btn')}
                    </button>
                </div>
            </div>

            <!-- Import-Bereich -->
            <div class="karte">
                <div class="karte__titel">${t('csv_import.import_titel')}</div>
                <div class="karte__inhalt">
                    <!-- Drop-Zone -->
                    <div class="import-zone" id="import-zone">
                        <span class="material-symbols-outlined import-zone__icon">upload_file</span>
                        <p class="import-zone__text">${t('csv_import.dropzone_text')}</p>
                        <p class="import-zone__hinweis">${t('csv_import.dropzone_hint')}</p>
                        <input type="file" id="import-datei" accept=".csv,.txt" style="display:none">
                    </div>

                    <!-- Datei-Info -->
                    <div id="import-datei-info" class="versteckt"></div>

                    <!-- Vorschau -->
                    <div id="import-vorschau" class="versteckt"></div>

                    <!-- Disaster-Recovery Option (nur Admin) -->
                    <div id="import-dr-option" class="versteckt" style="margin-top:16px;padding:12px;background:var(--md-sys-color-secondary-container);border-radius:8px;border-left:3px solid var(--md-sys-color-secondary)">
                        <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;user-select:none">
                            <input type="checkbox" id="import-privat-wiederherstellen" style="margin-top:2px;flex-shrink:0">
                            <span>
                                <strong>${t('csv_import.dr_titel')}</strong><br>
                                <span style="font-size:12px;color:var(--md-sys-color-on-secondary-container)">
                                    ${t('csv_import.dr_beschreibung')}
                                </span>


                            </span>
                        </label>
                    </div>

                    <!-- Aktions-Buttons (nach Datei-Upload) -->
                    <div id="import-aktionen" class="versteckt" style="margin-top:16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center">
                        <button class="btn btn--umrandet" id="btn-analysieren">
                            <span class="material-symbols-outlined" style="font-size:20px">search</span>
                            ${t('csv_import.btn_analysieren')}
                        </button>
                        <button class="btn btn--gefuellt" id="btn-importieren">
                            <span class="material-symbols-outlined" style="font-size:20px">upload</span>
                            ${t('csv_import.btn_importieren')}
                        </button>
                    </div>

                    <!-- Analyse-Ergebnis: Duplikate + Synonyme -->
                    <div id="import-analyse-ergebnis" class="versteckt"></div>

                    <!-- Ergebnis -->
                    <div id="import-ergebnis" class="versteckt"></div>
                </div>
            </div>

            <!-- Duplikate suchen & bereinigen -->
            <div class="karte" style="margin-top:24px" id="duplikate-bereich">
                <div class="karte__titel">
                    <span class="material-symbols-outlined" style="vertical-align:middle;font-size:20px;margin-right:4px">content_copy</span>
                    ${t('csv_import.dup_titel')}
                </div>
                <div class="karte__inhalt">
                    <p style="margin:0 0 14px;color:var(--md-sys-color-on-surface-variant)">
                        ${t('csv_import.dup_beschreibung')}
                    </p>
                    <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;cursor:pointer;user-select:none">
                        <input type="checkbox" id="dup-mit-stamm">
                        <span>${t('csv_import.dup_mit_stamm')}</span>
                        <span style="font-size:12px;color:var(--md-sys-color-on-surface-variant)">${t('csv_import.dup_mit_stamm_hint')}</span>
                    </label>
                    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
                        <button class="btn btn--umrandet" id="btn-duplikate-laden">
                            <span class="material-symbols-outlined" style="font-size:20px">content_copy</span>
                            ${t('csv_import.dup_suchen')}
                        </button>
                        <button class="btn btn--umrandet" id="btn-aehnliche-laden">
                            <span class="material-symbols-outlined" style="font-size:20px">manage_search</span>
                            ${t('csv_import.aehnliche_suchen')}
                        </button>
                    </div>
                    <div id="duplikate-ergebnis" class="versteckt" style="margin-top:16px"></div>
                    <div id="aehnliche-ergebnis" class="versteckt" style="margin-top:16px"></div>
                </div>
            </div>

            <!-- Private Vokabeln bereinigen -->
            <div class="karte" style="margin-top:24px" id="privat-bereinigen-bereich">
                <div class="karte__titel">
                    <span class="material-symbols-outlined" style="vertical-align:middle;font-size:20px;margin-right:4px">cleaning_services</span>
                    ${t('csv_import.privat_bereinigen_titel')}
                </div>
                <div class="karte__inhalt">
                    <p style="margin:0 0 14px;color:var(--md-sys-color-on-surface-variant)">
                        ${t('csv_import.privat_bereinigen_beschreibung')}
                    </p>
                    <button class="btn btn--umrandet" id="btn-privat-bereinigen-laden">
                        <span class="material-symbols-outlined" style="font-size:20px">manage_search</span>
                        ${t('csv_import.privat_bereinigen_suchen')}
                    </button>
                    <div id="privat-bereinigen-ergebnis" class="versteckt" style="margin-top:16px"></div>
                </div>
            </div>

            <!-- Format-Hilfe -->
            <details class="karte" style="margin-top:24px" id="format-hilfe">
                <summary class="karte__titel" style="cursor:pointer;user-select:none">
                    <span class="material-symbols-outlined" style="vertical-align:middle;font-size:18px">help_outline</span>
                    ${t('csv_import.format_doku_titel')}
                </summary>
                <div class="karte__inhalt">
                    ${_format_hilfe_html()}
                </div>
            </details>
        </div>
    `;

    _events_registrieren();
}

function _format_hilfe_html() {
    return `
        <h4 style="margin:0 0 12px">Pflichtfelder und Struktur</h4>
        <p>Die CSV-Datei muss <strong>semikolon-getrennt</strong> und in <strong>UTF-8</strong> kodiert sein.
        Die erste Zeile ist die Kopfzeile. Jede Datenzeile beginnt mit einem <code>typ</code>-Wert:</p>

        <div class="verwaltung-tabelle-wrapper" style="margin:12px 0">
        <table class="verwaltung-tabelle verwaltung-tabelle--kompakt">
            <thead><tr><th>typ</th><th>Bedeutung</th><th>Pflichtfelder</th></tr></thead>
            <tbody>
                <tr><td><strong>V</strong></td><td>Vokabel (Haupteintrag)</td><td>schwedisch, deutsch, wortart</td></tr>
                <tr><td><strong>F</strong></td><td>Form (gehört zur letzten V-Zeile)</td><td>form_bezeichnung, form_wert</td></tr>
                <tr><td><strong>S</strong></td><td>Satz (gehört zur letzten V-Zeile)</td><td>satz_sv, satz_de, benoetigte_form</td></tr>
            </tbody>
        </table>
        </div>

        <h4 style="margin:16px 0 8px">Alle Spalten (Reihenfolge beliebig, Namen exakt)</h4>
        <div class="verwaltung-tabelle-wrapper" style="margin:0 0 16px">
        <table class="verwaltung-tabelle verwaltung-tabelle--kompakt">
            <thead><tr><th>Spaltenname</th><th>Typ</th><th>Beschreibung / erlaubte Werte</th></tr></thead>
            <tbody>
                <tr><td><code>typ</code></td><td>Pflicht</td><td>V, F oder S</td></tr>
                <tr><td><code>schwedisch</code></td><td>Pflicht (V)</td><td>Schwedisches Wort</td></tr>
                <tr><td><code>deutsch</code></td><td>Pflicht (V)</td><td>Deutsche Übersetzung</td></tr>
                <tr><td><code>wortart</code></td><td>Pflicht (V)</td><td>Nomen, Verb, Adjektiv, Adverb, Pronomen, Praeposition, Konjunktion, Interjektion, Phrase</td></tr>
                <tr><td><code>genus</code></td><td>Optional (Nomen)</td><td>en, ett</td></tr>
                <tr><td><code>verbgruppe</code></td><td>Optional (Verb)</td><td>1, 2a, 2b, 3, 4 (schwedische Konjugationsgruppe)</td></tr>
                <tr><td><code>sprachniveau</code></td><td>Optional (V)</td><td>A1, A2, B1, B2, C1, C2 (Standard: A1)</td></tr>
                <tr><td><code>kategorie</code></td><td>Optional (V)</td><td>Kategoriename — wird erstellt falls nicht vorhanden</td></tr>
                <tr><td><code>lektion</code></td><td>Optional (V)</td><td>Lektionsname — wird erstellt falls nicht vorhanden</td></tr>
                <tr><td><code>form_bezeichnung</code></td><td>Pflicht (F)</td><td>z.B. bestimmt_singular, praesens, komparativ</td></tr>
                <tr><td><code>form_wert</code></td><td>Pflicht (F)</td><td>Tatsächliche Form, z.B. "huset", "springer"</td></tr>
                <tr><td><code>satz_sv</code></td><td>Pflicht (S)</td><td>Schwedischer Beispielsatz</td></tr>
                <tr><td><code>satz_de</code></td><td>Pflicht (S)</td><td>Deutsche Übersetzung des Satzes</td></tr>
                <tr><td><code>benoetigte_form</code></td><td>Pflicht (S)</td><td>Welche Form im Satz vorkommt, z.B. "praesens"</td></tr>
                <tr><td><code>ist_privat</code></td><td>Optional (V)</td><td>0 oder 1 — nur im Export mit privaten Vokabeln vorhanden; bei Disaster-Recovery ausgewertet</td></tr>
                <tr><td><code>besitzer_id</code></td><td>Optional (V)</td><td>Numerische ID des Eigentümers — nur im Export mit privaten Vokabeln vorhanden; bei Disaster-Recovery ausgewertet. Alternativ wird <code>besitzer</code> (Benutzername) unterstützt für ältere Exports.</td></tr>
            </tbody>
        </table>
        </div>

        <h4 style="margin:0 0 8px">Gültige form_bezeichnung je Wortart</h4>
        <div class="verwaltung-tabelle-wrapper" style="margin:0 0 16px">
        <table class="verwaltung-tabelle verwaltung-tabelle--kompakt">
            <thead><tr><th>Wortart</th><th>Gültige Bezeichnungen</th></tr></thead>
            <tbody>
                <tr><td>Nomen</td><td>unbestimmt_singular, bestimmt_singular, unbestimmt_plural, bestimmt_plural</td></tr>
                <tr><td>Verb</td><td>infinitiv, praesens, praeteritum, supinum, imperativ, perfekt_partizip</td></tr>
                <tr><td>Adjektiv</td><td>grundform, komparativ, superlativ, bestimmte_form, neutrum_form</td></tr>
            </tbody>
        </table>
        </div>

        <h4 style="margin:0 0 8px">Vollständiges Beispiel</h4>
        <p style="font-size:13px;color:var(--md-sys-color-on-surface-variant);margin:0 0 8px">
            14 Spalten, semikolon-getrennt. F- und S-Zeilen füllen nur ihre relevanten Spalten,
            der Rest bleibt leer (Semikolons trotzdem erforderlich).
        </p>
        <pre style="background:var(--md-sys-color-surface-container);padding:12px;border-radius:8px;overflow-x:auto;font-size:12px;line-height:1.6;white-space:pre">typ;schwedisch;deutsch;wortart;genus;verbgruppe;sprachniveau;kategorie;lektion;form_bezeichnung;form_wert;satz_sv;satz_de;benoetigte_form
V;hus;Haus;Nomen;ett;;A1;Rivstart A1;Kapitel 1;;;;;
F;hus;;;;;;;;unbestimmt_singular;hus;;;
F;hus;;;;;;;;bestimmt_singular;huset;;;
F;hus;;;;;;;;unbestimmt_plural;hus;;;
F;hus;;;;;;;;bestimmt_plural;husen;;;
S;hus;;;;;;;;;;Det är ett stort hus.;Das ist ein großes Haus.;unbestimmt_singular
V;springa;laufen;Verb;;4;A2;Rivstart A1;Kapitel 1;;;;;
F;springa;;;;;;;;infinitiv;springa;;;
F;springa;;;;;;;;praesens;springer;;;
F;springa;;;;;;;;praeteritum;sprang;;;
F;springa;;;;;;;;supinum;sprungit;;;
F;springa;;;;;;;;imperativ;spring;;;
S;springa;;;;;;;;;;Vad ___ du?;Was trinkst du?;praesens
V;glad;froh;Adjektiv;;;A1;Rivstart A1;Kapitel 1;;;;;
F;glad;;;;;;;;grundform;glad;;;
F;glad;;;;;;;;neutrum_form;glatt;;;
F;glad;;;;;;;;bestimmte_form;glade;;;
F;glad;;;;;;;;komparativ;gladare;;;
F;glad;;;;;;;;superlativ;gladast;;;
V;nu;jetzt;Adverb;;;A1;Rivstart A1;Kapitel 1;;;;;
V;och;und;Konjunktion;;;A1;Rivstart A1;Kapitel 1;;;;;
V;jag;ich;Pronomen;;;A1;Rivstart A1;Kapitel 1;;;;;
V;Hej!;Hallo!;Interjektion;;;A1;Rivstart A1;Kapitel 1;;;;;
V;Hur mår du?;Wie geht es dir?;Phrase;;;A1;Rivstart A1;Kapitel 1;;;;;</pre>

        <div style="margin-top:12px;padding:12px;background:var(--md-sys-color-primary-container);border-radius:8px;font-size:13px">
            <strong>Hinweise:</strong>
            <ul style="margin:8px 0 0;padding-left:20px">
                <li>Leere Felder können mit leeren Werten ausgefüllt werden (Semikolons müssen trotzdem vorhanden sein)</li>
                <li>F- und S-Zeilen <strong>müssen direkt nach ihrer V-Zeile</strong> stehen</li>
                <li>Duplikate (gleiche Kombination aus schwedisch + wortart) werden standardmäßig zusammengeführt</li>
                <li>Kategorien und Lektionen werden automatisch erstellt, wenn sie noch nicht existieren</li>
                <li>Der Export erzeugt eine fertige Vorlage — ideal als Ausgangspunkt</li>
            </ul>
        </div>

        <div style="margin-top:12px;padding:12px;background:var(--md-sys-color-secondary-container);border-radius:8px;font-size:13px">
            <strong>Disaster-Recovery (private Vokabeln wiederherstellen):</strong>
            <ol style="margin:8px 0 0;padding-left:20px">
                <li>Im Export-Bereich „Private Vokabeln aller Benutzer einschließen" aktivieren und exportieren</li>
                <li>Die exportierte CSV-Datei enthält <code>ist_privat</code>- und <code>besitzer</code>-Spalten</li>
                <li>Bei einem Wiederherstellungs-Import: Datei hochladen und „Disaster-Recovery" aktivieren</li>
                <li>Private Vokabeln werden dem jeweiligen Benutzer wieder zugeordnet (Benutzername muss existieren)</li>
                <li>Öffentliche Vokabeln im selben CSV werden normal (öffentlich) importiert</li>
            </ol>
        </div>
    `;
}

function _events_registrieren() {
    const zone = document.getElementById('import-zone');
    const dateiInput = document.getElementById('import-datei');
    const benutzer = holen('benutzer');
    const istAdmin = benutzer?.rolle === 'admin';

    zone?.addEventListener('click', () => dateiInput?.click());

    zone?.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('import-zone--aktiv');
    });

    zone?.addEventListener('dragleave', () => {
        zone.classList.remove('import-zone--aktiv');
    });

    zone?.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('import-zone--aktiv');
        if (e.dataTransfer.files.length > 0) {
            _datei_verarbeiten(e.dataTransfer.files[0]);
        }
    });

    dateiInput?.addEventListener('change', () => {
        if (dateiInput.files.length > 0) {
            _datei_verarbeiten(dateiInput.files[0]);
        }
    });

    // Disaster-Recovery Option nur für Admin sichtbar
    if (istAdmin) {
        document.getElementById('import-dr-option')?.classList.remove('versteckt');
    }

    // DR-Checkbox: Zustand aktualisieren
    document.getElementById('import-privat-wiederherstellen')?.addEventListener('change', (e) => {
        _privatWiederherstellen = e.target.checked;
    });

    document.getElementById('btn-export')?.addEventListener('click', _exportieren);
    document.getElementById('btn-analysieren')?.addEventListener('click', _analysieren);
    document.getElementById('btn-importieren')?.addEventListener('click', _importieren);
    document.getElementById('btn-duplikate-laden')?.addEventListener('click', _duplikate_laden);
    document.getElementById('btn-aehnliche-laden')?.addEventListener('click', _aehnliche_laden);
    document.getElementById('btn-privat-bereinigen-laden')?.addEventListener('click', _privat_bereinigen_laden);
}

function _datei_verarbeiten(datei) {
    // Größenprüfung (5 MB)
    if (datei.size > 5 * 1024 * 1024) {
        fehler(t('csv_import.datei_zu_gross'));
        return;
    }

    _dateiName = datei.name;
    _analyseErgebnis = null;

    const reader = new FileReader();
    reader.onload = (e) => {
        _csvInhalt = e.target.result;
        _vorschau_erstellen();
    };
    reader.onerror = () => {
        fehler(t('csv_import.datei_lesefehler'));
    };
    reader.readAsText(datei, 'UTF-8');
}

function _vorschau_erstellen() {
    let inhalt = _csvInhalt.replace(/^\uFEFF/, '');
    const zeilen = inhalt.split(/\r\n|\n|\r/).filter(z => z.trim());

    if (zeilen.length < 2) {
        fehler(t('csv_import.csv_zu_kurz'));
        return;
    }

    const kopfzeile = zeilen[0].split(';').map(s => s.trim());
    const kopfzeileLower = kopfzeile.map(k => k.toLowerCase());

    // Pflichtprüfung: 'typ'-Spalte muss vorhanden sein
    if (!kopfzeileLower.includes('typ')) {
        fehler(t('csv_import.typ_spalte_fehlt'));
        return;
    }

    const typIndex = kopfzeileLower.indexOf('typ');
    const datenZeilen = zeilen.slice(1);

    let vAnzahl = 0, fAnzahl = 0, sAnzahl = 0, unbekannt = 0;
    const unbekannteTypen = new Set();
    for (const z of datenZeilen) {
        const typ = z.split(';')[typIndex]?.trim().toUpperCase();
        if (typ === 'V') vAnzahl++;
        else if (typ === 'F') fAnzahl++;
        else if (typ === 'S') sAnzahl++;
        else {
            unbekannt++;
            unbekannteTypen.add(typ || '(leer)');
        }
    }

    const infoDiv = document.getElementById('import-datei-info');
    if (infoDiv) {
        infoDiv.classList.remove('versteckt');
        infoDiv.innerHTML = `
            <div class="import-info">
                <span class="material-symbols-outlined">description</span>
                <strong>${esc(_dateiName)}</strong>
                <span>${t('csv_import.zeilen', {n: datenZeilen.length})}</span>
                <button class="btn-icon" id="btn-datei-entfernen" title="${t('csv_import.entfernen')}">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
        `;
        document.getElementById('btn-datei-entfernen')?.addEventListener('click', () => {
            _zustand_zuruecksetzen();
        });
    }

    if (vAnzahl === 0) {
        fehler(t('csv_import.keine_v_zeilen'));
    }

    const vorschauDiv = document.getElementById('import-vorschau');
    if (vorschauDiv) {
        vorschauDiv.classList.remove('versteckt');

        let html = `
            <h4 style="margin:16px 0 8px">${t('csv_import.vorschau')}</h4>
            <div class="import-zusammenfassung">
                <span><strong>${vAnzahl}</strong> ${t('csv_import.vokabeln_v', {n: vAnzahl})}</span>
                <span><strong>${fAnzahl}</strong> ${t('csv_import.formen_f', {n: fAnzahl})}</span>
                <span><strong>${sAnzahl}</strong> ${t('csv_import.saetze_s', {n: sAnzahl})}</span>
                ${unbekannt > 0 ? `<span class="import-warnung" title="Unbekannte Typen: ${esc([...unbekannteTypen].join(', '))}"><strong>${unbekannt}</strong> ${t('csv_import.unbekannt')}</span>` : ''}
            </div>
        `;

        if (unbekannt > 0) {
            html += `<p style="color:var(--md-sys-color-error);font-size:13px;margin:4px 0 8px">
                ${t('csv_import.unbekannte_typen', {typen: esc([...unbekannteTypen].join(', '))})}</strong> — diese Zeilen werden beim Import ignoriert.
                Nur V, F und S sind gültig.
            </p>`;
        }

        html += `
            <div class="verwaltung-tabelle-wrapper" style="max-height:300px; overflow-y:auto">
                <table class="verwaltung-tabelle verwaltung-tabelle--kompakt">
                    <thead><tr>
                        ${kopfzeile.slice(0, 7).map(k => `<th>${esc(k)}</th>`).join('')}
                    </tr></thead>
                    <tbody>
        `;

        const maxZeilen = Math.min(20, datenZeilen.length);
        for (let i = 0; i < maxZeilen; i++) {
            const felder = datenZeilen[i].split(';');
            html += '<tr>';
            for (let j = 0; j < Math.min(7, kopfzeile.length); j++) {
                const wert = felder[j]?.trim() || '';
                html += `<td>${esc(wert.length > 30 ? wert.substring(0, 30) + '…' : wert)}</td>`;
            }
            html += '</tr>';
        }

        if (datenZeilen.length > 20) {
            html += `<tr><td colspan="${Math.min(7, kopfzeile.length)}" style="text-align:center;font-style:italic">
                ${t('csv_import.weitere_zeilen', {n: datenZeilen.length - 20})}</td></tr>`;
        }

        html += '</tbody></table></div>';
        vorschauDiv.innerHTML = html;
    }

    // Aktionen anzeigen, Analyse-Ergebnis und Ergebnis zurücksetzen
    document.getElementById('import-aktionen')?.classList.remove('versteckt');
    document.getElementById('import-analyse-ergebnis')?.classList.add('versteckt');
    document.getElementById('import-ergebnis')?.classList.add('versteckt');

    // Import-Button nur aktivieren wenn V-Zeilen vorhanden
    const btnImportieren = document.getElementById('btn-importieren');
    if (btnImportieren) {
        btnImportieren.disabled = vAnzahl === 0;
    }

    _vorschau = { vAnzahl, fAnzahl, sAnzahl };
}

function _zustand_zuruecksetzen() {
    _csvInhalt = '';
    _dateiName = '';
    _vorschau = null;
    _analyseErgebnis = null;
    _privatWiederherstellen = false;
    const drCheck = document.getElementById('import-privat-wiederherstellen');
    if (drCheck) drCheck.checked = false;
    document.getElementById('import-datei-info')?.classList.add('versteckt');
    document.getElementById('import-vorschau')?.classList.add('versteckt');
    document.getElementById('import-aktionen')?.classList.add('versteckt');
    document.getElementById('import-analyse-ergebnis')?.classList.add('versteckt');
    document.getElementById('import-ergebnis')?.classList.add('versteckt');
}

async function _analysieren() {
    if (!_csvInhalt) {
        fehler(t('csv_import.keine_csv'));
        return;
    }

    const analyseDiv = document.getElementById('import-analyse-ergebnis');
    const btn = document.getElementById('btn-analysieren');

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:20px">hourglass_empty</span> ${t('csv_import.analysiere')}`;
    }

    if (analyseDiv) {
        analyseDiv.classList.remove('versteckt');
        lade_anzeige_rendern(analyseDiv);
    }

    const erg = await apiPost('vokabeln/importieren_pruefen.php', {
        csv_inhalt: _csvInhalt,
    });

    if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:20px">search</span> ${t('csv_import.analyse_erneut')}`;
    }

    if (!erg.erfolg) {
        if (analyseDiv) {
            analyseDiv.innerHTML = `
                <div style="padding:12px;background:var(--md-sys-color-error-container);border-radius:8px;color:var(--md-sys-color-on-error-container);margin-top:12px">
                    <strong>${t('csv_import.analyse_fehlgeschlagen')}</strong> ${esc(erg.fehler?.nachricht || t('csv_import.unbekannter_fehler'))}
                </div>
            `;
        }
        apiFehlerAnzeigen(erg);
        return;
    }

    _analyseErgebnis = erg.daten;
    _analyse_anzeigen(_analyseErgebnis, analyseDiv);
}

function _analyse_anzeigen(analyse, container) {
    if (!container) return;

    const { duplikate = [], synonyme = [], neu = 0 } = analyse;
    const hatProbleme = duplikate.length > 0 || synonyme.length > 0;

    let html = `<div style="margin-top:20px">`;

    html += `<div class="import-zusammenfassung" style="margin-bottom:16px">
        <span><strong>${neu}</strong> ${t('csv_import.neue_vokabeln')}</span>
        <span class="${duplikate.length > 0 ? 'import-warnung' : ''}"><strong>${duplikate.length}</strong> ${t('csv_import.duplikate_n')}</span>
        <span class="${synonyme.length > 0 ? 'import-warnung' : ''}"><strong>${synonyme.length}</strong> ${t('csv_import.pot_synonyme')}</span>
    </div>`;

    // --- Duplikate ---
    if (duplikate.length > 0) {
        const hatScheinDuplikate = duplikate.some(d => d.schein_duplikat);
        html += `
            <h4 style="margin:0 0 8px">
                <span class="material-symbols-outlined" style="vertical-align:middle;font-size:18px;color:var(--md-sys-color-error)">warning</span>
                ${t('csv_import.dup_entscheidung')}
            </h4>
            <p style="font-size:0.85rem;color:var(--md-sys-color-on-surface-variant);margin-bottom:8px">
                ${t('csv_import.dup_erklaerung')}
            </p>
            ${hatScheinDuplikate ? `
            <p style="font-size:0.85rem;color:var(--md-sys-color-tertiary);margin-bottom:8px;display:flex;align-items:center;gap:6px">
                <span class="material-symbols-outlined" style="font-size:16px">info</span>
                ${t('csv_import.schein_duplikat_hinweis')}
            </p>` : ''}
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding:8px 12px;background:var(--md-sys-color-surface-container);border-radius:8px;flex-wrap:wrap">
                <span style="font-size:13px;font-weight:500;white-space:nowrap">${t('csv_import.alle_auf')}</span>
                <select class="eingabe eingabe--klein" id="global-duplikat-modus" style="min-width:160px">
                    <option value="zusammenfuehren">${t('csv_import.opt_zusammenfuehren')}</option>
                    <option value="behalten">${t('csv_import.opt_behalten')}</option>
                    <option value="ueberschreiben">${t('csv_import.opt_ueberschreiben')}</option>
                </select>
                <span style="font-size:12px;color:var(--md-sys-color-on-surface-variant)">${t('csv_import.alle_auf_hint')}</span>
            </div>
            <div class="verwaltung-tabelle-wrapper" style="max-height:320px;overflow-y:auto;margin-bottom:16px">
            <table class="verwaltung-tabelle verwaltung-tabelle--kompakt">
                <thead><tr>
                    <th>${t('csv_import.th_csv_sv')}</th>
                    <th>${t('csv_import.th_csv_de')}</th>
                    <th>${t('csv_import.th_wortart')}</th>
                    <th>${t('csv_import.th_db_de')}</th>
                    <th>${t('csv_import.th_aktion')}</th>
                </tr></thead>
                <tbody>
        `;

        for (const d of duplikate) {
            const rawKey = `${d.csv_schwedisch}|${d.csv_wortart}`;
            const defaultModus = d.schein_duplikat ? 'behalten' : _globalDuplikatModus;
            const scheinBadge = d.schein_duplikat
                ? `<span title="${t('csv_import.schein_duplikat_info')}"
                          style="display:inline-block;font-size:11px;padding:1px 6px;border-radius:10px;
                                 background:var(--md-sys-color-tertiary-container);
                                 color:var(--md-sys-color-on-tertiary-container);
                                 margin-left:4px;vertical-align:middle;cursor:help">
                      ${t('csv_import.schein_duplikat_badge')}
                   </span>`
                : '';
            html += `
                <tr${d.schein_duplikat ? ' style="background:var(--md-sys-color-tertiary-container,rgba(0,120,80,0.08))"' : ''}>
                    <td><strong>${esc(d.csv_schwedisch)}</strong>${scheinBadge}</td>
                    <td>${esc(d.csv_deutsch)}</td>
                    <td><span class="tag">${esc(d.csv_wortart)}</span></td>
                    <td style="color:var(--md-sys-color-on-surface-variant)">${esc(d.db_deutsch)}</td>
                    <td>
                        <select class="eingabe eingabe--klein duplikat-entscheidung"
                                data-key="${esc(rawKey)}"
                                data-schein="${d.schein_duplikat ? '1' : '0'}"
                                style="min-width:160px">
                            <option value="zusammenfuehren" ${defaultModus === 'zusammenfuehren' ? 'selected' : ''}>${t('csv_import.opt_zusammenfuehren')}</option>
                            <option value="behalten" ${defaultModus === 'behalten' ? 'selected' : ''}>${t('csv_import.opt_behalten')}</option>
                            <option value="ueberschreiben" ${defaultModus === 'ueberschreiben' ? 'selected' : ''}>${t('csv_import.opt_ueberschreiben')}</option>
                        </select>
                    </td>
                </tr>
            `;
        }

        html += `</tbody></table></div>`;
    }

    // --- Synonyme ---
    if (synonyme.length > 0) {
        html += `
            <h4 style="margin:0 0 8px">
                <span class="material-symbols-outlined" style="vertical-align:middle;font-size:18px;color:var(--md-sys-color-primary)">link</span>
                ${t('csv_import.pot_synonyme_titel')}
            </h4>
            <p style="font-size:0.85rem;color:var(--md-sys-color-on-surface-variant);margin-bottom:8px">
                ${t('csv_import.pot_synonyme_erklaerung')}
            </p>
            <div class="verwaltung-tabelle-wrapper" style="max-height:320px;overflow-y:auto;margin-bottom:16px">
            <table class="verwaltung-tabelle verwaltung-tabelle--kompakt">
                <thead><tr>
                    <th>${t('csv_import.th_neu_csv')}</th>
                    <th>${t('csv_import.th_bestehend_db')}</th>
                    <th>${t('csv_import.th_wortart')}</th>
                    <th>${t('csv_import.th_deutsch')}</th>
                    <th>${t('csv_import.th_als_synonym')}</th>
                </tr></thead>
                <tbody>
        `;

        for (const s of synonyme) {
            const key = esc(`${s.csv_schwedisch}|${s.csv_wortart}|${s.db_id}`);
            html += `
                <tr>
                    <td><strong>${esc(s.csv_schwedisch)}</strong></td>
                    <td>${esc(s.db_schwedisch)}</td>
                    <td><span class="tag">${esc(s.csv_wortart)}</span></td>
                    <td>${esc(s.csv_deutsch)}</td>
                    <td>
                        <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                            <input type="checkbox" class="synonym-checkbox" data-key="${key}"
                                   data-csv-schwedisch="${esc(s.csv_schwedisch)}"
                                   data-csv-wortart="${esc(s.csv_wortart)}"
                                   data-db-id="${s.db_id}">
                            ${t('csv_import.ja_verknuepfen')}
                        </label>
                    </td>
                </tr>
            `;
        }

        html += `</tbody></table></div>`;
    }

    if (!hatProbleme) {
        html += `
            <div style="display:flex;align-items:center;gap:8px;color:var(--md-sys-color-tertiary);margin-bottom:8px">
                <span class="material-symbols-outlined">check_circle</span>
                <span>${t('csv_import.keine_probleme')}</span>
            </div>
        `;
    }

    html += `</div>`;
    container.innerHTML = html;

    // Global-Selektor: alle Duplikat-Dropdowns gleichzeitig setzen
    const globalSel = document.getElementById('global-duplikat-modus');
    if (globalSel) {
        globalSel.value = _globalDuplikatModus;
        globalSel.addEventListener('change', () => {
            _globalDuplikatModus = globalSel.value;
            document.querySelectorAll('.duplikat-entscheidung').forEach(sel => {
                // Schein-Duplikate nur auf 'behalten' oder 'ueberschreiben' setzen,
                // nie automatisch auf 'zusammenfuehren' (riskant bei anderer Bedeutung)
                if (sel.dataset.schein === '1' && _globalDuplikatModus === 'zusammenfuehren') {
                    sel.value = 'behalten';
                } else {
                    sel.value = _globalDuplikatModus;
                }
            });
        });
    }
}

async function _importieren() {
    if (!_csvInhalt) {
        fehler('Keine CSV-Datei geladen.');
        return;
    }

    // Duplikat-Entscheidungen einsammeln
    const duplikatEntscheidungen = {};
    document.querySelectorAll('.duplikat-entscheidung').forEach(sel => {
        duplikatEntscheidungen[sel.dataset.key] = sel.value;
    });

    // Synonym-Entscheidungen einsammeln
    const synonymeErstellen = [];
    document.querySelectorAll('.synonym-checkbox:checked').forEach(cb => {
        synonymeErstellen.push({
            csv_schwedisch: cb.dataset.csvSchwedisch,
            csv_wortart:    cb.dataset.csvWortart,
            db_id:          parseInt(cb.dataset.dbId, 10),
        });
    });

    const btn = document.getElementById('btn-importieren');
    const btnAnalysieren = document.getElementById('btn-analysieren');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:20px">hourglass_empty</span> Importiere…';
    }
    if (btnAnalysieren) btnAnalysieren.disabled = true;

    const ergebnis = await apiPost('vokabeln/importieren.php', {
        csv_inhalt:               _csvInhalt,
        duplikat_modus:           _globalDuplikatModus,
        duplikat_entscheidungen:  duplikatEntscheidungen,
        synonyme_erstellen:       synonymeErstellen,
        privat_wiederherstellen:  _privatWiederherstellen,
    });

    if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:20px">upload</span> ${t('csv_import.nochmals_importieren')}`;
    }
    if (btnAnalysieren) btnAnalysieren.disabled = false;

    const ergebnisDiv = document.getElementById('import-ergebnis');
    if (!ergebnisDiv) return;

    ergebnisDiv.classList.remove('versteckt');

    if (ergebnis.erfolg) {
        const d = ergebnis.daten;
        const hatFehler = d.fehler && d.fehler.length > 0;

        ergebnisDiv.innerHTML = `
            <div class="import-ergebnis import-ergebnis--erfolg">
                <span class="material-symbols-outlined" style="font-size:32px;color:var(--md-sys-color-tertiary)">check_circle</span>
                <h4>${t('csv_import.import_abgeschlossen')}</h4>
                <div class="import-ergebnis__details">
                    <span><strong>${d.erstellt}</strong> ${t('csv_import.erstellt')}</span>
                    <span><strong>${d.aktualisiert}</strong> ${t('csv_import.aktualisiert')}</span>
                    <span><strong>${d.uebersprungen}</strong> ${t('csv_import.uebersprungen')}</span>
                    <span><strong>${d.formen_erstellt}</strong> ${t('csv_import.formen_label')}</span>
                    <span><strong>${d.saetze_erstellt}</strong> ${t('csv_import.saetze_label')}</span>
                    ${d.synonyme_erstellt > 0 ? `<span><strong>${d.synonyme_erstellt}</strong> ${t('csv_import.synonyme_label')}</span>` : ''}
                </div>
                ${hatFehler ? `
                    <details style="margin-top:12px;width:100%">
                        <summary style="cursor:pointer;color:var(--md-sys-color-error)">${t('csv_import.warnungen', {n: d.fehler.length})}</summary>
                        <ul style="margin-top:8px;font-size:13px">${d.fehler.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
                    </details>
                ` : ''}
            </div>
        `;
        erfolg(ergebnis.nachricht || t('csv_import.import_erfolgreich'));
    } else {
        const nachricht = ergebnis.fehler?.nachricht || 'Unbekannter Fehler';
        ergebnisDiv.innerHTML = `
            <div class="import-ergebnis import-ergebnis--fehler">
                <span class="material-symbols-outlined" style="font-size:32px;color:var(--md-sys-color-error)">error</span>
                <h4>${t('csv_import.import_fehlgeschlagen')}</h4>
                <p>${esc(nachricht)}</p>
                <p style="font-size:13px;color:var(--md-sys-color-on-surface-variant);margin-top:8px">
                    ${t('csv_import.import_fehler_hint')}
                </p>
            </div>
        `;
        apiFehlerAnzeigen(ergebnis);
    }
}

async function _exportieren() {
    const token = holen('token');
    if (!token) {
        fehler(t('csv_import.nicht_eingeloggt'));
        return;
    }

    const inclPrivat = document.getElementById('export-inkl-privat')?.checked ? '?auch_private=1' : '';
    const url = `/vokabeltrainer/api/vokabeln/exportieren.php${inclPrivat}`;
    const dateiname = `vokabeln_export_${new Date().toISOString().slice(0,10)}${inclPrivat ? '_inkl_privat' : ''}.csv`;
    const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
    if (!res.ok) { fehler(t('csv_import.export_fehlgeschlagen')); return; }
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = dateiname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objUrl);
}

export function aufraeumen() {
    _csvInhalt = '';
    _dateiName = '';
    _vorschau = null;
    _analyseErgebnis = null;
    _privatWiederherstellen = false;
    _synSuchbegriffe = [];
    _globalDuplikatModus = 'zusammenfuehren';
}

// ---- Private Vokabeln bereinigen ----

async function _privat_bereinigen_laden() {
    const btn       = document.getElementById('btn-privat-bereinigen-laden');
    const container = document.getElementById('privat-bereinigen-ergebnis');
    if (!btn || !container) return;

    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:20px">hourglass_empty</span> ${t('csv_import.suche_laeuft')}`;
    container.classList.remove('versteckt');
    lade_anzeige_rendern(container);

    const erg = await apiGet('vokabeln/private_bereinigen.php');

    btn.disabled = false;
    btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:20px">manage_search</span> ${t('csv_import.privat_bereinigen_suchen')}`;

    if (!erg.erfolg) {
        container.innerHTML = `
            <div style="padding:12px;background:var(--md-sys-color-error-container);
                        border-radius:8px;color:var(--md-sys-color-on-error-container)">
                <strong>${t('csv_import.fehler_label')}:</strong>
                ${esc(erg.fehler?.nachricht || t('csv_import.unbekannter_fehler'))}
            </div>`;
        return;
    }

    _privat_bereinigen_rendern(erg.daten, container);
}

function _privat_bereinigen_rendern(daten, container) {
    const { gruppen = [], gesamt = 0 } = daten;

    if (gesamt === 0) {
        container.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;
                        color:var(--md-sys-color-on-surface-variant);padding:8px 0">
                <span class="material-symbols-outlined">check_circle</span>
                <span>${t('csv_import.privat_bereinigen_keine')}</span>
            </div>`;
        return;
    }

    let html = `
        <div style="font-size:13px;color:var(--md-sys-color-on-surface-variant);margin-bottom:12px">
            <strong>${gesamt}</strong> ${t('csv_import.privat_bereinigen_gefunden')}
        </div>
    `;

    for (const gruppe of gruppen) {
        const alleIds = gruppe.vokabeln.map(v => v.id);
        html += `
            <div style="margin-bottom:20px">
                <div style="display:flex;align-items:center;justify-content:space-between;
                            flex-wrap:wrap;gap:8px;margin-bottom:8px">
                    <strong style="font-size:14px">
                        <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle">person</span>
                        ${esc(gruppe.benutzername)}
                        <span style="font-weight:normal;font-size:12px;color:var(--md-sys-color-on-surface-variant)">
                            (${gruppe.vokabeln.length} ${t('csv_import.privat_bereinigen_eintraege')})
                        </span>
                    </strong>
                    <button class="btn btn--klein btn--gefaehrlich privat-alle-loeschen-btn"
                            data-ids="${esc(JSON.stringify(alleIds))}">
                        <span class="material-symbols-outlined" style="font-size:14px">delete_sweep</span>
                        ${t('csv_import.privat_bereinigen_alle_loeschen')}
                    </button>
                </div>
                <div class="verwaltung-tabelle-wrapper" style="max-height:280px;overflow-y:auto">
                <table class="verwaltung-tabelle verwaltung-tabelle--kompakt">
                    <thead><tr>
                        <th>${t('csv_import.th_csv_sv')}</th>
                        <th>${t('csv_import.privat_bereinigen_priv_de')}</th>
                        <th>${t('csv_import.privat_bereinigen_pub_de')}</th>
                        <th>${t('csv_import.th_wortart')}</th>
                        <th>${t('csv_import.th_aktion')}</th>
                    </tr></thead>
                    <tbody>
        `;

        for (const v of gruppe.vokabeln) {
            const gleicheBedeutung = v.priv_deutsch.toLowerCase() === v.pub_deutsch.toLowerCase();
            html += `
                <tr data-priv-id="${v.id}">
                    <td><strong>${esc(v.schwedisch)}</strong></td>
                    <td>${esc(v.priv_deutsch)}
                        ${!gleicheBedeutung
                            ? `<span style="font-size:10px;padding:1px 5px;border-radius:8px;margin-left:4px;
                                           background:var(--md-sys-color-tertiary-container);
                                           color:var(--md-sys-color-on-tertiary-container)"
                                     title="${t('csv_import.schein_duplikat_info')}">≠</span>`
                            : ''}</td>
                    <td style="color:var(--md-sys-color-on-surface-variant)">${esc(v.pub_deutsch)}</td>
                    <td><span class="tag">${esc(v.wortart)}</span></td>
                    <td>
                        <button class="btn-icon btn-icon--gefaehrlich privat-loeschen-btn"
                                data-id="${v.id}" data-wort="${esc(v.schwedisch)}"
                                title="${t('csv_import.privat_bereinigen_loeschen')}">
                            <span class="material-symbols-outlined" style="font-size:18px">delete</span>
                        </button>
                    </td>
                </tr>
            `;
        }

        html += `</tbody></table></div></div>`;
    }

    container.innerHTML = html;

    // Einzeln löschen
    container.querySelectorAll('.privat-loeschen-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id   = parseInt(btn.dataset.id, 10);
            const wort = btn.dataset.wort;
            if (!confirm(t('csv_import.privat_bereinigen_loeschen_confirm', { wort }))) return;
            await _privat_ids_loeschen([id], container);
        });
    });

    // Alle löschen (pro Gruppe)
    container.querySelectorAll('.privat-alle-loeschen-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ids = JSON.parse(btn.dataset.ids);
            if (!confirm(t('csv_import.privat_bereinigen_alle_confirm', { n: ids.length }))) return;
            await _privat_ids_loeschen(ids, container);
        });
    });
}

async function _privat_ids_loeschen(ids, container) {
    const erg = await apiDelete('vokabeln/private_bereinigen.php', { ids });
    if (erg.erfolg) {
        erfolg(t('csv_import.privat_bereinigen_geloescht', { n: erg.daten.geloescht }));
        // Gelöschte Zeilen aus der Tabelle entfernen
        ids.forEach(id => {
            container.querySelector(`[data-priv-id="${id}"]`)?.remove();
        });
        // Leere Tabellen/Gruppen ausblenden
        container.querySelectorAll('table').forEach(tbl => {
            if (tbl.querySelector('tbody')?.children.length === 0) {
                tbl.closest('.verwaltung-tabelle-wrapper')?.parentElement?.remove();
            }
        });
        // Falls alles leer
        if (!container.querySelector('[data-priv-id]')) {
            container.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px;
                            color:var(--md-sys-color-on-surface-variant);padding:8px 0">
                    <span class="material-symbols-outlined">check_circle</span>
                    <span>${t('csv_import.privat_bereinigen_keine')}</span>
                </div>`;
        }
    } else {
        fehler(erg.fehler?.nachricht || t('csv_import.unbekannter_fehler'));
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Duplikate suchen & bereinigen
// ─────────────────────────────────────────────────────────────────────────────

async function _duplikate_laden() {
    const btn       = document.getElementById('btn-duplikate-laden');
    const container = document.getElementById('duplikate-ergebnis');
    if (!btn || !container) return;

    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:20px">hourglass_empty</span> ${t('csv_import.suche_laeuft')}`;
    container.classList.remove('versteckt');
    lade_anzeige_rendern(container);

    const mitStamm = document.getElementById('dup-mit-stamm')?.checked ? '1' : '0';
    const erg = await apiGet('vokabeln/duplikate.php', { mit_stamm: mitStamm });

    btn.disabled = false;
    btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:20px">content_copy</span> ${t('csv_import.duplikate_suchen')}`;

    if (!erg.erfolg) {
        container.innerHTML = `
            <div style="padding:12px;background:var(--md-sys-color-error-container);
                        border-radius:8px;color:var(--md-sys-color-on-error-container)">
                <strong>${t('csv_import.fehler_label')}:</strong> ${esc(erg.fehler?.nachricht || t('csv_import.unbekannter_fehler'))}
            </div>`;
        return;
    }

    _duplikate_rendern(erg.daten.gruppen, container, mitStamm === '1');
}

function _duplikate_rendern(gruppen, container, mitStamm = false) {
    if (gruppen.length === 0) {
        container.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;
                        color:var(--md-sys-color-on-surface-variant);padding:8px 0">
                <span class="material-symbols-outlined">check_circle</span>
                <span>${t('csv_import.keine_duplikate')}</span>
            </div>`;
        return;
    }

    // Flach auflösen: jede Vokabel = eine Zeile, mit Verweis auf die anderen der Gruppe
    _dupFlach = [];
    for (const gruppe of gruppen) {
        for (const v of gruppe.vokabeln) {
            _dupFlach.push({
                ...v,
                _andere:     gruppe.vokabeln.filter(o => o.id !== v.id),
                _stamm:      gruppe.stamm || null,
                _mit_stamm:  mitStamm,
            });
        }
    }
    _duplikate_tabelle_rendern(container);
}

// Sortierbare Tabellen-Darstellung (wird bei Sort-Wechsel und nach Aktionen neu aufgerufen)
function _duplikate_tabelle_rendern(container) {
    const sortKey = _dupSort.feld === 'sv' ? 'englisch' : 'deutsch';
    const sorted  = [..._dupFlach].sort((a, b) => {
        const cmp = (a[sortKey] || '').localeCompare(b[sortKey] || '', 'de', { sensitivity: 'base' });
        return _dupSort.dir === 'asc' ? cmp : -cmp;
    });

    const svPfeil = _dupSort.feld === 'sv' ? (_dupSort.dir === 'asc' ? ' ↑' : ' ↓') : '';
    const dePfeil = _dupSort.feld === 'de' ? (_dupSort.dir === 'asc' ? ' ↑' : ' ↓') : '';

    let html = `
        <div style="font-size:13px;color:var(--md-sys-color-on-surface-variant);margin-bottom:12px">
            <strong>${_dupFlach.length}</strong> ${t('csv_import.dup_eintraege_gefunden')}
        </div>
        <div class="verwaltung-tabelle-wrapper" style="max-height:480px;overflow-y:auto">
        <table class="verwaltung-tabelle verwaltung-tabelle--kompakt">
            <thead><tr>
                <th style="cursor:pointer;user-select:none" data-dup-sort="sv">${t('csv_import.th_englisch')}${svPfeil}</th>
                <th style="cursor:pointer;user-select:none" data-dup-sort="de">${t('csv_import.th_deutsch')}${dePfeil}</th>
                <th>${t('csv_import.th_wortart')}</th>
                <th>${t('csv_import.dup_merge_mit')}</th>
                <th>${t('csv_import.th_aktion')}</th>
            </tr></thead>
            <tbody>`;

    for (const item of sorted) {
        const andereOptionen = item._andere.map(o =>
            `<option value="${o.id}">ID ${o.id}: ${esc(o.deutsch)}</option>`
        ).join('');

        html += `<tr data-dup-id="${item.id}">
            <td class="dup-zelle-edit" data-feld="englisch" data-id="${item.id}"
                style="cursor:text" title="${t('csv_import.dup_klick_bearbeiten')}">
                <span>${esc(item.englisch)}</span>
                ${!item.aktiv ? `<span class="tag tag--deaktiviert" style="margin-left:4px;font-size:10px">aus</span>` : ''}
                ${item._mit_stamm && item._stamm && item._stamm !== (item.englisch || '').toLowerCase()
                    ? `<span style="font-size:11px;padding:1px 5px;border-radius:8px;margin-left:4px;
                                   background:var(--md-sys-color-secondary-container);
                                   color:var(--md-sys-color-on-secondary-container)"
                             title="${t('csv_import.dup_stamm_label')}: ${esc(item._stamm)}">≈ ${esc(item._stamm)}</span>`
                    : ''}
            </td>
            <td class="dup-zelle-edit" data-feld="deutsch" data-id="${item.id}"
                style="cursor:text" title="${t('csv_import.dup_klick_bearbeiten')}">
                <span>${esc(item.deutsch)}</span>
            </td>
            <td><span class="tag">${esc(item.wortart)}</span></td>
            <td>
                ${item._andere.length > 0 ? `
                <div style="display:flex;gap:6px;align-items:center">
                    <select class="eingabe eingabe--klein" data-merge-sel="${item.id}"
                            style="min-width:80px;max-width:180px">
                        ${andereOptionen}
                    </select>
                    <button class="btn btn--klein btn--umrandet dup-merge-btn"
                            data-id="${item.id}" title="${t('csv_import.fuehre_zusammen')}">
                        <span class="material-symbols-outlined" style="font-size:14px">merge</span>
                    </button>
                </div>` : `<span style="font-size:12px;color:var(--md-sys-color-on-surface-variant)">–</span>`}
            </td>
            <td>
                <button class="btn-icon btn-icon--gefaehrlich dup-loeschen-btn"
                        data-id="${item.id}" data-wort="${esc(item.englisch)}"
                        title="${t('csv_import.dup_loeschen_titel')}">
                    <span class="material-symbols-outlined">delete_forever</span>
                </button>
            </td>
        </tr>`;
    }

    html += `</tbody></table></div>`;
    container.innerHTML = html;

    const _leer_wenn_fertig = () => {
        if (_dupFlach.length === 0) {
            container.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px;
                            color:var(--md-sys-color-on-surface-variant);padding:8px 0">
                    <span class="material-symbols-outlined">check_circle</span>
                    <span>${t('csv_import.alle_duplikate_bereinigt')}</span>
                </div>`;
        } else {
            _duplikate_tabelle_rendern(container);
        }
    };

    // Sort-Header: Klick wechselt Feld/Richtung
    container.querySelectorAll('[data-dup-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const feld = th.dataset.dupSort;
            if (_dupSort.feld === feld) {
                _dupSort.dir = _dupSort.dir === 'asc' ? 'desc' : 'asc';
            } else {
                _dupSort.feld = feld;
                _dupSort.dir  = 'asc';
            }
            _duplikate_tabelle_rendern(container);
        });
    });

    // Inline-Edit: Klick auf SV/DE-Zelle → Input
    container.querySelectorAll('.dup-zelle-edit').forEach(td => {
        td.addEventListener('click', () => {
            if (td.querySelector('input')) return;
            const span   = td.querySelector('span');
            const altWert = span?.textContent?.trim() || '';
            td.innerHTML = '';
            const inp = document.createElement('input');
            inp.type  = 'text';
            inp.value = altWert;
            inp.className   = 'eingabe eingabe--klein';
            inp.style.cssText = 'width:100%;min-width:80px';
            td.appendChild(inp);
            inp.focus();
            inp.select();

            let gespeichert = false;
            const speichern = async () => {
                if (gespeichert) return;
                gespeichert = true;
                const neuerWert = inp.value.trim();
                if (!neuerWert || neuerWert === altWert) {
                    td.innerHTML = `<span>${esc(altWert)}</span>`;
                    return;
                }
                const id   = parseInt(td.dataset.id, 10);
                const feld = td.dataset.feld;
                const body = {};
                body[feld] = neuerWert;
                const erg = await apiPut(`vokabeln/aktualisieren.php?id=${id}`, body);
                if (erg.erfolg) {
                    td.innerHTML = `<span>${esc(neuerWert)}</span>`;
                    const item = _dupFlach.find(i => i.id === id);
                    if (item) item[feld] = neuerWert;
                    _dupFlach.forEach(i => {
                        const a = i._andere.find(o => o.id === id);
                        if (a) a[feld] = neuerWert;
                    });
                    erfolg(t('allgemein.gespeichert'));
                } else {
                    td.innerHTML = `<span>${esc(altWert)}</span>`;
                    apiFehlerAnzeigen(erg);
                }
            };
            inp.addEventListener('blur', speichern);
            inp.addEventListener('keydown', e => {
                if (e.key === 'Enter')  { e.preventDefault(); inp.blur(); }
                if (e.key === 'Escape') {
                    gespeichert = true;
                    inp.removeEventListener('blur', speichern);
                    td.innerHTML = `<span>${esc(altWert)}</span>`;
                }
            });
        });
    });

    // Löschen: endgültig (Hard-Delete)
    container.querySelectorAll('.dup-loeschen-btn').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            if (!confirm(t('csv_import.dup_loeschen_confirm', { wort: btn.dataset.wort }))) return;
            const id  = parseInt(btn.dataset.id, 10);
            const erg = await apiDelete(`vokabeln/endgueltig_loeschen.php?id=${id}`);
            if (erg.erfolg) {
                _dupFlach = _dupFlach.filter(i => i.id !== id);
                _dupFlach.forEach(i => { i._andere = i._andere.filter(o => o.id !== id); });
                erfolg(t('csv_import.dup_geloescht', { wort: btn.dataset.wort }));
                _leer_wenn_fertig();
            } else {
                apiFehlerAnzeigen(erg);
            }
        });
    });

    // Zusammenführen: behalten + löschen per Merge-API
    container.querySelectorAll('.dup-merge-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const behId    = parseInt(btn.dataset.id, 10);
            const sel      = container.querySelector(`[data-merge-sel="${behId}"]`);
            const loeschId = parseInt(sel?.value, 10);
            if (!loeschId) return;
            if (!confirm(t('csv_import.duplikat_confirm', {
                behalten:    _dupFlach.find(i => i.id === behId)?.englisch  || behId,
                behalten_id: behId,
                loeschen:    _dupFlach.find(i => i.id === loeschId)?.englisch || loeschId,
                loeschen_id: loeschId,
            }))) return;
            btn.disabled = true;
            const erg = await apiPost('vokabeln/duplikate.php', { behalten_id: behId, loeschen_id: loeschId });
            btn.disabled = false;
            if (erg.erfolg) {
                const d = erg.daten;
                erfolg(t('csv_import.zusammengefuehrt_erfolg', {
                    formen:    d.formen_uebertragen,
                    saetze:    d.saetze_uebertragen,
                    lektionen: d.themenfelder_uebertragen,
                    lernstand: (d.fortschritt_uebertragen || 0) + (d.fortschritt_zusammengefuehrt || 0),
                }));
                _dupFlach = _dupFlach.filter(i => i.id !== loeschId);
                _dupFlach.forEach(i => { i._andere = i._andere.filter(o => o.id !== loeschId); });
                _leer_wenn_fertig();
            } else {
                apiFehlerAnzeigen(erg);
            }
        });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Ähnliche Vokabeln — Prefix-Ähnlichkeit (5-Zeichen EN oder DE)
// ─────────────────────────────────────────────────────────────────────────────

async function _aehnliche_laden() {
    const btn       = document.getElementById('btn-aehnliche-laden');
    const container = document.getElementById('aehnliche-ergebnis');
    if (!btn || !container) return;

    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:20px">hourglass_empty</span> ${t('allgemein.laden')}`;

    const erg = await apiGet('vokabeln/duplikate.php', { aehnlich: '1' });

    btn.disabled = false;
    btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:20px">manage_search</span> ${t('csv_import.aehnliche_suchen')}`;

    container.classList.remove('versteckt');

    if (!erg.erfolg) { apiFehlerAnzeigen(erg); return; }

    _aehnliche_rendern(erg.daten.gruppen, container);
}

function _aehnliche_rendern(gruppen, container) {
    if (gruppen.length === 0) {
        container.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;
                        color:var(--md-sys-color-on-surface-variant);padding:8px 0">
                <span class="material-symbols-outlined">check_circle</span>
                <span>${t('csv_import.keine_aehnlichen')}</span>
            </div>`;
        return;
    }

    // Zustand pro Gruppe: Map<vokabelId, 'behalten'|'konsolidieren'|'loeschen'>
    const gruppenZustand = gruppen.map(g => {
        const m = new Map();
        g.vokabeln.forEach((v, i) => m.set(v.id, i === 0 ? 'behalten' : 'konsolidieren'));
        return m;
    });

    const renderAlles = () => {
        let html = `
            <div style="font-size:13px;color:var(--md-sys-color-on-surface-variant);margin-bottom:12px">
                <strong>${gruppen.length}</strong> ${t('csv_import.aehnliche_gruppen_gefunden')}
            </div>`;

        gruppen.forEach((gruppe, gi) => {
            const zustand = gruppenZustand[gi];
            const behId   = [...zustand.entries()].find(([, a]) => a === 'behalten')?.[0];
            const zumKonsolidieren = [...zustand.entries()].filter(([, a]) => a === 'konsolidieren').map(([id]) => id);
            const zumLoeschen     = [...zustand.entries()].filter(([, a]) => a === 'loeschen').map(([id]) => id);
            const kannAusfuehren  = behId !== undefined && (zumKonsolidieren.length + zumLoeschen.length) > 0;

            html += `
                <div class="aehnl-gruppe" data-gi="${gi}" style="
                    border:1px solid var(--md-sys-color-outline-variant);
                    border-radius:8px;padding:12px 16px;margin-bottom:12px">
                    <div style="font-size:12px;color:var(--md-sys-color-on-surface-variant);margin-bottom:8px">
                        <span class="tag">${esc(gruppe.wortart)}</span>
                    </div>
                    <table style="width:100%;border-collapse:collapse;font-size:14px">
                        <thead>
                            <tr style="font-size:12px;color:var(--md-sys-color-on-surface-variant)">
                                <th style="text-align:left;padding:4px 8px 4px 0;font-weight:500">${t('csv_import.th_englisch')}</th>
                                <th style="text-align:left;padding:4px 8px;font-weight:500">${t('csv_import.th_deutsch')}</th>
                                <th style="text-align:center;padding:4px 8px;font-weight:500">Stufe</th>
                                <th style="text-align:left;padding:4px 8px;font-weight:500">${t('csv_import.aehnl_aktion')}</th>
                            </tr>
                        </thead>
                        <tbody>`;

            for (const v of gruppe.vokabeln) {
                const aktion = zustand.get(v.id) || 'konsolidieren';
                html += `
                    <tr>
                        <td style="padding:6px 8px 6px 0">${esc(v.englisch)}</td>
                        <td style="padding:6px 8px">${esc(v.deutsch)}</td>
                        <td style="padding:6px 8px;text-align:center">${v.max_stufe}</td>
                        <td style="padding:6px 8px">
                            <div style="display:flex;gap:4px;flex-wrap:wrap">
                                <button class="btn btn--klein ${aktion === 'behalten' ? 'btn--gefuellt' : 'btn--umrandet'} aehnl-btn"
                                        data-gi="${gi}" data-id="${v.id}" data-aktion="behalten">
                                    ${t('csv_import.aehnl_behalten')}
                                </button>
                                <button class="btn btn--klein ${aktion === 'konsolidieren' ? 'btn--gefuellt' : 'btn--umrandet'} aehnl-btn"
                                        data-gi="${gi}" data-id="${v.id}" data-aktion="konsolidieren">
                                    ${t('csv_import.aehnl_konsolidieren')}
                                </button>
                                <button class="btn btn--klein ${aktion === 'loeschen' ? 'btn--gefaehrlich' : 'btn--umrandet'} aehnl-btn"
                                        data-gi="${gi}" data-id="${v.id}" data-aktion="loeschen">
                                    ${t('allgemein.loeschen')}
                                </button>
                            </div>
                        </td>
                    </tr>`;
            }

            html += `
                        </tbody>
                    </table>
                    <div style="margin-top:10px;display:flex;gap:8px;align-items:center">
                        <button class="btn btn--gefuellt btn--klein aehnl-ausfuehren"
                                data-gi="${gi}" ${!kannAusfuehren ? 'disabled' : ''}>
                            <span class="material-symbols-outlined" style="font-size:16px">check</span>
                            ${t('csv_import.aehnl_ausfuehren')}
                        </button>
                        <button class="btn btn--text btn--klein aehnl-ignorieren" data-gi="${gi}">
                            ${t('csv_import.aehnl_ignorieren')}
                        </button>
                    </div>
                </div>`;
        });

        container.innerHTML = html;

        // Aktions-Buttons: Zustand wechseln
        container.querySelectorAll('.aehnl-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const gi     = parseInt(btn.dataset.gi, 10);
                const id     = parseInt(btn.dataset.id, 10);
                const aktion = btn.dataset.aktion;
                const zust   = gruppenZustand[gi];

                if (aktion === 'behalten') {
                    for (const [vid, akt] of zust.entries()) {
                        if (akt === 'behalten') zust.set(vid, 'konsolidieren');
                    }
                }
                zust.set(id, aktion);
                renderAlles();
            });
        });

        // "Ausführen" pro Gruppe
        container.querySelectorAll('.aehnl-ausfuehren').forEach(btn => {
            btn.addEventListener('click', async () => {
                const gi      = parseInt(btn.dataset.gi, 10);
                const zust    = gruppenZustand[gi];
                const behId   = [...zust.entries()].find(([, a]) => a === 'behalten')?.[0];
                if (!behId) return;

                const konsIds  = [...zust.entries()].filter(([, a]) => a === 'konsolidieren').map(([id]) => id);
                const loeschIds = [...zust.entries()].filter(([, a]) => a === 'loeschen').map(([id]) => id);

                btn.disabled = true;

                if (konsIds.length > 0) {
                    const erg = await apiPost('vokabeln/duplikate.php', { behalten_id: behId, loeschen_ids: konsIds });
                    if (!erg.erfolg) { btn.disabled = false; apiFehlerAnzeigen(erg); return; }
                    const d = erg.daten;
                    erfolg(t('csv_import.aehnl_konsolidiert', {
                        n: d.zusammengefuehrt_anzahl, saetze: d.saetze_uebertragen, themen: d.themenfelder_uebertragen,
                    }));
                }

                for (const lid of loeschIds) {
                    const erg = await apiDelete(`vokabeln/endgueltig_loeschen.php?id=${lid}`);
                    if (!erg.erfolg) { btn.disabled = false; apiFehlerAnzeigen(erg); return; }
                }

                gruppen.splice(gi, 1);
                gruppenZustand.splice(gi, 1);

                if (gruppen.length === 0) {
                    container.innerHTML = `
                        <div style="display:flex;align-items:center;gap:8px;
                                    color:var(--md-sys-color-on-surface-variant);padding:8px 0">
                            <span class="material-symbols-outlined">check_circle</span>
                            <span>${t('csv_import.alle_duplikate_bereinigt')}</span>
                        </div>`;
                } else {
                    renderAlles();
                }
            });
        });

        // "Ignorieren": Gruppe ausblenden
        container.querySelectorAll('.aehnl-ignorieren').forEach(btn => {
            btn.addEventListener('click', () => {
                const gi = parseInt(btn.dataset.gi, 10);
                gruppen.splice(gi, 1);
                gruppenZustand.splice(gi, 1);
                if (gruppen.length === 0) {
                    container.innerHTML = `
                        <div style="display:flex;align-items:center;gap:8px;
                                    color:var(--md-sys-color-on-surface-variant);padding:8px 0">
                            <span class="material-symbols-outlined">check_circle</span>
                            <span>${t('csv_import.alle_duplikate_bereinigt')}</span>
                        </div>`;
                } else {
                    renderAlles();
                }
            });
        });
    };

    renderAlles();
}
