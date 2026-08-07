import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  createAgentCard,
  createAgentCardRequestPayload,
  createAgentCardResponsePayload,
  createAuthChallengePayload,
  createAutonomousReportingPolicy,
  createBondRequestPayload,
  createBondChallengePayload,
  createBondChallengeResponsePayload,
  createChatMessagePayload,
  createChatDeliveredPayload,
  parseChatDeliveredPayload,
  createDiscoveryRequestPayload,
  createDiscoveryResponsePayload,
  createDevicePairApprovePayload,
  createDevicePairDeferredPayload,
  createDevicePairRequestPayload,
  createKnowledgeQueryPayload,
  createKnowledgeResponsePayload,
  parseKnowledgeResponsePayload,
  createReport,
  createReportCreatePayload,
  createRelayCheckinPayload,
  createRelayHintsRequestPayload,
  createRelayHintsResponsePayload,
  createRelayJoinRequestPayload,
  createRelayJoinResponsePayload,
  createRelayLookupPayload,
  createRelayLookupResponsePayload,
  createRelayRegisterPayload,
  createRelayRegisterResponsePayload,
  createRelaySummaryPayload,
  createRendezvousRegisterPayload,
  createSocialIntroOwnerReadyPayload,
  createSocialIntroProposePayload,
  createSocialIntroSyncPayload,
  createFriendMatchingPreferencesPayload,
  createHumanProfileFragmentPayload,
  createRendezvousQueryPayload,
  createRendezvousResponsePayload,
  createUnsignedDeviceRevocationRecord,
  createTaskAcceptPayload,
  createTaskCancelPayload,
  createTaskHeartbeatPayload,
  createTaskJournalEntry,
  createTaskMandatePayload,
  createTaskNegotiatePayload,
  createTaskProposePayload,
  createTaskRejectPayload,
  createTaskResultPayload,
  createUnsignedMandate,
  createSystemPingPayload,
  createSystemSignalPayload,
  createUnsignedEnvelope,
  type DeviceCertificate,
  DeviceCertificateSchema,
  deviceCertificateForSigning,
  deviceRevocationRecordForSigning,
  EnvoyEnvelopeSchema,
  envelopeForSigning,
  FriendMatchingPreferencesPayloadSchema,
  friendMatchingPreferencesForSigning,
  parseAgentCard,
  parseAgentCardRequestPayload,
  parseAgentCardResponsePayload,
  parseAuthChallengePayload,
  parseBondChallengePayload,
  parseBondChallengeResponsePayload,
  parseBondRequestPayload,
  parseFriendMatchingPreferencesPayload,
  parseHumanProfileFragmentPayload,
  parseSocialIntroOwnerReadyPayload,
  parseSocialIntroProposePayload,
  parseSocialIntroSyncPayload,
  parseChatMessagePayload,
  parseDiscoveryRequestPayload,
  parseDiscoveryResponsePayload,
  LibraryFileMatchSchema,
  LIBRARY_FILE_MATCH_CID_MAX_LENGTH,
  parseDevicePairApprovePayload,
  parseDevicePairDeferredPayload,
  parseDevicePairRequestPayload,
  parseKnowledgeQueryPayload,
  parseDeviceRevocationRecord,
  parseMandate,
  parseReportCreatePayload,
  parseRelayCheckinPayload,
  parseRelayHintsRequestPayload,
  parseRelayHintsResponsePayload,
  parseRelayJoinRequestPayload,
  parseRelayJoinResponsePayload,
  parseRelayLookupPayload,
  parseRelayLookupResponsePayload,
  parseRelayRegisterPayload,
  parseRelayRegisterResponsePayload,
  parseRelaySummaryPayload,
  parseTaskAcceptPayload,
  parseTaskCancelPayload,
  parseTaskHeartbeatPayload,
  parseTaskJournalEntry,
  parseTaskMandatePayload,
  parseTaskNegotiatePayload,
  parseTaskProposePayload,
  parseTaskRejectPayload,
  parseTaskResultPayload,
  parseSystemPingPayload,
  parseSystemSignalPayload,
  type ProofOfIntent,
  HumanProfilePayloadSchema,
  humanProfileFragmentForSigning,
  HumanProfileFragmentPayloadSchema,
  createHumanProfilePayload,
  humanProfileForSigning,
  SimpleTagCapabilitySchema,
  StructuredCapabilitySchema,
  DescriptorCapabilitySchema,
  RendezvousRegisterPayloadSchema,
  RendezvousQueryPayloadSchema,
  RendezvousMatchSchema,
  RendezvousResponsePayloadSchema,
} from "../src/index.js";

describe("protocol", () => {
  it("roundtrips knowledge.query payload", () => {
    const payload = createKnowledgeQueryPayload({
      query: "What is in the shared vault?",
      requestedSensitivity: "public",
    });
    expect(parseKnowledgeQueryPayload(payload)).toEqual(payload);
  });

  it("roundtrips knowledge.response with suggestedRelativePath", () => {
    const payload = createKnowledgeResponsePayload({
      inReplyTo: "msg-1",
      answer: "Ed25519 mesh security specification draft.",
      suggestedRelativePath: "shared/ed25519-draft.pdf",
      sensitivity: "friends",
      matchScore: 0.9,
    });
    expect(parseKnowledgeResponsePayload(payload)).toEqual(payload);
  });

  it("roundtrips bond payloads", () => {
    const request = createBondRequestPayload({
      requesterOwnerId: "envoy:owner:alice",
      message: "Hello",
      proofOfContext: "Work",
      requestedLevel: "referred",
    });
    expect(parseBondRequestPayload(request)).toEqual(request);

    const withIntro = createBondRequestPayload({
      requesterOwnerId: "envoy:owner:alice",
      introCorrelationId: "intro-corr-1",
      ownerCommitmentRef: "approval-queue:id-99",
      requestedLevel: "referred",
    });
    expect(parseBondRequestPayload(withIntro)).toEqual(withIntro);

    const challenge = createBondChallengePayload({
      challengerOwnerId: "envoy:owner:bob",
      targetOwnerId: "envoy:owner:alice",
    });
    expect(parseBondChallengePayload(challenge)).toEqual(challenge);

    const response = createBondChallengeResponsePayload({
      challengeId: challenge.challengeId,
      nonce: challenge.nonce,
      responderOwnerId: "envoy:owner:alice",
      decision: "accept",
      proofOfContext: "ok",
    });
    expect(parseBondChallengeResponsePayload(response)).toEqual(response);
  });

  it("roundtrips Trust-mode profile fragment and social.intro payloads", () => {
    const fragment = createHumanProfileFragmentPayload({
      ownerId: "envoy:owner:alice",
      purpose: "trust-mode-intro",
      expiresAt: "2027-01-01T00:00:00.000Z",
      displayName: "Alice",
      bio: "Builder.",
      hobbies: ["mesh"],
      tags: ["rust"],
      signature: "sig-placeholder",
    });
    expect(parseHumanProfileFragmentPayload(fragment)).toEqual(fragment);
    expect(humanProfileFragmentForSigning(fragment)).toEqual({
      version: "0.1",
      ownerId: "envoy:owner:alice",
      purpose: "trust-mode-intro",
      expiresAt: "2027-01-01T00:00:00.000Z",
      displayName: "Alice",
      bio: "Builder.",
      hobbies: ["mesh"],
      tags: ["rust"],
    });
    expect(HumanProfileFragmentPayloadSchema.safeParse({ ...fragment, signature: "" }).success).toBe(false);

    const sync = createSocialIntroSyncPayload({
      introCorrelationId: "corr-intro",
      ownerId: "envoy:owner:alice",
      interest: "explore",
      profileFragmentRefs: ["sha256:abc"],
      noteToCounterpartyAgent: "match on hiking",
    });
    expect(parseSocialIntroSyncPayload(sync)).toEqual(sync);

    const propose = createSocialIntroProposePayload({
      introCorrelationId: "corr-intro",
      candidateOwnerId: "envoy:owner:bob",
      candidatePeerId: "peer-bob",
      profileFragment: fragment,
      rationale: "Suggested: shared tags (non-binding).",
    });
    expect(parseSocialIntroProposePayload(propose)).toEqual(propose);

    const ready = createSocialIntroOwnerReadyPayload({
      introCorrelationId: "corr-intro",
      ownerId: "envoy:owner:alice",
      nonce: "nonce-1",
      expiresAt: "2027-01-02T00:00:00.000Z",
    });
    expect(parseSocialIntroOwnerReadyPayload(ready)).toEqual(ready);

    const fmp = createFriendMatchingPreferencesPayload({
      ownerId: "envoy:owner:alice",
      text: "Looking for collaborators.",
      expiresAt: "2027-01-01T00:00:00.000Z",
      signature: "sig",
    });
    expect(parseFriendMatchingPreferencesPayload(fmp)).toEqual(fmp);
    expect(friendMatchingPreferencesForSigning(fmp)).toEqual({
      version: "0.1",
      ownerId: "envoy:owner:alice",
      text: "Looking for collaborators.",
      expiresAt: "2027-01-01T00:00:00.000Z",
    });
    expect(FriendMatchingPreferencesPayloadSchema.safeParse({ ...fmp, signature: "" }).success).toBe(false);

    expect(() =>
      createSocialIntroProposePayload({
        introCorrelationId: "c",
        candidateOwnerId: "envoy:owner:bob",
        candidatePeerId: "peer-bob",
      }),
    ).toThrow(/profileFragment or profileFragmentRef/);
  });

  it("roundtrips discovery payloads", () => {
    const request = createDiscoveryRequestPayload({
      requesterOwnerId: "envoy:owner:alice",
      requestedTagHashes: ["hash:books"],
      requestedCapabilities: ["task.execute"],
      maxResults: 3,
    });
    expect(parseDiscoveryRequestPayload(request)).toEqual(request);

    const response = createDiscoveryResponsePayload({
      requestMessageId: "msg-1",
      responderOwnerId: "envoy:owner:bob",
      matches: [
        {
          ownerId: "envoy:owner:bob",
          peerId: "peer-b",
          matchedTagHashes: ["hash:books"],
          matchedCapabilities: ["task.execute"],
        },
      ],
    });
    expect(parseDiscoveryResponsePayload(response)).toEqual(response);
  });

  it("rejects libraryMatches cid longer than inbound max (F3)", () => {
    const tooLong = "b".repeat(LIBRARY_FILE_MATCH_CID_MAX_LENGTH + 1);
    expect(() =>
      LibraryFileMatchSchema.parse({
        documentId: "doc-1",
        title: "t",
        relativePath: "a.md",
        contentHash: "hash",
        cid: tooLong,
      }),
    ).toThrow();
    expect(
      LibraryFileMatchSchema.parse({
        documentId: "doc-1",
        title: "t",
        relativePath: "a.md",
        contentHash: "hash",
        cid: "bafyvalid",
      }).cid,
    ).toBe("bafyvalid");
  });

  it("roundtrips discovery.response with libraryMatches cid (F3)", () => {
    const response = createDiscoveryResponsePayload({
      requestMessageId: "msg-lib",
      responderOwnerId: "envoy:owner:alice",
      matches: [
        {
          ownerId: "envoy:owner:alice",
          peerId: "peer-a",
          matchedTagHashes: [],
          matchedCapabilities: ["envoymesh.published-library"],
          libraryMatches: [
            {
              documentId: "doc-1",
              title: "Published notes",
              relativePath: "notes.md",
              contentHash: "abc123hash",
              cid: "bafybeigdyrzt5sfp7udm7r",
            },
          ],
        },
      ],
    });
    const parsed = parseDiscoveryResponsePayload(response);
    expect(parsed.matches[0]?.libraryMatches?.[0]?.cid).toBe("bafybeigdyrzt5sfp7udm7r");
  });

  it("roundtrips relay checkin and lookup payloads", () => {
    const expiresAt = "2026-04-27T10:05:00.000Z";
    const checkin = createRelayCheckinPayload({
      peerId: "peer-a",
      ownerId: "envoy:owner:alice",
      relayReachableAddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/relay/p2p-circuit/p2p/peer-a"],
      capabilities: ["mesh.discovery"],
      advertisements: [{ capability: "mesh.discovery", visibility: "public", expiresAt }],
      relayHints: [{ relayId: "relay-1", multiaddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/relay-1"] }],
      expiresAt,
    });
    expect(parseRelayCheckinPayload(checkin)).toEqual(checkin);

    const lookup = createRelayLookupPayload({
      queryId: "query-1",
      capability: "mesh.discovery",
      maxResults: 5,
      maxHops: 2,
      maxFanout: 2,
      visibilityScope: "public",
      expiresAt,
    });
    expect(parseRelayLookupPayload(lookup)).toEqual(lookup);

    const response = createRelayLookupResponsePayload({
      queryId: lookup.queryId,
      peers: [
        {
          peerId: "peer-b",
          ownerId: "envoy:owner:bob",
          multiaddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/relay/p2p-circuit/p2p/peer-b"],
          viaRelayId: "relay-1",
          capabilities: ["mesh.discovery"],
          visibility: "public",
          expiresAt,
        },
      ],
      relayHints: [{ relayId: "relay-2", multiaddrs: ["/ip4/127.0.0.1/tcp/4002/p2p/relay-2"] }],
      truncated: false,
      expiresAt,
    });
    expect(parseRelayLookupResponsePayload(response)).toEqual(response);
  });

  it("roundtrips relay hints, join, register, and summary payloads", () => {
    const expiresAt = "2026-04-27T10:05:00.000Z";
    const hintsRequest = createRelayHintsRequestPayload({
      reason: "lookup-failed",
      maxResults: 3,
      expiresAt,
    });
    expect(parseRelayHintsRequestPayload(hintsRequest)).toEqual(hintsRequest);

    const hintsResponse = createRelayHintsResponsePayload({
      relayHints: [{ relayId: "relay-2", level: 2, multiaddrs: ["/ip4/127.0.0.1/tcp/4002/p2p/relay-2"] }],
      expiresAt,
    });
    expect(parseRelayHintsResponsePayload(hintsResponse)).toEqual(hintsResponse);

    const relay = {
      relayId: "relay-1",
      level: 2,
      region: "local",
      publicAddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/relay-1"],
      capacity: 20,
      expiresAt,
    };
    const join = createRelayJoinRequestPayload({
      relay,
      desiredLevel: 2,
    });
    expect(parseRelayJoinRequestPayload(join)).toEqual(join);

    const joinResponse = createRelayJoinResponsePayload({
      accepted: true,
      acceptedLevel: 2,
      parents: [{ relayId: "relay-root", level: 1, multiaddrs: ["/ip4/127.0.0.1/tcp/4000/p2p/root"] }],
      childLimit: 20,
      expiresAt,
    });
    expect(parseRelayJoinResponsePayload(joinResponse)).toEqual(joinResponse);

    const registration = createRelayRegisterPayload({
      relay,
      requestedRelation: "child",
    });
    expect(parseRelayRegisterPayload(registration)).toEqual(registration);

    const registerResponse = createRelayRegisterResponsePayload({
      accepted: true,
      relation: "child",
      state: "verified",
      expiresAt,
    });
    expect(parseRelayRegisterResponsePayload(registerResponse)).toEqual(registerResponse);

    const summary = createRelaySummaryPayload({
      relayId: "relay-1",
      level: 2,
      livePeerCount: 5,
      childRelayCount: 1,
      topicBuckets: ["capability:mesh.discovery"],
      expiresAt,
    });
    expect(parseRelaySummaryPayload(summary)).toEqual(summary);
  });

  it("roundtrips device pairing payloads", () => {
    const request = createDevicePairRequestPayload({
      requesterOwnerId: "envoy:owner:alice",
      requesterDeviceId: "envoy:device:alice-laptop",
      requesterDevicePublicKeyPem: "alice-device-key",
      note: "Please pair this device.",
      pairingToken: "tok_qr_scan_01",
    });
    expect(parseDevicePairRequestPayload(request)).toEqual(request);

    const approve = createDevicePairApprovePayload({
      requestId: request.requestId,
      deviceCertificate: {
        version: "0.1",
        certificateId: "cert-1",
        ownerId: "envoy:owner:alice",
        deviceId: "envoy:device:alice-laptop",
        devicePublicKeyPem: "alice-device-key",
        deviceProfile: "satellite",
        capabilities: ["ui.channel", "message.send"],
        issuedAt: "2026-04-27T10:00:00.000Z",
        expiresAt: null,
        signature: "sig",
      },
    });
    expect(parseDevicePairApprovePayload(approve)).toEqual(approve);

    const deferred = createDevicePairDeferredPayload({
      requestId: request.requestId,
      reason: "Primary unavailable.",
      deferredByDeviceId: "envoy:device:proxy",
    });
    expect(parseDevicePairDeferredPayload(deferred)).toEqual(deferred);
  });

  it("roundtrips chat.message payload", () => {
    const payload = createChatMessagePayload({
      senderOwnerId: "envoy:owner:alice",
      text: "hello from envoy mesh",
    });
    expect(parseChatMessagePayload(payload)).toEqual(payload);
  });

  // Phase 37 — audio attachments on chat.message
  it("roundtrips chat.message payload with audio attachment", () => {
    const attachment = {
      id: "00000000-0000-4000-a000-000000000001",
      filename: "voice-note.webm",
      mimeType: "audio/webm;codecs=opus",
      sizeBytes: 48000,
      sensitivity: "friends" as const,
    };
    const payload = createChatMessagePayload({
      senderOwnerId: "envoy:owner:alice",
      text: "check this out",
      attachments: [attachment],
    });
    const parsed = parseChatMessagePayload(payload);
    expect(parsed.text).toBe("check this out");
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments?.[0]?.mimeType).toBe("audio/webm;codecs=opus");
  });

  it("allows empty text when audio attachment is present (Phase 37)", () => {
    const attachment = {
      id: "00000000-0000-4000-a000-000000000002",
      filename: "voice-note.webm",
      mimeType: "audio/webm",
      sizeBytes: 24000,
      sensitivity: "friends" as const,
    };
    const payload = createChatMessagePayload({
      senderOwnerId: "envoy:owner:alice",
      text: "",
      attachments: [attachment],
    });
    const parsed = parseChatMessagePayload(payload);
    expect(parsed.text).toBe("");
    expect(parsed.attachments).toHaveLength(1);
  });

  it("rejects payload with empty text and no attachments (Phase 37)", () => {
    expect(() =>
      createChatMessagePayload({
        senderOwnerId: "envoy:owner:alice",
        text: "",
      }),
    ).toThrow(/attachment is required/);
  });

  it("backward-compatible: old payloads without attachments still parse", () => {
    const payload = createChatMessagePayload({
      senderOwnerId: "envoy:owner:alice",
      text: "hello",
    });
    const parsed = parseChatMessagePayload(payload);
    expect(parsed.text).toBe("hello");
    expect(parsed.attachments).toBeUndefined();
  });

  it("roundtrips chat.message payload with optional device certificate", () => {
    const payload = createChatMessagePayload({
      senderOwnerId: "envoy:owner:alice",
      text: "hello from phone",
      ownerPublicKeyPem: "-----BEGIN PUBLIC KEY-----\nowner\n-----END PUBLIC KEY-----",
      deviceCertificate: {
        version: "0.1",
        certificateId: "cert-1",
        ownerId: "envoy:owner:alice",
        deviceId: "envoy:device:phone",
        devicePublicKeyPem: "-----BEGIN PUBLIC KEY-----\nphone\n-----END PUBLIC KEY-----",
        deviceProfile: "satellite",
        capabilities: ["message.send"],
        issuedAt: new Date().toISOString(),
        expiresAt: null,
        signature: "sig",
      },
    });
    expect(parseChatMessagePayload(payload)).toEqual(payload);
  });

  it("roundtrips chat.delivered payload", () => {
    const payload = createChatDeliveredPayload({
      messageId: "msg-ack-1",
      recipientOwnerId: "envoy:owner:bob",
      deliveredAt: "2026-05-28T12:00:00.000Z",
    });
    expect(parseChatDeliveredPayload(payload)).toEqual(payload);
  });

  it("creates a valid unsigned envelope", () => {
    const envelope = createUnsignedEnvelope({
      senderPeerId: "peer-a",
      senderPublicKey: "public-key",
      recipientPeerId: "peer-b",
      intent: "system.ping",
      payload: { message: "hello" },
    });

    expect(envelope.version).toBe("0.1");
    expect(envelope.intent).toBe("system.ping");
    expect(envelope.messageId).toBeTruthy();
    expect(envelope.senderRole).toBe("system");
    expect(envelope.recipientRole).toBe("agent");
  });

  it("rejects role-intent mismatches for task and chat intents", () => {
    expect(() =>
      createUnsignedEnvelope({
        senderPeerId: "peer-a",
        senderPublicKey: "public-key",
        senderRole: "human",
        recipientPeerId: "peer-b",
        recipientRole: "agent",
        intent: "task.propose",
        payload: {
          taskId: "task-1",
          mandateId: "mandate-1",
          proofOfIntent: {
            version: "0.1",
            mandateId: "mandate-1",
            mandateHash: "hash-1",
            taskId: "task-1",
            requestIntent: "task.propose",
            nonce: "nonce",
            deviceId: "device",
            proof: "proof",
          },
          objective: "objective",
          requestedResult: "result",
          constraints: [],
        },
      }),
    ).toThrow(/senderRole=agent/);

    // chat.message with system role is not allowed
    expect(() =>
      createUnsignedEnvelope({
        senderPeerId: "peer-a",
        senderPublicKey: "public-key",
        senderRole: "system",
        recipientPeerId: "peer-b",
        recipientRole: "human",
        intent: "chat.message",
        payload: {
          senderOwnerId: "envoy:owner:a",
          text: "hello",
        },
      }),
    ).toThrow(/cannot involve system role/);
  });

  it("enforces role pairings for social.intro intents", () => {
    createUnsignedEnvelope({
      senderPeerId: "peer-agent-a",
      senderPublicKey: "pk-a",
      senderRole: "agent",
      recipientPeerId: "peer-agent-b",
      recipientRole: "agent",
      intent: "social.intro.sync",
      payload: createSocialIntroSyncPayload({
        introCorrelationId: "ic",
        ownerId: "envoy:owner:a",
        interest: "explore",
      }),
    });

    createUnsignedEnvelope({
      senderPeerId: "peer-agent-a",
      senderPublicKey: "pk-a",
      senderRole: "agent",
      recipientPeerId: "peer-human-b",
      recipientRole: "human",
      intent: "social.intro.propose",
      payload: createSocialIntroProposePayload({
        introCorrelationId: "ic",
        candidateOwnerId: "envoy:owner:bob",
        candidatePeerId: "peer-bob",
        profileFragmentRef: "frag-ref-1",
      }),
    });

    createUnsignedEnvelope({
      senderPeerId: "peer-human-a",
      senderPublicKey: "pk-a",
      senderRole: "human",
      recipientPeerId: "peer-agent-own",
      recipientRole: "agent",
      intent: "social.intro.owner-ready",
      payload: createSocialIntroOwnerReadyPayload({
        introCorrelationId: "ic",
        ownerId: "envoy:owner:a",
        nonce: "n",
        expiresAt: "2027-01-01T00:00:00.000Z",
      }),
    });

    expect(() =>
      createUnsignedEnvelope({
        senderPeerId: "peer-human-a",
        senderPublicKey: "pk-a",
        senderRole: "human",
        recipientPeerId: "peer-agent-b",
        recipientRole: "agent",
        intent: "social.intro.sync",
        payload: createSocialIntroSyncPayload({
          introCorrelationId: "ic",
          ownerId: "envoy:owner:a",
          interest: "explore",
        }),
      }),
    ).toThrow(/social.intro.sync requires senderRole=agent/);

    expect(() =>
      createUnsignedEnvelope({
        senderPeerId: "peer-agent-a",
        senderPublicKey: "pk-a",
        senderRole: "agent",
        recipientPeerId: "peer-agent-b",
        recipientRole: "agent",
        intent: "social.intro.propose",
        payload: createSocialIntroProposePayload({
          introCorrelationId: "ic",
          candidateOwnerId: "envoy:owner:bob",
          candidatePeerId: "peer-bob",
          profileFragmentRef: "ref",
        }),
      }),
    ).toThrow(/social\.intro\.propose.*senderRole=agent|recipientRole/);
  });

  it("rejects human→human for Phase 40E cross-orchestrator intents (agent↔agent only)", () => {
    // task.chain.handoff, .delegate, .relay, .arbitration are all
    // agent↔agent. Humans must not appear in their role pair. This is
    // important because the role-policy table is the only "first line"
    // guard — a misrouted intent can otherwise travel wire.
    expect(() =>
      createUnsignedEnvelope({
        senderPeerId: "peer-human",
        senderPublicKey: "pk",
        senderRole: "human",
        recipientPeerId: "peer-agent",
        recipientRole: "agent",
        intent: "task.chain.handoff",
        payload: {
          chainId: "chain_x",
          subtaskIds: ["subtask_a"],
          newOrchestratorPeerId: "peer-b",
          newOrchestratorOwnerId: "envoy:owner:b",
          expiresAt: "2027-01-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    ).toThrow();
    expect(() =>
      createUnsignedEnvelope({
        senderPeerId: "peer-a",
        senderPublicKey: "pk",
        senderRole: "agent",
        recipientPeerId: "peer-human-b",
        recipientRole: "human",
        intent: "task.chain.delegate",
        payload: {
          chainId: "chain_x",
          subtaskIds: ["subtask_a"],
          handoffRequestId: "handoff_x_1",
          subChainId: "chain_x_sub_1",
          subChainMandate: {
            version: "0.1",
            chainMandateId: "m1",
            chainId: "chain_x_sub_1",
            issuerOwnerId: "envoy:owner:b",
            orchestratorOwnerId: "envoy:owner:b",
            maxChainCostUsd: 1,
            costCeilingUsd: 1,
            maxWorkers: 1,
            allowDepth3: false,
            maxSensitivity: "public",
            deadlineAt: "2027-01-01T00:00:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z",
            rebalancePolicy: "manual",
            maxAutoRebalances: 0,
            autoRebalanceIncrementUsd: 0,
            signature: "stub",
          },
          reportBackByAt: "2027-01-01T00:00:00.000Z",
          estimatedCostUsd: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    ).toThrow();
  });

  it("defaults mandate closeOnFirstCompletedResult to false", () => {
    const mandate = createUnsignedMandate({
      ownerId: "envoy:owner:alice",
      issuedToDeviceId: "envoy:device:desktop",
      taskIntent: "find.book",
      objective: "Find a book.",
      mandateId: "mandate-1",
      expiresAt: "2026-04-27T12:00:00.000Z",
    });

    expect(mandate.closeOnFirstCompletedResult).toBe(false);
  });

  it("persists closeOnFirstCompletedResult on mandates when set", () => {
    const mandate = createUnsignedMandate({
      ownerId: "envoy:owner:alice",
      issuedToDeviceId: "envoy:device:desktop",
      taskIntent: "find.book",
      objective: "Find a book.",
      mandateId: "mandate-1",
      expiresAt: "2026-04-27T12:00:00.000Z",
      closeOnFirstCompletedResult: true,
    });

    expect(mandate.closeOnFirstCompletedResult).toBe(true);
  });

  it("threads correlationId through envelope signing material", () => {
    const unsigned = createUnsignedEnvelope({
      senderPeerId: "peer-a",
      senderPublicKey: "public-key",
      recipientPeerId: "peer-b",
      intent: "system.ping",
      payload: { message: "hello" },
      correlationId: "corr-1",
      messageId: "msg-1",
      createdAt: "2026-04-27T10:00:00.000Z",
    });
    const forSigning = envelopeForSigning({
      ...unsigned,
      signature: "signature",
    } as any);

    expect(forSigning.correlationId).toBe("corr-1");
  });

  it("rejects unknown intents", () => {
    const result = EnvoyEnvelopeSchema.safeParse({
      version: "0.1",
      messageId: "msg-1",
      createdAt: new Date().toISOString(),
      senderPeerId: "peer-a",
      senderPublicKey: "public-key",
      intent: "unknown.intent",
      payload: {},
      signature: "signature",
    });

    expect(result.success).toBe(false);
  });

  it("canonicalizes object keys recursively", () => {
    expect(canonicalJson({ b: 1, a: { d: 4, c: 3 } })).toBe(
      '{"a":{"c":3,"d":4},"b":1}',
    );
  });

  it("removes signature before signing", () => {
    const unsigned = envelopeForSigning({
      version: "0.1",
      messageId: "msg-1",
      createdAt: "2026-04-26T09:20:00.000Z",
      senderPeerId: "peer-a",
      senderPublicKey: "public-key",
      senderRole: "system",
      recipientRole: "agent",
      intent: "system.ping",
      payload: {},
      signature: "signature",
    });

    expect("signature" in unsigned).toBe(false);
  });

  it("creates and parses system ping payloads", () => {
    const payload = createSystemPingPayload("hello");

    expect(parseSystemPingPayload(payload)).toEqual(payload);
    expect(payload.message).toBe("hello");
    expect(payload.nonce).toBeTruthy();
  });

  it("validates device certificates", () => {
    const certificate: DeviceCertificate = {
      version: "0.1",
      certificateId: "cert-1",
      ownerId: "envoy:owner:alice",
      deviceId: "envoy:device:phone",
      devicePublicKeyPem: "public-key",
      deviceProfile: "satellite",
      capabilities: ["ui.channel", "approval.prompt"],
      issuedAt: "2026-04-26T10:00:00.000Z",
      expiresAt: null,
      signature: "signature",
    };

    expect(DeviceCertificateSchema.parse(certificate)).toEqual(certificate);
    expect(deviceCertificateForSigning(certificate)).not.toHaveProperty("signature");
  });

  it("creates and parses device revocation records", () => {
    const unsignedRecord = createUnsignedDeviceRevocationRecord({
      ownerId: "envoy:owner:alice",
      deviceId: "envoy:device:phone",
      certificateId: "cert-1",
      reason: "lost",
      revokedAt: "2026-04-27T10:00:00.000Z",
    });
    const record = {
      ...unsignedRecord,
      signature: "signature",
    };

    expect(parseDeviceRevocationRecord(record)).toEqual(record);
    expect(unsignedRecord.revocationId).toMatch(/^revocation_/);
    expect(deviceRevocationRecordForSigning(record)).not.toHaveProperty("signature");
  });

  it("creates and parses system signal payloads from device certificates", () => {
    const certificate: DeviceCertificate = {
      version: "0.1",
      certificateId: "cert-1",
      ownerId: "envoy:owner:alice",
      deviceId: "envoy:device:desktop",
      devicePublicKeyPem: "public-key",
      deviceProfile: "primary",
      capabilities: ["mesh.listen", "vault.index", "device.sync"],
      issuedAt: "2026-04-26T10:00:00.000Z",
      expiresAt: null,
      signature: "signature",
    };

    const payload = createSystemSignalPayload({
      deviceCertificate: certificate,
      ownerPublicKeyPem: "owner-public-key",
      listenAddrs: ["/ip4/127.0.0.1/tcp/10000"],
      publicTopics: ["distributed systems"],
    });

    expect(parseSystemSignalPayload(payload)).toEqual(payload);
    expect(payload.ownerId).toBe(certificate.ownerId);
    expect(payload.deviceProfile).toBe("primary");
    expect(payload.supportedProtocolVersions).toEqual(["emp/0.1"]);
  });

  it("creates and parses auth challenge payloads", () => {
    const payload = createAuthChallengePayload({
      challengerOwnerId: "envoy:owner:alice",
      challengerDeviceId: "envoy:device:desktop",
      targetOwnerId: "envoy:owner:bob",
      requestedIntent: "system.signal",
      expiresAt: "2026-04-26T10:05:00.000Z",
    });

    expect(parseAuthChallengePayload(payload)).toEqual(payload);
    expect(payload.challengeId).toMatch(/^challenge_/);
    expect(payload.nonce).toBeTruthy();
    expect(payload.requestedIntent).toBe("system.signal");
  });

  it("creates and parses agent cards", () => {
    const card = createAgentCard({
      ownerId: "envoy:owner:alice",
      displayName: "Alice's Envoy",
      nodeProfile: "primary",
      membership: ["knowledge.query", "task.negotiate", "find.books"],
      publicTopics: ["distributed systems", "books"],
    });

    expect(parseAgentCard(card)).toEqual(card);
    expect(card.version).toBe("0.1");
    expect(card.trustPolicySummary.acceptsReferralRequests).toBe(true);
    expect(card.supportedProtocolVersions).toEqual(["emp/0.1"]);
  });

  it("creates and parses agent card request and response payloads", () => {
    const request = createAgentCardRequestPayload({
      requesterOwnerId: "envoy:owner:bob",
      requesterDeviceId: "envoy:device:phone",
      requestedTopics: ["books"],
    });
    const card = createAgentCard({
      ownerId: "envoy:owner:alice",
      displayName: "Alice's Envoy",
      nodeProfile: "primary",
      membership: ["find.books"],
    });
    const response = createAgentCardResponsePayload(card);

    expect(parseAgentCardRequestPayload(request)).toEqual(request);
    expect(parseAgentCardResponsePayload(response)).toEqual(response);
  });

  it("creates and parses unsigned mandates and task mandate payloads", () => {
    const unsignedMandate = createUnsignedMandate({
      ownerId: "envoy:owner:alice",
      issuedToDeviceId: "envoy:device:desktop",
      taskIntent: "find a book",
      objective: "Find a good distributed systems book recommendation.",
      allowedPeerScopes: ["direct", "referred"],
      maxSensitivity: "friends",
      expiresAt: "2026-04-27T10:00:00.000Z",
    });
    const mandate = {
      ...unsignedMandate,
      signature: "signature",
    };
    const payload = createTaskMandatePayload(mandate);

    expect(parseMandate(mandate)).toEqual(mandate);
    expect(parseTaskMandatePayload(payload)).toEqual(payload);
    expect(unsignedMandate.mandateId).toMatch(/^mandate_/);
    expect(unsignedMandate.disallowedActions).toContain("send.raw_files");
    expect(unsignedMandate.maxCost).toEqual({ amount: 0, currency: "USD" });
  });

  it("creates and parses A2A task lifecycle payloads", () => {
    const proofOfIntent: ProofOfIntent = {
      version: "0.1",
      mandateId: "mandate-1",
      mandateHash: "hash-1",
      taskId: "task-1",
      requestIntent: "task.propose",
      nonce: "nonce-1",
      deviceId: "envoy:device:desktop",
      proof: "signature",
    };

    const journal = createTaskJournalEntry({
      taskId: "task-1",
      mandateId: "mandate-1",
      eventType: "proposed",
      state: "negotiating",
      summary: "Asked a peer for help finding a book.",
      createdAt: "2026-04-27T10:00:00.000Z",
    });
    const proposal = createTaskProposePayload({
      taskId: "task-1",
      mandateId: "mandate-1",
      proofOfIntent,
      objective: "Find a distributed systems book.",
      requestedResult: "Return a short recommendation with reason.",
      constraints: ["No raw private data"],
    });
    const negotiation = createTaskNegotiatePayload({
      taskId: "task-1",
      mandateId: "mandate-1",
      proofOfIntent,
      message: "Can you narrow this to beginner-friendly books?",
      proposedChanges: ["beginner-friendly"],
      negotiationId: "negotiation-1",
    });
    const accepted = createTaskAcceptPayload({
      taskId: "task-1",
      mandateId: "mandate-1",
      acceptedAt: "2026-04-27T10:01:00.000Z",
      agreementSummary: "Peer will return one public recommendation.",
    });
    const rejected = createTaskRejectPayload({
      taskId: "task-1",
      mandateId: "mandate-1",
      reason: "Outside local policy.",
      retryable: false,
      requiresOwnerApproval: false,
    });
    const heartbeat = createTaskHeartbeatPayload({
      taskId: "task-1",
      mandateId: "mandate-1",
      state: "waiting_for_peer",
      summary: "Waiting for peer response.",
      createdAt: "2026-04-27T10:02:00.000Z",
    });
    const result = createTaskResultPayload({
      taskId: "task-1",
      mandateId: "mandate-1",
      status: "completed",
      summary: "Peer recommended Designing Data-Intensive Applications.",
      deliveryAttestation: {
        documentId: "doc-1",
        relativePath: "books/ddia.pdf",
        contentHash: "hash1234567890",
        counterpartyOwnerId: "envoy:owner:buyer",
      },
      createdAt: "2026-04-27T10:03:00.000Z",
    });
    const cancelled = createTaskCancelPayload({
      taskId: "task-1",
      mandateId: "mandate-1",
      reason: "Owner cancelled the task.",
      cancelledBy: "owner",
      createdAt: "2026-04-27T10:04:00.000Z",
    });

    expect(parseTaskJournalEntry(journal)).toEqual(journal);
    expect(parseTaskProposePayload(proposal)).toEqual(proposal);
    expect(parseTaskNegotiatePayload(negotiation)).toEqual(negotiation);
    expect(parseTaskAcceptPayload(accepted)).toEqual(accepted);
    expect(parseTaskRejectPayload(rejected)).toEqual(rejected);
    expect(parseTaskHeartbeatPayload(heartbeat)).toEqual(heartbeat);
    expect(parseTaskResultPayload(result)).toEqual(result);
    expect(parseTaskCancelPayload(cancelled)).toEqual(cancelled);
  });

  it("creates reporting policies and report payloads", () => {
    const policy = createAutonomousReportingPolicy();
    const report = createReport({
      taskId: "task-1",
      mandateId: "mandate-1",
      ownerId: "envoy:owner:alice",
      status: "completed",
      mode: "brief",
      summary: "I found one good recommendation.",
      evidence: [
        {
          type: "peer_response",
          source: "envoy:owner:bob",
          sensitivity: "public",
        },
      ],
      suggestedActions: [
        {
          label: "Ask for more details",
          action: "task.continue",
          requiresApproval: true,
        },
      ],
      createdAt: "2026-04-27T11:00:00.000Z",
    });
    const payload = createReportCreatePayload(report);

    expect(policy.defaultMode).toBe("brief");
    expect(policy.approvalRequiredFor).toContain("send.raw_files");
    expect(parseReportCreatePayload(payload)).toEqual(payload);
    expect(report.reportId).toMatch(/^report_/);
  });
});

describe("HumanProfilePayload", () => {
  it("validates a complete human profile", () => {
    const profile = {
      version: "0.1" as const,
      ownerId: "envoy:owner:alice",
      displayName: "Alice",
      username: "alice123",
      bio: "Hello I am Alice",
      gender: "Female",
      hobbies: ["music", "coding"],
      knowledge: ["distributed systems"],
      profileVisibility: "public" as const,
      discoveryLocationPrecision: "hidden" as const,
      updatedAt: "2026-04-27T10:00:00.000Z",
      signature: "signature123",
    };

    expect(HumanProfilePayloadSchema.parse(profile)).toEqual(profile);
  });

  it("accepts public thumbnail and gallery photos", () => {
    const profile = {
      version: "0.1" as const,
      ownerId: "envoy:owner:alice",
      displayName: "Alice",
      username: "alice123",
      profileVisibility: "private" as const,
      publicThumbnail: {
        vaultRelativePath: "profile/thumbnail.jpg",
        contentSha256: "a".repeat(64),
        mimeType: "image/jpeg" as const,
      },
      galleryPhotos: [
        {
          photoId: "trip-1",
          vaultRelativePath: "profile/gallery/trip-1.jpg",
          contentSha256: "b".repeat(64),
          mimeType: "image/jpeg" as const,
          visibility: "direct" as const,
        },
      ],
      updatedAt: "2026-04-27T10:00:00.000Z",
      signature: "signature123",
    };
    expect(HumanProfilePayloadSchema.parse(profile).publicThumbnail?.vaultRelativePath).toBe(
      "profile/thumbnail.jpg",
    );
  });

  it("accepts profile with minimal required fields", () => {
    const profile = {
      version: "0.1" as const,
      ownerId: "envoy:owner:bob",
      displayName: "Bob",
      username: "bob42",
      profileVisibility: "private",
      updatedAt: "2026-04-27T10:00:00.000Z",
      signature: "signature456",
    };

    const parsed = HumanProfilePayloadSchema.parse(profile);
    expect(parsed.displayName).toBe("Bob");
    expect(parsed.ownerId).toBe("envoy:owner:bob");
    expect(parsed.username).toBe("bob42");
    expect(parsed.profileVisibility).toBe("private");
  });

  it("rejects profile without displayName", () => {
    const profile = {
      version: "0.1" as const,
      ownerId: "envoy:owner:alice",
      username: "alice123",
      updatedAt: "2026-04-27T10:00:00.000Z",
      signature: "signature123",
    };

    const result = HumanProfilePayloadSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });

  it("rejects profile without username", () => {
    const profile = {
      version: "0.1" as const,
      ownerId: "envoy:owner:alice",
      displayName: "Alice",
      updatedAt: "2026-04-27T10:00:00.000Z",
      signature: "signature123",
    };

    const result = HumanProfilePayloadSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });

  it("rejects username with invalid characters", () => {
    const invalidUsernames = ["al ice", "alice@home", "alice!", "alice-one", "al"];

    for (const username of invalidUsernames) {
      const profile = {
        version: "0.1" as const,
        ownerId: "envoy:owner:alice",
        displayName: "Alice",
        username,
        updatedAt: "2026-04-27T10:00:00.000Z",
        signature: "signature123",
      };

      const result = HumanProfilePayloadSchema.safeParse(profile);
      expect(result.success).toBe(false);
    }
  });

  it("rejects username shorter than 3 characters", () => {
    const profile = {
      version: "0.1" as const,
      ownerId: "envoy:owner:alice",
      displayName: "Alice",
      username: "ab",
      updatedAt: "2026-04-27T10:00:00.000Z",
      signature: "signature123",
    };

    const result = HumanProfilePayloadSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });

  it("rejects username longer than 30 characters", () => {
    const profile = {
      version: "0.1" as const,
      ownerId: "envoy:owner:alice",
      displayName: "Alice",
      username: "a".repeat(31),
      updatedAt: "2026-04-27T10:00:00.000Z",
      signature: "signature123",
    };

    const result = HumanProfilePayloadSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });

  it("accepts valid usernames with underscores and numbers", () => {
    const validUsernames = ["alice", "Alice123", "alice_test", "test_user_123", "a".repeat(30)];

    for (const username of validUsernames) {
      const profile = {
        version: "0.1" as const,
        ownerId: "envoy:owner:alice",
        displayName: "Alice",
        username,
        profileVisibility: "private" as const,
        updatedAt: "2026-04-27T10:00:00.000Z",
        signature: "signature123",
      };

      const parsed = HumanProfilePayloadSchema.parse(profile);
      expect(parsed.username).toBe(username);
      expect(parsed.profileVisibility).toBe("private");
    }
  });

  it("accepts profile with discoveryLocationPrecision defaulting to 'hidden' when absent", () => {
    // The schema accepts the missing field (no Zod .default()) for wire
    // compatibility; consumers that need a value should treat absent as
    // "hidden" themselves.
    const profile = {
      version: "0.1" as const,
      ownerId: "envoy:owner:alice",
      displayName: "Alice",
      username: "alice123",
      profileVisibility: "private" as const,
      updatedAt: "2026-04-27T10:00:00.000Z",
      signature: "signature123",
    };

    const parsed = HumanProfilePayloadSchema.parse(profile);
    expect(parsed.discoveryLocationPrecision).toBeUndefined();
  });

  it("rejects profile without profileVisibility (no schema default)", () => {
    // Schema deliberately omits the .default() so that signatures don't get
    // silently broken by a field added at parse time.
    const profile = {
      version: "0.1" as const,
      ownerId: "envoy:owner:alice",
      displayName: "Alice",
      username: "alice123",
      updatedAt: "2026-04-27T10:00:00.000Z",
      signature: "signature123",
    };

    const parsed = HumanProfilePayloadSchema.safeParse(profile);
    expect(parsed.success).toBe(false);
  });

  it("rejects invalid profileVisibility", () => {
    const profile = {
      version: "0.1" as const,
      ownerId: "envoy:owner:alice",
      displayName: "Alice",
      username: "alice123",
      profileVisibility: "invalid" as any,
      updatedAt: "2026-04-27T10:00:00.000Z",
      signature: "signature123",
    };

    const result = HumanProfilePayloadSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });

  it("limits hobbies to 20 items", () => {
    const hobbies = Array.from({ length: 21 }, (_, i) => `hobby${i}`);
    const profile = {
      version: "0.1" as const,
      ownerId: "envoy:owner:alice",
      displayName: "Alice",
      username: "alice123",
      hobbies,
      updatedAt: "2026-04-27T10:00:00.000Z",
      signature: "signature123",
    };

    const result = HumanProfilePayloadSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });

  it("accepts exactly 20 hobbies", () => {
    const hobbies = Array.from({ length: 20 }, (_, i) => `hobby${i}`);
    const profile = {
      version: "0.1" as const,
      ownerId: "envoy:owner:alice",
      displayName: "Alice",
      username: "alice123",
      profileVisibility: "private" as const,
      hobbies,
      updatedAt: "2026-04-27T10:00:00.000Z",
      signature: "signature123",
    };

    const result = HumanProfilePayloadSchema.safeParse(profile);
    expect(result.success).toBe(true);
  });

  it("limits knowledge to 50 items", () => {
    const knowledge = Array.from({ length: 51 }, (_, i) => `knowledge${i}`);
    const profile = {
      version: "0.1" as const,
      ownerId: "envoy:owner:alice",
      displayName: "Alice",
      username: "alice123",
      knowledge,
      updatedAt: "2026-04-27T10:00:00.000Z",
      signature: "signature123",
    };

    const result = HumanProfilePayloadSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });
});

describe("createHumanProfilePayload", () => {
  it("creates a valid human profile payload with required fields", () => {
    const payload = createHumanProfilePayload({
      ownerId: "envoy:owner:alice",
      displayName: "Alice",
      username: "alice123",
      ownerPrivateKeyPem: "private-key",
    });

    expect(payload.version).toBe("0.1");
    expect(payload.ownerId).toBe("envoy:owner:alice");
    expect(payload.displayName).toBe("Alice");
    expect(payload.username).toBe("alice123");
    expect("signature" in payload).toBe(false);
    expect(payload.updatedAt).toBeTruthy();
  });

  it("trims displayName and username", () => {
    const payload = createHumanProfilePayload({
      ownerId: "envoy:owner:alice",
      displayName: "  Alice  ",
      username: "  alice123  ",
      ownerPrivateKeyPem: "private-key",
    });

    expect(payload.displayName).toBe("Alice");
    expect(payload.username).toBe("alice123");
  });

  it("includes optional fields when provided", () => {
    const payload = createHumanProfilePayload({
      ownerId: "envoy:owner:alice",
      displayName: "Alice",
      username: "alice123",
      bio: "Hello world",
      gender: "Female",
      hobbies: ["music"],
      knowledge: ["coding"],
      profileVisibility: "public",
      ownerPrivateKeyPem: "private-key",
    });

    expect(payload.bio).toBe("Hello world");
    expect(payload.gender).toBe("Female");
    expect(payload.hobbies).toEqual(["music"]);
    expect(payload.knowledge).toEqual(["coding"]);
    expect(payload.profileVisibility).toBe("public");
  });

  it("defaults profileVisibility to private", () => {
    const payload = createHumanProfilePayload({
      ownerId: "envoy:owner:alice",
      displayName: "Alice",
      username: "alice123",
      ownerPrivateKeyPem: "private-key",
    });

    expect(payload.profileVisibility).toBe("private");
  });

  it("returns the unsigned shape (no signature field)", () => {
    const payload = createHumanProfilePayload({
      ownerId: "envoy:owner:alice",
      displayName: "Alice",
      username: "alice123",
      ownerPrivateKeyPem: "private-key",
    });

    expect("signature" in payload).toBe(false);
  });
});

describe("humanProfileForSigning", () => {
  it("removes signature from payload", () => {
    const payload = {
      version: "0.1" as const,
      ownerId: "envoy:owner:alice",
      displayName: "Alice",
      username: "alice123",
      profileVisibility: "private" as const,
      updatedAt: "2026-04-27T10:00:00.000Z",
      signature: "real-signature",
    };

    const forSigning = humanProfileForSigning(payload);

    expect(forSigning).not.toHaveProperty("signature");
    expect(forSigning.displayName).toBe("Alice");
    expect(forSigning.username).toBe("alice123");
  });
});

describe("Rendezvous Capability Schemas", () => {
  describe("SimpleTagCapabilitySchema", () => {
    it("accepts valid tag capability", () => {
      const cap = { tag: "coding-help" };
      const result = SimpleTagCapabilitySchema.safeParse(cap);
      expect(result.success).toBe(true);
    });

    it("rejects empty tag", () => {
      const cap = { tag: "" };
      const result = SimpleTagCapabilitySchema.safeParse(cap);
      expect(result.success).toBe(false);
    });
  });

  describe("StructuredCapabilitySchema", () => {
    it("accepts type with params", () => {
      const cap = { type: "translation", params: { from: "en", to: "zh" } };
      const result = StructuredCapabilitySchema.safeParse(cap);
      expect(result.success).toBe(true);
    });

    it("accepts type without params", () => {
      const cap = { type: "document-search" };
      const result = StructuredCapabilitySchema.safeParse(cap);
      expect(result.success).toBe(true);
    });

    it("accepts type with confidence", () => {
      const cap = { type: "translation", params: { from: "en" }, confidence: 0.9 };
      const result = StructuredCapabilitySchema.safeParse(cap);
      expect(result.success).toBe(true);
    });

    it("rejects negative confidence", () => {
      const cap = { type: "translation", confidence: -0.1 };
      const result = StructuredCapabilitySchema.safeParse(cap);
      expect(result.success).toBe(false);
    });

    it("rejects confidence over 1", () => {
      const cap = { type: "translation", confidence: 1.5 };
      const result = StructuredCapabilitySchema.safeParse(cap);
      expect(result.success).toBe(false);
    });
  });

  describe("DescriptorCapabilitySchema", () => {
    it("accepts valid descriptor", () => {
      const cap = { descriptor: "I can translate English to Chinese with 90% accuracy" };
      const result = DescriptorCapabilitySchema.safeParse(cap);
      expect(result.success).toBe(true);
    });

    it("rejects empty descriptor", () => {
      const cap = { descriptor: "" };
      const result = DescriptorCapabilitySchema.safeParse(cap);
      expect(result.success).toBe(false);
    });
  });
});

describe("RendezvousRegisterPayloadSchema", () => {
  it("accepts valid registration payload", () => {
    const payload = {
      peerId: "QmXfz9z",
      multiaddr: "/ip4/1.2.3.4/tcp/4001/p2p/QmXfz9z",
      capabilities: [
        { tag: "coding-help" },
        { type: "translation", params: { from: "en", to: "zh" } },
      ],
      ttlSeconds: 3600,
    };

    const result = RendezvousRegisterPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("accepts tag-only capability", () => {
    const payload = {
      peerId: "QmXfz9z",
      multiaddr: "/ip4/1.2.3.4/tcp/4001/p2p/QmXfz9z",
      capabilities: [{ tag: "document-search" }],
    };

    const result = RendezvousRegisterPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("accepts descriptor capability", () => {
    const payload = {
      peerId: "QmXfz9z",
      multiaddr: "/ip4/1.2.3.4/tcp/4001/p2p/QmXfz9z",
      capabilities: [{ descriptor: "I can translate English to Chinese" }],
    };

    const result = RendezvousRegisterPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("defaults ttlSeconds to 3600", () => {
    const payload = {
      peerId: "QmXfz9z",
      multiaddr: "/ip4/1.2.3.4/tcp/4001/p2p/QmXfz9z",
      capabilities: [{ tag: "coding-help" }],
    };

    const result = RendezvousRegisterPayloadSchema.parse(payload);
    expect(result.ttlSeconds).toBe(3600);
  });

  it("rejects ttlSeconds below 60", () => {
    const payload = {
      peerId: "QmXfz9z",
      multiaddr: "/ip4/1.2.3.4/tcp/4001/p2p/QmXfz9z",
      capabilities: [{ tag: "coding-help" }],
      ttlSeconds: 30,
    };

    const result = RendezvousRegisterPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("rejects ttlSeconds above 86400", () => {
    const payload = {
      peerId: "QmXfz9z",
      multiaddr: "/ip4/1.2.3.4/tcp/4001/p2p/QmXfz9z",
      capabilities: [{ tag: "coding-help" }],
      ttlSeconds: 100000,
    };

    const result = RendezvousRegisterPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("rejects empty peerId", () => {
    const payload = {
      peerId: "",
      multiaddr: "/ip4/1.2.3.4/tcp/4001/p2p/QmXfz9z",
      capabilities: [{ tag: "coding-help" }],
    };

    const result = RendezvousRegisterPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe("RendezvousQueryPayloadSchema", () => {
  it("accepts tag-based query", () => {
    const payload = {
      match: { tag: "coding-help" },
      maxResults: 10,
    };

    const result = RendezvousQueryPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("accepts type-based query with params", () => {
    const payload = {
      match: { type: "translation", params: { from: "en" } },
      maxResults: 5,
    };

    const result = RendezvousQueryPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("accepts type-based query without params (wildcard)", () => {
    const payload = {
      match: { type: "translation" },
    };

    const result = RendezvousQueryPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("defaults maxResults to 10", () => {
    const payload = {
      match: { tag: "coding-help" },
    };

    const result = RendezvousQueryPayloadSchema.parse(payload);
    expect(result.maxResults).toBe(10);
  });

  it("rejects maxResults below 1", () => {
    const payload = {
      match: { tag: "coding-help" },
      maxResults: 0,
    };

    const result = RendezvousQueryPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("rejects maxResults above 100", () => {
    const payload = {
      match: { tag: "coding-help" },
      maxResults: 200,
    };

    const result = RendezvousQueryPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe("RendezvousMatchSchema", () => {
  it("accepts valid match with multiple capabilities", () => {
    const match = {
      peerId: "QmXfz9z",
      multiaddr: "/ip4/1.2.3.4/tcp/4001/p2p/QmXfz9z",
      capabilities: [
        { tag: "coding-help" },
        { type: "translation", params: { from: "en", to: "zh" } },
      ],
    };

    const result = RendezvousMatchSchema.safeParse(match);
    expect(result.success).toBe(true);
  });
});

describe("RendezvousResponsePayloadSchema", () => {
  it("accepts response with matches", () => {
    const payload = {
      matches: [
        {
          peerId: "QmXfz9z",
          multiaddr: "/ip4/1.2.3.4/tcp/4001/p2p/QmXfz9z",
          capabilities: [{ tag: "coding-help" }],
        },
        {
          peerId: "QmAabc1",
          multiaddr: "/ip4/5.6.7.8/tcp/4002/p2p/QmAabc1",
          capabilities: [{ type: "translation", params: { from: "en", to: "fr" } }],
        },
      ],
    };

    const result = RendezvousResponsePayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("accepts empty matches array", () => {
    const payload = { matches: [] };
    const result = RendezvousResponsePayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});

describe("createRendezvousRegisterPayload", () => {
  it("creates valid registration payload", () => {
    const payload = createRendezvousRegisterPayload({
      peerId: "QmXfz9z",
      multiaddr: "/ip4/1.2.3.4/tcp/4001/p2p/QmXfz9z",
      capabilities: [
        { tag: "coding-help" },
        { type: "translation", params: { from: "en", to: "zh" } },
      ],
      ttlSeconds: 7200,
    });

    expect(payload.peerId).toBe("QmXfz9z");
    expect(payload.capabilities).toHaveLength(2);
    expect(payload.ttlSeconds).toBe(7200);
  });

  it("defaults ttlSeconds to 3600", () => {
    const payload = createRendezvousRegisterPayload({
      peerId: "QmXfz9z",
      multiaddr: "/ip4/1.2.3.4/tcp/4001/p2p/QmXfz9z",
      capabilities: [{ tag: "document-search" }],
    });

    expect(payload.ttlSeconds).toBe(3600);
  });
});

describe("createRendezvousQueryPayload", () => {
  it("creates tag-based query", () => {
    const payload = createRendezvousQueryPayload({
      match: { tag: "coding-help" },
      maxResults: 5,
    });

    expect(payload.match).toEqual({ tag: "coding-help" });
    expect(payload.maxResults).toBe(5);
  });

  it("creates type-based query", () => {
    const payload = createRendezvousQueryPayload({
      match: { type: "translation", params: { from: "en" } },
    });

    expect(payload.match).toEqual({ type: "translation", params: { from: "en" } });
    expect(payload.maxResults).toBe(10);
  });
});

describe("createRendezvousResponsePayload", () => {
  it("creates valid response with matches", () => {
    const payload = createRendezvousResponsePayload({
      matches: [
        {
          peerId: "QmXfz9z",
          multiaddr: "/ip4/1.2.3.4/tcp/4001/p2p/QmXfz9z",
          capabilities: [{ tag: "coding-help" }],
        },
      ],
    });

    expect(payload.matches).toHaveLength(1);
    expect(payload.matches[0].peerId).toBe("QmXfz9z");
  });
});
