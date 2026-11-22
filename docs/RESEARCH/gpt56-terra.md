# GPT-5.6 Terra research (2026-11-22T04:46:32.732Z)
Model: `openai/gpt-5.6-terra`

## ANGLE: evaluation and metrics. Diagnose the class-level losses and propose exact decision/aggregation rules that raise macro-F1 without false positives. Include how to score compound claims and how to report a stable number.

## Priority 0 — Freeze a deterministic evaluation path (0.5–0.75h)

Your current macro-F1 is constrained primarily by two weak classes:

- `misleading`: F1 = 0.00, support 2
- `false`: F1 = 0.769, support 8

With only 24 scored cases, fixing even one `misleading` and two `false` cases materially changes macro-F1.

### Why this matters numerically

Current class F1 sum:

- confirmed: 0.833
- false: 0.769
- misleading: 0.000
- insufficient_evidence: 0.706
- not_verifiable: 1.000

Sum = 3.308, macro-F1 = 0.662.

A plausible conservative target:

- confirmed: 0.83
- false: 0.88
- misleading: 0.67–0.80
- insufficient_evidence: 0.71
- not_verifiable: 1.00

Macro-F1: about **0.82** if both misleading examples are correctly handled; about **0.75–0.78** if only one is fixed and false recall improves.

Do not rely on stochastic claim extraction for the official evaluation run.

### Add `EVAL_MODE=1`

For evaluation:

1. Set model temperature to `0`.
2. Require strict JSON schema output.
3. Persist:
   - extracted atomic claims;
   - search queries;
   - source IDs and snippets;
   - evidence scores;
   - final aggregation trace;
   - model/version/config hash.
4. Reuse cached extraction and retrieval for repeated runs unless source freshness is intentionally tested.
5. Pin the corpus snapshot and source versions.

This is not gaming if the same deterministic pipeline is used for demo/API requests. It is reproducibility.

---

# 1. Cheapest fixes: false recall, misleading recall, compound aggregation

## 1.1 Stop assigning `confirmed` to a compound sentence unless all material subclaims are supported

This is almost certainly the root issue in case-06.

### Required model

Represent a user statement as:

```ts
type AtomicClaim = {
  id: string;
  text: string;
  predicate: "capital" | "currency" | "membership" | "election_result" | "statistic" | "other";
  subject?: string;
  object?: string;
  qualifier?: {
    time?: string;
    place?: string;
    quantity?: string;
    scope?: string;
  };
  material: boolean;       // affects truth of the original statement
  checkability: "checkable" | "ambiguous" | "opinion";
};

type ClaimAssessment = {
  claimId: string;
  status: "supported" | "contradicted" | "mixed" | "unknown" | "not_verifiable";
  confidence: number;
  evidenceIds: string[];
  contradictionStrength?: number;
};
```

The extractor must split on:

- conjunctions: `i`, `oraz`, `a także`;
- contrast: `ale`, `natomiast`, `jednak`;
- list constructions;
- multiple numbers/dates/entities;
- separate relational predicates;
- separate comparative clauses.

For Polish, minimally use a deterministic splitter after LLM extraction:

```ts
const compoundMarkers = /\s+(?:i|oraz|a także|ale|jednak|natomiast)\s+/i;
```

Do **not** blindly split every “i”; only apply if both sides include a recognizable factual predicate/entity/number. Better: have the LLM return atomic claims, then run validation that flags a likely compound sentence if the original contains multiple factual slots but the output has one claim.

### Exact aggregation rule

Use a precedence rule with materiality:

```text
If any material atomic claim is contradicted with strong evidence:
  - if another material atomic claim is supported:
      verdict = misleading
  - otherwise:
      verdict = false

Else if all material atomic claims are supported:
  verdict = confirmed

Else if no claim is contradicted, and at least one material claim lacks enough evidence:
  verdict = insufficient_evidence

Else if key claim is intrinsically uncheckable with available public evidence:
  verdict = not_verifiable
```

Define “strong contradiction” conservatively:

```text
strong contradiction =
  source is official/primary OR established fact-check source
  AND entity/date/scope match
  AND contradiction score >= 0.80
```

For numerical facts:

```text
contradiction if:
- claimed value differs from authoritative value, and
- no legitimate rounding/definition/scope explanation exists.
```

For categorical values:

```text
contradiction if:
- normalized values differ exactly,
- source applies to same entity and relevant time.
```

### Critical guardrail

Never return `confirmed` for a multi-claim input when:

```text
supported_material_claims < total_material_claims
```

unless missing clauses are explicitly non-factual/background. This one guardrail prevents the known case-06 failure mode.

### Expected gain

- case-06 likely changes `confirmed → misleading`.
- More broadly prevents false confirmation of partially true claims.
- Expected macro-F1 delta: **+0.08 to +0.17**, depending on whether both misleading cases are captured.
- Effort: **1–1.5h**.

---

## 1.2 Make `misleading` a precise “mixed truth / deceptive framing” class, not a vague fallback

The class is currently never triggered because the decision policy probably treats partial support as `confirmed` or insufficient support as `insufficient_evidence`.

Use `misleading` only when you can cite both the true part and the materially false/incomplete part.

### Operational definition

Return `misleading` when at least one of the following is true:

1. **Compound mixed claim**
   - at least one material atomic claim is supported;
   - at least one other material atomic claim is contradicted.

2. **True statistic, false implication/scope**
   - a number is correct;
   - the statement changes denominator, geography, time window, population, legal category, or causal meaning.

3. **Outdated fact presented as current**
   - claim was true at time `t0`;
   - authoritative source shows it is no longer true at the claim’s implied/current time.

4. **Selective framing**
   - wording omits a qualifying condition that reverses or materially changes the conclusion;
   - only use if evidence explicitly establishes the missing qualifier.

### Do not use `misleading` when

- You merely found incomplete research: use `insufficient_evidence`.
- The assertion is not externally testable: use `not_verifiable`.
- All material propositions are false: use `false`.
- A source disagrees but entities/timeframes do not align: use `insufficient_evidence`.

### Decision thresholds

```text
misleading requires:
- >=1 supported material claim, evidence confidence >= 0.80
- >=1 contradicted material claim, evidence confidence >= 0.80
- both claims materially contribute to the original statement
- citation coverage = 100% for the mixed elements
```

For single-clause claims, require explicit evidence of scope distortion:

```text
supported headline fact + authoritative missing qualifier
+ qualifier changes reasonable reader interpretation
=> misleading
```

This avoids a large false-positive `misleading` rate.

### Polish explanation template

```text
Werdykt: wprowadzające w błąd.

Część wypowiedzi jest prawdziwa: [A].
Jednak pomija lub błędnie przedstawia ważną część: [B].
Dlatego cała wypowiedź może prowadzić do błędnego wniosku.
```

### Expected gain

- Fixing both known misleading cases can move `misleading` F1 from 0.0 to roughly 0.67–1.0 depending on precision.
- Macro-F1 delta: **+0.13 to +0.20**.
- Effort: **0.75–1h**, mostly aggregator and tests.

---

## 1.3 Add a contradiction-first decision pass for false recall (1–1.5h)

The known false misses (10/12/22) indicate your system likely overweights semantically similar support or drops a contradiction due to weak retrieval/matching.

Before “support” classification, run a deterministic contradiction check for high-value factual shapes.

### High-value claim types to normalize

Implement deterministic parsers for:

1. **Capital / seat / country membership**
2. **Currency**
3. **Election winner / officeholder**
4. **Dates**
5. **Numeric quantities**
6. **Geographic administrative facts**
7. **EU/NATO/UN membership**
8. **Legal status / regulation applicability**, if corpus supports it

These are already close to your Wikidata wiring. The missing part is likely strict comparison and temporal semantics.

### Exact normalization rules

Normalize:

- country aliases: `Niemcy`, `RFN`, `Republika Federalna Niemiec`;
- currency: `euro`, `EUR`, `€`;
- numbers:
  - Polish decimal comma: `3,5` → `3.5`;
  - spaces in thousands: `1 000` → `1000`;
  - word numbers where feasible;
- dates:
  - `w 2022 r.` → year 2022;
  - “currently/obecnie” → evaluation date;
  - “since 2014” → interval semantics.

### Deterministic false rule

```text
If a normalized claim has a direct authoritative value lookup
and the lookup is temporally valid
and claimed normalized value != authoritative normalized value,
then classify atomic claim as contradicted at confidence >=0.95.
```

Example:

```text
Claim: "Polska używa euro."
Wikidata/official EU source: currency = Polish złoty.
Same subject, property, and current-time context.
=> contradicted.
```

### Temporal protection

Do not treat a historical claim as false just because the current value differs.

```text
If claimed date is present:
  require source validity over claimed date.
If no date:
  interpret as current only for present-tense/current wording.
If tense is unclear:
  lower confidence; retrieve before deciding.
```

### Expected gain

- Likely fixes the three expected false misses if they are structured factual contradictions.
- `false` F1 can plausibly rise from 0.769 to **0.88–0.94**.
- Macro-F1 delta: **+0.02 to +0.05**.
- Effort: **1–1.5h**.

---

# 2. Deterministic sources and rules that actually move F1

Do not spend the remaining four hours adding broad web search or more LLM logic. You need high-precision evidence for common claim categories.

## 2.1 Add official EU sources for EU facts, currency, law, institutions (0.5–1h)

Wikidata is convenient but should not be your final citation for high-stakes institutional facts when an official source is accessible.

Useful official sources:

| Topic | Source | Why it helps |
|---|---|---|
| EU member states / accession | `europa.eu` | Primary institutional source |
| Euro area / currency | ECB / European Commission / EU | Fixes currency and eurozone claims |
| EU law | EUR-Lex | Primary legal text and dates |
| EU statistics | Eurostat | Authoritative numeric/time series |
| Elections/Parliament | European Parliament / national electoral commissions | Official results and seat data |

Practical implementation: create a small local curated “official facts” JSON snapshot for recurring categories, with source metadata.

```json
{
  "poland_currency_current": {
    "value": "PLN",
    "validFrom": "1995-01-01",
    "title": "Poland and the euro",
    "publisher": "European Commission",
    "date": "2025-...",
    "link": "https://economy-finance.ec.europa.eu/...",
    "excerpt": "Poland has not adopted the euro..."
  }
}
```

This is acceptable if every answer still surfaces provenance, date, link, and excerpt.

**Expected gain:** primarily false/misleading correctness and citation quality.  
**Macro-F1 delta:** +0.01–0.03.  
**Effort:** 0.5–1h if scoped to 15–30 high-frequency facts, not a crawler.

---

## 2.2 Add Polish official statistics and election sources (0.5–1h)

For a Polish fact-checking MVP, the most valuable deterministic official sources are:

- **GUS / Bank Danych Lokalnych** — population, employment, inflation, demographic claims;
- **PKW** — Polish election results;
- **NBP** — currency, rates, inflation/financial facts;
- **gov.pl** — government policy and official announcements;
- **ISAP / Dziennik Ustaw / Sejm** — Polish legal texts;
- **Eurostat** — comparable EU statistics.

Do not integrate all APIs now. Add a compact, locally indexed source pack with a documented generation script. A corpus containing snapshots from these sources also improves the “primary/official source” requirement.

Each record must include:

```ts
{
  id,
  title,
  publisher,
  publishedAt,
  url,
  excerpt,
  sourceType: "primary_official",
  domain,
  topic,
  validFrom?,
  validUntil?,
  normalizedFacts?: [...]
}
```

**Expected gain:** low-to-medium for the known eval, high for jury credibility.  
**Macro-F1 delta:** +0.01–0.04, depending on eval distribution.  
**Effort:** 0.75–1h for a narrow source pack.

---

## 2.3 Build a source-quality hierarchy, not more retrieval

Use this ranking for verdict decisions:

1. Primary legal/statistical/institutional source;
2. Official government or regulator;
3. Official electoral body;
4. Peer-reviewed/reputable research institution;
5. Established fact-checking organization;
6. Reputable secondary reporting;
7. Wikipedia/Wikidata only as discovery/backup, never sole support for contentious claims.

### Rule

```text
confirmed or false:
  require at least one level 1–5 source,
  unless the fact is a low-risk stable reference fact.

misleading:
  require direct evidence for both the accurate and misleading elements.

insufficient_evidence:
  allowed when retrieval did not find enough high-quality evidence.

Wikipedia/Wikidata:
  may inform retrieval and structured comparison,
  but final answer should prefer primary source when available.
```

This will protect citation correctness more than adding another web-search provider.

---

# 3. Evidence and citation rules to meet jury metrics

## 3.1 Enforce claim-level citation coverage

The task says every factual claim needs evidence. That includes factual claims in your **explanation**, not just the input statement.

For every factual sentence you generate, attach one or more citations.

### Implementation check

Before response serialization:

```ts
for (const factualStatement of response.factualStatements) {
  assert(factualStatement.evidenceIds.length > 0);
}
```

If the assertion fails:

- remove unsupported factual text, or
- downgrade to `insufficient_evidence`, explaining precisely what is missing.

### Output structure

```json
{
  "status": "ok",
  "verdict": "misleading",
  "summary": "Wypowiedź jest częściowo prawdziwa, ale zawiera błędną informację o walucie.",
  "claims": [
    {
      "text": "Polska jest członkiem UE.",
      "assessment": "supported",
      "citations": ["src-01"]
    },
    {
      "text": "Polska używa euro.",
      "assessment": "contradicted",
      "citations": ["src-02"]
    }
  ],
  "evidence": [
    {
      "id": "src-01",
      "title": "...",
      "publisher": "...",
      "date": "2025-...",
      "link": "https://...",
      "excerpt": "..."
    }
  ]
}
```

`error` and `needs_clarification` remain top-level statuses:

```ts
type Status = "ok" | "needs_clarification" | "error";
type Verdict =
  | "confirmed"
  | "false"
  | "misleading"
  | "insufficient_evidence"
  | "not_verifiable";
```



## ANGLE: evidence and sources. Decide which deterministic lookups (Wikidata properties, document corpus, EUvsDisinfo, fact-check APIs) to prioritize to raise false/confirmed recall. Give concrete mappings/queries and thresholds.

## Priority order for the remaining ~4 hours

The fastest path is **not more LLM research**. It is:

1. **Make claim decomposition and aggregation deterministic enough** to stop “one true clause ⇒ confirmed.”
2. **Add evidence-aware contradiction rules** for high-confidence false claims.
3. **Add explicit misleading triggers** for true-but-incomplete / mixed compound claims.
4. **Harden source retrieval and citation validation** so every verdict has usable evidence.
5. **Freeze an eval protocol** and report uncertainty honestly.

Your current macro-F1 is `0.662`. To reach `>=0.75`, the most efficient gains are likely:

- misleading: from `0.00` to `0.40–0.60` (+0.07 to +0.10 macro),
- false: `0.769` to `0.84–0.90` (+0.02 to +0.03),
- confirmed: protect/improve `0.833` to `0.86+` (+0.005),
- insufficient evidence: protect `0.706` rather than chase recall.

That is enough if the changes actually fix the compound/misleading misses.

---

# 1. Cheapest fixes: misleading, false recall, compound claims

## P0 — Implement deterministic compound-claim aggregation
**Effort: 45–75 min**  
**Expected macro-F1 delta: +0.05 to +0.10**

The central bug is semantic: a sentence with multiple atomic factual propositions cannot be marked `confirmed` merely because one proposition is confirmed.

### 1.1 Define atomic claim outcomes

For every extracted atomic claim, produce one of:

```ts
type AtomicOutcome =
  | "supported"
  | "contradicted"
  | "insufficient_evidence"
  | "not_verifiable"
  | "needs_clarification"
  | "error";
```

Keep these internal outcomes separate from final verdicts.

For each atomic claim, retain:

```ts
{
  text: string,
  normalizedSubject?: string,
  normalizedPredicate?: string,
  normalizedObject?: string,
  temporalScope?: { from?: string; to?: string; asOf?: string },
  evidence: Evidence[],
  outcome: AtomicOutcome,
  confidence: number
}
```

### 1.2 Aggregate using strict precedence

For a user-visible sentence containing `N >= 2` factual atomic claims:

| Atomic outcomes | Final verdict |
|---|---|
| all supported | `confirmed` |
| all contradicted | `false` |
| at least one supported AND at least one contradicted | `misleading` |
| one or more contradicted, none supported, remaining unknown | `false` only if the contradicted component is material; otherwise `insufficient_evidence` |
| at least one supported AND at least one unknown | `misleading` if omission materially changes interpretation; otherwise `insufficient_evidence` |
| no supported/contradicted, evidence missing | `insufficient_evidence` |
| inherently untestable / prediction / vague normative assertion | `not_verifiable` |
| ambiguity prevents identifying entity/time/metric | separate `needs_clarification`, not a verdict |
| tool failure | separate `error`, not a verdict |

Recommended implementation:

```ts
function aggregateCompound(parts: AtomicResult): Verdict {
  const supported = parts.filter(p => p.outcome === "supported");
  const contradicted = parts.filter(p => p.outcome === "contradicted");
  const unknown = parts.filter(p =>
    p.outcome === "insufficient_evidence" || p.outcome === "not_verifiable"
  );

  if (parts.length === 1) return mapAtomicToVerdict(parts[0]);

  if (supported.length === parts.length) return "confirmed";

  if (supported.length > 0 && contradicted.length > 0) {
    return "misleading";
  }

  // “True but incomplete”: only use misleading where omitted/unknown part
  // is central and changes the meaning, not for arbitrary missing details.
  if (supported.length > 0 && unknown.length > 0) {
    return isMateriallyIncomplete(parts) ? "misleading" : "insufficient_evidence";
  }

  if (contradicted.length > 0) {
    return hasMaterialContradiction(parts) ? "false" : "insufficient_evidence";
  }

  if (parts.every(p => p.outcome === "not_verifiable")) return "not_verifiable";
  return "insufficient_evidence";
}
```

### 1.3 Do not rely only on LLM extraction for compound detection

Add a deterministic pre-split before LLM extraction:

- Polish coordinating conjunctions: `i`, `oraz`, `ale`, `lecz`, `natomiast`, `a`, `jednak`
- punctuation delimiters: `;`, `—`, `, a`, `, ale`
- independently check clauses containing different:
  - entities,
  - dates,
  - numbers/units/currencies,
  - predicates.

A useful low-risk rule:

```ts
const isPotentialCompound =
  /\b(i|oraz|ale|lecz|natomiast|jednak)\b/i.test(text) ||
  /;|,\s*(a|ale|lecz|natomiast)\s/i.test(text) ||
  countDistinctNamedEntities(text) >= 2 ||
  countNumericExpressions(text) >= 2;
```

Do **not** blindly split “Polska i Niemcy są członkami UE” into two independent claims unless the parser recognizes shared predicate structure. But for this MVP, split-and-evaluate may still be safer than allowing one verified clause to confirm the whole statement.

### 1.4 Force a “full statement coverage” gate for `confirmed`

A final `confirmed` must satisfy:

```ts
coverageRatio = supportedAtomicClaims / totalAtomicClaims;
```

Require:

- `coverageRatio === 1.0`, and
- at least one direct evidence item for every atomic factual proposition, and
- no material temporal/entity ambiguity.

If evidence only supports part of the statement, never return `confirmed`.

This directly targets case-06 and prevents recurrence.

---

## P0 — Explicit `misleading` policy: narrow but usable
**Effort: 30–45 min**  
**Expected macro-F1 delta: +0.04 to +0.08**

Your `misleading` F1 of `0.0` indicates the model likely treats the class as “uncertain” or “partly true,” without a decision rule.

Use `misleading` only when one of these is demonstrably true:

### Rule M1: Mixed compound claim
At least one material subclaim is directly supported and at least one material subclaim is directly contradicted.

Example:

> “Country X joined the EU in 2004 and uses the euro.”

If membership/date is supported, but currency is contradicted by official/EU/Wikidata evidence, verdict is `misleading`, not `confirmed`.

### Rule M2: Correct number, wrong frame/time/unit
The statement has a verifiable fact but uses it outside its valid scope:

- a historical number presented as current,
- annual figure presented as monthly,
- gross figure presented as net,
- national figure presented as EU-wide,
- absolute increase described as percent increase.

Require direct evidence of both:
1. the true underlying fact, and
2. the missing/wrong qualifier.

### Rule M3: Selective truth that reverses material interpretation
Use sparingly. Require at least two evidence items:
- one supporting the literal portion,
- one showing material omitted context.

Do not label `misleading` just because context could be added. Otherwise false positives will destroy precision.

### Materiality heuristic

A subclaim is material when it contains:

- a number, date, quantity, rank, legal status, membership status, election result, causality, or universal qualifier (`wszyscy`, `nigdy`, `zawsze`, `tylko`);
- or it is the main predicate/object of the sentence.

```ts
function isMaterial(claim: AtomicClaim): boolean {
  return (
    claim.hasNumber ||
    claim.hasDate ||
    claim.hasComparison ||
    claim.hasUniversalQuantifier ||
    claim.predicateIn([
      "is_member_of",
      "uses_currency",
      "won_election",
      "is_capital_of",
      "has_population",
      "adopted_law",
      "caused",
    ])
  );
}
```

This avoids turning benign multi-clause statements into `misleading`.

---

## P0 — Add contradiction-first false rules
**Effort: 45–60 min**  
**Expected macro-F1 delta: +0.02 to +0.05**

False recall improves most when the system recognizes **direct structured contradictions**, not when it asks an LLM to “reason harder.”

### Required condition for `false`

Return `false` only if all are true:

1. Claim resolves to a normalized triple or numeric statement.
2. A high-quality source gives a contradictory value.
3. Same entity, predicate, and relevant time scope.
4. Contradiction is direct, not merely absent evidence.

```ts
if (
  sourceTier <= 2 &&
  normalizedSubjectMatch >= 0.90 &&
  predicateMatch === true &&
  timeCompatible === true &&
  contradictionType in ["exact_value", "membership", "currency", "officeholder", "date", "unit"]
) {
  outcome = "contradicted";
}
```

### Numeric contradiction thresholds

Do not mark a number false for rounding differences.

| Type | Contradiction threshold |
|---|---:|
| integer count / seats / years | unequal after accepted normalization |
| exact date | different day/month/year when claim implies exact date |
| currency / capital / membership / winner | exact mismatch |
| percentage | relative difference >5% unless source precision is lower |
| population / GDP / large estimate | relative difference >10%, same year and metric |
| distance / area | relative difference >5%; normalize units |
| rankings | rank mismatch >1 unless statement says “exactly” |

For statements such as “Poland has 460 seats in the Sejm,” use exact contradiction. For “Poland has about 38 million inhabitants,” allow tolerance.

---

# 2. Deterministic sources and rules that will move F1

Prioritize sources with exact entity-property matching and direct citation metadata. Do not spend remaining time adding broad web crawling.

## P0 source priority: Wikidata, but cache and use it as a value index
**Effort: 45–75 min if basic lookup exists**  
**Expected delta: +0.03 to +0.06 macro, mainly false/confirmed**

Wikidata is useful for stable, enumerable facts. It is weak for nuanced political claims, current events, and contested statistics.

### Prioritize these properties

| Claim type | Wikidata property | Notes |
|---|---|---|
| capital | `P36` | country → capital |
| currency | `P38` | country/entity → currency |
| member of | `P463` | organization membership |
| inception / joining date qualifiers | `P571`, qualifiers on `P463` statement | membership needs statement qualifiers, not only truthy values |
| head of state | `P35` | time-sensitive; require qualifiers/currentness |
| head of government | `P6` | time-sensitive |
| official language | `P37` | useful but nuance possible |
| population | `P1082` | must select date/point-in-time qualifier |
| area | `P2046` | unit normalization |
| number of seats | `P1342` sometimes; legislature-specific modeling varies | lower priority |
| winner / elected office | often statements/qualifiers, not robust universal lookup | use official election source instead |
| country borders | `P47` | stable |
| EU membership | `P463=Q458` plus start time qualifier `P580` | very useful |
| NATO membership | `P463=Q7184` plus start time | useful |
| ISO code | `P297`, `P298`, `P300` | entity resolution support |
| official website | `P856` | citation enrichment, not factual proof alone |

### Query approach

Avoid per-claim live SPARQL if rate limits are already a problem. Cache responses by:

```ts
cacheKey = `${qid}:${property}:${asOfDate ?? "current"}`
```

Use a local JSON cache seeded with common entities in your eval/corpus domain. Store source URL and retrieval time.

For membership with dates, use statements, not `wdt:` truthy triples:

```sparql
SELECT ?memberSince WHERE {
  wd:Q36 p:P463 ?statement .
  ?statement ps:P463 wd:Q458 .
  OPTIONAL { ?statement pq:P580 ?memberSince . }
}
```

For population, choose the closest measurement with point-in-time <= claimed/as-of date:

```sparql
SELECT ?population ?date WHERE {
  wd:Q36 p:P1082 ?statement .
  ?statement ps:P1082 ?population .
  OPTIONAL { ?statement pq:P585 ?date . }
}
ORDER BY DESC(?date)
```

### Critical evidence rule

Wikidata by itself may not satisfy jury expectations for an authoritative source in politically consequential claims. Use it as:

- deterministic retrieval,
- contradiction detection,
- fallback evidence for stable facts,

but preferentially cite the **underlying official source** when available. At minimum cite Wikidata transparently as publisher “Wikidata,” date “retrieved on,” with an excerpt generated from the property label/value only if your evidence object supports that honestly.

Do not fabricate a page excerpt.

---

## P0 source priority: local official corpus
**Effort: 30–45 min for retrieval tuning**  
**Expected delta: +0.01 to +0.04 macro; much stronger jury value**

Your local 1,164-document corpus is likely the highest-value jury asset because it is:

- local and fast,
- privacy-safe,
- source-controlled,
- citation-friendly,
- official/primary.

### Retrieval rules

For official corpus retrieval:

- retrieve top `k=8`,
- require hybrid score:
  - lexical/BM25 or token overlap,
  - embedding score,
  - entity overlap.
- avoid accepting an embedding-only match for contradiction.

Suggested gates:

```ts
acceptOfficialEvidence =
  (cosine >= 0.72 && entityOverlap >= 1) ||
  (bm25Normalized >= 0.55 && entityOverlap >= 1) ||
  (cosine >= 0.66 && exactNumberOrDateMatch);
```

For a contradiction:

```ts
acceptContradiction =
  cosine >= 0.76 &&
  entityOverlap >= 1 &&
  predicateAlignment >= 0.80 &&
  directValueConflict === true;
```

The direct conflict should be detected after LLM extraction or template extraction, not inferred from vector score alone.

### Source metadata completeness

Precompute per document/chunk:

```ts
{
  title,
  publisher: "gov.pl" | "Policja" | "CERT Polska" | "RSO",
  publishedDate: ISODate | null,
  url,
  sourceType: "official",
  excerpt,
  domain
}
```

If publication date is unavailable, use `retrievedAt` separately, but do not claim it is a publication date. Jury requirement says date; provide a clear `dateType: "published" | "updated" | "retrieved"`.

---

## P1 source priority: EUvsDisinfo for known disinformation narratives
**Effort: 30–45 min**  
**Expected delta: +0.01 to +0.03 macro, potentially higher if eval includes these narratives**

EUvsDisinfo is useful for recurring geopolitical misinformation. It should not become a universal “false” oracle.

### Use only with strict matching

Match a user claim to an EUvsDisinfo case only if:

```ts
semanticSimilarity >= 0.84 &&
entityOverlap >= 2 &&
claimPolarityCompatible === true &&
caseHasExplicitDisinfoClaim === true
```

If using embeddings, `0.84` is intentionally high. At `0.70–0.78`, use it only as a research lead, not verdict evidence.

Output `false` only when the EUvsDisinfo case explicitly identifies the same claim/narrative as disinformation and provides a specific rebuttal/source. Otherwise, use it to retrieve primary sources.

### Important jury risk

EUvsDisinfo is a secondary source. Pair it where possible with an official/primary source. For

## ANGLE: product/jury. Given the PDF, identify what the jury will penalize in this prototype and the smallest changes (UX, logs, disclosures, demo scenarios) that maximize score without new infrastructure.

## Executive priority order

You are close enough that the highest-return path is **not more retrieval**. It is:

1. **Deterministic claim decomposition and aggregation** for compound claims.
2. **A conservative “misleading” decision policy** based on mixed truth / omitted qualifying context.
3. **Targeted deterministic verification for common factual structures** (numbers, dates, office holders, membership, currencies, elections).
4. **Evaluation and reporting discipline** so the result is credible despite LLM nondeterminism.
5. **Jury-visible compliance features**: evidence completeness, abstention explanation, injection handling, privacy disclosure, latency/cost dashboard.

A realistic target after these changes:

| Change | Effort | Expected macro-F1 impact | Why |
|---|---:|---:|---|
| Compound claim split + verdict aggregation | 1.0–1.5h | +0.04 to +0.08 | Directly addresses case-06 and prevents false “confirmed” outcomes |
| Conservative misleading rules + classifier prompt/schema | 1.0–1.5h | +0.05 to +0.10 | Current misleading F1=0 is the main macro-F1 drag |
| Deterministic date/number/entity contradiction rules | 0.75–1.25h | +0.03 to +0.06 | Likely resolves several false misses |
| Reduce extraction nondeterminism + retries | 0.5–0.75h | +0.01 to +0.03 | Stabilizes outcomes and reporting |
| Jury UX/logging/disclosures | 1.0–1.5h | Mostly rubric/risk reduction | Prevents losing points outside F1 |
| **Total** | **4–6h** | **+0.13 to +0.27** | Enough headroom over 0.75 if baseline is representative |

Your current macro-F1 of 0.662 needs about +0.088. Fixing one misleading case alone can move macro-F1 materially because that class only has support 2. But do not optimize just those two examples; implement general mixed-claim and qualifier rules.

---

# 1. Cheapest fixes: misleading, false recall, compound claims

## 1.1 Make claim extraction deterministic enough for evaluation

Do not let a free-form LLM decide the factual units differently per run.

Use a strict extraction schema:

```ts
type AtomicClaim = {
  id: string;
  subject: string;
  predicate: string;
  object: string | number | boolean;
  qualifiers: {
    time?: { raw: string; from?: string; to?: string };
    location?: string;
    scope?: "all" | "most" | "some" | "national" | "local" | "unknown";
    modality?: "is" | "was" | "will_be" | "can" | "causes" | "unknown";
    comparison?: "highest" | "lowest" | "more_than" | "less_than" | "none";
  };
  sourceSpan: string;
  essential: boolean;
};
```

Require:
- temperature `0`;
- JSON schema / structured response;
- normalized text before extraction;
- stable claim IDs derived from normalized span hash;
- one retry only on invalid JSON, not on low confidence;
- cache extraction by normalized input + prompt version.

### Important extraction rule

Split coordinated factual clauses when they have separate predicates, objects, dates, or entities:

> “Poland uses the złoty and adopted the euro in 2024.”

Must become:
1. Poland uses the złoty.
2. Poland adopted the euro in 2024.

Do **not** split idiomatic or inseparable propositions unnecessarily. The target is independent verifiability.

### Cheap heuristic before LLM extraction

Use deterministic splitting on:
- `i`, `oraz`, `ale`, `jednak`, `natomiast`, `a także`;
- semicolons / bullet points;
- clauses containing separate date/year/number patterns;
- repeated subject or named entity.

Then ask the model to validate/merge only where needed. This avoids the main failure mode: one retrieval result supporting part of the sentence and the model treating the whole sentence as confirmed.

**Effort:** 45–60 min  
**Expected impact:** +0.03 to +0.06 macro-F1, primarily confirmed precision and misleading recall.

---

## 1.2 Use explicit compound-claim aggregation

Do not aggregate by “best evidence wins.” Use a deterministic matrix.

For each atomic claim, assign an internal evidence state:

```ts
type EvidenceState =
  | "SUPPORTED"
  | "CONTRADICTED"
  | "PARTIALLY_SUPPORTED"
  | "INSUFFICIENT"
  | "UNVERIFIABLE"
  | "ERROR";
```

Then aggregate only non-error states.

### Recommended sentence-level aggregation policy

| Atomic-claim combination | Final verdict |
|---|---|
| All essential claims SUPPORTED | `confirmed` |
| Any essential claim CONTRADICTED, and no material claim is only partially true | `false` |
| Mix of SUPPORTED and CONTRADICTED essential claims | `misleading` |
| Any essential claim PARTIALLY_SUPPORTED | `misleading` |
| Claim is directionally true but date, number, scope, causality, comparison, or status is materially wrong | `misleading` |
| No contradiction, but essential evidence is missing | `insufficient_evidence` |
| Cannot be checked with reliable accessible sources / inherently non-falsifiable future private assertion | `not_verifiable` |
| Retrieval/system failure | separate `error` status |
| Input lacks a checkable proposition / reference unclear | separate `needs_clarification` status |

### Essential distinction: `false` vs `misleading`

Use `false` when the proposition is materially incompatible with evidence.

Use `misleading` when:
- a statement combines true and false factual components;
- it reports a true fact with a material wrong qualifier;
- it omits a qualifier that changes the ordinary interpretation;
- it overgeneralizes a partial fact (“all”, “always”, “Poland”, “EU-wide”);
- it treats a proposal, plan, or announced intent as completed fact;
- it confuses correlation/association with proven causation.

Examples:

| Input | Atomic evidence | Verdict |
|---|---|---|
| “Poland uses złoty and adopted euro in 2024.” | first true, second false | `misleading` |
| “Unemployment fell by 10%.” Actual: 10% to 9% | direction ambiguous / relative vs percentage points | `misleading` if wording hides material denominator |
| “The government banned X.” Actual: draft proposal / local restriction | material status/scope error | `misleading` |
| “Poland is in the eurozone.” | directly contradicted | `false` |
| “This policy will certainly reduce inflation.” | causal future certainty unsupported | normally `not_verifiable` or `insufficient_evidence`, depending on whether evidence could in principle establish it |

### Guardrail against over-triggering misleading

Only emit `misleading` when at least one of these is documented:
1. at least one supported and one contradicted **essential** atomic claim;
2. one directly evidenced material qualifier mismatch;
3. evidence excerpt explicitly states a limiting condition omitted by the claim.

Otherwise prefer `false` for direct contradiction or `insufficient_evidence` where evidence is weak.

This is important. A vague “it lacks context” rationale without a cited material qualifier will hurt citation correctness and make `misleading` look arbitrary.

**Effort:** 30–45 min  
**Expected impact:** +0.04 to +0.08 macro-F1.

---

## 1.3 Add deterministic contradiction checks before generative synthesis

Your existing Wikidata lookup is useful, but it needs a contradiction-first layer. For structured claims, do not ask the LLM to infer contradiction from retrieved prose.

Build a rule output like:

```ts
type DeterministicCheck = {
  claimId: string;
  result: "support" | "contradict" | "partial" | "no_match";
  confidence: number; // 0..1
  reasonCode:
    | "ENTITY_VALUE_MISMATCH"
    | "DATE_OUTSIDE_INTERVAL"
    | "NUMERIC_MISMATCH"
    | "MEMBERSHIP_MISMATCH"
    | "STATUS_MISMATCH"
    | "SCOPE_MISMATCH";
  expected?: string;
  observed?: string;
  source: Evidence;
};
```

### High-value rules

#### A. Exact entity-value mismatch
For claims about:
- capital;
- currency;
- EU/NATO membership;
- country borders;
- office holder;
- election winner;
- number of seats;
- official languages;
- dates of accession;
- legal status.

If entity and predicate match confidently and the normalized object differs, mark `CONTRADICTED` at high confidence.

Threshold:
- entity resolution >= `0.92`;
- predicate mapping from allowlist;
- normalized value mismatch exact or numeric tolerance below allowed range.

For dates:
- exact date claims: mismatch by >0 days = contradiction;
- year-only claims: observed year differs = contradiction;
- “since/before/after” use interval logic.

#### B. Numeric contradiction
Normalize:
- Polish decimal comma;
- `%` vs percentage points;
- currencies;
- ranges;
- “over/under/at least/no more than.”

Rules:
- exact counts: contradiction if values differ, unless source uncertainty interval overlaps;
- approximate language (`około`, `prawie`, `ponad`): allow ±5% by default or source-provided uncertainty;
- trend claims: verify direction separately from magnitude;
- distinguish `10%` from `10 percentage points`.

This will improve false recall without inventing context rules.

#### C. Time/status contradiction
A large source of errors is factually right, temporally wrong.

Detect words:
- `obecnie`, `w 2024`, `wczoraj`, `od`, `do`, `już`, `nadal`, `został`, `wejdzie w życie`.

If source date/status does not cover claim time, do not confirm. Use:
- `misleading` if the core fact is true but timing/status is materially wrong;
- `false` if the time qualifier is central and incompatible;
- `insufficient_evidence` if no reliable historical state is available.

#### D. Proposal vs enacted / announced vs occurred
Use status lexicon in Polish:
- planned: `plan`, `projekt`, `zapowiedź`, `propozycja`, `ma zostać`;
- enacted: `weszło w życie`, `uchwalono`, `opublikowano`, `obowiązuje`;
- completed: `zrealizowano`, `odbyło się`.

If a claim says “did/introduced/banned” but source only supports proposal/announcement, classify `misleading` rather than confirmed.

**Effort:** 45–75 min  
**Expected impact:** +0.03 to +0.06 macro-F1, especially false recall and misleading.

---

## 1.4 Fix evidence selection: no claim-level confirmation from partial evidence

A common failure pattern is citation laundering:

> A source supports one phrase in a compound input, therefore the entire input is marked confirmed.

Require a claim-evidence coverage check:

```ts
coverage = supportedEssentialClaims / totalEssentialClaims;
```

Suggested rules:
- `confirmed`: coverage must be `1.0`, no contradiction, and each essential claim has at least one evidence item;
- `false`: at least one essential core claim has direct contradiction; explain which exact subclaim;
- `misleading`: cite both the supported component and the missing/contradicted qualifier when applicable;
- `insufficient_evidence`: list unverified atomic claims explicitly.

For every final factual output, return a citation mapping:

```json
{
  "claimEvidence": [
    {
      "claimId": "c1",
      "state": "SUPPORTED",
      "evidenceIds": ["e1"]
    },
    {
      "claimId": "c2",
      "state": "CONTRADICTED",
      "evidenceIds": ["e2"]
    }
  ]
}
```

This single internal structure improves both correctness and jury-visible citation coverage.

---

# 2. Additional deterministic sources/rules that are worth adding

Do not add broad web scraping in the remaining 4 hours. It will worsen latency and citation quality. Add narrow, authoritative structured sources only where they cover frequent claim types.

## Tier 1: add if not already present

### 2.1 Polish legal acts: ISAP / Dziennik Ustaw

For claims about Polish laws, regulations, effective dates, legal status.

Use:
- ISAP: Internetowy System Aktów Prawnych;
- Dziennik Ustaw / Monitor Polski publication metadata;
- gov.pl ministry pages only as secondary/operational explanation.

Minimal implementation: metadata and official text links, not deep legal interpretation.

Rules:
- “law exists / entered into force / was published” can be deterministic from official act metadata;
- do not infer broad legal consequences from title alone;
- if legal interpretation is needed, abstain or mark insufficient evidence.

**Why it moves F1:** legal-status errors are often false/misleading and official sources are strong evidence.  
**Effort:** 0.5–1h if API/search endpoint is usable; otherwise skip.  
**Expected impact:** +0.01 to +0.03, corpus quality improvement.

### 2.2 Statistics Poland (GUS) and Eurostat SDMX/API

For rates, population, inflation, employment, migration, GDP, crime statistics.

Use a narrow mapping:
- entity/country;
- metric;
- period;
- unit;
- observed value;
- release date.

Do not build generic semantic querying. Support 5–10 likely metrics:
- CPI/inflation;
- unemployment;
- population;
- GDP growth;
- wages;
- migration;
- crime;
- energy.

Critical: attach unit and period in the evidence snippet.

**Effort:** 0.75–1.25h for one source and a narrow query adapter.  
**Expected impact:** +0.02 to +0.05 if eval has statistical claims.  
**Recommendation:** Add only if cases 08/10/12/22 are numeric/public-statistics-like. Otherwise prioritize aggregation.

### 2.3 PKW official election data

You already have election winner via Wikidata, but official PKW results are better for:
- vote share;
- turnout;
- district-level results;
- election dates;
- current/offical results.

Use this instead of Wikipedia for Polish election claims.

**Effort:** 30–45 min, assuming accessible official results pages/data.  
**Expected impact:** small overall, high citation correctness.

---

## Tier 2: sources that improve jury compliance more than immediate F1

### 2.4 Official EU data: EUR-Lex, Eurostat, EU institutional pages

Good for:
- EU legislation/status;
- membership;
- regulations;
- EU-wide statistics;
- institutional facts.

Your existing EU material should be treated as official where applicable, but EUvsDisinfo is **not** a general truth database. It is useful as a secondary fact-check source for narratives/disinformation patterns, not as authoritative evidence for every factual claim.

### 2.5 NBP

For:
- Polish currency;
- exchange rates;
- monetary policy;
- official rates.

This is especially useful for the euro/złoty type of failure. A static, cached NBP fact card can prevent this class of error.

**Effort:** 15–30 min for a narrow endpoint/cache.  
**Expected impact:** low broad coverage, but very high precision.

---

## Do not prioritize

- Adding more general search providers.
- More Wikipedia retries.
- More embeddings tuning.
- New vector DB/storage.
- General web crawling.
- A generic “misleading detector” trained on a tiny hand-labeled set.
- Fine-tuning prompts around specific eval cases.

These will cost time and increase variance without solving the structural source of your misses.

---

# 3. Evaluation hygiene: report credible F1 under nondeterminism

## 3.1 Freeze a proper evaluation protocol now

Create and commit:

```text
/eval
  cases.jsonl
  scoring.ts
  rubric.md
  run-manifest.schema.json
  results/
```

Each run must record:
- git commit SHA;
- prompt versions/hashes;
- model name and provider;
- temperature, top_p, seed if supported
