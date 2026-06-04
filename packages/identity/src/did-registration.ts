/**
 * DID Registration (Phase 26)
 *
 * Registers a human-readable `did:envoy:<name>` on the DHT that resolves
 * to the owner's cryptographic identity `envoy:owner:<hash>`.
 *
 * Architecture:
 *   did:envoy:alice  ──DHT lookup──▶  envoy:owner:a1b2c3...  ──peer directory──▶  connect
 *      (human name)                    (cryptographic truth)                       (mesh)
 *
 * First to register a name wins. The hash is always the source of truth.
 * Both identifiers work — `did:envoy:alice` for humans, `envoy:owner:a1b2c3...`
 * for machines.
 */

export interface DIDRegistrationDeps {
  /** Current owner identity. */
  ownerId: string;
  /** Current peer ID for DHT advertisement. */
  peerId: string;
  /** Advertise a DID name on the DHT (maps to existing provideCapabilityTopic). */
  advertiseOnDht: (name: string, ownerId: string, peerId: string) => Promise<void>;
  /** Remove a DID name advertisement from the DHT. */
  removeFromDht: (name: string) => Promise<void>;
  /** Persist the DID registration locally. */
  saveLocalRegistration: (registration: DIDRegistration) => Promise<void>;
  /** Load local DID registrations. */
  loadLocalRegistrations: () => Promise<DIDRegistration[]>;
  /** Delete a local DID registration. */
  deleteLocalRegistration: (didName: string) => Promise<void>;
  /** Check if another peer already registered this DID name. */
  checkDhtConflict: (didName: string) => Promise<boolean>;
}

export interface DIDRegistration {
  /** Human-readable DID name (e.g. "alice"). */
  didName: string;
  /** Full DID identifier: `did:envoy:<name>`. */
  did: string;
  /** Cryptographic owner ID: `envoy:owner:<hash>`. */
  ownerId: string;
  /** Peer ID for mesh connectivity. */
  peerId: string;
  /** When this registration was created. */
  registeredAt: string;
}

export interface DIDLookupResult {
  /** Whether the DID name was found. */
  found: boolean;
  /** The DID registration if found. */
  registration?: DIDRegistration;
  /** Human-readable error if not found. */
  error?: string;
}

export interface DIDLookupDeps {
  /** Find providers for a DID name on the DHT. */
  findOnDht: (didName: string) => Promise<Array<{ ownerId: string; peerId: string }>>;
  /** Check local cache for a DID registration. */
  lookupLocalCache: (didName: string) => Promise<DIDRegistration | null>;
}

/**
 * Valid DID name format: alphanumeric + hyphens, 3-32 chars, no leading/trailing hyphens.
 */
const DID_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

/**
 * Validate a DID name before registration.
 */
export function validateDIDName(name: string): { valid: boolean; reason?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, reason: "name cannot be empty" };
  }
  const normalized = name.toLowerCase().trim();
  if (normalized.length < 3) {
    return { valid: false, reason: "name must be at least 3 characters" };
  }
  if (normalized.length > 32) {
    return { valid: false, reason: "name must be at most 32 characters" };
  }
  if (!DID_NAME_PATTERN.test(normalized)) {
    return { valid: false, reason: "name must be alphanumeric with hyphens, no leading/trailing hyphens" };
  }
  // Reserved names
  const reserved = new Set(["envoy", "admin", "system", "root", "mod", "owner", "agent", "device", "peer"]);
  if (reserved.has(normalized)) {
    return { valid: false, reason: `"${normalized}" is a reserved name` };
  }
  return { valid: true };
}

/**
 * Register a DID name on the DHT.
 * Fails if the name is already taken by another peer.
 */
export async function registerDIDName(
  deps: DIDRegistrationDeps,
  name: string,
): Promise<{ ok: boolean; registration?: DIDRegistration; error?: string }> {
  const validation = validateDIDName(name);
  if (!validation.valid) {
    return { ok: false, error: validation.reason };
  }

  const normalized = name.toLowerCase().trim();
  const did = `did:envoy:${normalized}`;

  // Check if already registered locally
  const existing = await deps.loadLocalRegistrations();
  const localMatch = existing.find((r) => r.didName === normalized);
  if (localMatch && localMatch.ownerId === deps.ownerId) {
    return { ok: true, registration: localMatch, error: "already registered" };
  }

  // Check DHT for conflicts
  const conflict = await deps.checkDhtConflict(normalized);
  if (conflict) {
    return { ok: false, error: `"${normalized}" is already registered by another peer` };
  }

  // Advertise on DHT
  await deps.advertiseOnDht(normalized, deps.ownerId, deps.peerId);

  const registration: DIDRegistration = {
    didName: normalized,
    did,
    ownerId: deps.ownerId,
    peerId: deps.peerId,
    registeredAt: new Date().toISOString(),
  };

  await deps.saveLocalRegistration(registration);

  return { ok: true, registration };
}

/**
 * Unregister a DID name from the DHT.
 */
export async function unregisterDIDName(
  deps: DIDRegistrationDeps,
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const normalized = name.toLowerCase().trim();
  await deps.removeFromDht(normalized);
  await deps.deleteLocalRegistration(normalized);
  return { ok: true };
}

/**
 * Look up a DID name and resolve it to an owner ID.
 * Checks local cache first, then falls back to DHT.
 */
export async function lookupDIDName(
  deps: DIDLookupDeps,
  name: string,
): Promise<DIDLookupResult> {
  const validation = validateDIDName(name);
  if (!validation.valid) {
    return { found: false, error: validation.reason };
  }

  const normalized = name.toLowerCase().trim();

  // Check local cache first
  const cached = await deps.lookupLocalCache(normalized);
  if (cached) {
    return { found: true, registration: cached };
  }

  // Query DHT
  const providers = await deps.findOnDht(normalized);
  if (providers.length === 0) {
    return { found: false, error: `no peer found for did:envoy:${normalized}` };
  }

  const provider = providers[0];
  return {
    found: true,
    registration: {
      didName: normalized,
      did: `did:envoy:${normalized}`,
      ownerId: provider.ownerId,
      peerId: provider.peerId,
      registeredAt: new Date().toISOString(),
    },
  };
}

/**
 * Build a DID document (W3C format) from an owner identity.
 */
export function buildDIDDocument(
  registration: DIDRegistration,
  publicKeyPem: string,
  relayMultiaddr?: string,
): Record<string, unknown> {
  return {
    "@context": ["https://www.w3.org/ns/did/v1"],
    id: registration.did,
    alsoKnownAs: [registration.ownerId],
    verificationMethod: [{
      id: `${registration.did}#key-1`,
      type: "Ed25519VerificationKey2020",
      controller: registration.did,
      publicKeyPem,
    }],
    authentication: [`${registration.did}#key-1`],
    service: relayMultiaddr ? [{
      id: `${registration.did}#relay`,
      type: "EnvoyMeshRelay",
      serviceEndpoint: relayMultiaddr,
    }] : [],
  };
}
