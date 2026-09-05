import { describe, expect, it, vi } from "vitest";
import {
  FAMILY_ATTACHMENT_PREVIEW_MAX_BYTES,
  FAMILY_ATTACHMENT_READ_CHUNK_BYTES,
  fetchFamilyAttachmentBase64,
  type FamilyAttachmentReadFn,
} from "../../src/lib/family-content.js";

/** Fake `readFamilyAttachment` reader over an in-memory byte string. */
function fakeReader(payload: string): { read: FamilyAttachmentReadFn; calls: Array<{ id: string; offset: number; maxBytes: number }> } {
  const calls: Array<{ id: string; offset: number; maxBytes: number }> = [];
  const read: FamilyAttachmentReadFn = vi.fn(async ({ id, offset = 0, maxBytes }) => {
    calls.push({ id, offset, maxBytes: maxBytes ?? 0 });
    const slice = payload.slice(offset, offset + (maxBytes ?? payload.length));
    return {
      contentBase64: slice.length > 0 ? btoa(slice) : "",
      sizeBytes: payload.length,
      truncated: offset + slice.length < payload.length,
    };
  });
  return { read, calls };
}

describe("fetchFamilyAttachmentBase64", () => {
  it("returns base64 of a whole file from a single slice", async () => {
    const { read, calls } = fakeReader("hello");
    const result = await fetchFamilyAttachmentBase64(read, "att-1");
    expect(result.contentBase64).toBe(btoa("hello"));
    expect(result.sizeBytes).toBe(5);
    expect(result.truncated).toBe(false);
    expect(calls).toEqual([
      { id: "att-1", offset: 0, maxBytes: Math.min(FAMILY_ATTACHMENT_READ_CHUNK_BYTES, FAMILY_ATTACHMENT_PREVIEW_MAX_BYTES) },
    ]);
  });

  it("concatenates multiple slices into valid whole-file base64", async () => {
    const payload = "abcdefghij";
    const { read, calls } = fakeReader(payload);
    const result = await fetchFamilyAttachmentBase64(read, "att-2", { chunkBytes: 3 });
    expect(calls.length).toBeGreaterThan(1);
    expect(result.contentBase64).toBe(btoa(payload));
    expect(result.sizeBytes).toBe(payload.length);
    expect(result.truncated).toBe(false);
    // Slices must be contiguous range reads.
    let offset = 0;
    for (const c of calls) {
      expect(c.offset).toBe(offset);
      offset += c.maxBytes;
    }
  });

  it("throws too-large when the stored file exceeds the preview cap", async () => {
    const read: FamilyAttachmentReadFn = vi.fn(async () => ({
      contentBase64: btoa("x".repeat(1024)),
      sizeBytes: 6 * 1024 * 1024,
      truncated: true,
    }));
    await expect(
      fetchFamilyAttachmentBase64(read, "att-4", { maxBytes: 5 * 1024 * 1024 }),
    ).rejects.toThrow(/too-large/);
  });
});
