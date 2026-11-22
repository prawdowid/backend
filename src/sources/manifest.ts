import type { SourceDoc } from "../pipeline/types";

/**
 * Local corpus of stable, official and fact-checking sources.
 * Generated/maintained by scripts/rebuild-manifest.ts from data/sources/audit.json.
 * Titles describe the page that actually lives under `url` - no invented articles.
 */
export const SOURCE_DOCS: SourceDoc[] = [
    {
        "id": "gov-portal",
        "title": "Portal Gov.pl – oficjalny portal rządowy",
        "publisher": "Kancelaria Prezesa Rady Ministrów",
        "url": "https://www.gov.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Oficjalny portal administracji rządowej Rzeczypospolitej Polskiej. Zbiera komunikaty rządu, informacje o ministerstwach oraz opis usług publicznych.",
        "topics": [
            "administracja publiczna",
            "rząd",
            "usługi publiczne"
        ],
        "verified": true
    },
    {
        "id": "gov-premier",
        "title": "Kancelaria Prezesa Rady Ministrów – serwis",
        "publisher": "Kancelaria Prezesa Rady Ministrów",
        "url": "https://www.gov.pl/web/premier",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Serwis Kancelarii Prezesa Rady Ministrów. Publikuje komunikaty z posiedzeń Rady Ministrów i informacje o pracach rządu.",
        "topics": [
            "rząd",
            "premier",
            "polityka"
        ],
        "verified": true
    },
    {
        "id": "gov-finanse",
        "title": "Ministerstwo Finansów – serwis",
        "publisher": "Ministerstwo Finansów",
        "url": "https://www.gov.pl/web/finanse",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Serwis Ministerstwa Finansów. Zawiera informacje o budżecie państwa, podatkach i finansach publicznych.",
        "topics": [
            "budżet",
            "podatki",
            "finanse publiczne"
        ],
        "verified": true
    },
    {
        "id": "gov-zdrowie",
        "title": "Ministerstwo Zdrowia – serwis",
        "publisher": "Ministerstwo Zdrowia",
        "url": "https://www.gov.pl/web/zdrowie",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Serwis Ministerstwa Zdrowia. Publikuje komunikaty o systemie ochrony zdrowia, programach zdrowotnych i organizacji leczenia.",
        "topics": [
            "zdrowie",
            "ochrona zdrowia",
            "polityka społeczna"
        ],
        "verified": true
    },
    {
        "id": "gov-rodzina",
        "title": "Ministerstwo Rodziny, Pracy i Polityki Społecznej – serwis",
        "publisher": "Ministerstwo Rodziny, Pracy i Polityki Społecznej",
        "url": "https://www.gov.pl/web/rodzina",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Serwis ministerstwa właściwego dla polityki społecznej i rynku pracy. Zawiera informacje o świadczeniach rodzinnych i programach społecznych.",
        "topics": [
            "polityka społeczna",
            "rynek pracy",
            "świadczenia"
        ],
        "verified": true
    },
    {
        "id": "gov-obrona",
        "title": "Ministerstwo Obrony Narodowej – serwis",
        "publisher": "Ministerstwo Obrony Narodowej",
        "url": "https://www.gov.pl/web/obrona-narodowa",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Serwis Ministerstwa Obrony Narodowej. Publikuje komunikaty o Siłach Zbrojnych RP i bezpieczeństwie państwa.",
        "topics": [
            "obronność",
            "wojsko",
            "bezpieczeństwo"
        ],
        "verified": true
    },
    {
        "id": "gov-sprawiedliwosc",
        "title": "Ministerstwo Sprawiedliwości – serwis",
        "publisher": "Ministerstwo Sprawiedliwości",
        "url": "https://www.gov.pl/web/sprawiedliwosc",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Serwis Ministerstwa Sprawiedliwości. Zawiera informacje o wymiarze sprawiedliwości, sądownictwie i zmianach w prawie.",
        "topics": [
            "wymiar sprawiedliwości",
            "sądy",
            "prawo"
        ],
        "verified": true
    },
    {
        "id": "gov-cyfryzacja",
        "title": "Ministerstwo Cyfryzacji – serwis",
        "publisher": "Ministerstwo Cyfryzacji",
        "url": "https://www.gov.pl/web/cyfryzacja",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Serwis Ministerstwa Cyfryzacji. Publikuje informacje o usługach cyfrowych państwa i bezpieczeństwie w internecie.",
        "topics": [
            "cyfryzacja",
            "internet",
            "administracja publiczna"
        ],
        "verified": true
    },
    {
        "id": "gov-klimat",
        "title": "Ministerstwo Klimatu i Środowiska – serwis",
        "publisher": "Ministerstwo Klimatu i Środowiska",
        "url": "https://www.gov.pl/web/klimat",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Serwis ministerstwa właściwego dla klimatu i środowiska. Zawiera informacje o polityce klimatycznej i ochronie środowiska.",
        "topics": [
            "klimat",
            "środowisko",
            "energetyka"
        ],
        "verified": true
    },
    {
        "id": "du-home",
        "title": "Dziennik Ustaw Rzeczypospolitej Polskiej – strona główna",
        "publisher": "Rządowe Centrum Legislacji",
        "url": "https://dziennikustaw.gov.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Oficjalny dziennik urzędowy RP, w którym ogłasza się ustawy, rozporządzenia i umowy międzynarodowe. Serwis pozwala przeglądać i wyszukiwać opublikowane akty.",
        "topics": [
            "prawo",
            "akty prawne",
            "dziennik urzędowy"
        ],
        "verified": true
    },
    {
        "id": "du-wyszukiwarka",
        "title": "Dziennik Ustaw – wyszukiwarka aktów prawnych",
        "publisher": "Rządowe Centrum Legislacji",
        "url": "https://dziennikustaw.gov.pl/DU",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Wyszukiwarka aktów prawnych opublikowanych w Dzienniku Ustaw. Umożliwia filtrowanie aktów według roku, rodzaju i hasła.",
        "topics": [
            "prawo",
            "wyszukiwarka",
            "akty prawne"
        ],
        "verified": true
    },
    {
        "id": "mp-home",
        "title": "Monitor Polski – strona główna",
        "publisher": "Rządowe Centrum Legislacji",
        "url": "https://monitorpolski.gov.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Oficjalny dziennik urzędowy RP dla aktów niewymagających publikacji w Dzienniku Ustaw, m.in. uchwał Rady Ministrów i zarządzeń.",
        "topics": [
            "prawo",
            "monitor polski",
            "dziennik urzędowy"
        ],
        "verified": true
    },
    {
        "id": "mp-wyszukiwarka",
        "title": "Monitor Polski – wyszukiwarka aktów",
        "publisher": "Rządowe Centrum Legislacji",
        "url": "https://monitorpolski.gov.pl/MP",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Wyszukiwarka aktów opublikowanych w Monitorze Polskim. Umożliwia filtrowanie według roku, rodzaju i hasła.",
        "topics": [
            "prawo",
            "wyszukiwarka",
            "akty prawne"
        ],
        "verified": true
    },
    {
        "id": "isap-home",
        "title": "Internetowy System Aktów Prawnych (ISAP)",
        "publisher": "Kancelaria Sejmu",
        "url": "https://isap.sejm.gov.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Baza obowiązujących i archiwalnych aktów prawnych prowadzona przez Kancelarię Sejmu. Pozwala wyszukiwać teksty ustaw, rozporządzeń i umów międzynarodowych.",
        "topics": [
            "prawo",
            "akty prawne",
            "legislacja"
        ],
        "verified": true
    },
    {
        "id": "isap-by-year",
        "title": "ISAP – akty prawne według roku ogłoszenia",
        "publisher": "Kancelaria Sejmu",
        "url": "https://isap.sejm.gov.pl/isap.nsf/ByYear.xsp",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Widok systemu ISAP grupujący akty prawne według roku ogłoszenia. Pozwala przeglądać chronologiczne wykazy aktów.",
        "topics": [
            "prawo",
            "wyszukiwarka",
            "legislacja"
        ],
        "verified": true
    },
    {
        "id": "pkw-home",
        "title": "Państwowa Komisja Wyborcza – strona główna",
        "publisher": "Państwowa Komisja Wyborcza",
        "url": "https://pkw.gov.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Oficjalny serwis Państwowej Komisji Wyborczej. Publikuje obwieszczenia, uchwały i dane o wynikach wyborów.",
        "topics": [
            "wybory",
            "pkw",
            "ordynacja wyborcza"
        ],
        "verified": true
    },
    {
        "id": "pkw-wybory",
        "title": "Wybory i referenda – informacje PKW",
        "publisher": "Państwowa Komisja Wyborcza",
        "url": "https://pkw.gov.pl/wybory-i-referenda",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Dział serwisu PKW poświęcony organizacji wyborów i referendów w Polsce. Zawiera kalendarze wyborcze i informacje o komisjach.",
        "topics": [
            "wybory",
            "referendum",
            "pkw"
        ],
        "verified": true
    },
    {
        "id": "pkw-sejm-senat",
        "title": "Wybory do Sejmu i do Senatu – informacje PKW",
        "publisher": "Państwowa Komisja Wyborcza",
        "url": "https://pkw.gov.pl/wybory-i-referenda/wybory-do-sejmu-i-do-senatu",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Informacje PKW o wyborach parlamentarnych, w tym o okręgach, listach kandydatów i wynikach głosowania.",
        "topics": [
            "wybory",
            "sejm",
            "senat"
        ],
        "verified": true
    },
    {
        "id": "pkw-prezydenckie",
        "title": "Wybory Prezydenta Rzeczypospolitej Polskiej – informacje PKW",
        "publisher": "Państwowa Komisja Wyborcza",
        "url": "https://pkw.gov.pl/wybory-i-referenda/wybory-prezydenckie",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Informacje PKW o wyborach prezydenckich, w tym o terminach, kandydatach i wynikach kolejnych tur.",
        "topics": [
            "wybory",
            "prezydent",
            "pkw"
        ],
        "verified": true
    },
    {
        "id": "pkw-europarl",
        "title": "Wybory do Parlamentu Europejskiego – informacje PKW",
        "publisher": "Państwowa Komisja Wyborcza",
        "url": "https://pkw.gov.pl/wybory-i-referenda/wybory-do-parlamentu-europejskiego",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Informacje PKW o wyborach do Parlamentu Europejskiego w Polsce, w tym o okręgach i wynikach.",
        "topics": [
            "wybory",
            "parlament europejski",
            "unii europejska"
        ],
        "verified": true
    },
    {
        "id": "pkw-finansowanie",
        "title": "Finansowanie partii politycznych – informacje PKW",
        "publisher": "Państwowa Komisja Wyborcza",
        "url": "https://pkw.gov.pl/finansowanie-polityki",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Dział serwisu PKW o finansowaniu partii politycznych i kampanii wyborczych. Zawiera informacje o sprawozdaniach i kontroli finansów partii.",
        "topics": [
            "partie polityczne",
            "finansowanie",
            "kampania wyborcza"
        ],
        "verified": true
    },
    {
        "id": "pkw-aktualnosci",
        "title": "PKW – aktualności i komunikaty",
        "publisher": "Państwowa Komisja Wyborcza",
        "url": "https://pkw.gov.pl/aktualnosci",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Bieżące komunikaty i uchwały Państwowej Komisji Wyborczej. Dotyczą organizacji wyborów i spraw sprawozdawczości finansowej.",
        "topics": [
            "wybory",
            "komunikaty",
            "pkw"
        ],
        "verified": true
    },
    {
        "id": "gus-home",
        "title": "Główny Urząd Statystyczny – strona główna",
        "publisher": "Główny Urząd Statystyczny",
        "url": "https://stat.gov.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Oficjalny serwis statystyki publicznej w Polsce. Udostępnia wskaźniki, opracowania i publikacje GUS.",
        "topics": [
            "statystyka",
            "dane",
            "gospodarka"
        ],
        "verified": true
    },
    {
        "id": "gus-ludnosc",
        "title": "GUS – ludność",
        "publisher": "Główny Urząd Statystyczny",
        "url": "https://stat.gov.pl/obszary-tematyczne/ludnosc/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Dział statystyki ludności w serwisie GUS. Zawiera dane o liczbie mieszkańców, strukturze wieku i ruchu naturalnym.",
        "topics": [
            "ludność",
            "demografia",
            "statystyka"
        ],
        "verified": true
    },
    {
        "id": "gus-ceny",
        "title": "GUS – ceny i handel",
        "publisher": "Główny Urząd Statystyczny",
        "url": "https://stat.gov.pl/obszary-tematyczne/ceny-handel/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Dział serwisu GUS o cenach i handlu. Publikuje dane o inflacji, cenach towarów i sprzedaży detalicznej.",
        "topics": [
            "inflacja",
            "ceny",
            "handel"
        ],
        "verified": true
    },
    {
        "id": "gus-rynek-pracy",
        "title": "GUS – rynek pracy",
        "publisher": "Główny Urząd Statystyczny",
        "url": "https://stat.gov.pl/obszary-tematyczne/rynek-pracy/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Dział serwisu GUS o rynku pracy. Zawiera dane o zatrudnieniu, bezrobociu i wynagrodzeniach.",
        "topics": [
            "rynek pracy",
            "bezrobocie",
            "zatrudnienie"
        ],
        "verified": true
    },
    {
        "id": "gus-rachunki-narodowe",
        "title": "GUS – rachunki narodowe",
        "publisher": "Główny Urząd Statystyczny",
        "url": "https://stat.gov.pl/obszary-tematyczne/rachunki-narodowe/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Dział serwisu GUS z rachunkami narodowymi. Publikuje dane o produkcie krajowym brutto i wzroście gospodarczym.",
        "topics": [
            "pkb",
            "gospodarka",
            "wzrost gospodarczy"
        ],
        "verified": true
    },
    {
        "id": "gus-rolnictwo",
        "title": "GUS – rolnictwo i leśnictwo",
        "publisher": "Główny Urząd Statystyczny",
        "url": "https://stat.gov.pl/obszary-tematyczne/rolnictwo-lesnictwo/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Dział serwisu GUS o rolnictwie i leśnictwie. Zawiera dane o produkcji rolnej, zbiorach i pogłowiu zwierząt.",
        "topics": [
            "rolnictwo",
            "produkcja rolna",
            "statystyka"
        ],
        "verified": true
    },
    {
        "id": "gus-publikacje",
        "title": "GUS – publikacje",
        "publisher": "Główny Urząd Statystyczny",
        "url": "https://stat.gov.pl/publikacje/publikacje-a-z/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Katalog publikacji GUS uporządkowany alfabetycznie. Zawiera opracowania i raporty z wynikami badań statystycznych.",
        "topics": [
            "publikacje",
            "raporty",
            "statystyka"
        ],
        "verified": true
    },
    {
        "id": "nbp-home",
        "title": "Narodowy Bank Polski – strona główna",
        "publisher": "Narodowy Bank Polski",
        "url": "https://nbp.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Oficjalny serwis banku centralnego RP. Publikuje decyzje Rady Polityki Pieniężnej, dane statystyczne i komunikaty.",
        "topics": [
            "bank centralny",
            "nbp",
            "polityka pieniężna"
        ],
        "verified": true
    },
    {
        "id": "nbp-o-nbp",
        "title": "Narodowy Bank Polski – o banku",
        "publisher": "Narodowy Bank Polski",
        "url": "https://nbp.pl/o-nbp/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Dział serwisu NBP opisujący zadania i strukturę banku centralnego. Zawiera informacje o organach NBP i jego funkcjach ustawowych.",
        "topics": [
            "nbp",
            "bank centralny",
            "instytucje"
        ],
        "verified": true
    },
    {
        "id": "nbp-polityka-pieniezna",
        "title": "Narodowy Bank Polski – polityka pieniężna",
        "publisher": "Narodowy Bank Polski",
        "url": "https://nbp.pl/polityka-pieniezna/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Dział serwisu NBP poświęcony polityce pieniężnej. Zawiera informacje o stopach procentowych i decyzjach Rady Polityki Pieniężnej.",
        "topics": [
            "stopy procentowe",
            "polityka pieniężna",
            "inflacja"
        ],
        "verified": true
    },
    {
        "id": "nbp-statystyka",
        "title": "Narodowy Bank Polski – statystyka i sprawozdawczość",
        "publisher": "Narodowy Bank Polski",
        "url": "https://nbp.pl/statystyka-i-sprawozdawczosc/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Dział serwisu NBP z danymi statystycznymi i zasadami sprawozdawczości. Obejmuje statystykę monetarną i bilans płatniczy.",
        "topics": [
            "statystyka",
            "bilans płatniczy",
            "dane"
        ],
        "verified": true
    },
    {
        "id": "nbp-publikacje",
        "title": "Narodowy Bank Polski – publikacje",
        "publisher": "Narodowy Bank Polski",
        "url": "https://nbp.pl/publikacje/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Katalog publikacji NBP, w tym raportów o inflacji i sprawozdań z polityki pieniężnej.",
        "topics": [
            "publikacje",
            "raporty",
            "inflacja"
        ],
        "verified": true
    },
    {
        "id": "nbp-aktualnosci",
        "title": "Narodowy Bank Polski – aktualności",
        "publisher": "Narodowy Bank Polski",
        "url": "https://nbp.pl/aktualnosci/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Bieżące komunikaty Narodowego Banku Polskiego. Dotyczą decyzji Rady Polityki Pieniężnej i działalności banku.",
        "topics": [
            "nbp",
            "komunikaty",
            "polityka pieniężna"
        ],
        "verified": true
    },
    {
        "id": "nbp-system-platniczy",
        "title": "Narodowy Bank Polski – system płatniczy",
        "publisher": "Narodowy Bank Polski",
        "url": "https://nbp.pl/system-platniczy/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Dział serwisu NBP o systemie płatniczym. Zawiera informacje o nadzorze nad systemami płatności i obrocie bezgotówkowym.",
        "topics": [
            "płatności",
            "bankowość",
            "nadzór"
        ],
        "verified": true
    },
    {
        "id": "sejm-home",
        "title": "Sejm Rzeczypospolitej Polskiej – strona główna",
        "publisher": "Kancelaria Sejmu",
        "url": "https://www.sejm.gov.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Oficjalny serwis Sejmu RP. Zawiera informacje o posłach, posiedzeniach i przebiegu prac legislacyjnych.",
        "topics": [
            "sejm",
            "parlament",
            "legislacja"
        ],
        "verified": true
    },
    {
        "id": "sejm-posiedzenia",
        "title": "Sejm RP – posiedzenia",
        "publisher": "Kancelaria Sejmu",
        "url": "https://www.sejm.gov.pl/Sejm10.nsf/posiedzenia.xsp",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Wykaz posiedzeń Sejmu RP wraz z porządkiem obrad i przebiegiem obrad. Pozwala sprawdzić, kiedy i nad czym głosowano.",
        "topics": [
            "sejm",
            "posiedzenia",
            "głosowania"
        ],
        "verified": true
    },
    {
        "id": "sejm-komisje",
        "title": "Sejm RP – komisje sejmowe",
        "publisher": "Kancelaria Sejmu",
        "url": "https://www.sejm.gov.pl/Sejm10.nsf/komisje.xsp",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Wykaz komisji sejmowych wraz ze składem i pracami. Pozwala sprawdzić, która komisja zajmowała się danym projektem.",
        "topics": [
            "sejm",
            "komisje",
            "parlament"
        ],
        "verified": true
    },
    {
        "id": "sejm-interpelacje",
        "title": "Sejm RP – interpelacje i zapytania poselskie",
        "publisher": "Kancelaria Sejmu",
        "url": "https://www.sejm.gov.pl/Sejm10.nsf/interpelacje.xsp",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Baza interpelacji i zapytań poselskich wraz z odpowiedziami ministrów. Dokumentuje oficjalne stanowiska rządu.",
        "topics": [
            "sejm",
            "interpelacje",
            "rząd"
        ],
        "verified": true
    },
    {
        "id": "sejm-druki",
        "title": "Sejm RP – druki sejmowe",
        "publisher": "Kancelaria Sejmu",
        "url": "https://www.sejm.gov.pl/Sejm10.nsf/druki.xsp",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Wykaz druków sejmowych, czyli projektów ustaw i uchwał wraz z uzasadnieniami. Pozwala prześledzić treść projektu na każdym etapie.",
        "topics": [
            "sejm",
            "projekty ustaw",
            "legislacja"
        ],
        "verified": true
    },
    {
        "id": "senat-home",
        "title": "Senat Rzeczypospolitej Polskiej – strona główna",
        "publisher": "Kancelaria Senatu",
        "url": "https://www.senat.gov.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Oficjalny serwis Senatu RP. Zawiera informacje o senatorach, posiedzeniach i pracach legislacyjnych izby wyższej.",
        "topics": [
            "senat",
            "parlament",
            "legislacja"
        ],
        "verified": true
    },
    {
        "id": "senat-komisje",
        "title": "Senat RP – komisje senackie",
        "publisher": "Kancelaria Senatu",
        "url": "https://www.senat.gov.pl/prace/komisje-senackie/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Wykaz komisji senackich wraz ze składem i zakresem prac. Pozwala sprawdzić, gdzie rozpatrywano dany projekt ustawy.",
        "topics": [
            "senat",
            "komisje",
            "parlament"
        ],
        "verified": true
    },
    {
        "id": "msz-home",
        "title": "Ministerstwo Spraw Zagranicznych – serwis",
        "publisher": "Ministerstwo Spraw Zagranicznych",
        "url": "https://www.msz.gov.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Serwis Ministerstwa Spraw Zagranicznych. Publikuje komunikaty o polityce zagranicznej i działalności placówek dyplomatycznych.",
        "topics": [
            "dyplomacja",
            "polityka zagraniczna",
            "msz"
        ],
        "verified": true
    },
    {
        "id": "msz-portal",
        "title": "Ministerstwo Spraw Zagranicznych – portal Gov.pl",
        "publisher": "Ministerstwo Spraw Zagranicznych",
        "url": "https://www.gov.pl/web/dyplomacja",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Dział portalu Gov.pl prowadzony przez MSZ. Zawiera informacje o priorytetach polskiej polityki zagranicznej i konsulatach.",
        "topics": [
            "dyplomacja",
            "polityka zagraniczna",
            "konsulaty"
        ],
        "verified": true
    },
    {
        "id": "msz-o-ministerstwie",
        "title": "MSZ – informacje o ministerstwie",
        "publisher": "Ministerstwo Spraw Zagranicznych",
        "url": "https://www.gov.pl/web/dyplomacja/o-ministerstwie",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Strona opisująca strukturę i zadania Ministerstwa Spraw Zagranicznych. Zawiera informacje o kierownictwie i komórkach organizacyjnych.",
        "topics": [
            "msz",
            "instytucje",
            "administracja publiczna"
        ],
        "verified": true
    },
    {
        "id": "eurlex-home",
        "title": "EUR-Lex – prawo Unii Europejskiej",
        "publisher": "Urząd Publikacji Unii Europejskiej",
        "url": "https://eur-lex.europa.eu/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Oficjalny serwis z prawem Unii Europejskiej. Udostępnia traktaty, rozporządzenia, dyrektywy i decyzje wraz z wersjami językowymi.",
        "topics": [
            "prawo unii europejskiej",
            "traktaty",
            "rozporządzenia"
        ],
        "verified": true
    },
    {
        "id": "eurlex-tue",
        "title": "Traktat o Unii Europejskiej – wersja skonsolidowana",
        "publisher": "Urząd Publikacji Unii Europejskiej",
        "url": "https://eur-lex.europa.eu/legal-content/PL/TXT/?uri=CELEX%3A12012E%2FTXT",
        "publishedAt": "2012-10-26",
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Skonsolidowany tekst Traktatu o Unii Europejskiej i Traktatu o funkcjonowaniu Unii Europejskiej, opublikowany w Dzienniku Urzędowym UE. Określa ustrojowe podstawy funkcjonowania Unii.",
        "topics": [
            "traktat",
            "unii europejska",
            "prawo pierwotne"
        ],
        "verified": true
    },
    {
        "id": "eurlex-lizbona",
        "title": "Traktat z Lizbony – tekst traktatu",
        "publisher": "Urząd Publikacji Unii Europejskiej",
        "url": "https://eur-lex.europa.eu/legal-content/PL/TXT/?uri=CELEX%3A12007L%2FTXT",
        "publishedAt": "2007-12-17",
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Tekst Traktatu z Lizbony zmieniającego Traktat o Unii Europejskiej i Traktat ustanawiający Wspólnotę Europejską. Dokument określa zmiany ustrojowe wprowadzone w 2009 r.",
        "topics": [
            "traktat lizboński",
            "unii europejska",
            "prawo pierwotne"
        ],
        "verified": true
    },
    {
        "id": "eurlex-karta",
        "title": "Karta praw podstawowych Unii Europejskiej – tekst skonsolidowany",
        "publisher": "Urząd Publikacji Unii Europejskiej",
        "url": "https://eur-lex.europa.eu/legal-content/PL/TXT/?uri=CELEX%3A12012P%2FTXT",
        "publishedAt": "2012-10-26",
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Skonsolidowany tekst Karty praw podstawowych Unii Europejskiej. Kataloguje prawa i wolności chronione w porządku prawnym Unii.",
        "topics": [
            "prawa podstawowe",
            "unii europejska",
            "prawa człowieka"
        ],
        "verified": true
    },
    {
        "id": "eurlex-rodo",
        "title": "Rozporządzenie (UE) 2016/679 – ogólne rozporządzenie o ochronie danych (RODO)",
        "publisher": "Urząd Publikacji Unii Europejskiej",
        "url": "https://eur-lex.europa.eu/legal-content/PL/TXT/?uri=CELEX%3A32016R0679",
        "publishedAt": "2016-04-27",
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Pełny tekst rozporządzenia Parlamentu Europejskiego i Rady (UE) 2016/679 o ochronie danych osobowych. Określa zasady przetwarzania danych i prawa osób, których dane dotyczą.",
        "topics": [
            "rodo",
            "dane osobowe",
            "prywatność"
        ],
        "verified": true
    },
    {
        "id": "eurlex-ai-act",
        "title": "Rozporządzenie (UE) 2024/1689 – akt w sprawie sztucznej inteligencji",
        "publisher": "Urząd Publikacji Unii Europejskiej",
        "url": "https://eur-lex.europa.eu/legal-content/PL/TXT/?uri=CELEX%3A32024R1689",
        "publishedAt": "2024-07-12",
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Tekst rozporządzenia ustanawiającego zharmonizowane przepisy dotyczące sztucznej inteligencji. Definiuje obowiązki dostawców systemów AI i praktyki zakazane.",
        "topics": [
            "sztuczna inteligencja",
            "regulacje",
            "unii europejska"
        ],
        "verified": true
    },
    {
        "id": "demagog-home",
        "title": "Demagog – strona główna",
        "publisher": "Demagog",
        "url": "https://demagog.org.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "fact_check",
        "lang": "pl",
        "summary": "Serwis polskiej organizacji fact-checkingowej Demagog. Publikuje weryfikacje wypowiedzi polityków i viralowych treści.",
        "topics": [
            "fact-checking",
            "dezinformacja",
            "polityka"
        ],
        "verified": true
    },
    {
        "id": "demagog-o-nas",
        "title": "Demagog – o projekcie",
        "publisher": "Demagog",
        "url": "https://demagog.org.pl/o-nas/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "fact_check",
        "lang": "pl",
        "summary": "Strona opisująca cele i sposób działania projektu Demagog. Przedstawia zespół, partnerów i zasady współpracy z mediami.",
        "topics": [
            "fact-checking",
            "media",
            "edukacja medialna"
        ],
        "verified": true
    },
    {
        "id": "demagog-metodologia",
        "title": "Demagog – metodologia weryfikacji",
        "publisher": "Demagog",
        "url": "https://demagog.org.pl/metodologia/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "fact_check",
        "lang": "pl",
        "summary": "Opis metodyki oceny wypowiedzi stosowanej przez Demagog. Wyjaśnia kategorie werdyktów i sposób doboru źródeł.",
        "topics": [
            "metodologia",
            "fact-checking",
            "werdykty"
        ],
        "verified": true
    },
    {
        "id": "afp-fact-check",
        "title": "AFP Fact Check – weryfikacje agencji AFP",
        "publisher": "Agence France-Presse",
        "url": "https://factcheck.afp.com/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "fact_check",
        "lang": "en",
        "summary": "Serwis fact-checkingowy agencji AFP. Publikuje weryfikacje zdjęć, nagrań i twierdzeń krążących w mediach społecznościowych.",
        "topics": [
            "fact-checking",
            "dezinformacja",
            "media społecznościowe"
        ],
        "verified": true
    },
    {
        "id": "afp-pl",
        "title": "AFP – serwis w języku polskim",
        "publisher": "Agence France-Presse",
        "url": "https://www.afp.com/pl",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "secondary",
        "lang": "pl",
        "summary": "Polskojęzyczna część serwisu agencji prasowej AFP. Zawiera depesze i materiały agencji dotyczące Polski i świata.",
        "topics": [
            "agencja prasowa",
            "media",
            "depesze"
        ],
        "verified": true
    },
    {
        "id": "euvsdisinfo-home",
        "title": "EU vs Disinfo – strona główna",
        "publisher": "Europejska Służba Działań Zewnętrznych",
        "url": "https://euvsdisinfo.eu/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "fact_check",
        "lang": "en",
        "summary": "Projekt unijny dokumentujący i wyjaśniający przypadki dezinformacji wymierzonej w Unię Europejską. Publikuje analizy narracji i weryfikacje konkretnych przekazów.",
        "topics": [
            "dezinformacja",
            "unii europejska",
            "fact-checking"
        ],
        "verified": true
    },
    {
        "id": "euvsdisinfo-baza",
        "title": "EU vs Disinfo – baza przypadków dezinformacji",
        "publisher": "Europejska Służba Działań Zewnętrznych",
        "url": "https://euvsdisinfo.eu/disinformation-cases/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "fact_check",
        "lang": "en",
        "summary": "Baza opisanych przypadków dezinformacji z omówieniem narracji i źródła przekazu. Pozwala przeszukiwać wcześniejsze weryfikacje.",
        "topics": [
            "dezinformacja",
            "baza danych",
            "narracje"
        ],
        "verified": true
    },
    {
        "id": "euvsdisinfo-o-projekcie",
        "title": "EU vs Disinfo – o projekcie",
        "publisher": "Europejska Służba Działań Zewnętrznych",
        "url": "https://euvsdisinfo.eu/about/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "fact_check",
        "lang": "en",
        "summary": "Strona opisująca mandat i metody działania projektu EU vs Disinfo. Wyjaśnia, jak zespół dobiera i weryfikuje opisywane przypadki.",
        "topics": [
            "dezinformacja",
            "metodologia",
            "unii europejska"
        ],
        "verified": true
    },
    {
        "id": "nask-home",
        "title": "NASK – Państwowy Instytut Badawczy",
        "publisher": "NASK – Państwowy Instytut Badawczy",
        "url": "https://nask.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "secondary",
        "lang": "pl",
        "summary": "Serwis NASK, instytutu badawczego zajmującego się sieciami i bezpieczeństwem cyfrowym. Publikuje komunikaty o zagrożeniach w sieci i projektach badawczych.",
        "topics": [
            "cyberbezpieczeństwo",
            "internet",
            "badania"
        ],
        "verified": true
    },
    {
        "id": "nask-aktualnosci",
        "title": "NASK – aktualności",
        "publisher": "NASK – Państwowy Instytut Badawczy",
        "url": "https://nask.pl/aktualnosci/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "secondary",
        "lang": "pl",
        "summary": "Bieżące komunikaty NASK. Dotyczą bezpieczeństwa w internecie, edukacji cyfrowej i działalności instytutu.",
        "topics": [
            "cyberbezpieczeństwo",
            "komunikaty",
            "edukacja cyfrowa"
        ],
        "verified": true
    },
    {
        "id": "nask-badania",
        "title": "NASK – badania i analizy",
        "publisher": "NASK – Państwowy Instytut Badawczy",
        "url": "https://nask.pl/badania/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "secondary",
        "lang": "pl",
        "summary": "Dział serwisu NASK prezentujący projekty badawcze instytutu. Obejmuje badania nad internetem, mediami cyfrowymi i bezpieczeństwem sieci.",
        "topics": [
            "badania",
            "internet",
            "media cyfrowe"
        ],
        "verified": true
    },
    {
        "id": "nask-publikacje",
        "title": "NASK – publikacje",
        "publisher": "NASK – Państwowy Instytut Badawczy",
        "url": "https://nask.pl/publikacje/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "secondary",
        "lang": "pl",
        "summary": "Katalog publikacji NASK. Zawiera raporty i analizy z zakresu cyberbezpieczeństwa i kompetencji cyfrowych.",
        "topics": [
            "publikacje",
            "raporty",
            "cyberbezpieczeństwo"
        ],
        "verified": true
    },
    {
        "id": "nask-wydarzenia",
        "title": "NASK – wydarzenia",
        "publisher": "NASK – Państwowy Instytut Badawczy",
        "url": "https://nask.pl/wydarzenia/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "secondary",
        "lang": "pl",
        "summary": "Kalendarz konferencji i wydarzeń organizowanych przez NASK. Dotyczą edukacji cyfrowej i bezpieczeństwa w internecie.",
        "topics": [
            "wydarzenia",
            "edukacja cyfrowa",
            "internet"
        ],
        "verified": true
    },
    {
        "id": "uokik-home",
        "title": "Urząd Ochrony Konkurencji i Konsumentów – strona główna",
        "publisher": "Urząd Ochrony Konkurencji i Konsumentów",
        "url": "https://uokik.gov.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Oficjalny serwis Prezesa UOKiK. Publikuje decyzje w sprawach praktyk rynkowych i komunikaty o ochronie konsumentów.",
        "topics": [
            "ochrona konsumentów",
            "konkurencja",
            "uokik"
        ],
        "verified": true
    },
    {
        "id": "uokik-aktualnosci",
        "title": "UOKiK – aktualności",
        "publisher": "Urząd Ochrony Konkurencji i Konsumentów",
        "url": "https://uokik.gov.pl/aktualnosci",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Bieżące komunikaty Urzędu Ochrony Konkurencji i Konsumentów. Dotyczą wszczętych postępowań, decyzji i ostrzeżeń dla konsumentów.",
        "topics": [
            "uokik",
            "komunikaty",
            "konsumenci"
        ],
        "verified": true
    },
    {
        "id": "nfz-home",
        "title": "Narodowy Fundusz Zdrowia – strona główna",
        "publisher": "Narodowy Fundusz Zdrowia",
        "url": "https://www.nfz.gov.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Oficjalny serwis Narodowego Funduszu Zdrowia. Publikuje informacje o finansowaniu świadczeń i zasadach korzystania z opieki zdrowotnej.",
        "topics": [
            "ochrona zdrowia",
            "nfz",
            "finansowanie"
        ],
        "verified": true
    },
    {
        "id": "nfz-o-nfz",
        "title": "NFZ – o Narodowym Funduszu Zdrowia",
        "publisher": "Narodowy Fundusz Zdrowia",
        "url": "https://www.nfz.gov.pl/o-nfz/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Strona opisująca zadania i strukturę Narodowego Funduszu Zdrowia. Przedstawia organizację oddziałów wojewódzkich i zasady działania funduszu.",
        "topics": [
            "nfz",
            "instytucje",
            "ochrona zdrowia"
        ],
        "verified": true
    },
    {
        "id": "nfz-dla-pacjenta",
        "title": "NFZ – informacje dla pacjenta",
        "publisher": "Narodowy Fundusz Zdrowia",
        "url": "https://www.nfz.gov.pl/dla-pacjenta/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Dział serwisu NFZ z informacjami dla pacjentów. Wyjaśnia zasady zapisów, skierowań i leczenia w ramach ubezpieczenia.",
        "topics": [
            "pacjent",
            "leczenie",
            "nfz"
        ],
        "verified": true
    },
    {
        "id": "zus-home",
        "title": "Zakład Ubezpieczeń Społecznych – strona główna",
        "publisher": "Zakład Ubezpieczeń Społecznych",
        "url": "https://www.zus.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Oficjalny serwis Zakładu Ubezpieczeń Społecznych. Publikuje informacje o składkach, świadczeniach i zasadach ubezpieczeń społecznych.",
        "topics": [
            "ubezpieczenia społeczne",
            "zus",
            "świadczenia"
        ],
        "verified": true
    },
    {
        "id": "zus-swiadczenia",
        "title": "ZUS – świadczenia",
        "publisher": "Zakład Ubezpieczeń Społecznych",
        "url": "https://www.zus.pl/swiadczenia",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Dział serwisu ZUS opisujący rodzaje świadczeń. Obejmuje emerytury, renty, zasiłki i zasady ich przyznawania.",
        "topics": [
            "świadczenia",
            "emerytury",
            "zus"
        ],
        "verified": true
    },
    {
        "id": "zus-aktualnosci",
        "title": "ZUS – aktualności",
        "publisher": "Zakład Ubezpieczeń Społecznych",
        "url": "https://www.zus.pl/o-zus/aktualnosci",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Bieżące komunikaty Zakładu Ubezpieczeń Społecznych. Dotyczą zmian w świadczeniach i terminów składania wniosków.",
        "topics": [
            "zus",
            "komunikaty",
            "świadczenia"
        ],
        "verified": true
    },
    {
        "id": "pip-home",
        "title": "Państwowa Inspekcja Pracy – strona główna",
        "publisher": "Państwowa Inspekcja Pracy",
        "url": "https://www.pip.gov.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Oficjalny serwis Państwowej Inspekcji Pracy. Publikuje informacje o kontroli przestrzegania prawa pracy i porady dla pracowników.",
        "topics": [
            "prawo pracy",
            "pip",
            "kontrola"
        ],
        "verified": true
    },
    {
        "id": "pip-aktualnosci",
        "title": "PIP – aktualności",
        "publisher": "Państwowa Inspekcja Pracy",
        "url": "https://www.pip.gov.pl/pl/aktualnosci",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Bieżące komunikaty Państwowej Inspekcji Pracy. Dotyczą wyników kontroli, wypadków przy pracy i interpretacji przepisów.",
        "topics": [
            "prawo pracy",
            "komunikaty",
            "bezpieczeństwo pracy"
        ],
        "verified": true
    },
    {
        "id": "krrit-home",
        "title": "Krajowa Rada Radiofonii i Telewizji – strona główna",
        "publisher": "Krajowa Rada Radiofonii i Telewizji",
        "url": "https://www.krrit.gov.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Oficjalny serwis Krajowej Rady Radiofonii i Telewizji. Publikuje uchwały, stanowiska i informacje o rynku medialnym.",
        "topics": [
            "media",
            "krrit",
            "regulacje"
        ],
        "verified": true
    },
    {
        "id": "krrit-aktualnosci",
        "title": "KRRiT – aktualności",
        "publisher": "Krajowa Rada Radiofonii i Telewizji",
        "url": "https://www.krrit.gov.pl/aktualnosci/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Bieżące komunikaty Krajowej Rady Radiofonii i Telewizji. Dotyczą uchwał, koncesji i spraw nadawców.",
        "topics": [
            "media",
            "komunikaty",
            "krrit"
        ],
        "verified": true
    },
    {
        "id": "krrit-koncesje",
        "title": "KRRiT – koncesje na nadawanie",
        "publisher": "Krajowa Rada Radiofonii i Telewizji",
        "url": "https://www.krrit.gov.pl/koncesje/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Dział serwisu KRRiT o koncesjach na rozpowszechnianie programów. Zawiera informacje o postępowaniach koncesyjnych i wykaz nadawców.",
        "topics": [
            "koncesje",
            "media",
            "nadawcy"
        ],
        "verified": true
    },
    {
        "id": "krrit-badania",
        "title": "KRRiT – badania i analizy rynku medialnego",
        "publisher": "Krajowa Rada Radiofonii i Telewizji",
        "url": "https://www.krrit.gov.pl/badania/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Dział serwisu KRRiT z badaniami rynku medialnego. Obejmuje analizy oglądalności i struktury właścicielskiej mediów.",
        "topics": [
            "media",
            "badania",
            "rynek medialny"
        ],
        "verified": true
    },
    {
        "id": "ipn-home",
        "title": "Instytut Pamięci Narodowej – strona główna",
        "publisher": "Instytut Pamięci Narodowej",
        "url": "https://ipn.gov.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "secondary",
        "lang": "pl",
        "summary": "Oficjalny serwis Instytutu Pamięci Narodowej. Publikuje materiały historyczne, komunikaty o śledztwach i informacje o archiwach.",
        "topics": [
            "historia",
            "ipn",
            "archiwa"
        ],
        "verified": true
    },
    {
        "id": "ipn-aktualnosci",
        "title": "IPN – aktualności",
        "publisher": "Instytut Pamięci Narodowej",
        "url": "https://ipn.gov.pl/pl/aktualnosci",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "secondary",
        "lang": "pl",
        "summary": "Bieżące komunikaty Instytutu Pamięci Narodowej. Dotyczą wydarzeń historycznych, wystaw i postępowań prowadzonych przez IPN.",
        "topics": [
            "ipn",
            "komunikaty",
            "historia"
        ],
        "verified": true
    },
    {
        "id": "ipn-nauka",
        "title": "IPN – działalność naukowa",
        "publisher": "Instytut Pamięci Narodowej",
        "url": "https://ipn.gov.pl/pl/nauka",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "secondary",
        "lang": "pl",
        "summary": "Dział serwisu IPN o działalności naukowej instytutu. Obejmuje publikacje, konferencje i projekty badawcze.",
        "topics": [
            "historia",
            "badania",
            "publikacje"
        ],
        "verified": true
    },
    {
        "id": "ipn-edukacja",
        "title": "IPN – edukacja historyczna",
        "publisher": "Instytut Pamięci Narodowej",
        "url": "https://ipn.gov.pl/pl/edukacja",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "secondary",
        "lang": "pl",
        "summary": "Dział serwisu IPN poświęcony edukacji historycznej. Zawiera materiały dla szkół i opis projektów edukacyjnych.",
        "topics": [
            "edukacja",
            "historia",
            "ipn"
        ],
        "verified": true
    },
    {
        "id": "ipn-archiwa",
        "title": "IPN – archiwa",
        "publisher": "Instytut Pamięci Narodowej",
        "url": "https://ipn.gov.pl/pl/archiwa",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "secondary",
        "lang": "pl",
        "summary": "Dział serwisu IPN opisujący zasób archiwalny instytutu. Zawiera informacje o udostępnianiu dokumentów i kwerendach.",
        "topics": [
            "archiwa",
            "dokumenty",
            "ipn"
        ],
        "verified": true
    },
    {
        "id": "podatki-home",
        "title": "Portal Podatki.gov.pl – informacje podatkowe",
        "publisher": "Ministerstwo Finansów",
        "url": "https://www.podatki.gov.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Portal Ministerstwa Finansów z informacjami podatkowymi. Zawiera opisy obowiązków podatkowych i sposobów rozliczeń.",
        "topics": [
            "podatki",
            "rozliczenia",
            "ministerstwo finansów"
        ],
        "verified": true
    },
    {
        "id": "podatki-pit",
        "title": "Podatki.gov.pl – podatek dochodowy od osób fizycznych (PIT)",
        "publisher": "Ministerstwo Finansów",
        "url": "https://www.podatki.gov.pl/pit/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Dział portalu podatkowego o podatku PIT. Wyjaśnia zasady rozliczania dochodów, ulgi i terminy składania deklaracji.",
        "topics": [
            "pit",
            "podatek dochodowy",
            "ulgi"
        ],
        "verified": true
    },
    {
        "id": "podatki-vat",
        "title": "Podatki.gov.pl – podatek od towarów i usług (VAT)",
        "publisher": "Ministerstwo Finansów",
        "url": "https://www.podatki.gov.pl/vat/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Dział portalu podatkowego o podatku VAT. Zawiera informacje o stawkach, rejestracji i obowiązkach przedsiębiorców.",
        "topics": [
            "vat",
            "podatek",
            "przedsiębiorcy"
        ],
        "verified": true
    },
    {
        "id": "uzp-home",
        "title": "Urząd Zamówień Publicznych – strona główna",
        "publisher": "Urząd Zamówień Publicznych",
        "url": "https://www.uzp.gov.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Oficjalny serwis Urzędu Zamówień Publicznych. Publikuje informacje o systemie zamówień publicznych i kontroli udzielania zamówień.",
        "topics": [
            "zamówienia publiczne",
            "uzp",
            "przetargi"
        ],
        "verified": true
    },
    {
        "id": "uzp-aktualnosci",
        "title": "UZP – aktualności",
        "publisher": "Urząd Zamówień Publicznych",
        "url": "https://www.uzp.gov.pl/aktualnosci",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Bieżące komunikaty Urzędu Zamówień Publicznych. Dotyczą zmian w przepisach i orzecznictwa w zamówieniach publicznych.",
        "topics": [
            "zamówienia publiczne",
            "komunikaty",
            "prawo"
        ],
        "verified": true
    },
    {
        "id": "uzp-baza-wiedzy",
        "title": "UZP – baza wiedzy o zamówieniach publicznych",
        "publisher": "Urząd Zamówień Publicznych",
        "url": "https://www.uzp.gov.pl/baza-wiedzy",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Materiały edukacyjne i wyjaśnienia Urzędu Zamówień Publicznych. Obejmują procedury udzielania zamówień i wzory dokumentów.",
        "topics": [
            "zamówienia publiczne",
            "procedury",
            "dokumenty"
        ],
        "verified": true
    },
    {
        "id": "eu-portal",
        "title": "Unia Europejska – oficjalny portal",
        "publisher": "Unia Europejska",
        "url": "https://european-union.europa.eu/index_pl",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "secondary",
        "lang": "pl",
        "summary": "Oficjalny portal informacyjny Unii Europejskiej. Opisuje instytucje, polityki i zasady funkcjonowania Unii.",
        "topics": [
            "unii europejska",
            "instytucje",
            "polityki"
        ],
        "verified": true
    },
    {
        "id": "eu-instytucje",
        "title": "Unia Europejska – instytucje i organy",
        "publisher": "Unia Europejska",
        "url": "https://european-union.europa.eu/institutions-law-budget_pl",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "secondary",
        "lang": "pl",
        "summary": "Część portalu unijnego opisująca instytucje i organy Unii Europejskiej. Wyjaśnia kompetencje Komisji, Parlamentu, Rady i Trybunału.",
        "topics": [
            "instytucje",
            "unii europejska",
            "kompetencje"
        ],
        "verified": true
    },
    {
        "id": "eu-zasady-panstwa",
        "title": "Unia Europejska – zasady, kraje i historia",
        "publisher": "Unia Europejska",
        "url": "https://european-union.europa.eu/principles-countries-history_pl",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "secondary",
        "lang": "pl",
        "summary": "Część portalu unijnego o zasadach ustrojowych, państwach członkowskich i historii integracji. Zawiera kalendarium rozszerzeń.",
        "topics": [
            "unii europejska",
            "państwa członkowskie",
            "historia"
        ],
        "verified": true
    },
    {
        "id": "eu-zycie-praca-nauka",
        "title": "Unia Europejska – życie, praca i nauka w UE",
        "publisher": "Unia Europejska",
        "url": "https://european-union.europa.eu/live-work-study_pl",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "secondary",
        "lang": "pl",
        "summary": "Część portalu unijnego o życiu, pracy i nauce w Unii Europejskiej. Opisuje prawa obywateli i programy wymiany.",
        "topics": [
            "praca",
            "edukacja",
            "prawa obywateli"
        ],
        "verified": true
    },
    {
        "id": "eurostat-home",
        "title": "Eurostat",
        "publisher": "Komisja Europejska",
        "url": "https://ec.europa.eu/eurostat/web/main/home",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Europejski urzÄ…d statystyczny: dane gospodarcze i spoÅ‚eczne.",
        "topics": [
            "statystyka",
            "ue"
        ],
        "verified": true
    },
    {
        "id": "eurostat-baza",
        "title": "Eurostat – baza danych",
        "publisher": "Komisja Europejska (Eurostat)",
        "url": "https://ec.europa.eu/eurostat/web/main/data/database",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "en",
        "summary": "Baza danych Eurostatu z zestawami wskaźników dla państw europejskich. Pozwala pobierać dane i porównywać kraje.",
        "topics": [
            "baza danych",
            "wskaźniki",
            "statystyka"
        ],
        "verified": true
    },
    {
        "id": "eurostat-ludnosc",
        "title": "Eurostat – ludność i demografia",
        "publisher": "Komisja Europejska (Eurostat)",
        "url": "https://ec.europa.eu/eurostat/web/population-demography",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "en",
        "summary": "Dział Eurostatu z danymi o ludności i demografii. Obejmuje liczbę mieszkańców, migracje i strukturę wieku w państwach Unii.",
        "topics": [
            "ludność",
            "demografia",
            "migracje"
        ],
        "verified": true
    },
    {
        "id": "eurostat-rynek-pracy",
        "title": "Eurostat – rynek pracy",
        "publisher": "Komisja Europejska (Eurostat)",
        "url": "https://ec.europa.eu/eurostat/web/labour-market",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "en",
        "summary": "Dział Eurostatu z danymi o rynku pracy. Zawiera zharmonizowane stopy bezrobocia i wskaźniki zatrudnienia.",
        "topics": [
            "rynek pracy",
            "bezrobocie",
            "zatrudnienie"
        ],
        "verified": true
    },
    {
        "id": "who-home",
        "title": "World Health Organization – strona główna",
        "publisher": "World Health Organization",
        "url": "https://www.who.int/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "secondary",
        "lang": "en",
        "summary": "Oficjalny serwis Światowej Organizacji Zdrowia. Publikuje komunikaty o zagrożeniach zdrowotnych i wytyczne dla państw.",
        "topics": [
            "zdrowie",
            "who",
            "zdrowie publiczne"
        ],
        "verified": true
    },
    {
        "id": "who-fact-sheets",
        "title": "WHO – zestawienia faktów o chorobach i zagrożeniach",
        "publisher": "World Health Organization",
        "url": "https://www.who.int/news-room/fact-sheets",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "secondary",
        "lang": "en",
        "summary": "Katalog zestawień faktów WHO dotyczących chorób i zagrożeń zdrowotnych. Podsumowuje dane epidemiologiczne i zalecenia.",
        "topics": [
            "zdrowie",
            "choroby",
            "dane epidemiologiczne"
        ],
        "verified": true
    },
    {
        "id": "who-europe",
        "title": "WHO Regional Office for Europe – serwis regionalny",
        "publisher": "World Health Organization",
        "url": "https://www.who.int/europe/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "secondary",
        "lang": "en",
        "summary": "Serwis biura regionalnego WHO dla Europy. Publikuje dane i wytyczne zdrowotne dla regionu europejskiego.",
        "topics": [
            "zdrowie",
            "europa",
            "who"
        ],
        "verified": true
    },
    {
        "id": "gov-msz",
        "title": "Ministerstwo Spraw Zagranicznych",
        "publisher": "Ministerstwo Spraw Zagranicznych",
        "url": "https://www.gov.pl/web/msz",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Oficjalny serwis MSZ: polityka zagraniczna, komunikaty, stanowiska.",
        "topics": [
            "dyplomacja",
            "polityka zagraniczna"
        ],
        "verified": true
    },
    {
        "id": "gov-mswia",
        "title": "Ministerstwo Spraw WewnÄ™trznych i Administracji",
        "publisher": "MSWiA",
        "url": "https://www.gov.pl/web/mswia",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Komunikaty MSWiA: bezpieczeÅ„stwo, administracja, migracje.",
        "topics": [
            "bezpieczeÅ„stwo",
            "administracja"
        ],
        "verified": true
    },
    {
        "id": "gov-edukacja",
        "title": "Ministerstwo Edukacji Narodowej",
        "publisher": "MEN",
        "url": "https://www.gov.pl/web/edukacja",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Informacje o oÅ›wiacie i systemie edukacji.",
        "topics": [
            "edukacja",
            "szkoÅ‚y"
        ],
        "verified": true
    },
    {
        "id": "gov-nauka",
        "title": "Ministerstwo Nauki i Szkolnictwa WyÅ¼szego",
        "publisher": "MNISW",
        "url": "https://www.gov.pl/web/nauka",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Komunikaty o nauce, szkolnictwie wyÅ¼szym i finansowaniu badaÅ„.",
        "topics": [
            "nauka",
            "uczelnie"
        ],
        "verified": true
    },
    {
        "id": "gov-infrastruktura",
        "title": "Ministerstwo Infrastruktury",
        "publisher": "Ministerstwo Infrastruktury",
        "url": "https://www.gov.pl/web/infrastruktura",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Komunikaty o transporcie, drogach i infrastrukturze.",
        "topics": [
            "transport",
            "infrastruktura"
        ],
        "verified": true
    },
    {
        "id": "gov-rolnictwo",
        "title": "Ministerstwo Rolnictwa i Rozwoju Wsi",
        "publisher": "MRiRW",
        "url": "https://www.gov.pl/web/rolnictwo",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Informacje o rolnictwie, dopÅ‚atach i rynkach rolnych.",
        "topics": [
            "rolnictwo",
            "dopÅ‚aty"
        ],
        "verified": true
    },
    {
        "id": "gov-kultura",
        "title": "Ministerstwo Kultury i Dziedzictwa Narodowego",
        "publisher": "MKiDN",
        "url": "https://www.gov.pl/web/kultura",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Komunikaty o kulturze i dziedzictwie narodowym.",
        "topics": [
            "kultura",
            "dziedzictwo"
        ],
        "verified": true
    },
    {
        "id": "gov-sport",
        "title": "Ministerstwo Sportu i Turystyki",
        "publisher": "MSiT",
        "url": "https://www.gov.pl/web/sport",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Informacje o sporcie i turystyce.",
        "topics": [
            "sport",
            "turystyka"
        ],
        "verified": true
    },
    {
        "id": "gov-fundusze",
        "title": "Fundusze Europejskie",
        "publisher": "Ministerstwo Funduszy i Polityki Regionalnej",
        "url": "https://www.gov.pl/web/fundusze-regiony",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Informacje o funduszach unijnych i polityce regionalnej.",
        "topics": [
            "fundusze unijne",
            "regiony"
        ],
        "verified": true
    },
    {
        "id": "gov-aktywizacja",
        "title": "Ministerstwo Aktywizacji Zawodowej",
        "publisher": "Ministerstwo Aktywizacji Zawodowej",
        "url": "https://www.gov.pl/web/aktywizacja",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Informacje o rynku pracy i aktywizacji zawodowej.",
        "topics": [
            "praca",
            "zatrudnienie"
        ],
        "verified": true
    },
    {
        "id": "gov-seniorzy",
        "title": "Polityka senioralna",
        "publisher": "Ministerstwo ds. SeniorÃ³w",
        "url": "https://www.gov.pl/web/seniorzy",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Informacje o polityce senioralnej i wsparciu osÃ³b starszych.",
        "topics": [
            "seniorzy",
            "polityka spoÅ‚eczna"
        ],
        "verified": true
    },
    {
        "id": "gov-rozwoj",
        "title": "Ministerstwo Rozwoju i Technologii",
        "publisher": "MRiT",
        "url": "https://www.gov.pl/web/rozwoj-technologia",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Komunikaty o rozwoju gospodarczym, budownictwie i technologii.",
        "topics": [
            "gospodarka",
            "budownictwo"
        ],
        "verified": true
    },
    {
        "id": "gov-kprm",
        "title": "Kancelaria Prezesa Rady MinistrÃ³w",
        "publisher": "KPRM",
        "url": "https://www.gov.pl/web/kprm",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Serwis KPRM: organizacja rzÄ…du, komunikaty, obsÅ‚uga Rady MinistrÃ³w.",
        "topics": [
            "rzÄ…d",
            "administracja"
        ],
        "verified": true
    },
    {
        "id": "nik",
        "title": "NajwyÅ¼sza Izba Kontroli",
        "publisher": "NIK",
        "url": "https://www.nik.gov.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Wyniki kontroli NIK i informacje o wydatkach publicznych.",
        "topics": [
            "kontrola",
            "finanse publiczne"
        ],
        "verified": true
    },
    {
        "id": "rpo",
        "title": "Rzecznik Praw Obywatelskich",
        "publisher": "RPO",
        "url": "https://www.rpo.gov.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Stanowiska i interwencje Rzecznika Praw Obywatelskich.",
        "topics": [
            "prawa czÅ‚owieka",
            "interwencje"
        ],
        "verified": true
    },
    {
        "id": "trybunal",
        "title": "TrybunaÅ‚ Konstytucyjny",
        "publisher": "TrybunaÅ‚ Konstytucyjny",
        "url": "https://trybunal.gov.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Orzeczenia i komunikaty TrybunaÅ‚u Konstytucyjnego.",
        "topics": [
            "prawo",
            "orzecznictwo"
        ],
        "verified": true
    },
    {
        "id": "sn",
        "title": "SÄ…d NajwyÅ¼szy",
        "publisher": "SÄ…d NajwyÅ¼szy",
        "url": "https://www.sn.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Orzeczenia i informacje SÄ…du NajwyÅ¼szego.",
        "topics": [
            "prawo",
            "sÄ…downictwo"
        ],
        "verified": true
    },
    {
        "id": "uke",
        "title": "UrzÄ…d Komunikacji Elektronicznej",
        "publisher": "UKE",
        "url": "https://www.uke.gov.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Informacje o rynku telekomunikacyjnym i pocztowym.",
        "topics": [
            "telekomunikacja",
            "rynek"
        ],
        "verified": true
    },
    {
        "id": "krus",
        "title": "Kasa Rolniczego Ubezpieczenia SpoÅ‚ecznego",
        "publisher": "KRUS",
        "url": "https://www.krus.gov.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Informacje o ubezpieczeniu rolnikÃ³w i Å›wiadczeniach.",
        "topics": [
            "rolnictwo",
            "ubezpieczenia"
        ],
        "verified": true
    },
    {
        "id": "parp",
        "title": "Polska Agencja Rozwoju PrzedsiÄ™biorczoÅ›ci",
        "publisher": "PARP",
        "url": "https://www.parp.gov.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Programy wsparcia przedsiÄ™biorczoÅ›ci i dane o MÅšP.",
        "topics": [
            "przedsiÄ™biorczoÅ›Ä‡",
            "wsparcie"
        ],
        "verified": true
    },
    {
        "id": "paih",
        "title": "Polska Agencja Inwestycji i Handlu",
        "publisher": "PAIH",
        "url": "https://www.paih.gov.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Informacje o inwestycjach i handlu zagranicznym.",
        "topics": [
            "inwestycje",
            "handel"
        ],
        "verified": true
    },
    {
        "id": "ncn",
        "title": "Narodowe Centrum Nauki",
        "publisher": "NCN",
        "url": "https://www.ncn.gov.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Konkursy i finansowanie badaÅ„ podstawowych.",
        "topics": [
            "nauka",
            "granty"
        ],
        "verified": true
    },
    {
        "id": "nawa",
        "title": "Narodowa Agencja Wymiany Akademickiej",
        "publisher": "NAWA",
        "url": "https://www.nawa.gov.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Programy wymiany akademickiej i stypendia.",
        "topics": [
            "nauka",
            "stypendia"
        ],
        "verified": true
    },
    {
        "id": "biznes",
        "title": "Biznes.gov.pl",
        "publisher": "Ministerstwo Rozwoju i Technologii",
        "url": "https://www.biznes.gov.pl/pl",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Oficjalny serwis informacyjno-usÅ‚ugowy dla przedsiÄ™biorcÃ³w.",
        "topics": [
            "biznes",
            "usÅ‚ugi publiczne"
        ],
        "verified": true
    },
    {
        "id": "knf",
        "title": "Komisja Nadzoru Finansowego",
        "publisher": "KNF",
        "url": "https://www.knf.gov.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "NadzÃ³r nad rynkiem finansowym, ostrzeÅ¼enia i decyzje.",
        "topics": [
            "finanse",
            "nadzÃ³r"
        ],
        "verified": true
    },
    {
        "id": "eu-commission-pl",
        "title": "Komisja Europejska (PL)",
        "publisher": "Komisja Europejska",
        "url": "https://commission.europa.eu/index_pl",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Oficjalny serwis Komisji Europejskiej po polsku.",
        "topics": [
            "ue",
            "komisja europejska"
        ],
        "verified": true
    },
    {
        "id": "eu-parlament-pl",
        "title": "Parlament Europejski (PL)",
        "publisher": "Parlament Europejski",
        "url": "https://www.europarl.europa.eu/portal/pl",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Oficjalny portal Parlamentu Europejskiego.",
        "topics": [
            "ue",
            "parlament"
        ],
        "verified": true
    },
    {
        "id": "eeas",
        "title": "Europejska SÅ‚uÅ¼ba DziaÅ‚aÅ„ ZewnÄ™trznych",
        "publisher": "EEAS",
        "url": "https://www.eeas.europa.eu/_en",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "primary",
        "lang": "pl",
        "summary": "Dyplomacja UE, oÅ›wiadczenia i przeciwdziaÅ‚anie dezinformacji.",
        "topics": [
            "ue",
            "dyplomacja"
        ],
        "verified": true
    },
    {
        "id": "pap",
        "title": "Polska Agencja Prasowa",
        "publisher": "PAP",
        "url": "https://www.pap.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "secondary",
        "lang": "pl",
        "summary": "Depesze i materiaÅ‚y Polskiej Agencji Prasowej.",
        "topics": [
            "wiadomoÅ›ci",
            "agencja"
        ],
        "verified": true
    },
    {
        "id": "rmf24",
        "title": "RMF24",
        "publisher": "RMF FM",
        "url": "https://www.rmf24.pl/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "secondary",
        "lang": "pl",
        "summary": "Serwis informacyjny RMF FM.",
        "topics": [
            "wiadomoÅ›ci",
            "media"
        ],
        "verified": true
    },
    {
        "id": "tvpinfo",
        "title": "TVP Info",
        "publisher": "TVP",
        "url": "https://www.tvp.info/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "secondary",
        "lang": "pl",
        "summary": "Serwis informacyjny TVP Info.",
        "topics": [
            "wiadomoÅ›ci",
            "media"
        ],
        "verified": true
    },
    {
        "id": "fullfact",
        "title": "Full Fact",
        "publisher": "Full Fact",
        "url": "https://fullfact.org/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "fact_check",
        "lang": "en",
        "summary": "Brytyjska organizacja fact-checkingowa (IFCN).",
        "topics": [
            "fact-checking",
            "en"
        ],
        "verified": true
    },
    {
        "id": "snopes",
        "title": "Snopes",
        "publisher": "Snopes",
        "url": "https://www.snopes.com/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "fact_check",
        "lang": "en",
        "summary": "Serwis fact-checkingowy weryfikujÄ…cy viralowe treÅ›ci.",
        "topics": [
            "fact-checking",
            "en"
        ],
        "verified": true
    },
    {
        "id": "politifact",
        "title": "PolitiFact",
        "publisher": "PolitiFact",
        "url": "https://www.politifact.com/",
        "publishedAt": null,
        "retrievedAt": "2026-11-22T01:15:23.986Z",
        "type": "fact_check",
        "lang": "en",
        "summary": "AmerykaÅ„ski projekt fact-checkingowy (Pulitzer).",
        "topics": [
            "fact-checking",
            "en"
        ],
        "verified": true
    }
];
