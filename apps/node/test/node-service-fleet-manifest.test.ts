import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createLocalFleetManifestStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
  type FleetManifestRecord,
  type LocalPeerDirectoryStore,
  type LocalTrustStore,
  type TrustRecord,
} from "@envoymesh/local-store";
import {
  deriveOwnerId,
  generateEd25519KeyPair,
  signCanonicalPayload,
} from "@envoymesh/identity";
import {
  fleetManifestForSigning,
  type FleetManifest,
  type FleetMember,
  type UnsignedFleetManifest,
} from "@envoymesh/protocol";
import {
  createFleetManifestViaRuntime,
  importFleetManifestViaRuntime,
  listFleetManifestsViaRuntime,
  revokeFleetManifestViaRuntime,
  type FleetManifestRuntimeContext,
} from "../src/node-service-fleet-manifest.js";
import type { NodeProfile } from "@envoymesh/api";

const NOW = new Date("2026-06-16T12:00:00.000Z");

interface IssuerKey {
  ownerId: string;
  publicKeyPem: string;
  privateKeyPem: string;
}

function makeIssuer(): IssuerKey {
  const { publicKeyPem, privateKeyPem } = generateEd25519KeyPair();
  return { ownerId: deriveOwnerId(publicKeyPem), publicKeyPem, privateKeyPem };
}

function makeMember(label: string): {
  member: FleetMember;
  deviceId: string;
  publicKeyPem: string;
} {
  const { publicKeyPem } = generateEd25519KeyPair();
  return {
    member: {
      ownerId: `envoy:owner:${label}`,
      deviceId: `dev-${label}`,
      devicePublicKeyPem: publicKeyPem,
      role: "agent",
      trustLevel: "direct",
      displayName: `Device ${label}`,
    },
    deviceId: `dev-${label}`,
    publicKeyPem,
  };
}

function signManifest(
  unsigned: UnsignedFleetManifest,
  privateKeyPem: string,
): FleetManifest {
  const signature = signCanonicalPayload(
    fleetManifestForSigning({ ...unsigned, signature: "placeholder" }),
    privateKeyPem,
  );
  return { ...unsigned, signature };
}

interface Setup {
  trustStore: LocalTrustStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
  manifestStore: ReturnType<typeof createLocalFleetManifestStore>;
  profile: NodeProfile;
}

async function setupLocalStore(): Promise<Setup> {
  const dir = await mkdtemp(join(tmpdir(), "fleet-manifest-runtime-"));
  const trustStore = createLocalTrustStore(dir);
  const peerDirectoryStore = createLocalPeerDirectoryStore(dir);
  const manifestStore = createLocalFleetManifestStore(dir);
  // Use a different owner for the local node, otherwise the walker rejects
  // every manifest as "self-bond".
  const localOwnerKeys = makeIssuer();
  const profile: NodeProfile = {
    version: "0.1",
    profileId: "local-profile",
    owner: {
      ownerId: localOwnerKeys.ownerId,
      publicKeyPem: localOwnerKeys.publicKeyPem,
      privateKeyPem: localOwnerKeys.privateKeyPem,
    },
  };
  return { trustStore, peerDirectoryStore, manifestStore, profile };
}

describe("importFleetManifestViaRuntime", () => {
  let setup: Setup;
  let profileDir: string;
  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "fleet-manifest-runtime-"));
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    const manifestStore = createLocalFleetManifestStore(profileDir);
    const localOwnerKeys = makeIssuer();
    setup = {
      trustStore,
      peerDirectoryStore,
      manifestStore,
      profile: {
        version: "0.1",
        profileId: "local-profile",
        owner: {
          ownerId: localOwnerKeys.ownerId,
          publicKeyPem: localOwnerKeys.publicKeyPem,
          privateKeyPem: localOwnerKeys.privateKeyPem,
        },
      },
    };
  });
  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  function makeContext(): FleetManifestRuntimeContext {
    return {
      trustStore: setup.trustStore,
      peerDirectoryStore: setup.peerDirectoryStore,
      manifestStore: {
        saveFleetManifest: (record) => setup.manifestStore.saveManifest(record),
        getFleetManifest: (id) => setup.manifestStore.getManifest(id),
        listFleetManifests: () => setup.manifestStore.listManifests(),
        revokeFleetManifest: (id, at) => setup.manifestStore.revokeManifest(id, at),
      },
      profile: setup.profile,
      now: () => NOW,
    };
  }

  it("imports a manifest and pre-stages a trust record per member", async () => {
    const issuer = makeIssuer();
    const m1 = makeMember("1");
    const m2 = makeMember("2");
    const manifest = signManifest(
      {
        version: "0.1",
        manifestId: "m-1",
        issuerOwnerId: issuer.ownerId,
        issuerOwnerPublicKeyPem: issuer.publicKeyPem,
        label: "Acme Q3",
        issuedAt: NOW.toISOString(),
        expiresAt: null,
        members: [m1.member, m2.member],
      },
      issuer.privateKeyPem,
    );
    const ctx = makeContext();
    const result = await importFleetManifestViaRuntime(ctx, { manifest });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.added).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.skipped).toEqual([]);
    expect(result.record.manifestId).toBe("m-1");
    expect(result.record.label).toBe("Acme Q3");
    expect(result.record.memberCount).toBe(2);
    expect(result.record.preStagedOwnerIds).toEqual([
      m1.member.ownerId,
      m2.member.ownerId,
    ]);

    const trust1 = await setup.trustStore.getTrustRecord(m1.member.ownerId);
    expect(trust1?.level).toBe("direct");
    expect(trust1?.note).toContain("fleet-manifest:m-1:agent");
  });

  it("rejects a manifest with a bad signature", async () => {
    const issuer = makeIssuer();
    const m1 = makeMember("1");
    const manifest = signManifest(
      {
        version: "0.1",
        manifestId: "m-2",
        issuerOwnerId: issuer.ownerId,
        issuerOwnerPublicKeyPem: issuer.publicKeyPem,
        issuedAt: NOW.toISOString(),
        expiresAt: null,
        members: [m1.member],
      },
      issuer.privateKeyPem,
    );
    // Tamper with the signature.
    const tampered: FleetManifest = {
      ...manifest,
      signature: manifest.signature.replace(/.$/, (c) => (c === "A" ? "B" : "A")),
    };
    const result = await importFleetManifestViaRuntime(makeContext(), {
      manifest: tampered,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected fail");
    expect(result.reason).toBe("invalid-signature");
  });

  it("rejects a manifest whose issuerOwnerId does not match the key", async () => {
    const realIssuer = makeIssuer();
    const fakeIssuer = makeIssuer();
    const m1 = makeMember("1");
    const manifest = signManifest(
      {
        version: "0.1",
        manifestId: "m-3",
        issuerOwnerId: fakeIssuer.ownerId, // claim fake
        issuerOwnerPublicKeyPem: realIssuer.publicKeyPem, // sign with real
        issuedAt: NOW.toISOString(),
        expiresAt: null,
        members: [m1.member],
      },
      realIssuer.privateKeyPem,
    );
    const result = await importFleetManifestViaRuntime(makeContext(), {
      manifest,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected fail");
    expect(result.reason).toBe("issuer-mismatch");
  });

  it("rejects an expired manifest", async () => {
    const issuer = makeIssuer();
    const m1 = makeMember("1");
    const manifest = signManifest(
      {
        version: "0.1",
        manifestId: "m-4",
        issuerOwnerId: issuer.ownerId,
        issuerOwnerPublicKeyPem: issuer.publicKeyPem,
        issuedAt: "2020-01-01T00:00:00.000Z",
        expiresAt: "2020-01-02T00:00:00.000Z",
        members: [m1.member],
      },
      issuer.privateKeyPem,
    );
    const result = await importFleetManifestViaRuntime(makeContext(), {
      manifest,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected fail");
    expect(result.reason).toBe("expired");
  });

  it("rejects a self-bond (manifest includes the local owner)", async () => {
    const localOwnerKeys = makeIssuer();
    // Re-key setup with the same owner as the local node.
    setup.profile = {
      version: "0.1",
      profileId: "local-profile",
      owner: {
        ownerId: localOwnerKeys.ownerId,
        publicKeyPem: localOwnerKeys.publicKeyPem,
        privateKeyPem: localOwnerKeys.privateKeyPem,
      },
    };
    const m1 = makeMember("1");
    const manifest = signManifest(
      {
        version: "0.1",
        manifestId: "m-5",
        issuerOwnerId: localOwnerKeys.ownerId,
        issuerOwnerPublicKeyPem: localOwnerKeys.publicKeyPem,
        issuedAt: NOW.toISOString(),
        expiresAt: null,
        members: [m1.member, {
          ownerId: localOwnerKeys.ownerId, // self
          deviceId: "self-device",
          devicePublicKeyPem: localOwnerKeys.publicKeyPem,
          role: "owner",
          trustLevel: "direct",
        }],
      },
      localOwnerKeys.privateKeyPem,
    );
    const result = await importFleetManifestViaRuntime(makeContext(), {
      manifest,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected fail");
    expect(result.reason).toBe("self-bond");
  });

  it("re-importing the same manifest is a no-op (already-imported)", async () => {
    const issuer = makeIssuer();
    const m1 = makeMember("1");
    const manifest = signManifest(
      {
        version: "0.1",
        manifestId: "m-6",
        issuerOwnerId: issuer.ownerId,
        issuerOwnerPublicKeyPem: issuer.publicKeyPem,
        issuedAt: NOW.toISOString(),
        expiresAt: null,
        members: [m1.member],
      },
      issuer.privateKeyPem,
    );
    const ctx = makeContext();
    const first = await importFleetManifestViaRuntime(ctx, { manifest });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("expected ok");
    const second = await importFleetManifestViaRuntime(ctx, { manifest });
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("expected ok");
    expect(second.added).toBe(0);
    expect(second.updated).toBe(0);
    expect(second.skipped).toEqual([
      { ownerId: m1.member.ownerId, reason: "already-imported" },
    ]);
  });

  it("concurrent imports of the same manifest are safely serialised", async () => {
    const issuer = makeIssuer();
    const m1 = makeMember("1");
    const m2 = makeMember("2");
    const manifest = signManifest(
      {
        version: "0.1",
        manifestId: "m-6b",
        issuerOwnerId: issuer.ownerId,
        issuerOwnerPublicKeyPem: issuer.publicKeyPem,
        issuedAt: NOW.toISOString(),
        expiresAt: null,
        members: [m1.member, m2.member],
      },
      issuer.privateKeyPem,
    );
    const ctx = makeContext();
    const [a, b] = await Promise.all([
      importFleetManifestViaRuntime(ctx, { manifest }),
      importFleetManifestViaRuntime(ctx, { manifest, force: true }),
    ]);
    // Both calls succeed, neither corrupts the manifest record, and the
    // trust store ends up with both members staged.
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    const t1 = await setup.trustStore.getTrustRecord(m1.member.ownerId);
    const t2 = await setup.trustStore.getTrustRecord(m2.member.ownerId);
    expect(t1?.note).toContain("fleet-manifest:m-6b");
    expect(t2?.note).toContain("fleet-manifest:m-6b");
  });

  it("re-importing with force=true re-applies trust levels", async () => {
    const issuer = makeIssuer();
    const m1 = makeMember("1");
    const manifest = signManifest(
      {
        version: "0.1",
        manifestId: "m-7",
        issuerOwnerId: issuer.ownerId,
        issuerOwnerPublicKeyPem: issuer.publicKeyPem,
        issuedAt: NOW.toISOString(),
        expiresAt: null,
        members: [m1.member],
      },
      issuer.privateKeyPem,
    );
    const ctx = makeContext();
    await importFleetManifestViaRuntime(ctx, { manifest });
    const forced = await importFleetManifestViaRuntime(ctx, {
      manifest,
      force: true,
    });
    expect(forced.ok).toBe(true);
    if (!forced.ok) throw new Error("expected ok");
    expect(forced.updated).toBe(1);
    expect(forced.added).toBe(0);
  });

  it("rejects a malformed manifest (empty members)", async () => {
    const issuer = makeIssuer();
    const manifest: FleetManifest = {
      version: "0.1",
      manifestId: "m-8",
      issuerOwnerId: issuer.ownerId,
      issuerOwnerPublicKeyPem: issuer.publicKeyPem,
      issuedAt: NOW.toISOString(),
      expiresAt: null,
      members: [],
      signature: "irrelevant",
    };
    const result = await importFleetManifestViaRuntime(makeContext(), {
      manifest,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected fail");
    expect(result.reason).toBe("malformed");
  });

  it("skips duplicate ownerIds in the same manifest", async () => {
    const issuer = makeIssuer();
    const m1 = makeMember("dup");
    const m2: FleetMember = {
      ...m1.member,
      deviceId: "different-device",
      devicePublicKeyPem: m1.publicKeyPem,
    };
    const manifest = signManifest(
      {
        version: "0.1",
        manifestId: "m-9",
        issuerOwnerId: issuer.ownerId,
        issuerOwnerPublicKeyPem: issuer.publicKeyPem,
        issuedAt: NOW.toISOString(),
        expiresAt: null,
        members: [m1.member, m2],
      },
      issuer.privateKeyPem,
    );
    const result = await importFleetManifestViaRuntime(makeContext(), {
      manifest,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.skipped).toEqual([
      {
        ownerId: m1.member.ownerId,
        reason: "duplicate-owner",
        detail: expect.stringContaining("2 devices"),
      },
    ]);
    expect(result.added).toBe(0);
  });

  it("applies the per-member role on the trust note", async () => {
    const issuer = makeIssuer();
    const m1 = makeMember("1");
    const m2 = { ...makeMember("2").member, role: "operator" };
    const manifest = signManifest(
      {
        version: "0.1",
        manifestId: "m-10",
        issuerOwnerId: issuer.ownerId,
        issuerOwnerPublicKeyPem: issuer.publicKeyPem,
        issuedAt: NOW.toISOString(),
        expiresAt: null,
        members: [m1.member, m2],
      },
      issuer.privateKeyPem,
    );
    const ctx = makeContext();
    await importFleetManifestViaRuntime(ctx, { manifest });
    const t1 = await setup.trustStore.getTrustRecord(m1.member.ownerId);
    const t2 = await setup.trustStore.getTrustRecord(m2.ownerId);
    expect(t1?.note).toContain(":agent");
    expect(t2?.note).toContain(":operator");
  });

  it("listFleetManifestsViaRuntime returns every imported manifest", async () => {
    const issuer = makeIssuer();
    const m1 = makeMember("1");
    const manifest = signManifest(
      {
        version: "0.1",
        manifestId: "m-11",
        issuerOwnerId: issuer.ownerId,
        issuerOwnerPublicKeyPem: issuer.publicKeyPem,
        issuedAt: NOW.toISOString(),
        expiresAt: null,
        members: [m1.member],
      },
      issuer.privateKeyPem,
    );
    const ctx = makeContext();
    await importFleetManifestViaRuntime(ctx, { manifest });
    const list = await listFleetManifestsViaRuntime(ctx);
    expect(list).toHaveLength(1);
    expect(list[0].manifestId).toBe("m-11");
  });

  it("revokeFleetManifestViaRuntime resets pre-staged trust records", async () => {
    const issuer = makeIssuer();
    const m1 = makeMember("1");
    const manifest = signManifest(
      {
        version: "0.1",
        manifestId: "m-12",
        issuerOwnerId: issuer.ownerId,
        issuerOwnerPublicKeyPem: issuer.publicKeyPem,
        issuedAt: NOW.toISOString(),
        expiresAt: null,
        members: [m1.member],
      },
      issuer.privateKeyPem,
    );
    const ctx = makeContext();
    await importFleetManifestViaRuntime(ctx, { manifest });
    const trust = await setup.trustStore.getTrustRecord(m1.member.ownerId);
    expect(trust?.level).toBe("direct");
    const revoke = await revokeFleetManifestViaRuntime(ctx, "m-12");
    expect(revoke.ok).toBe(true);
    if (!revoke.ok) throw new Error("expected ok");
    expect(revoke.cleared).toBe(1);
    const trustAfter = await setup.trustStore.getTrustRecord(m1.member.ownerId);
    expect(trustAfter?.level).toBe("public");
    expect(trustAfter?.note).toContain("revoked from fleet-manifest m-12");
  });

  it("rejects a manifest that's been locally revoked", async () => {
    const issuer = makeIssuer();
    const m1 = makeMember("1");
    const manifest = signManifest(
      {
        version: "0.1",
        manifestId: "m-13",
        issuerOwnerId: issuer.ownerId,
        issuerOwnerPublicKeyPem: issuer.publicKeyPem,
        issuedAt: NOW.toISOString(),
        expiresAt: null,
        members: [m1.member],
      },
      issuer.privateKeyPem,
    );
    const ctx = makeContext();
    await importFleetManifestViaRuntime(ctx, { manifest });
    await revokeFleetManifestViaRuntime(ctx, "m-13");
    const result = await importFleetManifestViaRuntime(ctx, { manifest });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected fail");
    expect(result.reason).toBe("invalid-signature");
    expect(result.detail).toContain("revoked");
  });

  it("creates a signed manifest via createFleetManifestViaRuntime", async () => {
    const ctx = {
      profile: setup.profile,
      now: () => NOW,
    };
    const m1 = makeMember("1");
    const result = await createFleetManifestViaRuntime(ctx, {
      label: "Acme Q3",
      members: [m1.member],
    });
    expect("manifest" in result).toBe(true);
    if (!("manifest" in result)) throw new Error("expected manifest");
    expect(result.manifest.issuerOwnerId).toBe(setup.profile.owner?.ownerId);
    expect(result.manifest.signature.length).toBeGreaterThan(10);
    expect(result.manifest.members).toHaveLength(1);
  });
});
