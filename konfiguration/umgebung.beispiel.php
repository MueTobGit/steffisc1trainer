<?php
/**
 * Umgebungskonfiguration — VORLAGE
 *
 * Kopieren als umgebung.php und Werte anpassen.
 * umgebung.php NIE ins Repository einchecken / nicht hochladen!
 */

// ---- Datenbankzugangsdaten ----
define('DB_HOST', 'localhost');
define('DB_NAME', 'DATENBANKNAME');   // z.B. 'db12345_vokabeltrainer'
define('DB_USER', 'DATENBANKBENUTZER'); // z.B. 'db12345_user'
define('DB_PASS', 'DATENBANKPASSWORT');
define('DB_CHARSET', 'utf8mb4');

// ---- Basis-URL der App ----
// Lokal mit XAMPP:  '/vokabeltrainer'
// Root-Domain:      ''
// Unterordner:      '/app'
define('BASIS_URL_WERT', '/vokabeltrainer');

// ---- E-Mail / SMTP (PHPMailer) ----
// Leer lassen → natives PHP mail() als Fallback (nur fuer Tests)
// dogado-Beispiel: smtp.dogado.de, Port 587, TLS
define('SMTP_HOST',             'smtp.dogado.de'); // SMTP-Server deines Hosters
define('SMTP_PORT',             587);              // 587 (TLS) | 465 (SSL) | 25
define('SMTP_VERSCHLUESSELUNG', 'tls');            // 'tls' | 'ssl' | ''
define('SMTP_USER',             '');               // SMTP-Benutzername / E-Mail-Adresse
define('SMTP_PASS',             '');               // SMTP-Passwort
define('SMTP_FROM',             '');               // z.B. 'noreply@meinedomain.de'
define('SMTP_FROM_NAME',        'Vokabeltrainer'); // Absender-Name in der E-Mail

// ---- Umgebungstyp ----
define('APP_UMGEBUNG', 'production'); // 'development' oder 'production'
