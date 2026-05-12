-- ============================================================
-- Migration: Präpositionsmodul
-- Erstellt: 2026-05-04
-- Tabellen: praep_chunks, praep_kategorien, praep_kategorie_begriffe
-- Seed-Daten: ~85 Chunks, 10 Kategorien, ~75 Begriffe
-- Kompatibel mit: MariaDB 10.4+, MySQL 8.0+
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- Tabellen anlegen
-- ============================================================

CREATE TABLE IF NOT EXISTS praep_chunks (
    id                    INT          NOT NULL AUTO_INCREMENT,
    schwedisch            VARCHAR(500) NOT NULL COMMENT 'Satz mit ___ als Lücke',
    loesung               VARCHAR(50)  NOT NULL COMMENT 'Korrekte Präposition',
    korrekte_alternativen JSON                  COMMENT 'Weitere akzeptierte Antworten (JSON-Array)',
    deutsche_uebersetzung VARCHAR(500),
    schwierigkeitsgrad    TINYINT      NOT NULL DEFAULT 1 COMMENT '1=leicht, 2=mittel, 3=schwer',
    aktiv                 TINYINT      NOT NULL DEFAULT 1,
    erstellt_am           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS praep_kategorien (
    id                    INT          NOT NULL AUTO_INCREMENT,
    name                  VARCHAR(100) NOT NULL COMMENT 'z.B. Inseln & Halbinseln',
    praeposition          VARCHAR(20)  NOT NULL COMMENT 'z.B. på',
    merksatz              VARCHAR(500),
    merksatz_uebersetzung VARCHAR(500),
    reihenfolge           INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS praep_kategorie_begriffe (
    id           INT          NOT NULL AUTO_INCREMENT,
    kategorie_id INT          NOT NULL,
    schwedisch   VARCHAR(200) NOT NULL COMMENT 'z.B. Öland',
    deutsch      VARCHAR(200)          COMMENT 'z.B. Öland (Insel)',
    beispielsatz VARCHAR(500),
    aktiv        TINYINT      NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    CONSTRAINT fk_praep_begriff_kat FOREIGN KEY (kategorie_id)
        REFERENCES praep_kategorien (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Seed-Daten: Chunk-Sätze
-- ============================================================

INSERT INTO praep_chunks (schwedisch, loesung, deutsche_uebersetzung, schwierigkeitsgrad) VALUES

-- Schule (i / på)
('Läraren skriver ___ tavlan.', 'på', 'Die Lehrerin schreibt an die Tafel.', 1),
('Eleverna sitter ___ klassrummet.', 'i', 'Die Schüler sitzen im Klassenzimmer.', 1),
('Vi har lektion ___ skolan.', 'i', 'Wir haben Unterricht in der Schule.', 1),
('Boken är ___ min väska.', 'i', 'Das Buch ist in meiner Tasche.', 1),
('Barnen leker ___ skolgården.', 'på', 'Die Kinder spielen auf dem Schulhof.', 1),
('Vi ska ha prov ___ fredag.', 'på', 'Wir haben Freitag einen Test.', 2),
('Läraren pratar ___ svenska.', 'på', 'Die Lehrerin spricht auf Schwedisch.', 2),
('Det finns böcker ___ hyllorna.', 'på', 'Es gibt Bücher in den Regalen.', 1),
('Hon glömde sin penna ___ skolan.', 'i', 'Sie vergaß ihren Stift in der Schule.', 2),
('Klassen är ___ utflykt.', 'på', 'Die Klasse ist auf Ausflug.', 3),

-- Arbeit (på)
('Han jobbar ___ ett kontor.', 'på', 'Er arbeitet in einem Büro.', 1),
('Vi har möte ___ måndag.', 'på', 'Wir haben Montag ein Meeting.', 1),
('Chefen är ___ ett möte.', 'på', 'Der Chef ist in einem Meeting.', 1),
('Hon dricker kaffe ___ rasten.', 'på', 'Sie trinkt Kaffee in der Pause.', 1),
('Kontoret ligger ___ tredje våningen.', 'på', 'Das Büro liegt im dritten Stockwerk.', 2),

-- Verkehrsmittel (i / på / med)
('Vi åker ___ buss till skolan.', 'med', 'Wir fahren mit dem Bus zur Schule.', 1),
('Han somnade ___ tåget.', 'på', 'Er schlief im Zug ein.', 1),
('Det är trångt ___ bilen.', 'i', 'Es ist eng im Auto.', 1),
('Hon åker alltid ___ cykeln.', 'på', 'Sie fährt immer mit dem Fahrrad.', 1),
('Vi flyger ___ flyg till London.', 'med', 'Wir fliegen mit dem Flugzeug nach London.', 1),
('Barnen äter smörgåsar ___ bussen.', 'på', 'Die Kinder essen Brote im Bus.', 2),
('Han sitter framtill ___ motorcykeln.', 'på', 'Er sitzt vorne auf dem Motorrad.', 2),

-- Öffentliche Orte (i / på)
('Vi handlar mat ___ affären.', 'i', 'Wir kaufen Lebensmittel im Laden.', 1),
('Han tar ut pengar ___ banken.', 'på', 'Er hebt Geld bei der Bank ab.', 1),
('Hon är inlagd ___ sjukhuset.', 'på', 'Sie ist im Krankenhaus aufgenommen.', 2),
('Jag lånar böcker ___ biblioteket.', 'på', 'Ich leihe Bücher in der Bibliothek.', 1),
('Paketet är klart ___ posten.', 'på', 'Das Paket ist bei der Post fertig.', 1),
('Vi äter middag ___ restaurangen.', 'på', 'Wir essen Abendessen im Restaurant.', 1),
('De dricker kaffe ___ caféet.', 'på', 'Sie trinken Kaffee im Café.', 1),
('Familjen bor ___ hotellet.', 'på', 'Die Familie wohnt im Hotel.', 1),
('Vi ser en utställning ___ museet.', 'på', 'Wir sehen eine Ausstellung im Museum.', 2),
('Föreställningen är ___ teatern.', 'på', 'Die Vorstellung ist im Theater.', 2),

-- Zu Hause (i / på / vid)
('Vi äter frukost ___ köket.', 'i', 'Wir essen Frühstück in der Küche.', 1),
('Han sover ___ sovrummet.', 'i', 'Er schläft im Schlafzimmer.', 1),
('Hon badar ___ badrummet.', 'i', 'Sie badet im Badezimmer.', 1),
('Kläderna hänger ___ garderoberna.', 'i', 'Die Kleidung hängt im Schrank.', 1),
('Katten sover ___ soffan.', 'på', 'Die Katze schläft auf dem Sofa.', 1),
('Vi sitter ___ bordet och äter.', 'vid', 'Wir sitzen am Tisch und essen.', 2),
('Blommorna står ___ fönstret.', 'vid', 'Die Blumen stehen am Fenster.', 2),
('Jag läser ___ balkongen.', 'på', 'Ich lese auf dem Balkon.', 1),
('Barnen leker ___ trädgården.', 'i', 'Die Kinder spielen im Garten.', 1),
('Jackorna hänger ___ hallen.', 'i', 'Die Jacken hängen im Flur.', 2),

-- Geografie (i / på)
('Vi bor ___ Sverige.', 'i', 'Wir wohnen in Schweden.', 1),
('Han studerar ___ Stockholm.', 'i', 'Er studiert in Stockholm.', 1),
('Han bor ___ Malmö.', 'i', 'Er wohnt in Malmö.', 1),
('Det finns många länder ___ Europa.', 'i', 'Es gibt viele Länder in Europa.', 1),
('Vi semestrar ___ Öland varje år.', 'på', 'Wir machen jeden Jahr Urlaub auf Öland.', 1),
('De tillbringar sommaren ___ Gotland.', 'på', 'Sie verbringen den Sommer auf Gotland.', 1),
('Det bor björnar ___ skogen.', 'i', 'Es leben Bären im Wald.', 1),
('Vi bodde ___ landet förra sommaren.', 'på', 'Wir wohnten letzten Sommer auf dem Land.', 2),
('Det är vackert ___ fjället.', 'på', 'Es ist schön auf dem Fjell.', 2),
('Det är varmt ___ söder.', 'i', 'Es ist warm im Süden.', 2),

-- Zeit (på / om)
('Vi träffas ___ måndag.', 'på', 'Wir treffen uns am Montag.', 1),
('Han ringer alltid ___ morgonen.', 'på', 'Er ruft immer morgens an.', 1),
('Det är lugnt ___ helgen.', 'på', 'Es ist ruhig am Wochenende.', 1),
('Det är mörkt ___ natten.', 'om', 'Es ist nachts dunkel.', 2),
('Vi brukar resa ___ sommaren.', 'om', 'Wir verreisen normalerweise im Sommer.', 2),
('Skolan börjar igen ___ hösten.', 'om', 'Die Schule beginnt wieder im Herbst.', 2),
('Han jobbar alltid ___ kvällen.', 'på', 'Er arbeitet immer abends.', 2),
('Det brukar snöa ___ vintern.', 'om', 'Es schneit normalerweise im Winter.', 2),
('Vi ses ___ fredag.', 'på', 'Wir sehen uns Freitag.', 1),
('Det blommar ___ våren.', 'om', 'Es blüht im Frühling.', 2),

-- Abstrakt / feste Wendungen (på / av / om / för / till)
('Han pratar ___ svenska.', 'på', 'Er spricht auf Schwedisch.', 1),
('Det hände ___ misstag.', 'av', 'Es passierte aus Versehen.', 2),
('Det beror ___ vädret.', 'på', 'Es hängt vom Wetter ab.', 2),
('Det skedde ___ grund av ett missförstånd.', 'på', 'Es passierte aufgrund eines Missverständnisses.', 3),
('___ exempel kan man äta lingon med köttbullar.', 'till', 'Zum Beispiel kann man Preiselbeeren mit Köttbullar essen.', 2),
('Han gör det ___ kärlek.', 'av', 'Er tut es aus Liebe.', 3),
('Stolen är gjord ___ trä.', 'av', 'Der Stuhl ist aus Holz gemacht.', 2),
('Det hände ___ tur.', 'av', 'Es passierte durch Zufall.', 3),
('Hon är trött ___ jobbet.', 'på', 'Sie ist müde vom Job.', 3),

-- Verben mit fester Präposition (på / av / om / för / med / i / till / efter)
('Jag väntar ___ dig.', 'på', 'Ich warte auf dich.', 1),
('Han är intresserad ___ historia.', 'av', 'Er ist an Geschichte interessiert.', 2),
('Vi pratar ___ framtiden.', 'om', 'Wir reden über die Zukunft.', 1),
('Hon tänker ___ sina barn.', 'på', 'Sie denkt an ihre Kinder.', 1),
('Jag är rädd ___ spindlar.', 'för', 'Ich habe Angst vor Spinnen.', 2),
('Han är bra ___ tennis.', 'på', 'Er ist gut im Tennis.', 2),
('Vi längtar ___ semestern.', 'efter', 'Wir sehnen uns nach dem Urlaub.', 2),
('Det handlar ___ en ung flicka.', 'om', 'Es handelt von einem jungen Mädchen.', 1),
('Jag är nöjd ___ resultatet.', 'med', 'Ich bin mit dem Ergebnis zufrieden.', 2),
('Han är kär ___ henne.', 'i', 'Er ist in sie verliebt.', 2),
('Vi arbetar ___ ett nytt projekt.', 'med', 'Wir arbeiten an einem neuen Projekt.', 2),
('Brevet är ___ dig.', 'till', 'Der Brief ist für dich.', 1),
('Vi ger presenter ___ jul.', 'till', 'Wir schenken Geschenke zu Weihnachten.', 2),
('Hon ler ___ honom.', 'mot', 'Sie lächelt ihn an.', 3),
('Jag kommer ___ Sverige.', 'från', 'Ich komme aus Schweden.', 1),
('Hon är snäll ___ sin farmor.', 'mot', 'Sie ist nett zu ihrer Großmutter.', 2),
('Fartyget är ___ väg till Stockholm.', 'på', 'Das Schiff ist auf dem Weg nach Stockholm.', 2);

-- ============================================================
-- Seed-Daten: Kategorien
-- ============================================================

INSERT INTO praep_kategorien (name, praeposition, merksatz, merksatz_uebersetzung, reihenfolge) VALUES
('Inseln & Halbinseln', 'på', 'Inseln und Halbinseln → på (på Öland, på Gotland)', 'Öar och halvöar → på (på Öland, på Gotland)', 10),
('Länder & Kontinente', 'i', 'Länder und Kontinente → i (i Sverige, i Europa)', 'Länder och kontinenter → i (i Sverige, i Europa)', 20),
('Städte', 'i', 'Städte → i (i Stockholm, i Berlin)', 'Städer → i (i Stockholm, i Berlin)', 30),
('Fahrzeuge: drinnen sitzen', 'i', 'In geschlossenen Fahrzeugen sitzt man → i (i bilen, i bussen)', 'I slutna fordon sitter man → i (i bilen, i bussen)', 40),
('Fahrzeuge: draufsitzen/reiten', 'på', 'Auf Fahrzeugen/Tieren, die man "reitet" → på (på cykeln, på hästen)', 'Fordon/djur man "rider" → på (på cykeln, på hästen)', 50),
('Sprachen', 'på', 'Sprachen → på (på svenska, på engelska)', 'Språk → på (på svenska, på engelska)', 60),
('Stockwerke', 'på', 'Stockwerke → på (på tredje våningen, på bottenvåningen)', 'Våningar → på (på tredje våningen, på bottenvåningen)', 70),
('Wochentage', 'på', 'Wochentage → på (på måndag, på fredag)', 'Veckodagar → på (på måndag, på fredag)', 80),
('Jahreszeiten (habituell)', 'om', 'Jahreszeiten habituell → om (om sommaren, om vintern)', 'Årstider (vanor) → om (om sommaren, om vintern)', 90),
('Tageszeiten', 'på', 'Tageszeiten → på; Ausnahme: om natten (in der Nacht)', 'Tider på dagen → på; undantag: om natten', 100);

-- ============================================================
-- Seed-Daten: Begriffe je Kategorie
-- Kategorie-IDs in Reihenfolge des obigen INSERT: 1–10
-- ============================================================

-- Kategorie 1: Inseln & Halbinseln → på
INSERT INTO praep_kategorie_begriffe (kategorie_id, schwedisch, deutsch, beispielsatz) VALUES
(1, 'Öland', 'Öland (Insel)', 'Vi semestrar på Öland.'),
(1, 'Gotland', 'Gotland (Insel)', 'Det är vackert på Gotland.'),
(1, 'Mallorca', 'Mallorca', 'De flyger till Mallorca och solar på stranden.'),
(1, 'Hawaii', 'Hawaii', 'Hon drömmer om att resa till Hawaii.'),
(1, 'Kreta', 'Kreta', 'Vi hyrde ett hus på Kreta.'),
(1, 'Bornholm', 'Bornholm', 'Bornholm är känt för sina runda kyrkor.'),
(1, 'Cypern', 'Zypern', 'Det är varmt på Cypern om sommaren.'),
(1, 'Rügen', 'Rügen', 'Vi tog färja till Rügen.');

-- Kategorie 2: Länder & Kontinente → i
INSERT INTO praep_kategorie_begriffe (kategorie_id, schwedisch, deutsch, beispielsatz) VALUES
(2, 'Sverige', 'Schweden', 'Vi bor i Sverige.'),
(2, 'Norge', 'Norwegen', 'Det finns fjordar i Norge.'),
(2, 'Finland', 'Finnland', 'Det pratas svenska i Finland.'),
(2, 'Frankrike', 'Frankreich', 'Eiffeltornet finns i Frankrike.'),
(2, 'Europa', 'Europa', 'Det finns många länder i Europa.'),
(2, 'Asien', 'Asien', 'Japan ligger i Asien.'),
(2, 'Amerika', 'Amerika', 'New York ligger i Amerika.'),
(2, 'Afrika', 'Afrika', 'Sahara finns i Afrika.');

-- Kategorie 3: Städte → i
INSERT INTO praep_kategorie_begriffe (kategorie_id, schwedisch, deutsch, beispielsatz) VALUES
(3, 'Stockholm', 'Stockholm', 'Kungen bor i Stockholm.'),
(3, 'Göteborg', 'Göteborg', 'Volvo grundades i Göteborg.'),
(3, 'Malmö', 'Malmö', 'Öresundsbron slutar i Malmö.'),
(3, 'Berlin', 'Berlin', 'Brandenburger Tor ligger i Berlin.'),
(3, 'Paris', 'Paris', 'Eiffeltornet finns i Paris.'),
(3, 'London', 'London', 'Big Ben finns i London.'),
(3, 'Oslo', 'Oslo', 'Vi åkte buss i Oslo.'),
(3, 'Köpenhamn', 'Kopenhagen', 'Tivoli ligger i Köpenhamn.');

-- Kategorie 4: Fahrzeuge drinnen → i
INSERT INTO praep_kategorie_begriffe (kategorie_id, schwedisch, deutsch, beispielsatz) VALUES
(4, 'bilen', 'Auto', 'Vi sitter i bilen och väntar.'),
(4, 'bussen', 'Bus', 'Det är många passagerare i bussen.'),
(4, 'taxin', 'Taxi', 'Hon glömde sin jacka i taxin.'),
(4, 'tåget', 'Zug', 'Vi sitter i tåget och läser.'),
(4, 'flygplanet', 'Flugzeug', 'Barnen är nyfikna i flygplanet.'),
(4, 'ubåten', 'U-Boot', 'Besättningen bor i ubåten i månader.');

-- Kategorie 5: Fahrzeuge draufsitzen → på
INSERT INTO praep_kategorie_begriffe (kategorie_id, schwedisch, deutsch, beispielsatz) VALUES
(5, 'cykeln', 'Fahrrad', 'Hon sitter på cykeln och cyklar till jobbet.'),
(5, 'hästen', 'Pferd', 'Riddaren sitter på hästen.'),
(5, 'mopeden', 'Moped', 'Tonåringen åker på mopeden.'),
(5, 'motorcykeln', 'Motorrad', 'Han är cool på motorcykeln.'),
(5, 'skateboarden', 'Skateboard', 'Pojken balanserar på skateboarden.'),
(5, 'sparkcykeln', 'Tretroller', 'Barnet åker på sparkcykeln i parken.');

-- Kategorie 6: Sprachen → på
INSERT INTO praep_kategorie_begriffe (kategorie_id, schwedisch, deutsch, beispielsatz) VALUES
(6, 'svenska', 'Schwedisch', 'Vi pratar på svenska.'),
(6, 'engelska', 'Englisch', 'Mötet hölls på engelska.'),
(6, 'tyska', 'Deutsch', 'Kan du skriva det på tyska?'),
(6, 'franska', 'Französisch', 'Hon sjunger på franska.'),
(6, 'spanska', 'Spanisch', 'De pratade på spanska hela resan.'),
(6, 'kinesiska', 'Chinesisch', 'Han lär sig kinesiska.'),
(6, 'italienska', 'Italienisch', 'Menyn är skriven på italienska.');

-- Kategorie 7: Stockwerke → på
INSERT INTO praep_kategorie_begriffe (kategorie_id, schwedisch, deutsch, beispielsatz) VALUES
(7, 'första våningen', '1. Etage / 1. Stock', 'Receptionen är på första våningen.'),
(7, 'andra våningen', '2. Etage / 2. Stock', 'Kontoret ligger på andra våningen.'),
(7, 'tredje våningen', '3. Etage / 3. Stock', 'Vi bor på tredje våningen.'),
(7, 'bottenvåningen', 'Erdgeschoss', 'Butiken finns på bottenvåningen.'),
(7, 'vinden', 'Dachgeschoss', 'Det finns ett gammalt piano på vinden.'),
(7, 'källarplanet', 'Kellergeschoss', 'Förrådet är på källarplanet.');

-- Kategorie 8: Wochentage → på
INSERT INTO praep_kategorie_begriffe (kategorie_id, schwedisch, deutsch, beispielsatz) VALUES
(8, 'måndag', 'Montag', 'Vi ses på måndag.'),
(8, 'tisdag', 'Dienstag', 'Mötet är på tisdag.'),
(8, 'onsdag', 'Mittwoch', 'Vi handlar på onsdag.'),
(8, 'torsdag', 'Donnerstag', 'Hon har yoga på torsdag.'),
(8, 'fredag', 'Freitag', 'Vi firar på fredag.'),
(8, 'lördag', 'Samstag', 'Marknaden är på lördag.'),
(8, 'söndag', 'Sonntag', 'Kyrkan är full på söndag.');

-- Kategorie 9: Jahreszeiten habituell → om
INSERT INTO praep_kategorie_begriffe (kategorie_id, schwedisch, deutsch, beispielsatz) VALUES
(9, 'sommaren', 'im Sommer', 'Vi badar om sommaren.'),
(9, 'vintern', 'im Winter', 'Det snöar om vintern.'),
(9, 'hösten', 'im Herbst', 'Löven faller om hösten.'),
(9, 'våren', 'im Frühling', 'Fåglarna sjunger om våren.');

-- Kategorie 10: Tageszeiten → på (ausser natten → om)
INSERT INTO praep_kategorie_begriffe (kategorie_id, schwedisch, deutsch, beispielsatz) VALUES
(10, 'morgonen', 'am Morgen (→ på)', 'Han dricker kaffe på morgonen.'),
(10, 'förmiddagen', 'am Vormittag (→ på)', 'Kursen börjar på förmiddagen.'),
(10, 'middagen', 'am Mittag (→ på)', 'Vi äter lunch på middagen.'),
(10, 'eftermiddagen', 'am Nachmittag (→ på)', 'Barnen leker på eftermiddagen.'),
(10, 'kvällen', 'am Abend (→ på)', 'Vi tittar på film på kvällen.'),
(10, 'natten', 'in der Nacht (→ om!)', 'Det är tyst om natten. ⚠️ Ausnahme: om natten!');

SET FOREIGN_KEY_CHECKS = 1;
