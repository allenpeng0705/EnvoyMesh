/**
 * Regression test for the bulk-dismiss feed-notification store helper.
 *
 * The "Inbox badge does not clear after viewing profile-update notifications"
 * bug required a bulk-clear path so opening the Inbox drops the unread count.
 * This test verifies the store helper empties the persisted inbox list.
 */
import { describe, expect, it, vi } from "vitest";

// Mock node:fs/promises at the module level (ESM-safe). Each test sets the
// returned state via mockFs.
const mockFs = {
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  mkdir: vi.fn(),
};
vi.mock("node:fs/promises", () => mockFs);

const { dismissAllFeedNotifyInboxItems } = await import("../src/feed-notify-store.js");

describe("dismissAllFeedNotifyInboxItems", () => {
  it("returns [] without writing when the inbox is already empty", async () => {
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify([]) as never);
    const result = await dismissAllFeedNotifyInboxItems("/tmp/fake-profile");
    expect(result).toEqual([]);
    expect(mockFs.writeFile).not.toHaveBeenCalled();
  });

  it("empties the inbox and writes [] when items exist", async () => {
    const seeded = [
      { id: "a", messageId: "m1", url: "envoy://x", kind: "profile" },
      { id: "b", messageId: "m2", url: "envoy://y", kind: "photo" },
    ];
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(seeded) as never);
    mockFs.writeFile.mockResolvedValueOnce(undefined as never);
    mockFs.rename.mockResolvedValueOnce(undefined as never);
    mockFs.mkdir.mockResolvedValueOnce(undefined as never);

    const result = await dismissAllFeedNotifyInboxItems("/tmp/fake-profile");
    expect(result).toEqual([]);
    expect(mockFs.writeFile).toHaveBeenCalledOnce();
    // The written payload must be an empty JSON array.
    const written = mockFs.writeFile.mock.calls[0][1] as string;
    expect(JSON.parse(written)).toEqual([]);
  });
});
