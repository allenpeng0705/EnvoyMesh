/**
 * E2E: inbound share offer → Inbox list → accept(savePath) → vault write mapping.
 */
import {
  createDeviceCertificate,
  createSignedDataTransferVoucher,
  generateDeviceIdentity,
  generateOwnerIdentity,
} from "@envoymesh/identity";
import {
  createLocalPeerDirectoryStore,
  createLocalTaskStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import { voucherJsonBytesFromObject } from "@envoymesh/network";
import { createUnsignedDataTransferVoucher, type DataTransferVoucher } from "@envoymesh/protocol";
import { createHash } from "node:crypto";
import { readFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installEnvoyDataTransferReceiver } from "../src/data-transfer-inbound.js";
import { NodeServiceImpl } from "../src/node-service-impl.js";

const PEER_DIRECTORY_JSON = "peer-directory.json";

let profileDir: string;
let vaultDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-inbox-e2e-"));
  vaultDir = join(profileDir, "vault");
  await mkdir(vaultDir, { recursive: true });
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

describe("E2E share inbox accept + inbound write", () => {
  it("offer → list → accept(savePath) → verified transfer lands at chosen vault path", async () => {
    const aliceOwner = generateOwnerIdentity();
    const aliceDevice = generateDeviceIdentity();
    const SENDER = "12D3KooShareInboxE2eSender";

    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    const humanProfileStore = { loadHumanProfile: async () => undefined } as any;

    await writeFile(
      join(profileDir, PEER_DIRECTORY_JSON),
      JSON.stringify({
        version: "0.1",
        records: [
          {
            version: "0.1",
            ownerId: aliceOwner.ownerId,
            peerId: SENDER,
            deviceId: aliceDevice.deviceId,
            devicePublicKeyPem: aliceDevice.publicKeyPem,
            lastSeenAt: new Date().toISOString(),
            listenAddrs: [],
          },
        ],
      }),
      { mode: 0o600 },
    );

    const profile = {
      owner: aliceOwner,
      device: aliceDevice,
      deviceCertificate: createDeviceCertificate({
        owner: aliceOwner,
        device: aliceDevice,
        deviceProfile: "primary",
        capabilities: ["message.send", "mesh.listen"],
      }),
    };

    type Handler = (x: {
      remotePeerId: string;
      voucher: DataTransferVoucher;
      voucherUtf8: Uint8Array;
      chunks: Uint8Array[];
    }) => Promise<void>;
    const handlers: Handler[] = [];
    const fakeMesh = {
      peerId: "local-peer",
      send: async () => 12,
      tagContactForPersistentReachability: async () => {},
      untagContactForPersistentReachability: async () => {},
      getPeerConnectionInfo: () => ({ connected: false, direct: false }),
      ensurePeerReachable: async () => ({ connected: true, direct: true }),
      closeConnectionsToPeer: async () => 0,
      onDataTransfer(h: Handler) {
        handlers.push(h);
        return () => {};
      },
    };

    const node = new NodeServiceImpl(
      fakeMesh as any,
      trustStore,
      peerDirectoryStore,
      humanProfileStore,
      profileDir,
      profile,
      vaultDir,
    );
    node.bindCliTaskStore(taskStore);

    installEnvoyDataTransferReceiver({
      mesh: fakeMesh as any,
      peerDirectoryStore,
      taskStore,
      vaultDir,
      resolveInboundRelativePath: (remote, voucherPath) =>
        node.resolveInboundDataTransferRelativePath(remote, voucherPath),
      onInboundVaultWriteCommitted: (remote, sourcePath) =>
        node.consumeInboundDataTransferSaveMapping(remote, sourcePath),
    });

    const shareId = "preview-inbox-e2e-1";
    const sourceRel = "shared/photo.jpg";
    const saveRel = "inbox/accepted-photo.jpg";

    await node.recordInboundPushShareOffer({
      shareId,
      senderPeerId: SENDER,
      previewText: "Shared photo",
      sensitivity: "friends",
      relativePath: sourceRel,
    });

    const pending = await node.listPendingShareOffers();
    expect(pending).toHaveLength(1);
    expect(pending[0].shareId).toBe(shareId);
    expect(pending[0].senderVaultRelativePath).toBe(sourceRel);

    await node.acceptShare(shareId, saveRel);
    expect(await node.listPendingShareOffers()).toHaveLength(0);

    const body = Buffer.from("fake-jpeg-bytes-e2e", "utf8");
    const hash = createHash("sha256").update(body).digest("base64url");
    const now = new Date();
    const unsigned = createUnsignedDataTransferVoucher({
      transferId: "inbox-e2e-transfer",
      issuerPeerId: SENDER,
      issuerOwnerId: aliceOwner.ownerId,
      issuerDeviceId: aliceDevice.deviceId,
      relativePath: sourceRel,
      totalBytes: body.length,
      contentHash: hash,
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 3600_000).toISOString(),
    });
    const signed = createSignedDataTransferVoucher({
      unsigned: unsigned as any,
      devicePrivateKeyPem: aliceDevice.privateKeyPem,
    });

    expect(handlers.length).toBe(1);
    await handlers[0]!({
      remotePeerId: SENDER,
      voucher: signed,
      voucherUtf8: voucherJsonBytesFromObject(signed),
      chunks: [new Uint8Array(body)],
    });

    const written = await readFile(join(vaultDir, saveRel), "utf8");
    expect(written).toBe("fake-jpeg-bytes-e2e");
    expect(node.resolveInboundDataTransferRelativePath(SENDER, sourceRel)).toBe(sourceRel);
  });
});
