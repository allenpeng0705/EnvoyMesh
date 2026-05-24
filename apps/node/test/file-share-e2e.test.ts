/**
 * FS-B: verified inbound data write + optional vault-relative rename (matches acceptShare savePath).
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
import {
  createUnsignedDataTransferVoucher,
  type DataTransferVoucher,
} from "@envoymesh/protocol";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installEnvoyDataTransferReceiver } from "../src/data-transfer-inbound.js";
import { NodeServiceImpl } from "../src/node-service-impl.js";

const PEER_DIRECTORY_JSON = "peer-directory.json";

let profileDir: string;
let vaultDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-share-e2e-"));
  vaultDir = join(profileDir, "vault");
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

describe("inbound data transfer + savePath remapping", () => {
  it("writes renamed vault path when resolveInboundRelativePath maps voucher path", async () => {
    const aliceDevice = generateDeviceIdentity();
    const aliceOwner = generateOwnerIdentity();
    const REMOTE = "12D3KooTestSenderPeerIdForShareE2e";

    const taskStore = createLocalTaskStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    await mkdir(vaultDir, { recursive: true });
    await writeFile(
      join(profileDir, PEER_DIRECTORY_JSON),
      JSON.stringify({
        version: "0.1",
        records: [
          {
            version: "0.1",
            ownerId: aliceOwner.ownerId,
            peerId: REMOTE,
            deviceId: aliceDevice.deviceId,
            devicePublicKeyPem: aliceDevice.publicKeyPem,
            lastSeenAt: new Date().toISOString(),
            listenAddrs: [],
          },
        ],
      }),
      { mode: 0o600 },
    );

    type Handler = (x: {
      remotePeerId: string;
      voucher: Uint8Array;
      chunks: Uint8Array[];
    }) => Promise<void>;
    const handlers: Handler[] = [];
    const fakeMesh = {
      onDataTransfer(h: Handler) {
        handlers.push(h);
        return () => {};
      },
    };

    const sourceRel = "docs/original.txt";
    const targetRel = "incoming/renamed.txt";
    const body = Buffer.from("hello-fs-b-e2e", "utf8");
    const hash = createHash("sha256").update(body).digest("base64url");

    installEnvoyDataTransferReceiver({
      mesh: fakeMesh as any,
      peerDirectoryStore,
      taskStore,
      vaultDir,
      resolveInboundRelativePath: (_remote, voucherPath) => {
        const v = voucherPath.replace(/^[\\/]+/, "");
        if (v === sourceRel) return targetRel;
        return v;
      },
    });

    const now = new Date();
    const exp = new Date(now.getTime() + 3600_000);
    const unsigned = createUnsignedDataTransferVoucher({
      transferId: "t1",
      issuerPeerId: REMOTE,
      issuerOwnerId: aliceOwner.ownerId,
      issuerDeviceId: aliceDevice.deviceId,
      relativePath: sourceRel,
      totalBytes: body.length,
      contentHash: hash,
      issuedAt: now.toISOString(),
      expiresAt: exp.toISOString(),
    });
    const signed: DataTransferVoucher = createSignedDataTransferVoucher({
      unsigned: unsigned as any,
      devicePrivateKeyPem: aliceDevice.privateKeyPem,
    });
    const voucherUtf8 = voucherJsonBytesFromObject(signed);

    expect(handlers.length).toBe(1);
    await handlers[0]!({
      remotePeerId: REMOTE,
      voucher: signed,
      voucherUtf8,
      chunks: [new Uint8Array(body)],
    });

    const out = await readFile(join(vaultDir, targetRel), "utf8");
    expect(out).toBe("hello-fs-b-e2e");
  });

  it("acceptShare(savePath) registers path used by resolveInboundDataTransferRelativePath", async () => {
    const aliceOwner = generateOwnerIdentity();
    const aliceDevice = generateDeviceIdentity();
    const SENDER = "12D3KooSenderInAcceptTest";

    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    const humanProfileStore = { loadHumanProfile: async () => undefined } as any;

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

    const fakeMesh = {
      peerId: "local-peer",
      send: async () => 12,
      tagContactForPersistentReachability: async () => {},
      untagContactForPersistentReachability: async () => {},
      getPeerConnectionInfo: async () => ({ connected: false, direct: false }),
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

    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: aliceOwner.ownerId,
      peerId: SENDER,
      listenAddrs: [],
    });

    const shareId = "preview-msg-1";
    await node.recordInboundPushShareOffer({
      shareId,
      senderPeerId: SENDER,
      previewText: "p",
      sensitivity: "public",
      relativePath: "src/from.txt",
    });

    await node.acceptShare(shareId, "saved/here.txt");

    expect(node.resolveInboundDataTransferRelativePath(SENDER, "src/from.txt")).toBe("saved/here.txt");
    node.consumeInboundDataTransferSaveMapping(SENDER, "src/from.txt");
    expect(node.resolveInboundDataTransferRelativePath(SENDER, "src/from.txt")).toBe("src/from.txt");
  });
});
