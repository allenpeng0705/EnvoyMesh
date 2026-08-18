/**
 * MAP shadow-mode wiring tests (Sprint 1).
 *
 * Verifies `isMapShadowEnabled` (env gate) and `runOpenClawMapShadow`
 * (legacy path delivers the real result; the MAP adapter path runs silently
 * and audits a `chain.map_shadow` event).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { OpenClawAdapter } from "@envoymesh/agent-adapter";
import type { ChainSubtask, TaskChainPartialPayload } from "@envoymesh/protocol";
import {
  isMapShadowEnabled,
  runOpenClawMapShadow,
  type ChainOrchestrationContext,
} from "../src/node-service-chain-orchestration.js";

const REAL_ENV = { ...process.env };

const workerKeyPair = generateKeyPairSync("ed25519");

const agentIdentity = {
  agentPeerId: "envoy_agent_self",
  agentPublicKeyPem: workerKeyPair.publicKey.export({ format: "pem", type: "spki" }).toString(),
  agentPrivateKeyPem: workerKeyPair.privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  ownerId: "envoy:owner:test",
  agentCredential: {} as never,
};

afterEach(() => {
  process.env = { ...REAL_ENV };
});

function sampleSubtask(): ChainSubtask {
  return {
    version: "0.1",
    subtaskId: "subtask_1",
    chainId: "chain_1",
    chainMandateId: "mandate_1",
    depth: 1,
    requiredSkill: "research",
    objective: "Summarize local LLM trends",
    requestedResult: "markdown summary",
    constraints: [],
    dependsOn: [],
    createdAt: new Date().toISOString(),
  } as ChainSubtask;
}

function makeContext(overrides?: {
  askOpenClaw?: (prompt: string) => Promise<string>;
  isOpenClawReady?: () => boolean;
}): ChainOrchestrationContext {
  const auditEvents: Array<Record<string, unknown>> = [];
  const ctx = {
    isOpenClawReady: overrides?.isOpenClawReady ?? (() => true),
    askOpenClaw: overrides?.askOpenClaw ?? (async () => "shadow summary"),
    getTaskStore: () => ({
      appendAuditEvent: (event: unknown) => {
        auditEvents.push(event as Record<string, unknown>);
      },
    }),
  };
  (ctx as Record<string, unknown>).__auditEvents = auditEvents;
  return ctx as unknown as ChainOrchestrationContext;
}

describe("isMapShadowEnabled", () => {
  it("is disabled unless ENVOYMESH_MAP_SHADOW=1", () => {
    delete process.env.ENVOYMESH_MAP_SHADOW;
    expect(isMapShadowEnabled()).toBe(false);
    process.env.ENVOYMESH_MAP_SHADOW = "0";
    expect(isMapShadowEnabled()).toBe(false);
    process.env.ENVOYMESH_MAP_SHADOW = "1";
    expect(isMapShadowEnabled()).toBe(true);
  });
});

describe("runOpenClawMapShadow", () => {
  it("delivers the legacy result while running the adapter path silently", async () => {
    const askOpenClaw = vi.fn(async () => "legacy summary");
    const ctx = makeContext({ askOpenClaw });
    const deliveredPartials: string[] = [];
    const legacyExec = vi.fn(async (
      _subtask: ChainSubtask,
      onPartial: (p: TaskChainPartialPayload) => Promise<void>,
    ) => {
      await onPartial({
        partial: {
          version: "0.1",
          subtaskId: "subtask_1",
          chainId: "chain_1",
          workerPeerId: "envoy_agent_self",
          seq: 1,
          isFinal: true,
          note: "legacy summary",
          createdAt: new Date().toISOString(),
        },
      });
      return { ok: true, finalNote: "legacy summary" };
    });

    const result = await runOpenClawMapShadow({
      deps: ctx,
      agentIdentity,
      legacyExec,
      subtask: sampleSubtask(),
      onPartial: async (p) => {
        deliveredPartials.push(p.partial.note ?? "");
      },
    });

    // The delivered result comes from the legacy path (behavior unchanged).
    expect(result.ok).toBe(true);
    expect(result.finalNote).toBe("legacy summary");
    expect(deliveredPartials).toEqual(["legacy summary"]);
    // The shadow adapter path ran too — its ask went through askOpenClaw
    // exactly once (the legacy mock above does not ask).
    expect(askOpenClaw).toHaveBeenCalledTimes(1);
  });

  it("audits a chain.map_shadow event on the shadow outcome", async () => {
    const ctx = makeContext({ askOpenClaw: async () => "shadow summary" });
    const legacyExec = vi.fn(async () => ({ ok: true, finalNote: "legacy summary" }));

    await runOpenClawMapShadow({
      deps: ctx,
      agentIdentity,
      legacyExec,
      subtask: sampleSubtask(),
      onPartial: async () => undefined,
    });

    const events = (ctx as unknown as { __auditEvents: Array<Record<string, unknown>> })
      .__auditEvents;
    expect(events.some((e) => e.type === "chain.map_shadow")).toBe(true);
    const shadow = events.find((e) => e.type === "chain.map_shadow");
    expect(String(shadow?.summary)).toContain("subtaskId=subtask_1");
    expect(String(shadow?.summary)).toContain("overall=pass");
  });
});

describe("OpenClawAdapter wiring shape", () => {
  it("constructs with the production ask/sign signature", () => {
    const adapter = new OpenClawAdapter({
      askViaRuntime: async () => "x",
      isReady: () => true,
      workerPeerId: "envoy_agent_self",
      signResult: (u) => ({ ...u, signature: "s" }),
    });
    expect(adapter.runtime).toBe("openclaw");
  });
});
