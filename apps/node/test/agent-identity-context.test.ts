import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAgentIdentityStore } from "@envoymesh/local-store";
import {
  formatAgentIdentitySection,
  loadAgentIdentitySection,
  MAX_AGENT_IDENTITY_CHARS,
} from "../src/agent-identity-context.js";

describe("agent identity context", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "envoymesh-agent-ctx-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("formats non-empty content as a markdown section", () => {
    const section = formatAgentIdentitySection("# Role\nBe helpful.");
    expect(section).toContain("## Agent identity");
    expect(section).toContain("# Role");
    expect(section).toContain("Be helpful.");
  });

  it("returns empty string for blank content", () => {
    expect(formatAgentIdentitySection("   \n")).toBe("");
  });

  it("truncates very long content", () => {
    const long = "x".repeat(MAX_AGENT_IDENTITY_CHARS + 100);
    const section = formatAgentIdentitySection(long);
    expect(section).toContain("...(truncated)");
    expect(section.length).toBeLessThan(long.length);
  });

  it("loads section from store", async () => {
    const store = createAgentIdentityStore(dir);
    await store.save("Always cite sources.");
    const section = await loadAgentIdentitySection(store);
    expect(section).toContain("Always cite sources.");
  });
});
