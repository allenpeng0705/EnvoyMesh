import { describe, expect, it } from "vitest";
import {
  composeOpenClawTrustedEnvoyMeshContext,
} from "../src/openclaw-turn-context.js";

describe("composeOpenClawTrustedEnvoyMeshContext", () => {
  it("merges policy and retrieved sections for GroupSystemPrompt", () => {
    const out = composeOpenClawTrustedEnvoyMeshContext({
      policyPrompt: "Bond autonomy: DENIED",
      retrievedContext: "### Knowledge base\n- doc snippet",
    });
    expect(out).toContain("## EnvoyMesh policy");
    expect(out).toContain("Bond autonomy: DENIED");
    expect(out).toContain("## EnvoyMesh retrieved context");
    expect(out).toContain("doc snippet");
  });

  it("falls back from legacy systemPrompt to policy", () => {
    const out = composeOpenClawTrustedEnvoyMeshContext({
      systemPrompt: "legacy policy line",
    });
    expect(out).toBe("## EnvoyMesh policy\nlegacy policy line");
  });

  it("matches extension compose helper shape", async () => {
    const { composeEnvoyMeshGroupSystemPrompt } = await import(
      "../../../packages/openclaw/extensions/envoymesh/src/context-compose.js"
    );
    expect(
      composeEnvoyMeshGroupSystemPrompt({
        policyPrompt: "p",
        retrievedContext: "r",
      }),
    ).toContain("## EnvoyMesh retrieved context\nr");
  });
});
