import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AGENT_IDENTITY_FILE,
  createAgentIdentityStore,
  DEFAULT_AGENT_IDENTITY_TEMPLATE,
} from "../src/agent-identity-store.js";

describe("agent identity store", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "envoymesh-agent-identity-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns default template when file is missing", async () => {
    const store = createAgentIdentityStore(dir);
    const doc = await store.load();
    expect(doc.content).toBe(DEFAULT_AGENT_IDENTITY_TEMPLATE);
    expect(doc.updatedAt).toBe(new Date(0).toISOString());
  });

  it("persists and reloads saved content", async () => {
    const store = createAgentIdentityStore(dir);
    const saved = await store.save("# Custom agent\nBe brief.");
    expect(saved.content).toBe("# Custom agent\nBe brief.");
    expect(saved.updatedAt).not.toBe(new Date(0).toISOString());

    const reloaded = await store.load();
    expect(reloaded.content).toBe("# Custom agent\nBe brief.");

    const onDisk = await readFile(join(dir, AGENT_IDENTITY_FILE), "utf8");
    expect(onDisk).toBe("# Custom agent\nBe brief.");
  });
});
