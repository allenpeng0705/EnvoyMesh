/**
 * Mobile EnvoyMesh Node — In-process runtime for Capacitor mobile app.
 *
 * Key differences from the desktop node (apps/node):
 * - Browser-mode libp2p: WebSocket transport + DHT client + circuit relay
 *   (no TCP/QUIC/mDNS/autoNAT/DCUtR — not available in browsers)
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
  signCanonicalPayload,
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
import { createUnsignedEnvelope, createRendezvousRegisterPayload } from "@envoymesh/protocol";
import { generateKeyPair, privateKeyFromProtobuf, privateKeyToProtobuf } from "@libp2p/crypto/keys";
import type { PrivateKey } from "@libp2p/interface";
import type {
  BondRecord,
  CreateHumanProfileInput,
  HumanProfile,
  NodeService,
  NodeServiceEvents,
  PairSharedIdentityResult,
  PeerSearchResult,
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
  /** Bootstrap peer multiaddrs for the libp2p DHT. If empty, DHT is still
   * enabled but may take longer to find peers. Defaults to relayUrls
   * converted to p2p-circuit multiaddrs. */
  bootstrapPeers?: string[];
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
  private _humanProfile: HumanProfile | undefined;
  private _pendingQueries = new Map<string, { resolve: (r: PeerSearchResult[]) => void; timer: ReturnType<typeof setTimeout> }>();
  private _relayBackoffTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private _relayBackoffs = new Map<string, number>();

  // Libp2p mesh (browser-mode: WebSocket transport + DHT client + circuit relay)
  private _mesh?: import("libp2p").Libp2p;
  private _meshPeerId = "";
  private _meshBootstrapPeers: string[] = [];
  private _dhtAdvertiseTimer: ReturnType<typeof setInterval> | null = null;
  constructor(config: MobileNodeConfig) {
    this._profileDir = config.profileDir;
    this._relayUrls = [...config.relayUrls];
    this._meshBootstrapPeers = config.bootstrapPeers ?? [];
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
    } else {
      // Fallback: persist keys to localStorage for browser dev mode
      try {
        localStorage.setItem("envoymesh_keys_owner", s.owner.privateKeyPem);
        localStorage.setItem("envoymesh_keys_device", s.device.privateKeyPem);
        localStorage.setItem("envoymesh_keys_agent", s.agent.privateKeyPem);
      } catch { /* localStorage may be unavailable */ }
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
        // Try to load keys from localStorage fallback (browser dev mode)
        if (!this._secureStorage) {
          const ownerKey = localStorage.getItem("envoymesh_keys_owner");
          const deviceKey = localStorage.getItem("envoymesh_keys_device");
          const agentKey = localStorage.getItem("envoymesh_keys_agent");
          if (ownerKey && deviceKey && agentKey) {
            // Restore from localStorage keys
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
            // Profile loaded later in startNode()
            return {
              profileDir: this._profileDir,
              peerId: this._state.agent.agentPeerId,
              ownerId: this._state.owner.ownerId,
              deviceId: this._state.device.deviceId,
            };
          }
        }
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
    // Profile loaded later in startNode()
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
    // Load cached profile from localStorage (survives app restarts)
    this._loadCachedProfile();
    // Start relay WebSocket transport (always available)
    this._connectRelays();
    // Start browser-mode libp2p mesh (WebSocket transport + DHT + circuit relay)
    try {
      await this._startLibp2p();
    } catch (err) {
      console.warn("[mobile-node] libp2p start failed, continuing with relay-only mode:", err);
    }
    this._status = "running";
    this._events.emit("node:status", { status: "running", peerId: this._state?.agent?.agentPeerId });
    this._events.emit("node:online", { peerId: this._state?.agent?.agentPeerId ?? "", multiaddrs: this._relayUrls });
  }

  async stopNode(): Promise<void> {
    this._status = "stopping";
    this._stopRelayCheckin();
    this._stopDhtAdvertise();
    // Drain all pending rendezvous queries
    for (const [, pending] of this._pendingQueries) {
      clearTimeout(pending.timer);
      pending.resolve([]);
    }
    this._pendingQueries.clear();
    // Clear all backoff timers for reconnection
    for (const [, timer] of this._relayBackoffTimers) {
      clearTimeout(timer);
    }
    this._relayBackoffTimers.clear();
    this._relayBackoffs.clear();
    // Close all relay sockets and clean up
    for (const ws of this._relaySockets) {
      try { ws.close(); } catch { /* ignore */ }
    }
    this._relaySockets = [];
    // Stop libp2p mesh
    await this._stopLibp2p();
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
    return this._humanProfile;
  }

  async updateHumanProfile(input: CreateHumanProfileInput): Promise<HumanProfile> {
    if (!this._state) {
      throw new Error("Node not initialized — call initNode() first");
    }
    const unsigned: Omit<HumanProfile, "signature"> = {
      version: "0.1",
      ownerId: this._state.owner.ownerId,
      displayName: input.displayName.trim(),
      username: input.username.trim(),
      bio: input.bio?.trim(),
      gender: input.gender?.trim(),
      hobbies: input.hobbies,
      knowledge: input.knowledge,
      profileVisibility: input.profileVisibility ?? "private",
      capabilities: input.capabilities,
      updatedAt: new Date().toISOString(),
    };
    const signature = signCanonicalPayload(unsigned, this._state.owner.privateKeyPem);
    const profile: HumanProfile = { ...unsigned, signature };
    this._humanProfile = profile;
    // Persist to localStorage so it survives app restarts
    try {
      localStorage.setItem(
        `envoymesh_profile_${this._state.owner.ownerId}`,
        JSON.stringify(profile),
      );
    } catch { /* localStorage may be unavailable */ }
    return profile;
  }

  private _loadCachedProfile(): void {
    if (!this._state) return;
    try {
      const raw = localStorage.getItem(`envoymesh_profile_${this._state.owner.ownerId}`);
      if (raw) {
        this._humanProfile = JSON.parse(raw) as HumanProfile;
      }
    } catch { /* ignore parse errors */ }
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

  async searchPeers(query: {
    peerId?: string;
    queryText?: string;
    username?: string;
    interests?: string[];
  }): Promise<PeerSearchResult[]> {
    console.log("[mobile-node] searchPeers called:", JSON.stringify(query),
      "relaySockets:", this._relaySockets.length,
      "openSockets:", this._relaySockets.filter((ws) => ws.readyState === WebSocket.OPEN).length,
      "meshStarted:", !!this._mesh);
    // 1. Search local trust store (bonded peers)
    const bonds = await this._trustStore.list();
    let results: BondRecord[] = bonds;

    // Filter by peer ID if provided
    if (query.peerId) {
      const q = query.peerId.toLowerCase();
      results = results.filter(
        (b) =>
          b.libp2pPeerId?.toLowerCase() === q ||
          b.peerOwnerId?.toLowerCase() === q,
      );
    }

    // Filter by text search (displayName, note)
    const textQuery =
      query.queryText?.toLowerCase().trim() ||
      query.username?.toLowerCase().trim() ||
      query.interests?.[0]?.toLowerCase().trim();

    if (textQuery) {
      results = results.filter(
        (b) =>
          b.displayName?.toLowerCase().includes(textQuery) ||
          b.peerOwnerId?.toLowerCase().includes(textQuery) ||
          b.note?.toLowerCase().includes(textQuery),
      );
    }

    const searchResults: PeerSearchResult[] = results.map((b) => ({
      nodeId: b.libp2pPeerId ?? b.peerOwnerId,
      ownerId: b.peerOwnerId,
      displayName: b.displayName ?? b.peerOwnerId.slice(0, 12) + "...",
      interests: [],
      profileVisibility: "public" as const,
    }));

    const seen = new Set(searchResults.map((r) => r.ownerId));

    // Collect self IDs for filtering
    const selfAgentPeerId = this._state?.agent?.agentPeerId;
    const selfMeshPeerId = this._meshPeerId;
    const selfOwnerId = this._state?.owner?.ownerId;

    // 2. Search DHT via libp2p (browser-mode mesh)
    if (this._mesh) {
      const searchTag = query.interests?.[0] ?? query.username ?? query.queryText ?? "";
      if (searchTag) {
        const topics = [searchTag.toLowerCase()];
        if (query.username) topics.push(`username:${query.username.toLowerCase()}`);
        for (const topic of topics) {
          try {
            console.log(`[mobile-node] DHT search for topic: "${topic}"`);
            const providers = await this._searchDhtTopic(topic, 10);
            console.log(`[mobile-node] DHT found ${providers.length} providers for "${topic}"`);
            for (const p of providers) {
              // Skip self
              if (p.peerId === selfMeshPeerId || p.peerId === selfAgentPeerId) continue;
              if (seen.has(p.peerId)) continue;
              seen.add(p.peerId);
              searchResults.push({
                nodeId: p.peerId,
                ownerId: p.peerId,
                displayName: p.peerId.slice(0, 12) + "...",
                interests: [topic],
                profileVisibility: "public" as const,
              });
            }
          } catch (err) {
            console.log(`[mobile-node] DHT search for "${topic}" failed:`, err instanceof Error ? err.message : err);
          }
        }
      }
    }

    // 3. Query relay network for more peers (rendezvous query)
    if (this._relaySockets.length > 0 && this._relaySockets.some((ws) => ws.readyState === WebSocket.OPEN)) {
      const relayResults = await this._searchRelayRendezvous(query);
      for (const rr of relayResults) {
        const key = rr.ownerId || rr.nodeId;
        if (seen.has(key)) continue;
        // Skip self
        if (rr.ownerId === selfOwnerId || rr.nodeId === selfAgentPeerId) continue;
        seen.add(key);
        searchResults.push(rr);
      }
    }

    return searchResults;
  }

  /** Send a rendezvous.query to the relay and wait for rendezvous.response. */
  private _searchRelayRendezvous(query: {
    peerId?: string;
    queryText?: string;
    username?: string;
    interests?: string[];
  }): Promise<PeerSearchResult[]> {
    return new Promise((resolve) => {
      if (!this._state?.agent) { resolve([]); return; }

      const queryId = _randomUUID();
      const searchTag = query.peerId ?? query.queryText ?? query.interests?.[0] ?? query.username ?? "";

      // Timeout after 5s
      const timer = setTimeout(() => {
        this._pendingQueries.delete(queryId);
        resolve([]);
      }, 5000);

      this._pendingQueries.set(queryId, { resolve, timer });

      // Build and send signed rendezvous.query envelope
      const unsigned = createUnsignedEnvelope({
        intent: "rendezvous.query",
        senderPeerId: this._state.agent.agentPeerId,
        senderPublicKey: this._state.agent.publicKeyPem,
        senderRole: "agent",
        recipientRole: "system",
        correlationId: queryId,
        payload: {
          match: searchTag ? { tag: searchTag.toLowerCase() } : {},
          maxResults: 20,
        },
      });
      const signed = signUnsignedEnvelope(unsigned, this._state.agent.privateKeyPem);
      const data = JSON.stringify(signed);

      for (const ws of this._relaySockets) {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(data); } catch { /* ignore */ }
        }
      }
    });
  }

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
      multiaddrs: this._mesh ? this._mesh.getMultiaddrs().map((a: any) => a.toString()) : this._relayUrls,
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
      this._connectRelay(url);
    }
    // Start periodic relay checkin
    this._startRelayCheckin();
  }

  /**
   * Connect to a single relay with backoff reconnection.
   * On close/error: remove from _relaySockets, schedule reconnect with
   * exponential backoff (1s → 2s → 4s → ... → max 30s).
   */
  private _connectRelay(url: string): void {
    if (!url || this._status === "offline" || this._status === "stopping") return;
    try {
      const wsUrl = url.includes("/ws/client") ? url : url.replace(/\/+$/, "") + "/ws/client";
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        this._relayBackoffs.delete(url);
        this._sendRelayCheckin(ws);
        this._sendRendezvousRegister(ws);
        this._events.emit("node:online", {
          peerId: this._state?.agent?.agentPeerId ?? "",
          multiaddrs: [url],
        });
      };
      ws.onclose = () => {
        // Remove from socket array eagerly
        this._relaySockets = this._relaySockets.filter((s) => s !== ws);
        this._events.emit("node:offline", {
          peerId: this._state?.agent?.agentPeerId ?? "",
        });
        // Schedule reconnect with backoff
        this._scheduleRelayReconnect(url);
      };
      ws.onerror = () => {
        this._relaySockets = this._relaySockets.filter((s) => s !== ws);
        try { ws.close(); } catch { /* ignore */ }
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this._handleInboundMessage(msg);
        } catch { /* ignore malformed */ }
      };
      this._relaySockets.push(ws);
    } catch { /* relay unreachable — will retry via backoff */ }
  }

  private _scheduleRelayReconnect(url: string): void {
    if (this._status === "offline" || this._status === "stopping") return;
    // Clear any existing backoff timer for this URL
    const existing = this._relayBackoffTimers.get(url);
    if (existing) clearTimeout(existing);
    const backoff = Math.min((this._relayBackoffs.get(url) ?? 1000) * 2, 30000);
    this._relayBackoffs.set(url, backoff);
    const timer = setTimeout(() => {
      this._relayBackoffTimers.delete(url);
      this._connectRelay(url);
    }, backoff);
    this._relayBackoffTimers.set(url, timer);
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
      // rendezvous.response from relay uses placeholder keys — skip verification
      // per protocol spec (they are not Ed25519 device signatures)
      const isRendezvousResponse = msg.intent === "rendezvous.response" &&
        msg.senderPublicKey === "relay:rendezvous-response/unsigned-placeholder";
      const verified = isRendezvousResponse ? true : verifyEnvelope(msg as any);
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
      } else if (intent === "rendezvous.response") {
        console.log("[mobile-node] rendezvous.response received, matches:", (payload.matches as any[])?.length);
        // Handle relay search response
        const correlationId = (msg.correlationId as string) ?? "";
        const pending = this._pendingQueries.get(correlationId);
        if (pending) {
          clearTimeout(pending.timer);
          this._pendingQueries.delete(correlationId);
          const matches = (payload.matches as any[]) ?? [];
          pending.resolve(
            matches.map((m: any) => ({
              nodeId: (m.peerId as string) ?? "",
              ownerId: (m.ownerId as string) ?? (m.peerId as string) ?? "",
              displayName: (m.displayName as string) ?? (m.peerId as string)?.slice(0, 12) ?? "",
              interests: (m.capabilities as any[])?.filter((c: any) => c.tag)
                .map((c: any) => c.tag as string) ?? [],
              profileVisibility: "public" as const,
            })),
          );
        }
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

  /**
   * Register capabilities on the relay's rendezvous registry so other peers
   * can discover this mobile node via rendezvous.query.
   * Also advertises topics on the DHT (if mesh is available) for libp2p-level discovery.
   */
  private _sendRendezvousRegister(ws: WebSocket): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (!this._state?.agent) return;

    // Build capabilities from human profile interests
    const profileCaps: Array<{ tag: string }> = [];
    const topics: string[] = [];
    if (this._humanProfile?.hobbies) {
      for (const h of this._humanProfile.hobbies) {
        if (h) {
          profileCaps.push({ tag: h.toLowerCase() });
          topics.push(h.toLowerCase());
        }
      }
    }
    // Always advertise basic capabilities
    profileCaps.push({ tag: "chat.message" });
    topics.push("chat.message");
    if (this._humanProfile?.username) {
      const userTopic = `username:${this._humanProfile.username.toLowerCase()}`;
      profileCaps.push({ tag: userTopic });
      topics.push(userTopic);
    }

    // Register on relay rendezvous
    const relayUrl = this._relayUrls[0] ?? "";
    const unsigned = createUnsignedEnvelope({
      intent: "rendezvous.register",
      senderPeerId: this._state.agent.agentPeerId,
      senderPublicKey: this._state.agent.publicKeyPem,
      senderRole: "agent",
      recipientRole: "system",
      payload: createRendezvousRegisterPayload({
        peerId: this._state.agent.agentPeerId,
        multiaddr: relayUrl ? `${relayUrl}/p2p/${this._state.agent.agentPeerId}` : `/p2p/${this._state.agent.agentPeerId}`,
        capabilities: profileCaps,
        ttlSeconds: 3600,
      }),
    });
    const signed = signUnsignedEnvelope(unsigned, this._state.agent.privateKeyPem);
    try { ws.send(JSON.stringify(signed)); } catch { /* ignore */ }

    // Also advertise on DHT (best-effort)
    this._advertiseTopicsOnDht(topics).catch(() => {});
  }

  // -------------------------------------------------------------------
  // Libp2p mesh (browser-mode: WebSocket transport + DHT + circuit relay)
  // -------------------------------------------------------------------

  /** Load or create a stable libp2p Ed25519 private key (persisted in localStorage). */
  private async _loadOrCreateLibp2pKey(): Promise<PrivateKey> {
    const KEY = "envoymesh_libp2p_private_key";
    try {
      const stored = localStorage.getItem(KEY);
      if (stored) {
        const binary = atob(stored);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return privateKeyFromProtobuf(bytes);
      }
    } catch { /* corrupted key — regenerate */ }
    const pk = await generateKeyPair("Ed25519");
    try {
      const protoBytes = privateKeyToProtobuf(pk);
      let binary = "";
      for (let i = 0; i < protoBytes.length; i++) binary += String.fromCharCode(protoBytes[i]);
      localStorage.setItem(KEY, btoa(binary));
    } catch { /* localStorage unavailable */ }
    return pk;
  }

  /** Start the browser-mode libp2p mesh with WebSocket transport + DHT client + circuit relay. */
  private async _startLibp2p(): Promise<void> {
    if (this._mesh) return;
    if (!this._state?.agent) return;

    // Dynamically import libp2p modules (avoid bundling node:* deps at top level)
    const [
      { createLibp2p },
      { noise },
      { yamux },
      { webSockets: wsTransport },
      { circuitRelayTransport },
      { identify, identifyPush },
      { kadDHT },
      { bootstrap },
      { ping },
    ] = await Promise.all([
      import("libp2p"),
      import("@chainsafe/libp2p-noise"),
      import("@chainsafe/libp2p-yamux"),
      import("@libp2p/websockets"),
      import("@libp2p/circuit-relay-v2"),
      import("@libp2p/identify"),
      import("@libp2p/kad-dht"),
      import("@libp2p/bootstrap"),
      import("@libp2p/ping"),
    ]);

    const libp2pKey = await this._loadOrCreateLibp2pKey();

    // Build bootstrap peers: use configured bootstrap or convert relay URLs
    let bootstrapPeers = this._meshBootstrapPeers;
    if (bootstrapPeers.length === 0 && this._relayUrls.length > 0) {
      bootstrapPeers = this._relayUrls
        .map((url) => {
          try {
            const u = new URL(url);
            const host = u.hostname;
            const port = u.port || (u.protocol === "wss:" ? "443" : "80");
            const wsProto = u.protocol === "wss:" ? "wss" : "ws";
            return `/dns4/${host}/tcp/${port}/${wsProto}`;
          } catch { return ""; }
        })
        .filter(Boolean);
    }

    console.log("[mobile-node] starting libp2p mesh (browser-mode), bootstrap:", bootstrapPeers);

    const node = await createLibp2p({
      privateKey: libp2pKey,
      connectionMonitor: {
        pingInterval: 6000,
        abortConnectionOnPingFailure: true,
      },
      connectionManager: {
        reconnectRetries: 10,
        reconnectRetryInterval: 2000,
        reconnectBackoffFactor: 1.5,
        maxParallelReconnects: 10,
        dialTimeout: 15_000,
        addressDialTimeout: 10_000,
      },
      addresses: {
        listen: ["/p2p-circuit"],
      },
      transports: [
        wsTransport(),
        circuitRelayTransport(),
      ],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      peerDiscovery: bootstrapPeers.length > 0
        ? [bootstrap({ list: bootstrapPeers, timeout: 5000 })]
        : [],
      services: {
        ping: ping(),
        identify: identify(),
        identifyPush: identifyPush(),
        dht: kadDHT({ clientMode: true }),
      },
    });

    // Install EnvoyMesh protocol handlers
    const ENVOY_CHAT_PROTOCOL = "/envoymesh/chat/0.1.0";
    const ENVOY_MESSAGE_PROTOCOL = "/envoymesh/message/0.1.0";

    const handleInboundStream = async (stream: any, connection: any) => {
      const remotePeerId = connection.remotePeer.toString();
      try {
        const { byteStream } = await import("@libp2p/utils");
        const bytes = await byteStream(stream).read();
        if (bytes) {
          let data: Uint8Array;
          if (bytes instanceof Uint8Array) {
            data = bytes;
          } else {
            data = (bytes as import("uint8arraylist").Uint8ArrayList).subarray();
          }
          const text = new TextDecoder().decode(data);
          const msg = JSON.parse(text) as Record<string, unknown>;
          this._handleInboundMessage({ ...msg, senderPeerId: (msg.senderPeerId as string) ?? remotePeerId });
        }
      } catch { /* ignore malformed */ }
      try { await stream.close(); } catch { /* ignore */ }
    };

    await node.handle(ENVOY_MESSAGE_PROTOCOL, handleInboundStream);
    await node.handle(ENVOY_CHAT_PROTOCOL, handleInboundStream);

    // Start with timeout
    const NODE_START_DEADLINE_MS = 25_000;
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          console.warn("[mobile-node] libp2p start timed out after 25s — continuing with relay-only");
          resolve();
        }, NODE_START_DEADLINE_MS);
        Promise.resolve(node.start()).then(() => {
          clearTimeout(timer);
          resolve();
        }).catch((err: unknown) => {
          clearTimeout(timer);
          reject(err);
        });
      });
    } catch (err) {
      console.warn("[mobile-node] libp2p node.start failed:", err instanceof Error ? err.message : err);
      return;
    }

    this._mesh = node;
    this._meshPeerId = node.peerId.toString();
    console.log(`[mobile-node] libp2p mesh started, peerId=${this._meshPeerId}`);

    this._events.emit("node:online", {
      peerId: this._state.agent.agentPeerId,
      multiaddrs: node.getMultiaddrs().map((a: any) => a.toString()),
    });

    // Advertise profile topics on DHT after startup delay
    this._startDhtAdvertise();
  }

  private async _stopLibp2p(): Promise<void> {
    if (!this._mesh) return;
    this._stopDhtAdvertise();
    try {
      await this._mesh.stop();
    } catch (err) {
      console.warn("[mobile-node] libp2p stop error:", err instanceof Error ? err.message : err);
    }
    this._mesh = undefined;
    this._meshPeerId = "";
  }

  /** Send a signed envelope via the libp2p mesh (chat protocol). */
  private async _sendViaMesh(targetPeerId: string, data: string): Promise<void> {
    if (!this._mesh || !targetPeerId) throw new Error("Mesh not available");
    const { byteStream } = await import("@libp2p/utils");
    const stream = await this._mesh.dialProtocol(
      `/p2p/${targetPeerId}` as any,
      "/envoymesh/chat/0.1.0",
    );
    try {
      await byteStream(stream).write(new TextEncoder().encode(data));
    } finally {
      try { await stream.close(); } catch { /* ignore */ }
    }
  }

  /**
   * Compute the DHT provider CID for a capability topic.
   * Inlined from @envoymesh/network/capability-topic to avoid bundling node:crypto.
   */
  private async _capabilityTopicCid(topic: string): Promise<any> {
    const { CID } = await import("multiformats/cid");
    const { sha256 } = await import("multiformats/hashes/sha2");
    const normalized = topic.trim();
    const bytes = new TextEncoder().encode(`envoymesh:cap:v1:${normalized}`);
    const digest = await sha256.digest(bytes);
    return CID.createV1(0x55, digest);
  }

  /** Search the DHT for capability topic providers. */
  private async _searchDhtTopic(topic: string, limit: number): Promise<Array<{ peerId: string; multiaddrs: string[] }>> {
    if (!this._mesh) return [];
    const cid = await this._capabilityTopicCid(topic);
    const results: Array<{ peerId: string; multiaddrs: string[] }> = [];
    const signal = AbortSignal.timeout(5000);
    try {
      for await (const provider of this._mesh.contentRouting.findProviders(cid, { signal })) {
        results.push({
          peerId: provider.id.toString(),
          multiaddrs: provider.multiaddrs.map((ma: any) => ma.toString()),
        });
        if (results.length >= limit) break;
      }
    } catch (err) {
      const name = err instanceof Error ? (err as Error & { name?: string }).name : "";
      if (name === "AbortError" || name === "TimeoutError" || signal.aborted) {
        return results;
      }
      throw err;
    }
    return results;
  }

  /** Advertise profile topics on the DHT. */
  private async _advertiseTopicsOnDht(topics: string[]): Promise<void> {
    if (!this._mesh) return;
    for (const topic of topics) {
      try {
        const cid = await this._capabilityTopicCid(topic);
        await this._mesh.contentRouting.provide(cid);
        console.log(`[mobile-node] DHT advertised topic: ${topic}`);
      } catch (err) {
        console.warn(`[mobile-node] DHT advertise failed for "${topic}":`, err instanceof Error ? err.message : err);
      }
    }
  }

  private _startDhtAdvertise(): void {
    this._stopDhtAdvertise();
    // First advertise after 15s (let DHT bootstrap stabilize)
    const initialTimer = setTimeout(() => {
      const topics: string[] = ["chat.message"];
      if (this._humanProfile?.hobbies) {
        for (const h of this._humanProfile.hobbies) {
          if (h) topics.push(h.toLowerCase());
        }
      }
      if (this._humanProfile?.username) {
        topics.push(`username:${this._humanProfile.username.toLowerCase()}`);
      }
      this._advertiseTopicsOnDht(topics).catch(() => {});
    }, 15_000);

    // Re-advertise every 5 minutes (similar to desktop node)
    this._dhtAdvertiseTimer = setInterval(() => {
      const topics: string[] = ["chat.message"];
      if (this._humanProfile?.hobbies) {
        for (const h of this._humanProfile.hobbies) {
          if (h) topics.push(h.toLowerCase());
        }
      }
      if (this._humanProfile?.username) {
        topics.push(`username:${this._humanProfile.username.toLowerCase()}`);
      }
      this._advertiseTopicsOnDht(topics).catch(() => {});
    }, 5 * 60 * 1000);

    // Store initial timer for cleanup
    (this._dhtAdvertiseTimer as any)._initial = initialTimer;
  }

  private _stopDhtAdvertise(): void {
    if (this._dhtAdvertiseTimer) {
      clearInterval(this._dhtAdvertiseTimer);
      const initial = (this._dhtAdvertiseTimer as any)._initial;
      if (initial) clearTimeout(initial);
      this._dhtAdvertiseTimer = null;
    }
  }

  private _startRelayCheckin(): void {
    this._stopRelayCheckin();
    this._relayCheckinTimer = setInterval(() => {
      for (const ws of this._relaySockets) {
        this._sendRelayCheckin(ws);
        this._sendRendezvousRegister(ws);
      }
    }, 30_000);
  }

  private _stopRelayCheckin(): void {
    if (this._relayCheckinTimer) {
      clearInterval(this._relayCheckinTimer);
      this._relayCheckinTimer = null;
    }
  }

  private async _sendToRelay(msg: Record<string, unknown>): Promise<void> {
    if (!this._state?.agent) return;

    // Construct a signed envelope for chat messages
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
      const data = JSON.stringify(signed);

      // Try mesh first (P2P) if we can resolve the owner ID to a libp2p peer ID
      if (this._mesh) {
        const targetOwnerId = (msg.targetOwnerId as string) ?? "";
        if (targetOwnerId) {
          const bond = await this._trustStore.get(targetOwnerId);
          const libp2pPeerId = bond?.libp2pPeerId;
          if (libp2pPeerId) {
            this._sendViaMesh(libp2pPeerId, data).then(() => {
              console.log(`[mobile-node] chat sent via mesh to ${libp2pPeerId.slice(0, 12)}...`);
            }).catch((err) => {
              console.warn(`[mobile-node] mesh sendChat failed, falling back to relay:`, err instanceof Error ? err.message : err);
              this._broadcastToRelaySockets(data);
            });
            return;
          }
        }
      }
      this._broadcastToRelaySockets(data);
    } else {
      // Non-chat messages (hello requests, forward-envelope, etc.) — send as-is for now
      const data = JSON.stringify(msg);
      this._broadcastToRelaySockets(data);
    }
  }

  private _broadcastToRelaySockets(data: string): void {
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
