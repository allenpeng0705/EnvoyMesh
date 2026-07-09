(() => {
  const O = window.WebSocket;
  window.__sentRpcs = [];
  window.__receivedEvents = [];
  const incomingListeners = new Set();
  const dispatchIncoming = (data) => {
    window.__receivedEvents.push(data);
    const ev = new MessageEvent("message", { data });
    if (typeof window.__m === "function") window.__m(ev);
    for (const l of incomingListeners) l(ev);
  };
  // Pre-seed localStorage so first-run setup wizard AND the auto-opened
  // Getting Started guide modal are skipped -- the chat view is what we want
  // to exercise in the chromium E2E tests. The React app reads
  // envoymesh.setupComplete on mount via App.tsx/needsFirstRunSetup; the
  // guide is keyed per-ownerId in envoymesh.guideSeen:<ownerId>. Setting
  // both before the bundle loads prevents modals from intercepting pointer
  // events in click-driven tests.
  try {
    localStorage.setItem("envoymesh.setupComplete", JSON.stringify({ ownerId: "envoy:owner:test", completedAt: "2025-01-01T00:00:00.000Z" }));
    localStorage.setItem("envoymesh.guideSeen:envoy:owner:test", "1");
  } catch (_) { /* private mode etc -- non-fatal */ }
  // Sensible defaults for every RPC the React tree fires during initial
  // hydration. Without these, downstream data.map() calls blow up with
  // "null is not iterable" because the mock returned null for unknown methods.
  // Use shapes that mirror the production WsServer payloads (see
  // @envoymesh/api for the canonical definitions).
  const TEST_PEER_ID = "12D3KooTest12NodeService";
  const TEST_OWNER_ID = "envoy:owner:test";
  const methodSmartResponse = (method) => {
    // Identity / profile -- getProfile returns NodeProfile (with nested owner),
    // getHumanProfile returns HumanProfile (flat). The chat:message routing in
    // useNodeService.tsx reads prof.owner.ownerId for self-id; without the
    // nested shape, self.ownerId stays empty and inbound messages queue
    // forever in pendingUntilSelfReady without ever landing in threads.
    if (method === "getProfile") return {
      owner: { ownerId: TEST_OWNER_ID, publicKeyPem: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----" },
      device: { deviceId: "12D3KooTestDevice", publicKeyPem: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----" },
      deviceCertificate: { deviceId: "12D3KooTestDevice", ownerId: TEST_OWNER_ID, publicKeyPem: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----" },
    };
    if (method === "human.getProfile" || method === "getHumanProfile") return { ownerId: TEST_OWNER_ID, displayName: "Test User", username: "test", bio: "", avatar: null };
    if (method === "getOwnerDidPresentation") return null;
    // Bonds / social -- these return arrays directly (per server contract in
    // node-service-impl.ts: getBonds(): BondRecord[], listPendingShareOffers(): ShareOffer[],
    // listAgentShareProposals(): AgentShareProposal[], listPendingSocialIntroProposals(): SocialIntroProposal[]).
    // Earlier mock returned a wrapped object which tripped downstream all.filter and
    // bonds.map calls in the React tree. We seed one test bond (Alice) so the chat
    // sidebar renders at least one contact row, which is what the chat-message
    // tests assert against.
    if (method === "node.listBonds" || method === "listBonds" || method === "getBonds") {
      return [{
        peerOwnerId: "envoy:owner:alice",
        peerPeerId: "12D3KooAliceTestPeer",
        displayName: "Alice",
        level: "direct",
        establishedAt: new Date(Date.now() - 86400000).toISOString(),
        lastSeenAt: new Date().toISOString(),
      }];
    }
    if (method === "listPendingShareOffers") return [];
    if (method === "listAgentShareProposals") return [];
    if (method === "listPendingSocialIntroProposals") return [];
    if (method === "listPendingHelloRequests") return [];
    // Seed two chat rooms so the group-chat tests have a sidebar target to
    // render previews against. The keys below match the roomIds the tests
    // use when injecting chat:room-message events.
    if (method === "listChatRooms") return [
      // The mock seed uses bare roomIds ("test" / "team") because
      // chatRoomThreadKey(roomId) prefixes "room:" internally. Tests that
      // inject chat:room-message should likewise use the bare roomId in
      // recipient.ownerId; the roomThreadKey helper will then compute the
      // matching "room:test" thread key on both sides.
      { roomId: "test", title: "Test Room", createdAt: new Date(Date.now() - 86400000).toISOString(), participantOwnerIds: [TEST_OWNER_ID, "envoy:owner:alice"] },
      { roomId: "team", title: "Team Room", createdAt: new Date(Date.now() - 86400000).toISOString(), participantOwnerIds: [TEST_OWNER_ID, "envoy:owner:alice", "envoy:owner:bob", "envoy:owner:carol"] },
    ];
    if (method === "listChatHistory") return [];
    // Node lifecycle
    if (method === "node.getStatus" || method === "getNodeStatus") return { status: "running", peerId: TEST_PEER_ID, meshConnected: true, transportHealthy: true };
    if (method === "node.getConfig" || method === "getNodeConfig") return { nodeUrl: "ws://test", port: 5401, profile: "primary", discoveryProfile: "lan+dht", nodeInitialized: true, bootstrapPresets: [], iceServers: [], openclawEnabled: false, bridgeEnabled: false, chatAssistEnabled: true, autoChatReplyEnabled: false, autonomousKillSwitch: false };
    if (method === "node.getConnectionStatus" || method === "getConnectionStatus") return { online: true, peerId: TEST_PEER_ID, connectedRelays: [], listeningAddrs: [], transportHealthy: true, dhtHealthy: true };
    if (method === "bridge.getStatus" || method === "getBridgeStatus") return { enabled: false, agentPeerId: null, agentName: null, typing: false };
    if (method === "getPairedDiagnostics") return null;
    // Diagnostics / chains
    if (method === "chain.listState" || method === "listChains") return { chains: [] };
    if (method === "chat.listThreads" || method === "listChatThreads") return { threads: [] };
    if (method === "library.listItems") return { items: [] };
    if (method === "discover.listPeers") return { peers: [] };
    // Default: empty-object (defensive -- never null which trips .map())
    return {};
  };
  // Don't extend the real WebSocket -- its constructor enforces a required
  // URL argument and prevents construction with no args (which the React app
  // does when it probes a default URL). Extend EventTarget directly and
  // synthesize the WebSocket surface properties.
  class M extends EventTarget {
    constructor(u) {
      super();
      this.url = u || "ws://test-mock/";
      this.readyState = 0; // CONNECTING initially
      this.CONNECTING = 0; this.OPEN = 1; this.CLOSING = 2; this.CLOSED = 3;
      this.binaryType = "arraybuffer";
      this.extensions = "";
      this.protocol = "";
      this.bufferedAmount = 0;
      window.__wsCount = (window.__wsCount || 0) + 1;
      setTimeout(() => {
        this.readyState = 1;
        window.__wsReadyState = this.readyState;
        this.dispatchEvent(new Event("open"));
        // Surface a connected state so the UI exits the "Connecting" overlay.
        setTimeout(() => {
          dispatchIncoming(JSON.stringify({ event: "node:status", data: { status: "running", peerId: TEST_PEER_ID } }));
          dispatchIncoming(JSON.stringify({ event: "node:online", data: { peerId: TEST_PEER_ID, meshConnected: true } }));
        }, 5);
      }, 0);
    }
    set onmessage(fn) { window.__m = fn ? (e) => fn(e instanceof MessageEvent ? e : { data: e?.data }) : null; }
    get onmessage() { return null; }
    set onopen(fn) { this.addEventListener("open", fn); }
    set onclose(fn) { this.addEventListener("close", fn); }
    set onerror(fn) { this.addEventListener("error", fn); }
    addEventListener(t, fn) {
      if (t === "message") incomingListeners.add((e) => fn(e instanceof MessageEvent ? e : { data: e?.data }));
      else super.addEventListener(t, fn);
    }
    removeEventListener(t, fn) {
      if (t === "message") {
        for (const l of incomingListeners) if (l.name === fn?.name) incomingListeners.delete(l);
      } else super.removeEventListener(t, fn);
    }
    send(payload) {
      window.__sentRpcs.push(payload);
      // Respond to JSON-RPC requests the React app sends on connect.
      try {
        const req = JSON.parse(payload);
        if (req && req.id && req.method && Object.prototype.hasOwnProperty.call(req, "method")) {
          const result = methodSmartResponse(req.method);
          dispatchIncoming(JSON.stringify({ id: req.id, result, ok: true }));
        }
      } catch (_) { /* not JSON-RPC, ignore */ }
    }
    close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
  }
  // CRITICAL: WsClient.isConnected() compares readyState === WebSocket.OPEN.
  // Without these static constants, isConnected() always returns false, which
  // causes NodeServiceProvider to flip connected back to false right after
  // connectCb(true) -- leaving the React tree stuck on the "Connecting..." splash
  // and never firing the initial RPC burst.
  M.OPEN = 1; M.CONNECTING = 0; M.CLOSING = 2; M.CLOSED = 3;
  window.WebSocket = M;
  // Expose the dispatcher to the test harness so it can inject arbitrary
  // events from outside the page. Tests call window.__dispatch(JSON.stringify(ev)).
  window.__dispatch = dispatchIncoming;
  window.__wsMockInstalled = true;
  console.log("[ws-mock] installed");
})();