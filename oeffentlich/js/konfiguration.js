/**
 * Frontend-Konfiguration
 *
 * API_PFAD_BASIS wird automatisch aus der aktuellen URL ermittelt.
 * Funktioniert sowohl lokal (XAMPP: /vokabeltrainer/api) als auch
 * auf dem Hoster (Root-Domain: /api oder Unterordner: /app/api).
 *
 * Voraussetzung: index.php liegt im App-Root-Verzeichnis.
 */

function _api_basis_ermitteln() {
    const pfad = window.location.pathname; // z.B. '/vokabeltrainer/' oder '/'

    // Pfad bis zum App-Root ermitteln: alles bis zur letzten Komponente
    // die index.php oder einen Hash-Pfad enthaelt, abschneiden
    const basis = pfad.replace(/\/index\.php$/, '').replace(/\/$/, '');

    // Ergebnis: '' (Root-Domain) oder '/vokabeltrainer' (XAMPP-Unterordner)
    return basis + '/api';
}

export const API_PFAD_BASIS      = _api_basis_ermitteln();
export const OEFFENTLICH_PFAD_BASIS = _api_basis_ermitteln().replace(/\/api$/, '/oeffentlich');
