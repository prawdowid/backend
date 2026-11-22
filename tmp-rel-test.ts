import "dotenv/config";
import { relationLookup, buildRelationQueries } from "./src/research/wikipedia-rel";
import type { ClaimInput } from "./src/pipeline/types";

type Case = {
    id: string;
    text: string;
    expected: "supports" | "refutes" | null;
    fact: NonNullable<ClaimInput["fact"]>;
};

const cases: Case[] = [
    { id: "case-01", text: "Warszawa jest stolicą Polski.", expected: "supports",
      fact: { s: "Warszawa", p: "capital_of", o: "Polska" } },
    { id: "case-02", text: "Polska wstąpiła do Unii Europejskiej 1 maja 2004 roku.", expected: "supports",
      fact: { s: "Polska", p: "accession_to", o: "Unia Europejska", t: "2004-05-01" } },
    { id: "case-03", text: "Sejm Rzeczypospolitej Polskiej liczy 460 posłów.", expected: "supports",
      fact: { s: "Sejm Rzeczypospolitej Polskiej", p: "number_of_members", o: 460 } },
    { id: "case-04", text: "Stolicą Polski jest Kraków.", expected: "refutes",
      fact: { s: "Kraków", p: "capital_of", o: "Polska" } },
    { id: "case-05", text: "Polska przyjęła walutę euro w 2010 roku.", expected: "refutes",
      fact: { s: "Polska", p: "adopt_currency", o: "euro", t: "2010" } },
    { id: "case-08", text: "W 2020 roku wybory prezydenckie w Polsce wygrał Andrzej Duda.", expected: "supports",
      fact: { s: "Andrzej Duda", p: "won_election", o: "wybory prezydenckie", t: "2020" } },
    { id: "case-09", text: "Polska jest obecnie członkiem strefy euro.", expected: "refutes",
      fact: { s: "Polska", p: "member_of", o: "strefa euro" } },
    { id: "case-10", text: "W 2024 roku premierem Polski był Mateusz Morawiecki.", expected: "refutes",
      fact: { s: "Mateusz Morawiecki", p: "prime_minister_of", o: "Polska", t: "2024" } },
    { id: "case-11", text: "Polska przystąpiła do NATO w 2004 roku.", expected: "refutes",
      fact: { s: "Polska", p: "member_of", o: "NATO", t: "2004" } },
    { id: "case-12", text: "W wyborach prezydenckich w 2020 roku Andrzej Duda przegrał z Rafałem Trzaskowskim.", expected: "refutes",
      fact: { s: "Andrzej Duda", p: "lost_election", o: "Rafał Trzaskowski", t: "2020" } },
    { id: "case-13", text: "W 2020 roku Andrzej Duda wygrał wybory prezydenckie już w pierwszej turze.", expected: "refutes",
      fact: { s: "Andrzej Duda", p: "won_election", o: "pierwsza tura wyborów prezydenckich", t: "2020" } },
    { id: "case-14", text: "Wisła ma 2047 kilometrów długości.", expected: "refutes",
      fact: { s: "Wisła", p: "length", o: 2047 } },
    { id: "case-07", text: "W 2014 roku prezydentem Polski był Bronisław Komorowski.", expected: "supports",
      fact: { s: "Bronisław Komorowski", p: "president_of", o: "Polska", t: "2014" } },
];

const only = process.env["ONLY"];

let correct = 0;
let decisive = 0;

for (const testCase of cases) {
    if (only && !only.split(",").includes(testCase.id)) continue;
    const claim: ClaimInput = {
        id: testCase.id,
        text: testCase.text,
        quote: "",
        details: "",
        fact: testCase.fact,
    };

    const queries = buildRelationQueries(claim);
    const started = Date.now();
    let result;
    try {
        result = await relationLookup(claim);
    } catch (error) {
        console.log(`\n${testCase.id} ERROR ${String(error)}`);
        continue;
    }
    const ms = Date.now() - started;

    const ok = result?.relation === testCase.expected;
    if (result?.relation) decisive++;
    if (ok) correct++;

    console.log(`\n${testCase.id} expected=${testCase.expected} got=${result?.relation ?? "null"} ${ok ? "OK" : "MISS"} (${ms} ms)`);
    console.log(`  queries: ${JSON.stringify(queries)}`);
    console.log(`  sentence: ${result?.sentence?.slice(0, 220) ?? "-"}`);
    console.log(`  url: ${result?.url ?? "-"}`);
}

console.log(`\nSUMMARY decisive=${decisive} correct=${correct}`);
