import { describe, expect, it, beforeEach } from "vitest";
import {
  COORDINATOR_SMALL_BOND_SET_MAX,
  COORDINATOR_DISCONNECTED_WARM_MS,
  COORDINATOR_RELAY_UPGRADE_MS,
  COORDINATOR_KEEPALIVE_PROBE_MS,
  classifyWarmDialKind,
  evaluateWarmCoordinator,
  recordWarmDialStarted,
  resetWarmCoordinatorForTests,
} from "../src/outbound-warm-coordinator.js";

describe("outbound-warm-coordinator", () => {
  beforeEach(() => {
    resetWarmCoordinatorForTests();
  });

  it("classifies read-only verifyOnly", () => {
    expect(
      classifyWarmDialKind({
        options: { verifyOnly: true },
        existing: { connected: false, direct: false },
      }),
    ).toBe("read_only");
  });

  it("classifies disconnected warm", () => {
    expect(
      classifyWarmDialKind({
        existing: { connected: false, direct: false },
      }),
    ).toBe("disconnected_warm");
  });

  it("blocks repeated bond_warm disconnected warm within cooldown", () => {
    const peer = "12D3KooWCooldown";
    recordWarmDialStarted({ transportPeerId: peer, kind: "disconnected_warm", now: 1000 });
    const decision = evaluateWarmCoordinator({
      transportPeerId: peer,
      kind: "disconnected_warm",
      options: { source: "bond_warm" },
      now: 1000 + COORDINATOR_DISCONNECTED_WARM_MS - 1,
    });
    expect(decision.allow).toBe(false);
  });

  it("allows chat-open warm during bond_warm cooldown", () => {
    const peer = "12D3KooWOpenChat";
    recordWarmDialStarted({ transportPeerId: peer, kind: "disconnected_warm", now: 1000 });
    const decision = evaluateWarmCoordinator({
      transportPeerId: peer,
      kind: "disconnected_warm",
      options: { source: "open_chat" },
      now: 1500,
    });
    expect(decision.allow).toBe(true);
  });

  it("allows legacy UI warm without source during bond_warm cooldown", () => {
    const peer = "12D3KooWLegacyWarm";
    recordWarmDialStarted({ transportPeerId: peer, kind: "disconnected_warm", now: 1000 });
    const decision = evaluateWarmCoordinator({
      transportPeerId: peer,
      kind: "disconnected_warm",
      now: 1500,
    });
    expect(decision.allow).toBe(true);
  });

  it("allows forced redial regardless of cooldown", () => {
    const peer = "12D3KooWForce";
    recordWarmDialStarted({ transportPeerId: peer, kind: "relay_upgrade", now: 1000 });
    const decision = evaluateWarmCoordinator({
      transportPeerId: peer,
      kind: "redial",
      now: 2000,
    });
    expect(decision.allow).toBe(true);
  });

  it("blocks bond_warm relay upgrade within 60s", () => {
    const peer = "12D3KooWRelay";
    recordWarmDialStarted({ transportPeerId: peer, kind: "relay_upgrade", now: 5000 });
    const decision = evaluateWarmCoordinator({
      transportPeerId: peer,
      kind: "relay_upgrade",
      options: { source: "bond_warm" },
      now: 5000 + COORDINATOR_RELAY_UPGRADE_MS - 1,
    });
    expect(decision.allow).toBe(false);
  });

  it("allows bond_warm relay upgrade after cooldown", () => {
    const peer = "12D3KooWRelayOk";
    recordWarmDialStarted({ transportPeerId: peer, kind: "relay_upgrade", now: 5000 });
    const decision = evaluateWarmCoordinator({
      transportPeerId: peer,
      kind: "relay_upgrade",
      options: { source: "bond_warm" },
      now: 5000 + COORDINATOR_RELAY_UPGRADE_MS,
    });
    expect(decision.allow).toBe(true);
  });

  it("blocks bond_warm keepAlive probe within cooldown", () => {
    const peer = "12D3KooWKeep";
    recordWarmDialStarted({ transportPeerId: peer, kind: "keepalive_probe", now: 9000 });
    const decision = evaluateWarmCoordinator({
      transportPeerId: peer,
      kind: "keepalive_probe",
      options: { source: "bond_warm" },
      now: 9000 + COORDINATOR_KEEPALIVE_PROBE_MS - 1,
    });
    expect(decision.allow).toBe(false);
  });

  it("allows force bypass for open_chat warm", () => {
    const peer = "12D3KooWOpenChat";
    recordWarmDialStarted({ transportPeerId: peer, kind: "disconnected_warm", now: 1000 });
    const decision = evaluateWarmCoordinator({
      transportPeerId: peer,
      kind: "disconnected_warm",
      options: { force: true, source: "open_chat" },
      now: 1500,
    });
    expect(decision.allow).toBe(true);
  });

  it("bypasses bond_warm throttling for small bond sets", () => {
    const peer = "12D3KooWSmallSet";
    recordWarmDialStarted({ transportPeerId: peer, kind: "disconnected_warm", now: 1000 });
    const decision = evaluateWarmCoordinator({
      transportPeerId: peer,
      kind: "disconnected_warm",
      options: { source: "bond_warm" },
      bondedContactCount: COORDINATOR_SMALL_BOND_SET_MAX,
      now: 1500,
    });
    expect(decision.allow).toBe(true);
  });

  it("still throttles bond_warm when bond set exceeds small-set limit", () => {
    const peer = "12D3KooWLargeSet";
    recordWarmDialStarted({ transportPeerId: peer, kind: "relay_upgrade", now: 5000 });
    const decision = evaluateWarmCoordinator({
      transportPeerId: peer,
      kind: "relay_upgrade",
      options: { source: "bond_warm" },
      bondedContactCount: COORDINATOR_SMALL_BOND_SET_MAX + 1,
      now: 5000 + COORDINATOR_RELAY_UPGRADE_MS - 1,
    });
    expect(decision.allow).toBe(false);
  });
});
