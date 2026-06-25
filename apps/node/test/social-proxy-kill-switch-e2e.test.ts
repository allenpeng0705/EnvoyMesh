/**
 * E2E: social proxy blocked by autonomous kill switch.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupPhase13Node,
  createPhase13TestNode,
  ensureSocialProxyBridgeIdentity,
  registerBondedPeer,
  wireNodeServiceInboundHandlers,
} from "./phase13-e2e-harness.js";

const nodes: Awaited<ReturnType<typeof createPhase13TestNode>>[] = [];

afterEach(async () => {
  await Promise.all(nodes.splice(0).map((n) => cleanupPhase13Node(n)));
});

describe.sequential("E2E social proxy kill switch", () => {
  it("runSocialProxyPass returns error when kill switch is active", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    nodes.push(alice, bob);
    const bobAgent = await ensureSocialProxyBridgeIdentity(bob);

    await registerBondedPeer(alice, bob, "Bob");
    wireNodeServiceInboundHandlers(alice);

    await alice.service.updateNodeConfig({
      socialProxyEnabled: true,
      trustModeEnabled: true,
      autonomousKillSwitch: true,
      modelProviders: { mode: "mock" },
    });

    await alice.mesh.dial(bob.mesh.multiaddrs[0]!);

    const pass = await alice.service.runSocialProxyPass({
      targetOwnerId: bob.profile.owner.ownerId,
      targetPeerId: bob.mesh.peerId,
      targetAgentPeerId: bobAgent.agentPeerId,
    });

    expect(pass.ok).toBe(false);
    expect(pass.error).toMatch(/kill switch/i);
    expect(pass.sessionsTouched).toBe(0);

    const sessions = await alice.service.listSocialProxySessions();
    expect(sessions).toHaveLength(0);
  });

  it("advanceSocialProxySession is a no-op after kill switch engages", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    nodes.push(alice, bob);
    const bobAgent = await ensureSocialProxyBridgeIdentity(bob);

    await registerBondedPeer(alice, bob, "Bob");
    wireNodeServiceInboundHandlers(alice);

    await alice.service.updateNodeConfig({
      socialProxyEnabled: true,
      trustModeEnabled: true,
      autonomousKillSwitch: false,
      modelProviders: { mode: "mock" },
    });

    await alice.mesh.dial(bob.mesh.multiaddrs[0]!);

    const pass = await alice.service.runSocialProxyPass({
      targetOwnerId: bob.profile.owner.ownerId,
      targetPeerId: bob.mesh.peerId,
      targetAgentPeerId: bobAgent.agentPeerId,
    });
    expect(pass.ok).toBe(true);

    const sessionId = (await alice.service.listSocialProxySessions())[0]!.sessionId;

    await alice.service.updateNodeConfig({ autonomousKillSwitch: true });

    const advanced = await alice.service.advanceSocialProxySession(sessionId);
    expect(advanced).toBeUndefined();

    const blockedPass = await alice.service.runSocialProxyPass({
      targetOwnerId: bob.profile.owner.ownerId,
      targetPeerId: bob.mesh.peerId,
      targetAgentPeerId: bobAgent.agentPeerId,
      focusSessionId: sessionId,
    });
    expect(blockedPass.ok).toBe(false);
    expect(blockedPass.error).toMatch(/kill switch/i);
  });
});
