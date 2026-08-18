/**
 * Node-side Pi adapter wiring seam tests.
 */
import { describe, expect, it, vi } from "vitest";
import type { AgentResult } from "@envoymesh/protocol";
import { createPiAdapterFromHost, type PiMapHost } from "../src/pi-map-adapter.js";

const baseInput = {
  skillId: "debug",
  objective: "Investigate the flaky test",
  inputArtifacts: [],
  costCeilingUsd: 5,
  deadlineMs: 120_000,
  correlationId: "chain_1:subtask_1",
  signal: new AbortController().signal,
};

function makeHost(overrides?: Partial<PiMapHost>): PiMapHost {
  return {
    prompt: vi.fn(async () => ({
      text: "The test races on a shared timer.",
      model: "mini-max",
      toolCallCount: 3,
      cancelled: false,
    })),
    isReady: () => true,
    workerPeerId: "envoy_agent_self",
    signResult: (unsigned: AgentResult) => ({ ...unsigned, signature: "sig" }),
    ...overrides,
  };
}

describe("createPiAdapterFromHost", () => {
  it("stamps the pi runtime and routes execute through the host prompt", async () => {
    const host = makeHost();
    const adapter = createPiAdapterFromHost(host);
    const result = await adapter.execute({ ...baseInput });

    expect(adapter.runtime).toBe("pi");
    expect(host.prompt).toHaveBeenCalledOnce();
    const promptText = String((host.prompt as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]);
    expect(promptText).toContain("Required skill hint: debug");
    expect(result.runtime).toBe("pi");
    expect(result.peerId).toBe("envoy_agent_self");
    expect(result.signature).toBe("sig");
  });

  it("verify passes with low confidence when the live path has no tool trace", async () => {
    const adapter = createPiAdapterFromHost(makeHost());
    const result = await adapter.execute({ ...baseInput });
    const verdicts = await adapter.verify({
      result,
      objective: baseInput.objective,
    });
    expect(verdicts[0]?.kind).toBe("pass");
    if (verdicts[0]?.kind === "pass") expect(verdicts[0].confidence).toBe("low");
  });

  it("buildManifest advertises pi skills", async () => {
    const adapter = createPiAdapterFromHost(makeHost());
    const manifest = await adapter.buildManifest({
      peerId: "peer-x",
      ownerId: "owner-y",
      reputationBySkill: {},
    });
    expect(manifest.runtime).toBe("pi");
    expect(manifest.skills.some((s) => s.skillId === "code_review")).toBe(true);
  });
});
