import { noul, TypeSafeClient } from "@typesafe-ai/sdk";
import { env } from "../env";
import type { ClaimBundle, GateResult } from "../pipeline/types";

let client: TypeSafeClient | undefined;

function getClient(): TypeSafeClient {
  if (!env.typeSafeApiKey) {
    throw new Error("TYPESAFE_API_KEY is not configured");
  }

  return (client ??= new TypeSafeClient({
    apiKey: env.typeSafeApiKey,
    defaultModel: env.jevModel,
  }));
}

export async function gateWithJev(bundle: ClaimBundle): Promise<GateResult> {
  const { answers, model } = await getClient().systemOne({
    state: {
      kind: bundle.kind,
      text: bundle.text,
    },
    questions: {
      checkable: noul(
        "Does this contain at least one disprovable factual claim about the world that can be checked against external evidence?",
      ),
    },
  });

  const probability = answers.checkable.noul;

  return {
    checkable: probability >= env.jevCheckableThreshold,
    probability,
    model,
    costUsd: 0,
    reason:
      probability >= env.jevCheckableThreshold
        ? undefined
        : "No checkable claim found by the Jev gate",
  };
}
