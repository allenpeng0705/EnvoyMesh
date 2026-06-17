import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDeviceCertificate,
  generateDeviceIdentity,
  generateOwnerIdentity,
} from "@envoymesh/identity";
import {
  createDeviceAuthorizationStore,
  type DeviceAuthorizationStore,
} from "../src/device-authorization-store.js";

let dir: string;
let store: DeviceAuthorizationStore;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "envoymesh-device-auth-"));
  store = createDeviceAuthorizationStore(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("device-authorization-store", () => {
  it("registers, lists, and revokes authorized devices", async () => {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const certificate = createDeviceCertificate({
      owner,
      device,
      deviceProfile: "satellite",
      capabilities: ["message.send"],
    });

    await store.registerAuthorizedDevice({
      deviceId: device.deviceId,
      devicePublicKeyPem: device.publicKeyPem,
      certificateId: certificate.certificateId,
      deviceProfile: "satellite",
      displayName: "Phone",
      pairedAt: new Date().toISOString(),
    });

    const listed = await store.listAuthorizedDevices();
    expect(listed).toHaveLength(1);
    expect(listed[0].deviceId).toBe(device.deviceId);
    expect(listed[0].revoked).toBe(false);

    const revocation = await store.revokeDevice({
      owner,
      deviceId: device.deviceId,
      certificateId: certificate.certificateId,
      reason: "compromised",
    });
    expect(revocation.deviceId).toBe(device.deviceId);

    const after = await store.listAuthorizedDevices();
    expect(after[0].revoked).toBe(true);
    expect(await store.isCertificateRevoked(certificate, owner.publicKeyPem)).toBe(true);
  });

  it("re-pairing the same device preserves the original pairedAt and refreshes lastSeenAt", async () => {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const firstCertificate = createDeviceCertificate({
      owner,
      device,
      deviceProfile: "satellite",
      capabilities: ["message.send"],
    });
    const firstPairedAt = "2024-01-01T00:00:00.000Z";
    const laterPairedAt = "2024-06-01T00:00:00.000Z";

    await store.registerAuthorizedDevice({
      deviceId: device.deviceId,
      devicePublicKeyPem: device.publicKeyPem,
      certificateId: firstCertificate.certificateId,
      deviceProfile: "satellite",
      displayName: "Phone",
      pairedAt: firstPairedAt,
    });

    // Re-pair the same physical device: new certificate (e.g. new keypair
    // on the device, or a new cert issued at the home node), later timestamp.
    // The store should keep the original `pairedAt` and refresh `lastSeenAt`.
    const newPublicKey = device.publicKeyPem; // mobile reuses same key (post-fix)
    const secondCertificate = createDeviceCertificate({
      owner,
      device: { ...device, publicKeyPem: newPublicKey },
      deviceProfile: "satellite",
      capabilities: ["message.send"],
    });
    await store.registerAuthorizedDevice({
      deviceId: device.deviceId,
      devicePublicKeyPem: newPublicKey,
      certificateId: secondCertificate.certificateId,
      deviceProfile: "satellite",
      displayName: "Phone",
      pairedAt: laterPairedAt,
    });

    const [record] = await store.listAuthorizedDevices();
    expect(record).toBeDefined();
    expect(record!.pairedAt).toBe(firstPairedAt);
    expect(record!.lastSeenAt).toBe(laterPairedAt);
  });

  describe("mergeAuthorizedDevices", () => {
    it("merges duplicate records: keeps canonical, revokes duplicates, returns revocations", async () => {
      const owner = generateOwnerIdentity();
      // Three distinct devices (different keypairs) all sharing the same
      // display name — the pre-fix historical state.
      const deviceA = generateDeviceIdentity();
      const deviceB = generateDeviceIdentity();
      const deviceC = generateDeviceIdentity();
      const certA = createDeviceCertificate({ owner, device: deviceA, deviceProfile: "satellite" });
      const certB = createDeviceCertificate({ owner, device: deviceB, deviceProfile: "satellite" });
      const certC = createDeviceCertificate({ owner, device: deviceC, deviceProfile: "satellite" });

      const t0 = "2024-01-01T00:00:00.000Z";
      const t1 = "2024-02-01T00:00:00.000Z";
      const t2 = "2024-03-01T00:00:00.000Z";
      await store.registerAuthorizedDevice({
        deviceId: deviceA.deviceId, devicePublicKeyPem: deviceA.publicKeyPem,
        certificateId: certA.certificateId, deviceProfile: "satellite",
        displayName: "Phone", pairedAt: t0,
      });
      await store.registerAuthorizedDevice({
        deviceId: deviceB.deviceId, devicePublicKeyPem: deviceB.publicKeyPem,
        certificateId: certB.certificateId, deviceProfile: "satellite",
        displayName: "Phone", pairedAt: t1,
      });
      await store.registerAuthorizedDevice({
        deviceId: deviceC.deviceId, devicePublicKeyPem: deviceC.publicKeyPem,
        certificateId: certC.certificateId, deviceProfile: "satellite",
        displayName: "Phone", pairedAt: t2,
      });

      // Merge B and C into A (keep A).
      const revocations = await store.mergeAuthorizedDevices({
        owner,
        keepDeviceId: deviceA.deviceId,
        mergeDeviceIds: [deviceB.deviceId, deviceC.deviceId],
        reason: "deduplicated",
      });
      expect(revocations).toHaveLength(2);
      expect(revocations.map((r) => r.deviceId).sort()).toEqual(
        [deviceB.deviceId, deviceC.deviceId].sort(),
      );
      expect(revocations.every((r) => r.reason === "deduplicated")).toBe(true);

      // The merge removes the duplicate records from the authorized list
      // (leaving only the canonical one), and emits revocation records
      // so the historical fact is auditable.
      const after = await store.listAuthorizedDevices();
      expect(after).toHaveLength(1);
      expect(after[0]?.deviceId).toBe(deviceA.deviceId);
      expect(after[0]?.revoked).toBe(false);
      const allRevocations = await store.listRevocations();
      expect(
        allRevocations
          .filter((r) => r.reason === "deduplicated")
          .map((r) => r.deviceId)
          .sort(),
      ).toEqual([deviceB.deviceId, deviceC.deviceId].sort());
    });

    it("throws when keepDeviceId is not in the authorized list", async () => {
      const owner = generateOwnerIdentity();
      const device = generateDeviceIdentity();
      await expect(
        store.mergeAuthorizedDevices({
          owner,
          keepDeviceId: device.deviceId,
          mergeDeviceIds: [],
        }),
      ).rejects.toThrow(/keepDeviceId .* is not in the authorized devices list/);
    });

    it("throws when any mergeDeviceId is not in the authorized list", async () => {
      const owner = generateOwnerIdentity();
      const deviceA = generateDeviceIdentity();
      const deviceB = generateDeviceIdentity(); // never registered
      await store.registerAuthorizedDevice({
        deviceId: deviceA.deviceId, devicePublicKeyPem: deviceA.publicKeyPem,
        certificateId: "cert-a", deviceProfile: "satellite",
        displayName: "Phone", pairedAt: "2024-01-01T00:00:00.000Z",
      });
      await expect(
        store.mergeAuthorizedDevices({
          owner,
          keepDeviceId: deviceA.deviceId,
          mergeDeviceIds: [deviceB.deviceId],
        }),
      ).rejects.toThrow(/deviceId .* is not in the authorized devices list/);
    });

    it("no-ops when mergeDeviceIds is empty (or contains only the keep id)", async () => {
      const owner = generateOwnerIdentity();
      const device = generateDeviceIdentity();
      await store.registerAuthorizedDevice({
        deviceId: device.deviceId, devicePublicKeyPem: device.publicKeyPem,
        certificateId: "cert-1", deviceProfile: "satellite",
        displayName: "Phone", pairedAt: "2024-01-01T00:00:00.000Z",
      });
      const out1 = await store.mergeAuthorizedDevices({
        owner,
        keepDeviceId: device.deviceId,
        mergeDeviceIds: [],
      });
      expect(out1).toEqual([]);
      const out2 = await store.mergeAuthorizedDevices({
        owner,
        keepDeviceId: device.deviceId,
        mergeDeviceIds: [device.deviceId], // deduped internally
      });
      expect(out2).toEqual([]);
      // The record is still in the list and not revoked.
      const after = await store.listAuthorizedDevices();
      expect(after).toHaveLength(1);
      expect(after[0]?.revoked).toBe(false);
    });

    it("replaces any pre-existing revocation for the merged devices", async () => {
      const owner = generateOwnerIdentity();
      const deviceA = generateDeviceIdentity();
      const deviceB = generateDeviceIdentity();
      await store.registerAuthorizedDevice({
        deviceId: deviceA.deviceId, devicePublicKeyPem: deviceA.publicKeyPem,
        certificateId: "cert-a", deviceProfile: "satellite",
        displayName: "Phone", pairedAt: "2024-01-01T00:00:00.000Z",
      });
      await store.registerAuthorizedDevice({
        deviceId: deviceB.deviceId, devicePublicKeyPem: deviceB.publicKeyPem,
        certificateId: "cert-b", deviceProfile: "satellite",
        displayName: "Phone", pairedAt: "2024-02-01T00:00:00.000Z",
      });
      // Pre-existing revocation for B.
      await store.revokeDevice({ owner, deviceId: deviceB.deviceId, reason: "retired" });
      const beforeRevocations = await store.listRevocations();
      expect(beforeRevocations.find((r) => r.deviceId === deviceB.deviceId)).toBeDefined();

      // Now merge B into A — the old "retired" revocation for B should be
      // replaced by a "deduplicated" one.
      await store.mergeAuthorizedDevices({
        owner,
        keepDeviceId: deviceA.deviceId,
        mergeDeviceIds: [deviceB.deviceId],
        reason: "deduplicated",
      });
      const afterRevocations = await store.listRevocations();
      const revForB = afterRevocations.filter((r) => r.deviceId === deviceB.deviceId);
      expect(revForB).toHaveLength(1);
      expect(revForB[0]?.reason).toBe("deduplicated");
    });
  });

  describe("pruneRevokedDevices", () => {
    it("removes entries that have a matching revocation record and returns their ids", async () => {
      const owner = generateOwnerIdentity();
      const deviceA = generateDeviceIdentity();
      const deviceB = generateDeviceIdentity();
      const deviceC = generateDeviceIdentity();
      await store.registerAuthorizedDevice({
        deviceId: deviceA.deviceId, devicePublicKeyPem: deviceA.publicKeyPem,
        certificateId: "cert-a", deviceProfile: "satellite",
        displayName: "Phone-A", pairedAt: "2024-01-01T00:00:00.000Z",
      });
      await store.registerAuthorizedDevice({
        deviceId: deviceB.deviceId, devicePublicKeyPem: deviceB.publicKeyPem,
        certificateId: "cert-b", deviceProfile: "satellite",
        displayName: "Phone-B", pairedAt: "2024-02-01T00:00:00.000Z",
      });
      await store.registerAuthorizedDevice({
        deviceId: deviceC.deviceId, devicePublicKeyPem: deviceC.publicKeyPem,
        certificateId: "cert-c", deviceProfile: "satellite",
        displayName: "Phone-C", pairedAt: "2024-03-01T00:00:00.000Z",
      });
      // Revoke B and C; leave A active.
      await store.revokeDevice({ owner, deviceId: deviceB.deviceId, reason: "lost" });
      await store.revokeDevice({ owner, deviceId: deviceC.deviceId, reason: "compromised" });

      const pruned = await store.pruneRevokedDevices();
      expect(new Set(pruned)).toEqual(new Set([deviceB.deviceId, deviceC.deviceId]));

      // The authorized list now contains only A.
      const after = await store.listAuthorizedDevices();
      expect(after).toHaveLength(1);
      expect(after[0]?.deviceId).toBe(deviceA.deviceId);
      expect(after[0]?.revoked).toBe(false);
    });

    it("keeps revocation records (does not touch them) for audit history", async () => {
      const owner = generateOwnerIdentity();
      const device = generateDeviceIdentity();
      await store.registerAuthorizedDevice({
        deviceId: device.deviceId, devicePublicKeyPem: device.publicKeyPem,
        certificateId: "cert-1", deviceProfile: "satellite",
        displayName: "Phone", pairedAt: "2024-01-01T00:00:00.000Z",
      });
      await store.revokeDevice({ owner, deviceId: device.deviceId, reason: "lost" });

      const revocationsBefore = await store.listRevocations();
      expect(revocationsBefore).toHaveLength(1);

      await store.pruneRevokedDevices();

      const revocationsAfter = await store.listRevocations();
      expect(revocationsAfter).toHaveLength(1);
      expect(revocationsAfter[0]?.deviceId).toBe(device.deviceId);
    });

    it("returns an empty list and is a no-op when there is nothing to prune", async () => {
      const device = generateDeviceIdentity();
      await store.registerAuthorizedDevice({
        deviceId: device.deviceId, devicePublicKeyPem: device.publicKeyPem,
        certificateId: "cert-1", deviceProfile: "satellite",
        displayName: "Phone", pairedAt: "2024-01-01T00:00:00.000Z",
      });
      const pruned = await store.pruneRevokedDevices();
      expect(pruned).toEqual([]);
      const after = await store.listAuthorizedDevices();
      expect(after).toHaveLength(1);
    });
  });
});
