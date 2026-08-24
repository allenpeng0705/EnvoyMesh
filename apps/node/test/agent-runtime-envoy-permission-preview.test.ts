/**
 * EH permission diff previews for edit/write/bash tools.
 */

import { describe, expect, it } from "vitest";

import { buildEhPermissionPreview } from "../src/agent-runtime-envoy/permission-preview.js";

describe("buildEhPermissionPreview", () => {
  it("formats edit tool diff preview", async () => {
    const preview = await buildEhPermissionPreview(
      {
        toolName: "edit",
        args: { path: "src/a.ts", oldText: "a", newText: "b" },
      },
      "/proj",
    );
    expect(preview).toContain("src/a.ts");
    expect(preview).toContain("- a");
    expect(preview).toContain("+ b");
  });

  it("formats bash command preview", async () => {
    const preview = await buildEhPermissionPreview(
      { toolName: "bash", args: { command: "npm test" } },
      "/proj",
    );
    expect(preview).toBe("$ npm test");
  });

  it("formats new write preview without cwd", async () => {
    const preview = await buildEhPermissionPreview(
      {
        toolName: "write",
        args: { path: "new.txt", content: "hello\nworld" },
      },
      undefined,
    );
    expect(preview).toContain("new file new.txt");
    expect(preview).toContain("hello");
  });
});
