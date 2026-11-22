-- PRAWDOWID storage schema (MySQL 8+).
-- Apply once:  mysql -u user -p prawdowid < sql/schema.sql
-- Set MYSQL_URL=mysql://user:pass@host:3306/prawdowid in .env

CREATE TABLE IF NOT EXISTS sources (
    id            VARCHAR(64)  NOT NULL PRIMARY KEY,
    title         VARCHAR(512) NOT NULL,
    publisher     VARCHAR(256) NOT NULL,
    url           VARCHAR(1024) NOT NULL,
    type          ENUM('primary', 'secondary', 'fact_check') NOT NULL,
    lang          CHAR(2)      NOT NULL DEFAULT 'pl',
    published_at  DATE         NULL,
    retrieved_at  DATETIME     NULL,
    license       VARCHAR(128) NULL,
    verified      TINYINT(1)   NOT NULL DEFAULT 0,
    UNIQUE KEY uq_sources_url (url)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS documents (
    id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    source_id     VARCHAR(64)  NOT NULL,
    url           VARCHAR(1024) NULL,
    -- normalized: no UTM, no trailing slash; used for version lookup
    canonical_url VARCHAR(1024) NULL,
    published_at  DATE         NULL,
    lang          CHAR(2)      NOT NULL DEFAULT 'pl',
    -- full text ONLY for official/public documents with a clear licence.
    -- For news/media keep `excerpt` (<=1500 chars) + metadata + hash, not the article.
    content       MEDIUMTEXT   NULL,
    excerpt       TEXT         NULL,
    content_hash  CHAR(64)     NOT NULL,
    fetched_at    DATETIME     NOT NULL,
    -- one immutable version per (source, content hash); a changed URL is a NEW row
    UNIQUE KEY uq_documents_hash (source_id, content_hash),
    KEY idx_documents_source (source_id),
    KEY idx_documents_url (canonical_url, fetched_at),
    CONSTRAINT fk_documents_source FOREIGN KEY (source_id) REFERENCES sources (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- One row per claim *version*. validity_key collapses NULL valid_from into a
-- sortable value so the unique key works (MySQL treats NULLs as distinct).
CREATE TABLE IF NOT EXISTS claims (
    id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    claim_key     CHAR(64)     NOT NULL,
    validity_key  CHAR(10)     NOT NULL,
    text          VARCHAR(1024) NOT NULL,
    details       VARCHAR(512) NULL,
    verdict       ENUM('true', 'false', 'mixed', 'unverified') NOT NULL,
    sources       JSON         NULL,
    checked_at    DATETIME     NOT NULL,
    valid_from    DATE         NULL,
    valid_until   DATE         NULL,
    embedding     BLOB         NOT NULL,
    UNIQUE KEY uq_claims_version (claim_key, validity_key),
    KEY idx_claims_window (valid_from, valid_until),
    KEY idx_claims_checked (checked_at),
    KEY idx_claims_verdict (verdict, checked_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS evidence (
    id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    claim_key     CHAR(64)     NOT NULL,
    url           VARCHAR(1024) NOT NULL,
    title         VARCHAR(512) NOT NULL,
    publisher     VARCHAR(256) NOT NULL,
    published_at  DATE         NULL,
    excerpt       TEXT         NULL,
    relation      ENUM('supports', 'refutes', 'context') NOT NULL,
    type          ENUM('primary', 'secondary', 'fact_check') NOT NULL,
    KEY idx_evidence_claim (claim_key)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cases (
    id            CHAR(36)     NOT NULL PRIMARY KEY,
    question      VARCHAR(500) NOT NULL,
    claims        JSON         NULL,
    verdicts      JSON         NULL,
    hits          INT          NOT NULL DEFAULT 1,
    status        ENUM('open', 'acknowledged') NOT NULL DEFAULT 'open',
    escalated     TINYINT(1)   NOT NULL DEFAULT 0,
    alert_reason  VARCHAR(500) NULL,
    channels      JSON         NULL,
    first_seen    DATETIME     NOT NULL,
    last_seen     DATETIME     NOT NULL,
    KEY idx_cases_open (status, hits)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
