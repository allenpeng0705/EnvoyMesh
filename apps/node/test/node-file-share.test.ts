/**
 * Phase 8M — outbound file send via data transfer (node-file-share.ts).
 *
 * Tests sendVaultFileViaDataTransfer:
 * - reads vault file, computes SHA-256, signs voucher, chunks at 64KB, calls mesh.sendDataTransfer
 * - rejects unsafe vault path
 * - audits outbound data transfer
 */
import { createDeviceCertificate, generateDeviceIdentity, generateOwnerIdentity } from "@envoymesh/identity";
import { createLocalTaskStore } from "@envoymesh/local-store";
import { ENVOY_DATA_PROTOCOL } from "@envoymesh/network/protocols";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendVaultFileViaDataTransfer } from "../src/node-file-share.js";

let profileDir: string;
let vaultDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-file-share-out-"));
  vaultDir = join(profileDir, "vault");
  await mkdir(vaultDir, { recursive: true });
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

function testProfile(ownerId: string) {
  const owner = generateOwnerIdentity();
  // Override ownerId to match expected value
  owner.ownerId = ownerId;
  const device = generateDeviceIdentity();
  return {
    owner,
    device,
    deviceCertificate: createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["message.send", "mesh.listen"],
    }),
  };
}

function mockTransferMesh(overrides: Record<string, unknown> = {}) {
  return {
    peerId: "12D3KooMock",
    getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: true, direct: true }),
    closeConnectionsToPeer: vi.fn().mockResolvedValue(undefined),
    ensurePeerReachable: vi.fn().mockResolvedValue({ connected: true }),
    ...overrides,
  };
}

describe("sendVaultFileViaDataTransfer", () => {
  it("reads file, signs voucher, chunks content, and calls mesh.sendDataTransfer", async () => {
    const profile = testProfile("envoy:owner:sender-test");
    const taskStore = createLocalTaskStore(profileDir);
    await mkdir(join(vaultDir, "notes"), { recursive: true });
    await writeFile(join(vaultDir, "notes/readme.md"), "hello world from vault", { mode: 0o600 });

    let capturedArgs: { toPeerId: string; voucher: Uint8Array; chunks: Uint8Array[] } | null = null;
    const mesh = mockTransferMesh({
      peerId: "12D3KooLocalSender",
      sendDataTransfer: vi.fn<any>().mockImplementation(async (toPeerId: string, voucher: Uint8Array, chunks: Uint8Array[]) => {
        capturedArgs = { toPeerId, voucher, chunks };
        return 42;
      }),
    });

    await sendVaultFileViaDataTransfer({
      mesh: mesh as any,
      profile,
      taskStore,
      vaultDir,
      relativePath: "notes/readme.md",
      toPeerId: "12D3KooRemoteReceiver",
    });

    expect(mesh.sendDataTransfer).toHaveBeenCalledTimes(1);
    expect(capturedArgs!.toPeerId).toBe("12D3KooRemoteReceiver");

    // Verify voucher is valid JSON
    const voucherStr = new TextDecoder().decode(capturedArgs!.voucher);
    const voucher = JSON.parse(voucherStr);
    expect(voucher.relativePath).toBe("notes/readme.md");
    expect(voucher.issuerPeerId).toBe("12D3KooLocalSender");
    expect(voucher.issuerOwnerId).toBe("envoy:owner:sender-test");
    expect(voucher.totalBytes).toBe(22); // "hello world from vault".length
    expect(voucher.contentHash).toBeTruthy(); // base64url hash

    // Verify content hash
    const expectedHash = createHash("sha256").update(Buffer.from("hello world from vault")).digest("base64url");
    expect(voucher.contentHash).toBe(expectedHash);

    // Verify chunks (25 bytes fits in one 64KB chunk)
    expect(capturedArgs!.chunks).toHaveLength(1);
    expect(new TextDecoder().decode(capturedArgs!.chunks[0])).toBe("hello world from vault");
  });

  it("chunks large file at 64KB boundary", async () => {
    const profile = testProfile("envoy:owner:chunk-test");
    const taskStore = createLocalTaskStore(profileDir);
    const content = "x".repeat(200 * 1024); // 200KB — 4 chunks of 64KB
    await writeFile(join(vaultDir, "large.bin"), content, { mode: 0o600 });

    let capturedChunks: Uint8Array[] = [];
    const mesh = mockTransferMesh({
      peerId: "12D3KooChunkTest",
      sendDataTransfer: vi.fn<any>().mockImplementation(async (_to: string, _v: Uint8Array, chunks: Uint8Array[]) => {
        capturedChunks = chunks;
        return 10;
      }),
    });

    await sendVaultFileViaDataTransfer({
      mesh: mesh as any,
      profile,
      taskStore,
      vaultDir,
      relativePath: "large.bin",
      toPeerId: "12D3KooReceiver",
    });

    expect(capturedChunks).toHaveLength(4);
    expect(capturedChunks[0].byteLength).toBe(64 * 1024);
    expect(capturedChunks[1].byteLength).toBe(64 * 1024);
    expect(capturedChunks[2].byteLength).toBe(64 * 1024);
    expect(capturedChunks[3].byteLength).toBe(8 * 1024); // remainder

    // Verify full content
    const combined = Buffer.concat(capturedChunks.map((c) => Buffer.from(c))).toString();
    expect(combined).toBe(content);
  });

  it("rejects unsafe vault path", async () => {
    const profile = testProfile("envoy:owner:unsafe-test");
    const taskStore = createLocalTaskStore(profileDir);

    const mesh = {
      peerId: "12D3KooUnsafe",
      sendDataTransfer: vi.fn(),
    };

    await expect(
      sendVaultFileViaDataTransfer({
        mesh: mesh as any,
        profile,
        taskStore,
        vaultDir,
        relativePath: "../../etc/passwd",
        toPeerId: "12D3KooEvil",
      }),
    ).rejects.toThrow("Unsafe vault path for data transfer");

    expect(mesh.sendDataTransfer).not.toHaveBeenCalled();
  });

  it("rejects path with traversal attempt", async () => {
    const profile = testProfile("envoy:owner:abs-test");
    const taskStore = createLocalTaskStore(profileDir);

    const mesh = { peerId: "12D3KooAbs", sendDataTransfer: vi.fn() };

    // Traversal attempt: "a/../b" contains ".." and is blocked by isSafeVaultPath
    await expect(
      sendVaultFileViaDataTransfer({
        mesh: mesh as any,
        profile,
        taskStore,
        vaultDir,
        relativePath: "a/../etc/passwd",
        toPeerId: "12D3KooEvil",
      }),
    ).rejects.toThrow("Unsafe vault path for data transfer");

    expect(mesh.sendDataTransfer).not.toHaveBeenCalled();
  });

  it("normalizes leading slash in relativePath", async () => {
    const profile = testProfile("envoy:owner:norm-test");
    const taskStore = createLocalTaskStore(profileDir);
    await mkdir(join(vaultDir, "data"), { recursive: true });
    await writeFile(join(vaultDir, "data/file.txt"), "content here", { mode: 0o600 });

    let capturedPath: string | null = null;
    const mesh = mockTransferMesh({
      peerId: "12D3KooNorm",
      sendDataTransfer: vi.fn<any>().mockImplementation(async (_: string, v: Uint8Array, _c: Uint8Array[]) => {
        const parsed = JSON.parse(new TextDecoder().decode(v));
        capturedPath = parsed.relativePath;
        return 5;
      }),
    });

    await sendVaultFileViaDataTransfer({
      mesh: mesh as any,
      profile,
      taskStore,
      vaultDir,
      relativePath: "/data/file.txt",
      toPeerId: "12D3KooReceiver",
    });

    expect(capturedPath).toBe("data/file.txt"); // leading slash stripped
  });

  it("audits outbound data transfer with protocol field", async () => {
    const profile = testProfile("envoy:owner:audit-test");
    const taskStore = createLocalTaskStore(profileDir);
    await writeFile(join(vaultDir, "audit.txt"), "audit content", { mode: 0o600 });

    const mesh = mockTransferMesh({
      peerId: "12D3KooAudit",
      sendDataTransfer: vi.fn<any>().mockResolvedValue(10),
    });

    await sendVaultFileViaDataTransfer({
      mesh: mesh as any,
      profile,
      taskStore,
      vaultDir,
      relativePath: "audit.txt",
      toPeerId: "12D3KooRecipient",
    });

    const audits = await taskStore.readAuditEvents();
    const dataAudit = audits.find((a) => a.intent === "sync.state" && a.remotePeerId === "12D3KooRecipient");
    expect(dataAudit).toBeDefined();
    expect(dataAudit!.type).toBe("message.sent");
    expect(dataAudit!.protocol).toBe(ENVOY_DATA_PROTOCOL);
    expect(dataAudit!.outcome).toBe("record");
    expect(dataAudit!.summary).toContain("Sent data transfer");
    expect(dataAudit!.summary).toContain("audit.txt");
  });
});