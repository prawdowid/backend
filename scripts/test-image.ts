/**
 * Manual smoke test for the image input: reads a file, sends it as base64 to
 * verifyInput({ image }) and prints status, claims, limitations and timing.
 *
 * Usage:
 *   bun run scripts/test-image.ts [path]
 *   TEST_IMAGE=path bun run scripts/test-image.ts
 */
import "dotenv/config";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { verifyInput } from "../src/pipeline/verify";

const DEFAULT_IMAGE =
    "C:\\Users\\admin\\Documents\\GitHub\\hackathon\\DANE\\do_udostępnienia\\1\\Zrzut ekranu 2026-10-09 082411.png";

const path = process.env["TEST_IMAGE"] || process.argv[2] || DEFAULT_IMAGE;
const absolute = resolve(path);

try {
    const info = await stat(absolute);
    if (!info.isFile()) throw new Error("to nie jest plik");

    console.log(`obraz: ${absolute} (${(info.size / 1024).toFixed(0)} kB)`);

    const bytes = await readFile(absolute);
    const started = Date.now();
    const result = await verifyInput({ image: bytes.toString("base64") });
    const elapsed = Date.now() - started;

    console.log(`status: ${result.status}`);
    console.log(`input.kind: ${result.input.kind}`);
    console.log(`input.preview: ${result.input.preview.slice(0, 200)}`);
    console.log(`claims: ${result.claims.length}`);
    console.log(`summary: ${result.summary}`);
    console.log(`timingMs: ${elapsed}`);
    console.log(`costUsd: ${result.costUsd}`);

    if (result.limitations.length === 0) {
        console.log("limitations: (brak)");
    } else {
        console.log("limitations:");
        for (const limitation of result.limitations) console.log(`  - ${limitation}`);
    }

    for (const claim of result.claims.slice(0, 5)) {
        console.log(`- [${claim.verdict}] ${claim.claim}`);
    }
} catch (error) {
    console.error(`TEST-IMAGE FAILED: ${(error as Error).message}`);
    process.exit(1);
}
