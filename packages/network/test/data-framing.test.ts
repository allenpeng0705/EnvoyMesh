/**
 * Data transfer framing — encode/decode roundtrip, edge cases.
 * Tests: packages/network/src/data-framing.ts
 */
import { describe, expect, it } from "vitest";
import {
  encodeDataTransferBody,
  parseInboundDataTransferBody,
  readAllFromByteStream,
  voucherJsonBytesFromObject,
  parseVoucherJsonObject,
  MAX_DATA_INBOUND_BYTES,
} from "../src/data-framing.js";

describe("encodeDataTransferBody", () => {
  it("encodes voucher followed by chunks, terminated by zero-length frame", () => {
    const voucher = new TextEncoder().encode('{"type":"transfer"}');
    // 19 bytes: { "type":"transfer" } (no spaces in JSON.stringify)
    expect(voucher.byteLength).toBe(19);
    const chunks = [new Uint8Array([0x01, 0x02]), new Uint8Array([0x03, 0x04, 0x05])];

    const encoded = encodeDataTransferBody(voucher, chunks);
    // Frame: [voucherLen(4)] voucher [chunk1Len(4)] chunk1 [chunk2Len(4)] chunk2 [0(4)]
    // = 4 + 19 + 4 + 2 + 4 + 3 + 4 = 40
    expect(encoded.byteLength).toBe(4 + voucher.byteLength + 4 + 2 + 4 + 3 + 4);
    expect(encoded[0]).toBe(0);
    expect(encoded[1]).toBe(0);
    expect(encoded[2]).toBe(0);
    expect(encoded[3]).toBe(19); // voucher length
    // Last 4 bytes should be zero terminator
    expect(encoded[encoded.byteLength - 4]).toBe(0);
    expect(encoded[encoded.byteLength - 3]).toBe(0);
    expect(encoded[encoded.byteLength - 2]).toBe(0);
    expect(encoded[encoded.byteLength - 1]).toBe(0);
  });

  it("encodes empty chunks array", () => {
    const voucher = new TextEncoder().encode('{"id":"1"}');
    const encoded = encodeDataTransferBody(voucher, []);
    // Frame: [voucherLen(4)] voucher [0(4)]
    expect(encoded.byteLength).toBe(4 + voucher.byteLength + 4);
  });

  it("encodes zero-length chunk as terminator (terminator is sent separately)", () => {
    // No empty chunk in chunks array — terminator is always the last zero-length frame
    const voucher = new Uint8Array(0);
    const encoded = encodeDataTransferBody(voucher, []);
    // Frame: [0(4)] [0(4)] — both zero since no voucher bytes
    expect(encoded.byteLength).toBe(8);
  });

  it("encodes large chunk correctly", () => {
    const voucher = new TextEncoder().encode('{"big":true}');
    const bigChunk = new Uint8Array(1024).fill(0x42);
    const encoded = encodeDataTransferBody(voucher, [bigChunk]);
    // 4 (voucherLen) + len(voucher) + 4 (1024) + 1024 + 4 (terminator)
    const expected = 4 + voucher.byteLength + 4 + 1024 + 4;
    expect(encoded.byteLength).toBe(expected);
  });
});

describe("parseInboundDataTransferBody", () => {
  it("parses valid encoded body and returns voucher + chunks", () => {
    const voucher = new TextEncoder().encode('{"type":"transfer","id":"abc"}');
    const chunk1 = new Uint8Array([0x10, 0x20, 0x30]);
    const chunk2 = new Uint8Array([0xaa, 0xbb]);
    const encoded = encodeDataTransferBody(voucher, [chunk1, chunk2]);

    const parsed = parseInboundDataTransferBody(encoded);

    const parsedVoucherStr = new TextDecoder().decode(parsed.voucherUtf8);
    expect(JSON.parse(parsedVoucherStr)).toEqual({ type: "transfer", id: "abc" });
    expect(parsed.chunks).toHaveLength(2);
    expect(parsed.chunks[0]).toEqual(chunk1);
    expect(parsed.chunks[1]).toEqual(chunk2);
  });

  it("round-trips empty chunks", () => {
    const voucher = new TextEncoder().encode('{"empty":true}');
    const encoded = encodeDataTransferBody(voucher, []);
    const parsed = parseInboundDataTransferBody(encoded);

    const parsedStr = new TextDecoder().decode(parsed.voucherUtf8);
    expect(JSON.parse(parsedStr)).toEqual({ empty: true });
    expect(parsed.chunks).toHaveLength(0);
  });

  it("throws when buffer is too short", () => {
    expect(() => parseInboundDataTransferBody(new Uint8Array([0x01, 0x02]))).toThrow(
      "data transfer body too short",
    );
    expect(() => parseInboundDataTransferBody(new Uint8Array(0))).toThrow("data transfer body too short");
  });

  it("throws when voucher length is zero", () => {
    const bad = new Uint8Array([0, 0, 0, 0, ...new TextEncoder().encode("junk")]);
    expect(() => parseInboundDataTransferBody(bad)).toThrow("invalid data transfer voucher length");
  });

  it("throws when voucher length exceeds cap", () => {
    const fourGb = 0xffffffff;
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, fourGb, false);
    const bad = new Uint8Array([...b, ...new Uint8Array(10)]);
    expect(() => parseInboundDataTransferBody(bad)).toThrow("invalid data transfer voucher length");
  });

  it("throws when voucher length exceeds remaining buffer", () => {
    // 4-byte length says voucher is 100 bytes but only 5 bytes remain
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, 100, false);
    const bad = new Uint8Array([...b, ...new Uint8Array(5)]);
    expect(() => parseInboundDataTransferBody(bad)).toThrow("invalid data transfer voucher length");
  });

  it("throws when a chunk length field says bytes beyond buffer end", () => {
    // Build a valid frame with voucher=5bytes, then truncate the last chunk to 3 bytes
    // encode: [5][voucher][4][chunk][0] where chunk is 100 bytes
    // Then truncate to remove last 97 bytes → chunk length field says 100 but only 3 remain
    const voucher = new Uint8Array(5).fill(0x41);
    const chunk = new Uint8Array(100).fill(0x42);
    const valid = encodeDataTransferBody(voucher, [chunk]);
    // valid.length = 4 + 5 + 4 + 100 + 4 = 117
    const truncated = valid.subarray(0, 4 + 5 + 4 + 3); // cut off most of chunk data
    // At this point: offset=13 (4+5+4), chunkLen=100, offset+chunkLen=113 > buffer.byteLength=20
    expect(() => parseInboundDataTransferBody(truncated)).toThrow("invalid data transfer chunk length");
  });

  it("throws when total payload bytes exceed cap", () => {
    const voucher = new TextEncoder().encode('{"x":1}');
    const overCap = new Uint8Array(MAX_DATA_INBOUND_BYTES + 1).fill(0x01);
    const encoded = encodeDataTransferBody(voucher, [overCap]);
    expect(() => parseInboundDataTransferBody(encoded)).toThrow("data transfer exceeds size cap");
  });

  it("parses without trailing chunks (terminator at buffer end)", () => {
    const voucher = new TextEncoder().encode('{"chunks":false}');
    // encodeDataTransferBody with empty chunks produces: [voucherLen(4)] voucher [0(4)]
    const encoded = encodeDataTransferBody(voucher, []);
    expect(encoded.byteLength).toBe(4 + voucher.byteLength + 4);

    const parsed = parseInboundDataTransferBody(encoded);
    expect(parsed.chunks).toHaveLength(0);
    const v = JSON.parse(new TextDecoder().decode(parsed.voucherUtf8));
    expect(v).toEqual({ chunks: false });
  });
});

describe("readAllFromByteStream", () => {
  it("concatenates multiple read() chunks before parse", async () => {
    const voucher = new TextEncoder().encode('{"multi":true}');
    const chunk = new Uint8Array(128 * 1024).fill(0xab);
    const encoded = encodeDataTransferBody(voucher, [chunk]);
    const splitAt = 4096;
    let call = 0;
    const stream = {
      async read() {
        if (call === 0) {
          call++;
          return encoded.subarray(0, splitAt);
        }
        if (call === 1) {
          call++;
          return encoded.subarray(splitAt);
        }
        return null;
      },
    };
    const bytes = await readAllFromByteStream(stream);
    const parsed = parseInboundDataTransferBody(bytes);
    expect(parsed.chunks).toHaveLength(1);
    expect(parsed.chunks[0]!.byteLength).toBe(chunk.byteLength);
  });
});

describe("voucherJsonBytesFromObject / parseVoucherJsonObject", () => {
  it("round-trips a signed voucher object", () => {
    const voucher = {
      version: "0.1",
      type: "data-transfer-voucher",
      transferId: "t123",
      issuerPeerId: "12D3KooABC",
      issuerOwnerId: "envoy:owner:xyz",
      issuerDeviceId: "envoy:device:def",
      relativePath: "notes/readme.md",
      totalBytes: 1024,
      contentHash: "base64urlHash",
      issuedAt: "2026-05-20T10:00:00.000Z",
      expiresAt: "2026-05-21T10:00:00.000Z",
      signature: "fakeSig123",
    };

    const encoded = voucherJsonBytesFromObject(voucher);
    expect(encoded instanceof Uint8Array).toBe(true);
    expect(new TextDecoder().decode(encoded)).toBe(JSON.stringify(voucher));

    const parsed = parseVoucherJsonObject(encoded);
    expect(parsed).toEqual(voucher);
  });

  it("handles unicode in voucher fields", () => {
    const voucher = {
      relativePath: "文档/笔记.md",
      contentHash: "日本語",
    };
    const encoded = voucherJsonBytesFromObject(voucher);
    const parsed = parseVoucherJsonObject(encoded);
    expect(parsed).toEqual(voucher);
  });

  it("handles empty object", () => {
    const encoded = voucherJsonBytesFromObject({});
    const parsed = parseVoucherJsonObject(encoded);
    expect(parsed).toEqual({});
  });
});