-- ============================================================
-- Präpositions-Ergänzung v2
-- Neue Chunks: över, under, bakom, framför, bredvid, mellan,
--              hos, genom, utanför, längs
-- Neue Kategorisierungskategorien: 11–18
-- Ausführen NACH migration_praepositionen.sql
-- ============================================================

-- ============================================================
-- Neue Chunks
-- ============================================================

INSERT INTO praep_chunks (schwedisch, loesung, deutsche_uebersetzung, schwierigkeitsgrad) VALUES

-- över (über, oberhalb)
('Lampan hänger ___ matbordet.',                    'över',    'Die Lampe hängt über dem Esstisch.',              1),
('Bron leder ___ floden.',                          'över',    'Die Brücke führt über den Fluss.',                1),
('Fågeln flyger ___ hustaken.',                     'över',    'Der Vogel fliegt über die Dächer.',               1),
('Temperaturen stiger ___ trettio grader.',         'över',    'Die Temperatur steigt über dreißig Grad.',        2),
('Han lade jackan ___ stolen.',                     'över',    'Er legte die Jacke über den Stuhl.',              2),
('Vi bor ___ en blomsteraffär.',                    'över',    'Wir wohnen über einem Blumenladen.',              2),
('Molnen drev ___ himlen.',                         'över',    'Die Wolken zogen über den Himmel.',               3),

-- under (unter, unterhalb)
('Katten sover ___ sängen.',                        'under',   'Die Katze schläft unter dem Bett.',               1),
('Nyckeln låg ___ mattan.',                         'under',   'Der Schlüssel lag unter dem Teppich.',            1),
('Vi fikade ___ trädet i parken.',                  'under',   'Wir tranken Kaffee unter dem Baum im Park.',      1),
('Temperaturen sjunker ___ noll ___ natten.',       'under',   'Die Temperatur sinkt unter null in der Nacht.',   2),
('Barnen gömde sig ___ bordet.',                    'under',   'Die Kinder versteckten sich unter dem Tisch.',    2),
('Bron går ___ järnvägen.',                         'under',   'Die Brücke führt unter der Eisenbahn durch.',     3),

-- bakom (hinter)
('Bilen är parkerad ___ huset.',                    'bakom',   'Das Auto parkt hinter dem Haus.',                 1),
('Hunden gömmer sig ___ soffan.',                   'bakom',   'Der Hund versteckt sich hinter dem Sofa.',        1),
('Det finns en sjö ___ skogen.',                    'bakom',   'Hinter dem Wald gibt es einen See.',              2),
('Hon stod och väntade ___ dörren.',                'bakom',   'Sie stand wartend hinter der Tür.',               2),

-- framför (vor)
('Bussen stannar ___ skolan.',                      'framför', 'Der Bus hält vor der Schule.',                    1),
('Det köar folk ___ affären.',                      'framför', 'Es stehen Leute vor dem Laden an.',               1),
('Hon stannade ___ spegeln.',                       'framför', 'Sie blieb vor dem Spiegel stehen.',               2),
('Hunden satt ___ sin ägare och tiggde mat.',       'framför', 'Der Hund saß vor seinem Besitzer und bettelte um Essen.', 2),

-- bredvid (neben)
('Banken ligger ___ apoteket.',                     'bredvid', 'Die Bank liegt neben der Apotheke.',              1),
('Kan jag sitta ___ dig?',                          'bredvid', 'Kann ich neben dir sitzen?',                      1),
('Hunden sitter alltid ___ sin ägare.',             'bredvid', 'Der Hund sitzt immer neben seinem Besitzer.',     2),
('Han lade boken ___ koppen.',                      'bredvid', 'Er legte das Buch neben die Tasse.',              2),

-- mellan (zwischen)
('Bänken står ___ de två träden.',                  'mellan',  'Die Bank steht zwischen den zwei Bäumen.',        1),
('Det finns en park ___ biblioteket och museet.',   'mellan',  'Es gibt einen Park zwischen Bibliothek und Museum.', 2),
('Vad hände ___ er två?',                           'mellan',  'Was ist zwischen euch beiden passiert?',          3),

-- hos (bei jemandem)
('Han bor ___ sina föräldrar.',                     'hos',     'Er wohnt bei seinen Eltern.',                     1),
('Vi firar jul ___ farmor.',                        'hos',     'Wir feiern Weihnachten bei Oma.',                 1),
('Jag var ___ läkaren igår.',                       'hos',     'Ich war gestern beim Arzt.',                      2),
('Katten trivs ___ oss.',                           'hos',     'Die Katze fühlt sich bei uns wohl.',              2),
('Hunden är kvar ___ grannen.',                     'hos',     'Der Hund ist beim Nachbarn geblieben.',           2),

-- genom (durch)
('Vi gick ___ parken.',                             'genom',   'Wir gingen durch den Park.',                      1),
('Tåget åker ___ tunneln.',                         'genom',   'Der Zug fährt durch den Tunnel.',                 1),
('Hon hittade jobbet ___ en vän.',                  'genom',   'Sie fand die Stelle durch eine Freundin.',        2),
('Ljuset strilar ___ fönstret.',                    'genom',   'Das Licht fällt durch das Fenster.',              2),

-- utanför (außerhalb, vor der Tür)
('Det stod en katt ___ dörren.',                    'utanför', 'Eine Katze stand vor der Tür.',                   1),
('Han bor ___ staden.',                             'utanför', 'Er wohnt außerhalb der Stadt.',                   2),
('Det är kallt ___ idag.',                          'utanför', 'Es ist heute draußen kalt.',                      1),
('Inga hundar är tillåtna ___ butiken.',            'utanför', 'Keine Hunde sind außerhalb des Ladens erlaubt.',  2),

-- längs (entlang)
('Vi promenerade ___ flodstranden.',                'längs',   'Wir spazierten am Flussufer entlang.',            2),
('Det finns träd ___ hela vägen.',                  'längs',   'Es gibt Bäume die ganze Straße entlang.',         2),
('De cyklade ___ kusten.',                          'längs',   'Sie radelten entlang der Küste.',                 2);


-- ============================================================
-- Neue Kategorisierungskategorien + Begriffe
-- Jede Kategorie wird einzeln eingefügt und die ID per
-- LAST_INSERT_ID() in eine Variable gespeichert.
-- ============================================================

-- över
INSERT INTO praep_kategorien (name, praeposition, merksatz, merksatz_uebersetzung, reihenfolge)
VALUES ('Lage: oberhalb', 'över', 'Über/oberhalb von etwas → över (lampan hänger över bordet)', 'Ovanpå/ovanför något → över (lampan hänger över bordet)', 110);
SET @kat_over = LAST_INSERT_ID();
INSERT INTO praep_kategorie_begriffe (kategorie_id, schwedisch, deutsch, beispielsatz) VALUES
(@kat_over, 'bordet',      'Tisch',    'Lampan hänger över bordet.'),
(@kat_over, 'floden',      'Fluss',    'Bron leder över floden.'),
(@kat_over, 'himlen',      'Himmel',   'Fåglarna flyger över himlen.'),
(@kat_over, 'noll grader', 'null Grad','Temperaturen stiger över noll grader.'),
(@kat_over, 'stolen',      'Stuhl',    'Han lade jackan över stolen.'),
(@kat_over, 'staketet',    'Zaun',     'Bollen flög över staketet.');

-- under
INSERT INTO praep_kategorien (name, praeposition, merksatz, merksatz_uebersetzung, reihenfolge)
VALUES ('Lage: unterhalb', 'under', 'Unter/unterhalb von etwas → under (katten sover under sängen)', 'Under/nedanför något → under (katten sover under sängen)', 120);
SET @kat_under = LAST_INSERT_ID();
INSERT INTO praep_kategorie_begriffe (kategorie_id, schwedisch, deutsch, beispielsatz) VALUES
(@kat_under, 'sängen',      'Bett',     'Katten sover under sängen.'),
(@kat_under, 'mattan',      'Teppich',  'Nyckeln låg under mattan.'),
(@kat_under, 'trädet',      'Baum',     'Vi fikade under trädet.'),
(@kat_under, 'bordet',      'Tisch',    'Barnen gömde sig under bordet.'),
(@kat_under, 'noll grader', 'null Grad','Temperaturen sjunker under noll.'),
(@kat_under, 'bron',        'Brücke',   'Båten åker under bron.');

-- bakom
INSERT INTO praep_kategorien (name, praeposition, merksatz, merksatz_uebersetzung, reihenfolge)
VALUES ('Lage: dahinter', 'bakom', 'Hinter etwas → bakom (bilen är bakom huset)', 'Bakom något → bakom (bilen är bakom huset)', 130);
SET @kat_bakom = LAST_INSERT_ID();
INSERT INTO praep_kategorie_begriffe (kategorie_id, schwedisch, deutsch, beispielsatz) VALUES
(@kat_bakom, 'huset',    'Haus',     'Bilen är parkerad bakom huset.'),
(@kat_bakom, 'soffan',   'Sofa',     'Hunden gömmer sig bakom soffan.'),
(@kat_bakom, 'skogen',   'Wald',     'Det finns en sjö bakom skogen.'),
(@kat_bakom, 'dörren',   'Tür',      'Hon väntade bakom dörren.'),
(@kat_bakom, 'kulissen', 'Kulissen', 'Skådespelarna väntade bakom kulissen.');

-- framför
INSERT INTO praep_kategorien (name, praeposition, merksatz, merksatz_uebersetzung, reihenfolge)
VALUES ('Lage: davor', 'framför', 'Vor etwas → framför (bussen stannar framför skolan)', 'Framför något → framför (bussen stannar framför skolan)', 140);
SET @kat_framfor = LAST_INSERT_ID();
INSERT INTO praep_kategorie_begriffe (kategorie_id, schwedisch, deutsch, beispielsatz) VALUES
(@kat_framfor, 'skolan',  'Schule',     'Bussen stannar framför skolan.'),
(@kat_framfor, 'spegeln', 'Spiegel',    'Hon stannade framför spegeln.'),
(@kat_framfor, 'affären', 'Laden',      'Det köar folk framför affären.'),
(@kat_framfor, 'tv:n',    'Fernseher',  'Barnen sitter framför tv:n.'),
(@kat_framfor, 'publik',  'Publikum',   'Han sjunger framför stor publik.');

-- bredvid
INSERT INTO praep_kategorien (name, praeposition, merksatz, merksatz_uebersetzung, reihenfolge)
VALUES ('Lage: daneben', 'bredvid', 'Neben etwas/jemandem → bredvid (sitta bredvid dig)', 'Bredvid något/någon → bredvid (sitta bredvid dig)', 150);
SET @kat_bredvid = LAST_INSERT_ID();
INSERT INTO praep_kategorie_begriffe (kategorie_id, schwedisch, deutsch, beispielsatz) VALUES
(@kat_bredvid, 'dig',       'dir/dich',        'Kan jag sitta bredvid dig?'),
(@kat_bredvid, 'apoteket',  'Apotheke',        'Banken ligger bredvid apoteket.'),
(@kat_bredvid, 'sin ägare', 'seinem Besitzer', 'Hunden sitter bredvid sin ägare.'),
(@kat_bredvid, 'sängen',    'Bett',            'Han lade boken bredvid sängen.'),
(@kat_bredvid, 'dörren',    'Tür',             'Det stod ett paraply bredvid dörren.');

-- mellan
INSERT INTO praep_kategorien (name, praeposition, merksatz, merksatz_uebersetzung, reihenfolge)
VALUES ('Lage: dazwischen', 'mellan', 'Zwischen zwei Dingen → mellan (parken mellan biblioteket och museet)', 'Mellan två saker → mellan (parken mellan biblioteket och museet)', 160);
SET @kat_mellan = LAST_INSERT_ID();
INSERT INTO praep_kategorie_begriffe (kategorie_id, schwedisch, deutsch, beispielsatz) VALUES
(@kat_mellan, 'träden',                  'Bäumen',               'Bänken står mellan de två träden.'),
(@kat_mellan, 'biblioteket och museet',  'Bibliothek und Museum','Det finns en park mellan biblioteket och museet.'),
(@kat_mellan, 'Sverige och Norge',       'Schweden und Norwegen','Gränsen går mellan Sverige och Norge.'),
(@kat_mellan, 'oss',                     'uns',                  'Det är en hemlighet mellan oss.'),
(@kat_mellan, 'klockan 8 och 9',         '8 und 9 Uhr',          'Mötet är mellan klockan 8 och 9.');

-- hos
INSERT INTO praep_kategorien (name, praeposition, merksatz, merksatz_uebersetzung, reihenfolge)
VALUES ('Bei jemandem (hos)', 'hos', 'Bei jemandem sein/wohnen → hos (bo hos sina föräldrar)', 'Vara/bo hos någon → hos (bo hos sina föräldrar)', 170);
SET @kat_hos = LAST_INSERT_ID();
INSERT INTO praep_kategorie_begriffe (kategorie_id, schwedisch, deutsch, beispielsatz) VALUES
(@kat_hos, 'sina föräldrar', 'seinen Eltern', 'Han bor hos sina föräldrar.'),
(@kat_hos, 'farmor',         'Oma',           'Vi firar jul hos farmor.'),
(@kat_hos, 'läkaren',        'Arzt',          'Jag var hos läkaren igår.'),
(@kat_hos, 'grannen',        'Nachbarn',      'Hunden är kvar hos grannen.'),
(@kat_hos, 'frisören',       'Friseur',       'Hon är hos frisören just nu.'),
(@kat_hos, 'oss',            'uns',           'Katten trivs bra hos oss.');

-- genom
INSERT INTO praep_kategorien (name, praeposition, merksatz, merksatz_uebersetzung, reihenfolge)
VALUES ('Bewegung: durch', 'genom', 'Durch etwas hindurch → genom (gå genom parken)', 'Röra sig igenom något → genom (gå genom parken)', 180);
SET @kat_genom = LAST_INSERT_ID();
INSERT INTO praep_kategorie_begriffe (kategorie_id, schwedisch, deutsch, beispielsatz) VALUES
(@kat_genom, 'parken',   'Park',           'Vi gick genom parken.'),
(@kat_genom, 'tunneln',  'Tunnel',         'Tåget åker genom tunneln.'),
(@kat_genom, 'fönstret', 'Fenster',        'Ljuset strilar genom fönstret.'),
(@kat_genom, 'skogen',   'Wald',           'Stigen löper genom skogen.'),
(@kat_genom, 'en vän',   'eine Freundin',  'Hon hittade jobbet genom en vän.');
