import { describe, expect, it } from "vitest";
import {
  OPENCLAW_RETRIEVED_CONTEXT_CAPS,
  composeOpenClawTrustedEnvoyMeshContext,
  buildEnvoyMeshRetrievedContext,
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

describe("OPENCLAW_RETRIEVED_CONTEXT_CAPS", () => {
  it("uses leaner local caps than cloud", () => {
    expect(OPENCLAW_RETRIEVED_CONTEXT_CAPS.local.maxChars).toBeLessThan(
      OPENCLAW_RETRIEVED_CONTEXT_CAPS.cloud.maxChars,
    );
    expect(OPENCLAW_RETRIEVED_CONTEXT_CAPS.local.maxBondThreads).toBeLessThan(
      OPENCLAW_RETRIEVED_CONTEXT_CAPS.cloud.maxBondThreads,
    );
  });
});

describe("buildEnvoyMeshRetrievedContext local truncation", () => {
  it("truncates local profile harder than cloud", async () => {
    const trustStore = {
      async getTrustRecord() {
        return null;
      },
      async listTrust() {
        return [];
      },
    } as any;
    const longDoc = "x".repeat(12_000);
    const agentIdentityStore = {
      async load() {
        return { content: longDoc };
      },
    } as any;

    const cloud = await buildEnvoyMeshRetrievedContext({
      message: "hello",
      ownerId: "owner-1",
      bonds: [],
      chatLogStore: null,
      trustStore,
      humanProfileStore: null,
      agentIdentityStore,
      vaultDir: "/tmp/no-vault-envoy-local-test",
      ragService: null,
      profile: "cloud",
    });
    const local = await buildEnvoyMeshRetrievedContext({
      message: "hello",
      ownerId: "owner-1",
      bonds: [],
      chatLogStore: null,
      trustStore,
      humanProfileStore: null,
      agentIdentityStore,
      vaultDir: "/tmp/no-vault-envoy-local-test",
      ragService: null,
      profile: "local",
    });

    expect(local.length).toBeLessThanOrEqual(OPENCLAW_RETRIEVED_CONTEXT_CAPS.local.maxChars);
    expect(local.length).toBeLessThan(cloud.length);
    expect(local).toContain("truncated");
  });
});
