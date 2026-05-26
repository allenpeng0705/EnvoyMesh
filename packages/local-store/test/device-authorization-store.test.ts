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
});
