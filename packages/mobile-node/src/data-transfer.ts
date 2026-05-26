/**
 * Verified inbound / outbound vault file transfer over libp2p `/envoymesh/data/0.1.0`
 * (parity with `apps/node` + `@envoymesh/network` framing).
 *
 * Import browser-safe subpaths via `#network/*` only — not `@envoymesh/network` (node:crypto).
 */
import { byteStream } from "@libp2p/utils";
import type { Libp2p } from "libp2p";
import {
  encodeDataTransferBody,
  MAX_DATA_INBOUND_BYTES,
  parseInboundDataTransferBody,
  readAllFromByteStream,
  voucherJsonBytesFromObject,
} from "#network/data-framing";
import { ENVOY_DATA_PROTOCOL } from "#network/protocols";
import {
  createUnsignedDataTransferVoucher,
  parseDataTransferVoucher,
} from "@envoymesh/protocol";
import type { MobileVault } from "@envoymesh/mobile-vault";
import {
  createSignedDataTransferVoucher,
  deriveDeviceId,
  verifyDataTransferVoucher,
} from "@envoymesh/mobile-identity";

export { ENVOY_DATA_PROTOCOL };

async function sha256Base64Url(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  const out = new Uint8Array(digest);
  let bin = "";
  for (let i = 0; i < out.length; i++) bin += String.fromCharCode(out[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const c of chunks) len += c.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Same path rules as outbound share + mobile vault. */
export function isValidMobileVaultRelativePath(norm: string): boolean {
  return Boolean(norm) && !norm.includes("..") && !norm.includes("~");
}

export interface MobileDataTransferHooks {
  meshPeerId: string;
  vault: MobileVault;
  /** Device PEM for voucher signature verification (libp2p sender id). */
  getDevicePublicKeyPemForRemoteLibp2p(remotePeerId: string): string | undefined;
  resolveInboundRelativePath(remotePeerId: string, voucherRelativePath: string): string;
  onInboundVaultWriteCommitted(
    remotePeerId: string,
    voucherSourceRelativePath: string,
    totalBytes: number,
  ): void;
}

export function installMobileDataTransferReceiver(mesh: Libp2p, hooks: MobileDataTransferHooks): void {
  void mesh.handle(ENVOY_DATA_PROTOCOL, async (stream: any, connection: any) => {
    const remotePeerId = connection.remotePeer.toString();
    try {
      const bytes = await readAllFromByteStream(byteStream(stream), MAX_DATA_INBOUND_BYTES);
      if (bytes.byteLength === 0) return;
      const { voucherUtf8, chunks } = parseInboundDataTransferBody(bytes);
      let parsed;
      try {
        const text = new TextDecoder().decode(voucherUtf8);
        parsed = parseDataTransferVoucher(JSON.parse(text));
      } catch {
        return;
      }

      if (new Date(parsed.expiresAt).getTime() < Date.now()) return;

      const deviceKey = hooks.getDevicePublicKeyPemForRemoteLibp2p(remotePeerId);
      if (!deviceKey || !verifyDataTransferVoucher(parsed, deviceKey)) return;
      if (deriveDeviceId(deviceKey) !== parsed.issuerDeviceId) return;
      if (parsed.issuerPeerId !== remotePeerId) return;

      const combined = concatChunks(chunks);
      if (combined.length !== parsed.totalBytes) return;
      const hash = await sha256Base64Url(combined);
      if (hash !== parsed.contentHash) return;

      const sourceNorm = parsed.relativePath.replace(/^[\\/]+/, "");
      let relForVault = sourceNorm;
      relForVault = hooks.resolveInboundRelativePath(remotePeerId, parsed.relativePath).replace(/^[\\/]+/, "");
      if (!isValidMobileVaultRelativePath(relForVault)) return;

      await hooks.vault.writeFile(relForVault, combined, "application/octet-stream");
      hooks.onInboundVaultWriteCommitted(remotePeerId, sourceNorm, combined.length);
    } catch (err) {
      console.warn(
        "[mobile-node] data transfer inbound:",
        err instanceof Error ? err.message : err,
      );
    } finally {
      try {
        await stream.close();
      } catch {
        /* ignore */
      }
    }
  });
}

export async function sendMobileVaultFileDataTransfer(input: {
  mesh: Libp2p;
  vault: MobileVault;
  meshPeerId: string;
  issuerOwnerId: string;
  issuerDeviceId: string;
  devicePrivateKeyPem: string;
  relativePath: string;
  toLibp2pPeerId: string;
}): Promise<void> {
  const norm = input.relativePath.replace(/^[\\/]+/, "");
  if (!isValidMobileVaultRelativePath(norm)) {
    throw new Error("Unsafe vault path for data transfer");
  }
  const entry = await input.vault.readFile(norm);
  const hash = await sha256Base64Url(entry.content);
  const unsignedVoucher = createUnsignedDataTransferVoucher({
    issuerPeerId: input.meshPeerId,
    issuerOwnerId: input.issuerOwnerId,
    issuerDeviceId: input.issuerDeviceId,
    relativePath: norm,
    totalBytes: entry.sizeBytes,
    contentHash: hash,
  });
  const voucher = createSignedDataTransferVoucher({
    unsigned: unsignedVoucher,
    devicePrivateKeyPem: input.devicePrivateKeyPem,
  });
  const voucherUtf8 = voucherJsonBytesFromObject(voucher);
  const chunkSize = 64 * 1024;
  const chunks: Uint8Array[] = [];
  const content = entry.content;
  for (let offset = 0; offset < content.length; offset += chunkSize) {
    chunks.push(content.subarray(offset, Math.min(offset + chunkSize, content.length)));
  }
  const body = encodeDataTransferBody(voucherUtf8, chunks);
  const stream: any = await input.mesh.dialProtocol(`/p2p/${input.toLibp2pPeerId}` as any, ENVOY_DATA_PROTOCOL);
  try {
    await byteStream(stream).write(body);
  } finally {
    try {
      await stream.close();
    } catch {
      /* ignore */
    }
  }
}
