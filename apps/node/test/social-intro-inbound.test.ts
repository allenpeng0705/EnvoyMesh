import {
  createAgentCredential,
  createDeviceCertificate,
  derivePeerId,
  generateAgentIdentity,
  generateDeviceIdentity,
  generateOwnerIdentity,
} from "@envoymesh/identity";
import {
  createLocalTaskStore,
  createLocalTrustStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import {
  createHumanProfileFragmentPayload,
  createSocialIntroOwnerReadyPayload,
  createSocialIntroProposePayload,
  createSocialIntroSyncPayload,
  createUnsignedEnvelope,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleInboundSocialIntroIntent,
  MAX_OWNER_READY_NONCE_ENTRIES,
  SOCIAL_INTRO_RATE_LIMIT_MAX_PER_PEER,
  __primeOwnerReadyNonceMapForTests,
  __resetSocialIntroInboundTestState,
} from "../src/social-intro-inbound.js";

let profileDir: string;

beforeEach(async () => {
  __resetSocialIntroInboundTestState();
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-social-intro-"));
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

function testProfile(): NodeProfile {
  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity();
  return {
    owner,
    device,
    deviceCertificate: createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["message.send", "mesh.listen", "mesh.discovery"],
    }),
  };
}

function signedOwnerReadyEnvelope(
  senderOwner: ReturnType<typeof generateOwnerIdentity>,
  profile: NodeProfile,
  input: {
    introCorrelationId: string;
    nonce: string;
    messageId: string;
    expiresAt?: string;
    ownerId?: string;
  },
): EnvoyEnvelope {
  return {
    ...createUnsignedEnvelope({
      senderPeerId: derivePeerId(senderOwner.publicKeyPem),
      senderPublicKey: senderOwner.publicKeyPem,
      senderRole: "human",
      recipientPeerId: derivePeerId(profile.device.publicKeyPem),
      recipientRole: "human",
      intent: "social.intro.owner-ready",
      payload: createSocialIntroOwnerReadyPayload({
        introCorrelationId: input.introCorrelationId,
        ownerId: input.ownerId ?? senderOwner.ownerId,
        nonce: input.nonce,
        expiresAt: input.expiresAt ?? "2030-01-01T00:00:00.000Z",
      }),
      createdAt: "2026-06-01T10:00:00.000Z",
      messageId: input.messageId,
    }),
    signature: "signature",
  };
}

describe("handleInboundSocialIntroIntent", () => {
  it("audits deny when trust mode is disabled", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const strangerOwner = generateOwnerIdentity();
    const strangerAgent = generateAgentIdentity(strangerOwner.ownerId);
    const credential = createAgentCredential({
      owner: strangerOwner,
      agent: strangerAgent,
      scope: ["social.intro.sync"],
    });
    const envelope: EnvoyEnvelope = {
      ...createUnsignedEnvelope({
        senderPeerId: strangerAgent.agentPeerId,
        senderPublicKey: strangerAgent.publicKeyPem,
        senderRole: "agent",
        recipientPeerId: derivePeerId(profile.device.publicKeyPem),
        recipientRole: "agent",
        intent: "social.intro.sync",
        payload: createSocialIntroSyncPayload({
          introCorrelationId: "ic1",
          ownerId: strangerOwner.ownerId,
          interest: "explore",
        }),
        agentCredential: credential,
        createdAt: "2026-06-01T10:00:00.000Z",
        messageId: "soc-intro-1",
      }),
      signature: "signature",
    };

    const result = await handleInboundSocialIntroIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: "corr-a",
      taskStore,
      trustStore,
      trustModeEnabled: false,
    });

    expect(result).toEqual({ ok: true });
    const audits = await taskStore.readAuditEvents();
    expect(audits).toHaveLength(1);
    expect(audits[0].summary).toContain("trust mode disabled");
  });

  it("allows social.intro.sync for referred peers when trust mode on", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const strangerOwner = generateOwnerIdentity();
    await trustStore.setTrustRecord({
      peerOwnerId: strangerOwner.ownerId,
      displayName: "Stranger",
      level: "referred",
      now: new Date().toISOString(),
    });

    const strangerAgent = generateAgentIdentity(strangerOwner.ownerId);
    const credential = createAgentCredential({
      owner: strangerOwner,
      agent: strangerAgent,
      scope: ["social.intro.sync"],
    });
    const envelope: EnvoyEnvelope = {
      ...createUnsignedEnvelope({
        senderPeerId: strangerAgent.agentPeerId,
        senderPublicKey: strangerAgent.publicKeyPem,
        senderRole: "agent",
        recipientPeerId: derivePeerId(profile.device.publicKeyPem),
        recipientRole: "agent",
        intent: "social.intro.sync",
        payload: createSocialIntroSyncPayload({
          introCorrelationId: "ic2",
          ownerId: strangerOwner.ownerId,
          interest: "explore",
        }),
        agentCredential: credential,
        createdAt: "2026-06-01T10:00:00.000Z",
        messageId: "soc-intro-2",
      }),
      signature: "signature",
    };

    const result = await handleInboundSocialIntroIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
      trustModeEnabled: true,
    });

    expect(result).toEqual({ ok: true });
    const audits = await taskStore.readAuditEvents();
    expect(audits).toHaveLength(1);
    expect(audits[0].summary).toContain("policy allow");
  });

  it("returns ok false when agent payload ownerId mismatches credential", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const strangerOwner = generateOwnerIdentity();
    const strangerAgent = generateAgentIdentity(strangerOwner.ownerId);
    const credential = createAgentCredential({
      owner: strangerOwner,
      agent: strangerAgent,
      scope: ["social.intro.sync"],
    });
    const envelope: EnvoyEnvelope = {
      ...createUnsignedEnvelope({
        senderPeerId: strangerAgent.agentPeerId,
        senderPublicKey: strangerAgent.publicKeyPem,
        senderRole: "agent",
        recipientPeerId: derivePeerId(profile.device.publicKeyPem),
        recipientRole: "agent",
        intent: "social.intro.sync",
        payload: createSocialIntroSyncPayload({
          introCorrelationId: "ic3",
          ownerId: "envoy:owner:wrong",
          interest: "explore",
        }),
        agentCredential: credential,
        createdAt: "2026-06-01T10:00:00.000Z",
        messageId: "soc-intro-3",
      }),
      signature: "signature",
    };

    const result = await handleInboundSocialIntroIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
      trustModeEnabled: true,
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("credential ownerId");
  });

  it("invokes onSocialIntroPropose when propose passes policy", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const strangerOwner = generateOwnerIdentity();
    const strangerAgent = generateAgentIdentity(strangerOwner.ownerId);
    await trustStore.setTrustRecord({
      peerOwnerId: strangerOwner.ownerId,
      displayName: "Stranger",
      level: "referred",
      now: new Date().toISOString(),
    });
    const credential = createAgentCredential({
      owner: strangerOwner,
      agent: strangerAgent,
      scope: ["social.intro.propose"],
    });
    const candidateOwner = generateOwnerIdentity();
    const candidateDevice = generateDeviceIdentity();
    const fragment = createHumanProfileFragmentPayload({
      ownerId: strangerOwner.ownerId,
      purpose: "trust-mode-intro",
      expiresAt: "2035-01-01T00:00:00.000Z",
      signature: "sig",
    });
    const onSocialIntroPropose = vi.fn();
    const envelope: EnvoyEnvelope = {
      ...createUnsignedEnvelope({
        senderPeerId: strangerAgent.agentPeerId,
        senderPublicKey: strangerAgent.publicKeyPem,
        senderRole: "agent",
        recipientPeerId: derivePeerId(profile.device.publicKeyPem),
        recipientRole: "human",
        intent: "social.intro.propose",
        payload: createSocialIntroProposePayload({
          introCorrelationId: "ic-propose-notify",
          candidateOwnerId: candidateOwner.ownerId,
          candidatePeerId: derivePeerId(candidateDevice.publicKeyPem),
          profileFragment: fragment,
          rationale: "Overlapping interests",
        }),
        agentCredential: credential,
        createdAt: "2026-06-01T10:00:00.000Z",
        messageId: "soc-intro-propose-notify",
      }),
      signature: "signature",
    };

    const result = await handleInboundSocialIntroIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
      trustModeEnabled: true,
      onSocialIntroPropose,
    });

    expect(result).toEqual({ ok: true });
    expect(onSocialIntroPropose).toHaveBeenCalledTimes(1);
    expect(onSocialIntroPropose.mock.calls[0][0].introCorrelationId).toBe("ic-propose-notify");
    expect(onSocialIntroPropose.mock.calls[0][0].candidateOwnerId).toBe(candidateOwner.ownerId);
  });

  it("rejects propose with expired profile fragment", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const strangerOwner = generateOwnerIdentity();
    await trustStore.setTrustRecord({
      peerOwnerId: strangerOwner.ownerId,
      displayName: "Stranger",
      level: "referred",
      now: new Date().toISOString(),
    });
    const strangerAgent = generateAgentIdentity(strangerOwner.ownerId);
    const credential = createAgentCredential({
      owner: strangerOwner,
      agent: strangerAgent,
      scope: ["social.intro.propose"],
    });
    const fragment = createHumanProfileFragmentPayload({
      ownerId: strangerOwner.ownerId,
      purpose: "trust-mode-intro",
      expiresAt: "2020-01-01T00:00:00.000Z",
      signature: "sig",
    });
    const envelope: EnvoyEnvelope = {
      ...createUnsignedEnvelope({
        senderPeerId: strangerAgent.agentPeerId,
        senderPublicKey: strangerAgent.publicKeyPem,
        senderRole: "agent",
        recipientPeerId: derivePeerId(profile.device.publicKeyPem),
        recipientRole: "human",
        intent: "social.intro.propose",
        payload: createSocialIntroProposePayload({
          introCorrelationId: "ic4",
          candidateOwnerId: profile.owner.ownerId,
          candidatePeerId: derivePeerId(profile.device.publicKeyPem),
          profileFragment: fragment,
        }),
        agentCredential: credential,
        createdAt: "2026-06-01T10:00:00.000Z",
        messageId: "soc-intro-4",
      }),
      signature: "signature",
    };

    const result = await handleInboundSocialIntroIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
      trustModeEnabled: true,
    });

    expect(result).toEqual({ ok: true });
    const audits = await taskStore.readAuditEvents();
    expect(audits[0].summary).toContain("expired profileFragment");
  });

  it("allows owner-ready when referred", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const strangerOwner = generateOwnerIdentity();
    await trustStore.setTrustRecord({
      peerOwnerId: strangerOwner.ownerId,
      displayName: "Stranger",
      level: "referred",
      now: new Date().toISOString(),
    });

    const envelope = signedOwnerReadyEnvelope(strangerOwner, profile, {
      introCorrelationId: "ic5",
      nonce: "n1",
      messageId: "soc-intro-5",
    });

    const result = await handleInboundSocialIntroIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
      trustModeEnabled: true,
    });

    expect(result).toEqual({ ok: true });
    const audits = await taskStore.readAuditEvents();
    expect(audits[0].summary).toContain("policy allow");
  });

  it("rejects owner-ready when payload ownerId mismatches sender public key", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const strangerOwner = generateOwnerIdentity();
    const otherOwner = generateOwnerIdentity();
    await trustStore.setTrustRecord({
      peerOwnerId: strangerOwner.ownerId,
      displayName: "Stranger",
      level: "referred",
      now: new Date().toISOString(),
    });

    const envelope = signedOwnerReadyEnvelope(strangerOwner, profile, {
      introCorrelationId: "ic-mismatch",
      nonce: "n-mismatch",
      messageId: "soc-intro-mismatch",
      ownerId: otherOwner.ownerId,
    });

    const result = await handleInboundSocialIntroIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
      trustModeEnabled: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("does not match sender public key");
    }
  });

  it("rejects duplicate social.intro.owner-ready nonce before expiry", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const strangerOwner = generateOwnerIdentity();
    await trustStore.setTrustRecord({
      peerOwnerId: strangerOwner.ownerId,
      displayName: "Stranger",
      level: "referred",
      now: new Date().toISOString(),
    });

    const envelopeBase = (): EnvoyEnvelope =>
      signedOwnerReadyEnvelope(strangerOwner, profile, {
        introCorrelationId: "ic-replay",
        nonce: "nonce-fixed",
        messageId: "soc-intro-replay-a",
      });

    const first = await handleInboundSocialIntroIntent({
      envelope: envelopeBase(),
      profile,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
      trustModeEnabled: true,
    });
    expect(first).toEqual({ ok: true });

    const second = await handleInboundSocialIntroIntent({
      envelope: {
        ...envelopeBase(),
        messageId: "soc-intro-replay-b",
      },
      profile,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
      trustModeEnabled: true,
    });
    expect(second).toEqual({ ok: true });
    const audits = await taskStore.readAuditEvents();
    expect(audits.some((a) => a.summary.includes("duplicate nonce"))).toBe(true);
  });

  it("rate-limits social.intro.* per remote peer", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const strangerOwner = generateOwnerIdentity();
    await trustStore.setTrustRecord({
      peerOwnerId: strangerOwner.ownerId,
      displayName: "Stranger",
      level: "referred",
      now: new Date().toISOString(),
    });

    const strangerAgent = generateAgentIdentity(strangerOwner.ownerId);
    const credential = createAgentCredential({
      owner: strangerOwner,
      agent: strangerAgent,
      scope: ["social.intro.sync"],
    });

    const remotePeerId = "libp2p-rate-peer";
    for (let i = 0; i < SOCIAL_INTRO_RATE_LIMIT_MAX_PER_PEER; i++) {
      const envelope: EnvoyEnvelope = {
        ...createUnsignedEnvelope({
          senderPeerId: strangerAgent.agentPeerId,
          senderPublicKey: strangerAgent.publicKeyPem,
          senderRole: "agent",
          recipientPeerId: derivePeerId(profile.device.publicKeyPem),
          recipientRole: "agent",
          intent: "social.intro.sync",
          payload: createSocialIntroSyncPayload({
            introCorrelationId: `ic-rate-${i}`,
            ownerId: strangerOwner.ownerId,
            interest: "explore",
          }),
          agentCredential: credential,
          createdAt: "2026-06-01T10:00:00.000Z",
          messageId: `soc-intro-rate-${i}`,
        }),
        signature: "signature",
      };
      const result = await handleInboundSocialIntroIntent({
        envelope,
        profile,
        remotePeerId,
        receivedAt: Date.now(),
        correlationId: undefined,
        taskStore,
        trustStore,
        trustModeEnabled: true,
      });
      expect(result).toEqual({ ok: true });
    }

    const overflow: EnvoyEnvelope = {
      ...createUnsignedEnvelope({
        senderPeerId: strangerAgent.agentPeerId,
        senderPublicKey: strangerAgent.publicKeyPem,
        senderRole: "agent",
        recipientPeerId: derivePeerId(profile.device.publicKeyPem),
        recipientRole: "agent",
        intent: "social.intro.sync",
        payload: createSocialIntroSyncPayload({
          introCorrelationId: "ic-rate-overflow",
          ownerId: strangerOwner.ownerId,
          interest: "explore",
        }),
        agentCredential: credential,
        createdAt: "2026-06-01T10:00:00.000Z",
        messageId: "soc-intro-rate-overflow",
      }),
      signature: "signature",
    };
    await handleInboundSocialIntroIntent({
      envelope: overflow,
      profile,
      remotePeerId,
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
      trustModeEnabled: true,
    });
    const audits = await taskStore.readAuditEvents();
    expect(audits.some((a) => a.summary.includes("rate limit exceeded"))).toBe(true);
  });

  it("does not consume rate quota on repeated credential validation failures (rollback)", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const strangerOwner = generateOwnerIdentity();
    await trustStore.setTrustRecord({
      peerOwnerId: strangerOwner.ownerId,
      displayName: "Stranger",
      level: "referred",
      now: new Date().toISOString(),
    });
    const strangerAgent = generateAgentIdentity(strangerOwner.ownerId);
    const credential = createAgentCredential({
      owner: strangerOwner,
      agent: strangerAgent,
      scope: ["social.intro.sync"],
    });
    const remotePeerId = "libp2p-rollback-peer";

    for (let i = 0; i < SOCIAL_INTRO_RATE_LIMIT_MAX_PER_PEER; i++) {
      const envelope: EnvoyEnvelope = {
        ...createUnsignedEnvelope({
          senderPeerId: strangerAgent.agentPeerId,
          senderPublicKey: strangerAgent.publicKeyPem,
          senderRole: "agent",
          recipientPeerId: derivePeerId(profile.device.publicKeyPem),
          recipientRole: "agent",
          intent: "social.intro.sync",
          payload: createSocialIntroSyncPayload({
            introCorrelationId: `ic-rollback-${i}`,
            ownerId: "envoy:owner:wrong",
            interest: "explore",
          }),
          agentCredential: credential,
          createdAt: "2026-06-01T10:00:00.000Z",
          messageId: `soc-intro-rollback-${i}`,
        }),
        signature: "signature",
      };
      const bad = await handleInboundSocialIntroIntent({
        envelope,
        profile,
        remotePeerId,
        receivedAt: Date.now(),
        correlationId: undefined,
        taskStore,
        trustStore,
        trustModeEnabled: true,
      });
      expect(bad.ok).toBe(false);
    }

    const goodEnvelope: EnvoyEnvelope = {
      ...createUnsignedEnvelope({
        senderPeerId: strangerAgent.agentPeerId,
        senderPublicKey: strangerAgent.publicKeyPem,
        senderRole: "agent",
        recipientPeerId: derivePeerId(profile.device.publicKeyPem),
        recipientRole: "agent",
        intent: "social.intro.sync",
        payload: createSocialIntroSyncPayload({
          introCorrelationId: "ic-after-rollbacks",
          ownerId: strangerOwner.ownerId,
          interest: "explore",
        }),
        agentCredential: credential,
        createdAt: "2026-06-01T10:00:00.000Z",
        messageId: "soc-intro-after-rollbacks",
      }),
      signature: "signature",
    };
    const good = await handleInboundSocialIntroIntent({
      envelope: goodEnvelope,
      profile,
      remotePeerId,
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
      trustModeEnabled: true,
    });
    expect(good).toEqual({ ok: true });
    expect((await taskStore.readAuditEvents()).some((a) => a.summary.includes("rate limit exceeded"))).toBe(
      false,
    );
  });

  it("rolls back rate slot when parse rejects payload (catch path)", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const strangerOwner = generateOwnerIdentity();
    await trustStore.setTrustRecord({
      peerOwnerId: strangerOwner.ownerId,
      displayName: "Stranger",
      level: "referred",
      now: new Date().toISOString(),
    });

    const strangerAgent = generateAgentIdentity(strangerOwner.ownerId);
    const credential = createAgentCredential({
      owner: strangerOwner,
      agent: strangerAgent,
      scope: ["social.intro.sync"],
    });
    const remotePeerId = "libp2p-parse-rollback-peer";

    for (let i = 0; i < SOCIAL_INTRO_RATE_LIMIT_MAX_PER_PEER; i++) {
      const envelope: EnvoyEnvelope = {
        ...createUnsignedEnvelope({
          senderPeerId: strangerAgent.agentPeerId,
          senderPublicKey: strangerAgent.publicKeyPem,
          senderRole: "agent",
          recipientPeerId: derivePeerId(profile.device.publicKeyPem),
          recipientRole: "agent",
          intent: "social.intro.sync",
          payload: {},
          agentCredential: credential,
          createdAt: "2026-06-01T10:00:00.000Z",
          messageId: `soc-intro-bad-parse-${i}`,
        }),
        signature: "signature",
      };
      const bad = await handleInboundSocialIntroIntent({
        envelope,
        profile,
        remotePeerId,
        receivedAt: Date.now(),
        correlationId: undefined,
        taskStore,
        trustStore,
        trustModeEnabled: true,
      });
      expect(bad.ok).toBe(false);
      if (bad.ok === false) {
        expect(bad.reason).toContain("invalid social.intro payload");
      }
    }

    const goodEnvelope: EnvoyEnvelope = {
      ...createUnsignedEnvelope({
        senderPeerId: strangerAgent.agentPeerId,
        senderPublicKey: strangerAgent.publicKeyPem,
        senderRole: "agent",
        recipientPeerId: derivePeerId(profile.device.publicKeyPem),
        recipientRole: "agent",
        intent: "social.intro.sync",
        payload: createSocialIntroSyncPayload({
          introCorrelationId: "ic-after-parse-failures",
          ownerId: strangerOwner.ownerId,
          interest: "explore",
        }),
        agentCredential: credential,
        createdAt: "2026-06-01T10:00:00.000Z",
        messageId: "soc-intro-after-parse-failures",
      }),
      signature: "signature",
    };
    const good = await handleInboundSocialIntroIntent({
      envelope: goodEnvelope,
      profile,
      remotePeerId,
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
      trustModeEnabled: true,
    });
    expect(good).toEqual({ ok: true });
    expect((await taskStore.readAuditEvents()).some((a) => a.summary.includes("rate limit exceeded"))).toBe(
      false,
    );
  });

  it("does not consume rate quota on repeated social.intro.propose validation failures (rollback)", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const strangerOwner = generateOwnerIdentity();
    const strangerAgent = generateAgentIdentity(strangerOwner.ownerId);
    await trustStore.setTrustRecord({
      peerOwnerId: strangerOwner.ownerId,
      displayName: "Stranger",
      level: "referred",
      now: new Date().toISOString(),
    });
    const credential = createAgentCredential({
      owner: strangerOwner,
      agent: strangerAgent,
      scope: ["social.intro.propose"],
    });
    const candidateOwner = generateOwnerIdentity();
    const candidateDevice = generateDeviceIdentity();

    const remotePeerId = "libp2p-propose-rollback-peer";
    const fragment = createHumanProfileFragmentPayload({
      ownerId: strangerOwner.ownerId,
      purpose: "trust-mode-intro",
      expiresAt: "2035-01-01T00:00:00.000Z",
      signature: "sig",
    });

    for (let i = 0; i < SOCIAL_INTRO_RATE_LIMIT_MAX_PER_PEER; i++) {
      const envelope: EnvoyEnvelope = {
        ...createUnsignedEnvelope({
          senderPeerId: strangerAgent.agentPeerId,
          senderPublicKey: strangerAgent.publicKeyPem,
          senderRole: "agent",
          recipientPeerId: derivePeerId(profile.device.publicKeyPem),
          recipientRole: "human",
          intent: "social.intro.propose",
          payload: createSocialIntroProposePayload({
            introCorrelationId: `ic-propose-rollback-${i}`,
            candidateOwnerId: candidateOwner.ownerId,
            candidatePeerId: derivePeerId(candidateDevice.publicKeyPem),
            profileFragment: fragment,
          }),
          createdAt: "2026-06-01T10:00:00.000Z",
          messageId: `soc-intro-propose-rollback-${i}`,
        }),
        signature: "signature",
      };
      const bad = await handleInboundSocialIntroIntent({
        envelope,
        profile,
        remotePeerId,
        receivedAt: Date.now(),
        correlationId: undefined,
        taskStore,
        trustStore,
        trustModeEnabled: true,
      });
      expect(bad.ok).toBe(false);
      if (bad.ok === false) {
        expect(bad.reason).toContain("social.intro.propose requires agent sender with agentCredential");
      }
    }

    const goodEnvelope: EnvoyEnvelope = {
      ...createUnsignedEnvelope({
        senderPeerId: strangerAgent.agentPeerId,
        senderPublicKey: strangerAgent.publicKeyPem,
        senderRole: "agent",
        recipientPeerId: derivePeerId(profile.device.publicKeyPem),
        recipientRole: "human",
        intent: "social.intro.propose",
        payload: createSocialIntroProposePayload({
          introCorrelationId: "ic-after-propose-rollbacks",
          candidateOwnerId: candidateOwner.ownerId,
          candidatePeerId: derivePeerId(candidateDevice.publicKeyPem),
          profileFragment: fragment,
          rationale: "ok",
        }),
        agentCredential: credential,
        createdAt: "2026-06-01T10:00:00.000Z",
        messageId: "soc-intro-after-propose-rollbacks",
      }),
      signature: "signature",
    };
    expect(
      await handleInboundSocialIntroIntent({
        envelope: goodEnvelope,
        profile,
        remotePeerId,
        receivedAt: Date.now(),
        correlationId: undefined,
        taskStore,
        trustStore,
        trustModeEnabled: true,
      }),
    ).toEqual({ ok: true });
    expect((await taskStore.readAuditEvents()).some((a) => a.summary.includes("rate limit exceeded"))).toBe(
      false,
    );
  });

  it("denies owner-ready when nonce registry is full (without dropping existing replay entries)", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const strangerOwner = generateOwnerIdentity();
    await trustStore.setTrustRecord({
      peerOwnerId: strangerOwner.ownerId,
      displayName: "Stranger",
      level: "referred",
      now: new Date().toISOString(),
    });

    __primeOwnerReadyNonceMapForTests(MAX_OWNER_READY_NONCE_ENTRIES);

    const envelope = signedOwnerReadyEnvelope(strangerOwner, profile, {
      introCorrelationId: "ic-capacity",
      nonce: "fresh-nonce",
      messageId: "soc-intro-capacity",
    });

    const result = await handleInboundSocialIntroIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-capacity-peer",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
      trustModeEnabled: true,
    });

    expect(result).toEqual({ ok: true });
    const audits = await taskStore.readAuditEvents();
    expect(audits.some((a) => a.summary.includes("nonce registry at capacity"))).toBe(true);
  });

  it("rolls back rate slot when nonce registry at capacity denies owner-ready", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const strangerOwner = generateOwnerIdentity();
    await trustStore.setTrustRecord({
      peerOwnerId: strangerOwner.ownerId,
      displayName: "Stranger",
      level: "referred",
      now: new Date().toISOString(),
    });

    const strangerAgent = generateAgentIdentity(strangerOwner.ownerId);
    const credential = createAgentCredential({
      owner: strangerOwner,
      agent: strangerAgent,
      scope: ["social.intro.sync"],
    });

    __primeOwnerReadyNonceMapForTests(MAX_OWNER_READY_NONCE_ENTRIES);

    const remotePeerId = "libp2p-capacity-rate-rollback-peer";
    const capacityDenyEnvelope = signedOwnerReadyEnvelope(strangerOwner, profile, {
      introCorrelationId: "ic-cap-rate",
      nonce: "nonce-after-prime",
      messageId: "soc-intro-cap-rate-deny",
    });

    await handleInboundSocialIntroIntent({
      envelope: capacityDenyEnvelope,
      profile,
      remotePeerId,
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
      trustModeEnabled: true,
    });

    for (let i = 0; i < SOCIAL_INTRO_RATE_LIMIT_MAX_PER_PEER; i++) {
      const envelope: EnvoyEnvelope = {
        ...createUnsignedEnvelope({
          senderPeerId: strangerAgent.agentPeerId,
          senderPublicKey: strangerAgent.publicKeyPem,
          senderRole: "agent",
          recipientPeerId: derivePeerId(profile.device.publicKeyPem),
          recipientRole: "agent",
          intent: "social.intro.sync",
          payload: createSocialIntroSyncPayload({
            introCorrelationId: `ic-cap-rate-follow-${i}`,
            ownerId: strangerOwner.ownerId,
            interest: "explore",
          }),
          agentCredential: credential,
          createdAt: "2026-06-01T10:00:00.000Z",
          messageId: `soc-intro-cap-rate-${i}`,
        }),
        signature: "signature",
      };
      expect(
        await handleInboundSocialIntroIntent({
          envelope,
          profile,
          remotePeerId,
          receivedAt: Date.now(),
          correlationId: undefined,
          taskStore,
          trustStore,
          trustModeEnabled: true,
        }),
      ).toEqual({ ok: true });
    }

    expect((await taskStore.readAuditEvents()).some((a) => a.summary.includes("rate limit exceeded"))).toBe(
      false,
    );
  });
});
