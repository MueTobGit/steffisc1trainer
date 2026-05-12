-- ============================================================
-- Präpositions-Überarbeitung v3 — Ausgewogene Datenbasis
--
-- Problem vor v3: på 49 %, i 21 % → zusammen 70 % aller Chunks.
--   till 2×, från 1×, für 1×, per/ur/enligt/tills 0×.
--
-- Schritt 1: 30 triviale/redundante på-i-Chunks deaktivieren
-- Schritt 2: ~80 neue Chunks in 6 semantischen Gruppen
--            (Richtung, Temporal, Modal, Kausal, feste Verb-Fügungen,
--             feste Adjektiv-Fügungen)
-- Schritt 3: 8 neue Kategorisierungskategorien
--            (Verb+på, Verb+om, Verb+efter, Adj+för, Adj+av,
--             Adj+över, Temporal-Dauer, Temporal-Zukunft)
--
-- Ausführen NACH migration_praepositionen.sql (und ggf. v2).
-- ============================================================


-- ============================================================
-- SCHRITT 1: Triviale/redundante Chunks deaktivieren
-- ============================================================

UPDATE praep_chunks SET aktiv = 0 WHERE schwedisch IN (
    -- Schule — zu trivial, zu dicht
    'Läraren skriver ___ tavlan.',
    'Eleverna sitter ___ klassrummet.',
    'Vi har lektion ___ skolan.',
    'Boken är ___ min väska.',
    'Barnen leker ___ skolgården.',
    -- Arbeit — trivial
    'Han jobbar ___ ett kontor.',
    'Vi har möte ___ måndag.',
    'Chefen är ___ ett möte.',
    'Hon dricker kaffe ___ rasten.',
    -- Verkehr — trivial
    'Han somnade ___ tåget.',
    'Det är trångt ___ bilen.',
    'Hon åker alltid ___ cykeln.',
    -- Öffentliche Orte — trivial
    'Vi handlar mat ___ affären.',
    'Han tar ut pengar ___ banken.',
    'Jag lånar böcker ___ biblioteket.',
    'De dricker kaffe ___ caféet.',
    -- Zu Hause — trivial
    'Vi äter frukost ___ köket.',
    'Han sover ___ sovrummet.',
    'Hon badar ___ badrummet.',
    'Kläderna hänger ___ garderoberna.',
    'Katten sover ___ soffan.',
    'Barnen leker ___ trädgården.',
    -- Geografie — trivial
    'Vi bor ___ Sverige.',
    'Han studerar ___ Stockholm.',
    'Han bor ___ Malmö.',
    -- Zeitangaben — Duplikate
    'Vi träffas ___ måndag.',
    'Vi ses ___ fredag.',
    'Han ringer alltid ___ morgonen.',
    'Det är lugnt ___ helgen.',
    -- Abstrakt — trivial
    'Han pratar ___ svenska.'
);


-- ============================================================
-- SCHRITT 2: Neue ausgewogene Chunks
-- Ziel-Verteilung nach v3 (alle Dateien kumuliert):
--   på ~13 % | i ~10 % | till/från/av/med je ~7 % |
--   om/under/over je ~6 % | übrige je 2–4 %
-- ============================================================

INSERT INTO praep_chunks (schwedisch, loesung, deutsche_uebersetzung, schwierigkeitsgrad) VALUES


-- ============================================================
-- A) RICHTUNG: till — Bewegung zum Ziel (fehlt fast komplett)
-- ============================================================
('Vi åker ___ Stockholm imorgon.',                'till',   'Wir fahren morgen nach Stockholm.',                       1),
('Hon ska resa ___ Spanien i sommar.',            'till',   'Sie reist diesen Sommer nach Spanien.',                   1),
('Ge boken ___ din syster.',                      'till',   'Gib das Buch deiner Schwester.',                          1),
('Han sprang ___ busshållplatsen.',               'till',   'Er rannte zur Bushaltestelle.',                           2),
('Tåget ___ Göteborg avgår om tio minuter.',      'till',   'Der Zug nach Göteborg fährt in zehn Minuten ab.',         2),
('Vi är inbjudna ___ ett bröllop.',               'till',   'Wir sind zu einer Hochzeit eingeladen.',                  2),
('Jag ska lämna in ansökan ___ chefen.',          'till',   'Ich gebe den Antrag beim Chef ab.',                       2),
('Det är långt ___ närmaste sjukhuset.',          'till',   'Es ist weit bis zum nächsten Krankenhaus.',               2),
('Kan du komma ___ kontoret på måndag?',          'till',   'Kannst du am Montag ins Büro kommen?',                    3),


-- ============================================================
-- B) RICHTUNG: från — Bewegung vom Ausgangspunkt
-- ============================================================
('Hon kom ___ Finland förra veckan.',             'från',   'Sie kam letzte Woche aus Finnland.',                      1),
('De hämtade barnen ___ skolan.',                 'från',   'Sie holten die Kinder von der Schule ab.',                1),
('Han kommer egentligen ___ Göteborg.',           'från',   'Er kommt eigentlich aus Göteborg.',                       1),
('Tåget avgår ___ Stockholm klockan nio.',        'från',   'Der Zug fährt um neun Uhr von Stockholm ab.',             2),
('Jag hörde nyheten ___ en kollega.',             'från',   'Ich hörde die Neuigkeit von einem Kollegen.',             2),
('Vi åker hem ___ semestern imorgon.',            'från',   'Wir fahren morgen vom Urlaub nach Hause.',                2),
('De skiljer sig ___ varandra i smaken.',         'från',   'Sie unterscheiden sich im Geschmack voneinander.',        3),
('Hon flydde ___ det farliga landet.',            'från',   'Sie floh aus dem gefährlichen Land.',                     3),


-- ============================================================
-- C) RICHTUNG: ur — heraus aus einem Innenraum
-- ============================================================
('Han drog ut nyckeln ___ låset.',                'ur',     'Er zog den Schlüssel aus dem Schloss.',                   2),
('Hon plockade ett äpple ___ korgen.',            'ur',     'Sie pflückte einen Apfel aus dem Korb.',                  2),
('Katten hoppade ___ fönstret.',                  'ur',     'Die Katze sprang aus dem Fenster.',                       2),
('Han tog fram plånboken ___ fickan.',            'ur',     'Er holte die Brieftasche aus der Tasche.',                2),
('Hon hällde upp vatten ___ flaskan.',            'ur',     'Sie goss Wasser aus der Flasche.',                        3),


-- ============================================================
-- D) TEMPORAL: om — in X Zeit (Zukunftsperspektive)
-- ============================================================
('Tåget avgår ___ tio minuter.',                  'om',     'Der Zug fährt in zehn Minuten ab.',                       1),
('Vi ses ___ en timme.',                          'om',     'Wir sehen uns in einer Stunde.',                          1),
('___ några dagar är det semester.',              'Om',     'In ein paar Tagen ist Urlaub.',                           1),
('Ring mig ___ en halvtimme!',                    'om',     'Ruf mich in einer halben Stunde an!',                     2),
('Projektet är klart ___ två veckor.',            'om',     'Das Projekt ist in zwei Wochen fertig.',                  2),


-- ============================================================
-- E) TEMPORAL: tills — bis zu einem Zeitpunkt
-- ============================================================
('Vänta ___ jag kommer tillbaka.',                'tills',  'Warte, bis ich zurückkomme.',                             1),
('Vi stannar ___ regnet slutar.',                 'tills',  'Wir bleiben, bis der Regen aufhört.',                     2),
('Hon jobbade ___ det var mörkt ute.',            'tills',  'Sie arbeitete, bis es draußen dunkel war.',               3),


-- ============================================================
-- F) TEMPORAL: under — während / im gesamten Verlauf von
-- ============================================================
('Vi reste mycket ___ sommaren.',                 'under',  'Wir reisten viel während des Sommers.',                   2),
('Han studerade hårt ___ hela terminen.',         'under',  'Er lernte das gesamte Semester lang hart.',               2),
('Det regnade ___ hela utflykten.',               'under',  'Es regnete während des gesamten Ausflugs.',               2),
('___ mötet pratade vi om budgeten.',             'Under',  'Während des Meetings sprachen wir über das Budget.',      2),


-- ============================================================
-- G) TEMPORAL: för … sedan — vor X Zeit (Vergangenheit)
-- ============================================================
('Det hände ___ tre år sedan.',                   'för',    'Es passierte vor drei Jahren.',                           1),
('Vi träffades ___ länge sedan.',                 'för',    'Wir begegneten uns vor langer Zeit.',                     1),
('___ en vecka sedan kom hon tillbaka.',          'För',    'Vor einer Woche kam sie zurück.',                         2),
('Han fick jobbet ___ precis tre månader sedan.', 'för',    'Er bekam den Job vor genau drei Monaten.',               2),


-- ============================================================
-- H) MODAL: med — Instrument, Mittel, Begleitung
-- ============================================================
('Jag betalar ___ kort.',                         'med',    'Ich bezahle mit Karte.',                                  1),
('Hon skriver alltid ___ penna.',                 'med',    'Sie schreibt immer mit Stift.',                           1),
('Han kom ___ sin hund till parken.',             'med',    'Er kam mit seinem Hund zum Park.',                        1),
('Hon tvättade händerna ___ tvål och vatten.',    'med',    'Sie wusch sich die Hände mit Seife und Wasser.',          1),
('De löste problemet ___ hjälp av en expert.',    'med',    'Sie lösten das Problem mithilfe eines Experten.',         2),
('Vi firar ___ champagne och god mat.',           'med',    'Wir feiern mit Champagner und gutem Essen.',              2),


-- ============================================================
-- I) MODAL: utan — ohne
-- ============================================================
('Kan du leva ___ internet?',                     'utan',   'Kannst du ohne Internet leben?',                          1),
('Han åker aldrig motorcykel ___ hjälm.',         'utan',   'Er fährt nie Motorrad ohne Helm.',                        1),
('Hon klarar sig alltid ___ hjälp.',              'utan',   'Sie kommt immer ohne Hilfe aus.',                         2),
('Mötet hölls ___ mig.',                          'utan',   'Das Meeting fand ohne mich statt.',                       2),
('Vi reste ___ att boka i förväg.',               'utan',   'Wir reisten, ohne vorher zu buchen.',                     3),


-- ============================================================
-- J) MODAL: per — pro / je Einheit
-- ============================================================
('Det kostar 200 kronor ___ natt.',               'per',    'Es kostet 200 Kronen pro Nacht.',                         1),
('Tåget går en gång ___ timme.',                  'per',    'Der Zug fährt einmal pro Stunde.',                        1),
('Han tar medicinen två gånger ___ dag.',         'per',    'Er nimmt das Medikament zweimal täglich.',                2),
('Parkeringen kostar 30 kronor ___ timme.',       'per',    'Das Parken kostet 30 Kronen pro Stunde.',                 2),
('Det kostar 50 kronor ___ person.',              'per',    'Es kostet 50 Kronen pro Person.',                         2),


-- ============================================================
-- K) MODAL: enligt — laut / gemäß einer Quelle
-- ============================================================
('___ mig är svaret fel.',                        'Enligt', 'Meiner Meinung nach ist die Antwort falsch.',             2),
('___ lagen är det förbjudet att röka här.',      'Enligt', 'Dem Gesetz nach ist das Rauchen hier verboten.',          2),
('___ rapporten ökade försäljningen med 20 %.',   'Enligt', 'Laut dem Bericht stieg der Umsatz um 20 %.',             3),
('___ experten är situationen allvarlig.',        'Enligt', 'Laut dem Experten ist die Lage ernst.',                   3),


-- ============================================================
-- L) KAUSAL: av — Ursache (Emotion, Reflex) und Material
-- ============================================================
('Han darrade ___ kyla.',                         'av',     'Er zitterte vor Kälte.',                                  2),
('Barnen skrattade ___ glädje.',                  'av',     'Die Kinder lachten vor Freude.',                          2),
('Hon grät ___ sorg.',                            'av',     'Sie weinte vor Trauer.',                                  2),
('Han hoppade ___ rädsla.',                       'av',     'Er sprang vor Schreck hoch.',                             2),
('Hon rodnade ___ skam.',                         'av',     'Sie errötete vor Scham.',                                 3),
('Bron är byggd ___ stål och betong.',            'av',     'Die Brücke ist aus Stahl und Beton gebaut.',              1),
('Kakan är gjord ___ mandel och socker.',         'av',     'Der Kuchen ist aus Mandeln und Zucker gemacht.',          1),


-- ============================================================
-- M) KAUSAL: för … skull — um … willen / sicherheitshalber
-- ============================================================
('___ barnens skull stannade de hemma.',          'För',    'Um der Kinder willen blieben sie zu Hause.',              2),
('Gör det ___ min skull, tack!',                  'för',    'Tu es meinetwegen, bitte!',                               2),
('___ säkerhets skull tar vi en extra kopia.',    'För',    'Sicherheitshalber nehmen wir eine Extrakopie.',           3),


-- ============================================================
-- N) FESTE VERB-PRÄPOSITION-FÜGUNGEN
--    (ergänzt bestehende; Fokus auf häufige Muster)
-- ============================================================
-- Verb + på
('Barnen lyssnar inte ___ läraren.',              'på',     'Die Kinder hören nicht auf den Lehrer.',                  1),
('Vi hoppas ___ bättre väder imorgon.',           'på',     'Wir hoffen auf besseres Wetter morgen.',                  2),
('Hon litar alltid ___ sina instinkter.',         'på',     'Sie vertraut immer ihren Instinkten.',                    2),
('Jag klagade ___ maten på restaurangen.',        'på',     'Ich beschwerte mich über das Essen im Restaurant.',       2),
('Vi satsar ___ förnybar energi.',                'på',     'Wir setzen auf erneuerbare Energien.',                    3),
-- Verb + om
('Han drömmer ___ att bli pilot.',                'om',     'Er träumt davon, Pilot zu werden.',                       1),
('Vi diskuterar ___ klimatförändringar.',         'om',     'Wir diskutieren über den Klimawandel.',                   2),
('Han bryr sig inte ___ vad andra tycker.',       'om',     'Es ist ihm egal, was andere denken.',                     2),
('Vi påminde honom ___ mötet.',                   'om',     'Wir erinnerten ihn an das Meeting.',                      2),
('Han ber ___ ursäkt för förseningen.',           'om',     'Er entschuldigt sich für die Verspätung.',                2),
-- Verb + efter
('Hon letar ___ sina nycklar i väskan.',          'efter',  'Sie sucht in ihrer Tasche nach ihren Schlüsseln.',        1),
('Vi längtade ___ att komma hem.',                'efter',  'Wir sehnten uns danach, nach Hause zu kommen.',           2),
('Han sprang ___ hjälp.',                         'efter',  'Er rannte, um Hilfe zu holen.',                           2),


-- ============================================================
-- O) FESTE ADJEKTIV-PRÄPOSITION-FÜGUNGEN
-- ============================================================
-- Adj + för
('Jag är rädd ___ spindlar.',                     'för',    'Ich habe Angst vor Spinnen.',                             1),
('Hon är ansvarig ___ hela projektet.',           'för',    'Sie ist für das gesamte Projekt verantwortlich.',         2),
('Sverige är känt ___ sina möbler.',              'för',    'Schweden ist bekannt für seine Möbel.',                   2),
('Vi är tacksamma ___ din hjälp.',                'för',    'Wir sind dankbar für deine Hilfe.',                       2),
-- Adj + av
('Han är intresserad ___ historia.',              'av',     'Er ist an Geschichte interessiert.',                      1),
('Hon är beroende ___ kaffe på morgnarna.',       'av',     'Sie ist morgens auf Kaffee angewiesen.',                  2),
('Vi var imponerade ___ föreställningen.',        'av',     'Wir waren von der Vorstellung beeindruckt.',              2),
('Han är övertygad ___ sin teori.',              'av',     'Er ist von seiner Theorie überzeugt.',                    2),
-- Adj + över
('Hon är stolt ___ sina barn.',                   'över',   'Sie ist stolz auf ihre Kinder.',                          2),
('Jag är förvånad ___ ditt svar.',                'över',   'Ich bin überrascht von deiner Antwort.',                  2),
('Vi var glada ___ det goda resultatet.',         'över',   'Wir freuten uns über das gute Ergebnis.',                 2),
('Han var besviken ___ betyget.',                 'över',   'Er war von der Note enttäuscht.',                         2),
-- Adj + med
('Jag är nöjd ___ mitt arbete.',                  'med',    'Ich bin mit meiner Arbeit zufrieden.',                    2),
('Hon är bekant ___ situationen.',                'med',    'Sie ist mit der Situation vertraut.',                      3);


-- ============================================================
-- SCHRITT 3: Neue Kategorisierungskategorien (8 Stück)
-- Alle IDs via LAST_INSERT_ID() — keine Hardcodes.
-- ============================================================


-- -------------------------------------------------------
-- Kat 1: Verb + på  (Aufmerksamkeit / Erwartung)
-- -------------------------------------------------------
INSERT INTO praep_kategorien (name, praeposition, merksatz, merksatz_uebersetzung, reihenfolge)
VALUES (
    'Verb + på (Aufmerksamkeit/Erwartung)',
    'på',
    'Verben der Aufmerksamkeit und Erwartung → på: vänta på, lyssna på, titta på, hoppas på, lita på, klaga på',
    'Verb för uppmärksamhet och förväntan → på: vänta på, lyssna på, titta på, hoppas på, lita på, klaga på',
    200
);
SET @kat_vb_pa = LAST_INSERT_ID();
INSERT INTO praep_kategorie_begriffe (kategorie_id, schwedisch, deutsch, beispielsatz) VALUES
(@kat_vb_pa, 'vänta',    'warten auf',                 'Vi väntar på bussen.'),
(@kat_vb_pa, 'lyssna',   'zuhören / hören auf',        'Barnen lyssnar på läraren.'),
(@kat_vb_pa, 'titta',    'schauen / ansehen',          'Vi tittar på en film.'),
(@kat_vb_pa, 'hoppas',   'hoffen auf',                 'Vi hoppas på bättre väder.'),
(@kat_vb_pa, 'lita',     'vertrauen auf',              'Jag litar på dig.'),
(@kat_vb_pa, 'klaga',    'sich beschweren über',       'Han klagade på maten.'),
(@kat_vb_pa, 'satsa',    'setzen auf / investieren in','Vi satsar på förnybar energi.'),
(@kat_vb_pa, 'tänka',    'denken an',                  'Hon tänker på sina barn.'),
(@kat_vb_pa, 'hälsa',    'grüßen',                     'Han hälsar alltid på sina grannar.');


-- -------------------------------------------------------
-- Kat 2: Verb + om  (Kommunikation / Gedanken)
-- -------------------------------------------------------
INSERT INTO praep_kategorien (name, praeposition, merksatz, merksatz_uebersetzung, reihenfolge)
VALUES (
    'Verb + om (Kommunikation/Gedanken)',
    'om',
    'Verben der Kommunikation und des Denkens → om: prata om, drömma om, handla om, diskutera om, bry sig om, be om',
    'Verb för kommunikation och tankar → om: prata om, drömma om, handla om, diskutera om, bry sig om, be om',
    210
);
SET @kat_vb_om = LAST_INSERT_ID();
INSERT INTO praep_kategorie_begriffe (kategorie_id, schwedisch, deutsch, beispielsatz) VALUES
(@kat_vb_om, 'prata',     'reden über',                'Vi pratar om framtiden.'),
(@kat_vb_om, 'drömma',    'träumen von',               'Han drömmer om att bli pilot.'),
(@kat_vb_om, 'handla',    'handeln von',               'Boken handlar om en ung flicka.'),
(@kat_vb_om, 'diskutera', 'diskutieren über',          'De diskuterar om klimatförändringar.'),
(@kat_vb_om, 'bry sig',   'sich kümmern um',           'Hon bryr sig om sina vänner.'),
(@kat_vb_om, 'påminna',   'erinnern an',               'Han påminde mig om mötet.'),
(@kat_vb_om, 'be',        'bitten um',                 'Han ber om ursäkt.'),
(@kat_vb_om, 'skämta',    'scherzen über',             'Vi skämtade om det hela kvällen.'),
(@kat_vb_om, 'tycka',     'mögen / gerne haben (tycka om)', 'Jag tycker om att läsa.');


-- -------------------------------------------------------
-- Kat 3: Verb + efter  (Suche / Sehnsucht)
-- -------------------------------------------------------
INSERT INTO praep_kategorien (name, praeposition, merksatz, merksatz_uebersetzung, reihenfolge)
VALUES (
    'Verb + efter (Suche/Sehnsucht)',
    'efter',
    'Verben der Suche und Sehnsucht → efter: letar efter, längtar efter, frågar efter, strävar efter',
    'Verb för sökande och längtan → efter: letar efter, längtar efter, frågar efter, strävar efter',
    220
);
SET @kat_vb_efter = LAST_INSERT_ID();
INSERT INTO praep_kategorie_begriffe (kategorie_id, schwedisch, deutsch, beispielsatz) VALUES
(@kat_vb_efter, 'letar',    'suchen nach',             'Hon letar efter sina nycklar.'),
(@kat_vb_efter, 'längtar',  'sich sehnen nach',        'Vi längtar efter semestern.'),
(@kat_vb_efter, 'frågar',   'fragen nach',             'Barnen frågar efter sin mamma.'),
(@kat_vb_efter, 'strävar',  'streben nach',            'Hon strävar efter perfektion.'),
(@kat_vb_efter, 'springer', 'laufen um Hilfe',         'Han sprang efter hjälp.'),
(@kat_vb_efter, 'söker',    'suchen nach',             'Polisen söker efter brottslingen.');


-- -------------------------------------------------------
-- Kat 4: Adjektiv + för  (Verantwortung / Gefühl für)
-- -------------------------------------------------------
INSERT INTO praep_kategorien (name, praeposition, merksatz, merksatz_uebersetzung, reihenfolge)
VALUES (
    'Adjektiv + för',
    'för',
    'Adjektive mit fester Präposition för: rädd för, ansvarig för, känd för, viktig för, tacksam för, glad för',
    'Adjektiv med fast preposition för: rädd för, ansvarig för, känd för, viktig för, tacksam för, glad för',
    230
);
SET @kat_adj_for = LAST_INSERT_ID();
INSERT INTO praep_kategorie_begriffe (kategorie_id, schwedisch, deutsch, beispielsatz) VALUES
(@kat_adj_for, 'rädd',      'Angst haben vor / ängstlich',  'Jag är rädd för spindlar.'),
(@kat_adj_for, 'ansvarig',  'verantwortlich',               'Hon är ansvarig för projektet.'),
(@kat_adj_for, 'känd',      'bekannt',                      'Sverige är känt för sin natur.'),
(@kat_adj_for, 'viktig',    'wichtig',                      'Det är viktigt för din hälsa.'),
(@kat_adj_for, 'tacksam',   'dankbar',                      'Vi är tacksamma för din hjälp.'),
(@kat_adj_for, 'glad',      'froh / erleichtert',           'Han är glad för nyheten.');


-- -------------------------------------------------------
-- Kat 5: Adjektiv + av  (Ursache / Herkunft / Abhängigkeit)
-- -------------------------------------------------------
INSERT INTO praep_kategorien (name, praeposition, merksatz, merksatz_uebersetzung, reihenfolge)
VALUES (
    'Adjektiv + av',
    'av',
    'Adjektive mit fester Präposition av: intresserad av, beroende av, imponerad av, övertygad av, gjord av',
    'Adjektiv med fast preposition av: intresserad av, beroende av, imponerad av, övertygad av, gjord av',
    240
);
SET @kat_adj_av = LAST_INSERT_ID();
INSERT INTO praep_kategorie_begriffe (kategorie_id, schwedisch, deutsch, beispielsatz) VALUES
(@kat_adj_av, 'intresserad',  'interessiert an',           'Han är intresserad av historia.'),
(@kat_adj_av, 'beroende',     'abhängig von',              'Hon är beroende av kaffe.'),
(@kat_adj_av, 'imponerad',    'beeindruckt von',           'Vi var imponerade av föreställningen.'),
(@kat_adj_av, 'övertygad',    'überzeugt von',             'Han är övertygad av sin teori.'),
(@kat_adj_av, 'gjord',        'gemacht aus',               'Stolen är gjord av trä.'),
(@kat_adj_av, 'trött',        'erschöpft von (körperlich; ≠ trött PÅ = es leid sein)', 'Hon är trött av allt jobbande.');


-- -------------------------------------------------------
-- Kat 6: Adjektiv + över  (emotionale Reaktion)
-- -------------------------------------------------------
INSERT INTO praep_kategorien (name, praeposition, merksatz, merksatz_uebersetzung, reihenfolge)
VALUES (
    'Adjektiv + över (emotionale Reaktion)',
    'över',
    'Adjektive für emotionale Reaktion → över: stolt över, förvånad över, glad över, ledsen över, besviken över',
    'Adjektiv för känslomässig reaktion → över: stolt över, förvånad över, glad över, ledsen över, besviken över',
    250
);
SET @kat_adj_over = LAST_INSERT_ID();
INSERT INTO praep_kategorie_begriffe (kategorie_id, schwedisch, deutsch, beispielsatz) VALUES
(@kat_adj_over, 'stolt',      'stolz',              'Hon är stolt över sina barn.'),
(@kat_adj_over, 'förvånad',   'überrascht',         'Jag är förvånad över resultatet.'),
(@kat_adj_over, 'glad',       'erfreut / froh',     'Vi är glada över nyheten.'),
(@kat_adj_over, 'ledsen',     'traurig',            'Han är ledsen över misstaget.'),
(@kat_adj_over, 'besviken',   'enttäuscht',         'Hon var besviken över betyget.'),
(@kat_adj_over, 'bekymrad',   'besorgt',            'Vi är bekymrade över situationen.');


-- -------------------------------------------------------
-- Kat 7: Temporal — Zeitdauer (Wie lange?) → i
-- -------------------------------------------------------
INSERT INTO praep_kategorien (name, praeposition, merksatz, merksatz_uebersetzung, reihenfolge)
VALUES (
    'Temporal: Zeitdauer (wie lange?) → i',
    'i',
    'Wie lange? Zeitdauer → i: i tre timmar, i en vecka, i ett år, i hela dagen',
    'Hur länge? Tidslängd → i: i tre timmar, i en vecka, i ett år, i hela dagen',
    260
);
SET @kat_temp_i = LAST_INSERT_ID();
INSERT INTO praep_kategorie_begriffe (kategorie_id, schwedisch, deutsch, beispielsatz) VALUES
(@kat_temp_i, 'tre timmar',   'drei Stunden',    'Vi väntade i tre timmar på stationen.'),
(@kat_temp_i, 'en vecka',     'eine Woche',      'Han är sjuk i en vecka.'),
(@kat_temp_i, 'ett år',       'ein Jahr',        'Vi har bott här i ett år.'),
(@kat_temp_i, 'hela dagen',   'den ganzen Tag',  'Hon jobbade i hela dagen utan paus.'),
(@kat_temp_i, 'månader',      'Monate lang',     'Det har regnat i månader.');


-- -------------------------------------------------------
-- Kat 8: Temporal — In X Zeit (Zukunft) → om
-- -------------------------------------------------------
INSERT INTO praep_kategorien (name, praeposition, merksatz, merksatz_uebersetzung, reihenfolge)
VALUES (
    'Temporal: in X Zeit (Zukunft) → om',
    'om',
    'In wie viel Zeit? Zukünftig → om: om en timme, om tre dagar, om ett år',
    'Om hur lång tid? Framtid → om: om en timme, om tre dagar, om ett år',
    270
);
SET @kat_temp_om = LAST_INSERT_ID();
INSERT INTO praep_kategorie_begriffe (kategorie_id, schwedisch, deutsch, beispielsatz) VALUES
(@kat_temp_om, 'en timme',       'einer Stunde',     'Mötet börjar om en timme.'),
(@kat_temp_om, 'tre dagar',      'drei Tagen',       'Vi reser om tre dagar.'),
(@kat_temp_om, 'en vecka',       'einer Woche',      'Projektet är klart om en vecka.'),
(@kat_temp_om, 'en månad',       'einem Monat',      'Han slutar jobbet om en månad.'),
(@kat_temp_om, 'några minuter',  'einigen Minuten',  'Tåget avgår om några minuter.');
