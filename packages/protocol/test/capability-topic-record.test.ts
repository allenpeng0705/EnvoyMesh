import { describe, expect, it } from "vitest";
import {
  SignedCapabilityTopicRecordSchema,
  UnsignedCapabilityTopicRecordSchema,
  capabilityTopicRecordForSigning,
  type SignedCapabilityTopicRecord,
} from "../src/index.js";

describe("SignedCapabilityTopicRecordSchema", () => {
  it("parses a valid unsigned record", () => {
    const unsigned = {
      topic: "envoymesh.file_provider",
      peerId: "12D3KooWMyPeerId",
      multiaddr: "/ip4/1.2.3.4/tcp/4000/p2p/12D3KooWMyPeerId",
      createdAt: "2026-05-09T12:00:00.000Z",
      ttlSeconds: 3600,
      org: "acme",
      net: "test",
      ver: "1.0",
    };
    const result = UnsignedCapabilityTopicRecordSchema.safeParse(unsigned);
    expect(result.success).toBe(true);
  });

  it("parses a valid signed record", () => {
    const signed: SignedCapabilityTopicRecord = {
      topic: "envoymesh.file_provider",
      peerId: "12D3KooWMyPeerId",
      multiaddr: "/ip4/1.2.3.4/tcp/4000/p2p/12D3KooWMyPeerId",
      createdAt: "2026-05-09T12:00:00.000Z",
      ttlSeconds: 3600,
      org: "acme",
      net: "test",
      ver: "1.0",
      signature: "abc123_signature_base64url",
    };
    const result = SignedCapabilityTopicRecordSchema.safeParse(signed);
    expect(result.success).toBe(true);
  });

  it("rejects a signed record missing signature", () => {
    const withoutSig = {
      topic: "envoymesh.file_provider",
      peerId: "12D3KooWMyPeerId",
      multiaddr: "/ip4/1.2.3.4/tcp/4000/p2p/12D3KooWMyPeerId",
      createdAt: "2026-05-09T12:00:00.000Z",
      ttlSeconds: 3600,
      signature: "",
    };
    const result = SignedCapabilityTopicRecordSchema.safeParse(withoutSig);
    expect(result.success).toBe(false);
  });

  it("parses an unsigned record with extra fields (signature is ignored)", () => {
    const withSig = {
      topic: "envoymesh.file_provider",
      peerId: "12D3KooWMyPeerId",
      multiaddr: "/ip4/1.2.3.4/tcp/4000/p2p/12D3KooWMyPeerId",
      createdAt: "2026-05-09T12:00:00.000Z",
      ttlSeconds: 3600,
      signature: "abc123",
    };
    const result = UnsignedCapabilityTopicRecordSchema.safeParse(withSig);
    // Unsigned schema allows extra fields; signature is just ignored
    expect(result.success).toBe(true);
  });

  it("rejects empty topic", () => {
    const result = UnsignedCapabilityTopicRecordSchema.safeParse({
      topic: "",
      peerId: "12D3KooWMyPeerId",
      multiaddr: "/ip4/1.2.3.4/tcp/4000",
      createdAt: "2026-05-09T12:00:00.000Z",
      ttlSeconds: 3600,
    });
    expect(result.success).toBe(false);
  });

  it("rejects ttlSeconds less than 1", () => {
    const result = UnsignedCapabilityTopicRecordSchema.safeParse({
      topic: "envoymesh.test",
      peerId: "12D3KooWMyPeerId",
      multiaddr: "/ip4/1.2.3.4/tcp/4000",
      createdAt: "2026-05-09T12:00:00.000Z",
      ttlSeconds: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid datetime for createdAt", () => {
    const result = UnsignedCapabilityTopicRecordSchema.safeParse({
      topic: "envoymesh.test",
      peerId: "12D3KooWMyPeerId",
      multiaddr: "/ip4/1.2.3.4/tcp/4000",
      createdAt: "not-a-date",
      ttlSeconds: 3600,
    });
    expect(result.success).toBe(false);
  });

  it("capabilityTopicRecordForSigning strips signature", () => {
    const signed: SignedCapabilityTopicRecord = {
      topic: "envoymesh.test",
      peerId: "12D3KooWMyPeerId",
      multiaddr: "/ip4/1.2.3.4/tcp/4000",
      createdAt: "2026-05-09T12:00:00.000Z",
      ttlSeconds: 3600,
      signature: "my_signature",
    };
    const unsigned = capabilityTopicRecordForSigning(signed) as Partial<SignedCapabilityTopicRecord>;
    expect(unsigned.signature).toBeUndefined();
    expect(unsigned.topic).toBe("envoymesh.test");
    expect(unsigned.peerId).toBe("12D3KooWMyPeerId");
    expect(unsigned.multiaddr).toBe("/ip4/1.2.3.4/tcp/4000");
    expect(unsigned.ttlSeconds).toBe(3600);
  });
});
