/**
 * Router — Hash-basierter SPA-Router
 *
 * 19 Routen mit dynamischem Modul-Import.
 * Komplett neuer Aufbau bei Modulwechsel.
 */

import { holen, setzen, ist_eingeloggt, ist_admin } from './zustand.js';

// ---- Routen-Definition ----
const ROUTEN = {
    '/dashboard':       { modul: 'dashboard',       titel: 'Dashboard',          titel_key: 'navigation.dashboard',     icon: 'home',           auth: true },
    '/lernmodus':       { modul: 'lernmodus',       titel: 'Lernmodus',         titel_key: 'navigation.lernmodus',     icon: 'school',         auth: true },
    '/training':        { modul: 'training',        titel: 'Training',          titel_key: 'navigation.training',      icon: 'fitness_center', auth: true },
    '/schnellueben':    { modul: 'schnellueben',    titel: 'Schnell üben',      titel_key: 'navigation.schnellueben',  icon: 'bolt',           auth: true },
    '/praepositionen':  { modul: 'praepositionen',  titel: 'Präpositionen',     titel_key: 'navigation.praepositionen', icon: 'swap_horiz',      auth: true },
    '/vokabeln':        { modul: 'vokabel-liste',   titel: 'Vokabeln',         titel_key: 'navigation.vokabeln',      icon: 'dictionary',     auth: true },
    '/vokabeln/neu':    { modul: 'vokabel-editor',  titel: 'Vokabel erstellen', titel_key: 'navigation.vokabel_neu',   icon: 'add_circle',     auth: true },
    '/vokabeln/:id':    { modul: 'vokabel-editor',  titel: 'Vokabel bearbeiten',titel_key: 'navigation.vokabel_edit',  icon: 'edit',           auth: true },
    '/saetze':          { modul: 'satz-editor',     titel: 'Sätze',            titel_key: 'navigation.saetze',        icon: 'text_ad',   auth: true },
    '/grammatik':       { modul: 'grammatik',       titel: 'Grammatik',        titel_key: 'navigation.grammatik',     icon: 'assignment_globe',      auth: true },
    '/kategorien':      { modul: 'kategorie-liste', titel: 'Kategorien',       titel_key: 'navigation.kategorien',    icon: 'folder',         auth: true, admin: true },
    '/lektionen':       { modul: 'lektion-liste',   titel: 'Lektionen',        titel_key: 'navigation.lektionen',     icon: 'note_stack',      auth: true },
    '/fortschritt':     { modul: 'fortschritt',     titel: 'Lernfortschritt',  titel_key: 'navigation.fortschritt',   icon: 'trending_up',    auth: true },
    '/profil':          { modul: 'profil',          titel: 'Profil',           titel_key: 'navigation.profil',        icon: 'person',         auth: true },
    '/gruppen':         { modul: 'gruppen',         titel: 'Gruppen',          titel_key: 'navigation.gruppen',       icon: 'group',          auth: true },
    '/ligen':           { modul: 'ligen',           titel: 'Liga',             titel_key: 'navigation.ligen',         icon: 'emoji_events',   auth: true },
    '/belohnungen':     { modul: 'belohnungen',     titel: 'Belohnungen',      titel_key: 'navigation.belohnungen',   icon: 'military_tech',  auth: true },
    '/einstellungen':   { modul: 'einstellungen',   titel: 'Einstellungen',    titel_key: 'navigation.einstellungen', icon: 'settings',       auth: true },
    '/admin':                    { modul: 'admin-panel',            titel: 'Admin',                    titel_key: 'navigation.admin',      icon: 'admin_panel_settings', auth: true, admin: true },
    '/admin/import':             { modul: 'csv-import',             titel: 'CSV-Import',               titel_key: 'navigation.csv_import', icon: 'upload_file',          auth: true, admin: true },
    '/admin/praepositionen':     { modul: 'praepositionen-verwaltung', titel: 'Präpositionen-Verwaltung', titel_key: 'navigation.praepositionen_verwaltung', icon: 'swap_horiz', auth: true, admin: true },
    '/admin/benachrichtigungen': { modul: 'admin-benachrichtigungen', titel: 'App-Benachrichtigungen', titel_key: 'navigation.app_benachrichtigungen', icon: 'notifications_active', auth: true, admin: true },
    '/impressum':                { modul: 'impressum',               titel: 'Impressum',               titel_key: 'navigation.impressum',  icon: 'gavel',                auth: false },
};

// Standard-Route nach Login
const STANDARD_ROUTE = '/dashboard';

// Routen die als "Startpunkt" gelten (Back-Button soll App nicht schließen aber auch nicht weiter)
const KEINE_HISTORY_ROUTEN = new Set(['/dashboard', '/anmeldung']);

// Callback fuer Route-Aenderungen
let _routeCallback = null;

// Navigations-History für Android-Back-Handling
const _history_stack = [];

/**
 * Router initialisieren
 *
 * @param {Function} callback Wird bei Routenwechsel aufgerufen (routeInfo)
 */
export function router_init(callback) {
    _routeCallback = callback;

    // Hash-Aenderungen lauschen
    window.addEventListener('hashchange', _route_verarbeiten);

    // Android Back-Button: SPA-intern zurücknavigieren
    window.addEventListener('androidBackPressed', _android_zurueck);

    // Initiale Route
    _route_verarbeiten();
}

/**
 * Zu einer Route navigieren
 *
 * @param {string} pfad Route-Pfad (z.B. '/dashboard')
 */
export function navigieren(pfad) {
    window.location.hash = `#${pfad}`;
}

/**
 * Route-Informationen holen
 */
export function aktuelle_route() {
    return _route_parsen(window.location.hash);
}

/**
 * Alle registrierten Routen holen
 */
export function alle_routen() {
    return ROUTEN;
}

// ---- Intern ----

function _route_verarbeiten() {
    const hash = window.location.hash || `#${STANDARD_ROUTE}`;
    const routeInfo = _route_parsen(hash);

    if (!routeInfo) {
        // Unbekannte Route → Dashboard
        navigieren(STANDARD_ROUTE);
        return;
    }

    // Auth-Pruefung
    if (routeInfo.config.auth && !ist_eingeloggt()) {
        // Nicht eingeloggt → Anmeldung zeigen
        _history_stack.length = 0;
        _android_can_go_back_setzen(false);
        if (_routeCallback) {
            _routeCallback({ pfad: '/anmeldung', config: null, params: {}, erfordert_auth: true });
        }
        return;
    }

    // Admin-Pruefung
    if (routeInfo.config.admin && !ist_admin()) {
        navigieren(STANDARD_ROUTE);
        return;
    }

    // Vorherige Route merken
    const vorherige = holen('aktive_route');
    setzen({
        vorherige_route: vorherige,
        aktive_route: routeInfo.pfad,
    });

    // Android Back-History pflegen
    // Bei "Basis-Routen" (Dashboard etc.) History leeren
    if (KEINE_HISTORY_ROUTEN.has(routeInfo.pfad)) {
        _history_stack.length = 0;
    } else if (vorherige && vorherige !== routeInfo.pfad) {
        // Neue Route → vorherige auf den Stack legen (keine Duplikate)
        if (_history_stack[_history_stack.length - 1] !== vorherige) {
            _history_stack.push(vorherige);
        }
    }
    _android_can_go_back_setzen(_history_stack.length > 0);

    // Callback aufrufen
    if (_routeCallback) {
        _routeCallback(routeInfo);
    }
}

/**
 * Android Back-Button: zur vorherigen SPA-Route zurücknavigieren.
 * Wird durch das 'androidBackPressed'-Event ausgelöst.
 */
function _android_zurueck() {
    if (_history_stack.length > 0) {
        const ziel = _history_stack.pop();
        // Direkt navigieren ohne erneut auf den Stack zu legen
        window.location.hash = `#${ziel}`;
    } else {
        // Nichts mehr → Android meldet, dass nicht zurückgegangen werden kann
        _android_can_go_back_setzen(false);
    }
}

/**
 * Android mitteilen ob der SPA-Router zurücknavigieren kann.
 * @param {boolean} kannZurueck
 */
function _android_can_go_back_setzen(kannZurueck) {
    if (window.Android && typeof window.Android.setCanGoBack === 'function') {
        window.Android.setCanGoBack(kannZurueck);
    }
}

function _route_parsen(hash) {
    // Hash bereinigen: "#/dashboard" → "/dashboard"
    // Query-String (nach ?) wird fuer Routen-Matching abgeschnitten,
    // aber in params-Objekt an rendern() weitergegeben.
    const vollPfad = hash.replace(/^#/, '') || STANDARD_ROUTE;
    const fragezeichen = vollPfad.indexOf('?');
    let pfad = fragezeichen !== -1 ? vollPfad.slice(0, fragezeichen) : vollPfad;
    if (!pfad) pfad = STANDARD_ROUTE;

    // Query-Parameter extrahieren (z.B. ?lektion=5&filter=favorit)
    const queryParams = fragezeichen !== -1 ? _query_parsen(vollPfad.slice(fragezeichen + 1)) : {};

    // Exakte Treffer zuerst
    if (ROUTEN[pfad]) {
        return {
            pfad,
            config: ROUTEN[pfad],
            params: queryParams,
        };
    }

    // Dynamische Routen (z.B. /vokabeln/:id)
    for (const [muster, config] of Object.entries(ROUTEN)) {
        if (!muster.includes(':')) continue;

        const regex = _muster_zu_regex(muster);
        const treffer = pfad.match(regex);

        if (treffer) {
            const paramNamen = (muster.match(/:(\w+)/g) || []).map(p => p.slice(1));
            const params = {};

            paramNamen.forEach((name, index) => {
                params[name] = treffer[index + 1];
            });

            return { pfad, config, params: { ...params, ...queryParams } };
        }
    }

    return null;
}

function _query_parsen(queryString) {
    const params = {};
    for (const teil of queryString.split('&')) {
        const eqIdx = teil.indexOf('=');
        if (eqIdx === -1) continue;
        const key = decodeURIComponent(teil.slice(0, eqIdx));
        const val = decodeURIComponent(teil.slice(eqIdx + 1));
        if (key) params[key] = val;
    }
    return params;
}

function _muster_zu_regex(muster) {
    const escaped = muster.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const withParams = escaped.replace(/:(\w+)/g, '([^/]+)');
    return new RegExp(`^${withParams}$`);
}

/**
 * Seitenleiste-Links Daten holen (gruppiert)
 */
export function seitenleiste_routen() {
    return {
        lernen: [
            { pfad: '/dashboard', ...ROUTEN['/dashboard'] },
            { pfad: '/training', ...ROUTEN['/training'] },
            { pfad: '/schnellueben', ...ROUTEN['/schnellueben'] },
            { pfad: '/praepositionen', ...ROUTEN['/praepositionen'] },
            { pfad: '/lernmodus', ...ROUTEN['/lernmodus'] },
            { pfad: '/grammatik', ...ROUTEN['/grammatik'] },
        ],
        gemeinschaft: [
            { pfad: '/ligen', ...ROUTEN['/ligen'] },
            { pfad: '/belohnungen', ...ROUTEN['/belohnungen'] },
            { pfad: '/gruppen', ...ROUTEN['/gruppen'] },
        ],
        inhalte: [
            { pfad: '/vokabeln', ...ROUTEN['/vokabeln'] },
            { pfad: '/saetze', ...ROUTEN['/saetze'] },
            { pfad: '/kategorien', ...ROUTEN['/kategorien'] },  // admin: true → in seitenleiste.js gefiltert
            { pfad: '/lektionen', ...ROUTEN['/lektionen'] },
        ],
        persoenlich: [
            { pfad: '/fortschritt', ...ROUTEN['/fortschritt'] },
            { pfad: '/profil', ...ROUTEN['/profil'] },
        ],
        admin: [
            { pfad: '/admin',                    ...ROUTEN['/admin'] },
            { pfad: '/admin/import',             ...ROUTEN['/admin/import'] },
            { pfad: '/admin/praepositionen',     ...ROUTEN['/admin/praepositionen'] },
            { pfad: '/admin/benachrichtigungen', ...ROUTEN['/admin/benachrichtigungen'] },
        ],
    };
}

/**
 * Untere-Leiste Routen (Mobil, 5 Icons)
 */
export function unten_leiste_routen() {
    return [
        { pfad: '/dashboard', ...ROUTEN['/dashboard'] },
        { pfad: '/schnellueben', ...ROUTEN['/schnellueben'] },
        { pfad: '/training', ...ROUTEN['/training'] },
        { pfad: '/fortschritt', ...ROUTEN['/fortschritt'] },
        { pfad: '/profil', ...ROUTEN['/profil'] },
    ];
}
