import { describe, expect, it } from "vitest";
import {
  attachmentBasename,
  mergeAgentPromptWithAttachments,
  assertAttachableFileSize,
} from "../../src/lib/agent-attachments.js";
import { MAX_CHAT_ATTACHMENT_BYTES } from "@envoymesh/api";

describe("agent-attachments helpers", () => {
  it("attachmentBasename handles unix and windows paths", () => {
    expect(attachmentBasename("/tmp/a/b.txt")).toBe("b.txt");
    expect(attachmentBasename("C:\\Users\\x\\c.md")).toBe("c.md");
  });

  it("mergeAgentPromptWithAttachments", () => {
    expect(mergeAgentPromptWithAttachments("ask", "Attached files:")).toBe(
      "ask\n\nAttached files:",
    );
    expect(mergeAgentPromptWithAttachments("", "only ctx")).toBe("only ctx");
  });

  it("assertAttachableFileSize enforces 25 MiB", () => {
    expect(assertAttachableFileSize(0)).toMatch(/empty/i);
    expect(assertAttachableFileSize(100)).toBeNull();
    expect(assertAttachableFileSize(MAX_CHAT_ATTACHMENT_BYTES + 1)).toMatch(
      /too large/i,
    );
  });
});
