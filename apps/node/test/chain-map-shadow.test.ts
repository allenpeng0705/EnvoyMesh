/**
 * MAP worker-path wiring tests (Sprint 1 + Sprint 2).
 *
 * Verifies:
 * - `isMapShadowEnabled` (env gate)
 * - `resolveMapWorkerMode` (rollback env > shadow env > useMAP setting > off)
 * - `runOpenClawMapShadow` (legacy delivers; adapter path runs silently and
 *   audits a `chain.map_shadow` event)
 * - `runOpenClawMapPrimary` (adapter path is authoritative; emits the same
 *   partial stream; no legacy executor involved)
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { OpenClawAdapter } from "@envoymesh/agent-adapter";
import type { ChainSubtask, TaskChainPartialPayload } from "@envoymesh/protocol";
import {
  isMapShadowEnabled,
  resolveMapWorkerMode,
  runOpenClawMapPrimary,
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
  getNodeConfig?: () => Promise<unknown>;
}): ChainOrchestrationContext {
  const auditEvents: Array<Record<string, unknown>> = [];
  const ctx = {
    isOpenClawReady: overrides?.isOpenClawReady ?? (() => true),
    askOpenClaw: overrides?.askOpenClaw ?? (async () => "shadow summary"),
    getNodeConfig: overrides?.getNodeConfig ?? (async () => ({ useMAP: false })),
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

describe("resolveMapWorkerMode", () => {
  it("rollback env wins over the useMAP setting", async () => {
    process.env.ENVOYMESH_MAP_ROLLBACK = "1";
    process.env.ENVOYMESH_MAP_SHADOW = "1";
    const ctx = makeContext({ getNodeConfig: async () => ({ useMAP: true }) });
    expect(await resolveMapWorkerMode(ctx)).toBe("off");
  });

  it("shadow env selects shadow mode", async () => {
    process.env.ENVOYMESH_MAP_SHADOW = "1";
    const ctx = makeContext({ getNodeConfig: async () => ({ useMAP: true }) });
    expect(await resolveMapWorkerMode(ctx)).toBe("shadow");
  });

  it("useMAP=true selects primary", async () => {
    delete process.env.ENVOYMESH_MAP_ROLLBACK;
    delete process.env.ENVOYMESH_MAP_SHADOW;
    const ctx = makeContext({ getNodeConfig: async () => ({ useMAP: true }) });
    expect(await resolveMapWorkerMode(ctx)).toBe("primary");
  });

  it("defaults to off when useMAP is absent or false", async () => {
    delete process.env.ENVOYMESH_MAP_ROLLBACK;
    delete process.env.ENVOYMESH_MAP_SHADOW;
    expect(await resolveMapWorkerMode(makeContext({ getNodeConfig: async () => ({}) }))).toBe("off");
    expect(
      await resolveMapWorkerMode(makeContext({ getNodeConfig: async () => ({ useMAP: false }) })),
    ).toBe("off");
  });

  it("degrades to off when getNodeConfig throws", async () => {
    delete process.env.ENVOYMESH_MAP_ROLLBACK;
    delete process.env.ENVOYMESH_MAP_SHADOW;
    const ctx = makeContext({
      getNodeConfig: async () => {
        throw new Error("config unavailable");
      },
    });
    expect(await resolveMapWorkerMode(ctx)).toBe("off");
  });
});

describe("runOpenClawMapPrimary", () => {
  it("runs the subtask through the adapter path and emits the partial stream", async () => {
    const askOpenClaw = vi.fn(async () => "primary summary");
    const ctx = makeContext({ askOpenClaw });
    const partials: TaskChainPartialPayload[] = [];

    const result = await runOpenClawMapPrimary({
      deps: ctx,
      agentIdentity,
      subtask: sampleSubtask(),
      onPartial: async (p) => {
        partials.push(p);
      },
    });

    expect(result.ok).toBe(true);
    expect(result.finalNote).toBe("primary summary");
    // Progress + final partials (same wire shape as the legacy path).
    expect(partials.length).toBeGreaterThanOrEqual(2);
    expect(partials.at(-1)!.partial.isFinal).toBe(true);
    expect(partials.at(-1)!.partial.note).toBe("primary summary");
    expect(partials.at(-1)!.partial.namedArtifacts).toBeDefined();
    // The adapter is the only executor — exactly one ask.
    expect(askOpenClaw).toHaveBeenCalledTimes(1);
  });

  it("audits mode=primary chain.map_shadow events", async () => {
    const ctx = makeContext({ askOpenClaw: async () => "primary summary" });
    await runOpenClawMapPrimary({
      deps: ctx,
      agentIdentity,
      subtask: sampleSubtask(),
      onPartial: async () => undefined,
    });

    const events = (ctx as unknown as { __auditEvents: Array<Record<string, unknown>> })
      .__auditEvents;
    const primary = events.find((e) => e.type === "chain.map_shadow");
    expect(primary).toBeDefined();
    expect(String(primary?.summary)).toContain("mode=primary");
    expect(String(primary?.summary)).toContain("ok=true");
  });

  it("fails cleanly when the engine is not ready", async () => {
    const ctx = makeContext({
      isOpenClawReady: () => false,
      askOpenClaw: async () => "should not be asked",
    });
    const result = await runOpenClawMapPrimary({
      deps: ctx,
      agentIdentity,
      subtask: sampleSubtask(),
      onPartial: async () => undefined,
    });
    expect(result.ok).toBe(false);
    expect(result.finalNote).toBe("openclaw_unavailable");
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
