/**
 * krone-svg.js
 *
 * Erzeugt inline-SVG-HTML für die drei Krone-Typen in drei Metall-Farben.
 *
 * Verwendung:
 *   import { krone_svg_html } from '../dienste/krone-svg.js';
 *   element.innerHTML = krone_svg_html('wikinger', 1);  // Rang 1 = Gold
 */

/** Rang → Metallfarben */
const _FARBEN = {
    1: { haupt: '#D4A010', schatten: '#9A720A', glanz: '#FFE57A' }, // Gold
    2: { haupt: '#9E9E9E', schatten: '#616161', glanz: '#E0E0E0' }, // Silber
    3: { haupt: '#A0622A', schatten: '#6D3C14', glanz: '#D4956A' }, // Bronze
};

// ----------------------------------------------------------------
// SVG-Definitionen (viewBox 0 0 24 24)
// ----------------------------------------------------------------

/**
 * Goldene Krone — klassische 5-Zacken-Königskrone mit Juwelen an den Spitzen.
 */
function _standard(f) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
  <!-- Kronenkorpus -->
  <path d="M2 19.5 L5 9 L9.5 14 L12 4.5 L14.5 14 L19 9 L22 19.5 Z"
        fill="${f.haupt}" stroke="${f.schatten}" stroke-width="0.6" stroke-linejoin="round"/>
  <!-- Basis-Band -->
  <rect x="2" y="19.5" width="20" height="2.5" rx="1"
        fill="${f.schatten}"/>
  <!-- Glanzlinie auf Band -->
  <rect x="2.5" y="20" width="19" height="0.8" rx="0.4"
        fill="${f.glanz}" opacity="0.5"/>
  <!-- Juwelen an Spitzen -->
  <circle cx="5"   cy="9"   r="1.4" fill="${f.glanz}" stroke="${f.schatten}" stroke-width="0.4"/>
  <circle cx="12"  cy="4.5" r="1.6" fill="${f.glanz}" stroke="${f.schatten}" stroke-width="0.4"/>
  <circle cx="19"  cy="9"   r="1.4" fill="${f.glanz}" stroke="${f.schatten}" stroke-width="0.4"/>
</svg>`;
}

/**
 * Wikingerkrone — nordische Zinnenkrone mit breiten eckigen Zinnen
 * und Runen-Querbalken auf der mittleren Zinne.
 */
function _wikinger(f) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
  <!-- Zinnenprofil (Merlonform): 3 Zinnen, Mitte höher) -->
  <path d="M2 22
           V18 H5.5 V11 H9 V18
           H10.5 V8 H13.5 V18
           H15 V11 H18.5 V18
           H22 V22 Z"
        fill="${f.haupt}" stroke="${f.schatten}" stroke-width="0.6"
        stroke-linejoin="miter"/>
  <!-- Runen-Querbalken auf der mittleren Zinne -->
  <line x1="10.8" y1="11" x2="13.2" y2="11" stroke="${f.schatten}" stroke-width="0.8" stroke-linecap="round"/>
  <line x1="10.8" y1="13" x2="13.2" y2="13" stroke="${f.schatten}" stroke-width="0.8" stroke-linecap="round"/>
  <line x1="10.8" y1="15" x2="13.2" y2="15" stroke="${f.schatten}" stroke-width="0.8" stroke-linecap="round"/>
  <!-- Glanzlinie auf Basis -->
  <rect x="2.5" y="20.5" width="19" height="0.7" rx="0.3"
        fill="${f.glanz}" opacity="0.45"/>
  <!-- Eckverzierungen (Nieten) -->
  <circle cx="5.5" cy="18" r="0.8" fill="${f.glanz}" opacity="0.8"/>
  <circle cx="18.5" cy="18" r="0.8" fill="${f.glanz}" opacity="0.8"/>
</svg>`;
}

/**
 * Diamantkrone — hohe, filigranartige Elfenkrone (Herr-der-Ringe-Stil)
 * mit zentralem Diamanten und schlanken Seitenspitzen.
 */
function _diamant(f) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
  <!-- Kronenkorpus: schlanke Mitteltspitze + geschwungene Seiten -->
  <path d="M2 19.5
           C2 19.5 4 16 5.5 12.5
           C6.5 14.5 8 16.5 9.5 18
           C10 15 11 11 12 5
           C13 11 14 15 14.5 18
           C16 16.5 17.5 14.5 18.5 12.5
           C20 16 22 19.5 22 19.5 Z"
        fill="${f.haupt}" stroke="${f.schatten}" stroke-width="0.6" stroke-linejoin="round"/>
  <!-- Basis-Band -->
  <rect x="2" y="19.5" width="20" height="2.5" rx="1"
        fill="${f.schatten}"/>
  <!-- Glanz auf Band -->
  <rect x="2.5" y="20" width="19" height="0.8" rx="0.4"
        fill="${f.glanz}" opacity="0.5"/>
  <!-- Diamant (Raute) in der Mitte -->
  <polygon points="12,3.5 13.8,5.8 12,8.1 10.2,5.8"
           fill="#C8E8FF" stroke="${f.schatten}" stroke-width="0.4"/>
  <!-- Diamant-Glanzfacetten -->
  <polyline points="12,3.5 12,8.1" stroke="white" stroke-width="0.35" opacity="0.7"/>
  <polyline points="10.2,5.8 13.8,5.8" stroke="white" stroke-width="0.35" opacity="0.7"/>
  <!-- Kleine Akzentjuwelen seitlich -->
  <circle cx="5.5"  cy="12.5" r="1.1" fill="${f.glanz}" stroke="${f.schatten}" stroke-width="0.35"/>
  <circle cx="18.5" cy="12.5" r="1.1" fill="${f.glanz}" stroke="${f.schatten}" stroke-width="0.35"/>
  <!-- Spitzenakzente -->
  <circle cx="9.5"  cy="18"   r="0.7" fill="${f.glanz}" opacity="0.8"/>
  <circle cx="14.5" cy="18"   r="0.7" fill="${f.glanz}" opacity="0.8"/>
</svg>`;
}

// ----------------------------------------------------------------
// Öffentliche API
// ----------------------------------------------------------------

/** Alle verfügbaren Krone-Typen */
export const KRONE_TYPEN = ['standard', 'wikinger', 'diamant'];

/**
 * Gibt inline-SVG-HTML zurück, das Krone-Typ und Rang kombiniert.
 *
 * @param {string} krone_typ  'standard' | 'wikinger' | 'diamant'
 * @param {number} rang       1 (Gold) | 2 (Silber) | 3 (Bronze)
 * @returns {string}          SVG-HTML-String
 */
export function krone_svg_html(krone_typ, rang) {
    const f = _FARBEN[rang] ?? _FARBEN[1];
    switch (krone_typ) {
        case 'wikinger': return _wikinger(f);
        case 'diamant':  return _diamant(f);
        default:         return _standard(f);
    }
}
