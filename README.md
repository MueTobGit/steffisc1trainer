# Vokabeltrainer Schwedisch-Deutsch

Web-App zum Lernen schwedischer Vokabeln mit Trainings-, Schnellüben- und Lernmodus, Gamification (XP, Ligen, Streaks), Gruppen und Admin-Panel.

**Stack:** PHP 8.x (FPM) · Vanilla JavaScript (ES-Module, kein Framework) · MySQL 8 / MariaDB 10.4+ · CSS

---

## Deployment auf dem Hoster (dogado)

### 1. Dateien hochladen

Alle Projektdateien per FTP/SFTP hochladen — **mit einer Ausnahme:**

```
NICHT hochladen:  konfiguration/umgebung.php   ← enthält DB-Zugangsdaten!
Hochladen:        konfiguration/umgebung.beispiel.php  ← ist nur die Vorlage
```

### 2. Konfigurationsdatei anlegen

Auf dem Server `konfiguration/umgebung.beispiel.php` kopieren zu `konfiguration/umgebung.php` und die Werte anpassen:

```php
// Datenbankzugangsdaten (aus dem Hoster-Panel)
define('DB_HOST', 'localhost');          // meist 'localhost'
define('DB_NAME', 'db12345_voka');      // Datenbankname vom Hoster
define('DB_USER', 'db12345_user');      // Datenbankbenutzer vom Hoster
define('DB_PASS', 'geheimes-passwort'); // Datenbankpasswort vom Hoster
define('DB_CHARSET', 'utf8mb4');

// Basis-URL: '' wenn App im Root liegt (https://meinedomain.de/)
// '/unterordner' wenn App in einem Unterordner liegt
define('BASIS_URL_WERT', '');

// Umgebungstyp
define('APP_UMGEBUNG', 'production');
```

### 3. Datenbank importieren

Die Datenbank existiert auf dem Hoster bereits (wird im Hoster-Panel angelegt).
Die Datei `datenbank_schema.sql` direkt in phpMyAdmin importieren — die Zeilen
`CREATE DATABASE` und `USE` sind bereits auskommentiert, das ist so korrekt.

```
phpMyAdmin → Datenbank auswählen → Importieren → datenbank_schema.sql
```

Nach dem Import Admin-Passwort sofort ändern (siehe unten).

### 4. .htaccess anpassen

In `.htaccess` die HTTPS-Weiterleitung aktivieren (zwei Zeilen einkommentieren):

```apache
# Vorher (lokal):
# RewriteCond %{HTTPS} off
# RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

# Nachher (Produktion):
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
```

### 5. PHP-Einstellungen beim Hoster

| Option | Einstellung | Begründung |
|---|---|---|
| `display_errors` | **Aus** | Pflicht für Produktion — verhindert Fehlerausgabe in API-Antworten |
| `opcache_enable` | **Ein** | Deutlich schnellere PHP-Ausführung, unbedingt aktivieren |
| `allow_url_fopen` | **Aus** | Wird nicht benötigt, aus Sicherheitsgründen deaktiviert lassen |
| `allow_url_include` | **Aus** | Wird nicht benötigt, nie aktivieren |

**PHP-Version:** 8.4 FPM (empfohlen und getestet)

### 6. Admin-Passwort nach Deployment ändern

Nach dem ersten Login als Admin sofort das Passwort unter **Einstellungen** ändern. Der Hash im `datenbank_schema.sql` entspricht dem Entwicklungsstand und sollte nicht in Produktion verwendet werden.

---

## Lokale Entwicklung (XAMPP)

### Einrichtung

1. Projekt in `xampp/htdocs/vokabeltrainer/` ablegen
2. `konfiguration/umgebung.beispiel.php` kopieren zu `konfiguration/umgebung.php`
3. Lokale Werte eintragen:
   ```php
   define('DB_HOST', 'localhost');
   define('DB_NAME', 'vokabeltrainer');
   define('DB_USER', 'root');
   define('DB_PASS', '');
   define('BASIS_URL_WERT', '/vokabeltrainer');
   define('APP_UMGEBUNG', 'development');
   ```
4. In `datenbank_schema.sql` die zwei Zeilen `CREATE DATABASE` und `USE` einkommentieren und ausführen — oder Datenbank vorher in phpMyAdmin anlegen und dann das Schema direkt importieren.
5. App aufrufen: `http://localhost/vokabeltrainer/`

### Lokal vs. Produktion — was sich automatisch anpasst

| Datei | Lokal | Produktion |
|---|---|---|
| `konfiguration/umgebung.php` | `BASIS_URL_WERT = '/vokabeltrainer'` | `BASIS_URL_WERT = ''` |
| `oeffentlich/js/konfiguration.js` | API-Pfad wird automatisch erkannt | API-Pfad wird automatisch erkannt |
| `.htaccess` HTTPS | auskommentiert | einkommentiert |

---

## Projektstruktur

```
vokabeltrainer/
├── index.php                        # Einstiegspunkt (App-Shell)
├── datenbank_schema.sql             # Vollständiges DB-Schema + Seed-Daten
├── .htaccess                        # HTTPS, Security-Header, Cache
├── api/                             # PHP REST-API (25+ Endpunkte)
│   ├── _middleware/                 # Auth, Validierung, Antwort-Helfer
│   ├── auth/                        # Login, Registrierung, Token
│   ├── vokabeln/                    # CRUD, Suche, Import, Export
│   ├── training/                    # Trainings-Sitzung
│   ├── schnellueben/                # Schnellüben-Sitzung
│   ├── lernmodus/                   # Karteikarten-Modus
│   └── admin/                       # Admin-Panel-API
├── konfiguration/
│   ├── umgebung.php                 # ← NICHT hochladen! Zugangsdaten
│   ├── umgebung.beispiel.php        # Vorlage (hochladen)
│   ├── datenbank.php                # PDO-Verbindung (lädt umgebung.php)
│   ├── konstanten.php               # App-Konstanten, BASIS_URL
│   ├── lern_algorithmus.php         # SM-2 Algorithmus
│   └── hilfsfunktionen.php
└── oeffentlich/
    ├── css/                         # Stylesheets
    ├── js/                          # ES-Module SPA
    │   ├── app.js                   # Router-Integration, Auth-Flow
    │   ├── router.js                # Hash-basiertes Routing
    │   ├── api-client.js            # Fetch-Wrapper, Auth
    │   ├── zustand.js               # Reaktiver State-Store
    │   └── module/                  # Seiten-Module (je Route eine Datei)
    ├── schriften/                   # Lokale Fonts (DSGVO-konform)
    └── uploads/                     # Benutzer-Uploads (Medien)
```

---

## Datenbank-Kurzreferenz

- **25 Tabellen**, Engine InnoDB, Charset `utf8mb4_unicode_ci`
- **Kompatibel mit** MySQL 8+ und MariaDB 10.4+
- **Admin-Login nach Erstinstallation:** Benutzername `admin`, Passwort dem aktuellen Hash in `datenbank_schema.sql` zugehörig — sofort ändern!

### Wichtige Konfigurationswerte (Tabelle `app_konfiguration`)

| Schlüssel | Default | Bedeutung |
|---|---|---|
| `neue_vokabeln_pro_tag` | 10 | Max. neue Vokabeln pro Training |
| `min_fragen_fuer_streak` | 5 | Mindestfragen für Streak-Zählung |
| `streak_abzug_pro_tag` | 0 | Streak-Abzug pro verpasstem Tag |
| `level_aufstieg_prozent` | 70 | % Vokabeln auf Stufe 3+ für Level-Up |
| `xp_pro_bronze/silber/gold` | 500/2500/12500 | XP-Schwellen für Sterne |
| `multiplikator_perfekt` | 1.5 | XP-Bonus bei fehlerfreier Antwort |
| `schnellueben_xp_faktor` | 0.5 | XP-Faktor im Schnellüben |
| `backup_auto_intervall` | deaktiviert | Auto-Backup: deaktiviert/taeglich/woechentlich |

---

## Sicherheitshinweise

- `konfiguration/umgebung.php` ist per `.htaccess` gegen direkten HTTP-Zugriff gesperrt
- API nutzt Bearer-Token-Auth (90 Tage gültig, konfigurierbar)
- Passwort-Hashing mit `PASSWORD_BCRYPT`, cost=12
- `display_errors` in Produktion deaktivieren (verhindert Lecks in JSON-Antworten)
- Uploads auf `uploads/`-Verzeichnis beschränkt, Dateigrößenlimit konfigurierbar
