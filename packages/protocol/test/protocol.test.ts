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
  createDiscoveryRequestPayload,
  createDiscoveryResponsePayload,
  createDevicePairApprovePayload,
  createDevicePairDeferredPayload,
  createDevicePairRequestPayload,
  createKnowledgeQueryPayload,
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
  parseAgentCard,
  parseAgentCardRequestPayload,
  parseAgentCardResponsePayload,
  parseAuthChallengePayload,
  parseBondChallengePayload,
  parseBondChallengeResponsePayload,
  parseBondRequestPayload,
  parseChatMessagePayload,
  parseDiscoveryRequestPayload,
  parseDiscoveryResponsePayload,
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
} from "../src/index.js";

describe("protocol", () => {
  it("roundtrips knowledge.query payload", () => {
    const payload = createKnowledgeQueryPayload({
      query: "What is in the shared vault?",
      requestedSensitivity: "public",
    });
    expect(parseKnowledgeQueryPayload(payload)).toEqual(payload);
  });

  it("roundtrips bond payloads", () => {
    const request = createBondRequestPayload({
      requesterOwnerId: "envoy:owner:alice",
      message: "Hello",
      proofOfContext: "Work",
      requestedLevel: "referred",
    });
    expect(parseBondRequestPayload(request)).toEqual(request);

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

    expect(() =>
      createUnsignedEnvelope({
        senderPeerId: "peer-a",
        senderPublicKey: "public-key",
        senderRole: "agent",
        recipientPeerId: "peer-b",
        recipientRole: "human",
        intent: "chat.message",
        payload: {
          senderOwnerId: "envoy:owner:a",
          text: "hello",
        },
      }),
    ).toThrow(/chat\.message requires senderRole=human/);
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
      capabilities: ["knowledge.query", "task.negotiate", "find.books"],
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
      capabilities: ["find.books"],
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
