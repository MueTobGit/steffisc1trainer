<?php
/**
 * Lernpfad-Stub — im C1-Trainer gibt es keinen sequenziellen Lernpfad.
 * Gibt eine leere Lektionsliste zurueck, damit alle Themenfelder als
 * freigeschaltet behandelt werden (kein Eintrag in der Map = kein Lock).
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/_middleware/authentifizierung.php';
require_once dirname(__DIR__) . '/_middleware/anfrage_helfer.php';
require_once dirname(__DIR__) . '/_middleware/antwort_helfer.php';

methode_erzwingen('GET');
benutzer_authentifizieren();

json_erfolg([
    'lektionen'             => [],
    'konfiguriert_prozent'  => 100,
    'favoriten_anzahl'      => 0,
    'eigene_lektionen'      => [],
    'aufgegebene_lektionen' => [],
]);
