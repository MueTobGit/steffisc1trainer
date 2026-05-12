-- Migration: Erweiterte Belohnungen — Lücken + 5-Jahres-Meilensteine (46 neue Einträge)
-- Skaliert für Lernende mit 5 Jahren täglicher Nutzung (5 Trainings/Tag, 20 Vokabeln/Tag).
-- Kompatibel mit MariaDB (lokal) und MySQL 8.0 (Hoster).

-- Bestehende Einträge dieser Migration entfernen (CASCADE löscht benutzer_belohnungen mit)
DELETE FROM belohnungen WHERE code IN (
    'fuenfzig_vokabeln', 'fuenfhundert_vokabeln', 'tausend_vokabeln',
    'fuenftausend_vokabeln', 'fuenfundzwanzigtausend_vokabeln',
    'streak_14', 'streak_50', 'streak_365', 'streak_500', 'streak_1000', 'streak_1825',
    'richtig_100', 'richtig_1000', 'richtig_10000', 'richtig_50000', 'richtig_100000',
    'training_10', 'training_50', 'training_100', 'training_365',
    'training_1000', 'training_2500', 'training_5000',
    'perfekt_5', 'perfekt_10', 'perfekt_50', 'perfekt_100', 'perfekt_250',
    'liga_gewonnen_1', 'liga_gewonnen_5', 'liga_gewonnen_10', 'liga_gewonnen_25', 'liga_gewonnen_50',
    'liga_5', 'liga_10', 'liga_25', 'liga_50', 'liga_100',
    'level_3', 'level_10', 'level_15', 'level_20',
    'xp_5000', 'xp_50000', 'xp_100000', 'xp_500000'
);

INSERT INTO belohnungen (code, titel, beschreibung, typ, bedingung_json, xp_wert, reihenfolge) VALUES

-- ============================================================
-- Vokabeln gelernt
-- Progression: 10(bestehend) → 50 → 100(bestehend) → 500 → 1000 → 5000 → 25000
-- 5-Jahres-Schätzung: ~36.500 Vokabeln
-- ============================================================
('fuenfzig_vokabeln',              'Fleiß-Funke',             '50 verschiedene Vokabeln gelernt!',       'abzeichen',  '{"typ": "vokabeln_gelernt", "wert": 50}',    75,   21),
('fuenfhundert_vokabeln',          'Vokabel-Veteran',         '500 verschiedene Vokabeln gelernt!',      'meilenstein','{"typ": "vokabeln_gelernt", "wert": 500}',   500,  22),
('tausend_vokabeln',               'Wortschatz-Titan',        '1.000 verschiedene Vokabeln gelernt!',    'titel',      '{"typ": "vokabeln_gelernt", "wert": 1000}',  1500, 23),
('fuenftausend_vokabeln',          'Vokabel-Legende',         '5.000 verschiedene Vokabeln gelernt!',    'titel',      '{"typ": "vokabeln_gelernt", "wert": 5000}',  5000, 24),
('fuenfundzwanzigtausend_vokabeln','Lebenswerk',               '25.000 verschiedene Vokabeln gelernt!',   'titel',      '{"typ": "vokabeln_gelernt", "wert": 25000}', 10000,25),

-- ============================================================
-- Streak
-- Progression: 7(bestehend) → 14 → 30(bestehend) → 50 → 100(bestehend) → 365 → 500 → 1000 → 1825
-- 5-Jahres-Schätzung: max. 1.825 Tage
-- ============================================================
('streak_14',   'Zweiwochenheld',     '14 Tage am Stück geübt!',                'abzeichen',  '{"typ": "streak", "wert": 14}',   150,  31),
('streak_50',   'Unermüdlich',        '50 Tage am Stück geübt!',                'abzeichen',  '{"typ": "streak", "wert": 50}',   750,  32),
('streak_365',  'Jahreskönig',        '365 Tage am Stück geübt!',               'titel',      '{"typ": "streak", "wert": 365}',  5000, 33),
('streak_500',  'Unaufhaltsame Kraft','500 Tage am Stück geübt!',               'titel',      '{"typ": "streak", "wert": 500}',  8000, 34),
('streak_1000', 'Ewiger Streaker',    '1.000 Tage am Stück geübt!',             'titel',      '{"typ": "streak", "wert": 1000}', 15000,35),
('streak_1825', 'Fünf Jahre stark',   'Fünf Jahre lang jeden Tag geübt!',       'titel',      '{"typ": "streak", "wert": 1825}', 25000,36),

-- ============================================================
-- Richtige Antworten gesamt
-- Progression: 1(bestehend) → 100 → 1000 → 10000 → 50000 → 100000
-- 5-Jahres-Schätzung: ~80 korrekte Antworten/Tag × 1.825 = ~146.000
-- ============================================================
('richtig_100',    'Hundertschütze',     '100 Antworten richtig beantwortet!',     'abzeichen',  '{"typ": "richtig_gesamt", "wert": 100}',    50,   41),
('richtig_1000',   'Antwort-Meister',    '1.000 Antworten richtig beantwortet!',   'meilenstein','{"typ": "richtig_gesamt", "wert": 1000}',   300,  42),
('richtig_10000',  'Präzisions-Legende', '10.000 Antworten richtig beantwortet!',  'titel',      '{"typ": "richtig_gesamt", "wert": 10000}',  1000, 43),
('richtig_50000',  'Antwort-Titan',      '50.000 Antworten richtig beantwortet!',  'titel',      '{"typ": "richtig_gesamt", "wert": 50000}',  5000, 44),
('richtig_100000', 'Das Orakel',         '100.000 Antworten richtig beantwortet!', 'titel',      '{"typ": "richtig_gesamt", "wert": 100000}', 10000,45),

-- ============================================================
-- Trainingseinheiten
-- Progression: 10 → 50 → 100 → 365 → 1000 → 2500 → 5000
-- 5-Jahres-Schätzung: 5/Tag × 1.825 = ~9.125 Einheiten
-- ============================================================
('training_10',   'Erster Schwung',    '10 Trainingseinheiten absolviert!',     'abzeichen',  '{"typ": "trainings", "wert": 10}',   50,   51),
('training_50',   'Durchhalter',       '50 Trainingseinheiten absolviert!',     'abzeichen',  '{"typ": "trainings", "wert": 50}',   200,  52),
('training_100',  'Trainings-Heros',   '100 Trainingseinheiten absolviert!',    'meilenstein','{"typ": "trainings", "wert": 100}',  500,  53),
('training_365',  'Jahrestrainer',     '365 Trainingseinheiten absolviert!',    'titel',      '{"typ": "trainings", "wert": 365}',  2000, 54),
('training_1000', 'Trainings-Legende', '1.000 Trainingseinheiten absolviert!',  'titel',      '{"typ": "trainings", "wert": 1000}', 5000, 55),
('training_2500', 'Unerbittlich',      '2.500 Trainingseinheiten absolviert!',  'titel',      '{"typ": "trainings", "wert": 2500}', 10000,56),
('training_5000', 'Trainings-Gott',    '5.000 Trainingseinheiten absolviert!',  'titel',      '{"typ": "trainings", "wert": 5000}', 20000,57),

-- ============================================================
-- Perfekte Sitzungen (100% Genauigkeit)
-- Progression: 1(bestehend) → 5 → 10 → 50 → 100 → 250
-- 5-Jahres-Schätzung: ~1 perfekte Sitzung/Woche = ~260
-- ============================================================
('perfekt_5',   'Scharfschütze',     '5 Sitzungen ohne einen einzigen Fehler!',   'abzeichen',  '{"typ": "perfekte_sitzung", "wert": 5}',   200,  61),
('perfekt_10',  'Fehlerloser Geist', '10 Sitzungen ohne einen einzigen Fehler!',  'meilenstein','{"typ": "perfekte_sitzung", "wert": 10}',  500,  62),
('perfekt_50',  'Perfektion pur',    '50 Sitzungen ohne einen einzigen Fehler!',  'titel',      '{"typ": "perfekte_sitzung", "wert": 50}',  2000, 63),
('perfekt_100', 'Fehlerlos 100',     '100 Sitzungen ohne einen einzigen Fehler!', 'titel',      '{"typ": "perfekte_sitzung", "wert": 100}', 5000, 64),
('perfekt_250', 'Perfektion Total',  '250 Sitzungen ohne einen einzigen Fehler!', 'titel',      '{"typ": "perfekte_sitzung", "wert": 250}', 10000,65),

-- ============================================================
-- Liga-Siege (Platz 1 in abgeschlossenen Ligas)
-- Progression: 1 → 5 → 10 → 25 → 50
-- 5-Jahres-Schätzung: ~1 Liga/Woche × 20% Gewinnrate = ~50 Siege
-- ============================================================
('liga_gewonnen_1',  'Erster Triumph',  'Eine Liga auf Platz 1 abgeschlossen!',    'meilenstein','{"typ": "liga_gewonnen", "wert": 1}',  750,  71),
('liga_gewonnen_5',  'Seriensieger',    '5 Ligas auf Platz 1 abgeschlossen!',      'titel',      '{"typ": "liga_gewonnen", "wert": 5}',  3000, 72),
('liga_gewonnen_10', 'Dominanz',        '10 Ligas auf Platz 1 abgeschlossen!',     'titel',      '{"typ": "liga_gewonnen", "wert": 10}', 6000, 73),
('liga_gewonnen_25', 'Unbesiegbar',     '25 Ligas auf Platz 1 abgeschlossen!',     'titel',      '{"typ": "liga_gewonnen", "wert": 25}', 12000,74),
('liga_gewonnen_50', 'Ewiger Champion', '50 Ligas auf Platz 1 abgeschlossen!',     'titel',      '{"typ": "liga_gewonnen", "wert": 50}', 20000,75),

-- ============================================================
-- Liga-Teilnahme
-- Progression: 1(bestehend) → 5 → 10 → 25 → 50 → 100
-- 5-Jahres-Schätzung: ~1 Liga/Woche = ~260 Teilnahmen
-- ============================================================
('liga_5',   'Wettkampf-Fan',      'An 5 Ligas teilgenommen!',    'abzeichen',  '{"typ": "liga_teilnahme", "wert": 5}',   150, 81),
('liga_10',  'Liga-Stammspieler',  'An 10 Ligas teilgenommen!',   'meilenstein','{"typ": "liga_teilnahme", "wert": 10}',  300, 82),
('liga_25',  'Liga-Veteran',       'An 25 Ligas teilgenommen!',   'meilenstein','{"typ": "liga_teilnahme", "wert": 25}',  750, 83),
('liga_50',  'Liga-Legende',       'An 50 Ligas teilgenommen!',   'titel',      '{"typ": "liga_teilnahme", "wert": 50}',  1500,84),
('liga_100', 'Liga-Unsterblicher', 'An 100 Ligas teilgenommen!',  'titel',      '{"typ": "liga_teilnahme", "wert": 100}', 3000,85),

-- ============================================================
-- Level
-- Progression: 2(bestehend) → 3 → 5(bestehend) → 10 → 15 → 20
-- ============================================================
('level_3',  'Im Aufwind', 'Level 3 erreicht!',  'abzeichen',  '{"typ": "level", "wert": 3}',  200,  91),
('level_10', 'Expertise',  'Level 10 erreicht!', 'meilenstein','{"typ": "level", "wert": 10}', 2000, 92),
('level_15', 'Erfahrener', 'Level 15 erreicht!', 'titel',      '{"typ": "level", "wert": 15}', 4000, 93),
('level_20', 'Virtuose',   'Level 20 erreicht!', 'titel',      '{"typ": "level", "wert": 20}', 8000, 94),

-- ============================================================
-- XP-Meilensteine
-- Progression: 1000(bestehend) → 5000 → 10000(bestehend) → 50000 → 100000 → 500000
-- ============================================================
('xp_5000',   'Fünftausender', '5.000 XP gesammelt!',    'meilenstein','{"typ": "xp", "wert": 5000}',   0, 101),
('xp_50000',  'XP-Imperator',  '50.000 XP gesammelt!',   'titel',      '{"typ": "xp", "wert": 50000}',  0, 102),
('xp_100000', 'Sechs Stellen', '100.000 XP gesammelt!',  'titel',      '{"typ": "xp", "wert": 100000}', 0, 103),
('xp_500000', 'XP-Gott',       '500.000 XP gesammelt!',  'titel',      '{"typ": "xp", "wert": 500000}', 0, 104);
