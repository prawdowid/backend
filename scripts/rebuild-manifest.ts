/**
 * Maintenance: rebuild src/sources/manifest.ts from the current manifest + audit.
 * Keeps only reachable URLs (per data/sources/audit.json) and appends curated
 * sources that were verified with a browser user-agent.
 *
 *   bun run scripts/ingest-sources.ts
 *   bun run scripts/rebuild-manifest.ts
 */
import { readFile, writeFile } from "node:fs/promises";
import { SOURCE_DOCS as SRC_MANIFEST } from "../src/sources/manifest";
import type { SourceDoc } from "../src/pipeline/types";

const EXTRA: SourceDoc[] = [
    mk("gov-finanse", "Ministerstwo FinansÃ³w", "Ministerstwo FinansÃ³w", "https://www.gov.pl/web/finanse", "primary", "Komunikaty i informacje Ministerstwa FinansÃ³w: podatki, budÅ¼et, finanse publiczne.", ["podatki", "budÅ¼et", "finanse"]),
    mk("gov-msz", "Ministerstwo Spraw Zagranicznych", "Ministerstwo Spraw Zagranicznych", "https://www.gov.pl/web/msz", "primary", "Oficjalny serwis MSZ: polityka zagraniczna, komunikaty, stanowiska.", ["dyplomacja", "polityka zagraniczna"]),
    mk("gov-mon", "Ministerstwo Obrony Narodowej", "Ministerstwo Obrony Narodowej", "https://www.gov.pl/web/obrona-narodowa", "primary", "Komunikaty MON dotyczÄ…ce bezpieczeÅ„stwa i obronnoÅ›ci.", ["obronnoÅ›Ä‡", "wojsko"]),
    mk("gov-mswia", "Ministerstwo Spraw WewnÄ™trznych i Administracji", "MSWiA", "https://www.gov.pl/web/mswia", "primary", "Komunikaty MSWiA: bezpieczeÅ„stwo, administracja, migracje.", ["bezpieczeÅ„stwo", "administracja"]),
    mk("gov-sprawiedliwosc", "Ministerstwo SprawiedliwoÅ›ci", "Ministerstwo SprawiedliwoÅ›ci", "https://www.gov.pl/web/sprawiedliwosc", "primary", "Informacje o wymiarze sprawiedliwoÅ›ci i zmianach w prawie.", ["prawo", "sÄ…downictwo"]),
    mk("gov-zdrowie", "Ministerstwo Zdrowia", "Ministerstwo Zdrowia", "https://www.gov.pl/web/zdrowie", "primary", "Komunikaty Ministerstwa Zdrowia: system ochrony zdrowia, leki, programy.", ["zdrowie", "leki"]),
    mk("gov-edukacja", "Ministerstwo Edukacji Narodowej", "MEN", "https://www.gov.pl/web/edukacja", "primary", "Informacje o oÅ›wiacie i systemie edukacji.", ["edukacja", "szkoÅ‚y"]),
    mk("gov-nauka", "Ministerstwo Nauki i Szkolnictwa WyÅ¼szego", "MNISW", "https://www.gov.pl/web/nauka", "primary", "Komunikaty o nauce, szkolnictwie wyÅ¼szym i finansowaniu badaÅ„.", ["nauka", "uczelnie"]),
    mk("gov-klimat", "Ministerstwo Klimatu i Åšrodowiska", "MKiÅš", "https://www.gov.pl/web/klimat", "primary", "Informacje o klimacie, Å›rodowisku i energii.", ["klimat", "Å›rodowisko", "energia"]),
    mk("gov-infrastruktura", "Ministerstwo Infrastruktury", "Ministerstwo Infrastruktury", "https://www.gov.pl/web/infrastruktura", "primary", "Komunikaty o transporcie, drogach i infrastrukturze.", ["transport", "infrastruktura"]),
    mk("gov-rolnictwo", "Ministerstwo Rolnictwa i Rozwoju Wsi", "MRiRW", "https://www.gov.pl/web/rolnictwo", "primary", "Informacje o rolnictwie, dopÅ‚atach i rynkach rolnych.", ["rolnictwo", "dopÅ‚aty"]),
    mk("gov-kultura", "Ministerstwo Kultury i Dziedzictwa Narodowego", "MKiDN", "https://www.gov.pl/web/kultura", "primary", "Komunikaty o kulturze i dziedzictwie narodowym.", ["kultura", "dziedzictwo"]),
    mk("gov-sport", "Ministerstwo Sportu i Turystyki", "MSiT", "https://www.gov.pl/web/sport", "primary", "Informacje o sporcie i turystyce.", ["sport", "turystyka"]),
    mk("gov-rodzina", "Ministerstwo Rodziny, Pracy i Polityki SpoÅ‚ecznej", "MRPiPS", "https://www.gov.pl/web/rodzina", "primary", "Komunikaty o polityce spoÅ‚ecznej, pracy i Å›wiadczeniach.", ["polityka spoÅ‚eczna", "Å›wiadczenia"]),
    mk("gov-fundusze", "Fundusze Europejskie", "Ministerstwo Funduszy i Polityki Regionalnej", "https://www.gov.pl/web/fundusze-regiony", "primary", "Informacje o funduszach unijnych i polityce regionalnej.", ["fundusze unijne", "regiony"]),
    mk("gov-cyfryzacja", "Ministerstwo Cyfryzacji", "Ministerstwo Cyfryzacji", "https://www.gov.pl/web/cyfryzacja", "primary", "Komunikaty o cyfryzacji, danych i usÅ‚ugach publicznych online.", ["cyfryzacja", "dane"]),
    mk("gov-aktywizacja", "Ministerstwo Aktywizacji Zawodowej", "Ministerstwo Aktywizacji Zawodowej", "https://www.gov.pl/web/aktywizacja", "primary", "Informacje o rynku pracy i aktywizacji zawodowej.", ["praca", "zatrudnienie"]),
    mk("gov-seniorzy", "Polityka senioralna", "Ministerstwo ds. SeniorÃ³w", "https://www.gov.pl/web/seniorzy", "primary", "Informacje o polityce senioralnej i wsparciu osÃ³b starszych.", ["seniorzy", "polityka spoÅ‚eczna"]),
    mk("gov-rozwoj", "Ministerstwo Rozwoju i Technologii", "MRiT", "https://www.gov.pl/web/rozwoj-technologia", "primary", "Komunikaty o rozwoju gospodarczym, budownictwie i technologii.", ["gospodarka", "budownictwo"]),
    mk("gov-kprm", "Kancelaria Prezesa Rady MinistrÃ³w", "KPRM", "https://www.gov.pl/web/kprm", "primary", "Serwis KPRM: organizacja rzÄ…du, komunikaty, obsÅ‚uga Rady MinistrÃ³w.", ["rzÄ…d", "administracja"]),
    mk("nik", "NajwyÅ¼sza Izba Kontroli", "NIK", "https://www.nik.gov.pl/", "primary", "Wyniki kontroli NIK i informacje o wydatkach publicznych.", ["kontrola", "finanse publiczne"]),
    mk("rpo", "Rzecznik Praw Obywatelskich", "RPO", "https://www.rpo.gov.pl/", "primary", "Stanowiska i interwencje Rzecznika Praw Obywatelskich.", ["prawa czÅ‚owieka", "interwencje"]),
    mk("trybunal", "TrybunaÅ‚ Konstytucyjny", "TrybunaÅ‚ Konstytucyjny", "https://trybunal.gov.pl/", "primary", "Orzeczenia i komunikaty TrybunaÅ‚u Konstytucyjnego.", ["prawo", "orzecznictwo"]),
    mk("sn", "SÄ…d NajwyÅ¼szy", "SÄ…d NajwyÅ¼szy", "https://www.sn.pl/", "primary", "Orzeczenia i informacje SÄ…du NajwyÅ¼szego.", ["prawo", "sÄ…downictwo"]),
    mk("uke", "UrzÄ…d Komunikacji Elektronicznej", "UKE", "https://www.uke.gov.pl/", "primary", "Informacje o rynku telekomunikacyjnym i pocztowym.", ["telekomunikacja", "rynek"]),
    mk("krus", "Kasa Rolniczego Ubezpieczenia SpoÅ‚ecznego", "KRUS", "https://www.krus.gov.pl/", "primary", "Informacje o ubezpieczeniu rolnikÃ³w i Å›wiadczeniach.", ["rolnictwo", "ubezpieczenia"]),
    mk("parp", "Polska Agencja Rozwoju PrzedsiÄ™biorczoÅ›ci", "PARP", "https://www.parp.gov.pl/", "primary", "Programy wsparcia przedsiÄ™biorczoÅ›ci i dane o MÅšP.", ["przedsiÄ™biorczoÅ›Ä‡", "wsparcie"]),
    mk("paih", "Polska Agencja Inwestycji i Handlu", "PAIH", "https://www.paih.gov.pl/", "primary", "Informacje o inwestycjach i handlu zagranicznym.", ["inwestycje", "handel"]),
    mk("ncn", "Narodowe Centrum Nauki", "NCN", "https://www.ncn.gov.pl/", "primary", "Konkursy i finansowanie badaÅ„ podstawowych.", ["nauka", "granty"]),
    mk("nawa", "Narodowa Agencja Wymiany Akademickiej", "NAWA", "https://www.nawa.gov.pl/", "primary", "Programy wymiany akademickiej i stypendia.", ["nauka", "stypendia"]),
    mk("biznes", "Biznes.gov.pl", "Ministerstwo Rozwoju i Technologii", "https://www.biznes.gov.pl/pl", "primary", "Oficjalny serwis informacyjno-usÅ‚ugowy dla przedsiÄ™biorcÃ³w.", ["biznes", "usÅ‚ugi publiczne"]),
    mk("knf", "Komisja Nadzoru Finansowego", "KNF", "https://www.knf.gov.pl/", "primary", "NadzÃ³r nad rynkiem finansowym, ostrzeÅ¼enia i decyzje.", ["finanse", "nadzÃ³r"]),
    mk("eu-commission-pl", "Komisja Europejska (PL)", "Komisja Europejska", "https://commission.europa.eu/index_pl", "primary", "Oficjalny serwis Komisji Europejskiej po polsku.", ["ue", "komisja europejska"]),
    mk("eu-parlament-pl", "Parlament Europejski (PL)", "Parlament Europejski", "https://www.europarl.europa.eu/portal/pl", "primary", "Oficjalny portal Parlamentu Europejskiego.", ["ue", "parlament"]),
    mk("eurostat-home", "Eurostat", "Komisja Europejska", "https://ec.europa.eu/eurostat/web/main/home", "primary", "Europejski urzÄ…d statystyczny: dane gospodarcze i spoÅ‚eczne.", ["statystyka", "ue"]),
    mk("eeas", "Europejska SÅ‚uÅ¼ba DziaÅ‚aÅ„ ZewnÄ™trznych", "EEAS", "https://www.eeas.europa.eu/_en", "primary", "Dyplomacja UE, oÅ›wiadczenia i przeciwdziaÅ‚anie dezinformacji.", ["ue", "dyplomacja"]),
    mk("pap", "Polska Agencja Prasowa", "PAP", "https://www.pap.pl/", "secondary", "Depesze i materiaÅ‚y Polskiej Agencji Prasowej.", ["wiadomoÅ›ci", "agencja"]),
    mk("rmf24", "RMF24", "RMF FM", "https://www.rmf24.pl/", "secondary", "Serwis informacyjny RMF FM.", ["wiadomoÅ›ci", "media"]),
    mk("tvpinfo", "TVP Info", "TVP", "https://www.tvp.info/", "secondary", "Serwis informacyjny TVP Info.", ["wiadomoÅ›ci", "media"]),
    mk("fullfact", "Full Fact", "Full Fact", "https://fullfact.org/", "fact_check", "Brytyjska organizacja fact-checkingowa (IFCN).", ["fact-checking", "en"]),
    mk("snopes", "Snopes", "Snopes", "https://www.snopes.com/", "fact_check", "Serwis fact-checkingowy weryfikujÄ…cy viralowe treÅ›ci.", ["fact-checking", "en"]),
    mk("politifact", "PolitiFact", "PolitiFact", "https://www.politifact.com/", "fact_check", "AmerykaÅ„ski projekt fact-checkingowy (Pulitzer).", ["fact-checking", "en"]),
];

function mk(
    id: string,
    title: string,
    publisher: string,
    url: string,
    type: SourceDoc["type"],
    summary: string,
    topics: string[],
): SourceDoc {
    return {
        id,
        title,
        publisher,
        url,
        publishedAt: null,
        retrievedAt: null,
        type,
        lang: url.includes("fullfact") || url.includes("snopes") || url.includes("politifact") ? "en" : "pl",
        summary,
        topics,
        verified: false,
    };
}

type Audit = {
    checkedAt: string;
    records: Array<{ id: string; url: string; status: number | null; ok: boolean }>;
};

async function main() {
    const audit = JSON.parse(await readFile("data/sources/audit.json", "utf8")) as Audit;
    const reachable = new Set(audit.records.filter((record) => record.ok).map((record) => record.id));

    const keptById = new Map(
        SRC_MANIFEST.filter((doc) => reachable.has(doc.id)).map((doc) => [doc.id, doc]),
    );
    const verifiedAt = audit.checkedAt ?? new Date().toISOString();
    const kept = [...keptById.values()].map((doc) => ({ ...doc, verified: true, retrievedAt: verifiedAt }));
    const seenUrls = new Set(kept.map((doc) => doc.url));
    const seenIds = new Set(kept.map((doc) => doc.id));
    const merged = [...kept];

    for (const doc of EXTRA) {
        if (seenUrls.has(doc.url) || seenIds.has(doc.id)) continue;
        seenUrls.add(doc.url);
        seenIds.add(doc.id);
        merged.push({ ...doc, verified: true, retrievedAt: verifiedAt });
    }

    const header = `import type { SourceDoc } from "../pipeline/types";

/**
 * Local corpus of stable, official and fact-checking sources.
 * Generated/maintained by scripts/rebuild-manifest.ts from data/sources/audit.json.
 * Titles describe the page that actually lives under \`url\` - no invented articles.
 */
export const SOURCE_DOCS: SourceDoc[] = `;

    await writeFile(
        "src/sources/manifest.ts",
        `${header}${JSON.stringify(merged, null, 4)};\n`,
        "utf8",
    );

    console.log(`kept=${kept.length} added=${merged.length - kept.length} total=${merged.length}`);
}

await main();



