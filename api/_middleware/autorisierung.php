<?php
/**
 * API Autorisierung
 *
 * Rollenbasierte Zugriffskontrollen.
 */

declare(strict_types=1);

/**
 * Admin-Rolle erzwingen
 *
 * @param array $benutzer Authentifizierter Benutzer
 */
function admin_erzwingen(array $benutzer): void
{
    if ($benutzer['rolle'] !== 'admin') {
        fehler_nicht_berechtigt('Diese Aktion erfordert Admin-Rechte.');
    }
}

/**
 * Pruefen ob Benutzer Admin ist
 */
function ist_admin(array $benutzer): bool
{
    return $benutzer['rolle'] === 'admin';
}

/**
 * Pruefen ob Benutzer der Eigentuemer einer Ressource ist
 *
 * @param array $benutzer Authentifizierter Benutzer
 * @param int $eigentuemer_id ID des Eigentumers
 * @param bool $admin_erlaubt Darf ein Admin auch zugreifen?
 */
function eigentuemer_oder_admin(array $benutzer, int $eigentuemer_id, bool $admin_erlaubt = true): void
{
    if ($benutzer['id'] === $eigentuemer_id) {
        return;
    }

    if ($admin_erlaubt && ist_admin($benutzer)) {
        return;
    }

    fehler_nicht_berechtigt('Zugriff nur fuer den Eigentuemer oder Administratoren.');
}

/**
 * Rate-Limiting pruefen (IP-basiert) — nur lesen, nicht inkrementieren
 *
 * @param string $aktion Name der Aktion (z.B. 'login')
 * @param int $max_versuche Max Versuche
 * @param int $zeitraum_minuten Zeitraum in Minuten
 * @return bool True wenn noch erlaubt, false wenn gesperrt
 */
function rate_limit_pruefen(string $aktion, int $max_versuche = MAX_LOGIN_VERSUCHE, int $zeitraum_minuten = LOGIN_SPERRE_MINUTEN): bool
{
    $ip = client_ip();
    $cache_datei = sys_get_temp_dir() . '/vt_rate_' . md5($aktion . '_' . $ip);

    $versuche = [];
    if (file_exists($cache_datei)) {
        $inhalt = file_get_contents($cache_datei);
        $versuche = json_decode($inhalt, true) ?: [];
    }

    $grenze = time() - ($zeitraum_minuten * 60);
    $versuche = array_filter($versuche, fn($zeit) => $zeit > $grenze);

    return count($versuche) < $max_versuche;
}

/**
 * Fehlgeschlagenen Versuch zaehlen — gleicher Cache-Key wie rate_limit_pruefen()
 *
 * @param string $aktion Name der Aktion (z.B. 'login')
 * @param int $zeitraum_minuten Zeitraum in Minuten (zum Bereinigen alter Eintraege)
 */
function rate_limit_erhoehen(string $aktion, int $zeitraum_minuten = LOGIN_SPERRE_MINUTEN): void
{
    $ip = client_ip();
    $cache_datei = sys_get_temp_dir() . '/vt_rate_' . md5($aktion . '_' . $ip);

    $versuche = [];
    if (file_exists($cache_datei)) {
        $inhalt = file_get_contents($cache_datei);
        $versuche = json_decode($inhalt, true) ?: [];
    }

    $grenze = time() - ($zeitraum_minuten * 60);
    $versuche = array_filter($versuche, fn($zeit) => $zeit > $grenze);

    $versuche[] = time();
    file_put_contents($cache_datei, json_encode(array_values($versuche)), LOCK_EX);
}

/**
 * Gruppen-Rolle pruefen
 *
 * @param int $benutzer_id Benutzer-ID
 * @param int $gruppen_id Gruppen-ID
 * @param array $erlaubte_rollen Erlaubte Rollen
 * @return bool
 */
function gruppen_rolle_pruefen(int $benutzer_id, int $gruppen_id, array $erlaubte_rollen = ['admin', 'leiter']): bool
{
    $pdo = db_verbindung();
    $sql = "SELECT rolle FROM gruppen_mitglieder WHERE benutzer_id = ? AND gruppen_id = ?";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$benutzer_id, $gruppen_id]);
    $rolle = $stmt->fetchColumn();

    return $rolle !== false && in_array($rolle, $erlaubte_rollen, true);
}
