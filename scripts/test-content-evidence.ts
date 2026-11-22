/**
 * Test: evidence must come from the fetched page text, not the manifest summary.
 * Run with: bun run scripts/test-content-evidence.ts
 */
import "dotenv/config";
import { researchClaims } from "../src/research";
import { SOURCE_DOCS } from "../src/sources/manifest";
import type { ClaimInput, ClaimVerdict } from "../src/pipeline/types";

const FACT = {
    s: "Główny Urząd Statystyczny",
    p: "publikuje",
    o: "inflacja",
};

function claimWith(id: string, neg: boolean): ClaimInput {
    return {
        id,
        text: "Główny Urząd Statystyczny publikuje dane o inflacji.",
        quote: "",
        details: "",
        fact: { ...FACT, ...(neg ? { neg: true } : {}) },
    };
}

const sumaryByUrl = new Map(
    SOURCE_DOCS.map((doc) => [doc.url.toLowerCase(), doc.summary.replace(/\s+/g, " ").trim()]),
);

function report(label: string, verdict: ClaimVerdict): void {
    console.log(`\n### ${label} -> verdict=${verdict.verdict}`);
    console.log(`   limitations: ${JSON.stringify(verdict.limitations)}`);
    for (const item of verdict.evidence) {
        const summary = sumaryByUrl.get(item.url.toLowerCase());
        const fromContent = summary !== undefined && item.excerpt !== summary;
        console.log(`   [${item.relation}] ${item.type} ${item.url}`);
        console.log(`      from-content=${fromContent} excerpt=${JSON.stringify(item.excerpt.slice(0, 160))}`);
    }
}

const started = Date.now();
const offline = await researchClaims([claimWith("off", false)], { offline: true });
report("offline (no fetch, context only)", offline.claims[0]!);
console.log(`   total ${Date.now() - started} ms`);

const onlineStarted = Date.now();
const online = await researchClaims([claimWith("on", false)], { offline: false });
const onlineVerdict = online.claims[0]!;
report("online (content fetch)", onlineVerdict);
console.log(`   total ${Date.now() - onlineStarted} ms`);

const negStarted = Date.now();
const neg = await researchClaims([claimWith("neg", true)], { offline: false });
const negVerdict = neg.claims[0]!;
report("online, claim.fact.neg = true", negVerdict);
console.log(`   total ${Date.now() - negStarted} ms`);

let failures = 0;

if (offline.claims[0]!.evidence.some((item) => item.relation !== "context")) {
    console.log("\nFAIL: offline run upgraded a relation");
    failures++;
}

const contentEvidence = onlineVerdict.evidence.filter((item) => {
    const summary = sumaryByUrl.get(item.url.toLowerCase());
    return summary !== undefined && item.excerpt !== summary;
});
if (contentEvidence.length === 0) {
    console.log("\nWARN: no evidence excerpt came from fetched content (timeout/blocked)");
}

// Safety property: anything upgraded to supports/refutes must quote actual page
// text that names the subject and the object, not a navigation menu.
for (const item of onlineVerdict.evidence) {
    if (item.relation === "context") continue;
    const text = item.excerpt.toLowerCase();
    const looksLikeProof = text.includes("statystyczny") && text.includes("inflac");
    if (!looksLikeProof) {
        console.log(`\nFAIL: upgraded relation without a matching sentence: ${item.relation}`);
        failures++;
    }
}

if (negVerdict.evidence.some((item) => item.relation === "supports")) {
    console.log("\nFAIL: negated claim got 'supports'");
    failures++;
}
if (negVerdict.evidence.some((item) => item.relation === "refutes") === false) {
    console.log("\nWARN: negated claim got no 'refutes' (fetch may have timed out)");
}

const supports = onlineVerdict.evidence.filter((item) => item.relation === "supports").length;
console.log(`\nINFO: supports=${supports} context=${onlineVerdict.evidence.length - supports}`);

console.log(failures === 0 ? "\nOK" : `\nFAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
