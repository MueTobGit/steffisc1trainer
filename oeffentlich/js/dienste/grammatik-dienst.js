/**
 * Grammatik-Dienst
 *
 * Hilfsfunktionen zur Regularitäts-Erkennung von Flexionsformen
 * sowie zur Zuordnung von Grammatikregeln aus der Datenbank.
 *
 * Wird von grammatik.js und satz-editor.js genutzt.
 */

/**
 * Prüft ob die Adjektiv-Steigerung regulär ist.
 *
 * Regulär: Komparativ auf -are/-re, Superlativ auf -ast/-st.
 * Sonderfall: -er/-el Stämme dürfen das mediale -e- verlieren
 *   (vacker → vackrare ist regulär).
 *
 * @param {string} grundform   - Grundform des Adjektivs (z.B. "snabb")
 * @param {string} komparativ  - Komparativ (z.B. "snabbare")
 * @param {string} superlativ  - Superlativ (z.B. "snabbast")
 * @returns {boolean|null} true=regulär, false=unregelmäßig, null=keine Daten
 */
export function ist_adjektiv_steigerung_regelmaessig(grundform, komparativ, superlativ) {
    if (!komparativ || !superlativ) return null;

    const komp_ok = komparativ.endsWith('are') || komparativ.endsWith('re');
    const sup_ok  = superlativ.endsWith('ast') || superlativ.endsWith('st');
    if (!komp_ok || !sup_ok) return false;

    // Stammkonsistenz-Check (vereinfacht)
    // Stamm aus Grundform: letztes -a, -e entfernen
    const stamm_grund = grundform.replace(/[ae]$/, '');
    const stamm_komp  = komparativ.replace(/are$|re$/, '');

    // Direkte Übereinstimmung
    if (stamm_komp.startsWith(stamm_grund)) return true;

    // Erlaubt: -er/-el Stämme (e-Elision): vacker → vackr + are
    const stamm_elision = grundform.replace(/er$/, 'r').replace(/el$/, 'l');
    if (stamm_komp.startsWith(stamm_elision)) return true;

    return false;
}

/**
 * Prüft ob das Perfekt-Partizip einem regulären Gruppe-1-Muster folgt.
 * Regulär: Infinitiv auf -a, Partizip = Stamm + -ad.
 *
 * @param {string} infinitiv  - Infinitiv des Verbs (z.B. "tala")
 * @param {string} partizip   - Perfekt-Partizip (z.B. "talad")
 * @returns {boolean|null} true=regulär, false=unregelmäßig, null=keine Daten
 */
export function ist_partizip_regelmaessig_gr1(infinitiv, partizip) {
    if (!infinitiv || !partizip) return null;
    if (!infinitiv.endsWith('a')) return null;
    const stamm = infinitiv.slice(0, -1);
    return partizip === stamm + 'ad';
}

// Mapping: vokabel_formen-Schlüssel → grammatik_regeln.form
const FORM_MAP = {
    praesens:           'Praesens',
    praeteritum:        'Praeteritum',
    supinum:            'Supinum',
    komparativ:         'Komparativ',
    superlativ:         'Superlativ',
    neutrum_form:       'Neutrum',
    unbestimmt_plural:  'Unbestimmter Plural',
    bestimmt_plural:    'Unbestimmter Plural',
};

/**
 * Findet die passende Grammatikregel für eine Vokabel + Form-Bezeichnung.
 *
 * @param {Object} vokabel        - Vokabel-Objekt { wortart, genus, verbgruppe, schwedisch }
 * @param {string} form_bezeichnung - Schlüssel aus vokabel_formen (z.B. "praesens")
 * @param {Array}  regeln         - Array aller Regeln aus grammatik/liste.php
 * @param {Object} [formen={}]    - Dictionary form_bezeichnung → form_wert für Regularitäts-Check
 * @returns {Object|null} Grammatikregel-Objekt oder null
 */
export function grammatik_regel_finden(vokabel, form_bezeichnung, regeln, formen = {}) {
    if (!vokabel || !form_bezeichnung || !regeln) return null;

    let form = FORM_MAP[form_bezeichnung];
    if (!form) return null;

    const wortart = vokabel.wortart;
    let genus_gruppe;

    if (wortart === 'Verb') {
        genus_gruppe = 'Gr. ' + vokabel.verbgruppe;
    } else if (wortart === 'Nomen') {
        genus_gruppe = vokabel.genus;
    } else {
        genus_gruppe = 'kein Eintrag';
    }

    // Adjektiv-Steigerung: regulär vs. unregelmäßig
    if (wortart === 'Adjektiv' && (form_bezeichnung === 'komparativ' || form_bezeichnung === 'superlativ')) {
        const regelmaessig = ist_adjektiv_steigerung_regelmaessig(
            vokabel.schwedisch,
            formen.komparativ,
            formen.superlativ
        );
        if (regelmaessig === false) {
            form         = 'Alle Formen';
            genus_gruppe = 'kein Eintrag';
        }
    }

    return regeln.find(r =>
        r.wortart       === wortart &&
        r.genus_gruppe  === genus_gruppe &&
        r.form          === form
    ) ?? null;
}
