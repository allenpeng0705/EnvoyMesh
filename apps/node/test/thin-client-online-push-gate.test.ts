/**
 * Push skip-if-online must track EnvoyGo thin-client WS presence, not
 * owner presence (`isOwnerOnline`). Desktop Social keeps the owner
 * "online" via activity / default-true status — that must not suppress
 * pushes to a killed phone.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createDeviceCertificate,
  generateDeviceIdentity,
  generateOwnerIdentity,
} from "@envoymesh/identity";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NodeServiceImpl } from "../src/node-service-impl.js";

describe("isThinClientOnline — push skip gate", () => {
  let profileDir: string;
  let svc: NodeServiceImpl;
  let ownerId: string;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "thin-client-online-"));
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    ownerId = owner.ownerId;
    const profile = {
      owner,
      device,
      deviceCertificate: createDeviceCertificate({
        owner,
        device,
        deviceProfile: "primary",
        capabilities: ["mesh.listen", "message.send"],
      }),
    };
    svc = new NodeServiceImpl(
      undefined,
      createLocalTrustStore(profileDir),
      createLocalPeerDirectoryStore(profileDir),
      createHumanProfileStore(profileDir),
      profileDir,
      profile,
    );
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it("is offline when no thin-client checker is bound (allows push)", () => {
    expect(svc.isThinClientOnline()).toBe(false);
    expect(svc.isThinClientOnline(ownerId)).toBe(false);
  });

  it("follows WsServer.hasClientForOwner when bound", () => {
    let online = false;
    svc.bindThinClientOnlineCheck((id) => id === ownerId && online);

    expect(svc.isThinClientOnline()).toBe(false);
    online = true;
    expect(svc.isThinClientOnline()).toBe(true);
    expect(svc.isThinClientOnline(ownerId)).toBe(true);
    expect(svc.isThinClientOnline("envoy:owner:other")).toBe(false);
  });

  it("stays independent of isOwnerOnline (Social activity must not suppress push)", async () => {
    // isOwnerOnline mirrors thin-client WS presence when wired; when unbound
    // both read offline. Desktop Social activity must not flip push gating.
    expect(await svc.isOwnerOnline()).toBe(false);
    expect(svc.isThinClientOnline()).toBe(false);

    svc.recordOwnerActivity();
    expect(await svc.isOwnerOnline()).toBe(false);
    expect(svc.isThinClientOnline()).toBe(false);
  });
});
