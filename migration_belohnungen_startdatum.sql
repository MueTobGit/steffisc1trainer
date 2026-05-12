-- Migration: start_datum für echte Gruppen-Belohnungen
-- Ermöglicht Leitern einen zukünftigen Starttermin zu setzen.
-- Snapshots werden erst ab start_datum gezogen; vorher kein Tracking.
-- Kompatibel mit MariaDB (lokal) und MySQL 8.0 (Hoster).

ALTER TABLE belohnungen
    ADD COLUMN start_datum DATE NULL DEFAULT NULL;
