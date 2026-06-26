import { describe, expect, it, beforeEach } from "vitest";
import {
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

  it("blocks repeated disconnected warm within cooldown", () => {
    const peer = "12D3KooWCooldown";
    recordWarmDialStarted({ transportPeerId: peer, kind: "disconnected_warm", now: 1000 });
    const decision = evaluateWarmCoordinator({
      transportPeerId: peer,
      kind: "disconnected_warm",
      now: 1000 + COORDINATOR_DISCONNECTED_WARM_MS - 1,
    });
    expect(decision.allow).toBe(false);
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

  it("blocks relay upgrade within 60s", () => {
    const peer = "12D3KooWRelay";
    recordWarmDialStarted({ transportPeerId: peer, kind: "relay_upgrade", now: 5000 });
    const decision = evaluateWarmCoordinator({
      transportPeerId: peer,
      kind: "relay_upgrade",
      now: 5000 + COORDINATOR_RELAY_UPGRADE_MS - 1,
    });
    expect(decision.allow).toBe(false);
  });

  it("allows relay upgrade after cooldown", () => {
    const peer = "12D3KooWRelayOk";
    recordWarmDialStarted({ transportPeerId: peer, kind: "relay_upgrade", now: 5000 });
    const decision = evaluateWarmCoordinator({
      transportPeerId: peer,
      kind: "relay_upgrade",
      now: 5000 + COORDINATOR_RELAY_UPGRADE_MS,
    });
    expect(decision.allow).toBe(true);
  });

  it("blocks keepAlive probe within cooldown", () => {
    const peer = "12D3KooWKeep";
    recordWarmDialStarted({ transportPeerId: peer, kind: "keepalive_probe", now: 9000 });
    const decision = evaluateWarmCoordinator({
      transportPeerId: peer,
      kind: "keepalive_probe",
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
});
