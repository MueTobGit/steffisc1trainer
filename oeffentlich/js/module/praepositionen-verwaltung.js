/**
 * Präpositionen-Verwaltung — Admin-UI
 *
 * Zwei Tabs: Chunk-Sätze | Kategorien & Begriffe
 * Admin-only. Vollständiges CRUD für praep_chunks + praep_kategorien + praep_kategorie_begriffe.
 */

import { apiGet, apiPost, apiPut, apiDelete } from '../api-client.js';
import { esc } from '../hilfs-funktionen.js';
import { erfolg, fehler as fehlerToast, apiFehlerAnzeigen } from '../benachrichtigungen.js';
import { lade_anzeige_rendern, lade_anzeige_entfernen } from '../komponenten/lade-anzeige.js';
import { t } from '../dienste/sprache.js';

// ============================================
// Interner Zustand
// ============================================

let _aktiver_tab = 'chunks';
let _chunks = [];
let _kategorien = [];
let _bearbeite_chunk_id = null;  // null = neuer Chunk; ID = Bearbeiten
let _aufgeklappte_kategorien = new Set();

// ============================================
// Modul-Exports
// ============================================

export async function rendern(params) {
    const inhalt = document.getElementById('inhalt');
    if (!inhalt) return;

    inhalt.innerHTML = `
        <div class="verwaltung praep-verwaltung">
            <div class="verwaltung__kopf">
                <h2 class="verwaltung__titel">${t('praepositionen.verwaltung_titel')}</h2>
            </div>
            <div id="praep-statistik" class="praep-verwaltung__statistik"></div>
            <div class="praep-verwaltung__tabs">
                <button type="button" class="btn btn--tonal praep-tab-btn ${_aktiver_tab === 'chunks' ? 'praep-tab-btn--aktiv' : ''}" data-tab="chunks">
                    <span class="material-symbols-outlined">short_text</span>
                    ${t('praepositionen.tab_chunks')}
                </button>
                <button type="button" class="btn btn--tonal praep-tab-btn ${_aktiver_tab === 'kategorien' ? 'praep-tab-btn--aktiv' : ''}" data-tab="kategorien">
                    <span class="material-symbols-outlined">category</span>
                    ${t('praepositionen.tab_kategorien')}
                </button>
            </div>
            <div id="praep-tab-inhalt"></div>
        </div>
    `;

    // Tab-Wechsel
    inhalt.querySelectorAll('.praep-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => _tab_wechseln(btn.dataset.tab));
    });

    await _daten_laden();
}

export function aufraeumen() {
    _aktiver_tab = 'chunks';
    _chunks = [];
    _kategorien = [];
    _bearbeite_chunk_id = null;
    _aufgeklappte_kategorien = new Set();
}

// ============================================
// Datenladen
// ============================================

async function _daten_laden() {
    const container = document.getElementById('praep-tab-inhalt');
    if (container) lade_anzeige_rendern(container);

    const [resChunks, resKat] = await Promise.all([
        apiGet('praepositionen/chunks.php'),
        apiGet('praepositionen/kategorien.php'),
    ]);

    if (container) lade_anzeige_entfernen(container);

    if (!resChunks.erfolg || !resKat.erfolg) {
        apiFehlerAnzeigen(resChunks.erfolg ? resKat : resChunks);
        return;
    }

    _chunks = resChunks.daten.chunks ?? [];
    _kategorien = resKat.daten.kategorien ?? [];

    // Statistik
    const gesamt_begriffe = resKat.daten.gesamt_begriffe ?? 0;
    const statistik = document.getElementById('praep-statistik');
    if (statistik) {
        statistik.innerHTML = `
            <span class="karte__chip">${_chunks.length} ${t('praepositionen.chunks')}</span>
            <span class="karte__chip">${_kategorien.length} ${t('praepositionen.kategorien')}</span>
            <span class="karte__chip">${gesamt_begriffe} ${t('praepositionen.begriffe')}</span>
        `;
    }

    _tab_rendern();
}

function _tab_wechseln(tab) {
    _aktiver_tab = tab;
    document.querySelectorAll('.praep-tab-btn').forEach(b => {
        b.classList.toggle('praep-tab-btn--aktiv', b.dataset.tab === tab);
    });
    _tab_rendern();
}

function _tab_rendern() {
    if (_aktiver_tab === 'chunks') {
        _chunks_tab_rendern();
    } else {
        _kategorien_tab_rendern();
    }
}

// ============================================
// Tab 1: Chunk-Sätze
// ============================================

function _chunks_tab_rendern() {
    const container = document.getElementById('praep-tab-inhalt');
    if (!container) return;

    container.innerHTML = `
        <div class="praep-verwaltung__abschnitt">
            <h3 class="praep-verwaltung__untertitel">${t('praepositionen.neuer_chunk')}</h3>
            ${_chunk_formular_html(null)}
        </div>
        <div class="praep-verwaltung__abschnitt">
            <h3 class="praep-verwaltung__untertitel">${t('praepositionen.alle_chunks')} (${_chunks.length})</h3>
            <div id="praep-chunk-liste">${_chunks_liste_html()}</div>
        </div>
    `;

    _chunk_formular_events(container.querySelector('.praep-chunk-form'), null);
    container.querySelector('#praep-chunk-liste').querySelectorAll('.praep-chunk-eintrag').forEach(_chunk_eintrag_events);
}

function _chunk_formular_html(chunk) {
    const id   = chunk?.id ?? '';
    const satz = esc(chunk?.schwedisch ?? '');
    const loes = esc(chunk?.loesung ?? '');
    const ueb  = esc(chunk?.deutsche_uebersetzung ?? '');
    const sw   = chunk?.schwierigkeitsgrad ?? 1;

    return `
        <form class="praep-chunk-form" data-id="${id}">
            <div class="praep-chunk-form__zeile">
                <label>${t('praepositionen.satz_mit_luecke')}</label>
                <input type="text" name="schwedisch" value="${satz}" placeholder="Jag väntar ___ bussen." required class="praep-chunk-form__input">
            </div>
            <div class="praep-chunk-form__zeile praep-chunk-form__zeile--halb">
                <div>
                    <label>${t('praepositionen.loesung')}</label>
                    <input type="text" name="loesung" value="${loes}" placeholder="på" required class="praep-chunk-form__input">
                </div>
                <div>
                    <label>${t('praepositionen.schwierigkeitsgrad')}</label>
                    <select name="schwierigkeitsgrad" class="praep-chunk-form__input">
                        <option value="1" ${sw == 1 ? 'selected' : ''}>1 – Leicht</option>
                        <option value="2" ${sw == 2 ? 'selected' : ''}>2 – Mittel</option>
                        <option value="3" ${sw == 3 ? 'selected' : ''}>3 – Schwer</option>
                    </select>
                </div>
            </div>
            <div class="praep-chunk-form__zeile">
                <label>${t('praepositionen.uebersetzung')}</label>
                <input type="text" name="deutsche_uebersetzung" value="${ueb}" placeholder="Ich warte auf den Bus." class="praep-chunk-form__input">
            </div>
            <div class="praep-chunk-form__aktionen">
                <button type="submit" class="btn btn--gefuellt">
                    <span class="material-symbols-outlined">${id ? 'save' : 'add'}</span>
                    ${id ? t('praepositionen.speichern') : t('praepositionen.hinzufuegen')}
                </button>
                ${id ? `<button type="button" class="btn btn--text praep-abbrechen">${t('praepositionen.abbrechen')}</button>` : ''}
            </div>
        </form>
    `;
}

function _chunks_liste_html() {
    if (_chunks.length === 0) {
        return `<p class="praep-verwaltung__leer">${t('praepositionen.keine_chunks')}</p>`;
    }

    return _chunks.map(c => `
        <div class="praep-chunk-eintrag karte" data-id="${c.id}">
            <div class="praep-chunk-eintrag__satz">${esc(c.schwedisch)}</div>
            <div class="praep-chunk-eintrag__meta">
                <span class="karte__chip karte__chip--primary">${esc(c.loesung)}</span>
                <span class="karte__chip">Stufe ${c.schwierigkeitsgrad}</span>
                ${c.aktiv ? '' : '<span class="karte__chip karte__chip--warn">inaktiv</span>'}
                ${c.deutsche_uebersetzung ? `<span class="praep-chunk-eintrag__ueb">${esc(c.deutsche_uebersetzung)}</span>` : ''}
            </div>
            <div class="praep-chunk-eintrag__aktionen">
                <button type="button" class="btn btn--text praep-chunk-bearbeiten" title="${t('praepositionen.bearbeiten')}">
                    <span class="material-symbols-outlined">edit</span>
                </button>
                <button type="button" class="btn btn--text praep-chunk-toggle" title="${c.aktiv ? t('praepositionen.deaktivieren') : t('praepositionen.aktivieren')}">
                    <span class="material-symbols-outlined">${c.aktiv ? 'visibility_off' : 'visibility'}</span>
                </button>
                <button type="button" class="btn btn--text praep-chunk-loeschen" title="${t('praepositionen.loeschen')}">
                    <span class="material-symbols-outlined">delete</span>
                </button>
            </div>
            <div class="praep-chunk-eintrag__form" style="display:none;"></div>
        </div>
    `).join('');
}

function _chunk_formular_events(form, id) {
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const daten = {
            schwedisch: form.schwedisch.value.trim(),
            loesung: form.loesung.value.trim(),
            deutsche_uebersetzung: form.deutsche_uebersetzung.value.trim(),
            schwierigkeitsgrad: parseInt(form.schwierigkeitsgrad.value),
        };

        let res;
        if (id) {
            res = await apiPut(`praepositionen/chunks.php?id=${id}`, daten);
        } else {
            res = await apiPost('praepositionen/chunks.php', { ...daten, aktiv: 1 });
        }

        if (res.erfolg) {
            erfolg(id ? t('praepositionen.chunk_aktualisiert') : t('praepositionen.chunk_erstellt'));
            await _daten_laden();
        } else {
            apiFehlerAnzeigen(res);
        }
    });

    const abbrechenBtn = form.querySelector('.praep-abbrechen');
    if (abbrechenBtn) {
        abbrechenBtn.addEventListener('click', () => _chunks_tab_rendern());
    }
}

function _chunk_eintrag_events(eintrag) {
    const id = parseInt(eintrag.dataset.id);

    eintrag.querySelector('.praep-chunk-bearbeiten')?.addEventListener('click', () => {
        const formContainer = eintrag.querySelector('.praep-chunk-eintrag__form');
        const chunk = _chunks.find(c => c.id === id);
        if (!chunk) return;
        formContainer.style.display = formContainer.style.display === 'none' ? 'block' : 'none';
        if (formContainer.innerHTML === '') {
            formContainer.innerHTML = _chunk_formular_html(chunk);
            _chunk_formular_events(formContainer.querySelector('.praep-chunk-form'), id);
        }
    });

    eintrag.querySelector('.praep-chunk-toggle')?.addEventListener('click', async () => {
        const chunk = _chunks.find(c => c.id === id);
        if (!chunk) return;
        const res = await apiPut(`praepositionen/chunks.php?id=${id}`, { aktiv: !chunk.aktiv });
        if (res.erfolg) {
            await _daten_laden();
        } else {
            apiFehlerAnzeigen(res);
        }
    });

    eintrag.querySelector('.praep-chunk-loeschen')?.addEventListener('click', async () => {
        if (!confirm(t('praepositionen.chunk_loeschen_bestaetigung'))) return;
        const res = await apiDelete(`praepositionen/chunks.php?id=${id}`);
        if (res.erfolg) {
            erfolg(t('praepositionen.chunk_geloescht'));
            await _daten_laden();
        } else {
            apiFehlerAnzeigen(res);
        }
    });
}

// ============================================
// Tab 2: Kategorien & Begriffe
// ============================================

function _kategorien_tab_rendern() {
    const container = document.getElementById('praep-tab-inhalt');
    if (!container) return;

    container.innerHTML = `
        <div class="praep-verwaltung__abschnitt">
            <h3 class="praep-verwaltung__untertitel">${t('praepositionen.neue_kategorie')}</h3>
            ${_kategorie_formular_html(null)}
        </div>
        <div class="praep-verwaltung__abschnitt">
            <h3 class="praep-verwaltung__untertitel">${t('praepositionen.alle_kategorien')} (${_kategorien.length})</h3>
            <div id="praep-kat-liste">${_kategorien_liste_html()}</div>
        </div>
    `;

    _kategorie_formular_events(container.querySelector('.praep-kat-form'), null);
    container.querySelectorAll('.praep-kategorie').forEach(_kategorie_eintrag_events);
}

function _kategorie_formular_html(kat) {
    const id     = kat?.id ?? '';
    const name   = esc(kat?.name ?? '');
    const praep  = esc(kat?.praeposition ?? '');
    const merks  = esc(kat?.merksatz ?? '');
    const merksSv= esc(kat?.merksatz_uebersetzung ?? '');
    const reihe  = kat?.reihenfolge ?? 0;

    return `
        <form class="praep-kat-form" data-id="${id}" data-typ="kategorie">
            <div class="praep-chunk-form__zeile praep-chunk-form__zeile--halb">
                <div>
                    <label>${t('praepositionen.kategorie_name')}</label>
                    <input type="text" name="name" value="${name}" placeholder="Inseln & Halbinseln" required class="praep-chunk-form__input">
                </div>
                <div>
                    <label>${t('praepositionen.praeposition')}</label>
                    <input type="text" name="praeposition" value="${praep}" placeholder="på" required class="praep-chunk-form__input">
                </div>
            </div>
            <div class="praep-chunk-form__zeile">
                <label>${t('praepositionen.merksatz_de')}</label>
                <input type="text" name="merksatz" value="${merks}" placeholder="Inseln → på" class="praep-chunk-form__input">
            </div>
            <div class="praep-chunk-form__zeile">
                <label>${t('praepositionen.merksatz_sv')}</label>
                <input type="text" name="merksatz_uebersetzung" value="${merksSv}" placeholder="Öar → på" class="praep-chunk-form__input">
            </div>
            <div class="praep-chunk-form__zeile">
                <label>${t('praepositionen.reihenfolge')}</label>
                <input type="number" name="reihenfolge" value="${reihe}" class="praep-chunk-form__input" style="width:80px">
            </div>
            <div class="praep-chunk-form__aktionen">
                <button type="submit" class="btn btn--gefuellt">
                    <span class="material-symbols-outlined">${id ? 'save' : 'add'}</span>
                    ${id ? t('praepositionen.speichern') : t('praepositionen.kategorie_hinzufuegen')}
                </button>
                ${id ? `<button type="button" class="btn btn--text praep-abbrechen">${t('praepositionen.abbrechen')}</button>` : ''}
            </div>
        </form>
    `;
}

function _kategorien_liste_html() {
    if (_kategorien.length === 0) {
        return `<p class="praep-verwaltung__leer">${t('praepositionen.keine_kategorien')}</p>`;
    }

    return _kategorien.map(kat => {
        const offen = _aufgeklappte_kategorien.has(kat.id);
        return `
        <div class="praep-kategorie karte" data-id="${kat.id}">
            <div class="praep-kategorie__kopf">
                <button type="button" class="praep-kategorie__toggle btn btn--text">
                    <span class="material-symbols-outlined">${offen ? 'expand_less' : 'expand_more'}</span>
                    <strong>${esc(kat.name)}</strong>
                    <span class="karte__chip karte__chip--primary">${esc(kat.praeposition)}</span>
                    <span class="karte__chip">${kat.begriffe?.length ?? 0} ${t('praepositionen.begriffe')}</span>
                </button>
                <div class="praep-kategorie__aktionen">
                    <button type="button" class="btn btn--text praep-kat-bearbeiten" title="${t('praepositionen.bearbeiten')}">
                        <span class="material-symbols-outlined">edit</span>
                    </button>
                    <button type="button" class="btn btn--text praep-kat-loeschen" title="${t('praepositionen.loeschen')}">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                </div>
            </div>
            <div class="praep-kategorie__inhalt" style="display:${offen ? 'block' : 'none'}">
                ${kat.merksatz ? `<p class="praep-kategorie__merksatz">💡 ${esc(kat.merksatz)}</p>` : ''}
                <div class="praep-kategorie__bearbeitungsform" style="display:none;"></div>
                <ul class="praep-kategorie__begriffe">
                    ${(kat.begriffe ?? []).map(b => `
                        <li class="praep-kategorie__begriff" data-id="${b.id}">
                            <span class="praep-kategorie__begriff-sv">${esc(b.schwedisch)}</span>
                            ${b.deutsch ? `<span class="praep-kategorie__begriff-de">${esc(b.deutsch)}</span>` : ''}
                            ${b.aktiv ? '' : '<span class="karte__chip karte__chip--warn">inaktiv</span>'}
                            <button type="button" class="btn btn--text praep-begriff-loeschen" title="${t('praepositionen.loeschen')}">
                                <span class="material-symbols-outlined" style="font-size:16px">close</span>
                            </button>
                        </li>
                    `).join('')}
                </ul>
                <form class="praep-begriff-form" data-kategorie="${kat.id}">
                    <div class="praep-chunk-form__zeile praep-chunk-form__zeile--halb">
                        <div>
                            <input type="text" name="schwedisch" placeholder="${t('praepositionen.schwedisch')}" required class="praep-chunk-form__input">
                        </div>
                        <div>
                            <input type="text" name="deutsch" placeholder="${t('praepositionen.deutsch')}" class="praep-chunk-form__input">
                        </div>
                    </div>
                    <div class="praep-chunk-form__aktionen">
                        <button type="submit" class="btn btn--tonal">
                            <span class="material-symbols-outlined">add</span>
                            ${t('praepositionen.begriff_hinzufuegen')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
    }).join('');
}

function _kategorie_formular_events(form, id) {
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const daten = {
            typ: 'kategorie',
            name: form.name.value.trim(),
            praeposition: form.praeposition.value.trim(),
            merksatz: form.merksatz.value.trim(),
            merksatz_uebersetzung: form.merksatz_uebersetzung.value.trim(),
            reihenfolge: parseInt(form.reihenfolge.value) || 0,
        };

        let res;
        if (id) {
            res = await apiPut(`praepositionen/kategorien.php?id=${id}&typ=kategorie`, daten);
        } else {
            res = await apiPost('praepositionen/kategorien.php', daten);
        }

        if (res.erfolg) {
            erfolg(id ? t('praepositionen.kategorie_aktualisiert') : t('praepositionen.kategorie_erstellt'));
            await _daten_laden();
        } else {
            apiFehlerAnzeigen(res);
        }
    });

    const abbrechenBtn = form.querySelector('.praep-abbrechen');
    if (abbrechenBtn) {
        abbrechenBtn.addEventListener('click', () => _kategorien_tab_rendern());
    }
}

function _kategorie_eintrag_events(eintrag) {
    const id = parseInt(eintrag.dataset.id);

    // Auf-/Zuklappen
    eintrag.querySelector('.praep-kategorie__toggle')?.addEventListener('click', () => {
        const inhalt = eintrag.querySelector('.praep-kategorie__inhalt');
        const icon   = eintrag.querySelector('.praep-kategorie__toggle .material-symbols-outlined');
        const offen  = inhalt.style.display !== 'none';
        inhalt.style.display = offen ? 'none' : 'block';
        if (icon) icon.textContent = offen ? 'expand_more' : 'expand_less';
        if (offen) {
            _aufgeklappte_kategorien.delete(id);
        } else {
            _aufgeklappte_kategorien.add(id);
        }
    });

    // Kategorie bearbeiten
    eintrag.querySelector('.praep-kat-bearbeiten')?.addEventListener('click', () => {
        const formContainer = eintrag.querySelector('.praep-kategorie__bearbeitungsform');
        const kat = _kategorien.find(k => k.id === id);
        if (!kat) return;
        const offen = formContainer.style.display !== 'none';
        formContainer.style.display = offen ? 'none' : 'block';
        if (!offen) {
            formContainer.innerHTML = _kategorie_formular_html(kat);
            _kategorie_formular_events(formContainer.querySelector('.praep-kat-form'), id);
        }
    });

    // Kategorie löschen
    eintrag.querySelector('.praep-kat-loeschen')?.addEventListener('click', async () => {
        if (!confirm(t('praepositionen.kategorie_loeschen_bestaetigung'))) return;
        const res = await apiDelete(`praepositionen/kategorien.php?id=${id}&typ=kategorie`);
        if (res.erfolg) {
            erfolg(t('praepositionen.kategorie_geloescht'));
            await _daten_laden();
        } else {
            apiFehlerAnzeigen(res);
        }
    });

    // Begriff-Formular
    const begriffForm = eintrag.querySelector('.praep-begriff-form');
    if (begriffForm) {
        begriffForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const res = await apiPost('praepositionen/kategorien.php', {
                typ: 'begriff',
                kategorie_id: id,
                schwedisch: begriffForm.schwedisch.value.trim(),
                deutsch: begriffForm.deutsch.value.trim(),
            });
            if (res.erfolg) {
                erfolg(t('praepositionen.begriff_erstellt'));
                begriffForm.reset();
                await _daten_laden();
            } else {
                apiFehlerAnzeigen(res);
            }
        });
    }

    // Begriffe löschen
    eintrag.querySelectorAll('.praep-begriff-loeschen').forEach(btn => {
        const li = btn.closest('.praep-kategorie__begriff');
        const begriffId = parseInt(li?.dataset.id ?? 0);
        if (!begriffId) return;

        btn.addEventListener('click', async () => {
            const res = await apiDelete(`praepositionen/kategorien.php?id=${begriffId}&typ=begriff`);
            if (res.erfolg) {
                await _daten_laden();
            } else {
                apiFehlerAnzeigen(res);
            }
        });
    });
}
