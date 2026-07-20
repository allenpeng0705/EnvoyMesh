import { describe, expect, it } from "vitest";
import {
  createLibraryReadPayload,
  createLibraryReadResponsePayload,
  parseLibraryReadPayload,
  parseLibraryReadResponsePayload,
  LibraryReadPayloadSchema,
  LibraryReadResponsePayloadSchema,
} from "../src/index.js";

const OWNER_A = "envoy:owner:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OWNER_B = "envoy:owner:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("LibraryReadPayloadSchema", () => {
  it("parses a minimal request", () => {
    const parsed = parseLibraryReadPayload({
      requesterOwnerId: OWNER_B,
      targetOwnerId: OWNER_A,
      path: "hello.md",
    });
    expect(parsed.path).toBe("hello.md");
    expect(parsed.range).toBeUndefined();
  });

  it("allows empty path (root → index.md on the server)", () => {
    const parsed = parseLibraryReadPayload({
      requesterOwnerId: OWNER_B,
      targetOwnerId: OWNER_A,
      path: "",
    });
    expect(parsed.path).toBe("");
  });

  it("rejects path longer than 512 chars", () => {
    expect(() =>
      LibraryReadPayloadSchema.parse({
        requesterOwnerId: OWNER_B,
        targetOwnerId: OWNER_A,
        path: "x".repeat(513),
      }),
    ).toThrow();
  });

  it("round-trips via createLibraryReadPayload", () => {
    const created = createLibraryReadPayload({
      requesterOwnerId: OWNER_B,
      targetOwnerId: OWNER_A,
      path: "blog/posts/hello",
      range: { start: 0, end: 99 },
    });
    expect(parseLibraryReadPayload(created)).toEqual(created);
  });
});

describe("LibraryReadResponsePayloadSchema", () => {
  it("parses an ok response with body", () => {
    const parsed = parseLibraryReadResponsePayload({
      inReplyTo: "msg-1",
      status: "ok",
      body: "# Hello",
      contentType: "text/markdown",
      contentHash: "a".repeat(64),
      byteLength: 7,
      etag: "a".repeat(16),
    });
    expect(parsed.status).toBe("ok");
    expect(parsed.body).toBe("# Hello");
  });

  it("parses not_found / forbidden / too_large without body", () => {
    for (const status of ["not_found", "forbidden", "too_large"] as const) {
      const parsed = parseLibraryReadResponsePayload({
        inReplyTo: "msg-1",
        status,
      });
      expect(parsed.status).toBe(status);
      expect(parsed.body).toBeUndefined();
    }
  });

  it("round-trips via createLibraryReadResponsePayload", () => {
    const created = createLibraryReadResponsePayload({
      inReplyTo: "msg-2",
      status: "ok",
      body: "abc",
      contentType: "text/plain",
      contentHash: "b".repeat(64),
      byteLength: 3,
    });
    expect(LibraryReadResponsePayloadSchema.parse(created)).toEqual(created);
  });
});
