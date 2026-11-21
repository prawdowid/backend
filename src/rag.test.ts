import { expect, test } from "bun:test";
import { cosineSimilarity, localEmbed } from "./rag";

test("local embeddings are deterministic and normalized", () => {
  const first = localEmbed("A claim about a 2024 election result");
  const second = localEmbed("A claim about a 2024 election result");

  expect(first).toEqual(second);
  expect(Math.hypot(...first)).toBeCloseTo(1, 6);
  expect(first).toHaveLength(384);
});

test("local embeddings rank similar text above unrelated text", () => {
  const query = localEmbed("The report says 75% of adults were vaccinated");
  const similar = localEmbed("A report says 75% of adults got the vaccine");
  const unrelated = localEmbed("The cat sat on the windowsill");

  expect(cosineSimilarity(query, similar)).toBeGreaterThan(
    cosineSimilarity(query, unrelated),
  );
});
