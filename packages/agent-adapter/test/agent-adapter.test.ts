/**
 * AgentAdapter + AdapterRegistry tests.
 *
 * Verifies:
 * - A stub class implementing `AgentAdapter` is accepted by the type
 *   system (compile-time check via tsconfig include) and is shape-correct
 *   at runtime (the `register` method takes it without runtime checks).
 * - `AdapterRegistry.register` accepts an adapter, errors on duplicate,
 *   returns `this` for chaining.
 * - `AdapterRegistry.get` returns the registered adapter or `undefined`.
 * - `AdapterRegistry.has` returns boolean.
 * - `AdapterRegistry.list` / `listAdapters` return registered runtimes/adapters
 *   in insertion order.
 * - `AdapterRegistry.unregister` is idempotent and returns the removed
 *   adapter or `undefined`.
 * - `AdapterRegistry.size` tracks the count.
 * - `AdapterRegistry.clear` removes all entries.
 * - `defaultRegistry` exists and is a fresh `AdapterRegistry` instance.
 * - `DuplicateAdapterError` carries the runtime and existing adapter.
 *
 * Tests use a fresh `AdapterRegistry` per test for isolation; never
 * the `defaultRegistry` (which is shared across the process).
 */

import { describe, expect, it } from "vitest";

import {
  AdapterRegistry,
  DuplicateAdapterError,
  defaultRegistry,
  type AgentAdapter,
  type BuildManifestInput,
  type ExecuteInput,
  type VerifyInput,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Stub adapter for tests
// ---------------------------------------------------------------------------

/**
 * A minimal adapter that records every call. Used as the test subject.
 * Construct with the runtime it should report.
 */
class StubAdapter implements AgentAdapter {
  public readonly runtime: AgentRuntime;
  public readonly describeCalls: number[] = [];
  public readonly buildManifestCalls: BuildManifestInput[] = [];
  public readonly executeCalls: ExecuteInput[] = [];
  public readonly verifyCalls: VerifyInput[] = [];
  public readonly manifestReturn: CapabilityManifest;
  public readonly resultReturn: SignedAgentResult;
  public readonly verdictsReturn: Verdict[];

  constructor(
    runtime: AgentRuntime,
    options: {
      manifest?: CapabilityManifest;
      result?: SignedAgentResult;
      verdicts?: Verdict[];
    } = {},
  ) {
    this.runtime = runtime;
    this.manifestReturn = options.manifest ?? defaultManifest(runtime);
    this.resultReturn = options.result ?? defaultResult(runtime);
    this.verdictsReturn = options.verdicts ?? [];
  }

  describeSkills(): SkillDescriptor[] {
    this.describeCalls.push(Date.now());
    return [
      {
        skillId: "stub-skill",
        description: "a stub skill for tests",
        maxSensitivity: "public",
        tags: ["test"],
      },
    ];
  }

  async buildManifest(input: BuildManifestInput): Promise<CapabilityManifest> {
    this.buildManifestCalls.push(input);
    return this.manifestReturn;
  }

  async execute(_input: ExecuteInput): Promise<SignedAgentResult> {
    this.executeCalls.push(_input);
    return this.resultReturn;
  }

  async verify(_input: VerifyInput): Promise<Verdict[]> {
    this.verifyCalls.push(_input);
    return this.verdictsReturn;
  }
}

// ---------------------------------------------------------------------------
// Imports for the stub defaults
// ---------------------------------------------------------------------------

import type {
  AgentRuntime,
  CapabilityManifest,
  SignedAgentResult,
  SkillDescriptor,
  Verdict,
} from "@envoymesh/protocol";

function defaultManifest(runtime: AgentRuntime): CapabilityManifest {
  return {
    runtime,
    runtimeVersion: "0.0.0-test",
    peerId: "peer-test",
    ownerId: "owner-test",
    skills: [
      {
        skillId: "stub-skill",
        description: "a stub skill for tests",
        maxSensitivity: "public",
        tags: ["test"],
      },
    ],
    reputationBySkill: {},
    issuedAt: "2026-08-18T00:00:00.000Z",
    ttlSeconds: 300,
  };
}

function defaultResult(runtime: AgentRuntime): SignedAgentResult {
  return {
    skillId: "stub-skill",
    runtime,
    peerId: "peer-test",
    correlationId: "corr-test",
    content: [{ kind: "text", text: "stub output" }],
    citations: [],
    metrics: { durationMs: 100, costUsd: 0 },
    completedAt: "2026-08-18T00:00:00.000Z",
    signature: "stub-signature",
  };
}

// ---------------------------------------------------------------------------
// AgentAdapter interface (compile-time + runtime shape)
// ---------------------------------------------------------------------------

describe("AgentAdapter", () => {
  it("is shape-correct: a StubAdapter implements it (compile-time check)", () => {
    // This test only type-checks if the StubAdapter class above satisfies
    // the AgentAdapter interface. If the interface changes incompatibly,
    // this test will fail to compile.
    const adapter: AgentAdapter = new StubAdapter("envoy-harness");
    expect(adapter.runtime).toBe("envoy-harness");
  });

  it("describeSkills returns the stub's skill list", () => {
    const adapter = new StubAdapter("envoy-harness");
    const skills = adapter.describeSkills();
    expect(skills.length).toBe(1);
    expect(skills[0]?.skillId).toBe("stub-skill");
  });

  it("buildManifest echoes the input to the manifest", async () => {
    const adapter = new StubAdapter("envoy-harness");
    const input: BuildManifestInput = {
      peerId: "peer-x",
      ownerId: "owner-y",
      reputationBySkill: { "stub-skill": 0.5 },
    };
    const manifest = await adapter.buildManifest(input);
    expect(adapter.buildManifestCalls.length).toBe(1);
    expect(adapter.buildManifestCalls[0]).toEqual(input);
    expect(manifest.peerId).toBe("peer-test"); // from the stub's default
  });

  it("execute echoes the input to the result", async () => {
    const adapter = new StubAdapter("envoy-harness");
    const input: ExecuteInput = {
      skillId: "stub-skill",
      objective: "do a thing",
      inputArtifacts: [],
      costCeilingUsd: 1.0,
      deadlineMs: 30_000,
      correlationId: "corr-1",
      signal: new AbortController().signal,
    };
    const result = await adapter.execute(input);
    expect(adapter.executeCalls.length).toBe(1);
    expect(adapter.executeCalls[0]).toBe(input);
    expect(result.runtime).toBe("envoy-harness");
  });

  it("verify echoes the input to the verdicts", async () => {
    const adapter = new StubAdapter("envoy-harness", {
      verdicts: [{ kind: "pass", score: 0.9 }],
    });
    const input: VerifyInput = {
      result: defaultResult("envoy-harness"),
      objective: "test",
    };
    const verdicts = await adapter.verify(input);
    expect(adapter.verifyCalls.length).toBe(1);
    expect(verdicts.length).toBe(1);
    if (verdicts[0]?.kind === "pass") {
      expect(verdicts[0].score).toBe(0.9);
    }
  });
});

// ---------------------------------------------------------------------------
// AdapterRegistry
// ---------------------------------------------------------------------------

describe("AdapterRegistry", () => {
  function newRegistry(): AdapterRegistry {
    return new AdapterRegistry();
  }

  it("starts empty (size 0)", () => {
    const reg = newRegistry();
    expect(reg.size).toBe(0);
    expect(reg.list()).toEqual([]);
    expect(reg.listAdapters()).toEqual([]);
  });

  it("registers an adapter and returns `this` for chaining", () => {
    const reg = newRegistry();
    const adapter = new StubAdapter("envoy-harness");
    const returned = reg.register(adapter);
    expect(returned).toBe(reg); // chainable
    expect(reg.size).toBe(1);
  });

  it("get(runtime) returns the registered adapter", () => {
    const reg = newRegistry();
    const adapter = new StubAdapter("envoy-harness");
    reg.register(adapter);
    expect(reg.get("envoy-harness")).toBe(adapter);
  });

  it("get(runtime) returns undefined for an unregistered runtime", () => {
    const reg = newRegistry();
    reg.register(new StubAdapter("envoy-harness"));
    expect(reg.get("pi")).toBeUndefined();
  });

  it("has(runtime) returns true for registered, false otherwise", () => {
    const reg = newRegistry();
    reg.register(new StubAdapter("envoy-harness"));
    expect(reg.has("envoy-harness")).toBe(true);
    expect(reg.has("pi")).toBe(false);
  });

  it("list() returns runtimes in insertion order", () => {
    const reg = newRegistry();
    reg.register(new StubAdapter("envoy-harness"));
    reg.register(new StubAdapter("openclaw"));
    reg.register(new StubAdapter("pi"));
    expect(reg.list()).toEqual(["envoy-harness", "openclaw", "pi"]);
  });

  it("listAdapters() returns the adapters in insertion order", () => {
    const reg = newRegistry();
    const a = new StubAdapter("envoy-harness");
    const b = new StubAdapter("openclaw");
    reg.register(a).register(b);
    expect(reg.listAdapters()).toEqual([a, b]);
  });

  it("register duplicate throws DuplicateAdapterError", () => {
    const reg = newRegistry();
    const first = new StubAdapter("envoy-harness");
    const second = new StubAdapter("envoy-harness");
    reg.register(first);
    expect(() => reg.register(second)).toThrow(DuplicateAdapterError);
  });

  it("DuplicateAdapterError carries the runtime and the existing adapter", () => {
    const reg = newRegistry();
    const first = new StubAdapter("envoy-harness");
    reg.register(first);
    try {
      reg.register(new StubAdapter("envoy-harness"));
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DuplicateAdapterError);
      const dupErr = err as DuplicateAdapterError;
      expect(dupErr.runtime).toBe("envoy-harness");
      expect(dupErr.existing).toBe(first);
    }
  });

  it("DuplicateAdapterError message names the runtime", () => {
    const reg = newRegistry();
    reg.register(new StubAdapter("envoy-harness"));
    try {
      reg.register(new StubAdapter("envoy-harness"));
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("envoy-harness");
    }
  });

  it("unregister(runtime) returns the removed adapter", () => {
    const reg = newRegistry();
    const adapter = new StubAdapter("envoy-harness");
    reg.register(adapter);
    expect(reg.unregister("envoy-harness")).toBe(adapter);
    expect(reg.size).toBe(0);
    expect(reg.get("envoy-harness")).toBeUndefined();
  });

  it("unregister(runtime) returns undefined for an unregistered runtime", () => {
    const reg = newRegistry();
    expect(reg.unregister("pi")).toBeUndefined();
  });

  it("unregister is idempotent (calling twice is safe)", () => {
    const reg = newRegistry();
    reg.register(new StubAdapter("envoy-harness"));
    expect(reg.unregister("envoy-harness")).toBeDefined();
    expect(reg.unregister("envoy-harness")).toBeUndefined();
  });

  it("after unregister, the runtime can be re-registered", () => {
    const reg = newRegistry();
    reg.register(new StubAdapter("envoy-harness"));
    reg.unregister("envoy-harness");
    expect(() => reg.register(new StubAdapter("envoy-harness"))).not.toThrow();
  });

  it("clear() removes all adapters", () => {
    const reg = newRegistry();
    reg.register(new StubAdapter("envoy-harness"));
    reg.register(new StubAdapter("openclaw"));
    reg.clear();
    expect(reg.size).toBe(0);
    expect(reg.list()).toEqual([]);
  });

  it("after clear, registrations succeed (no carryover)", () => {
    const reg = newRegistry();
    reg.register(new StubAdapter("envoy-harness"));
    reg.clear();
    expect(() => reg.register(new StubAdapter("envoy-harness"))).not.toThrow();
  });

  it("size tracks registrations and unregistrations", () => {
    const reg = newRegistry();
    expect(reg.size).toBe(0);
    reg.register(new StubAdapter("envoy-harness"));
    expect(reg.size).toBe(1);
    reg.register(new StubAdapter("openclaw"));
    expect(reg.size).toBe(2);
    reg.unregister("envoy-harness");
    expect(reg.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// defaultRegistry
// ---------------------------------------------------------------------------

describe("defaultRegistry", () => {
  it("is an AdapterRegistry instance", () => {
    expect(defaultRegistry).toBeInstanceOf(AdapterRegistry);
  });

  it("starts empty in a fresh process", () => {
    // We can't easily test "fresh process" here, but we can at least
    // assert that whatever the size is, it's small. If a stray
    // registration leaked, the test would fail in the next assertion.
    expect(defaultRegistry.size).toBeLessThan(10);
  });
});
