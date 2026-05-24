/**
 * Mobile verified vault file transfer (installMobileDataTransferReceiver / sendMobileVaultFileDataTransfer).
 */
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { byteStream } from "@libp2p/utils";
import {
  encodeDataTransferBody,
  parseInboundDataTransferBody,
  voucherJsonBytesFromObject,
} from "#network/data-framing";
import { ENVOY_DATA_PROTOCOL } from "#network/protocols";
import { createUnsignedDataTransferVoucher } from "@envoymesh/protocol";
import {
  createSignedDataTransferVoucher,
  generateDeviceIdentity,
  generateOwnerIdentity,
} from "@envoymesh/mobile-identity";
import { createMobileVault } from "@envoymesh/mobile-vault";
import {
  installMobileDataTransferReceiver,
  sendMobileVaultFileDataTransfer,
} from "../src/data-transfer.js";

const REMOTE_PEER = "12D3KooTestSenderPeerId";

function createInboundStream(body: Uint8Array) {
  const emitter = new EventEmitter();
  const stream = {
    remoteWriteStatus: "writable" as "writable" | "closed",
    readBufferLength: 0,
    addEventListener(type: string, listener: (...args: unknown[]) => void) {
      emitter.on(type, listener);
    },
    removeEventListener(type: string, listener: (...args: unknown[]) => void) {
      emitter.off(type, listener);
    },
    send: () => true,
    push: () => true,
    log: { error: () => {} },
    status: "open" as const,
    close: async () => {},
    closeRead: () => {
      stream.remoteWriteStatus = "closed";
      queueMicrotask(() => emitter.emit("remoteCloseWrite"));
    },
    abort: () => {},
  };
  queueMicrotask(() => {
    emitter.emit("message", { data: body.subarray() });
    stream.closeRead();
  });
  return stream;
}

function createWritableCaptureStream() {
  let written: Uint8Array | null = null;
  return {
    stream: {
      addEventListener: () => {},
      removeEventListener: () => {},
      send(data: Uint8Array) {
        written = data.subarray();
        return true;
      },
      push: () => true,
      log: { error: () => {} },
      status: "open" as const,
      close: async () => {},
    },
    getWritten: () => written,
  };
}

function signedTransferBody(input: {
  content: Uint8Array;
  relativePath: string;
  device: ReturnType<typeof generateDeviceIdentity>;
  owner: ReturnType<typeof generateOwnerIdentity>;
  issuerPeerId?: string;
  issuerDeviceId?: string;
  expiresAt?: string;
  /** Send different bytes than the voucher contentHash describes. */
  chunkOverride?: Uint8Array;
  /** Corrupt signature after signing. */
  tamperSignature?: boolean;
}) {
  const hash = createHash("sha256").update(input.content).digest("base64url");
  const unsigned = createUnsignedDataTransferVoucher({
    issuerPeerId: input.issuerPeerId ?? REMOTE_PEER,
    issuerOwnerId: input.owner.ownerId,
    issuerDeviceId: input.issuerDeviceId ?? input.device.deviceId,
    relativePath: input.relativePath,
    totalBytes: input.content.length,
    contentHash: hash,
    expiresAt: input.expiresAt,
  });
  let voucher = createSignedDataTransferVoucher({
    unsigned,
    devicePrivateKeyPem: input.device.privateKeyPem,
  });
  if (input.tamperSignature) {
    voucher = { ...voucher, signature: `${voucher.signature}x` };
  }
  const chunks = [input.chunkOverride ?? input.content];
  return encodeDataTransferBody(voucherJsonBytesFromObject(voucher), chunks);
}

function installTestReceiver(hooks: {
  vault: ReturnType<typeof createMobileVault>;
  getDevicePublicKeyPemForRemoteLibp2p: () => string | undefined;
  resolveInboundRelativePath?: (remotePeerId: string, voucherRelativePath: string) => string;
}) {
  const handlers = new Map<string, (stream: unknown, connection: unknown) => Promise<void>>();
  installMobileDataTransferReceiver(
    { handle(protocol: string, handler: any) { handlers.set(protocol, handler); } } as any,
    {
      meshPeerId: "12D3KooLocal",
      vault: hooks.vault,
      getDevicePublicKeyPemForRemoteLibp2p: hooks.getDevicePublicKeyPemForRemoteLibp2p,
      resolveInboundRelativePath: hooks.resolveInboundRelativePath ?? ((_rid, path) => path),
      onInboundVaultWriteCommitted: vi.fn(),
    },
  );
  const handler = handlers.get(ENVOY_DATA_PROTOCOL);
  if (!handler) throw new Error("data transfer handler not registered");
  return handler;
}

describe("installMobileDataTransferReceiver", () => {
  it("writes verified inbound file to vault", async () => {
    const device = generateDeviceIdentity();
    const owner = generateOwnerIdentity();
    const vault = createMobileVault();
    const content = new TextEncoder().encode("hello mobile transfer");
    const body = signedTransferBody({
      content,
      relativePath: "docs/file.txt",
      device,
      owner,
    });

    const handlers = new Map<string, (stream: unknown, connection: unknown) => Promise<void>>();
    installMobileDataTransferReceiver(
      {
        handle(protocol: string, handler: (stream: unknown, connection: unknown) => Promise<void>) {
          handlers.set(protocol, handler);
        },
      } as any,
      {
        meshPeerId: "12D3KooLocal",
        vault,
        getDevicePublicKeyPemForRemoteLibp2p: () => device.publicKeyPem,
        resolveInboundRelativePath: (_rid, path) => path,
        onInboundVaultWriteCommitted: vi.fn(),
      },
    );

    const handler = handlers.get(ENVOY_DATA_PROTOCOL);
    expect(handler).toBeTypeOf("function");

    await handler!(
      createInboundStream(body),
      { remotePeer: { toString: () => REMOTE_PEER } },
    );

    const entry = await vault.readFile("docs/file.txt");
    expect(new TextDecoder().decode(entry.content)).toBe("hello mobile transfer");
  });

  it("remaps inbound path when resolveInboundRelativePath returns a different target", async () => {
    const device = generateDeviceIdentity();
    const owner = generateOwnerIdentity();
    const vault = createMobileVault();
    const content = new TextEncoder().encode("remapped");
    const body = signedTransferBody({
      content,
      relativePath: "docs/original.txt",
      device,
      owner,
    });

    const handlers = new Map<string, (stream: unknown, connection: unknown) => Promise<void>>();
    installMobileDataTransferReceiver(
      { handle(protocol: string, handler: any) { handlers.set(protocol, handler); } } as any,
      {
        meshPeerId: "12D3KooLocal",
        vault,
        getDevicePublicKeyPemForRemoteLibp2p: () => device.publicKeyPem,
        resolveInboundRelativePath: (_rid, path) =>
          path.replace(/^[\\/]+/, "") === "docs/original.txt" ? "incoming/renamed.txt" : path,
        onInboundVaultWriteCommitted: vi.fn(),
      },
    );

    await handlers.get(ENVOY_DATA_PROTOCOL)!(
      createInboundStream(body),
      { remotePeer: { toString: () => REMOTE_PEER } },
    );

    const entry = await vault.readFile("incoming/renamed.txt");
    expect(new TextDecoder().decode(entry.content)).toBe("remapped");
    await expect(vault.readFile("docs/original.txt")).rejects.toThrow(/not found/i);
  });

  it("drops expired vouchers without writing", async () => {
    const device = generateDeviceIdentity();
    const owner = generateOwnerIdentity();
    const vault = createMobileVault();
    const content = new TextEncoder().encode("stale");
    const body = signedTransferBody({
      content,
      relativePath: "docs/stale.txt",
      device,
      owner,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const handlers = new Map<string, (stream: unknown, connection: unknown) => Promise<void>>();
    installMobileDataTransferReceiver(
      { handle(protocol: string, handler: any) { handlers.set(protocol, handler); } } as any,
      {
        meshPeerId: "12D3KooLocal",
        vault,
        getDevicePublicKeyPemForRemoteLibp2p: () => device.publicKeyPem,
        resolveInboundRelativePath: (_rid, path) => path,
        onInboundVaultWriteCommitted: vi.fn(),
      },
    );

    await handlers.get(ENVOY_DATA_PROTOCOL)!(
      createInboundStream(body),
      { remotePeer: { toString: () => REMOTE_PEER } },
    );

    await expect(vault.readFile("docs/stale.txt")).rejects.toThrow(/not found/i);
  });

  it("drops transfers when issuerPeerId does not match connection remote peer", async () => {
    const device = generateDeviceIdentity();
    const owner = generateOwnerIdentity();
    const vault = createMobileVault();
    const content = new TextEncoder().encode("wrong peer");
    const body = signedTransferBody({
      content,
      relativePath: "docs/wrong-peer.txt",
      device,
      owner,
      issuerPeerId: "12D3KooOtherSender",
    });

    const handlers = new Map<string, (stream: unknown, connection: unknown) => Promise<void>>();
    installMobileDataTransferReceiver(
      { handle(protocol: string, handler: any) { handlers.set(protocol, handler); } } as any,
      {
        meshPeerId: "12D3KooLocal",
        vault,
        getDevicePublicKeyPemForRemoteLibp2p: () => device.publicKeyPem,
        resolveInboundRelativePath: (_rid, path) => path,
        onInboundVaultWriteCommitted: vi.fn(),
      },
    );

    await handlers.get(ENVOY_DATA_PROTOCOL)!(
      createInboundStream(body),
      { remotePeer: { toString: () => REMOTE_PEER } },
    );

    await expect(vault.readFile("docs/wrong-peer.txt")).rejects.toThrow(/not found/i);
  });

  it("drops transfers with invalid voucher signature", async () => {
    const device = generateDeviceIdentity();
    const owner = generateOwnerIdentity();
    const vault = createMobileVault();
    const content = new TextEncoder().encode("bad sig");
    const body = signedTransferBody({
      content,
      relativePath: "docs/bad-sig.txt",
      device,
      owner,
      tamperSignature: true,
    });
    const handler = installTestReceiver({
      vault,
      getDevicePublicKeyPemForRemoteLibp2p: () => device.publicKeyPem,
    });
    await handler(createInboundStream(body), { remotePeer: { toString: () => REMOTE_PEER } });
    await expect(vault.readFile("docs/bad-sig.txt")).rejects.toThrow(/not found/i);
  });

  it("drops transfers when content hash does not match payload", async () => {
    const device = generateDeviceIdentity();
    const owner = generateOwnerIdentity();
    const vault = createMobileVault();
    const claimed = new TextEncoder().encode("claimed content");
    const actual = new TextEncoder().encode("different bytes");
    const body = signedTransferBody({
      content: claimed,
      relativePath: "docs/hash-mismatch.txt",
      device,
      owner,
      chunkOverride: actual,
    });
    const handler = installTestReceiver({
      vault,
      getDevicePublicKeyPemForRemoteLibp2p: () => device.publicKeyPem,
    });
    await handler(createInboundStream(body), { remotePeer: { toString: () => REMOTE_PEER } });
    await expect(vault.readFile("docs/hash-mismatch.txt")).rejects.toThrow(/not found/i);
  });

  it("drops transfers when issuerDeviceId does not match derived device id", async () => {
    const device = generateDeviceIdentity();
    const other = generateDeviceIdentity();
    const owner = generateOwnerIdentity();
    const vault = createMobileVault();
    const content = new TextEncoder().encode("wrong device id");
    const body = signedTransferBody({
      content,
      relativePath: "docs/wrong-device.txt",
      device,
      owner,
      issuerDeviceId: other.deviceId,
    });
    const handler = installTestReceiver({
      vault,
      getDevicePublicKeyPemForRemoteLibp2p: () => device.publicKeyPem,
    });
    await handler(createInboundStream(body), { remotePeer: { toString: () => REMOTE_PEER } });
    await expect(vault.readFile("docs/wrong-device.txt")).rejects.toThrow(/not found/i);
  });
});

describe("sendMobileVaultFileDataTransfer", () => {
  it("chunks vault file and writes a parseable data-transfer body", async () => {
    const device = generateDeviceIdentity();
    const owner = generateOwnerIdentity();
    const vault = createMobileVault();
    const content = new TextEncoder().encode("outbound mobile file");
    await vault.writeFile("share/out.txt", content, "text/plain");

    const { stream, getWritten } = createWritableCaptureStream();
    const dialProtocol = vi.fn().mockResolvedValue(stream);

    await sendMobileVaultFileDataTransfer({
      mesh: { dialProtocol } as any,
      vault,
      meshPeerId: "12D3KooLocalSender",
      issuerOwnerId: owner.ownerId,
      issuerDeviceId: device.deviceId,
      devicePrivateKeyPem: device.privateKeyPem,
      relativePath: "share/out.txt",
      toLibp2pPeerId: "12D3KooRemoteReceiver",
    });

    expect(dialProtocol).toHaveBeenCalledWith(
      "/p2p/12D3KooRemoteReceiver",
      ENVOY_DATA_PROTOCOL,
    );

    const written = getWritten();
    expect(written).not.toBeNull();
    const parsed = parseInboundDataTransferBody(written!);
    const voucher = JSON.parse(new TextDecoder().decode(parsed.voucherUtf8));
    expect(voucher.relativePath).toBe("share/out.txt");
    expect(voucher.totalBytes).toBe(content.length);
    expect(Buffer.concat(parsed.chunks.map((c) => Buffer.from(c))).equals(Buffer.from(content))).toBe(true);

    await byteStream(stream as any).write(written!);
  });
});
