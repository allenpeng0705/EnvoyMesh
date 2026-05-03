import type {
  BondRecord,
  ConnectionStatus,
  CreateHumanProfileInput,
  HelloProfile,
  HelloRequest,
  HelloResponse,
  HumanProfile,
  NodeConfig,
  NodeProfile,
  NodeService,
  NodeServiceEvents,
  PeerSearchResult,
  RelayConfig,
  SearchQuery,
} from "@envoymesh/api";
import type { NodeStatus, InitNodeOptions, NodeInitResult } from "@envoymesh/api";

import {
  createChatMessagePayload,
  createHumanProfilePayload,
  createUnsignedEnvelope,
  parseChatMessagePayload,
  createRendezvousRegisterPayload,
  createRendezvousQueryPayload,
  RendezvousResponsePayloadSchema,
  type HumanProfilePayload,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import { derivePeerId, signHumanProfile, signUnsignedEnvelope } from "@envoymesh/identity";
import {
  createLocalTaskStore,
  createLocalTrustStore,
  createLocalPeerDirectoryStore,
  createHumanProfileStore,
  createTaskRuntimeStateStore,
  createRelayStateStore,
  loadOrCreateNodeProfile,
  type LocalTaskStore,
  type LocalTrustStore,
  type LocalPeerDirectoryStore,
  type HumanProfileStore,
  type TaskRuntimeStateStore,
  type RelayStateStore,
} from "@envoymesh/local-store";
import { createNodeConfigStore, createStubNodeConfigStore, type PersistedNodeConfig } from "./node-config-store.js";
import { createDiscoverySeedStore, type DiscoverySeedStore } from "./discovery-seed-store.js";
import { resolveBootstrapAddresses, looksLikeDomain } from "./bootstrap-resolver.js";
import { createInboundMessageGuard, type InboundMessageGuard } from "./inbound-guard.js";
import { createTaskDispatcher } from "./task-dispatcher.js";
import {
  EnvoyMesh,
  DEFAULT_LIBP2P_PRIVATE_KEY_BASENAME,
  type EnvoyMeshOptions,
} from "@envoymesh/network";
import { join } from "node:path";

/**
 * NodeServiceImpl implements the NodeService interface.
 *
 * Supports two modes:
 * 1. Traditional (mesh pre-created by index.ts): mesh is passed in constructor
 * 2. Envoy-managed: Envoy calls initNode/startNode/stopNode to manage lifecycle
 */
class NodeServiceImpl implements NodeService {
  private _mesh: EnvoyMesh | undefined;
  private _profile: NodeProfile | undefined;
  private readonly _trustStore: LocalTrustStore;
  private readonly _peerDirectoryStore: LocalPeerDirectoryStore;
  private readonly _humanProfileStore: HumanProfileStore;
  private readonly _configStore: ReturnType<typeof createNodeConfigStore>;
  private readonly _profileDir: string;

  // App-managed mode stores
  private _taskStore: LocalTaskStore | undefined;
  private _relayStateStore: RelayStateStore | undefined;
  private _discoverySeedStore: DiscoverySeedStore | undefined;
  private _taskRuntimeStore: TaskRuntimeStateStore | undefined;
  private _inboundGuard: InboundMessageGuard | undefined;
  private _taskDispatcher: ReturnType<typeof createTaskDispatcher> | undefined;

  private _nodeStatus: NodeStatus = "offline";

  // Event listeners - stored for later emission
  private readonly listeners = new Map<keyof NodeServiceEvents, Set<(...args: any[]) => void>>();

  constructor(
    mesh: EnvoyMesh | undefined,
    trustStore: LocalTrustStore,
    peerDirectoryStore: LocalPeerDirectoryStore,
    humanProfileStore: HumanProfileStore,
    profileDir: string | undefined,
    profile?: NodeProfile,
  ) {
    this._mesh = mesh;
    this._trustStore = trustStore;
    this._peerDirectoryStore = peerDirectoryStore;
    this._humanProfileStore = humanProfileStore;
    this._profileDir = profileDir ?? "/tmp/unknown";
    this._configStore = profileDir ? createNodeConfigStore(profileDir) : createStubNodeConfigStore();
    if (mesh) {
      this._nodeStatus = "running";
      this._profile = profile;
    }
  }

  // ============================================
  // Internal helpers
  // ============================================

  private _requireMesh(): EnvoyMesh {
    if (!this._mesh) {
      throw new Error("Node is not running. Call startNode() first.");
    }
    return this._mesh;
  }

  private _requireProfile(): NodeProfile {
    if (!this._profile) {
      throw new Error("Node is not initialized. Call initNode() first.");
    }
    return this._profile;
  }

  private _assertOnline(): void {
    if (this._nodeStatus !== "running") {
      throw new Error(`Node is ${this._nodeStatus}. Start the node first.`);
    }
  }

  // ============================================
  // Identity
  // ============================================

  getProfile(): NodeProfile {
    return this._requireProfile();
  }

  async getHumanProfile(): Promise<HumanProfile | undefined> {
    const profile = await this._humanProfileStore.loadHumanProfile();
    return profile as HumanProfile | undefined;
  }

  async updateHumanProfile(input: CreateHumanProfileInput): Promise<HumanProfile> {
    this._assertOnline();
    const selfProfile = this._requireProfile();

    // Validate required fields
    if (!input.displayName || !input.displayName.trim()) {
      throw new Error("displayName is required");
    }
    if (!input.username || !/^[a-zA-Z0-9_]{3,30}$/.test(input.username)) {
      throw new Error("username must be 3-30 characters, letters, numbers, underscore only");
    }

    // Load existing profile
    const existing = await this._humanProfileStore.loadHumanProfile();

    // Merge updates
    const updatedPayload: Omit<HumanProfilePayload, "signature"> = {
      version: "0.1",
      ownerId: selfProfile.owner.ownerId,
      displayName: input.displayName.trim(),
      username: input.username.trim(),
      bio: input.bio ?? existing?.bio,
      gender: input.gender ?? existing?.gender,
      hobbies: input.hobbies ?? existing?.hobbies,
      knowledge: input.knowledge ?? existing?.knowledge,
      profileVisibility: input.profileVisibility ?? existing?.profileVisibility ?? "private",
      capabilities: input.capabilities ?? existing?.capabilities,
      updatedAt: new Date().toISOString(),
    };

    // Sign the profile
    const signedProfile = signHumanProfile(updatedPayload, selfProfile.device.privateKeyPem);

    // Save
    await this._humanProfileStore.saveHumanProfile(signedProfile);

    // Handle DHT advertising based on visibility (run in background with timeout)
    const config = await this._configStore.load();
    const isPublicNetwork = config?.bootstrapPresets && config.bootstrapPresets.length > 0;
    const interests = [...(updatedPayload.hobbies ?? []), ...(updatedPayload.knowledge ?? [])];
    const username = updatedPayload.username;

    // If profile is public AND we're on public network, advertise interests as DHT topics
    // Run DHT operations in background to avoid blocking the response
    console.log(`[node-service] Checking DHT advertising: visibility=${updatedPayload.profileVisibility}, isPublicNetwork=${isPublicNetwork}, interests=${JSON.stringify(interests)}`);
    if (updatedPayload.profileVisibility === "public" && isPublicNetwork) {
      void this._advertiseInterests(interests, username);
    }

    return signedProfile as HumanProfile;
  }

  /**
   * Advertise interests and username as DHT topics for peer discovery
   */
  private async _advertiseInterests(interests: string[], username: string): Promise<void> {
    // Helper to run with timeout - DHT operations can take up to 30s on public network
    const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
      return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`DHT operation "${label}" timed out after ${ms}ms`)), ms)
        ),
      ]);
    };

    const advertisedTopics: string[] = [];
    let allSuccess = true;

    for (const interest of interests) {
      try {
        await withTimeout(
          this._mesh!.provideCapabilityTopic(interest.toLowerCase()),
          30000, // 30 seconds - DHT operations on public network can be slow
          interest
        );
        console.log(`[node-service] Advertised topic: ${interest.toLowerCase()}`);
        advertisedTopics.push(interest.toLowerCase());
      } catch (err) {
        console.warn(`[node-service] Failed to advertise topic ${interest}:`, err);
        allSuccess = false;
      }
    }

    // Advertise username as a special DHT topic for username-based discovery
    try {
      await withTimeout(
        this._mesh!.provideCapabilityTopic(`username:${username.toLowerCase()}`),
        30000, // 30 seconds
        `username:${username}`
      );
      console.log(`[node-service] Advertised username: ${username.toLowerCase()}`);
      advertisedTopics.push(`username:${username.toLowerCase()}`);
    } catch (err) {
      console.warn(`[node-service] Failed to advertise username ${username}:`, err);
      allSuccess = false;
    }

    // Emit event with results
    this.emit("discovery:advertising-complete", { topics: advertisedTopics, success: allSuccess });
  }

  /**
   * Re-advertise interests on DHT and rendezvous servers (called on node start/restart)
   */
  private async _advertiseInterestsIfPublic(): Promise<void> {
    const config = await this._configStore.load();
    const profile = await this._humanProfileStore.loadHumanProfile();
    if (!config || !profile) return;

    const isPublicNetwork = config.bootstrapPresets && config.bootstrapPresets.length > 0;
    if (profile.profileVisibility === "public" && isPublicNetwork) {
      const interests = [...(profile.hobbies ?? []), ...(profile.knowledge ?? [])];

      // Advertise on DHT
      await this._advertiseInterests(interests, profile.username);

      // Also register with rendezvous servers if configured
      if (config.configuredRelays && config.configuredRelays.length > 0) {
        void this._registerWithRendezvousServers(interests, profile.username);
      }
    }
  }

  /**
   * Register our capabilities with configured rendezvous servers
   */
  private async _registerWithRendezvousServers(interests: string[], username: string): Promise<void> {
    const config = await this._configStore.load();
    if (!config?.configuredRelays || config.configuredRelays.length === 0) return;

    const mesh = this._requireMesh();
    const selfProfile = this._requireProfile();

    // Build capabilities list from interests (as tags)
    const capabilities = interests.map(interest => ({ tag: interest.toLowerCase() }));
    // Also add username as a special capability
    capabilities.push({ tag: `username:${username.toLowerCase()}` });

    for (const relay of config.configuredRelays) {
      if (!relay.enabled) continue;

      try {
        console.log(`[node-service] Registering with rendezvous server: ${relay.addr}`);

        const envelope = signUnsignedEnvelope(
          createUnsignedEnvelope({
            senderPeerId: mesh.peerId,
            senderPublicKey: selfProfile.device.publicKeyPem,
            recipientPeerId: relay.addr, // Will be resolved by relay
            intent: "rendezvous.register",
            payload: createRendezvousRegisterPayload({
              peerId: mesh.peerId,
              multiaddr: mesh.multiaddrs[0] ?? `/p2p/${mesh.peerId}`,
              capabilities,
              ttlSeconds: 3600,
            }),
          }),
          selfProfile.device.privateKeyPem,
        );

        // Send to relay and wait for response
        const response = await mesh.sendExpectReply(relay.addr, envelope, { timeoutMs: 10000 });
        console.log(`[node-service] Rendezvous registration response for ${relay.addr}:`, response);
      } catch (err) {
        console.warn(`[node-service] Failed to register with rendezvous server ${relay.addr}:`, err);
      }
    }
  }

  // ============================================
  // Bond Management
  // ============================================

  async sendHello(targetOwnerId: string, profile: HelloProfile, message: string): Promise<HelloResponse> {
    this._assertOnline();
    const mesh = this._requireMesh();
    const selfProfile = this._requireProfile();

    // Find the target peer's peerId - first check peer directory, then try direct peerId
    const peerRecords = await this._peerDirectoryStore.listPeerRecords();
    let targetPeerId = peerRecords.find((r) => r.ownerId === targetOwnerId)?.peerId;

    // If not found in peer directory, maybe targetOwnerId IS a peerId (for DHT discovered peers)
    if (!targetPeerId) {
      // Check if it looks like a valid peerId
      if (targetOwnerId.startsWith("Qm") || targetOwnerId.startsWith("12D3")) {
        targetPeerId = targetOwnerId;
        console.log(`[node-service] Sending hello to DHT-discovered peer: ${targetPeerId}`);
      } else {
        throw new Error(`Peer not found for owner: ${targetOwnerId}`);
      }
    }

    console.log(`[node-service] sendHello to ${targetPeerId} (message: ${message})`);

    const messageId = `hello_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Send a bond.request via mesh
    const { createBondRequestPayload } = await import("@envoymesh/protocol");
    const envelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: derivePeerId(selfProfile.device.publicKeyPem),
        senderPublicKey: selfProfile.device.publicKeyPem,
        recipientPeerId: targetPeerId,
        intent: "bond.request",
        payload: createBondRequestPayload({
          requesterOwnerId: selfProfile.owner.ownerId,
          requesterDisplayName: profile.displayName,
          message: `[HELLO] ${message}`,
          proofOfContext: `displayName:${profile.displayName}`,
          requestedLevel: "direct",
        }),
      }),
      selfProfile.device.privateKeyPem,
    );

    try {
      await mesh.send(targetPeerId, envelope);
      console.log(`[node-service] Hello sent successfully to ${targetPeerId}`);

      // Store peer info locally so we can send messages later
      // This is needed because the receiver doesn't send back a bond confirmation
      const existingTarget = await this._peerDirectoryStore.getPeerByOwnerId(targetOwnerId);
      if (!existingTarget) {
        await this._peerDirectoryStore.upsertPeerFromSignal({
          peerId: targetPeerId,
          payload: {
            type: "bond.request.sent",
            version: "1.0",
            ownerId: targetOwnerId,
            deviceId: "unknown",
            deviceCertificate: { devicePublicKeyPem: "" },
            listenAddrs: [],
          } as any,
        });
      }
    } catch (err) {
      console.error(`[node-service] Failed to send hello to ${targetPeerId}:`, err);
      // Provide a more helpful error message
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes("getComponents") || errorMsg.includes("connection failed") || errorMsg.includes("timeout")) {
        throw new Error(`Cannot reach peer ${targetPeerId.slice(0, 12)}... - peer may be behind NAT/firewall. Try configuring a relay server.`);
      }
      throw new Error(`Failed to send hello: ${errorMsg}`);
    }

    return {
      messageId,
      inReplyTo: "",
      decision: "accept", // Optimistic - actual response comes async via mesh
      timestamp: new Date().toISOString(),
    };
  }

  async acceptHello(_messageId: string): Promise<void> {
    // In the current protocol, bond.request is auto-accepted/denied based on policy.
    // This method is a no-op stub. In a future protocol version with explicit accept/decline,
    // this would be called after the user approves the hello request.
  }

  async declineHello(_messageId: string, reason?: string): Promise<void> {
    // In the current protocol, bond.request is auto-accepted/denied based on policy.
    // This method is a no-op stub. In a future protocol version with explicit accept/decline,
    // this would send a bond.response to reject the request.
    console.log(`[node-service] declineHello called (stub): ${reason ?? "no reason"}`);
  }

  async blockPeer(peerOwnerId: string): Promise<void> {
    await this._trustStore.setTrustRecord({
      peerOwnerId,
      level: "blocked",
      now: new Date().toISOString(),
    });
  }

  async unblockPeer(peerOwnerId: string): Promise<void> {
    // Unblocking restores the peer to "public" level (no bond) rather than creating a new bond
    // If a bond exists, update it; otherwise do nothing (no automatic bonding)
    const existing = await this._trustStore.getTrustRecord(peerOwnerId);
    if (existing) {
      await this._trustStore.setTrustRecord({
        peerOwnerId,
        level: existing.level === "blocked" ? "public" : existing.level,
        now: new Date().toISOString(),
      });
    }
  }

  async revokeBond(peerOwnerId: string): Promise<void> {
    await this._trustStore.removeTrustRecord(peerOwnerId);
    this.emit("bond:revoked", { peerOwnerId });
  }

  async getBonds(): Promise<BondRecord[]> {
    const trustRecords = await this._trustStore.listTrustRecords();
    return trustRecords.map((record) => ({
      peerOwnerId: record.peerOwnerId,
      displayName: record.displayName,
      level: record.level,
      createdAt: record.createdAt,
      note: record.note,
    }));
  }

  // ============================================
  // Messaging
  // ============================================

  async sendChat(targetOwnerId: string, text: string): Promise<void> {
    this._assertOnline();
    const mesh = this._requireMesh();
    const selfProfile = this._requireProfile();

    console.log(`[sendChat] targetOwnerId=${targetOwnerId}, text=${text}`);

    // Look up peer's peerId by ownerId
    const peerRecords = await this._peerDirectoryStore.listPeerRecords();
    console.log(`[sendChat] peerRecords count=${peerRecords.length}`, peerRecords.map(r => r.ownerId));
    const targetPeer = peerRecords.find((r) => r.ownerId === targetOwnerId);

    if (!targetPeer) {
      throw new Error(`Peer not found for owner: ${targetOwnerId}`);
    }

    const recipientPeerId = targetPeer.peerId;
    console.log(`[sendChat] sending to recipientPeerId=${recipientPeerId}`);
    const envelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: derivePeerId(selfProfile.device.publicKeyPem),
        senderPublicKey: selfProfile.device.publicKeyPem,
        recipientPeerId: recipientPeerId,
        intent: "chat.message",
        payload: createChatMessagePayload({
          senderOwnerId: selfProfile.owner.ownerId,
          text,
        }),
      }),
      selfProfile.device.privateKeyPem,
    );

    await mesh.sendChat(recipientPeerId, envelope);

    const emittedMsg = {
      messageId: envelope.messageId,
      sender: {
        nodeId: mesh.peerId,
        ownerId: selfProfile.owner.ownerId,
        displayName: selfProfile.owner.ownerId,
      },
      recipient: {
        nodeId: recipientPeerId,
        ownerId: targetOwnerId,
        displayName: targetOwnerId,
      },
      content: {
        text,
      },
      metadata: {
        timestamp: envelope.createdAt,
        deliveryReceipt: "sent" as const,
      },
      signature: envelope.signature,
    };
    console.log(`[sendChat] Emitting chat:message locally:`, emittedMsg);
    this.emit("chat:message", emittedMsg);
  }

  async markRead(_targetOwnerId: string, _upToMessageId?: string): Promise<void> {
    // Future: send read receipts
  }

  // ============================================
  // Search / Discovery
  // ============================================

  async searchPeers(query: SearchQuery): Promise<PeerSearchResult[]> {
    const maxResults = query.maxResults ?? 20;

    // 1. Direct peer ID lookup via DHT (if peerId is specified)
    if (query.peerId) {
      return this.searchByPeerId(query.peerId, maxResults);
    }

    // 2. Determine search mode based on network configuration
    const config = await this._configStore.load();
    const isPublicNetwork = config?.bootstrapPresets && config.bootstrapPresets.length > 0;
    const isPrivateRelay = config?.relayEnabled && config?.configuredRelays && config.configuredRelays.length > 0;

    const results: PeerSearchResult[] = [];

    // 3. Username-based discovery: search DHT for username:xxx topic
    if (isPublicNetwork && query.username) {
      const usernameResults = await this.searchByTopic(`username:${query.username.toLowerCase()}`, maxResults);
      for (const r of usernameResults) {
        if (!results.some((existing) => existing.nodeId === r.nodeId)) {
          results.push({ ...r, username: query.username });
        }
      }
    }

    // 4. Public libp2p network: search by interest as DHT topic
    if (isPublicNetwork && query.interests && query.interests.length > 0) {
      for (const interest of query.interests) {
        const topicResults = await this.searchByTopic(interest.toLowerCase(), maxResults);
        for (const r of topicResults) {
          if (!results.some((existing) => existing.nodeId === r.nodeId)) {
            results.push(r);
          }
        }
      }
    }

    // 5. Hybrid mode by default when public network is enabled: also search locally for better discovery
    // Even without configured relays, local search helps find peers that haven't advertised yet
    if (isPublicNetwork && query.interests && query.interests.length > 0) {
      const localResults = await this.searchLocalPeers(query, maxResults);
      for (const r of localResults) {
        if (!results.some((existing) => existing.nodeId === r.nodeId)) {
          results.push(r);
        }
      }
    }

    // 6. Private relay network: search via rendezvous servers
    if (isPrivateRelay && query.interests && query.interests.length > 0) {
      const rendezvousResults = await this.searchByRendezvous(query.interests);
      for (const r of rendezvousResults) {
        if (!results.some((existing) => existing.nodeId === r.nodeId)) {
          results.push(r);
        }
      }
    }

    // 7. If neither public network nor relays configured, do local search only
    if (!isPublicNetwork && !isPrivateRelay) {
      return this.searchLocalPeers(query, maxResults);
    }

    // Filter out self from results (don't show yourself in search results)
    // Check against both ownerId AND peerId since DHT discovery returns peer IDs
    const selfOwnerId = this._profile?.owner.ownerId;
    const selfPeerId = this._mesh?.peerId;
    const filteredResults = results.filter((r) =>
      r.nodeId !== selfOwnerId && r.nodeId !== selfPeerId
    );

    return filteredResults.slice(0, maxResults);
  }

  private async searchByPeerId(peerId: string, maxResults: number): Promise<PeerSearchResult[]> {
    const mesh = this._mesh;
    if (!mesh) {
      console.warn("[searchPeers] Node not initialized");
      return [];
    }

    try {
      // Try to find the peer via DHT first (if enabled)
      const node = (mesh as any).node;
      if (node?.peerRouting) {
        const peer = await node.peerRouting.findPeer(peerId, { timeout: 10000 });
        return [{
          nodeId: peer.id.toString(),
          ownerId: peer.id.toString(),
          displayName: peer.id.toString().slice(0, 12) + "...",
          interests: [],
          profileVisibility: "public",
        }];
      }
      // Direct dial attempt
      await mesh.dial(`/p2p/${peerId}`);
      return [{
        nodeId: peerId,
        ownerId: peerId,
        displayName: peerId.slice(0, 12) + "...",
        interests: [],
        profileVisibility: "public",
      }];
    } catch (err) {
      console.log(`[searchPeers] Peer ${peerId} not found via DHT or direct dial:`, err instanceof Error ? err.message : err);
      return [];
    }
  }

  private async searchByTopic(topic: string, maxResults: number): Promise<PeerSearchResult[]> {
    const mesh = this._mesh;
    if (!mesh) {
      console.warn("[searchPeers] Node not initialized for topic search");
      return [];
    }

    console.log(`[searchPeers] Searching DHT for topic: "${topic}" (limit: ${maxResults})`);
    try {
      const providers = await mesh.findCapabilityTopicProviders(topic, { limit: maxResults });
      console.log(`[searchPeers] Found ${providers.length} providers for topic "${topic}"`);
      return providers.map((provider: { peerId: string }) => ({
        nodeId: provider.peerId,
        ownerId: provider.peerId,
        displayName: provider.peerId.slice(0, 12) + "...",
        interests: [],
        profileVisibility: "public" as const,
      }));
    } catch (err) {
      console.log(`[searchPeers] Topic "${topic}" query failed:`, err instanceof Error ? err.message : err);
      return [];
    }
  }

  private async searchLocalPeers(query: SearchQuery, maxResults: number): Promise<PeerSearchResult[]> {
    const peerRecords = await this._peerDirectoryStore.listPeerRecords();
    const trustRecords = await this._trustStore.listTrustRecords();

    // Build a map of ownerId -> displayName from trust records
    const displayNameByOwner = new Map<string, string>();
    for (const record of trustRecords) {
      if (record.displayName) {
        displayNameByOwner.set(record.peerOwnerId, record.displayName);
      }
    }

    // Get bonded peers (trust level exists and is not "blocked")
    const bondedOwnerIds = new Set<string>();
    for (const record of trustRecords) {
      if (record.level !== "blocked") {
        bondedOwnerIds.add(record.peerOwnerId);
      }
    }

    let results: PeerSearchResult[] = [];

    // Build results from peer records
    for (const record of peerRecords) {
      // Skip if not bonded (unless text search covers it)
      // Include all records if they match query text
      const displayName = displayNameByOwner.get(record.ownerId) ?? record.ownerId;
      const isBonded = bondedOwnerIds.has(record.ownerId);

      const result: PeerSearchResult = {
        nodeId: record.peerId,
        ownerId: record.ownerId,
        displayName,
        interests: [],
        profileVisibility: "public",
      };

      // Filter: if query text is provided, match against ownerId or displayName
      if (query.queryText) {
        const lowerQuery = query.queryText.toLowerCase();
        const matches = result.ownerId.toLowerCase().includes(lowerQuery) ||
          result.displayName.toLowerCase().includes(lowerQuery);
        if (!matches) continue;
        results.push(result);
      } else if (isBonded) {
        // No query text - show only bonded peers
        results.push(result);
      }
    }

    // Also search by interests (text match on any interest)
    if (query.interests && query.interests.length > 0) {
      const interestMatches = peerRecords.filter((record) => {
        const displayName = displayNameByOwner.get(record.ownerId) ?? "";
        // Note: peerRecords don't have interests field, so we just match by ownerId/displayName
        const lowerInterests = query.interests!.map((i) => i.toLowerCase());
        return lowerInterests.some((interest) =>
          record.ownerId.toLowerCase().includes(interest) ||
          displayName.toLowerCase().includes(interest),
        );
      });
      for (const record of interestMatches) {
        const displayName = displayNameByOwner.get(record.ownerId) ?? record.ownerId;
        if (!results.some((r) => r.nodeId === record.peerId)) {
          results.push({
            nodeId: record.peerId,
            ownerId: record.ownerId,
            displayName,
            interests: [],
            profileVisibility: "public",
          });
        }
      }
    }

    return results.slice(0, maxResults);
  }

  /**
   * Search for peers via rendezvous servers (relay-based discovery)
   */
  private async searchByRendezvous(interests: string[]): Promise<PeerSearchResult[]> {
    const config = await this._configStore.load();
    if (!config?.configuredRelays || config.configuredRelays.length === 0) {
      return [];
    }

    const mesh = this._requireMesh();
    const selfProfile = this._requireProfile();
    const results: PeerSearchResult[] = [];

    for (const relay of config.configuredRelays) {
      if (!relay.enabled) continue;

      try {
        console.log(`[node-service] Searching rendezvous server ${relay.addr} for interests: ${interests.join(", ")}`);

        // Build query for each interest (as tag matches)
        const queryPayload = {
          match: interests.map(interest => ({ tag: interest.toLowerCase() })) as any,
        };

        const envelope = signUnsignedEnvelope(
          createUnsignedEnvelope({
            senderPeerId: mesh.peerId,
            senderPublicKey: selfProfile.device.publicKeyPem,
            recipientPeerId: relay.addr,
            intent: "rendezvous.query",
            payload: queryPayload,
          }),
          selfProfile.device.privateKeyPem,
        );

        const response = await mesh.sendExpectReply(relay.addr, envelope, { timeoutMs: 15000 });
        const responsePayload = RendezvousResponsePayloadSchema.parse(response.payload);

        console.log(`[node-service] Rendezvous query returned ${responsePayload.matches.length} matches from ${relay.addr}`);

        for (const match of responsePayload.matches) {
          results.push({
            nodeId: match.peerId,
            ownerId: match.peerId,
            displayName: match.peerId.slice(0, 12) + "...",
            interests: match.capabilities?.map((c: any) => "tag" in c ? c.tag : "") .filter(Boolean) ?? [],
            profileVisibility: "public",
          });
        }
      } catch (err) {
        console.warn(`[node-service] Rendezvous query failed for ${relay.addr}:`, err);
      }
    }

    return results;
  }

  async advertiseTopic(topic: string): Promise<void> {
    const mesh = this._mesh;
    if (!mesh) {
      throw new Error("Node not initialized");
    }
    try {
      console.log(`[node-service] Advertising topic: "${topic}" on DHT`);
      await mesh.provideCapabilityTopic(topic);
      console.log(`[node-service] Successfully advertised topic: ${topic}`);
    } catch (err) {
      console.error(`[node-service] Failed to advertise topic ${topic}:`, err);
      throw err;
    }
  }

  async stopAdvertiseTopic(topic: string): Promise<void> {
    const mesh = this._mesh;
    if (!mesh) {
      throw new Error("Node not initialized");
    }
    try {
      await mesh.cancelCapabilityTopicReprovide(topic);
      console.log(`[node-service] Stopped advertising topic: ${topic}`);
    } catch (err) {
      console.error(`[node-service] Failed to stop advertising topic ${topic}:`, err);
      throw err;
    }
  }

  // ============================================
  // File Sharing
  // ============================================

  async shareFile(_targetOwnerId: string, _file: { path: string; sensitivity: "public" | "friends" | "private" }): Promise<void> {
    throw new Error("Not yet implemented");
  }

  async acceptShare(_shareId: string, _savePath: string): Promise<void> {
    throw new Error("Not yet implemented");
  }

  async declineShare(_shareId: string): Promise<void> {
    throw new Error("Not yet implemented");
  }

  // ============================================
  // Node Configuration
  // ============================================

  async getNodeConfig(): Promise<NodeConfig> {
    const config = await this._configStore.load();
    if (config) {
      return {
        profileDir: config.profileDir,
        discoveryProfile: config.discoveryProfile,
        relayEnabled: config.relayEnabled,
        relayServerEnabled: config.relayServerEnabled,
        configuredRelays: config.configuredRelays,
        advertiseAddrs: config.advertiseAddrs,
        bootstrapPeers: config.bootstrapPeers,
        bootstrapPresets: config.bootstrapPresets,
      };
    }
    return {
      profileDir: this._profileDir,
      discoveryProfile: "wan-default" as const,
      relayEnabled: false,
      relayServerEnabled: false,
      configuredRelays: [],
      advertiseAddrs: [],
      bootstrapPeers: [],
      bootstrapPresets: [],
    };
  }

  async updateNodeConfig(config: Partial<NodeConfig>): Promise<void> {
    const current = (await this._configStore.load()) ?? {
      version: "0.1" as const,
      profileDir: this._profileDir,
      discoveryProfile: "wan-default" as const,
      relayEnabled: false,
      relayServerEnabled: false,
      advertiseAddrs: [] as string[],
      bootstrapPeers: [] as string[],
      bootstrapPresets: [] as string[],
      configuredRelays: [],
      updatedAt: new Date().toISOString(),
    };

    const updated: PersistedNodeConfig = {
      ...current,
      ...(config.discoveryProfile && { discoveryProfile: config.discoveryProfile }),
      ...(config.enableMdns !== undefined && { enableMdns: config.enableMdns }),
      ...(config.relayEnabled !== undefined && { relayEnabled: config.relayEnabled }),
      ...(config.relayServerEnabled !== undefined && { relayServerEnabled: config.relayServerEnabled }),
      ...(config.advertiseAddrs && { advertiseAddrs: config.advertiseAddrs }),
      ...(config.bootstrapPeers && { bootstrapPeers: config.bootstrapPeers }),
      ...(config.bootstrapPresets && { bootstrapPresets: config.bootstrapPresets }),
      ...(config.configuredRelays && { configuredRelays: config.configuredRelays }),
      updatedAt: new Date().toISOString(),
    };

    await this._configStore.save(updated);
    this.emit("node:status", {
      status: this._nodeStatus,
      peerId: this._mesh?.peerId,
    });
  }

  async listRelays(): Promise<RelayConfig[]> {
    const config = await this._configStore.load();
    return config?.configuredRelays ?? [];
  }

  async addRelay(addr: string, level?: number, region?: string): Promise<RelayConfig> {
    const config = (await this._configStore.load()) ?? {
      version: "0.1" as const,
      profileDir: this._profileDir,
      discoveryProfile: "wan-default" as const,
      relayEnabled: false,
      relayServerEnabled: false,
      advertiseAddrs: [] as string[],
      bootstrapPeers: [] as string[],
      bootstrapPresets: [] as string[],
      configuredRelays: [],
      updatedAt: new Date().toISOString(),
    };

    const relayId = `relay_${Date.now()}`;
    const newRelay: RelayConfig = { relayId, addr, level, region, enabled: true };

    // If address looks like a domain, try to resolve it to a multiaddr with peer ID
    let resolvedAddr = addr;
    if (looksLikeDomain(addr)) {
      console.log(`[node-service] Resolving relay domain: ${addr}`);
      const results = await resolveBootstrapAddresses([addr]);
      if (results.length > 0 && results[0].resolved.length > 0) {
        resolvedAddr = results[0].resolved[0];
        console.log(`[node-service] Resolved ${addr} to ${resolvedAddr}`);
      }
    }

    const updated: PersistedNodeConfig = {
      ...config,
      configuredRelays: [...config.configuredRelays, { ...newRelay, addr: resolvedAddr }],
      updatedAt: new Date().toISOString(),
    };

    await this._configStore.save(updated);
    return { ...newRelay, addr: resolvedAddr };
  }

  async removeRelay(relayId: string): Promise<void> {
    const config = await this._configStore.load();
    if (!config) {
      return;
    }

    const updated: PersistedNodeConfig = {
      ...config,
      configuredRelays: config.configuredRelays.filter((r) => r.relayId !== relayId),
      updatedAt: new Date().toISOString(),
    };

    await this._configStore.save(updated);
  }

  // ============================================
  // Node Lifecycle
  // ============================================

  async initNode(profileDir: string, options?: InitNodeOptions): Promise<NodeInitResult> {
    // Create profile directory structure
    const profile = await loadOrCreateNodeProfile(profileDir);

    // Write persisted config
    const config: PersistedNodeConfig = {
      version: "0.1",
      profileDir,
      discoveryProfile: options?.discoveryProfile ?? "wan-default",
      relayEnabled: options?.relayEnabled ?? true,
      relayServerEnabled: options?.relayServerEnabled ?? false,
      advertiseAddrs: options?.advertiseAddrs ?? [],
      bootstrapPeers: options?.bootstrapPeers ?? [],
      bootstrapPresets: options?.bootstrapPresets ?? [],
      configuredRelays: [],
      updatedAt: new Date().toISOString(),
    };

    await this._configStore.save(config);
    this._profile = profile;

    return {
      profileDir,
      peerId: derivePeerId(profile.device.publicKeyPem),
      ownerId: profile.owner.ownerId,
      deviceId: profile.device.deviceId,
    };
  }

  getNodeStatus(): NodeStatus {
    return this._nodeStatus;
  }

  async startNode(): Promise<void> {
    if (this._nodeStatus === "running") {
      return;
    }

    if (this._nodeStatus === "starting") {
      throw new Error("Node is already starting");
    }

    this._nodeStatus = "starting";
    this.emit("node:status", { status: this._nodeStatus });

    try {
      const config = await this._configStore.load();
      if (!config) {
        throw new Error("No node config found. Call initNode() first.");
      }

      // Load or create profile
      this._profile = await loadOrCreateNodeProfile(config.profileDir);

      // Create app-managed stores
      this._taskStore = createLocalTaskStore(config.profileDir);
      this._relayStateStore = createRelayStateStore(config.profileDir);
      this._discoverySeedStore = createDiscoverySeedStore(config.profileDir);
      this._taskRuntimeStore = createTaskRuntimeStateStore(config.profileDir);
      this._inboundGuard = createInboundMessageGuard();
      this._taskDispatcher = createTaskDispatcher();

      // Compute effective bootstrap peers
      // Must resolve bootstrapPresets to actual multiaddresses for mesh connectivity
      const peerRecords = await this._peerDirectoryStore.listPeerRecords();
      const peerDirAddrs = peerRecords.flatMap((r) => r.listenAddrs);
      const seedAddrs = await this._discoverySeedStore.listSeedAddrs();

      // Resolve bootstrap presets to actual multiaddresses
      const resolvedPresetAddrs: string[] = [];
      if (config.bootstrapPresets && config.bootstrapPresets.length > 0) {
        console.log(`[node-service] Resolving ${config.bootstrapPresets.length} bootstrap presets...`);
        const resolvedResults = await resolveBootstrapAddresses(config.bootstrapPresets);
        for (const result of resolvedResults) {
          resolvedPresetAddrs.push(...result.resolved);
          console.log(`[node-service] Preset ${result.original} → ${result.resolved.length} addresses`);
        }
      }

      const bootstrapPeers = [...new Set([...config.bootstrapPeers, ...resolvedPresetAddrs, ...peerDirAddrs, ...seedAddrs])];

      console.log(`[node-service] Bootstrap peers resolved: ${bootstrapPeers.length} addresses`);
      for (const bp of bootstrapPeers) {
        console.log(`  - ${bp}`);
      }

      // Create EnvoyMesh
      // DHT is always enabled when using wan-default discovery profile (for topic-based peer discovery)
      // Bootstrap presets affect peer connectivity, not DHT availability
      console.log(`[node-service] DHT configuration: discoveryProfile=${config.discoveryProfile}, bootstrapPresets=${config.bootstrapPresets?.length ?? 0}`);
      console.log(`[node-service] Creating EnvoyMesh with enableDht=true`);
      console.log(`[node-service] config object:`, JSON.stringify({
        discoveryProfile: config.discoveryProfile,
        relayEnabled: config.relayEnabled,
        relayServerEnabled: config.relayServerEnabled,
        bootstrapPeers: config.bootstrapPeers,
        bootstrapPresets: config.bootstrapPresets,
      }));

      const meshOptions: EnvoyMeshOptions = {
        listen: ["/ip4/0.0.0.0/tcp/0"],
        enableMdns: config.enableMdns ?? true, // mDNS for local discovery (default true, can be disabled for testing)
        enableDht: true, // Always enable DHT for topic-based discovery
        dhtClientMode: true,
        bootstrapPeers,
        enableRelay: config.relayEnabled,
        enableRelayServer: config.relayServerEnabled,
        enableAutoNat: true,
        enableDcutr: true,
        libp2pPrivateKeyPath: join(config.profileDir, DEFAULT_LIBP2P_PRIVATE_KEY_BASENAME),
      };

      this._mesh = new EnvoyMesh(meshOptions);

      // Wire mesh events
      this._wireMeshEvents();

      // Start mesh
      await this._mesh.start();

      this._nodeStatus = "running";
      this.emit("node:status", { status: this._nodeStatus, peerId: this._mesh.peerId });

      // Re-advertise interests on DHT when node starts (in case we restarted)
      void this._advertiseInterestsIfPublic();
    } catch (error) {
      this._nodeStatus = "offline";
      this.emit("node:status", { status: this._nodeStatus });
      throw error;
    }
  }

  private _wireMeshEvents(): void {
    const mesh = this._mesh!;
    const profile = this._profile!;

    mesh.onMessage(async ({ envelope, remotePeerId }) => {
      const guardDecision = this._inboundGuard!.inspect(envelope);
      if (guardDecision.action === "reject") return;

      const { intent } = envelope;

      if (intent === "bond.request") {
        // Parse the bond request payload
        const { parseBondRequestPayload, createBondAcceptPayload, createUnsignedEnvelope } = await import("@envoymesh/protocol");
        const { signUnsignedEnvelope } = await import("@envoymesh/identity");
        const payload = parseBondRequestPayload(envelope.payload);

        // Auto-accept bond requests for now (future: user approval)
        console.log(`[node-service] Auto-accepting bond request from ${payload.requesterOwnerId} (${payload.requesterDisplayName})`);

        // Store the bond in trust store (accept the connection)
        await this._trustStore.setTrustRecord({
          peerOwnerId: payload.requesterOwnerId,
          displayName: payload.requesterDisplayName,
          level: payload.requestedLevel as any ?? "direct",
          note: payload.message ?? undefined,
          now: new Date().toISOString(),
        });

        // Store peer info if not already stored
        const existing = await this._peerDirectoryStore.getPeerByOwnerId(payload.requesterOwnerId);
        if (!existing) {
          await this._peerDirectoryStore.upsertPeerFromSignal({
            peerId: remotePeerId,
            payload: envelope.payload as any,
          });
        }

        // Send bond.accept back to the requester so they know we accepted
        console.log(`[node-service] Sending bond.accept to ${payload.requesterOwnerId} at peerId ${remotePeerId}`);
        const humanProfile = await this._humanProfileStore.loadHumanProfile();
        const displayName = humanProfile?.displayName ?? profile.owner.ownerId;
        const acceptEnvelope = signUnsignedEnvelope(
          createUnsignedEnvelope({
            senderPeerId: derivePeerId(profile.device.publicKeyPem),
            senderPublicKey: profile.device.publicKeyPem,
            recipientPeerId: remotePeerId,
            intent: "bond.accept",
            payload: createBondAcceptPayload({
              responderOwnerId: profile.owner.ownerId,
              requesterOwnerId: payload.requesterOwnerId,
              message: `Hello from ${displayName}!`,
            }),
          }),
          profile.device.privateKeyPem,
        );
        await mesh.send(remotePeerId, acceptEnvelope);

        // Emit bond:established event so the UI updates
        this.emit("bond:established", {
          peerOwnerId: payload.requesterOwnerId,
          displayName: payload.requesterDisplayName,
        });

        // Emit hello:request notification for the UI to show
        this.emit("hello:request", {
          messageId: envelope.messageId,
          sender: {
            nodeId: remotePeerId,
            ownerId: payload.requesterOwnerId,
            displayName: payload.requesterDisplayName ?? remotePeerId,
          },
          profile: {
            displayName: payload.requesterDisplayName ?? remotePeerId,
            bio: "",
            interests: [],
            whatShares: [],
          },
          message: payload.message ?? "",
          timestamp: envelope.createdAt,
        });
      } else if (intent === "chat.message") {
        const payload = parseChatMessagePayload(envelope.payload);
        this.emit("chat:message", {
          messageId: envelope.messageId,
          sender: { nodeId: remotePeerId, displayName: payload.senderOwnerId },
          recipient: { nodeId: profile.owner.ownerId },
          content: { text: payload.text },
          metadata: { timestamp: envelope.createdAt, deliveryReceipt: "delivered" },
          signature: envelope.signature,
        });
      }
    });

    mesh.onPeerDiscovered(async ({ peerId, multiaddrs }) => {
      const existing = await this._peerDirectoryStore.getPeerByOwnerId(peerId);
      if (!existing) {
        await this._peerDirectoryStore.upsertPeerFromSignal({
          peerId,
          payload: {
            type: "peer.discovered",
            version: "1.0",
            ownerId: peerId,
            deviceId: "unknown",
            deviceCertificate: { devicePublicKeyPem: "" },
            listenAddrs: multiaddrs,
            signal: "peer.discovered",
          } as any,
        });
      }
      // Emit peer:discovered so the UI can show "Around Me" section
      this.emit("peer:discovered", {
        nodeId: peerId,
        ownerId: peerId,
        displayName: `Peer ${peerId.slice(0, 8)}`,
        username: undefined,
        bio: undefined,
        interests: [],
        profileVisibility: "public" as const,
      });
    });
  }

  async stopNode(): Promise<void> {
    if (this._nodeStatus === "offline") {
      return;
    }

    this._nodeStatus = "stopping";
    this.emit("node:status", { status: this._nodeStatus });

    try {
      if (this._mesh) {
        await this._mesh.stop();
        this._mesh = undefined;
      }
    } catch (error) {
      console.error("[node-service] Error stopping mesh:", error);
    }

    this._nodeStatus = "offline";
    this.emit("node:status", { status: this._nodeStatus });
  }

  // ============================================
  // Event Subscription
  // ============================================

  on<K extends keyof NodeServiceEvents>(event: K, handler: (data: NodeServiceEvents[K]) => void): () => void {
    let handlers = this.listeners.get(event);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(event, handlers);
    }
    handlers.add(handler as any);
    return () => {
      handlers?.delete(handler as any);
    };
  }

  hasListeners(event: keyof NodeServiceEvents): boolean {
    return (this.listeners.get(event)?.size ?? 0) > 0;
  }

  // ============================================
  // Connection Status
  // ============================================

  getConnectionStatus(): ConnectionStatus {
    if (!this._mesh || this._nodeStatus !== "running") {
      return {
        online: false,
        peerId: "",
        multiaddrs: [],
        connectedRelays: [],
        bondedPeers: 0,
      };
    }
    return {
      online: true,
      peerId: this._mesh.peerId,
      multiaddrs: this._mesh.multiaddrs,
      connectedRelays: [],
      bondedPeers: 0,
    };
  }

  // ============================================
  // Internal: Emit events to listeners
  // ============================================

  emit<K extends keyof NodeServiceEvents>(event: K, data: NodeServiceEvents[K]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(data);
      }
    }
  }
}

/**
 * Creates a NodeService instance.
 */
export function createNodeService(
  mesh: EnvoyMesh | undefined,
  trustStore: LocalTrustStore,
  peerDirectoryStore: LocalPeerDirectoryStore,
  humanProfileStore: HumanProfileStore,
  profileDir: string,
  profile?: NodeProfile,
): NodeService {
  return new NodeServiceImpl(mesh, trustStore, peerDirectoryStore, humanProfileStore, profileDir, profile);
}

// Export the class for testing
export { NodeServiceImpl };