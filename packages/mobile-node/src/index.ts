/**
 * Mobile EnvoyMesh Node — In-process runtime for Capacitor mobile app.
 *
 * Key differences from the desktop node (apps/node):
 * - No libp2p — relay-only WebSocket transport (outbound only)
 * - No child process — runs in the same WebView as the Social UI
 * - No CLI — initialized programmatically
 * - SQLite storage via Capacitor (packages/mobile-storage)
 * - Vault via Capacitor Filesystem (packages/mobile-vault)
 * - Identity via @noble/curves (packages/mobile-identity)
 *
 * Multi-device identity:
 * - Standalone: mobile generates its own owner/device identity
 * - Shared (import): mobile imports the home node's owner identity so
 *   both devices share the same ownerId and contacts
 */

import {
  generateOwnerIdentity,
  generateDeviceIdentity,
  generateAgentIdentity,
  deriveOwnerId,
  deriveDeviceId,
  deriveAgentId,
  generateEcdhKeyPair,
  decryptOwnerKeyFromDevice,
  bytesToBase64url,
  signUnsignedEnvelope,
  verifyEnvelope,
  type OwnerIdentity,
  type DeviceIdentity,
  type AgentIdentity,
  type EncryptedOwnerKey,
} from "@envoymesh/mobile-identity";
import { createMobileVault, type MobileVault } from "@envoymesh/mobile-vault";
import {
  createMobilePeerDirectory,
  createMobileTrustStore,
  createMobileSessionTokenStore,
  createMobileIdentityStateStore,
  createMobileChatLogStore,
  createInMemoryDb,
  type MobileSessionTokenStore,
  type MobileDatabase,
  type MobileIdentityStateStore,
  type PersistedIdentityState,
  type SecureStorage,
} from "@envoymesh/mobile-storage";
import { createUnsignedEnvelope } from "@envoymesh/protocol";
import type {
  BondRecord,
  NodeService,
  NodeServiceEvents,
  PairSharedIdentityResult,
} from "@envoymesh/api";
function _randomUUID(): string { return crypto.randomUUID(); }

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MobileNodeConfig {
  /** Profile directory path (for Capacitor Filesystem). */
  profileDir: string;
  /** Relay WebSocket URLs to connect to. */
  relayUrls: string[];
  /** Home node peer ID for shared identity pairing. */
  homeNodePeerId?: string;
  /** Injected database (SQLite). Falls back to in-memory for dev/testing. */
  database?: MobileDatabase;
  /** Injected vault. Falls back to in-memory for dev/testing. */
  vault?: MobileVault;
  /** Injected secure storage for private keys. Provide for production. */
  secureStorage?: SecureStorage;
}

export interface MobileNodeState {
  owner: OwnerIdentity;
  device: DeviceIdentity;
  agent: AgentIdentity;
  /** Whether this node shares identity with a home node. */
  sharedIdentity: boolean;
  /** Home node peer ID (if shared identity). */
  homeNodePeerId?: string;
  profileDir: string;
  relayUrls: string[];
}

export type MobileNodeStatus = "uninitialized" | "starting" | "running" | "stopping" | "offline";

// ---------------------------------------------------------------------------
// Event emitter
// ---------------------------------------------------------------------------

type EventHandler = (data: unknown) => void;

class EventBus {
  private readonly _handlers = new Map<string, Set<EventHandler>>();

  on(event: string, handler: EventHandler): () => void {
    let set = this._handlers.get(event);
    if (!set) {
      set = new Set();
      this._handlers.set(event, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
      if (set?.size === 0) this._handlers.delete(event);
    };
  }

  emit(event: string, data: unknown): void {
    const set = this._handlers.get(event);
    if (set) {
      for (const handler of set) {
        try { handler(data); } catch { /* swallow */ }
      }
    }
  }

  hasListeners(event: string): boolean {
    return (this._handlers.get(event)?.size ?? 0) > 0;
  }

  clear(): void {
    this._handlers.clear();
  }
}

// ---------------------------------------------------------------------------
// MobileNode
// ---------------------------------------------------------------------------

export class MobileNode implements NodeService {
  private readonly _db: MobileDatabase;
  private readonly _vault: MobileVault;
  private readonly _peerDirectory: ReturnType<typeof createMobilePeerDirectory>;
  private readonly _trustStore: ReturnType<typeof createMobileTrustStore>;
  private readonly _sessionTokenStore: MobileSessionTokenStore;
  private readonly _identityStateStore: MobileIdentityStateStore;
  private readonly _chatLog: ReturnType<typeof createMobileChatLogStore>;
  private readonly _secureStorage?: SecureStorage;
  private readonly _events = new EventBus();
  private readonly _relayUrls: string[];
  private _profileDir: string;

  private _state!: MobileNodeState;
  private _status: MobileNodeStatus = "uninitialized";
  private _relaySockets: WebSocket[] = [];
  private _lastActivity = 0;
  private _manualOnline = true;
  constructor(config: MobileNodeConfig) {
    this._profileDir = config.profileDir;
    this._relayUrls = [...config.relayUrls];
    this._db = config.database ?? createInMemoryDb();
    this._vault = config.vault ?? createMobileVault();
    this._secureStorage = config.secureStorage;
    this._peerDirectory = createMobilePeerDirectory(this._db);
    this._trustStore = createMobileTrustStore(this._db);
    this._sessionTokenStore = createMobileSessionTokenStore(this._db);
    this._identityStateStore = createMobileIdentityStateStore(this._db);
    this._chatLog = createMobileChatLogStore(this._db);
  }

  // -----------------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------------

  /**
   * Initialize a standalone mobile identity (different from home node).
   */
  async initStandalone(profileDir: string): Promise<MobileNodeState> {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const agent = generateAgentIdentity(owner.ownerId);
    this._state = {
      owner, device, agent,
      sharedIdentity: false,
      profileDir,
      relayUrls: this._relayUrls,
    };
    this._profileDir = profileDir;
    return this._state;
  }

  /**
   * Import the owner identity from the home node for shared-identity mode.
   * The mobile device generates its own device keypair but shares the owner.
   *
   * In shared-identity mode:
   * - Same ownerId on both devices (contacts/bonds are shared)
   * - Different deviceId per device (for device-level routing)
   * - Agent identity is derived from shared ownerId + device-specific agent key
   */
  async importOwnerIdentity(
    profileDir: string,
    ownerPrivateKeyPem: string,
    ownerPublicKeyPem: string,
    homeNodePeerId?: string,
  ): Promise<MobileNodeState> {
    const ownerId = deriveOwnerId(ownerPublicKeyPem);
    const owner: OwnerIdentity = {
      ownerId,
      publicKeyPem: ownerPublicKeyPem,
      privateKeyPem: ownerPrivateKeyPem,
    };

    // Generate device-specific keys (different from home node)
    const device = generateDeviceIdentity();
    const agent = generateAgentIdentity(ownerId);

    this._state = {
      owner, device, agent,
      sharedIdentity: true,
      homeNodePeerId,
      profileDir,
      relayUrls: this._relayUrls,
    };
    this._profileDir = profileDir;
    return this._state;
  }

  get state(): MobileNodeState {
    return this._state;
  }

  get sharedIdentity(): boolean {
    return this._state?.sharedIdentity ?? false;
  }

  /**
   * Restore shared identity from persisted storage.
   * Called on app restart — no QR re-scan needed.
   *
   * Private keys must be fetched from the OS keychain separately
   * (iOS Keychain / Android EncryptedSharedPreferences).
   * This method restores the public identity state from SQLite.
   *
   * @param persisted The persisted identity state from storage
   * @param ownerPrivateKeyPem The owner's private key (from Keychain)
   * @param devicePrivateKeyPem The device's private key (from Keychain)
   * @param agentPrivateKeyPem The agent's private key (from Keychain)
   */
  async restoreSharedIdentity(
    persisted: PersistedIdentityState,
    ownerPrivateKeyPem: string,
    devicePrivateKeyPem: string,
    agentPrivateKeyPem: string,
  ): Promise<MobileNodeState> {
    this._state = {
      owner: {
        ownerId: persisted.ownerId,
        publicKeyPem: persisted.ownerPublicKeyPem,
        privateKeyPem: ownerPrivateKeyPem,
      },
      device: {
        deviceId: persisted.deviceId,
        publicKeyPem: persisted.devicePublicKeyPem,
        privateKeyPem: devicePrivateKeyPem,
      },
      agent: {
        agentId: deriveAgentId(persisted.ownerId, persisted.agentPublicKeyPem),
        agentPeerId: persisted.agentPeerId,
        publicKeyPem: persisted.agentPublicKeyPem,
        privateKeyPem: agentPrivateKeyPem,
      },
      sharedIdentity: true,
      homeNodePeerId: persisted.homeNodePeerId,
      profileDir: this._profileDir,
      relayUrls: persisted.relayUrls,
    };
    this._relayUrls.length = 0;
    this._relayUrls.push(...persisted.relayUrls);
    return this._state;
  }

  /**
   * Persist the current shared identity state to SQLite + SecureStorage.
   * Public state goes to SQLite, private keys go to OS keychain via SecureStorage.
   */
  async persistSharedIdentity(): Promise<PersistedIdentityState> {
    return this._persistCurrentIdentity(true);
  }

  /**
   * Persist the current (standalone or shared) identity to SQLite + SecureStorage.
   * Internal method called by persistSharedIdentity / persistStandaloneIdentity.
   */
  private async _persistCurrentIdentity(sharedIdentity: boolean): Promise<PersistedIdentityState> {
    const s = this._state;
    // Preserve original createdAt if re-persisting
    const existing = await this._identityStateStore.load();
    const createdAt = existing?.createdAt ?? new Date().toISOString();
    const persisted: PersistedIdentityState = {
      sharedIdentity,
      ownerId: s.owner.ownerId,
      ownerPublicKeyPem: s.owner.publicKeyPem,
      deviceId: s.device.deviceId,
      devicePublicKeyPem: s.device.publicKeyPem,
      agentPeerId: s.agent.agentPeerId,
      agentPublicKeyPem: s.agent.publicKeyPem,
      homeNodePeerId: s.homeNodePeerId,
      relayUrls: [...this._relayUrls],
      createdAt,
      updatedAt: new Date().toISOString(),
    };
    await this._identityStateStore.save(persisted);
    if (this._secureStorage) {
      await this._secureStorage.set("ownerPrivateKey", s.owner.privateKeyPem);
      await this._secureStorage.set("devicePrivateKey", s.device.privateKeyPem);
      await this._secureStorage.set("agentPrivateKey", s.agent.privateKeyPem);
    }
    return persisted;
  }

  /**
   * Complete the shared-identity pairing flow from a scanned QR code.
   *
   * Flow:
   * 1. Generate device keypair + ECDH keypair
   * 2. Connect to home node relay
   * 3. Call pairSharedIdentity RPC
   * 4. Decrypt owner private key
   * 5. Import owner identity
   * 6. Persist to storage
   *
   * @param qrPayload Decoded envoy://pair URI params
   * @returns The complete pairing result including session token
   */
  async pairWithHomeNode(qrPayload: {
    wsUrl: string;
    token: string;
    ownerPublicKey: string;
    ownerId: string;
    agentPeerId?: string;
    agentPubKey?: string;
    relayPeerId?: string;
  }): Promise<{
    sessionToken: string;
    deviceCertificate: Record<string, unknown>;
    state: MobileNodeState;
  }> {
    // 1. Generate device keypair + ECDH key-exchange keypair
    const device = generateDeviceIdentity();
    const ecdhKeyPair = await generateEcdhKeyPair();

    // 2. Connect to relay and exchange pairSharedIdentity RPC
    const ws = new WebSocket(qrPayload.wsUrl);
    let connectTimer: ReturnType<typeof setTimeout> | undefined;
    let rpcTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        connectTimer = setTimeout(() => {
          reject(new Error("Connection timeout"));
        }, 15000);
        ws.onopen = () => { clearTimeout(connectTimer); resolve(); };
        ws.onerror = () => { clearTimeout(connectTimer); reject(new Error("Failed to connect to relay")); };
      });

      // 3. Send pairSharedIdentity RPC
      const requestId = _randomUUID();
      const rpcRequest = {
        id: requestId,
        method: "pairSharedIdentity",
        params: {
          requesterOwnerId: qrPayload.ownerId,
          requesterDeviceId: device.deviceId,
          requesterDevicePublicKeyPem: device.publicKeyPem,
          keyExchangePublicKey: bytesToBase64url(new Uint8Array(ecdhKeyPair.publicKeyRaw)),
          pairingToken: qrPayload.token,
        },
      };
      ws.send(JSON.stringify(rpcRequest));

      const response = await new Promise<PairSharedIdentityResult>((resolve, reject) => {
        let settled = false;
        rpcTimer = setTimeout(() => {
          settled = true;
          reject(new Error("pairSharedIdentity timeout"));
        }, 30000);
        ws.onmessage = (event) => {
          if (settled) return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.id === requestId) {
              clearTimeout(rpcTimer);
              settled = true;
              if (msg.error) {
                reject(new Error(msg.error.message ?? "pairSharedIdentity failed"));
              } else {
                resolve(msg.result as PairSharedIdentityResult);
              }
            }
          } catch { /* wait for next message */ }
        };
        ws.onerror = () => {
          if (settled) return;
          settled = true;
          clearTimeout(rpcTimer);
          reject(new Error("WebSocket error"));
        };
        ws.onclose = () => {
          if (settled) return;
          settled = true;
          clearTimeout(rpcTimer);
          reject(new Error("Connection closed"));
        };
      });

      // 4. Decrypt owner private key
      const encrypted: EncryptedOwnerKey = {
        encryptedKey: response.encryptedOwnerKey,
        ephemeralPublicKey: response.ephemeralPublicKey,
        iv: response.iv,
        authTag: response.authTag,
      };
      const ownerPrivateKeyPem = await decryptOwnerKeyFromDevice(encrypted, ecdhKeyPair.privateKey);

      // 5. Import owner identity
      await this.importOwnerIdentity(
        this._profileDir,
        ownerPrivateKeyPem,
        response.ownerPublicKey,
        qrPayload.relayPeerId,
      );

      // 6. Persist to storage (public state → SQLite, private keys → SecureStorage)
      await this.persistSharedIdentity();

      // Store session token for reconnection
      if (response.sessionToken && this._sessionTokenStore) {
        await this._sessionTokenStore.setToken({
          token: response.sessionToken,
          ownerId: response.ownerId,
          deviceId: device.deviceId,
          displayName: "Home Node",
          createdAt: new Date().toISOString(),
          lastUsedAt: new Date().toISOString(),
        });
      }

      return {
        sessionToken: response.sessionToken,
        deviceCertificate: response.deviceCertificate,
        state: this._state,
      };
    } finally {
      clearTimeout(connectTimer);
      clearTimeout(rpcTimer);
      try { ws.close(); } catch { /* ignore */ }
    }
  }

  // -----------------------------------------------------------------------
  // Persistence helpers
  // -----------------------------------------------------------------------

  /**
   * Load persisted identity state from storage (without private keys).
   * Returns undefined if no identity has been persisted.
   */
  async loadPersistedIdentity(): Promise<PersistedIdentityState | undefined> {
    return this._identityStateStore.load();
  }

  /**
   * Restore shared identity from SQLite + SecureStorage.
   * Convenience method that loads public state from SQLite, fetches private
   * keys from the OS keychain, and calls restoreSharedIdentity().
   *
   * Throws if no persisted state, no secure storage, or keys are missing.
   */
  async restoreFromSecureStorage(): Promise<MobileNodeState> {
    if (!this._secureStorage) {
      throw new Error("SecureStorage not configured");
    }
    const persisted = await this._identityStateStore.load();
    if (!persisted) {
      throw new Error("No persisted identity found");
    }
    const ownerKey = await this._secureStorage.get("ownerPrivateKey");
    const deviceKey = await this._secureStorage.get("devicePrivateKey");
    const agentKey = await this._secureStorage.get("agentPrivateKey");
    if (!ownerKey || !deviceKey || !agentKey) {
      throw new Error("Private keys not found in secure storage — re-pair required");
    }

    if (persisted.sharedIdentity) {
      return this.restoreSharedIdentity(persisted, ownerKey, deviceKey, agentKey);
    }

    // Restore standalone identity (no home node pairing)
    this._state = {
      owner: {
        ownerId: persisted.ownerId,
        publicKeyPem: persisted.ownerPublicKeyPem,
        privateKeyPem: ownerKey,
      },
      device: {
        deviceId: persisted.deviceId,
        publicKeyPem: persisted.devicePublicKeyPem,
        privateKeyPem: deviceKey,
      },
      agent: {
        agentId: deriveAgentId(persisted.ownerId, persisted.agentPublicKeyPem),
        agentPeerId: persisted.agentPeerId,
        publicKeyPem: persisted.agentPublicKeyPem,
        privateKeyPem: agentKey,
      },
      sharedIdentity: false,
      profileDir: this._profileDir,
      relayUrls: persisted.relayUrls,
    };
    this._relayUrls.length = 0;
    this._relayUrls.push(...persisted.relayUrls);
    return this._state;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async initNode(profileDir: string, options?: Record<string, unknown>): Promise<{
    profileDir: string;
    peerId: string;
    ownerId: string;
    deviceId: string;
  }> {
    if (!this._state) {
      // Try to restore from persisted state first
      const persisted = await this._identityStateStore.load();
      if (persisted) {
        if (persisted.sharedIdentity) {
          throw new Error(
            "Shared identity state found but private keys not provided. " +
            "Use restoreFromSecureStorage() or restoreSharedIdentity().",
          );
        }
        // Standalone identity found but private keys not in memory —
        // caller should use restoreFromSecureStorage() instead
        throw new Error(
          "Standalone identity state found but not restored. " +
          "Use restoreFromSecureStorage() to restore with private keys.",
        );
      }
      // No persisted state — fresh standalone init
      await this.initStandalone(profileDir);
      // Persist the new standalone identity so it survives app restarts
      this._persistCurrentIdentity(false).catch(() => {});
    }
    return {
      profileDir: this._profileDir,
      peerId: this._state.agent.agentPeerId,
      ownerId: this._state.owner.ownerId,
      deviceId: this._state.device.deviceId,
    };
  }

  getNodeStatus(): "offline" | "starting" | "running" | "stopping" {
    if (this._status === "uninitialized") return "offline";
    return this._status;
  }

  async startNode(): Promise<void> {
    this._status = "starting";
    this._connectRelays();
    this._status = "running";
    this._events.emit("node:status", { status: "running", peerId: this._state?.agent?.agentPeerId });
    this._events.emit("node:online", { peerId: this._state?.agent?.agentPeerId ?? "", multiaddrs: this._relayUrls });
  }

  async stopNode(): Promise<void> {
    this._status = "stopping";
    this._stopRelayCheckin();
    for (const ws of this._relaySockets) {
      try { ws.close(); } catch { /* ignore */ }
    }
    this._relaySockets = [];
    this._status = "offline";
    this._events.emit("node:status", { status: "offline", peerId: this._state?.agent?.agentPeerId });
    this._events.emit("node:offline", { peerId: this._state?.agent?.agentPeerId ?? "" });
  }

  // -----------------------------------------------------------------------
  // Identity
  // -----------------------------------------------------------------------

  getProfile() {
    return {
      owner: this._state.owner,
      device: this._state.device,
      deviceCertificate: null as any, // Created by owner in shared-identity mode
    };
  }

  async getHumanProfile() {
    return undefined; // Mobile MVP — profile from storage later
  }

  async updateHumanProfile(_input: any): Promise<any> {
    throw new Error("Not implemented");
  }

  // -----------------------------------------------------------------------
  // Bond management
  // -----------------------------------------------------------------------

  async sendHello(targetOwnerId: string, _profile: any, _message: string) {
    this._sendToRelay({
      type: "hello-request",
      targetOwnerId,
      senderOwnerId: this._state.owner.ownerId,
      senderDeviceId: this._state.device.deviceId,
    });
    return { messageId: _randomUUID(), inReplyTo: "", decision: "accept" as const, timestamp: new Date().toISOString() };
  }

  async acceptHello(_messageId: string): Promise<void> { /* TODO */ }
  async declineHello(_messageId: string, _reason?: string): Promise<void> { /* TODO */ }
  async storePendingHelloRequest(_data: any): Promise<void> { /* TODO */ }
  async blockPeer(_peerOwnerId: string): Promise<void> { /* TODO */ }
  async unblockPeer(_peerOwnerId: string): Promise<void> { /* TODO */ }
  async revokeBond(peerOwnerId: string): Promise<void> {
    await this._trustStore.delete(peerOwnerId);
  }

  async getBonds(): Promise<BondRecord[]> {
    return this._trustStore.list();
  }

  // -----------------------------------------------------------------------
  // Messaging
  // -----------------------------------------------------------------------

  async sendChat(targetOwnerId: string, text: string): Promise<void> {
    const msgId = _randomUUID();
    const ts = new Date().toISOString();
    // Persist locally — threaded by targetOwnerId (ownerId namespace).
    // NOTE: Inbound chat messages are threaded by senderPeerId (peerId namespace).
    // The two namespaces differ; a unified thread view requires an ownerId→peerId
    // mapping from the trust store. Tracked as ISSUE #6.
    await this._chatLog.append(targetOwnerId, {
      messageId: msgId,
      sender: { ownerId: this._state.owner.ownerId, displayName: "Me" },
      recipient: { ownerId: targetOwnerId },
      content: { text },
      metadata: { timestamp: ts, deliveryReceipt: "sent" },
      signature: "",
    });
    // Emit for UI
    this._events.emit("chat:message", {
      messageId: msgId,
      sender: { nodeId: this._state.agent.agentPeerId, displayName: "Me", ownerId: this._state.owner.ownerId },
      recipient: { nodeId: "", ownerId: targetOwnerId },
      content: { text },
      metadata: { timestamp: ts, deliveryReceipt: "sent" },
      signature: "",
    });
    // Send to relay (Phase 3 will add signed envelope)
    this._sendToRelay({
      type: "chat",
      targetOwnerId,
      senderOwnerId: this._state.owner.ownerId,
      text,
    });
  }

  // TODO(security): forwardEnvelope currently sends the raw JSON without
  // re-signing with the local agent key. The relay proxy model should either
  // pass through the original signature (if the recipient trusts the source
  // relay) or re-wrap in a local envelope. Tracked as ISSUE #15.
  async forwardEnvelope(_envelopeJson: Record<string, unknown>, _dialHints?: string[]): Promise<void> {
    // Forward to relay
    this._sendToRelay({ type: "forward-envelope", envelope: _envelopeJson });
  }

  async homeclawCoreProxy(_params: any): Promise<any> {
    throw new Error("Not available on mobile node");
  }

  async listChatHistory(peerOwnerId: string, limit?: number): Promise<any[]> {
    return this._chatLog.listThread(peerOwnerId, limit);
  }

  async markRead(_targetOwnerId: string, _upToMessageId?: string): Promise<void> { /* TODO */ }

  // -----------------------------------------------------------------------
  // Search
  // -----------------------------------------------------------------------

  async searchPeers(_query: any): Promise<any[]> { return []; }
  async advertiseTopic(_topic: string): Promise<void> { /* TODO */ }
  async stopAdvertiseTopic(_topic: string): Promise<void> { /* TODO */ }

  // -----------------------------------------------------------------------
  // Capabilities
  // -----------------------------------------------------------------------

  async getCapabilityManifest(): Promise<any> { return undefined; }
  async updateCapabilityManifest(_params: any): Promise<any> { throw new Error("Not implemented"); }

  // -----------------------------------------------------------------------
  // File sharing
  // -----------------------------------------------------------------------

  async shareFile(_targetOwnerId: string, _file: any): Promise<void> { /* TODO */ }
  async acceptShare(_shareId: string, _savePath: string): Promise<void> { /* TODO */ }
  async declineShare(_shareId: string): Promise<void> { /* TODO */ }

  // -----------------------------------------------------------------------
  // Config
  // -----------------------------------------------------------------------

  async getNodeConfig(): Promise<any> {
    return { relayUrls: this._relayUrls, profileDir: this._profileDir };
  }

  async updateNodeConfig(_config: any): Promise<void> { /* TODO */ }
  async listRelays(): Promise<any[]> { return this._relayUrls.map((url) => ({ url })); }
  async addRelay(_addr: string, _level?: number, _region?: string): Promise<any> { return {}; }
  async removeRelay(_relayId: string): Promise<void> { /* TODO */ }

  // -----------------------------------------------------------------------
  // Connection status
  // -----------------------------------------------------------------------

  getConnectionStatus() {
    return {
      online: this._status === "running",
      peerId: this._state?.agent?.agentPeerId ?? "",
      multiaddrs: this._relayUrls,
      connectedRelays: this._relayUrls,
      bondedPeers: 0,
    };
  }

  async getPeerConnectionInfo(_peerOwnerId: string) {
    return { connected: true, direct: false, relayPeerId: this._relayUrls[0] };
  }

  // -----------------------------------------------------------------------
  // Agent bridge
  // -----------------------------------------------------------------------

  async getBridgeStatus() {
    return {
      enabled: false,
      agentPeerId: this._state?.agent?.agentPeerId ?? "",
      agentUrl: "",
      listenPort: 0,
      agentName: "",
    };
  }

  async getPairingPayload() {
    return {
      wsUrl: this._relayUrls[0] ?? "",
      relayPeerId: "",
      agentPeerId: this._state?.agent?.agentPeerId ?? "",
      agentPubKey: this._state?.agent?.publicKeyPem ?? "",
      // Include owner identity info for shared-identity transfer
      ownerPublicKey: this._state?.owner?.publicKeyPem,
      ownerId: this._state?.owner?.ownerId,
    };
  }

  async pairDevice(_params: any): Promise<any> {
    throw new Error("Mobile node does not accept pairDevice — pair with home node");
  }

  async pairSharedIdentity(_params: any): Promise<any> {
    throw new Error("Mobile node does not serve pairSharedIdentity — pair with home node");
  }

  // -----------------------------------------------------------------------
  // AI
  // -----------------------------------------------------------------------

  async knowledgeQuery(_question: string): Promise<string> {
    return "Knowledge query not available on mobile node";
  }

  // -----------------------------------------------------------------------
  // Activity
  // -----------------------------------------------------------------------

  recordOwnerActivity(): void {
    this._lastActivity = Date.now();
  }

  async isOwnerOnline(): Promise<boolean> {
    if (!this._manualOnline) return Date.now() - this._lastActivity < 5 * 60 * 1000;
    return this._manualOnline;
  }

  // -----------------------------------------------------------------------
  // Events
  // -----------------------------------------------------------------------

  on<K extends keyof NodeServiceEvents>(
    event: K,
    handler: (data: NodeServiceEvents[K]) => void,
  ): () => void {
    return this._events.on(event, handler as EventHandler);
  }

  hasListeners(event: keyof NodeServiceEvents): boolean {
    return this._events.hasListeners(event);
  }

  // -----------------------------------------------------------------------
  // Relay transport
  // -----------------------------------------------------------------------

  private _relayCheckinTimer: ReturnType<typeof setInterval> | null = null;

  private _connectRelays(): void {
    for (const url of this._relayUrls) {
      try {
        const ws = new WebSocket(url);
        ws.onopen = () => {
          // Send immediate relay checkin on connect
          this._sendRelayCheckin(ws);
          this._events.emit("node:online", {
            peerId: this._state?.agent?.agentPeerId ?? "",
            multiaddrs: [url],
          });
        };
        ws.onclose = () => {
          this._events.emit("node:offline", {
            peerId: this._state?.agent?.agentPeerId ?? "",
          });
        };
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            this._handleInboundMessage(msg);
          } catch { /* ignore malformed */ }
        };
        this._relaySockets.push(ws);
      } catch { /* relay unreachable */ }
    }
    // Start periodic relay checkin
    this._startRelayCheckin();
  }

  /**
   * Route an inbound message from a relay:
   * - EnvoyEnvelope → verify → route by intent → persist chat → emit events
   * - Legacy/event messages → emit as typed events
   */
  private _handleInboundMessage(msg: Record<string, unknown>): void {
    if (!this._state) return;

    const { owner, agent } = this._state;
    // EnvoyEnvelope: has version, intent, and signature
    if (msg.version === "0.1" && typeof msg.intent === "string" && typeof msg.signature === "string") {
      const verified = verifyEnvelope(msg as any);
      // Always emit raw envelope for any listeners
      this._events.emit("p2p:envelope", {
        envelope: msg,
        remotePeerId: (msg.senderPeerId as string) ?? "",
      });
      if (!verified) return; // Don't route unverified envelopes

      // Route by intent
      const intent = msg.intent as string;
      const payload = (msg.payload as Record<string, unknown>) ?? {};

      if (intent === "chat.message") {
        // Persist to chat log — threaded by senderPeerId (peerId namespace).
        // NOTE: Outbound chat is threaded by targetOwnerId (ownerId namespace).
        // The envelope does not carry senderOwnerId, so a unified view needs
        // a peerId→ownerId mapping from the trust store. ISSUE #6.
        const ts = (msg.createdAt as string) ?? new Date().toISOString();
        const senderPeerId = (msg.senderPeerId as string) ?? "";
        this._chatLog.append(senderPeerId, {
          messageId: (msg.messageId as string) ?? _randomUUID(),
          sender: { ownerId: senderPeerId, displayName: senderPeerId },
          recipient: { ownerId: owner.ownerId, displayName: "Me" },
          content: { text: String(payload.text ?? "") },
          metadata: { timestamp: ts, deliveryReceipt: "delivered" },
          signature: msg.signature as string,
        }).catch(() => {});
        // Emit chat event for UI
        this._events.emit("chat:message", {
          messageId: msg.messageId as string,
          sender: { nodeId: senderPeerId, displayName: senderPeerId, ownerId: senderPeerId },
          recipient: { nodeId: agent.agentPeerId, ownerId: owner.ownerId },
          content: { text: String(payload.text ?? "") },
          metadata: { timestamp: ts },
          signature: msg.signature as string,
        });
      } else if (
        intent === "bond.request" || intent === "bond.accept" ||
        intent === "bond.inbound" || intent === "bond.response"
      ) {
        // Bond events use the senderPeerId; ownerId mapping handled by trust store
        this._events.emit("bond:established", {
          peerOwnerId: (msg.senderPeerId as string) ?? "",
          displayName: (msg.senderPeerId as string) ?? "",
        });
      }
      return;
    }

    // Legacy / event messages
    if (msg.event) {
      this._events.emit(msg.event as string, (msg.data as unknown) ?? msg);
    }
  }

  private _sendRelayCheckin(ws: WebSocket): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    const unsigned = createUnsignedEnvelope({
      intent: "relay.checkin",
      senderPeerId: this._state?.agent?.agentPeerId ?? "",
      senderPublicKey: this._state?.agent?.publicKeyPem ?? "",
      senderRole: "agent",
      recipientRole: "system",
      payload: {
        peerId: this._state?.agent?.agentPeerId ?? "",
        capabilities: ["chat.message"],
      },
    });
    const signed = signUnsignedEnvelope(unsigned, this._state?.agent?.privateKeyPem ?? "");
    try { ws.send(JSON.stringify(signed)); } catch { /* ignore */ }
  }

  private _startRelayCheckin(): void {
    this._stopRelayCheckin();
    this._relayCheckinTimer = setInterval(() => {
      for (const ws of this._relaySockets) {
        this._sendRelayCheckin(ws);
      }
    }, 30_000);
  }

  private _stopRelayCheckin(): void {
    if (this._relayCheckinTimer) {
      clearInterval(this._relayCheckinTimer);
      this._relayCheckinTimer = null;
    }
  }

  private _sendToRelay(msg: Record<string, unknown>): void {
    if (!this._state?.agent) return;

    // Construct a signed envelope for chat messages
    let data: string;
    if (msg.type === "chat" && typeof msg.text === "string") {
      const unsigned = createUnsignedEnvelope({
        intent: "chat.message",
        senderPeerId: this._state.agent.agentPeerId,
        senderPublicKey: this._state.agent.publicKeyPem,
        senderRole: "human",
        recipientPeerId: (msg.targetOwnerId as string) ?? "",
        recipientRole: "human",
        payload: { text: msg.text },
      });
      const signed = signUnsignedEnvelope(unsigned, this._state.agent.privateKeyPem);
      data = JSON.stringify(signed);
    } else {
      // Non-chat messages (hello requests, forward-envelope, etc.) — send as-is for now
      data = JSON.stringify(msg);
    }
    for (const ws of this._relaySockets) {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(data); } catch { /* ignore */ }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMobileNode(config: MobileNodeConfig): MobileNode {
  return new MobileNode(config);
}
