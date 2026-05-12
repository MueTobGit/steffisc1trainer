/**
 * Gruppen — Gruppenverwaltung
 *
 * Zeigt "Meine Gruppen" mit Detailansicht, Einladungen, Belohnungen und Mitgliederstatistiken.
 */

import { apiGet, apiPost, apiPaginiert } from '../api-client.js';
import { holen } from '../zustand.js';
import { esc, relativZeit } from '../hilfs-funktionen.js';
import { t, aktuelle_sprache } from '../dienste/sprache.js';
import { paginierung_rendern } from '../komponenten/paginierung.js';
import { lade_anzeige_rendern, lade_anzeige_entfernen } from '../komponenten/lade-anzeige.js';
import { leer_zustand_rendern } from '../komponenten/leer-zustand.js';
import { bestaetigung_anzeigen } from '../komponenten/bestaetigung-dialog.js';
import { erfolg, fehler as fehlerMsg, apiFehlerAnzeigen } from '../benachrichtigungen.js';

// ============================================
// Modul-Zustand
// ============================================

let _seite = 1;
let _bereich = 'meine';
let _wrapper = null;

// ============================================
// Modul-Exports
// ============================================

export async function rendern() {
    const container = document.getElementById('inhalt');
    if (!container) return;

    container.innerHTML = '';

    _wrapper = document.createElement('div');
    _wrapper.className = 'sozial';
    container.appendChild(_wrapper);

    _wrapper.innerHTML = `
        <div class="sozial__kopf">
            <div>
                <h2 class="sozial__titel">${t('gruppen.meine_gruppen')}</h2>
                <small id="gruppen-limit-anzeige" style="color:var(--md-sys-color-on-surface-variant)"></small>
            </div>
            <div style="display:flex;gap:8px">
                <button class="btn btn--tonal" id="btn-token-eingabe">
                    <span class="material-symbols-outlined">vpn_key</span>
                    ${t('gruppen.beitreten')}
                </button>
                <button class="btn btn--gefuellt" id="btn-gruppe-neu">
                    <span class="material-symbols-outlined">add</span>
                    ${t('gruppen.neue_gruppe')}
                </button>
            </div>
        </div>
        <div id="gruppen-formular" class="versteckt"></div>
        <div id="gruppen-beitreten" class="versteckt"></div>
        <div id="gruppen-detail" class="versteckt"></div>
        <div id="gruppen-inhalt"></div>
        <div id="gruppen-paginierung"></div>
    `;

    _wrapper.querySelector('#btn-gruppe-neu').addEventListener('click', _formular_anzeigen);
    _wrapper.querySelector('#btn-token-eingabe').addEventListener('click', _beitreten_anzeigen);

    _gruppen_limit_anzeigen();

    await _laden();
}

export function aufraeumen() {
    _seite   = 1;
    _bereich = 'meine';
    _wrapper = null;
}

// ============================================
// Daten laden
// ============================================

async function _gruppen_limit_anzeigen() {
    const anzeige = _wrapper?.querySelector('#gruppen-limit-anzeige');
    if (!anzeige) return;
    try {
        const erg = await apiGet('gruppen/liste.php', { bereich: 'meine', pro_seite: 1 });
        if (erg.erfolg) {
            const gesamt = erg.daten?.paginierung?.gesamt_eintraege ?? 0;
            anzeige.textContent = t('gruppen.limit_anzeige', {anzahl: gesamt});
        }
    } catch (_) {}
}

async function _laden() {
    const inhalt = _wrapper.querySelector('#gruppen-inhalt');
    const pagContainer = _wrapper.querySelector('#gruppen-paginierung');
    const detail = _wrapper.querySelector('#gruppen-detail');

    detail.innerHTML = '';
    detail.classList.add('versteckt');
    pagContainer.innerHTML = '';

    lade_anzeige_rendern(inhalt);

    try {
        const ergebnis = await apiPaginiert('gruppen/liste.php', _seite, { bereich: _bereich });

        lade_anzeige_entfernen(inhalt);

        if (!ergebnis.erfolg) {
            leer_zustand_rendern(inhalt, 'error', t('profil.fehler_titel'), t('gruppen.fehler_laden'));
            return;
        }

        const gruppen = ergebnis.daten?.eintraege || [];
        const paginierung = ergebnis.daten?.paginierung;

        if (gruppen.length === 0) {
            inhalt.innerHTML = '';
            const icon = _bereich === 'meine' ? 'group' : 'search';
            const titel = _bereich === 'meine' ? t('gruppen.keine_gruppen') : t('gruppen.keine_verfuegbar');
            const text = _bereich === 'meine'
                ? t('gruppen.keine_gruppen_text')
                : t('gruppen.keine_verfuegbar_text');
            leer_zustand_rendern(inhalt, icon, titel, text);
            return;
        }

        _liste_rendern(inhalt, gruppen);

        if (paginierung && paginierung.gesamt_seiten > 1) {
            paginierung_rendern(pagContainer, paginierung, (s) => {
                _seite = s;
                _laden();
            });
        }
    } catch (e) {
        console.error('Gruppen laden fehlgeschlagen:', e);
        lade_anzeige_entfernen(inhalt);
        leer_zustand_rendern(inhalt, 'error', t('profil.fehler_titel'), t('gruppen.fehler_netzwerk'));
    }
}

// ============================================
// Listen-Rendering
// ============================================

function _liste_rendern(container, gruppen) {
    container.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'gruppen-grid';

    for (const g of gruppen) {
        const karte = document.createElement('div');
        karte.className = 'karte karte--erhoeht gruppen-karte';
        karte.dataset.id = g.id;

        const rolleTag = g.meine_rolle
            ? `<span class="tag tag--klein">${esc(_rolle_label(g.meine_rolle))}</span>`
            : '';

        const avatarHtml = g.avatar_url
            ? `<img src="${esc(g.avatar_url)}" class="gruppen-karte__avatar-img" alt="${t('gruppen.gruppenavatar_alt')}">`
            : `<span class="material-symbols-outlined gruppen-karte__icon">group</span>`;

        karte.innerHTML = `
            <div class="gruppen-karte__kopf">
                ${avatarHtml}
                <div>
                    <h3 class="gruppen-karte__name">${esc(g.name)}</h3>
                    <span class="gruppen-karte__meta">${t('gruppen.mitglieder_anzahl', {anzahl: g.mitglieder_anzahl, max: g.max_mitglieder})}</span>
                </div>
            </div>
            ${g.beschreibung ? `<p class="gruppen-karte__beschreibung">${esc(g.beschreibung)}</p>` : ''}
            <div class="gruppen-karte__fuss">
                ${rolleTag}
                <span class="gruppen-karte__datum">${relativZeit(g.erstellt_am)}</span>
            </div>
        `;

        karte.addEventListener('click', () => _detail_anzeigen(g.id));
        grid.appendChild(karte);
    }

    container.appendChild(grid);
}

function _rolle_label(rolle) {
    const labels = { admin: t('gruppen.rolle_admin'), leiter: t('gruppen.rolle_leiter'), mitglied: t('gruppen.rolle_mitglied') };
    return labels[rolle] || rolle;
}

// ============================================
// Detail-Ansicht
// ============================================

async function _detail_anzeigen(gruppenId) {
    const detail = _wrapper.querySelector('#gruppen-detail');
    detail.innerHTML = '';
    detail.classList.remove('versteckt');

    lade_anzeige_rendern(detail);

    const ergebnis = await apiGet('gruppen/details.php', { id: gruppenId });

    lade_anzeige_entfernen(detail);

    if (!ergebnis.erfolg) {
        fehlerMsg(ergebnis.fehler?.nachricht || t('gruppen.detail_fehler'));
        detail.classList.add('versteckt');
        return;
    }

    const g = ergebnis.daten;

    const istAdminLeiter = g.meine_rolle === 'admin' || g.meine_rolle === 'leiter';
    const istMitglied = g.meine_rolle !== null;

    // Avatar
    const avatarHtml = g.avatar_url
        ? `<img src="${esc(g.avatar_url)}" class="gruppen-detail__avatar-img" alt="${t('gruppen.avatar_alt')}">`
        : `<span class="gruppen-detail__avatar-placeholder material-symbols-outlined">group</span>`;

    let mitgliederHtml = '';
    for (const m of (g.mitglieder || [])) {
        const name = m.spitzname || m.benutzername;
        const initiale = (name || '?').charAt(0).toUpperCase();
        const mitgliedAvatarHtml = m.avatar_url
            ? `<img src="${esc(m.avatar_url)}" class="gruppen-detail__avatar gruppen-detail__avatar--img" alt="${esc(initiale)}">`
            : `<span class="gruppen-detail__avatar">${esc(initiale)}</span>`;
        mitgliederHtml += `
            <div class="gruppen-detail__mitglied gruppen-detail__mitglied--klickbar" data-uid="${m.benutzer_id}" title="${t('gruppen.statistik_anzeigen')}">
                ${mitgliedAvatarHtml}
                <span class="gruppen-detail__mitglied-name">${esc(name)}</span>
                <span class="tag tag--klein">${esc(_rolle_label(m.rolle))}</span>
                <span class="material-symbols-outlined" style="font-size:16px;color:var(--md-sys-color-on-surface-variant);margin-left:auto">bar_chart</span>
            </div>
        `;
    }

    detail.innerHTML = `
        <div class="karte gruppen-detail">
            <div class="gruppen-detail__kopf">
                <div style="display:flex;align-items:center;gap:12px">
                    <div class="gruppen-detail__avatar-container" id="avatar-container">
                        ${avatarHtml}
                        ${istAdminLeiter ? `<button class="gruppen-detail__avatar-btn" id="btn-avatar-aendern" title="${t('gruppen.avatar_aendern')}">
                            <span class="material-symbols-outlined" style="font-size:16px">edit</span>
                        </button>` : ''}
                    </div>
                    <h3>${esc(g.name)}</h3>
                </div>
                <button class="btn-icon" id="btn-detail-schliessen">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            ${g.beschreibung ? `<p class="gruppen-detail__beschreibung">${esc(g.beschreibung)}</p>` : ''}
            <h4 style="margin:16px 0 8px">${t('gruppen.mitglieder_titel', {anzahl: g.mitglieder_anzahl, max: g.max_mitglieder})}</h4>
            <div class="gruppen-detail__mitglieder">
                ${mitgliederHtml}
            </div>
            ${istAdminLeiter ? `
                <div class="gruppen-detail__aktionen" style="margin-top:12px">
                    <button class="btn btn--tonal" id="btn-einladen">
                        <span class="material-symbols-outlined">person_add</span>
                        ${t('gruppen.einladung_erstellen')}
                    </button>
                    <button class="btn btn--tonal" id="btn-einladungen-verwalten">
                        <span class="material-symbols-outlined">manage_accounts</span>
                        ${t('gruppen.einladungen_verwalten')}
                        ${g.offene_einladungen > 0 ? `<span class="tag tag--klein" style="margin-left:4px">${g.offene_einladungen}</span>` : ''}
                    </button>
                </div>
                <div id="einladung-formular" class="versteckt"></div>
                <div id="einladungen-verwaltung" class="versteckt"></div>
                ${istAdminLeiter ? `<input type="file" id="avatar-upload-input" accept="image/jpeg,image/png,image/webp" style="display:none">` : ''}
            ` : ''}
            ${istMitglied ? `
                <div id="gruppen-belohnungen-bereich" style="margin-top:24px"></div>
            ` : ''}
            ${istMitglied ? `
                <div style="margin-top:16px;text-align:right">
                    <button class="btn btn--text" id="btn-verlassen" style="color:var(--md-sys-color-error)">
                        ${t('gruppen.gruppe_verlassen')}
                    </button>
                </div>
            ` : ''}
        </div>
        <div id="mitglied-stats-modal" class="versteckt"></div>
    `;

    detail.querySelector('#btn-detail-schliessen').addEventListener('click', () => {
        detail.innerHTML = '';
        detail.classList.add('versteckt');
    });

    // Mitglieder: Klick auf Statistik
    detail.querySelectorAll('.gruppen-detail__mitglied--klickbar').forEach(el => {
        el.addEventListener('click', () => {
            const uid = parseInt(el.dataset.uid);
            const name = el.querySelector('.gruppen-detail__mitglied-name')?.textContent || '';
            _mitglied_stats_anzeigen(gruppenId, uid, name, detail);
        });
    });

    if (istAdminLeiter) {
        detail.querySelector('#btn-einladen').addEventListener('click', () => {
            _einladung_anzeigen(gruppenId);
        });
        detail.querySelector('#btn-einladungen-verwalten').addEventListener('click', () => {
            _einladungen_verwalten(gruppenId, detail);
        });

        // Avatar-Änderung
        const avatarBtn = detail.querySelector('#btn-avatar-aendern');
        const avatarInput = detail.querySelector('#avatar-upload-input');
        if (avatarBtn && avatarInput) {
            avatarBtn.addEventListener('click', () => avatarInput.click());
            avatarInput.addEventListener('change', () => {
                _gruppen_avatar_hochladen(gruppenId, avatarInput, detail);
            });
        }
    }

    if (istMitglied) {
        _gruppen_belohnungen_laden(gruppenId, detail.querySelector('#gruppen-belohnungen-bereich'), istAdminLeiter);

        detail.querySelector('#btn-verlassen').addEventListener('click', () => {
            _verlassen(gruppenId);
        });
    }
}

// ============================================
// Mitglieder-Statistik-Modal
// ============================================

async function _mitglied_stats_anzeigen(gruppenId, benutzerId, anzeigeName, detailEl) {
    const modal = detailEl.querySelector('#mitglied-stats-modal');
    if (!modal) return;

    modal.classList.remove('versteckt');
    modal.innerHTML = `<div class="mitglied-stats-overlay"><div class="mitglied-stats-box karte"><p>${t('gruppen.stats_laden')}</p></div></div>`;

    const ergebnis = await apiGet('gruppen/mitglied_statistik.php', {
        gruppen_id: gruppenId,
        benutzer_id: benutzerId,
    });

    if (!ergebnis.erfolg) {
        modal.innerHTML = '';
        modal.classList.add('versteckt');
        fehlerMsg(t('gruppen.stats_fehler'));
        return;
    }

    const s = ergebnis.daten;
    const name = s.benutzername || anzeigeName;
    const initiale = (name || '?').charAt(0).toUpperCase();

    const ligaHtml = s.liga
        ? `<div class="mitglied-stats__kachel">
               <span class="material-symbols-outlined" style="font-size:20px;color:var(--md-sys-color-tertiary)">emoji_events</span>
               <div><strong>${esc(s.liga.name)}</strong><br><small>${t('gruppen.stats_liga_rang', {rang: s.liga.rang, punkte: s.liga.punkte})}</small></div>
           </div>`
        : '';

    const letztesTraining = s.letztes_training
        ? relativZeit(s.letztes_training)
        : t('gruppen.stats_noch_nie');

    const sterne = `${s.bronze_sterne}🥉 ${s.silber_sterne}🥈 ${s.gold_sterne}🥇`;

    modal.innerHTML = `
        <div class="mitglied-stats-overlay">
            <div class="mitglied-stats-box karte">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
                    <span class="gruppen-detail__avatar" style="width:48px;height:48px;font-size:20px">${esc(initiale)}</span>
                    <div>
                        <strong style="font-size:16px">${esc(name)}</strong>
                        <div style="font-size:12px;color:var(--md-sys-color-on-surface-variant)">${t('gruppen.stats_level', {level: s.globales_level})}</div>
                    </div>
                    <button class="btn-icon" id="btn-stats-schliessen" style="margin-left:auto">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div class="mitglied-stats__grid">
                    <div class="mitglied-stats__kachel">
                        <span class="material-symbols-outlined" style="font-size:20px;color:var(--md-sys-color-primary)">bolt</span>
                        <div><strong>${t('gruppen.stats_xp', {xp: s.xp.toLocaleString(aktuelle_sprache() === 'sv' ? 'sv-SE' : 'de-DE')})}</strong><br><small>${t('gruppen.stats_punkte_gesamt')}</small></div>
                    </div>
                    <div class="mitglied-stats__kachel">
                        <span class="material-symbols-outlined" style="font-size:20px;color:#f97316">local_fire_department</span>
                        <div><strong>${t('gruppen.stats_tage', {anzahl: s.streak_tage})}</strong><br><small>${t('gruppen.stats_streak')}</small></div>
                    </div>
                    <div class="mitglied-stats__kachel">
                        <span class="material-symbols-outlined" style="font-size:20px;color:var(--md-sys-color-secondary)">school</span>
                        <div><strong>${s.vokabeln_gelernt.toLocaleString(aktuelle_sprache() === 'sv' ? 'sv-SE' : 'de-DE')}</strong><br><small>${t('gruppen.stats_vokabeln_gelernt')}</small></div>
                    </div>
                    <div class="mitglied-stats__kachel">
                        <span class="material-symbols-outlined" style="font-size:20px;color:#22c55e">target</span>
                        <div><strong>${t('gruppen.stats_genauigkeit', {wert: s.genauigkeit})}</strong><br><small>${t('gruppen.stats_genauigkeit_label')}</small></div>
                    </div>
                    <div class="mitglied-stats__kachel">
                        <span class="material-symbols-outlined" style="font-size:20px;color:#eab308">star</span>
                        <div><strong>${sterne}</strong><br><small>${t('gruppen.stats_sterne')}</small></div>
                    </div>
                    <div class="mitglied-stats__kachel">
                        <span class="material-symbols-outlined" style="font-size:20px;color:var(--md-sys-color-on-surface-variant)">fitness_center</span>
                        <div><strong>${s.gesamt_trainings}</strong><br><small>${t('gruppen.stats_trainings_gesamt')}</small></div>
                    </div>
                    <div class="mitglied-stats__kachel">
                        <span class="material-symbols-outlined" style="font-size:20px;color:var(--md-sys-color-on-surface-variant)">schedule</span>
                        <div><strong>${letztesTraining}</strong><br><small>${t('gruppen.stats_letztes_training')}</small></div>
                    </div>
                    ${ligaHtml}
                </div>
            </div>
        </div>
    `;

    modal.querySelector('#btn-stats-schliessen').addEventListener('click', () => {
        modal.innerHTML = '';
        modal.classList.add('versteckt');
    });

    // Klick auf Overlay schließt Modal
    modal.querySelector('.mitglied-stats-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            modal.innerHTML = '';
            modal.classList.add('versteckt');
        }
    });
}

// ============================================
// Einladung erstellen
// ============================================

function _einladung_anzeigen(gruppenId) {
    const formContainer = _wrapper.querySelector('#einladung-formular');
    formContainer.classList.remove('versteckt');

    formContainer.innerHTML = `
        <div class="karte einladung-box" style="margin-top:16px;padding:16px">
            <h4>${t('gruppen.einladen_titel')}</h4>
            <p style="font-size:12px;color:var(--md-sys-color-on-surface-variant);margin-bottom:12px">
                ${t('gruppen.einladen_hinweis')}
            </p>
            <div style="display:flex;gap:8px;margin-bottom:12px">
                <button class="btn btn--tonal btn--klein einladung-tab einladung-tab--aktiv" data-tab="qr">
                    <span class="material-symbols-outlined" style="font-size:16px">qr_code</span>
                    ${t('gruppen.einladen_tab_qr')}
                </button>
                <button class="btn btn--tonal btn--klein einladung-tab" data-tab="email">
                    <span class="material-symbols-outlined" style="font-size:16px">mail</span>
                    ${t('gruppen.einladen_tab_email')}
                </button>
            </div>
            <div id="einladung-qr-bereich">
                <p style="font-size:14px;color:var(--md-sys-color-on-surface-variant);margin-bottom:12px">
                    ${t('gruppen.einladen_qr_text')}
                </p>
                <button class="btn btn--gefuellt" id="btn-qr-generieren">
                    <span class="material-symbols-outlined">qr_code</span>
                    ${t('gruppen.einladen_qr_button')}
                </button>
                <div id="einladung-qr-ergebnis" class="versteckt"></div>
            </div>
            <div id="einladung-email-bereich" class="versteckt">
                <div class="formular-gruppe" style="margin:12px 0">
                    <label class="formular-label">${t('gruppen.einladen_email_label')}</label>
                    <input class="eingabe" type="email" id="einladung-email" placeholder="${t('gruppen.einladen_email_placeholder')}">
                </div>
                <button class="btn btn--gefuellt" id="btn-einladung-senden">${t('gruppen.einladen_email_button')}</button>
                <div id="einladung-email-ergebnis" class="versteckt"></div>
            </div>
            <div style="margin-top:16px;text-align:right">
                <button class="btn btn--text" id="btn-einladung-abbrechen">${t('allgemein.schliessen')}</button>
            </div>
        </div>
    `;

    // Tab-Umschaltung
    formContainer.querySelectorAll('.einladung-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            formContainer.querySelectorAll('.einladung-tab').forEach(tb => tb.classList.remove('einladung-tab--aktiv'));
            tab.classList.add('einladung-tab--aktiv');
            const bereich = tab.dataset.tab;
            formContainer.querySelector('#einladung-qr-bereich').classList.toggle('versteckt', bereich !== 'qr');
            formContainer.querySelector('#einladung-email-bereich').classList.toggle('versteckt', bereich !== 'email');
        });
    });

    formContainer.querySelector('#btn-einladung-abbrechen').addEventListener('click', () => {
        formContainer.innerHTML = '';
        formContainer.classList.add('versteckt');
    });

    // Kurzcode generieren
    formContainer.querySelector('#btn-qr-generieren').addEventListener('click', async () => {
        const ergebnis = await apiPost('gruppen/qr_token.php', { gruppen_id: gruppenId });
        if (!ergebnis.erfolg) {
            fehlerMsg(ergebnis.fehler?.nachricht || t('gruppen.einladen_code_fehler'));
            return;
        }
        const kurzCode  = ergebnis.daten.kurz_code;
        const gueltigBis = ergebnis.daten.gueltig_bis;
        const qrDiv     = formContainer.querySelector('#einladung-qr-ergebnis');
        qrDiv.classList.remove('versteckt');

        const ablauf    = new Date(gueltigBis);
        const ablaufText = ablauf.toLocaleTimeString(aktuelle_sprache() === 'sv' ? 'sv-SE' : 'de-DE', { hour: '2-digit', minute: '2-digit' });

        qrDiv.innerHTML = `
            <div style="margin-top:16px;text-align:center">
                <div class="einladung-kurzcode-box">
                    <p style="font-size:12px;color:var(--md-sys-color-on-surface-variant);margin-bottom:4px">${t('gruppen.einladen_code_label')}</p>
                    <div class="einladung-kurzcode">${esc(kurzCode)}</div>
                    <p style="font-size:11px;color:var(--md-sys-color-on-surface-variant);margin-top:4px">${t('gruppen.einladen_gueltig_bis', {zeit: ablaufText})}</p>
                </div>
                <div style="margin-top:12px">
                    <button class="btn btn--tonal btn--klein" id="btn-kurzcode-kopieren">
                        <span class="material-symbols-outlined" style="font-size:16px">content_copy</span>
                        ${t('gruppen.einladen_code_kopieren')}
                    </button>
                </div>
            </div>
        `;

        qrDiv.querySelector('#btn-kurzcode-kopieren').addEventListener('click', () => {
            navigator.clipboard.writeText(kurzCode).then(() => erfolg(t('gruppen.einladen_code_kopiert')));
        });
        erfolg(t('gruppen.einladen_code_erstellt'));
    });

    // E-Mail-Einladung
    formContainer.querySelector('#btn-einladung-senden').addEventListener('click', async () => {
        const email = formContainer.querySelector('#einladung-email').value.trim();
        if (!email) {
            fehlerMsg(t('gruppen.einladen_email_leer'));
            return;
        }

        const ergebnis = await apiPost('gruppen/einladen.php', { gruppen_id: gruppenId, email });

        if (ergebnis.erfolg) {
            const gueltigBis  = ergebnis.daten.gueltig_bis;
            const ergebnisDiv = formContainer.querySelector('#einladung-email-ergebnis');
            ergebnisDiv.classList.remove('versteckt');
            const ablauf     = new Date(gueltigBis);
            const ablaufText = ablauf.toLocaleTimeString(aktuelle_sprache() === 'sv' ? 'sv-SE' : 'de-DE', { hour: '2-digit', minute: '2-digit' });
            ergebnisDiv.innerHTML = `
                <div style="margin-top:12px;padding:10px 14px;background:var(--md-sys-color-secondary-container);
                            border-radius:8px;font-size:13px;color:var(--md-sys-color-on-secondary-container)">
                    <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle">check_circle</span>
                    ${t('gruppen.einladen_email_erfolg', {zeit: ablaufText})}
                </div>
            `;
            erfolg(t('gruppen.einladen_email_erstellt'));
        } else {
            fehlerMsg(ergebnis.fehler?.nachricht || t('gruppen.einladen_email_fehler'));
        }
    });
}

// ============================================
// Einladungen verwalten (Liste + Widerrufen)
// ============================================

async function _einladungen_verwalten(gruppenId, detailEl) {
    const bereich = detailEl.querySelector('#einladungen-verwaltung');
    if (!bereich) return;

    const istSichtbar = !bereich.classList.contains('versteckt');
    if (istSichtbar) {
        bereich.innerHTML = '';
        bereich.classList.add('versteckt');
        return;
    }

    bereich.classList.remove('versteckt');
    bereich.innerHTML = `<p style="font-size:14px;padding:8px">${t('gruppen.stats_laden')}</p>`;

    const ergebnis = await apiGet('gruppen/einladungen_liste.php', { gruppen_id: gruppenId });

    if (!ergebnis.erfolg) {
        bereich.innerHTML = `<p style="color:var(--md-sys-color-error)">${t('gruppen.einladungen_laden_fehler')}</p>`;
        return;
    }

    const einladungen = ergebnis.daten?.einladungen || [];

    if (einladungen.length === 0) {
        bereich.innerHTML = `
            <div class="karte" style="padding:12px 16px;margin-top:8px">
                <p style="font-size:14px;color:var(--md-sys-color-on-surface-variant)">${t('gruppen.einladungen_keine')}</p>
            </div>
        `;
        return;
    }

    bereich.innerHTML = `
        <div class="karte" style="padding:12px 16px;margin-top:8px">
            <h5 style="margin:0 0 10px">${t('gruppen.einladungen_aktive')}</h5>
            <div id="einladungen-liste-items"></div>
        </div>
    `;

    const liste = bereich.querySelector('#einladungen-liste-items');
    for (const e of einladungen) {
        const ablauf = new Date(e.gueltig_bis);
        const ablaufText = ablauf.toLocaleTimeString(aktuelle_sprache() === 'sv' ? 'sv-SE' : 'de-DE', { hour: '2-digit', minute: '2-digit' });
        const item = document.createElement('div');
        item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--md-sys-color-outline-variant)';
        item.innerHTML = `
            <span class="material-symbols-outlined" style="font-size:18px;color:var(--md-sys-color-on-surface-variant)">
                ${e.kurz_code ? 'qr_code' : 'mail'}
            </span>
            <div style="flex:1;font-size:14px">
                ${e.email ? esc(e.email) : (e.kurz_code ? `${t('gruppen.einladungen_kurzcode')}<strong>${esc(e.kurz_code)}</strong>` : t('gruppen.einladungen_qr'))}
                <br><small style="color:var(--md-sys-color-on-surface-variant)">${t('gruppen.einladungen_gueltig_bis', {zeit: ablaufText})}</small>
            </div>
            <button class="btn btn--text btn--klein" data-eid="${e.id}" style="color:var(--md-sys-color-error)">
                ${t('gruppen.einladungen_widerrufen')}
            </button>
        `;
        liste.appendChild(item);
    }

    liste.querySelectorAll('[data-eid]').forEach(btn => {
        const eid = parseInt(btn.dataset.eid);
        btn.addEventListener('click', async () => {
            const erg = await apiPost('gruppen/einladung_zurueckrufen.php', { id: eid });
            if (erg.erfolg) {
                erfolg(t('gruppen.einladungen_widerrufen_erfolg'));
                // Bereich schliessen und neu laden
                bereich.innerHTML = '';
                bereich.classList.add('versteckt');
                await _einladungen_verwalten(gruppenId, detailEl);
            } else {
                fehlerMsg(erg.fehler?.nachricht || t('allgemein.fehler'));
            }
        });
    });
}

// ============================================
// Gruppen-Avatar hochladen
// ============================================

async function _gruppen_avatar_hochladen(gruppenId, inputEl, detailEl) {
    if (!inputEl.files || inputEl.files.length === 0) return;

    const datei = inputEl.files[0];
    const formData = new FormData();
    formData.append('gruppen_id', gruppenId);
    formData.append('avatar', datei);

    try {
        const konfiguration = holen('konfiguration');
        const basisUrl = konfiguration?.api_url || '/vokabeltrainer/api/';
        const token = holen('token');

        const antwort = await fetch(basisUrl + 'gruppen/avatar_hochladen.php', {
            method: 'POST',
            headers: token ? { 'Authorization': 'Bearer ' + token } : {},
            body: formData,
        });
        const json = await antwort.json();

        if (json.erfolg) {
            erfolg(t('gruppen.avatar_gespeichert'));
            // Avatar im UI aktualisieren
            const container = detailEl.querySelector('#avatar-container');
            if (container) {
                const imgEl = container.querySelector('img');
                if (imgEl) {
                    imgEl.src = json.daten.avatar_url + '?t=' + Date.now();
                } else {
                    const placeholder = container.querySelector('.gruppen-detail__avatar-placeholder');
                    if (placeholder) {
                        const img = document.createElement('img');
                        img.src = json.daten.avatar_url;
                        img.className = 'gruppen-detail__avatar-img';
                        img.alt = t('gruppen.avatar_alt');
                        placeholder.replaceWith(img);
                    }
                }
            }
        } else {
            fehlerMsg(json.fehler?.nachricht || t('gruppen.avatar_upload_fehler'));
        }
    } catch (e) {
        fehlerMsg(t('gruppen.avatar_netzwerk_fehler'));
    }

    inputEl.value = '';
}

// ============================================
// Beitreten via Token oder Kurzcode
// ============================================

function _beitreten_anzeigen() {
    const formContainer = _wrapper.querySelector('#gruppen-beitreten');
    formContainer.classList.remove('versteckt');

    formContainer.innerHTML = `
        <div class="karte" style="padding:16px;margin-bottom:16px">
            <h4>${t('gruppen.beitreten_titel')}</h4>
            <div class="formular-gruppe" style="margin:12px 0">
                <label class="formular-label">${t('gruppen.beitreten_label')}</label>
                <input class="eingabe" type="text" id="beitreten-token"
                    placeholder="${t('gruppen.beitreten_placeholder')}"
                    autocapitalize="characters" autocomplete="off">
            </div>
            <p style="font-size:12px;color:var(--md-sys-color-on-surface-variant);margin-bottom:12px">
                ${t('gruppen.beitreten_hinweis')}
            </p>
            <div class="editor-formular__aktionen">
                <button class="btn btn--text" id="btn-beitreten-abbrechen">${t('allgemein.abbrechen')}</button>
                <button class="btn btn--gefuellt" id="btn-beitreten-senden">${t('gruppen.beitreten')}</button>
            </div>
        </div>
    `;

    formContainer.querySelector('#btn-beitreten-abbrechen').addEventListener('click', () => {
        formContainer.innerHTML = '';
        formContainer.classList.add('versteckt');
    });

    formContainer.querySelector('#btn-beitreten-senden').addEventListener('click', async () => {
        const eingabe = formContainer.querySelector('#beitreten-token').value.trim();
        if (!eingabe) {
            fehlerMsg(t('gruppen.beitreten_leer'));
            return;
        }

        // Kurzcode: <= 8 Zeichen, kein Leerzeichen → als kurz_code senden
        const istKurzcode = eingabe.length <= 8 && /^[A-Z0-9]+$/i.test(eingabe);
        const body = istKurzcode
            ? { kurz_code: eingabe.toUpperCase() }
            : { token: eingabe };

        const ergebnis = await apiPost('gruppen/beitreten.php', body);

        if (ergebnis.erfolg) {
            erfolg(ergebnis.nachricht || t('gruppen.beitreten_erfolg'));
            formContainer.innerHTML = '';
            formContainer.classList.add('versteckt');
            _bereich = 'meine';
            _seite = 1;
            _gruppen_limit_anzeigen();
            await _laden();
        } else {
            fehlerMsg(ergebnis.fehler?.nachricht || t('gruppen.beitreten_fehler'));
        }
    });
}

// ============================================
// Gruppe erstellen
// ============================================

function _formular_anzeigen() {
    const formContainer = _wrapper.querySelector('#gruppen-formular');
    formContainer.classList.remove('versteckt');

    formContainer.innerHTML = `
        <div class="karte" style="padding:16px;margin-bottom:16px">
            <h4>${t('gruppen.neue_gruppe')}</h4>
            <div class="formular-gruppe" style="margin:12px 0">
                <label class="formular-label">${t('gruppen.erstellen_name_label')}</label>
                <input class="eingabe" type="text" id="grp-name" maxlength="128" placeholder="${t('gruppen.erstellen_name_placeholder')}">
            </div>
            <div class="formular-gruppe" style="margin:12px 0">
                <label class="formular-label">${t('gruppen.erstellen_beschreibung_label')}</label>
                <textarea class="eingabe" id="grp-beschreibung" rows="2" placeholder="${t('gruppen.erstellen_beschreibung_placeholder')}"></textarea>
            </div>
            <div class="editor-formular__aktionen">
                <button class="btn btn--text" id="btn-grp-abbrechen">${t('allgemein.abbrechen')}</button>
                <button class="btn btn--gefuellt" id="btn-grp-speichern">${t('gruppen.erstellen_button')}</button>
            </div>
        </div>
    `;

    formContainer.querySelector('#btn-grp-abbrechen').addEventListener('click', () => {
        formContainer.innerHTML = '';
        formContainer.classList.add('versteckt');
    });

    formContainer.querySelector('#btn-grp-speichern').addEventListener('click', async () => {
        const name = formContainer.querySelector('#grp-name').value.trim();
        const beschreibung = formContainer.querySelector('#grp-beschreibung').value.trim();

        if (name.length < 3 || name.length > 128) {
            fehlerMsg(t('gruppen.erstellen_name_fehler'));
            return;
        }

        const ergebnis = await apiPost('gruppen/erstellen.php', {
            name,
            beschreibung: beschreibung || undefined,
        });

        if (ergebnis.erfolg) {
            erfolg(t('gruppen.erstellen_erfolg'));
            formContainer.innerHTML = '';
            formContainer.classList.add('versteckt');
            _bereich = 'meine';
            _seite = 1;
            _gruppen_limit_anzeigen();
            await _laden();
        } else {
            fehlerMsg(ergebnis.fehler?.nachricht || t('gruppen.erstellen_fehler'));
        }
    });
}

// ============================================
// Gruppen-Belohnungen (Leiter/Admin verwalten)
// ============================================

async function _gruppen_belohnungen_laden(gruppenId, container, darf_verwalten) {
    if (!container) return;

    container.innerHTML = `
        <h4 style="margin:0 0 8px;display:flex;align-items:center;gap:8px">
            <span class="material-symbols-outlined" style="font-size:18px">card_giftcard</span>
            ${t('gruppen.belohnungen_titel')}
            ${darf_verwalten ? `<button class="btn btn--tonal btn--klein" id="btn-bel-grp-neu" style="margin-left:auto">
                <span class="material-symbols-outlined" style="font-size:16px">add</span> ${t('gruppen.belohnungen_neu')}
            </button>` : ''}
        </h4>
        <div id="grp-bel-liste"></div>
        <div id="grp-bel-formular" class="versteckt" style="margin-top:12px"></div>
    `;

    if (darf_verwalten) {
        container.querySelector('#btn-bel-grp-neu').addEventListener('click', () => {
            _gruppen_belohnung_formular(container, gruppenId, null);
        });
    }

    await _gruppen_belohnungen_neu_laden(gruppenId, container, darf_verwalten);
}

async function _gruppen_belohnungen_neu_laden(gruppenId, container, darf_verwalten) {
    const liste = container.querySelector('#grp-bel-liste');
    if (!liste) return;

    const ergebnis = await apiGet('gruppen/belohnungen_laden.php', { gruppen_id: gruppenId });

    if (!ergebnis.erfolg) {
        liste.innerHTML = `<p style="color:var(--md-sys-color-on-surface-variant);font-size:14px">${t('gruppen.belohnungen_laden_fehler')}</p>`;
        return;
    }

    const belohnungen = ergebnis.daten?.belohnungen || [];

    if (belohnungen.length === 0) {
        liste.innerHTML = `<p style="color:var(--md-sys-color-on-surface-variant);font-size:14px">${t('gruppen.belohnungen_keine')}</p>`;
        return;
    }

    liste.innerHTML = belohnungen.map(b => {
        const kriterien = _belohnung_kriterien_text(b);
        const _heute = new Date().toISOString().slice(0, 10);
        const _nochNicht = b.start_datum && b.start_datum > _heute;
        const startDatumHtml = b.start_datum
            ? `<br><small style="color:var(--md-sys-color-${_nochNicht ? 'error' : 'on-surface-variant'})">🗓 ${_nochNicht ? 'Startet am' : 'Gestartet am'}: ${new Date(b.start_datum + 'T00:00:00').toLocaleDateString('de-DE')}</small>`
            : '';
        return `
        <div class="karte" style="padding:12px 16px;margin-bottom:8px">
            <div style="display:flex;align-items:flex-start;gap:12px">
                <span class="material-symbols-outlined" style="color:var(--md-sys-color-primary);margin-top:2px">redeem</span>
                <div style="flex:1">
                    <strong>${esc(b.titel)}</strong>
                    ${b.beschreibung ? `<br><small style="color:var(--md-sys-color-on-surface-variant)">${esc(b.beschreibung)}</small>` : ''}
                    ${kriterien ? `<br><small style="color:var(--md-sys-color-secondary);margin-top:2px;display:block">📋 ${kriterien}</small>` : ''}
                    ${startDatumHtml}
                    ${!b.aktiv ? `<span class="tag tag--fehler tag--klein" style="margin-left:4px">${t('gruppen.belohnungen_inaktiv')}</span>` : ''}
                </div>
                ${darf_verwalten ? `
                    <button class="btn-icon" data-bel-edit="${b.id}" title="${t('allgemein.bearbeiten')}">
                        <span class="material-symbols-outlined" style="font-size:18px">edit</span>
                    </button>
                    <button class="btn-icon" data-bel-del="${b.id}" title="${t('allgemein.loeschen')}" style="color:var(--md-sys-color-error)">
                        <span class="material-symbols-outlined" style="font-size:18px">delete</span>
                    </button>
                ` : ''}
            </div>
            <div class="gruppen-bel-mitglieder" data-bel-mitglieder="${b.id}" style="margin-top:8px;font-size:13px"></div>
        </div>
    `}).join('');

    // Zielerreichungsliste pro Belohnung laden
    for (const b of belohnungen) {
        _belohnung_mitglieder_laden(b.id, liste.querySelector(`[data-bel-mitglieder="${b.id}"]`));
    }

    if (darf_verwalten) {
        liste.querySelectorAll('[data-bel-edit]').forEach(btn => {
            const id = parseInt(btn.dataset.belEdit);
            btn.addEventListener('click', () => {
                _gruppen_belohnung_formular(container, gruppenId, belohnungen.find(b => b.id === id));
            });
        });

        liste.querySelectorAll('[data-bel-del]').forEach(btn => {
            const id = parseInt(btn.dataset.belDel);
            btn.addEventListener('click', () => _gruppen_belohnung_loeschen(id, gruppenId, container, darf_verwalten));
        });
    }
}

async function _belohnung_mitglieder_laden(belohnungId, container) {
    if (!container) return;

    const ergebnis = await apiGet('gruppen/belohnung_mitglieder_fortschritt.php', { belohnung_id: belohnungId });
    if (!ergebnis.erfolg) { container.innerHTML = ''; return; }

    if (ergebnis.daten?.noch_nicht_gestartet) {
        const datum = new Date(ergebnis.daten.start_datum + 'T00:00:00').toLocaleDateString('de-DE');
        container.innerHTML = `<small style="color:var(--md-sys-color-on-surface-variant)">⏳ Challenge startet am ${datum} — noch kein Tracking aktiv.</small>`;
        return;
    }

    if (!ergebnis.daten?.mitglieder?.length) {
        container.innerHTML = '';
        return;
    }

    const mitglieder = ergebnis.daten.mitglieder;
    const erreicht = mitglieder.filter(m => m.freigeschaltet);
    const offen = mitglieder.filter(m => !m.freigeschaltet);

    let html = '';

    if (erreicht.length > 0) {
        html += erreicht.map(m => {
            const datum = m.freigeschaltet_am ? new Date(m.freigeschaltet_am).toLocaleDateString(aktuelle_sprache() === 'sv' ? 'sv-SE' : 'de-DE') : '';
            return `<div style="display:flex;align-items:center;gap:6px;padding:2px 0;color:var(--md-sys-color-tertiary)">
                <span class="material-symbols-outlined" style="font-size:16px">check_circle</span>
                <span>${esc(m.benutzername)}</span>
                ${datum ? `<span style="color:var(--md-sys-color-on-surface-variant);margin-left:auto;font-size:12px">${datum}</span>` : ''}
            </div>`;
        }).join('');
    }

    if (offen.length > 0) {
        html += offen.map(m =>
            `<div style="display:flex;align-items:center;gap:6px;padding:2px 0;color:var(--md-sys-color-on-surface-variant)">
                <span class="material-symbols-outlined" style="font-size:16px">radio_button_unchecked</span>
                <span>${esc(m.benutzername)}</span>
            </div>`
        ).join('');
    }

    container.innerHTML = html;
}

function _belohnung_kriterien_text(b) {
    const teile = [];
    if (b.min_streak > 0) {
        const key = b.streak_relativ ? 'gruppen.belohnungen_kriterium_streak_relativ' : 'gruppen.belohnungen_kriterium_streak';
        teile.push(t(key, {wert: b.min_streak}));
    }
    if (b.min_vokabeln > 0) {
        const key = b.vokabeln_relativ ? 'gruppen.belohnungen_kriterium_vokabeln_relativ' : 'gruppen.belohnungen_kriterium_vokabeln';
        teile.push(t(key, {wert: b.min_vokabeln}));
    }
    if (b.min_vokabeln_geuebt > 0) teile.push(t('gruppen.belohnungen_kriterium_geuebt', {wert: b.min_vokabeln_geuebt}));
    return teile.join(t('gruppen.belohnungen_kriterien_und'));
}

function _gruppen_belohnung_formular(container, gruppenId, belohnung) {
    const ist_neu  = !belohnung;
    const formDiv  = container.querySelector('#grp-bel-formular');
    formDiv.classList.remove('versteckt');

    formDiv.innerHTML = `
        <div class="karte" style="padding:16px">
            <h5 style="margin:0 0 12px">${ist_neu ? t('gruppen.belohnungen_formular_titel_neu') : t('gruppen.belohnungen_formular_titel_edit')}</h5>
            <div class="formular-gruppe" style="margin:0 0 10px">
                <label class="formular-label">${t('gruppen.belohnungen_titel_label')}</label>
                <input class="eingabe" id="gbf-titel" type="text" placeholder="${t('gruppen.belohnungen_titel_placeholder')}" value="${ist_neu ? '' : esc(belohnung.titel)}">
            </div>
            <div class="formular-gruppe" style="margin:0 0 10px">
                <label class="formular-label">${t('gruppen.belohnungen_beschreibung_label')}</label>
                <textarea class="eingabe" id="gbf-beschreibung" rows="2" placeholder="${t('gruppen.belohnungen_beschreibung_placeholder')}">${ist_neu ? '' : esc(belohnung.beschreibung || '')}</textarea>
            </div>
            <p style="font-size:13px;font-weight:500;margin:10px 0 6px">${t('gruppen.belohnungen_kriterien_titel')}</p>
            <p style="font-size:12px;color:var(--md-sys-color-on-surface-variant);margin:0 0 10px">
                ${t('gruppen.belohnungen_kriterien_hinweis')}
            </p>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px">
                <div class="formular-gruppe" style="margin:0">
                    <label class="formular-label">${t('gruppen.belohnungen_streak_label')}</label>
                    <input class="eingabe" id="gbf-streak" type="number" min="0" placeholder="0" value="${ist_neu ? 0 : (belohnung.min_streak ?? 0)}">
                    <label style="display:flex;align-items:center;gap:4px;font-size:12px;margin-top:4px;cursor:pointer">
                        <input type="checkbox" id="gbf-streak-relativ" ${!ist_neu && belohnung.streak_relativ ? 'checked' : ''}>
                        ${t('gruppen.belohnungen_relativ_label')}
                    </label>
                </div>
                <div class="formular-gruppe" style="margin:0">
                    <label class="formular-label">${t('gruppen.belohnungen_vokabeln_label')}</label>
                    <input class="eingabe" id="gbf-vokabeln" type="number" min="0" placeholder="0" value="${ist_neu ? 0 : (belohnung.min_vokabeln ?? 0)}">
                    <label style="display:flex;align-items:center;gap:4px;font-size:12px;margin-top:4px;cursor:pointer">
                        <input type="checkbox" id="gbf-vokabeln-relativ" ${!ist_neu && belohnung.vokabeln_relativ ? 'checked' : ''}>
                        ${t('gruppen.belohnungen_relativ_label')}
                    </label>
                </div>
                <div class="formular-gruppe" style="margin:0">
                    <label class="formular-label">${t('gruppen.belohnungen_geuebt_label')}</label>
                    <input class="eingabe" id="gbf-geuebt" type="number" min="0" placeholder="0" value="${ist_neu ? 0 : (belohnung.min_vokabeln_geuebt ?? 0)}">
                    <small style="display:block;font-size:11px;color:var(--md-sys-color-on-surface-variant);margin-top:4px">${t('gruppen.belohnungen_geuebt_hinweis')}</small>
                </div>
            </div>
            <div class="formular-gruppe" style="margin:0 0 10px">
                <label class="formular-label">Startdatum (optional)</label>
                <input class="eingabe" id="gbf-startdatum" type="date" value="${ist_neu ? '' : (belohnung.start_datum || '')}">
                <small style="display:block;font-size:11px;color:var(--md-sys-color-on-surface-variant);margin-top:4px">
                    Leer lassen für sofortigen Start. Bei zukünftigem Datum beginnt die Zählung erst ab diesem Tag.
                </small>
            </div>
            ${!ist_neu ? `
            <div class="formular-gruppe" style="margin:0 0 10px">
                <label class="formular-label">${t('gruppen.belohnungen_status_label')}</label>
                <select class="eingabe" id="gbf-aktiv">
                    <option value="1" ${belohnung.aktiv ? 'selected' : ''}>${t('gruppen.belohnungen_status_aktiv')}</option>
                    <option value="0" ${!belohnung.aktiv ? 'selected' : ''}>${t('gruppen.belohnungen_status_inaktiv')}</option>
                </select>
            </div>
            ` : ''}
            <div style="display:flex;gap:8px;justify-content:flex-end">
                <button class="btn btn--text" id="gbf-abbrechen">${t('allgemein.abbrechen')}</button>
                <button class="btn btn--gefuellt" id="gbf-speichern">${ist_neu ? t('gruppen.erstellen_button') : t('allgemein.speichern')}</button>
            </div>
        </div>
    `;

    formDiv.querySelector('#gbf-abbrechen').addEventListener('click', () => {
        formDiv.innerHTML = '';
        formDiv.classList.add('versteckt');
    });

    formDiv.querySelector('#gbf-speichern').addEventListener('click', async () => {
        const titel              = formDiv.querySelector('#gbf-titel').value.trim();
        const beschreibung       = formDiv.querySelector('#gbf-beschreibung').value.trim();
        const min_streak         = parseInt(formDiv.querySelector('#gbf-streak').value)   || 0;
        const streak_relativ     = formDiv.querySelector('#gbf-streak-relativ').checked;
        const min_vokabeln       = parseInt(formDiv.querySelector('#gbf-vokabeln').value) || 0;
        const vokabeln_relativ   = formDiv.querySelector('#gbf-vokabeln-relativ').checked;
        const min_vokabeln_geuebt = parseInt(formDiv.querySelector('#gbf-geuebt').value)  || 0;
        const start_datum = formDiv.querySelector('#gbf-startdatum').value || null;

        if (!titel) { fehlerMsg(t('gruppen.belohnungen_titel_pflicht')); return; }
        if (min_streak === 0 && min_vokabeln === 0 && min_vokabeln_geuebt === 0) {
            fehlerMsg(t('gruppen.belohnungen_kriterium_pflicht'));
            return;
        }

        let ergebnis;
        if (ist_neu) {
            ergebnis = await apiPost('gruppen/belohnung_erstellen.php', {
                gruppen_id: gruppenId, titel, beschreibung,
                min_streak, streak_relativ, min_vokabeln, vokabeln_relativ, min_vokabeln_geuebt,
                start_datum
            });
        } else {
            const aktiv = formDiv.querySelector('#gbf-aktiv')?.value === '1' ?? true;
            ergebnis = await apiPost('gruppen/belohnung_aktualisieren.php', {
                id: belohnung.id, titel, beschreibung,
                min_streak, streak_relativ, min_vokabeln, vokabeln_relativ, min_vokabeln_geuebt,
                aktiv, start_datum
            });
        }

        if (ergebnis.erfolg) {
            erfolg(ist_neu ? t('gruppen.belohnungen_erstellt') : t('gruppen.belohnungen_aktualisiert'));
            formDiv.innerHTML = '';
            formDiv.classList.add('versteckt');
            await _gruppen_belohnungen_neu_laden(gruppenId, container, true);
        } else {
            apiFehlerAnzeigen(ergebnis);
        }
    });
}

async function _gruppen_belohnung_loeschen(id, gruppenId, container, darf_verwalten) {
    const bestaetigt = await bestaetigung_anzeigen(
        t('gruppen.belohnungen_loeschen_titel'),
        t('gruppen.belohnungen_loeschen_text'),
        t('allgemein.loeschen'), t('allgemein.abbrechen'), true
    );
    if (!bestaetigt) return;

    const ergebnis = await apiPost('gruppen/belohnung_loeschen.php', { id });
    if (ergebnis.erfolg) {
        erfolg(t('gruppen.belohnungen_geloescht'));
        await _gruppen_belohnungen_neu_laden(gruppenId, container, darf_verwalten);
    } else {
        apiFehlerAnzeigen(ergebnis);
    }
}

// ============================================
// Gruppe verlassen
// ============================================

async function _verlassen(gruppenId) {
    const bestaetigt = await bestaetigung_anzeigen(
        t('gruppen.verlassen_titel'),
        t('gruppen.verlassen_text'),
        t('gruppen.verlassen_bestaetigen'),
        t('allgemein.abbrechen'),
        false
    );

    if (!bestaetigt) return;

    const ergebnis = await apiPost('gruppen/verlassen.php', { gruppen_id: gruppenId });

    if (ergebnis.erfolg) {
        erfolg(t('gruppen.verlassen_erfolg'));
        const detail = _wrapper.querySelector('#gruppen-detail');
        detail.innerHTML = '';
        detail.classList.add('versteckt');
        await _laden();
    } else {
        fehlerMsg(ergebnis.fehler?.nachricht || t('gruppen.verlassen_fehler'));
    }
}
