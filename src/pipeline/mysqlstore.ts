import { createPool, type Pool } from "mysql2/promise";
import { cosineSimilarity } from "../modules/deepseek";
import type { CacheStore, CachedClaim } from ".";

/**
 * MySQL-backed claim cache.
 *
 * Vectors are stored as a compact Float32 BLOB (4 KB for 1024 dims), not JSON.
 * `search()` scans a bounded, time-filtered window (default 2000 newest rows)
 * and re-ranks in process. That is deliberate for the hackathon scale: no
 * vector index required, no full-table scan, no Postgres.
 *
 * For >100k claims replace the window with an ANN index (MySQL 9 VECTOR type,
 * Redis Stack, or a rerank service) without changing the CacheStore contract.
 */

type ClaimRow = {
    claim_key: string;
    text: string;
    details: string | null;
    verdict: CachedClaim["verdict"];
    sources: string | null;
    checked_at: Date | string;
    valid_from: string | null;
    valid_until: string | null;
    embedding: Buffer;
};

const toVector = (buffer: Buffer): number[] => {
    if (!buffer || buffer.length < 4) return [];
    const copy = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    return Array.from(new Float32Array(copy));
};

const toBuffer = (vector: number[]): Buffer => Buffer.from(new Float32Array(vector).buffer);

const iso = (value: Date | string | null): string => {
    if (!value) return new Date().toISOString();
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

function toClaim(row: ClaimRow): CachedClaim {
    let sources: string[] = [];
    try {
        const parsed = row.sources ? JSON.parse(row.sources) : [];
        if (Array.isArray(parsed)) sources = parsed.filter((item): item is string => typeof item === "string");
    } catch {
        sources = [];
    }

    return {
        id: row.claim_key.slice(0, 16),
        key: row.claim_key,
        text: row.text,
        details: row.details ?? undefined,
        verdict: row.verdict,
        sources,
        checkedAt: iso(row.checked_at),
        embedding: toVector(row.embedding),
        validFrom: row.valid_from,
        validUntil: row.valid_until,
    };
}

export type MySQLCacheStoreOptions = {
    /** Max rows considered by search(). Keep it bounded; default 2000. */
    scanLimit?: number;
    connectionLimit?: number;
};

export class MySQLCacheStore implements CacheStore {
    private readonly pool: Pool;
    private readonly scanLimit: number;

    constructor(url: string, options: MySQLCacheStoreOptions = {}) {
        if (!url) throw new Error("MySQLCacheStore: connection URL is empty");
        this.scanLimit = Math.max(1, options.scanLimit ?? 2000);
        this.pool = createPool(url);
    }

    async getByKey(key: string): Promise<CachedClaim | undefined> {
        const [rows] = await this.pool.query(
            `SELECT claim_key, text, details, verdict, sources, checked_at, valid_from, valid_until, embedding
             FROM claims WHERE claim_key = ? ORDER BY checked_at DESC LIMIT 1`,
            [key],
        );
        const row = (rows as ClaimRow[])[0];
        return row ? toClaim(row) : undefined;
    }

    async all(): Promise<CachedClaim[]> {
        const [rows] = await this.pool.query(
            `SELECT claim_key, text, details, verdict, sources, checked_at, valid_from, valid_until, embedding
             FROM claims ORDER BY checked_at DESC LIMIT ?`,
            [this.scanLimit],
        );
        return (rows as ClaimRow[]).map(toClaim);
    }

    async search(vector: number[], limit: number, asOf: string): Promise<CachedClaim[]> {
        if (vector.length === 0) return [];

        const [rows] = await this.pool.query(
            `SELECT claim_key, text, details, verdict, sources, checked_at, valid_from, valid_until, embedding
             FROM claims
             WHERE (valid_from IS NULL OR valid_from <= ?)
               AND (valid_until IS NULL OR valid_until >= ?)
             ORDER BY checked_at DESC
             LIMIT ?`,
            [asOf, asOf, this.scanLimit],
        );

        return (rows as ClaimRow[])
            .map((row) => ({ claim: toClaim(row), score: cosineSimilarity(vector, toVector(row.embedding)) }))
            .filter((item) => Number.isFinite(item.score) && item.claim.embedding.length === vector.length)
            .sort((a, b) => b.score - a.score)
            .slice(0, Math.max(1, limit))
            .map((item) => item.claim);
    }

    async put(entry: CachedClaim): Promise<void> {
        const validityKey = entry.validFrom ?? "0000-01-01";

        await this.pool.query(
            `INSERT INTO claims
                (claim_key, validity_key, text, details, verdict, sources, checked_at,
                 valid_from, valid_until, embedding)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                text = VALUES(text),
                details = VALUES(details),
                verdict = VALUES(verdict),
                sources = VALUES(sources),
                checked_at = VALUES(checked_at),
                valid_until = VALUES(valid_until),
                embedding = VALUES(embedding)`,
            [
                entry.key,
                validityKey,
                entry.text,
                entry.details ?? null,
                entry.verdict,
                JSON.stringify(entry.sources),
                entry.checkedAt,
                entry.validFrom ?? null,
                entry.validUntil ?? null,
                toBuffer(entry.embedding),
            ],
        );
    }

    async close(): Promise<void> {
        await this.pool.end();
    }
}
