"""Patch index.ts: replace the bond.* block with a runtime delegation.

The bond.* block (lines 2413-2563 in the current file) is a ~150-line
if statement. We replace it with a single call to
`handleCliBondIntentViaRuntime`. The runtime handles:
  - the inner handleInboundBondIntent call
  - both callbacks (helloData + bondData)
  - the rejection audit
  - the auto-accept flow (when bond.bondAcceptToRequester is set)
"""
from pathlib import Path

FILE = Path("apps/node/src/index.ts")
c = FILE.read_text()

if "handleCliBondIntentViaRuntime" in c:
    print("already wired")
    raise SystemExit(0)

# Add the import. Anchor: the line that closes the @envoymesh/protocol
# multi-line import.
anchor = '} from "@envoymesh/protocol";'
if anchor not in c:
    raise SystemExit("could not find @envoymesh/protocol import-anchor line")
new_import = (
    anchor
    + '\nimport { handleCliBondIntentViaRuntime } from "./cli-mesh-inbound-bond.js";'
)
c = c.replace(anchor, new_import, 1)
print("import added")

# Replace the bond.* block. The original is the if-statement from
# `if (envelope.intent === "bond.request" || ...)` through the
# final `return;` that closes it.
old_block = """  if (
    envelope.intent === "bond.request" ||
    envelope.intent === "bond.accept" ||
    envelope.intent === "bond.challenge" ||
    envelope.intent === "bond.challenge.response"
  ) {
    console.log(`[inbound] bond intent: ${envelope.intent} from=${remotePeerId}, messageId=${envelope.messageId}`);
    console.log(`[inbound] calling handleInboundBondIntent for ${envelope.intent}...`);
    const bond = await handleInboundBondIntent(
      {
        envelope,
        profile,
        remotePeerId,
        receivedAt,
        correlationId,
        taskStore,
        trustStore,
      },
      (helloData) => {
        // Store pending request in nodeService so acceptHello() can find it later
        nodeService.storePendingHelloRequest(helloData);
        // Emit hello:request via wsServer if available
        if (wsServerForEvents) {
          wsServerForEvents.emitEvent("hello:request", helloData);
        }
      },
      async (bondData) => {
        // Emit bond:established via wsServer if available
        console.log(`[bond:established callback] intent=${envelope.intent}, emitting bond:established for peerOwnerId=${bondData.peerOwnerId}`);
        if (wsServerForEvents) {
          console.log(`[bond:established callback] calling wsServer.emitEvent with peerOwnerId=${bondData.peerOwnerId}`);
          wsServerForEvents.emitEvent("bond:established", bondData);
        } else {
          console.log(`[bond:established callback] wsServerForEvents is null!`);
        }
        // Persist counterparty ownerId ↔ libp2p peerId for every bond event (new or refresh).
        if (envelope.intent === "bond.request") {
          try {
            const { parseBondRequestPayload } = await import("@envoymesh/protocol");
            const payload = parseBondRequestPayload(envelope.payload);
            await peerDirectoryStore.ensurePeerFromInboundChat({
              ownerId: payload.requesterOwnerId,
              peerId: remotePeerId,
              listenAddrs: dialableInboundRemoteAddrs(remoteAddr, remotePeerId),
            });
          } catch (err) {
            console.error(`[bond:established] failed to store peer in directory:`, err);
          }
        } else if (envelope.intent === "bond.accept") {
          try {
            const { parseBondAcceptPayload } = await import("@envoymesh/protocol");
            const payload = parseBondAcceptPayload(envelope.payload);
            await peerDirectoryStore.ensurePeerFromInboundChat({
              ownerId: payload.responderOwnerId,
              peerId: remotePeerId,
              listenAddrs: dialableInboundRemoteAddrs(remoteAddr, remotePeerId),
            });
          } catch (err) {
            console.error(`[bond:established] failed to store peer from bond.accept:`, err);
          }
        }
        // Phase 33 — auto-fetch the peer's agent card on bond establishment. Fire-and-forget
        // so the bond handler doesn't block on slow peers; the inbound agent-card-inbound
        // handler caches the response on arrival.
        void agentCardAutoFetcher
          .onBondEstablished({ peerOwnerId: bondData.peerOwnerId, remotePeerId })
          .catch((err) =>
            console.warn(`[bond:established] auto-fetch agent card failed:`, err),
          );
        void mesh.tagContactForPersistentReachability(remotePeerId).catch((err) =>
          console.warn(`[reachability] bond tag failed:`, err),
        );
      },
    );
    if (!bond.ok) {
      void taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.rejected",
          intent: envelope.intent,
          messageId: envelope.messageId,
          correlationId,
          remotePeerId,
          direction: "inbound",
          verificationStatus: "rejected",
          latencyMs: Date.now() - receivedAt,
          outcome: "deny",
          summary: `Rejected bond message: ${bond.reason}.`,
          createdAt: envelope.createdAt,
        }),
      );
      console.warn(`[rejected bond] ${envelope.intent}: ${bond.reason}`);
      return;
    }

    if (bond.ok && bond.bondAcceptToRequester) {
      const { requesterPeerId, requesterOwnerId } = bond.bondAcceptToRequester;
      const humanProfile = await humanProfileStore.loadHumanProfile();
      const displayName = humanProfile?.displayName ?? profile.owner.ownerId;
      const unsignedAccept = createUnsignedEnvelope({
        senderPeerId: derivePeerId(profile.device.publicKeyPem),
        senderPublicKey: profile.device.publicKeyPem,
        recipientPeerId: requesterPeerId,
        intent: "bond.accept",
        payload: createBondAcceptPayload({
          responderOwnerId: profile.owner.ownerId,
          requesterOwnerId,
          message: `Hello from ${displayName}!`,
        }),
        correlationId,
      });
      const signedAccept = signUnsignedEnvelope(unsignedAccept, profile.device.privateKeyPem);
      const requesterDir = await peerDirectoryStore.getPeerByOwnerId(requesterOwnerId);
      try {
        const dialHints = await buildOutboundDialHints({
          recipientPeerId: requesterPeerId,
          peerListenAddrs: requesterDir?.listenAddrs,
          discoverySeedStore,
          config: undefined,
          localListenAddrs: mesh.multiaddrs,
        });
        await deliverOutboundEnvelope(mesh, requesterPeerId, signedAccept, { dialHints });
        void taskStore.appendAuditEvent(
          createAuditEvent({
            type: "message.sent",
            intent: signedAccept.intent,
            messageId: signedAccept.messageId,
            correlationId: signedAccept.correlationId,
            remotePeerId: requesterPeerId,
            direction: "outbound",
            protocol: ENVOY_MESSAGE_PROTOCOL,
            outcome: "record",
            summary: "Sent bond.accept to requester after auto-accept.",
            createdAt: signedAccept.createdAt,
          }),
        );
        void mesh.tagContactForPersistentReachability(requesterPeerId).catch((err) =>
          console.warn(`[reachability] auto bond.accept tag failed:`, err),
        );
      } catch (err) {
        console.error(
          `[bond.request] auto-accept: failed to send bond.accept to requester ${requesterPeerId}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    return;
  }"""

new_block = """  if (
    envelope.intent === "bond.request" ||
    envelope.intent === "bond.accept" ||
    envelope.intent === "bond.challenge" ||
    envelope.intent === "bond.challenge.response"
  ) {
    await handleCliBondIntentViaRuntime(
      {
        wsServerForEvents,
        getTaskStore: () => taskStore,
        getProfile: () => profile,
        getMesh: () => mesh,
        getProfileForAutoAccept: () => profile,
        getHumanProfileStore: () => humanProfileStore,
        getPeerDirectoryStore: () => peerDirectoryStore,
        getDiscoverySeedStore: () => discoverySeedStore,
        buildOutboundDialHints,
        deliverOutboundEnvelope,
        signUnsignedEnvelope,
        createBondAcceptPayload,
        createUnsignedEnvelope,
        derivePeerId,
        storePendingHelloRequest: (data) =>
          nodeService.storePendingHelloRequest(data),
        emit: (event, payload) => {
          // The runtime already routes via its own `emit`. The CLI
          // additionally pushes to wsServer for the Social UI.
          if (wsServerForEvents) {
            wsServerForEvents.emitEvent(event, payload);
          }
        },
        // The bond.* arm does not flush room state; the embedded
        // path's runtime accepts undefined for these hooks.
        ensurePeerFromInboundChat: (input) =>
          peerDirectoryStore.ensurePeerFromInboundChat(input),
        tagBondedContactReachability: (peerId) =>
          mesh.tagContactForPersistentReachability(peerId),
      },
      {
        envelope: {
          messageId: envelope.messageId,
          intent: envelope.intent,
          createdAt: envelope.createdAt,
          senderPeerId: envelope.senderPeerId,
          payload: envelope.payload,
        },
        remotePeerId,
        remoteAddr,
        receivedAt,
        correlationId: correlationId ?? "cli-correlation",
      },
    );
    return;
  }"""

if old_block not in c:
    raise SystemExit("could not find bond.* block")
c = c.replace(old_block, new_block, 1)
print("bond.* block replaced")

FILE.write_text(c)
print("index.ts updated")