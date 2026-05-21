import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureHeliaIpfsReady, getHeliaIpfsEngineStatus, resolveHeliaBlocksPath } from "../src/helia-ipfs-engine.js";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-helia-engine-"));
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

describe("helia-ipfs-engine", () => {
  it("ensureHeliaIpfsReady creates profile helia-blocks dir", async () => {
    await ensureHeliaIpfsReady({ profileDir });
    const status = getHeliaIpfsEngineStatus(profileDir);
    expect(status.available).toBe(true);
    expect(status.blocksPath).toBe(resolveHeliaBlocksPath(profileDir));
  });
});
