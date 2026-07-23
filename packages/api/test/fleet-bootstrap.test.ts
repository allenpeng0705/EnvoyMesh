import { describe, expect, it } from "vitest";
import {
  DEFAULT_FLEET_APPLY_STEPS,
  buildNodeConfigPatch,
  inviteMemberNodes,
  manifestMemberNodes,
  parseFleetBootstrap,
  resolveFleetSecrets,
  sponsorNode,
} from "../src/fleet-bootstrap.js";

const minimal = {
  version: "0.1" as const,
  fleetId: "acme-lab",
  shared: {
    lanAutoBond: { enabled: true, tokenRef: "LAN_FLEET_TOKEN" },
    membership: { capabilityProviderEnabled: true },
  },
  nodes: [
    {
      id: "home",
      role: "sponsor" as const,
      rpc: { wsUrl: "ws://127.0.0.1:3030/ws" },
    },
    {
      id: "desk-a",
      role: "member" as const,
      rpc: { wsUrl: "ws://127.0.0.1:4030/ws" },
      join: { method: "lan" as const },
    },
    {
      id: "remote-b",
      role: "member" as const,
      rpc: { wsUrl: "ws://127.0.0.1:5030/ws" },
      join: { method: "manifest" as const },
      identity: {
        ownerId: "envoy:owner:b",
        deviceId: "envoy:device:b",
        devicePublicKeyPem: "-----BEGIN PUBLIC KEY-----\nB\n-----END PUBLIC KEY-----",
        fetchIfMissing: false,
      },
    },
    {
      id: "remote-c",
      role: "member" as const,
      rpc: { wsUrl: "ws://127.0.0.1:6030/ws" },
      join: { method: "invite" as const },
    },
  ],
};

describe("fleet-bootstrap schema", () => {
  it("parses a valid fleet file", () => {
    const parsed = parseFleetBootstrap(minimal);
    expect(parsed.fleetId).toBe("acme-lab");
    expect(sponsorNode(parsed).id).toBe("home");
    expect(manifestMemberNodes(parsed).map((n) => n.id)).toEqual(["remote-b"]);
    expect(inviteMemberNodes(parsed).map((n) => n.id)).toEqual(["remote-c"]);
    expect(DEFAULT_FLEET_APPLY_STEPS.length).toBeGreaterThan(3);
  });

  it("rejects lanAutoBond.enabled without token", () => {
    expect(() =>
      parseFleetBootstrap({
        ...minimal,
        shared: { lanAutoBond: { enabled: true } },
      }),
    ).toThrow();
  });

  it("requires exactly one sponsor", () => {
    expect(() =>
      sponsorNode(
        parseFleetBootstrap({
          ...minimal,
          nodes: minimal.nodes.filter((n) => n.role !== "sponsor"),
        }),
      ),
    ).toThrow(/sponsor/);
  });

  it("resolveFleetSecrets reads env refs", () => {
    const parsed = parseFleetBootstrap(minimal);
    const secrets = resolveFleetSecrets(parsed, {
      LAN_FLEET_TOKEN: "shared-secret-token-1",
    });
    expect(secrets.lanFleetToken).toBe("shared-secret-token-1");
  });

  it("buildNodeConfigPatch applies Join + LAN + sponsor autonomy", () => {
    const parsed = parseFleetBootstrap({
      ...minimal,
      shared: {
        ...minimal.shared,
        bondAutonomy: {
          enabled: true,
          sponsorProofTokenRef: "SPONSOR_TOKEN",
          maxAutoBondsPerDay: 20,
        },
      },
    });
    const secrets = resolveFleetSecrets(parsed, {
      LAN_FLEET_TOKEN: "lan-tok-xxxxxxxx",
      SPONSOR_TOKEN: "sponsor-tok-xxxxxx",
    });
    const sponsorPatch = buildNodeConfigPatch(parsed, sponsorNode(parsed), secrets);
    expect(sponsorPatch.capabilityProviderEnabled).toBe(true);
    expect(sponsorPatch.lanAutoBondEnabled).toBe(true);
    expect(sponsorPatch.lanAutoBondFleetToken).toBe("lan-tok-xxxxxxxx");
    expect(sponsorPatch.bondAutonomyEnabled).toBe(true);
    expect(sponsorPatch.bondAutonomySponsorProofToken).toBe("sponsor-tok-xxxxxx");

    const member = parsed.nodes.find((n) => n.id === "desk-a")!;
    const memberPatch = buildNodeConfigPatch(parsed, member, secrets);
    expect(memberPatch.bondAutonomyEnabled).toBeUndefined();
    expect(memberPatch.lanAutoBondFleetToken).toBe("lan-tok-xxxxxxxx");
  });
});
