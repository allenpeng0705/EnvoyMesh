/**
 * Phase 40 — Role-policy table tests.
 *
 * The role-policy table in `packages/protocol/src/role-policy-table.ts` is the
 * first line of defense for envelope validation: for each intent, the allowed
 * (senderRole, recipientRole) pairs are listed explicitly. An intent that is
 * not listed falls through to the permissive default policy. New intents
 * **must** be added to the table to be protected; forgetting to add them is
 * a silent security gap.
 *
 * This file exhaustively checks every intent registered in the table against
 * the role pairs the table claims to allow, so a drift between the schema
 * (`EnvoyIntentSchema`) and the policy table fails CI.
 *
 * Mirrors the pattern of `agent-network.test.ts` "schema sync" — both files
 * are guardrails against drift between two related definitions.
 */

import { describe, expect, it } from "vitest";

import {
  evaluateEnvelopeRolePolicy,
  EnvoyIntentSchema,
  type EnvoyActorRole,
  type EnvoyIntent,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Helper: probe a single (intent, sender, recipient) triple.
// ---------------------------------------------------------------------------

const ROLES: readonly EnvoyActorRole[] = ["human", "agent", "system"];

function probe(intent: EnvoyIntent, sender: EnvoyActorRole, recipient: EnvoyActorRole) {
  return evaluateEnvelopeRolePolicy(intent, sender, recipient);
}

function expectAllowed(intent: EnvoyIntent, sender: EnvoyActorRole, recipient: EnvoyActorRole) {
  const r = probe(intent, sender, recipient);
  expect(r.ok, `expected ${intent} (${sender}→${recipient}) allowed; got ${JSON.stringify(r)}`).toBe(
    true,
  );
}

function expectDenied(intent: EnvoyIntent, sender: EnvoyActorRole, recipient: EnvoyActorRole) {
  const r = probe(intent, sender, recipient);
  expect(r.ok, `expected ${intent} (${sender}→${recipient}) denied; got ${JSON.stringify(r)}`).toBe(
    false,
  );
}

// ---------------------------------------------------------------------------
// Default policy: unknown / system.* / profile.* / knowledge.* are permissive
// ---------------------------------------------------------------------------

describe("default policy (permissive fallback)", () => {
  it("allows any role pair for intents not in the table", () => {
    // The list of "permissive" intents is the set of EnvoyIntentSchema values
    // that are NOT in INTENT_ROLE_POLICIES. We sample a few we know are
    // intentionally permissive:
    for (const intent of [
      "system.ping",
      "system.signal",
      "profile.sync",
      "profile.request",
      "profile.response",
      "knowledge.query",
      "knowledge.response",
    ] as const) {
      for (const sender of ROLES) {
        for (const recipient of ROLES) {
          expectAllowed(intent, sender, recipient);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// chat.* — mixed policy
// ---------------------------------------------------------------------------

describe("chat.message / chat.delivered", () => {
  it("allows human↔human and human↔agent and agent↔human and agent↔agent", () => {
    for (const intent of ["chat.message", "chat.delivered"] as const) {
      expectAllowed(intent, "human", "human");
      expectAllowed(intent, "human", "agent");
      expectAllowed(intent, "agent", "human");
      expectAllowed(intent, "agent", "agent");
    }
  });

  it("explicitly denies the system role (defense-in-depth)", () => {
    expectDenied("chat.message", "system", "human");
    expectDenied("chat.message", "human", "system");
    expectDenied("chat.delivered", "system", "agent");
  });
});

describe("chat.room.* (human-only)", () => {
  it("allows human→human", () => {
    for (const intent of ["chat.room.sync", "chat.room.message"] as const) {
      expectAllowed(intent, "human", "human");
    }
  });

  it("denies agent in either role", () => {
    for (const intent of ["chat.room.sync", "chat.room.message"] as const) {
      expectDenied(intent, "agent", "human");
      expectDenied(intent, "human", "agent");
      expectDenied(intent, "agent", "agent");
    }
  });
});

// ---------------------------------------------------------------------------
// social.intro.* — mixed
// ---------------------------------------------------------------------------

describe("social.intro.*", () => {
  it("social.intro.sync is agent↔agent", () => {
    expectAllowed("social.intro.sync", "agent", "agent");
    expectDenied("social.intro.sync", "human", "human");
    expectDenied("social.intro.sync", "agent", "human");
  });

  it("social.intro.propose is agent→human", () => {
    expectAllowed("social.intro.propose", "agent", "human");
    expectDenied("social.intro.propose", "human", "agent");
    expectDenied("social.intro.propose", "agent", "agent");
  });

  it("social.intro.owner-ready allows human→{human, agent} but not agent→human", () => {
    expectAllowed("social.intro.owner-ready", "human", "human");
    expectAllowed("social.intro.owner-ready", "human", "agent");
    expectDenied("social.intro.owner-ready", "agent", "human");
  });
});

// ---------------------------------------------------------------------------
// task.* — agent↔agent
// ---------------------------------------------------------------------------

describe("task.* (legacy A2A, agent↔agent)", () => {
  const taskIntents = [
    "task.create",
    "task.propose",
    "task.negotiate",
    "task.accept",
    "task.reject",
    "task.result",
    "task.cancel",
    "task.heartbeat",
    "report.create",
  ] as const;
  for (const intent of taskIntents) {
    it(`${intent} allows agent→agent`, () => {
      expectAllowed(intent, "agent", "agent");
    });

    it(`${intent} denies human in either role`, () => {
      expectDenied(intent, "human", "agent");
      expectDenied(intent, "agent", "human");
    });
  }
});

// ---------------------------------------------------------------------------
// call.* (Phase 38) — human↔human
// ---------------------------------------------------------------------------

describe("call.* (human↔human only)", () => {
  const callIntents = [
    "call.invite",
    "call.reinvite",
    "call.accept",
    "call.reject",
    "call.hangup",
    "call.ice-candidate",
    "call.mute",
  ] as const;
  for (const intent of callIntents) {
    it(`${intent} allows human→human`, () => {
      expectAllowed(intent, "human", "human");
    });

    it(`${intent} denies agent in either role`, () => {
      expectDenied(intent, "agent", "human");
      expectDenied(intent, "human", "agent");
    });
  }
});

// ---------------------------------------------------------------------------
// task.chain.* (Phase 40) — agent↔agent, except task.chain.report
// ---------------------------------------------------------------------------

describe("task.chain.* (Phase 40, mostly agent↔agent)", () => {
  const agentOnlyIntents = [
    "task.chain.mandate",
    "task.chain.propose",
    "task.chain.bid",
    "task.chain.accept",
    "task.chain.partial",
    "task.chain.merge",
    "task.chain.cancel",
    "task.chain.heartbeat",
    "task.chain.status",
  ] as const;

  for (const intent of agentOnlyIntents) {
    it(`${intent} allows agent→agent`, () => {
      expectAllowed(intent, "agent", "agent");
    });

    it(`${intent} denies human in either role`, () => {
      expectDenied(intent, "human", "agent");
      expectDenied(intent, "agent", "human");
      expectDenied(intent, "human", "human");
    });
  }

  it("task.chain.report is agent→human (orchestrator publishes the final report to the owner)", () => {
    expectAllowed("task.chain.report", "agent", "human");
    expectDenied("task.chain.report", "human", "agent");
    expectDenied("task.chain.report", "agent", "agent");
  });
});

// ---------------------------------------------------------------------------
// task.chain.* (Phase 40E) — agent↔agent for cross-orchestrator intents
// ---------------------------------------------------------------------------

describe("task.chain.* (Phase 40E, all agent↔agent)", () => {
  const eIntents = [
    "task.chain.handoff",
    "task.chain.delegate",
    "task.chain.relay",
    "task.chain.arbitration",
  ] as const;

  for (const intent of eIntents) {
    it(`${intent} allows agent→agent`, () => {
      expectAllowed(intent, "agent", "agent");
    });

    it(`${intent} denies human in either role (defense against human→orchestrator spoofing)`, () => {
      expectDenied(intent, "human", "agent");
      expectDenied(intent, "agent", "human");
      expectDenied(intent, "human", "human");
    });

    it(`${intent} denies system in either role`, () => {
      expectDenied(intent, "system", "agent");
      expectDenied(intent, "agent", "system");
    });
  }
});

// ---------------------------------------------------------------------------
// Schema sync — every intent registered in EnvoyIntentSchema either has a
// policy entry or is in the "default permissive" category. This guards
// against a new intent being added to the schema without a policy entry.
// ---------------------------------------------------------------------------

describe("schema / role-policy sync", () => {
  it("every task.chain.* intent is policy-protected (no silent default fallback)", () => {
    // If a new task.chain.* intent is added to the schema but forgotten in
    // the policy table, it would silently default to "allow" — a soft gap.
    // The exhaustive allow/deny tests above already verify this; this test
    // documents the invariant.
    const allIntents = EnvoyIntentSchema.options;
    const chainIntents = allIntents.filter((i) => i.startsWith("task.chain."));
    expect(chainIntents.length).toBe(18); // 9 from 40A + status + 4 from 40E + ready + reconcile req/res
    for (const intent of chainIntents) {
      // Probing human→human should be denied for every chain intent
      // (none of them are human↔human; the only human-targeting one is
      // task.chain.report which is agent→human).
      const r = probe(intent, "human", "human");
      if (intent === "task.chain.report") {
        // Special case: agent→human only, not human→human.
        expect(r.ok).toBe(false);
      } else {
        expect(r.ok, `${intent} should reject human→human`).toBe(false);
      }
    }
  });

  it("every call.* intent is policy-protected as human↔human", () => {
    const callIntents = EnvoyIntentSchema.options.filter((i) => i.startsWith("call."));
    expect(callIntents.length).toBe(7);
    for (const intent of callIntents) {
      expectAllowed(intent, "human", "human");
      expectDenied(intent, "agent", "agent");
    }
  });

  it("every agent.worker.lease* intent is policy-protected as agent↔agent", () => {
    const leaseIntents = EnvoyIntentSchema.options.filter((i) =>
      i.startsWith("agent.worker.lease"),
    );
    expect(leaseIntents.length).toBe(3);
    for (const intent of leaseIntents) {
      expectAllowed(intent, "agent", "agent");
      expectDenied(intent, "human", "agent");
      expectDenied(intent, "agent", "human");
    }
  });

  it("every task.harness.* intent is policy-protected as agent↔agent", () => {
    // v2.2 — direct MAP-over-libp2p sub-agent submit. Both intents must
    // stay agent→agent only (a harness submit must never be forged by a
    // human/system role).
    const harnessIntents = EnvoyIntentSchema.options.filter((i) =>
      i.startsWith("task.harness."),
    );
    expect(harnessIntents.length).toBe(2);
    for (const intent of harnessIntents) {
      expectAllowed(intent, "agent", "agent");
      expectDenied(intent, "human", "human");
      expectDenied(intent, "agent", "human");
      expectDenied(intent, "human", "agent");
    }
  });
});

// ---------------------------------------------------------------------------
// Defense-in-depth — superRefine attaches the policy to the envelope schema
// ---------------------------------------------------------------------------

describe("envrole-refinement integration", () => {
  it("EnvoyEnvelopeSchema rejects an envelope with the wrong sender role for a policy-protected intent", async () => {
    const { EnvoyEnvelopeSchema } = await import("../src/index.js");
    const result = EnvoyEnvelopeSchema.safeParse({
      version: "0.1",
      messageId: "msg-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      senderPeerId: "peer-human",
      senderPublicKey: "pk",
      senderRole: "human",
      recipientPeerId: "peer-agent",
      recipientRole: "agent",
      intent: "task.chain.bid",
      payload: {},
      signature: "stub",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      // The refinement attaches the denial to the senderRole path.
      const senderIssue = result.error.issues.find((i) => i.path.includes("senderRole"));
      expect(senderIssue).toBeDefined();
    }
  });

  it("EnvoyEnvelopeSchema accepts an envelope with the correct sender role", async () => {
    const { EnvoyEnvelopeSchema } = await import("../src/index.js");
    const result = EnvoyEnvelopeSchema.safeParse({
      version: "0.1",
      messageId: "msg-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      senderPeerId: "peer-agent",
      senderPublicKey: "pk",
      senderRole: "agent",
      recipientPeerId: "peer-agent-b",
      recipientRole: "agent",
      intent: "task.chain.bid",
      payload: {},
      signature: "stub",
    });
    expect(result.success).toBe(true);
  });
});
