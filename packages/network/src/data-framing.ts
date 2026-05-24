import { toString } from "uint8arrays";

/** Cap for inbound voucher JSON + chunk payload (defense in depth). */
export const MAX_DATA_INBOUND_BYTES = 64 * 1024 * 1024;

function readU32BE(buffer: Uint8Array, offset: number): number {
  return new DataView(buffer.buffer, buffer.byteOffset + offset, 4).getUint32(0, false);
}

export function encodeDataTransferBody(voucherUtf8: Uint8Array, chunks: Uint8Array[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const pushU32 = (n: number) => {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, false);
    parts.push(b);
  };

  pushU32(voucherUtf8.byteLength);
  parts.push(voucherUtf8);
  for (const chunk of chunks) {
    pushU32(chunk.byteLength);
    parts.push(chunk);
  }
  pushU32(0);

  const total = parts.reduce((sum, p) => sum + p.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out;
}

export function parseInboundDataTransferBody(buffer: Uint8Array): { voucherUtf8: Uint8Array; chunks: Uint8Array[] } {
  if (buffer.byteLength < 4) {
    throw new Error("data transfer body too short");
  }

  let offset = 0;
  const voucherLen = readU32BE(buffer, offset);
  offset += 4;
  if (voucherLen <= 0 || voucherLen > MAX_DATA_INBOUND_BYTES || offset + voucherLen > buffer.byteLength) {
    throw new Error("invalid data transfer voucher length");
  }

  const voucherUtf8 = buffer.subarray(offset, offset + voucherLen);
  offset += voucherLen;

  const chunks: Uint8Array[] = [];
  let payloadBytes = 0;
  while (offset + 4 <= buffer.byteLength) {
    const chunkLen = readU32BE(buffer, offset);
    offset += 4;
    if (chunkLen === 0) {
      break;
    }
    if (chunkLen < 0 || offset + chunkLen > buffer.byteLength) {
      throw new Error("invalid data transfer chunk length");
    }
    payloadBytes += chunkLen;
    if (payloadBytes > MAX_DATA_INBOUND_BYTES) {
      throw new Error("data transfer exceeds size cap");
    }
    chunks.push(buffer.subarray(offset, offset + chunkLen));
    offset += chunkLen;
  }

  return { voucherUtf8, chunks };
}

/** Read an entire libp2p byte stream (may arrive in multiple `read()` chunks). */
export async function readAllFromByteStream(
  stream: {
    read(options?: { bytes?: number }): Promise<
      Uint8Array | null | { subarray(start?: number, end?: number): Uint8Array; byteLength: number }
    >;
  },
  maxBytes = MAX_DATA_INBOUND_BYTES,
): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const raw = await stream.read();
    if (raw === null) {
      break;
    }
    const bytes = raw instanceof Uint8Array ? raw : raw.subarray();
    if (bytes.byteLength === 0) {
      continue;
    }
    total += bytes.byteLength;
    if (total > maxBytes) {
      throw new Error(`data transfer exceeds size cap ${maxBytes}`);
    }
    parts.push(bytes);
  }
  if (parts.length === 0) {
    return new Uint8Array(0);
  }
  if (parts.length === 1) {
    return parts[0]!;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

export function voucherJsonBytesFromObject(voucher: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(voucher));
}

export function parseVoucherJsonObject(voucherUtf8: Uint8Array): unknown {
  return JSON.parse(toString(voucherUtf8)) as unknown;
}
